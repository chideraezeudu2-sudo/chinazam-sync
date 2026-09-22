import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { upsertEbayListing, EbaySettings } from "@/lib/ebay";

export async function POST() {
  const supabase = getSupabaseAdmin();

  const { data: settingsRow, error: settingsError } = await supabase
    .from("connection_settings")
    .select("config")
    .eq("service", "ebay")
    .single();

  if (settingsError || !settingsRow) {
    return NextResponse.json(
      { error: "eBay isn't configured yet. Add it under Settings." },
      { status: 400 }
    );
  }

  const settings = settingsRow.config as EbaySettings;

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
      const { offerId } = await upsertEbayListing(settings, {
        sku: product.sku,
        title: product.title,
        description: rawWoo.description || product.title,
        price: Number(product.price ?? 0),
        quantity: product.stock_qty ?? 0,
        imageUrls: (rawWoo.images || []).map((img: any) => img.src),
      });

      await supabase
        .from("products")
        .update({
          ebay_offer_id: offerId,
          ebay_listing_status: "listed",
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", product.id);

      processed += 1;
    } catch (err: any) {
      errors.push(`${product.sku}: ${err.message}`);
      await supabase
        .from("products")
        .update({ ebay_listing_status: "error" })
        .eq("id", product.id);
    }
  }

  await supabase.from("sync_logs").insert({
    service: "ebay",
    status: errors.length === 0 ? "success" : "partial",
    products_processed: processed,
    message:
      errors.length > 0
        ? `${processed} synced, ${errors.length} failed: ${errors.slice(0, 5).join("; ")}`
        : `${processed} listings synced to eBay.`,
  });

  return NextResponse.json({ ok: true, processed, errors });
}
