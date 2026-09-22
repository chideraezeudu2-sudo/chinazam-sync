import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchAllWooProducts, WooSettings } from "@/lib/woocommerce";

export async function POST() {
  const supabase = getSupabaseAdmin();

  const { data: settingsRow, error: settingsError } = await supabase
    .from("connection_settings")
    .select("config")
    .eq("service", "woocommerce")
    .single();

  if (settingsError || !settingsRow) {
    return NextResponse.json(
      { error: "WooCommerce isn't configured yet. Add it under Settings." },
      { status: 400 }
    );
  }

  const settings = settingsRow.config as WooSettings;

  try {
    const wooProducts = await fetchAllWooProducts(settings);

    for (const p of wooProducts) {
      if (!p.sku) continue; // skip products without a SKU - nothing to key the sync on
      await supabase.from("products").upsert(
        {
          sku: p.sku,
          title: p.name,
          price: p.price ? Number(p.price) : null,
          stock_qty: p.stock_quantity,
          woo_product_id: String(p.id),
          raw_woo: p,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "sku" }
      );
    }

    await supabase.from("sync_logs").insert({
      service: "woocommerce",
      status: "success",
      products_processed: wooProducts.length,
      message: `Pulled ${wooProducts.length} products from WooCommerce.`,
    });

    return NextResponse.json({ ok: true, count: wooProducts.length });
  } catch (err: any) {
    await supabase.from("sync_logs").insert({
      service: "woocommerce",
      status: "error",
      message: err.message,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
