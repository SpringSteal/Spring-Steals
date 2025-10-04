"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getSeason, scoreDeal } from "@/lib/scoring";

type Deal = {
  id: string;
  title: string;
  retailer: string;
  category: string;
  url: string;
  image?: string;
  price: number;
  originalPrice: number;
  currency: string;
  endsAt?: string;
  updatedAt: string;
  popularity: number;
  tags: string[];
  regions: string[];
};

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#f3f4f6", padding: "2px 8px", fontSize: 12, border: "1px solid #e5e7eb" }}>
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", fontSize: 12 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Card({ deal }: { deal: Deal }) {
  const now = new Date();
  const { score, facets } = scoreDeal(deal, now, { season: getSeason(now) });
  const discountPct = Math.round(facets.discount * 100);
  const endsInDays = deal.endsAt ? Math.ceil((new Date(deal.endsAt).getTime() - now.getTime()) / 86400000) : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", borderRadius: 16, border: "1px solid #e5e7eb", background: "#fff", overflow: "hidden" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 10", background: "#f3f4f6" }}>
        {deal.image && <Image src={deal.image} alt={deal.title} fill style={{ objectFit: "cover" }} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div title={deal.title} style={{ fontWeight: 700, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deal.title}</div>
            <div style={{ color: "#6b7280", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deal.retailer} • {deal.category}</div>
          </div>
          <Badge>{discountPct}% off</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>{deal.currency} {deal.price.toLocaleString()}</span>
          <span style={{ color: "#9ca3af", textDecoration: "line-through" }}>{deal.currency} {deal.originalPrice.toLocaleString()}</span>
        </div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <Stat label="Score" value={score.toFixed(2)} />
            <Stat label="Ends" value={endsInDays} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(deal.tags || []).slice(0, 2).map((t) => <Badge key={t}>{t}</Badge>)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href={`/api/click?id=${deal.id}`} style={{ borderRadius: 12, border: "1px solid #e5e7eb", padding: "8px 12px", fontSize: 14 }}>View deal ↗</a>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [retailer, setRetailer] = useState("All");
  const [minDiscount, setMinDiscount] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [sort, setSort] = useState<"score" | "newest" | "discount" | "priceAsc" | "priceDesc">("score");
  const [season, setSeason] = useState(getSeason(new Date()));
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    fetch("/api/deals").then(r => r.json()).then(setDeals).catch(() => {});
  }, []);

  const categories = useMemo(() => ["All", ...Array.from(new Set(deals.map(d => d.category)))], [deals]);
  const retailers = useMemo(() => ["All", ...Array.from(new Set(deals.map(d => d.retailer)))], [deals]);

  const filtered = useMemo(() => {
    const now = new Date();

    const rows = deals
      .filter(d => {
        const q = query.toLowerCase().trim();
        const discount = Math.round(((d.originalPrice - d.price) / d.originalPrice) * 100);
        return (
          (category === "All" || d.category === category) &&
          (retailer === "All" || d.retailer === retailer) &&
          (minDiscount === 0 || discount >= minDiscount) &&
          (maxPrice === 0 || d.price <= maxPrice) &&
          (!q || (d.title + " " + d.retailer + " " + (d.tags || []).join(" ")).toLowerCase().includes(q))
        );
      })
      .map(d => ({
        ...d,
        score: scoreDeal(d, now, { season }).score,
        discountPct: Math.round(((d.originalPrice - d.price) / d.originalPrice) * 100)
      }))
      .sort((a: any, b: any) => {
        const sorters: Record<string, (x: any, y: any) => number> = {
          score: (x, y) => y.score - x.score,
          newest: (x, y) => new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime(),
          discount: (x, y) => y.discountPct - x.discountPct,
          priceAsc: (x, y) => x.price - y.price,
          priceDesc: (x, y) => y.price - x.price
        };
        return (sorters[sort] || sorters.score)(a, b);
      });

    return rows;
  }, [deals, query, category, retailer, minDiscount, maxPrice, sort, season]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Spring Steals</h1>
          <p style={{ color: "#6b7280", fontSize: 14 }}>AU seasonal deals ranked by discount, freshness, season fit and popularity.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={season} onChange={e => setSeason(e.target.value as any)}>
            {["Summer", "Autumn", "Winter", "Spring"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as any)}>
            <option value="score">Sort: Best Score</option>
            <option value="newest">Sort: Newest</option>
            <option value="discount">Sort: Biggest Discount</option>
            <option value="priceAsc">Sort: Price (Low→High)</option>
            <option value="priceDesc">Sort: Price (High→Low)</option>
          </select>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 8, padding: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, marginBottom: 16 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search titles, tags, retailers…" style={{ gridColumn: "span 2", padding: 8 }} />
        <select value={category} onChange={e => setCategory(e.target.value)}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={retailer} onChange={e => setRetailer(e.target.value)}>
          {retailers.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div>
          <label style={{ fontSize: 12, color: "#6b7280" }}>Min Discount</label>
          <div><input type="number" min={0} max={90} value={minDiscount} onChange={e => setMinDiscount(Number(e.target.value) || 0)} style={{ width: 80, padding: 8 }} /> %</div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#6b7280" }}>Max Price</label>
          <div><input type="number" min={0} value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value) || 0)} style={{ width: 120, padding: 8 }} /></div>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#6b7280", border: "1px dashed #d1d5db", borderRadius: 16 }}>
          No deals match your filters.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {filtered.map(d => <Card key={d.id} deal={d} />)}
        </div>
      )}
    </div>
  );
}
