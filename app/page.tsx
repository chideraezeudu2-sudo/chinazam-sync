"use client";

import { useEffect, useState } from "react";

type Product = {
  sku: string;
  title: string;
  price: number | null;
  stock_qty: number | null;
  ebay_listing_status: string;
  amazon_listing_status: string;
  last_synced_at: string | null;
};

type Log = {
  service: string;
  status: string;
  message: string;
  products_processed: number;
  created_at: string;
};

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data.products || []);
    setLogs(data.logs || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function runSync(service: "woocommerce" | "ebay" | "amazon" | "reconcile") {
    setRunning(service);
    setNotice(null);
    try {
      const res = await fetch(`/api/sync/${service}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      if (service === "woocommerce") {
        setNotice(`Pulled ${data.count} products from WooCommerce.`);
      } else if (service === "reconcile") {
        setNotice(
          `Reconciled ${data.totalSold} units sold.${data.errors?.length ? ` ${data.errors.length} issue(s).` : ""}`
        );
      } else {
        setNotice(
          `Pushed ${data.processed} listings to ${service}.${data.errors?.length ? ` ${data.errors.length} failed.` : ""}`
        );
      }
      await load();
    } catch (err: any) {
      setNotice(`Error: ${err.message}`);
    } finally {
      setRunning(null);
    }
  }

  const listedOnEbay = products.filter((p) => p.ebay_listing_status === "listed").length;
  const listedOnAmazon = products.filter((p) => p.amazon_listing_status === "listed").length;

  return (
    <>
      <h1>Sync Panel</h1>
      <p className="lede">
        Pull inventory from chinazamautoparts.ca, then push current price and
        stock out to eBay and Amazon.
      </p>

      <div className="panel">
        <h2>OVERVIEW</h2>
        <div className="metrics">
          <div>
            <div className="metric-value">{products.length}</div>
            <div className="metric-label">Products in catalog</div>
          </div>
          <div>
            <div className="metric-value">{listedOnEbay}</div>
            <div className="metric-label">Listed on eBay</div>
          </div>
          <div>
            <div className="metric-value">{listedOnAmazon}</div>
            <div className="metric-label">Listed on Amazon</div>
          </div>
        </div>
        <div className="btn-row" style={{ marginTop: 20 }}>
          <button
            className="btn"
            disabled={running !== null}
            onClick={() => runSync("woocommerce")}
          >
            {running === "woocommerce" ? "Pulling…" : "Pull from WooCommerce"}
          </button>
          <button
            className="btn btn-outline"
            disabled={running !== null}
            onClick={() => runSync("ebay")}
          >
            {running === "ebay" ? "Pushing…" : "Push to eBay"}
          </button>
          <button
            className="btn btn-outline"
            disabled={running !== null}
            onClick={() => runSync("amazon")}
          >
            {running === "amazon" ? "Pushing…" : "Push to Amazon"}
          </button>
          <button
            className="btn btn-outline"
            disabled={running !== null}
            onClick={() => runSync("reconcile")}
          >
            {running === "reconcile" ? "Reconciling…" : "Reconcile stock from orders"}
          </button>
        </div>
        {notice && (
          <div className={`status-line ${notice.startsWith("Error") ? "bad" : "ok"}`}>
            {notice}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>CATALOG ({products.length})</h2>
        {products.length === 0 ? (
          <p className="lede" style={{ margin: 0 }}>
            No products yet — run &ldquo;Pull from WooCommerce&rdquo; above to load your catalog.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Title</th>
                <th>Price</th>
                <th>Stock</th>
                <th>eBay</th>
                <th>Amazon</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.sku}>
                  <td>{p.sku}</td>
                  <td className="title-cell">{p.title}</td>
                  <td>{p.price != null ? `$${p.price.toFixed(2)}` : "—"}</td>
                  <td>{p.stock_qty ?? "—"}</td>
                  <td>
                    <span className={`tag tag-${p.ebay_listing_status}`}>
                      {p.ebay_listing_status.replace("_", " ")}
                    </span>
                  </td>
                  <td>
                    <span className={`tag tag-${p.amazon_listing_status}`}>
                      {p.amazon_listing_status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>RECENT ACTIVITY</h2>
        {logs.length === 0 ? (
          <p className="lede" style={{ margin: 0 }}>No sync runs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Service</th>
                <th>Result</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i}>
                  <td>{new Date(l.created_at).toLocaleString()}</td>
                  <td>{l.service}</td>
                  <td>
                    <span
                      className={`tag ${l.status === "success" ? "tag-listed" : l.status === "error" ? "tag-error" : "tag-not_listed"}`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="title-cell">{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
