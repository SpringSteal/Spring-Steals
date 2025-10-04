// app/api/og-image/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const IMG_EXT = /\.(avif|webp|png|jpe?g|gif)$/i;

function isLogoish(u: string) {
  const s = u.toLowerCase();
  return (
    s.endsWith(".svg") ||
    /(^|\/)(logo|brand|sprite|placeholder|icon|badge)(-|_|\.|\/)/.test(s) ||
    /apple-touch-icon|favicon/.test(s)
  );
}

function abs(base: string, maybeRel: string) {
  try {
    return new URL(maybeRel, base).toString();
  } catch {
    return maybeRel;
  }
}

function extractFirstImage(html: string, pageUrl: string) {
  // og:image / twitter:image
  const m =
    html.match(/<meta\s+(?:property|name)=["']og:image(?::secure_url)?["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image(?::secure_url)?["']/i) ||
    html.match(/<meta\s+name=["']twitter:image(?::src)?["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i);

  let candidate = (m?.[2] ?? m?.[1]) as string | undefined;
  if (candidate) candidate = abs(pageUrl, candidate);

  // Filter out obvious bad choices (logos/favicons etc.)
  if (!candidate || isLogoish(candidate)) {
    // pick first plausible <img> src with typical product extensions
    const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
      .map((x) => abs(pageUrl, x[1]))
      .filter((u) => IMG_EXT.test(u) && !isLogoish(u));
    candidate = imgs[0];
  }

  return candidate;
}

async function fetchBytes(imageUrl: string, referer?: string) {
  // Some retailers block hotlinking; fake a referer from product page origin if provided.
  const headers: Record<string, string> = { "user-agent": UA };
  if (referer) {
    try {
      const o = new URL(referer);
      headers["referer"] = `${o.protocol}//${o.host}/`;
    } catch {}
  }

  const res = await fetch(imageUrl, {
    headers,
    redirect: "follow",
    cache: "no-store",
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const ct = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());

  return { buf, ct };
}

function nocache() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
    expires: "0",
    "content-security-policy":
      "default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline';",
  };
}

export async function GET(req: NextRequest) {
  try {
    const urlParam = req.nextUrl.searchParams.get("url");   // product page
    const imgParam = req.nextUrl.searchParams.get("image"); // direct image
    const base = req.nextUrl.searchParams.get("base") || urlParam || "";

    let imageUrl: string | undefined;

    if (imgParam) {
      imageUrl = abs(base, imgParam);
    } else if (urlParam) {
      // fetch product page -> extract image
      const pageRes = await fetch(urlParam, {
        cache: "no-store",
        next: { revalidate: 0 },
        headers: { "user-agent": UA },
        redirect: "follow",
      });
      if (!pageRes.ok) throw new Error(`page fetch ${pageRes.status}`);
      const html = await pageRes.text();
      imageUrl = extractFirstImage(html, urlParam);
    }

    if (!imageUrl) {
      return new NextResponse("no-image", { status: 404, headers: nocache() });
    }

    // try with referer first (helps with hotlink protection)
    try {
      const { buf, ct } = await fetchBytes(imageUrl, base);
      return new NextResponse(buf, {
        status: 200,
        headers: {
          ...nocache(),
          "content-type": ct,
        },
      });
    } catch {
      // retry without referer
      const { buf, ct } = await fetchBytes(imageUrl);
      return new NextResponse(buf, {
        status: 200,
        headers: {
          ...nocache(),
          "content-type": ct,
        },
      });
    }
  } catch {
    return new NextResponse("no-image", { status: 404, headers: nocache() });
  }
}
