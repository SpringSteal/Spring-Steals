export const metadata = {
  title: "Spring Steals",
  description: "AU seasonal deals ranked by discount, freshness, season fit & popularity."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "#fafafa", color: "#111", fontFamily: "ui-sans-serif, system-ui, -apple-system" }}>
        {children}
      </body>
    </html>
  );
}
