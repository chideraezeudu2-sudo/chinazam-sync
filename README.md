# Chinazam Sync

Pulls product price/stock from chinazamautoparts.ca (WooCommerce) and pushes
it out to eBay and Amazon listings. Includes a control panel for triggering
syncs and entering API credentials, so keys live in Supabase instead of code.

## 1. Supabase — already done

This is wired up to your existing **Fff** Supabase project
(`https://jlrkqqlisbceeqtesknf.supabase.co`). The `connection_settings`,
`products`, `sync_logs`, and `reconcile_cursors` tables have already been
created there — you don't need to run the SQL yourself.

One thing I can't fetch for you: the **service_role** secret key (Supabase
doesn't expose it over the API for security). Grab it from:
**Supabase dashboard → Fff project → Project Settings → API → service_role
secret** — you'll paste it into Render as `SUPABASE_SERVICE_ROLE_KEY` in the
deploy step below.

Note: Fff already has unrelated tables in it (`users`, `wallets`,
`ledger_entries`, etc.) from another project — the new tables don't touch
those, but flagging it in case you'd rather this live in its own project.

## 2. Local setup (optional — only if you want to run it on your machine first)

```bash
npm install
cp .env.example .env.local   # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

Visit `http://localhost:3000/settings` and enter your credentials for each
service (see below for where to find them). Then go to `/` and click
**Pull from WooCommerce** to load your catalog, followed by **Push to eBay**
/ **Push to Amazon** once those are configured.

## 3. Getting each service's credentials

### WooCommerce
In wp-admin: **WooCommerce > Settings > Advanced > REST API > Add key**.
Give it Read/Write access. Copy the Consumer Key and Consumer Secret.

### eBay
1. Register a developer account at developer.ebay.com and create an app to
   get a **Client ID** and **Client Secret**.
2. Run through eBay's OAuth consent flow once (User Access Token flow) to get
   a long-lived **Refresh Token** scoped to `sell.inventory`. eBay's docs call
   this "Getting an OAuth token for a user."
3. Under Seller Hub > Shipping > Locations, set up a location and note its
   **Merchant Location Key**.
4. Use `EBAY_CA` as the marketplace ID for a Canadian store.

### Amazon
1. In Seller Central, go to **Apps & Services > Develop apps** and register
   an SP-API app to get your **LWA Client ID/Secret**.
2. Self-authorize the app against your own seller account to get a
   **Refresh Token**.
3. Note your **Seller ID** and marketplace ID (`A2EUQ1WTGCTBG2` for
   Amazon.ca).
4. Install the SP-API helper library before using the Amazon sync route:
   `npm install amazon-sp-api`.
5. Many auto-parts categories are gated on Amazon — apply for category
   approval in Seller Central in parallel with the technical setup, since
   that approval is usually the slower step.

## 4. Deploy to Render

1. Push this folder to a GitHub repo.
2. In Render, create a new Web Service from that repo.
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as environment
   variables in Render's dashboard (same values as your `.env.local`).
4. Once deployed, use the same `/settings` page on the live URL to enter
   credentials — they're stored in Supabase, not in Render's env vars, so
   you can update them anytime without redeploying.

## How it works

- **Pull from WooCommerce** reads all products via the WooCommerce REST API
  and upserts them into the `products` table, keyed by SKU.
- **Push to eBay / Push to Amazon** reads everything in `products` with
  stock > 0 and creates or updates the matching listing on that marketplace.
- Every run is logged in `sync_logs`, shown under "Recent activity" on the
  dashboard.
- Sync is currently triggered manually from the dashboard. To automate it,
  add a scheduled job (e.g. a Render Cron Job) that calls
  `POST /api/sync/woocommerce`, then `/api/sync/ebay` and `/api/sync/amazon`,
  on whatever interval you want.

## Not yet built (worth doing next)

- **Reverse sync**: decrementing WooCommerce stock when an item sells on
  eBay/Amazon, to avoid overselling across channels. Needs eBay/Amazon order
  webhooks or polling.
- **Fitment data** (year/make/model) for eBay Motors compatibility — improves
  visibility for auto parts listings but needs that data structured in
  WooCommerce first.
- Encryption at rest for the credentials in `connection_settings` (currently
  protected only by Supabase's row-level access via the service role key).
