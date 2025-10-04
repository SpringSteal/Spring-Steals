import { NextRequest } from "next/server";

// Helper to turn a relative link into a full one
function absolutize(url: string, base: string) {
  try {
    return new URL(url, base).toString();
  } catch {
    return "";
  }
}

// Find the <meta property="og:image" ...> tag in the product page
function extractOgImage(html: string, base: string): string | null {
  const match =
    html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);
  if (!match) return null;
  return absolutize(match[1].trim(), base);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400 });

  try {
    // Fetch the product’s webpage HTML
    const pageRes = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!pageRes.ok) return new Response("Failed to load page", { status: 502 });

    const html = await pageRes.text();
    const ogImage = extractOgImage(html, url);
    if (!ogImage) return new Response("No og:image found", { status: 404 });

    // Now fetch that image and pass it through your own server
    const imgRes = await fetch(ogImage, { headers: { referer: "" }, cache: "no-store" });
    if (!imgRes.ok || !imgRes.body) return Response.redirect(ogImage, 302);

    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    return new Response(imgRes.body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch {
    return new Response("Error fetching image", { status: 500 });
  }
}
