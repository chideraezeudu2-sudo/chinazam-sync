import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { updateWooStock, WooSettings } from "@/lib/woocommerce";
import { fetchRecentEbayOrders, EbaySettings } from "@/lib/ebay";
import { fetchRecentAmazonOrders, AmazonSettings } from "@/lib/amazon";

// Pulls orders placed on eBay/Amazon since the last run, decrements the
// matching product's stock in Supabase and pushes the new quantity back to
// WooCommerce, so a sale on one channel doesn't get oversold on another.
export async function POST() {
  const supabase = getSupabaseAdmin();

  const { data: settingsRows } = await supabase
    .from("connection_settings")
    .select("service, config");

  const wooSettings = settingsRows?.find((r) => r.service === "woocommerce")
    ?.config as WooSettings | undefined;
  const ebaySettings = settingsRows?.find((r) => r.service === "ebay")
    ?.config as EbaySettings | undefined;
  const amazonSettings = settingsRows?.find((r) => r.service === "amazon")
    ?.config as AmazonSettings | undefined;

  if (!wooSettings) {
    return NextResponse.json(
      { error: "WooCommerce isn't configured yet - needed to write stock updates back." },
      { status: 400 }
    );
  }

  const { data: cursors } = await supabase.from("reconcile_cursors").select("*");
  const cursorFor = (service: string) =>
    cursors?.find((c) => c.service === service)?.last_order_time ||
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // first run: look back 24h

  let totalSold = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  async function applySale(sku: string, quantitySold: number, source: string) {
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("sku", sku)
      .single();

    if (!product) {
      errors.push(`${source} sold SKU ${sku} but it's not in the catalog.`);
      return;
    }

    const newQty = Math.max(0, (product.stock_qty ?? 0) - quantitySold);

    await supabase
      .from("products")
      .update({ stock_qty: newQty, updated_at: new Date().toISOString() })
      .eq("id", product.id);

    if (product.woo_product_id) {
      await updateWooStock(wooSettings, product.woo_product_id, newQty);
    }

    totalSold += quantitySold;
  }

  if (ebaySettings) {
    try {
      const sold = await fetchRecentEbayOrders(ebaySettings, cursorFor("ebay"));
      for (const item of sold) {
        if (item.sku) await applySale(item.sku, item.quantitySold, "eBay");
      }
      await supabase
        .from("reconcile_cursors")
        .upsert({ service: "ebay", last_order_time: now });
    } catch (err: any) {
      errors.push(`eBay: ${err.message}`);
    }
  }

  if (amazonSettings) {
    try {
      const sold = await fetchRecentAmazonOrders(amazonSettings, cursorFor("amazon"));
      for (const item of sold) {
        if (item.sku) await applySale(item.sku, item.quantitySold, "Amazon");
      }
      await supabase
        .from("reconcile_cursors")
        .upsert({ service: "amazon", last_order_time: now });
    } catch (err: any) {
      errors.push(`Amazon: ${err.message}`);
    }
  }

  await supabase.from("sync_logs").insert({
    service: "reconcile",
    status: errors.length === 0 ? "success" : "partial",
    products_processed: totalSold,
    message:
      errors.length > 0
        ? `${totalSold} units reconciled, ${errors.length} issue(s): ${errors.slice(0, 5).join("; ")}`
        : `${totalSold} units of stock reconciled from marketplace sales.`,
  });

  return NextResponse.json({ ok: true, totalSold, errors });
}
