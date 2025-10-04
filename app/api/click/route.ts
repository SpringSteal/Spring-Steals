import { NextRequest, NextResponse } from "next/server";

// Load deals from your Google Sheet
async function getDeals() {
  const res = await fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6q3INgmFhO6gH7QkxofX4jeHPx7XNtxz-_MFYYy9C9uDURHx879YMQumttQbRrocO0F9QW8GZLhX1/pub?output=tsv");
  const text = await res.text();
  const rows = text.split("\n").map(r => r.split("\t"));

  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj: Record<string,string> = {};
    headers.forEach((h,i) => obj[h] = r[i]);
    return obj;
  });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const deals = await getDeals();
  const deal = deals.find((d) => d.id === id);

  if (!deal || !deal.url) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.redirect(deal.url, 302);
}
