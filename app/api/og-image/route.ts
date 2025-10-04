// app/api/og-image/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Candidate = { url: string; score: number };

function abs(u: string, base: string) {
  try { return new URL(u, base).toString(); } catch { return u; }
}

function grab(html: string, base: string, re: RegExp, pick?: (m: RegExpMatchArray) => string) {
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const raw = pick ? pick(m) : m[1];
    if (raw) out.push(abs(raw.trim(), base));
  }
  return out;
}

function jsonLd(html: string, base: string) {
  const out: string[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : [data];
      for (const n of nodes) {
        const img = n?.image;
        if (!img) continue;
        if (typeof img === "string") out.push(abs(img, base));
        else if (Array.isArray(img)) {
          for (const it of img) {
            if (typeof it === "string") out.push(abs(it, base));
            else if (it?.url) out.push(abs(it.url, base));
          }
        } else if (img?.url) out.push(abs(img.url, base));
      }
    } catch { /* ignore */ }
  }
  return out;
}

function looksLogoish(u: string) {
  const s = u.toLowerCase();
  return (
    s.endsWith(".svg") ||
    /(^|\/)(logo|brand|sprite|placeholder|icon|badge|favicon)(-|_|\.|\/)/.test(s) ||
    /apple-touch-icon|opengraphimage/.test(s)
  );
}

function score(u: string, host: string) {
  let n = 0;
  if (/\.(jpe?g|png|webp)(\?|#|$)/i.test(u)) n += 5;
  if (looksLogoish(u)) n -= 8;
  if (/[/_-](\d{3,}|[0-9]{2,}x[0-9]{2,})/.test(u)) n += 2;

  // Domain-specific nudges
  if (/adidas\./i.test(host)) {
    if (/assets\.adidas\.com\/images/i.test(u)) n += 6; // real product CDN
    if (/\/logos?\//i.test(u)) n -= 6;
  }
  if (/apple\.com/i.test(host)) {
    if (/storeimages\.cdn-apple\.com/i.test(u)) n += 4;
  }
  if (/dyson\.com\.au/i.test(host)) {
    if (/is\/image|\/medias\//i.test(u)) n += 4; // dyson adobe/medias
  }
  if (/jbhifi\.com\.au/i.test(host)) {
    if (/cdn|product|large/i.test(u)) n += 2;
  }
  return n;
}

function pickImage(html: string, baseUrl: string): string | null {
  const host = new URL(baseUrl).hostname;
  const set = new Set<string>();

  // Common metas
  [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/gi,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi,
  ].forEach((re) => grab(html, baseUrl, re).forEach((u) => set.add(u)));

  // JSON-LD
  jsonLd(html, baseUrl).forEach((u) => set.add(u));

  // Generic <img> sources
  grab(html, baseUrl, /<img[^>]+src=["']([^"']+)["'][^>]*>/gi).forEach((u) => set.add(u));
  // srcset (pick the *largest* url in the set)
  for (const m of html.matchAll(/<img[^>]+srcset=["']([^"']+)["'][^>]*>/gi)) {
    const srcset = m[1].split(",").map((p) => p.trim().split(" ")[0]).filter(Boolean);
    srcset.forEach((u) => set.add(abs(u, baseUrl)));
  }
  // Lazy attrs
  grab(html, baseUrl, /<img[^>]+data-src=["']([^"']+)["'][^>]*>/gi).forEach((u) => set.add(u));
  for (const m of html.matchAll(/<img[^>]+data-srcset=["']([^"']+)["'][^>]*>/gi)) {
    const srcset = m[1].split(",").map((p) => p.trim().split(" ")[0]).filter(Boolean);
    srcset.forEach((u) => set.add(abs(u, baseUrl)));
  }

  // Adidas hard fallback: any product CDN image
  if (/adidas\./i.test(host)) {
    grab(html, baseUrl, /(https?:\/\/assets\.adidas\.com\/images\/[^"' )]+?\.(?:jpe?g|png|webp))/gi)
      .forEach((u) => set.add(u));
  }
  // Apple Store hard fallback
  if (/apple\.com/i.test(host)) {
    grab(html, baseUrl, /(https?:\/\/storeimages\.cdn-apple\.com\/[^"' )]+?\.(?:jpe?g|png|webp))/gi)
      .forEach((u) => set.add(u));
  }
  // Dyson AU fallback
  if (/dyson\.com\.au/i.test(host)) {
    grab(html, baseUrl, /(https?:\/\/[^"' )]+?\/(is\/image|medias)\/[^"' )]+\.(?:jpe?g|png|webp))/gi)
      .forEach((u) => set.add(u));
  }

  if (!set.size) return null;

  const ranked: Candidate[] = Array.from(set).map((u) => ({ url: u, score: score(u, host) }));
  ranked.sort((a, b) => b.score - a.score);

  const winner = ranked.find((c) => c.score > 0) ?? ranked[0];
  return winner?.url ?? null;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Upstream HTTP ${res.status}` }, { status: 502 });
    }

    const html = await res.text();
    const img = pickImage(html, res.url || url);

    if (img) {
      const r = NextResponse.redirect(img, 302);
      // cache a bit, adjust if you like
      r.headers.set("Cache-Control", "public, max-age=1800, s-maxage=1800");
      return r;
    }

    return NextResponse.json({ error: "No suitable image" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
