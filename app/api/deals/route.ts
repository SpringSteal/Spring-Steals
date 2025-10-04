// app/api/deals/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHEET_TSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6q3INgmFhO6gH7QkxofX4jeHPx7XNtxz-_MFYYy9C9uDURHx879YMQumttQbRrocO0F9QW8GZLhX1/pub?output=tsv";

/* --------------------------- helpers --------------------------- */

function parseTSV(tsv: string) {
  const lines = tsv.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = lines
    .shift()!
    .split("\t")
    .map((h) => h.replace(/\r/g, "").trim());
  return lines.map((line) => {
    const cells = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = ((cells[i] ?? "").replace(/\r/g, "")).trim()));
    return row;
  });
}

const toNum = (s: string) => {
  if (!s) return 0;
  const v = Number(String(s).replace(/[^\d.]/g, ""));
  return Number.isFinite(v) ? v : 0;
};

const toArr = (s: string) =>
  s ? s.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [];

// simple no-cache headers (client + CDN)
function noCacheHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
    expires: "0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };
}

/* ------------------------ image extraction ---------------------- */

// per-request cache for discovered product images
const ogCache = new Map<string, string>();

function looksLogoish(u: string) {
  const s = (u || "").toLowerCase();
  return (
    s.endsWith(".svg") ||
    /(^|\/)(logo|brand|sprite|placeholder|icon|badge|favicon)(-|_|\.|\/)/.test(s) ||
    /apple-touch-icon|opengraphimage/.test(s)
  );
}

function abs(u: string, base: string) {
  try {
    return new URL(u, base).toString();
  } catch {
    return u;
  }
}

function scoreCandidate(u: string, host: string) {
  let n = 0;
  if (/\.(jpe?g|png|webp)(\?|#|$)/i.test(u)) n += 5;
  if (looksLogoish(u)) n -= 8;
  if (/[/_-](\d{3,}|[0-9]{2,}x[0-9]{2,})/.test(u)) n += 2;

  // domain nudges for product CDNs
  if (/adidas\./i.test(host)) {
    if (/assets\.adidas\.com\/images/i.test(u)) n += 6;
  }
  if (/apple\.com/i.test(host)) {
    if (/storeimages\.cdn-apple\.com/i.test(u)) n += 4;
  }
  if (/dyson\.com\.au/i.test(host)) {
    if (/\/is\/image|\/medias\//i.test(u)) n += 4;
  }
  if (/jbhifi\.com\.au/i.test(host)) {
    if (/cdn|product|large/i.test(u)) n += 2;
  }
  if (/thegoodguys\.com\.au/i.test(host)) {
    if (/\/media|\/product|\/images/i.test(u)) n += 2;
  }
  return n;
}

function collectImages(html: string, baseUrl: string) {
  const host = new URL(baseUrl).hostname;
  const set = new Set<string>();
  const add = (u?: string) => u && set.add(abs(u, baseUrl));

  // metas (og/twitter/itemprop/link rel=image_src)
  for (const re of [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/gi,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi,
  ]) {
    for (const m of html.matchAll(re)) add(m[1]);
  }

  // JSON-LD images
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : [data];
      for (const n of nodes) {
        const img = n?.image;
        if (!img) continue;
        if (typeof img === "string") add(img);
        else if (Array.isArray(img)) {
          for (const it of img) {
            if (typeof it === "string") add(it);
            else if (it?.url) add(it.url);
          }
        } else if (img?.url) add(img.url);
      }
    } catch {
      /* ignore */
    }
  }

  // generic <img src>, data-src, srcset (largest)
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) add(m[1]);
  for (const m of html.matchAll(/<img[^>]+data-src=["']([^"']+)["'][^>]*>/gi)) add(m[1]);
  for (const m of html.matchAll(/<img[^>]+srcset=["']([^"']+)["'][^>]*>/gi)) {
    const parts = m[1]
      .split(",")
      .map((p) => p.trim().split(" ")[0])
      .filter(Boolean);
    parts.forEach((u) => add(u));
  }
  for (const m of html.matchAll(/<img[^>]+data-srcset=["']([^"']+)["'][^>]*>/gi)) {
    const parts = m[1]
      .split(",")
      .map((p) => p.trim().split(" ")[0])
      .filter(Boolean);
    parts.forEach((u) => add(u));
  }

  // retailer hard fallbacks (grab CDN patterns directly)
  if (/adidas\./i.test(host)) {
    for (const m of html.matchAll(
      /(https?:\/\/assets\.adidas\.com\/images\/[^"' )]+\.(?:jpe?g|png|webp))/gi
    ))
      add(m[1]);
  }
  if (/apple\.com/i.test(host)) {
    for (const m of html.matchAll(
      /(https?:\/\/storeimages\.cdn-apple\.com\/[^"' )]+\.(?:jpe?g|png|webp))/gi
    ))
      add(m[1]);
  }
  if (/dyson\.com\.au/i.test(host)) {
    for (const m of html.matchAll(
      /(https?:\/\/[^"' )]+?\/(is\/image|medias)\/[^"' )]+\.(?:jpe?g|png|webp))/gi
    ))
      add(m[1]);
  }

  const ranked = Array.from(set).map((u) => ({
    url: u,
    score: scoreCandidate(u, host),
  }));
  ranked.sort((a, b) => b.score - a.score);

  const winner = ranked.find((c) => c.score > 0) ?? ranked[0];
  return winner?.url;
}

async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    if (!url) return;
    if (ogCache.has(url)) return ogCache.get(url);
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      next: { revalidate: 0 },
    });
    if (!res.ok) return;
    const html = await res.text();
    const best = collectImages(html, res.url || url);
    if (best && !looksLogoish(best)) {
      ogCache.set(url, best);
      return best;
    }
  } catch {
    // ignore
  }
}

/* ---------------------------- route ---------------------------- */

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${SHEET_TSV}&cb=${Date.now()}`, {
      cache: "no-store",
      headers: { "cache-control": "no-store" },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return new NextResponse(JSON.stringify([]), { status: 200, headers: noCacheHeaders() });
    }

    const text = await res.text();
    const rows = parseTSV(text);

    let deals = rows
      .map((r) => {
        const title = r.title || "";
        const retailer = r.retailer || "";
        const url = r.url || "";
        const image = r.image || "";
        const price = toNum(r.price);
        const originalPrice = toNum(r.originalPrice) || toNum(r.price);

        // generate a stable id if not provided
        const id =
          r.id && r.id.trim().length > 0
            ? r.id
            : `${retailer}-${title}-${url}`.replace(/\s+/g, "-").slice(0, 200);

        return {
          id,
          title,
          retailer,
          category: r.category || "Electronics",
          url,
          image,
          price,
          originalPrice,
          currency: (r.currency || "AUD").toUpperCase(),
          tags: toArr(r.tags),
          regions: toArr(r.regions).length ? toArr(r.regions) : ["AU"],
          popularity: toNum(r.popularity) || 0,
          endsAt: r.endsAt || undefined,
          updatedAt: r.updatedAt || new Date().toISOString(),
        };
      })
      // require minimally valid sale rows
      .filter(
        (d) =>
          d.id &&
          d.title &&
          /^https?:\/\//i.test(d.url) &&
          d.price > 0 &&
          d.originalPrice > 0 &&
          d.price <= d.originalPrice // ensure it's actually a "deal"
      );

    // populate missing images with best-effort product image
    deals = await Promise.all(
      deals.map(async (d) => {
        if (!d.image) {
          const og = await fetchOgImage(d.url);
          if (og) d.image = og;
        }
        return d;
      })
    );

    // return as a plain array (your page already supports array or {deals})
    return new NextResponse(JSON.stringify(deals), { status: 200, headers: noCacheHeaders() });
  } catch {
    return new NextResponse(JSON.stringify([]), { status: 200, headers: noCacheHeaders() });
  }
}
