import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { upsertAmazonListing, AmazonSettings } from "@/lib/amazon";

export async function POST() {
  const supabase = getSupabaseAdmin();

  const { data: settingsRow, error: settingsError } = await supabase
    .from("connection_settings")
    .select("config")
    .eq("service", "amazon")
    .single();

  if (settingsError || !settingsRow) {
    return NextResponse.json(
      { error: "Amazon isn't configured yet. Add it under Settings." },
      { status: 400 }
    );
  }

  const settings = settingsRow.config as AmazonSettings;

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("*")
    .gt("stock_qty", 0);

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }

  let processed = 0;
  const errors: string[] = [];

  for (const product of products ?? []) {
    try {
      const rawWoo = product.raw_woo || {};
      await upsertAmazonListing(settings, {
        sku: product.sku,
        title: product.title,
        description: rawWoo.description || product.title,
        price: Number(product.price ?? 0),
        quantity: product.stock_qty ?? 0,
        productType: "AUTO_PART",
      });

      await supabase
        .from("products")
        .update({
          amazon_sku: product.sku,
          amazon_listing_status: "listed",
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", product.id);

      processed += 1;
    } catch (err: any) {
      errors.push(`${product.sku}: ${err.message}`);
      await supabase
        .from("products")
        .update({ amazon_listing_status: "error" })
        .eq("id", product.id);
    }
  }

  await supabase.from("sync_logs").insert({
    service: "amazon",
    status: errors.length === 0 ? "success" : "partial",
    products_processed: processed,
    message:
      errors.length > 0
        ? `${processed} synced, ${errors.length} failed: ${errors.slice(0, 5).join("; ")}`
        : `${processed} listings synced to Amazon.`,
  });

  return NextResponse.json({ ok: true, processed, errors });
}
