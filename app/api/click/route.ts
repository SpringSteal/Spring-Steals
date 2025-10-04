import { NextResponse } from "next/server";

const SHEET_TSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6q3INgmFhO6gH7QkxofX4jeHPx7XNtxz-_MFYYy9C9uDURHx879YMQumttQbRrocO0F9QW8GZLhX1/pub?output=tsv";

function parseTSV(tsv: string) {
  const lines = tsv.trim().split(/\r?\n/);
  const headers = lines.shift()!.split("\t").map(h => h.trim());
  return lines.map(line => {
    const cells = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

function normalizeId(s: string) {
  return s.trim().toLowerCase();
}

function normalizeUrl(raw: string | undefined) {
  if (!raw) return undefined;
  let u = raw.trim();
  // Add protocol if missing
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    return new URL(u).toString();
  } catch {
    return undefined;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const res = await fetch(SHEET_TSV, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: "Sheet load failed" }, { status: 500 });

    const rows = parseTSV(await res.text());
    const want = normalizeId(id);

    // find by ID (case/space-insensitive)
    const row = rows.find(r => normalizeId(r.id || "") === want);
    const dest = normalizeUrl(row?.url);

    if (!dest) {
      return NextResponse.json({ error: "Deal not found or invalid URL" }, { status: 404 });
    }

    // Optional subid to track source (harmless for non-affiliate links)
    const url = new URL(dest);
    url.searchParams.set("subid", process.env.AFFILIATE_DEFAULT_SUBID || "springsteals");

    return NextResponse.redirect(url.toString(), { status: 302 });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
