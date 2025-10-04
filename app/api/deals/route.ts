import { NextResponse } from "next/server";

// Your published Google Sheets TSV link
const SHEET_TSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6q3INgmFhO6gH7QkxofX4jeHPx7XNtxz-_MFYYy9C9uDURHx879YMQumttQbRrocO0F9QW8GZLhX1/pub?output=tsv";

// Simple parser for TSV
function parseTSV(tsv: string) {
  const lines = tsv.trim().split(/\r?\n/);
  const headers = lines.shift()!.split("\t").map((h) => h.trim());
  return lines.map((line) => {
    const cells = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

const toNum = (s: string) => (s ? Number(s) : 0);
const toArr = (s: string) => (s ? s.split(";").map((x) => x.trim()).filter(Boolean) : []);

// Very small cache for og:image so we don't re-fetch the same page repeatedly during a burst
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
    // ignore network/parse errors; we'll just return undefined
  }
}

export async function GET() {
  try {
    const res = await fetch(SHEET_TSV, { cache: "no-store" });
    if (!res.ok) return NextResponse.json([], { status: 200 });

    const text = await res.text();
    const rows = parseTSV(text);

    // First pass: coerce fields and keep rows that look valid
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
        currency: r.currency || "AUD",
        tags: toArr(r.tags),
        regions: toArr(r.regions),
        popularity: toNum(r.popularity) || 0,
        endsAt: r.endsAt || undefined,
        updatedAt: r.updatedAt || new Date().toISOString(),
      }))
      .filter((d) => d.id && d.title && d.url && d.price > 0 && d.originalPrice > 0);

    // Second pass: if image missing, try to pull og:image from the product page
    const enriched = await Promise.all(
      deals.map(async (d) => {
        if (!d.image && d.url) {
          const og = await fetchOgImage(d.url);
          if (og) d.image = og;
        }
        return d;
      })
    );

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
