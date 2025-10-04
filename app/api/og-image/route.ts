// app/api/og-image/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // no static caching by Next
export const revalidate = 0;

type Candidate = {
  url: string;
  score: number;
};

function absolutize(src: string, base: string) {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

function collect(html: string, base: string, re: RegExp, map?: (m: RegExpMatchArray) => string) {
  const out: string[] = [];
  const all = html.matchAll(re);
  for (const m of all) {
    const raw = map ? map(m) : m[1];
    if (raw) out.push(absolutize(raw.trim(), base));
  }
  return out;
}

function jsonLdImages(html: string, base: string): string[] {
  const tags = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  const out: string[] = [];
  for (const t of tags) {
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
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return out;
}

function looksLogoish(u: string) {
  const lower = u.toLowerCase();
  return (
    lower.endsWith(".svg") ||
    /sprite|logo|brand|placeholder|default|icon|badge/.test(lower) ||
    /apple-touch-icon|favicon|opengraphimage/.test(lower)
  );
}

function scoreCandidate(u: string, domain: string) {
  let score = 0;

  // Prefer jpg/png/webp
  if (/\.(jpe?g|png|webp)(\?|#|$)/i.test(u)) score += 5;

  // Penalize known logoish patterns
  if (looksLogoish(u)) score -= 6;

  // Prefer URLs that look like product images (contain dimensions or sku-ish ids)
  if (/[/_-](\d{3,}|[0-9]{2,}x[0-9]{2,})/.test(u)) score += 2;

  // Retailer hints: tweak per domain if needed
  if (/adidas\./i.test(domain)) {
    // adidas product images often live on assets.adidas.com/images
    if (/assets\.adidas\.com\/images/i.test(u)) score += 3;
  }
  if (/apple\.com/i.test(domain)) {
    // prefer store/cdn images rather than marketing logo
    if (/store\/[^/]+\/[^?]+\.(jpe?g|png|webp)/i.test(u)) score += 2;
  }
  if (/jbhifi\.com\.au/i.test(domain)) {
    if (/cdn|product|large/i.test(u)) score += 2;
  }

  return score;
}

function pickImage(html: string, baseUrl: string): string | null {
  const domain = new URL(baseUrl).hostname;

  // Collect candidates
  const candidates = new Set<string>();

  // Common metas
  [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/gi,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi,
  ].forEach((re) => collect(html, baseUrl, re).forEach((u) => candidates.add(u)));

  // JSON-LD
  jsonLdImages(html, baseUrl).forEach((u) => candidates.add(u));

  if (!candidates.size) return null;

  // Score and choose best
  const ranked: Candidate[] = Array.from(candidates).map((u) => ({
    url: u,
    score: scoreCandidate(u, domain),
  }));

  ranked.sort((a, b) => b.score - a.score);

  // Take the best non-logo if possible; otherwise the top one
  const nonLogo = ranked.find((c) => c.score > 0);
  return (nonLogo ?? ranked[0]).url;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

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
      const resp = NextResponse.redirect(img, 302);
      // Cache a bit so repeat views are fast (adjust as you like)
      resp.headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
      return resp;
    }

    return NextResponse.json({ error: "No suitable image" }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
