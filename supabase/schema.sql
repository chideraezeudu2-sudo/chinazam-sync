-- Run this once in the Supabase SQL editor for your project.

-- One row of credentials/config per marketplace. Values live here, not in .env,
-- so Francis can update keys from the Settings page without redeploying.
create table if not exists connection_settings (
  service text primary key check (service in ('woocommerce', 'ebay', 'amazon')),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Canonical product list, sourced from WooCommerce, with the id each
-- marketplace uses once it's been listed there.
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  title text not null,
  price numeric(10, 2),
  stock_qty integer,
  woo_product_id text,
  ebay_offer_id text,
  ebay_listing_status text default 'not_listed', -- not_listed | listed | error
  amazon_sku text,
  amazon_listing_status text default 'not_listed',
  last_synced_at timestamptz,
  raw_woo jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- History of each sync run, so errors are visible from the dashboard
-- instead of only in Render logs.
create table if not exists sync_logs (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('woocommerce', 'ebay', 'amazon', 'reconcile')),
  status text not null check (status in ('success', 'error', 'partial')),
  message text,
  products_processed integer default 0,
  created_at timestamptz not null default now()
);

create index if not exists sync_logs_created_at_idx on sync_logs (created_at desc);

-- Tracks the last order timestamp already reconciled per marketplace, so the
-- reverse-sync job only looks at new orders each run.
create table if not exists reconcile_cursors (
  service text primary key check (service in ('ebay', 'amazon')),
  last_order_time timestamptz
);

alter table connection_settings enable row level security;
alter table products enable row level security;
alter table sync_logs enable row level security;
alter table reconcile_cursors enable row level security;
