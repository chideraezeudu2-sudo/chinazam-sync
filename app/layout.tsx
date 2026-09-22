import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Chinazam Sync",
  description: "Inventory sync control panel — WooCommerce, eBay, Amazon",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <aside className="rail">
            <div className="rail-mark">CHINAZAM</div>
            <div className="rail-sub">SYNC PANEL</div>
            <nav className="rail-nav">
              <a href="/">Dashboard</a>
              <a href="/settings">Connections</a>
            </nav>
            <div className="rail-foot">chinazamautoparts.ca</div>
          </aside>
          <main className="stage">{children}</main>
        </div>
      </body>
    </html>
  );
}
