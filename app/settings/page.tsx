"use client";

import { useEffect, useState } from "react";

type Service = "woocommerce" | "ebay" | "amazon";

const FIELD_DEFS: Record<Service, { key: string; label: string; placeholder?: string }[]> = {
  woocommerce: [
    { key: "storeUrl", label: "Store URL", placeholder: "https://chinazamautoparts.ca" },
    { key: "consumerKey", label: "Consumer Key" },
    { key: "consumerSecret", label: "Consumer Secret" },
  ],
  ebay: [
    { key: "clientId", label: "Client ID (App ID)" },
    { key: "clientSecret", label: "Client Secret (Cert ID)" },
    { key: "refreshToken", label: "Refresh Token" },
    { key: "marketplaceId", label: "Marketplace ID", placeholder: "EBAY_CA" },
    { key: "merchantLocationKey", label: "Merchant Location Key" },
  ],
  amazon: [
    { key: "refreshToken", label: "Refresh Token" },
    { key: "lwaAppId", label: "LWA App (Client) ID" },
    { key: "lwaClientSecret", label: "LWA Client Secret" },
    { key: "sellerId", label: "Seller ID" },
    { key: "marketplaceId", label: "Marketplace ID", placeholder: "A2EUQ1WTGCTBG2" },
    { key: "region", label: "Region", placeholder: "na" },
  ],
};

const LABELS: Record<Service, string> = {
  woocommerce: "WooCommerce",
  ebay: "eBay",
  amazon: "Amazon",
};

export default function Settings() {
  const [active, setActive] = useState<Service>("woocommerce");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<Service, boolean>>({
    woocommerce: false,
    ebay: false,
    amazon: false,
  });
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const next: Record<Service, boolean> = { woocommerce: false, ebay: false, amazon: false };
        (data.settings || []).forEach((row: any) => {
          next[row.service as Service] = true;
        });
        setSaved(next);
      });
  }, []);

  useEffect(() => {
    setValues({});
    setStatus(null);
  }, [active]);

  async function save() {
    setStatus(null);
    const config: Record<string, string> = {};
    for (const field of FIELD_DEFS[active]) {
      config[field.key] = values[field.key] || "";
    }
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: active, config }),
    });
    if (res.ok) {
      setStatus("Saved.");
      setSaved((s) => ({ ...s, [active]: true }));
    } else {
      const data = await res.json();
      setStatus(`Error: ${data.error}`);
    }
  }

  return (
    <>
      <h1>Connections</h1>
      <p className="lede">
        Keys are stored server-side in Supabase, read only by this app&rsquo;s
        API routes — never sent to the browser after saving.
      </p>

      <div className="tabs">
        {(Object.keys(LABELS) as Service[]).map((s) => (
          <div
            key={s}
            className={`tab ${active === s ? "active" : ""}`}
            onClick={() => setActive(s)}
          >
            {LABELS[s]} {saved[s] ? "●" : ""}
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>{LABELS[active].toUpperCase()} CREDENTIALS</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {FIELD_DEFS[active].map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type="text"
                placeholder={field.placeholder}
                value={values[field.key] || ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field.key]: e.target.value }))
                }
              />
            </label>
          ))}
          <div className="btn-row">
            <button type="submit" className="btn">
              Save {LABELS[active]} settings
            </button>
          </div>
        </form>
        {status && (
          <div className={`status-line ${status.startsWith("Error") ? "bad" : "ok"}`}>
            {status}
          </div>
        )}
      </div>
    </>
  );
}
