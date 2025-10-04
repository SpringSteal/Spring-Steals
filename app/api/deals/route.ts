// app/api/deals/route.ts
import { NextRequest, NextResponse } from "next/server";

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

// per-request og:image cache
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
  } catch {
    // ignore
  }
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
        url: r.url,
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

    deals = await Promise.all(
      deals.map(async (d) => {
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
