// app/api/deals/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHEET_TSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6q3INgmFhO6gH7QkxofX4jeHPx7XNtxz-_MFYYy9C9uDURHx879YMQumttQbRrocO0F9QW8GZLhX1/pub?output=tsv";

/* --------------------------- helpers --------------------------- */

function normKey(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/\uFEFF/g, "")         // BOM
    .replace(/\r/g, "")
    .replace(/[^a-z0-9]+/g, " ")    // collapse punctuation/underscores
    .trim()
    .replace(/\s+/g, "");           // remove all spaces
}

const ALIASES: Record<string, string[]> = {
  id: ["id", "dealid", "sku", "key"],
  title: ["title", "product", "name", "productname"],
  retailer: ["retailer", "store", "merchant", "vendor", "brand"],
  category: ["category", "dept", "department", "segment"],
  url: ["url", "link", "producturl", "dealurl", "href", "landingurl"],
  image: ["image", "imageurl", "img", "picture", "photo", "thumbnail", "thumb"],
  price: ["price", "saleprice", "currentprice", "now", "nowprice"],
  originalPrice: ["originalprice", "rrp", "listprice", "was", "wasprice", "retailprice"],
  currency: ["currency", "curr", "iso", "code"],
  tags: ["tags", "tag", "labels", "keywords"],
  regions: ["regions", "region", "geo", "country"],
  popularity: ["popularity", "score", "clicks", "views", "rank"],
  endsAt: ["endsat", "expires", "expiry", "enddate", "end"],
  updatedAt: ["updatedat", "updated", "lastupdated", "timestamp", "date", "when"],
};

function resolveKey(map: Record<string, number>, target: keyof typeof ALIASES) {
  for (const a of ALIASES[target]) {
    const k = normKey(a);
    if (map[k] !== undefined) return map[k];
  }
  return undefined;
}

function toNum(s: string) {
  if (!s) return 0;
  const v = Number(String(s).replace(/[^\d.]/g, ""));
  return Number.isFinite(v) ? v : 0;
}

function toArr(s: string) {
  return s ? s.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [];
}

function sanitizeUrl(raw?: string) {
  if (!raw) return "";
  let u = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/&amp;/gi, "&")
    .trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u.replace(/\s+/g, "%20");
}

function noCacheHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
    expires: "0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };
}

/* ------------------------ product image helper ------------------------ */

const ogCache = new Map<string, string>();
async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    if (!url) return;
    if (ogCache.has(url)) return ogCache.get(url);
    const res = await fetch(url, {
      cache: "no-store",
      next: { revalidate: 0 },
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36",
      },
    });
    if (!res.ok) return;
    const html = await res.text();
    const m =
      html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i) ||
      html.match(/<meta\s+name=["']twitter:image(:src)?["']\s+content=["']([^"']+)["']/i);
    const og = (m?.[2] ?? m?.[1]) as string | undefined;
    if (og) {
      ogCache.set(url, og);
      return og;
    }
  } catch {
    // ignore
  }
}

/* ------------------------------ parser ------------------------------ */

function parseTSVRaw(tsv: string): string[][] {
  return tsv
    .trim()
    .split(/\r?\n/)
    .map((l) => l.replace(/\r/g, "").split("\t"));
}

function mapRows(rows: string[][]) {
  if (rows.length === 0) return [];

  const headerRow = rows[0];
  const hasHeader = headerRow.some((h) => /title|retailer|url/i.test(h));

  let dataRows = rows;
  let indexMap: Record<string, number> = {};

  if (hasHeader) {
    const normHeader = headerRow.map(normKey);
    normHeader.forEach((h, i) => (indexMap[h] = i));
    dataRows = rows.slice(1);
  } else {
    // No header found → assume our known order:
    // title retailer category url image price originalPrice currency tags
    indexMap = {
      [normKey("title")]: 0,
      [normKey("retailer")]: 1,
      [normKey("category")]: 2,
      [normKey("url")]: 3,
      [normKey("image")]: 4,
      [normKey("price")]: 5,
      [normKey("originalPrice")]: 6,
      [normKey("currency")]: 7,
      [normKey("tags")]: 8,
    };
    dataRows = rows;
  }

  const col = (r: string[], name: keyof typeof ALIASES) => {
    const idx = resolveKey(indexMap, name);
    return idx !== undefined ? (r[idx] ?? "").trim() : "";
  };

  const out = dataRows
    .map((r, rowIdx) => {
      const title = col(r, "title");
      const retailer = col(r, "retailer");
      const url = sanitizeUrl(col(r, "url"));
      const image = col(r, "image");
      const price = toNum(col(r, "price"));
      const originalPriceRaw = toNum(col(r, "originalPrice"));
      const originalPrice = originalPriceRaw > 0 ? originalPriceRaw : price; // don’t drop the row
      const category = col(r, "category") || "Electronics";
      const currency = (col(r, "currency") || "AUD").toUpperCase();
      const tags = toArr(col(r, "tags"));
      const regions = toArr(col(r, "regions"));
      const popularity = toNum(col(r, "popularity")) || 0;
      const endsAt = col(r, "endsAt") || undefined;
      const updatedAt = col(r, "updatedAt") || new Date().toISOString();

      // build an id even if the sheet doesn't provide one
      const rawId = col(r, "id");
      const id =
        rawId && rawId.length
          ? rawId
          : `${retailer}-${title}-${url}`.replace(/\s+/g, "-").slice(0, 200);

      // minimal validity (don’t be over-strict)
      if (!title || !retailer || !url || price <= 0) {
        // skip clearly broken rows but don't nuke everything
        return null;
      }

      return {
        id,
        title,
        retailer,
        category,
        url,
        image,
        price,
        originalPrice,
        currency,
        tags,
        regions: regions.length ? regions : ["AU"],
        popularity,
        endsAt,
        updatedAt,
      };
    })
    .filter(Boolean) as any[];

  return out;
}

/* ------------------------------- route ------------------------------- */

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${SHEET_TSV}&cb=${Date.now()}`, {
      cache: "no-store",
      headers: { "cache-control": "no-store" },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return new NextResponse(JSON.stringify([]), { status: 200, headers: noCacheHeaders() });
    }

    const text = await res.text();
    const rows = parseTSVRaw(text);
    let deals = mapRows(rows);

    // Fill missing images (best-effort) — but never block listing
    deals = await Promise.all(
      deals.map(async (d) => {
        if (!d.image) {
          const og = await fetchOgImage(d.url);
          if (og) d.image = og;
        }
        return d;
      })
    );

    // Return as array (your page supports array or {deals})
    return new NextResponse(JSON.stringify(deals), { status: 200, headers: noCacheHeaders() });
  } catch {
    return new NextResponse(JSON.stringify([]), { status: 200, headers: noCacheHeaders() });
  }
}
