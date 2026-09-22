export type WooSettings = {
  storeUrl: string; // e.g. https://chinazamautoparts.ca
  consumerKey: string;
  consumerSecret: string;
};

export type WooProduct = {
  id: number;
  sku: string;
  name: string;
  price: string;
  stock_quantity: number | null;
  status: string;
  images: { src: string }[];
  description: string;
};

// WooCommerce's REST API is Basic Auth over HTTPS: consumer key as the
// username, consumer secret as the password. Generate these under
// WooCommerce > Settings > Advanced > REST API in wp-admin.
export async function fetchAllWooProducts(
  settings: WooSettings
): Promise<WooProduct[]> {
  const { storeUrl, consumerKey, consumerSecret } = settings;
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    "base64"
  );

  const products: WooProduct[] = [];
  let page = 1;
  const perPage = 50;

  while (true) {
    const url = `${storeUrl.replace(/\/$/, "")}/wp-json/wc/v3/products?per_page=${perPage}&page=${page}`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `WooCommerce API error (${res.status}) on page ${page}: ${body}`
      );
    }

    const batch = (await res.json()) as WooProduct[];
    products.push(...batch);

    if (batch.length < perPage) break;
    page += 1;
  }

  return products;
}

// Used by the reconciliation job to push a stock decrease back to
// WooCommerce after something sells on eBay or Amazon.
export async function updateWooStock(
  settings: WooSettings,
  wooProductId: string,
  newQuantity: number
): Promise<void> {
  const { storeUrl, consumerKey, consumerSecret } = settings;
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    "base64"
  );

  const res = await fetch(
    `${storeUrl.replace(/\/$/, "")}/wp-json/wc/v3/products/${wooProductId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ stock_quantity: Math.max(0, newQuantity) }),
    }
  );

  if (!res.ok) {
    throw new Error(
      `WooCommerce stock update failed for product ${wooProductId}: ${await res.text()}`
    );
  }
}
