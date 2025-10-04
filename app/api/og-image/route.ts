// app/api/og-image/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Candidate = { url: string; score: number };

function absolutize(src: string, base: string) {
  try { return new URL(src, base).toString(); } catch { return src; }
}
function collect(html: string, base: string, re: RegExp, map?: (m: RegExpMatchArray) => string) {
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const raw = map ? map(m) : m[1];
    if (raw) out.push(absolutize(raw.trim(), base));
  }
  return out;
}
function jsonLdImages(html: string, base: string): string[] {
  const out: string[] = [];
  for (const t of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const json = t[1];
    try {
      const data = JSON.parse(json);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const img = node?.image;
        if (!img) continue;
        if (typeof img === "string") out.push(absolutize(img, base));
        else if (Array.isArray(img)) {
          for (const it of img) {
            if (typeof it === "string") out.push(absolutize(it, base));
            else if (it?.url) out.push(absolutize(it.url, base));
          }
        } else if (img?.url) out.push(absolutize(img.url, base));
      }
    } catch {}
  }
  return out;
}

function looksLogoish(u: string) {
  const s = u.toLowerCase();
  return (
    s.endsWith(".svg") ||
    /(^|\/)(logo|brand|sprite|placeholder|icon|badge)(-|_|\.|\/)/.test(s) ||
    /apple-touch-icon|favicon|opengraphimage/.test(s)
  );
}

function score(u: string, host: string) {
  let n = 0;
  if (/\.(jpe?g|png|webp)(\?|#|$)/i.test(u)) n += 5;
  if (looksLogoish(u)) n -= 6;
  if (/[/_-](\d{3,}|[0-9]{2,}x[0-9]{2,})/.test(u)) n += 2;

  if (/adidas\./i.test(host)) {
    if (/assets\.adidas\.com\/images/i.test(u)) n += 3;
  }
  if (/apple\.com/i.test(host)) {
    // prefer store CDN images
    if (/\.(jpe?g|png|webp)(\?|#|$)/i.test(u) && /\/(store|shop|product)\//i.test(u)) n += 2;
  }
  if (/jbhifi\.com\.au/i.test(host)) {
    if (/cdn|product|large/i.test(u)) n += 2;
  }
  return n;
}

function pickImage(html: string, baseUrl: string): string | null {
  const host = new URL(baseUrl).hostname;
  const cands = new Set<string>();

  // Common metas
  [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/gi,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi,
  ].forEach(re => collect(html, baseUrl, re).forEach(u => cands.add(u)));

  // JSON-LD
  jsonLdImages(html, baseUrl).forEach(u => cands.add(u));

  // Retailer gallery fallbacks (grab real product <img> sources)
  if (/adidas\./i.test(host)) {
    collect(html, baseUrl, /<img[^>]+src=["']([^"']+\/images\/[^"']+)["'][^>]*>/gi)
      .forEach(u => cands.add(u));
  }
  if (/apple\.com/i.test(host)) {
    collect(html, baseUrl, /<img[^>]+src=["']([^"']+\.(?:jpe?g|png|webp))["'][^>]*>/gi)
      .forEach(u => cands.add(u));
  }

  if (!cands.size) return null;

  const ranked: Candidate[] = Array.from(cands).map(u => ({
    url: u,
    score: score(u, host),
  }));
  ranked.sort((a, b) => b.score - a.score);

  const nonLogo = ranked.find(c => c.score > 0);
  return (nonLogo ?? ranked[0]).url;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36",
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
      r.headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
      return r;
    }
    return NextResponse.json({ error: "No suitable image" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
