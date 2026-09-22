import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseAdmin();

  const [{ data: products, error: productsError }, { data: logs, error: logsError }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "sku, title, price, stock_qty, ebay_listing_status, amazon_listing_status, last_synced_at"
        )
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("sync_logs")
        .select("service, status, message, products_processed, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  if (productsError || logsError) {
    return NextResponse.json(
      { error: productsError?.message || logsError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ products, logs });
}
