import { NextResponse } from "next/server";

export async function GET() {
  try {
    const sheetUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6q3INgmFhO6gH7QkxofX4jeHPx7XNtxz-_MFYYy9C9uDURHx879YMQumttQbRrocO0F9QW8GZLhX1/pub?output=tsv";

    const res = await fetch(sheetUrl);
    const text = await res.text();

    // Split the TSV data into rows
    const [headerLine, ...lines] = text.trim().split("\n");
    const headers = headerLine.split("\t");

    // Convert each row into an object
    const deals = lines.map((line) => {
      const values = line.split("\t");
      const obj: any = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] || "";
      });

      // Convert numbers properly
      if (obj.price) obj.price = parseFloat(obj.price);
      if (obj.originalPrice) obj.originalPrice = parseFloat(obj.originalPrice);

      // Tags: split by comma if present
      if (obj.tags) obj.tags = obj.tags.split(",").map((t: string) => t.trim());

      return obj;
    });

    return NextResponse.json(deals);
  } catch (err) {
    console.error("Error fetching sheet:", err);
    return NextResponse.json({ error: "Failed to load deals" }, { status: 500 });
  }
}
