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

export async function GET(req: NextRequest) {
  try {
    const { searchParams, origin } = req.nextUrl;

    // Allow either id or a direct url (handy while debugging)
    const id = searchParams.get("id")?.trim();
    const directUrl = searchParams.get("url")?.trim();

    if (directUrl && /^https?:\/\//i.test(directUrl)) {
      return NextResponse.redirect(directUrl, { status: 302, headers: noCache() });
    }

    if (!id) {
      return NextResponse.redirect(new URL("/", origin), { status: 302, headers: noCache() });
    }

    // Always read current deals from our own API (robust parsing + image logic already there)
    const dealsRes = await fetch(new URL(`/api/deals?cb=${Date.now()}`, origin), {
      cache: "no-store",
      headers: { "cache-control": "no-store" },
      next: { revalidate: 0 },
    });

    if (!dealsRes.ok) {
      return NextResponse.redirect(new URL("/", origin), { status: 302, headers: noCache() });
    }

    const raw = await dealsRes.json();
    const deals: Array<{ id: string; url?: string }> = Array.isArray(raw) ? raw : raw?.deals || [];

    // Trim ids & urls just in case
    const deal = deals.find((d) => (d?.id ?? "").toString().trim() === id);
    let target = (deal?.url ?? "").toString().trim();

    // Fallback: loose search if id has weird whitespace
    if (!target) {
      const maybe = deals.find(
        (d) => typeof d?.url === "string" && d.url.includes(id)
      );
      target = (maybe?.url ?? "").toString().trim();
    }

    if (target && /^https?:\/\//i.test(target)) {
      return NextResponse.redirect(target, { status: 302, headers: noCache() });
    }

    // If we can't find a target, just send home (no 404 page experience for users)
    return NextResponse.redirect(new URL("/", origin), { status: 302, headers: noCache() });
  } catch {
    return new NextResponse("Redirect error", { status: 500, headers: noCache() });
  }
}
