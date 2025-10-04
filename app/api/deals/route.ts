// app/api/deals/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHEET_TSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6q3INgmFhO6gH7QkxofX4jeHPx7XNtxz-_MFYYy9C9uDURHx879YMQumttQbRrocO0F9QW8GZLhX1/pub?output=tsv";

/* --------------------------- helpers --------------------------- */

function parseTSV(tsv: string) {
  const lines = tsv.trim().split(/\r?\n/);
  const headers = lines.shift()!.split("\t").map((h) => h.replace(/\r/g, "").trim());
  return lines.map((line) => {
    const cells = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = ((cells[i] ?? "").replace(/\r/g, "")).trim()));
    return row;
  });
}

const toNum = (s: string) => {
  if (!s) return 0;
  return Number(String(s).replace(/[$, ]/g, "")) || 0;
};

const toArr = (s: string) =>
  s ? s.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [];

// Per-process OG cache
const ogCache = new Map<string, string>();
async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    if (!url) return;
    if (ogCache.has(url)) return ogCache.get(url);
    const res = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
    if (!res.ok) return;
    const html = await res.text();
    const m =
      html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
    const og = m?.[1];
    if (og) {
      ogCache.set(url, og);
      return og;
    }
  } catch {}
}

/* ---------- URL normalization (key fix for TGG & HN) ---------- */

function sanitizeUrl(raw?: string) {
  if (!raw) return "";
  let u = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
    .replace(/&amp;/gi, "&")
    .trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  u = u.replace(/\s+/g, "%20");
  return u;
}

async function followRedirects(url: string, maxHops = 4) {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    try {
      const res = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        cache: "no-store",
        next: { revalidate: 0 },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        try {
          current = new URL(loc, current).toString();
        } catch {
          current = loc;
        }
        continue;
      }
      break;
    } catch {
      break;
    }
  }
  return current;
}

async function canonicalFromGet(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
    // If they give us a 404 content, still try to read canonical/og:url
    const html = await res.text();
    const linkCanon = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1];
    const ogUrl = html.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i)?.[1];
    const found = linkCanon || ogUrl;
    if (found) return new URL(found, url).toString();
  } catch {}
}

/**
 * Normalize retailer URLs to stable product pages.
 * - Follows redirects
 * - Uses canonical/og:url when available
 * - Adds gentle retailer-specific nudges
 */
async function normalizeRetailerUrl(raw?: string): Promise<string> {
  let url = sanitizeUrl(raw);
  if (!url) return "";

  // Resolve short/affiliate links first
  url = await followRedirects(url);

  // Retailer nudges (don’t throw if they don’t apply)
  try {
    const u = new URL(url);
    const host = u.hostname;

    // Harvey Norman AU product pages are usually .../slug.html
    if (host.includes("harveynorman.com.au") && !u.pathname.endsWith(".html")) {
      u.pathname = u.pathname.replace(/\/$/, "") + ".html";
      url = u.toString();
    }

    // The Good Guys AU — ensure we’re on the canonical domain
    if (host.includes("thegoodguys.com.au")) {
      if (!/^www\./i.test(host)) {
        u.hostname = "www.thegoodguys.com.au";
        url = u.toString();
      }
    }
  } catch {}

  // Load page HTML and pick canonical/og:url when present
  const canon = await canonicalFromGet(url);
  if (canon) url = sanitizeUrl(canon);

  return url;
}

function noCacheHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
    expires: "0",
  };
}

/* ---------------------------- route ---------------------------- */

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${SHEET_TSV}&cb=${Date.now()}`, {
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return new NextResponse(JSON.stringify([]), { status: 200, headers: noCacheHeaders() });
    }

    const text = await res.text();
    const rows = parseTSV(text);

    let deals = rows
      .map((r) => ({
        id: r.id,
        title: r.title,
        retailer: r.retailer,
        category: r.category || "Other",
        url: sanitizeUrl(r.url),
        image: r.image || "",
        price: toNum(r.price),
        originalPrice: toNum(r.originalPrice) || toNum(r.price),
        currency: (r.currency || "AUD").toUpperCase(),
        tags: toArr(r.tags),
        regions: toArr(r.regions),
        popularity: toNum(r.popularity) || 0,
        endsAt: r.endsAt || undefined,
        updatedAt: r.updatedAt || new Date().toISOString(),
      }))
      .filter((d) => d.id && d.title && d.url && d.price > 0 && d.originalPrice > 0);

    // Normalize product URLs + fill missing OG images
    deals = await Promise.all(
      deals.map(async (d) => {
        d.url = await normalizeRetailerUrl(d.url);
        if (!d.image) {
          const og = await fetchOgImage(d.url);
          if (og) d.image = og;
        }
        return d;
      })
    );

    return new NextResponse(JSON.stringify(deals), { status: 200, headers: noCacheHeaders() });
  } catch {
    return new NextResponse(JSON.stringify([]), { status: 200, headers: noCacheHeaders() });
  }
}
