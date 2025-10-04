import { NextResponse } from "next/server";

const SHEET_TSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6q3INgmFhO6gH7QkxofX4jeHPx7XNtxz-_MFYYy9C9uDURHx879YMQumttQbRrocO0F9QW8GZLhX1/pub?output=tsv";

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const subid = process.env.AFFILIATE_DEFAULT_SUBID || "springsteals";

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const res = await fetch(SHEET_TSV, { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: "Sheet load failed" }, { status: 500 });

  const rows = parseTSV(await res.text());
  const row = rows.find((r) => r.id === id);
  if (!row?.url) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const url = new URL(row.url);
  url.searchParams.set("subid", subid); // harmless now; swap to real affiliate params later
  return NextResponse.redirect(url.toString(), { status: 302 });
}
