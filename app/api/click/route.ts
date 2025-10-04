// app/api/click/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCache() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
    expires: "0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };
}

// Remove hidden chars, fix HTML entities, ensure https
function sanitizeUrl(raw?: string) {
  if (!raw) return "";
  let u = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
    .replace(/&amp;/gi, "&")
    .trim();

  // add scheme if missing
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;

  // collapse spaces
  u = u.replace(/\s+/g, "%20");

  return u;
}

async function headStatus(url: string): Promise<{ ok: boolean; code: number; location?: string }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
      next: { revalidate: 0 },
    });
    const location = res.headers.get("location") || undefined;
    return { ok: res.status >= 200 && res.status < 400, code: res.status, location };
  } catch {
    return { ok: false, code: 0 };
  }
}

async function resolveRedirects(url: string, maxHops = 4): Promise<string> {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const { code, location } = await headStatus(current);
    if (code >= 300 && code < 400 && location) {
      // relative -> absolute
      try {
        current = new URL(location, current).toString();
      } catch {
        current = location;
      }
      continue;
    }
    break;
  }
  return current;
}

async function canonicalIf404(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
    if (res.status === 404) {
      const html = await res.text();
      const m =
        html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) ||
        html.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i);
      if (m?.[1]) {
        return new URL(m[1], url).toString();
      }
    }
  } catch {
    // ignore
  }
}

function domainHome(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = "/";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return "https://www.google.com";
  }
}

export async function GET(req: NextRequest) {
  try {
    const { origin, searchParams } = req.nextUrl;
    const id = (searchParams.get("id") || "").trim();
    const directUrlParam = sanitizeUrl(searchParams.get("url") || "");

    // Quick debug path: allow direct url passthrough
    if (directUrlParam.startsWith("http")) {
      const resolved = await resolveRedirects(directUrlParam);
      const maybeCanon = await canonicalIf404(resolved);
      const target = sanitizeUrl(maybeCanon || resolved);
      return NextResponse.redirect(target, { status: 302, headers: noCache() });
    }

    if (!id) {
      return NextResponse.redirect(new URL("/", origin), { status: 302, headers: noCache() });
    }

    // Always fetch our cleaned deals feed
    const dealsRes = await fetch(new URL(`/api/deals?cb=${Date.now()}`, origin), {
      cache: "no-store",
      headers: { "cache-control": "no-store" },
      next: { revalidate: 0 },
    });
    const raw = await dealsRes.json();
    const deals: Array<{ id: string; url?: string }> = Array.isArray(raw) ? raw : raw?.deals || [];

    const deal = deals.find((d) => (d?.id ?? "").toString().trim() === id);
    let url = sanitizeUrl(deal?.url);

    if (!url) {
      // soft fallback: try loose contains match
      const maybe = deals.find((d) => typeof d?.url === "string" && d.url!.includes(id));
      url = sanitizeUrl(maybe?.url);
    }

    if (!url) {
      return NextResponse.redirect(new URL("/", origin), { status: 302, headers: noCache() });
    }

    // Follow redirects (affiliate shorteners)
    let finalUrl = await resolveRedirects(url);

    // If retailer returned 404, attempt canonical
    const canon = await canonicalIf404(finalUrl);
    if (canon) finalUrl = canon;

    // Last-resort fallback: if still looks bad, go to domain home
    const { ok } = await headStatus(finalUrl);
    if (!ok) finalUrl = domainHome(finalUrl);

    return NextResponse.redirect(finalUrl, { status: 302, headers: noCache() });
  } catch {
    return new NextResponse("Redirect error", { status: 500, headers: noCache() });
  }
}
