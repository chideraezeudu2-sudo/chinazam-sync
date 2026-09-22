export type EbaySettings = {
  clientId: string;
  clientSecret: string;
  refreshToken: string; // obtained once via eBay's 3-legged OAuth consent flow
  marketplaceId: string; // e.g. EBAY_CA
  merchantLocationKey: string; // set up under Sell > Inventory > Locations
};

const EBAY_API_BASE = "https://api.ebay.com";

// eBay's write APIs (Inventory, Offer) need a *user* access token, which is
// minted from the long-lived refresh token you get once via eBay's OAuth
// consent screen - not the client-credentials token used for read-only Browse calls.
async function getUserAccessToken(settings: EbaySettings): Promise<string> {
  const basicAuth = Buffer.from(
    `${settings.clientId}:${settings.clientSecret}`
  ).toString("base64");

  const res = await fetch(`${EBAY_API_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: settings.refreshToken,
      scope: "https://api.ebay.com/oauth/api_scope/sell.inventory",
    }),
  });

  if (!res.ok) {
    throw new Error(`eBay token refresh failed: ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

export type SyncItem = {
  sku: string;
  title: string;
  description: string;
  price: number;
  quantity: number;
  imageUrls: string[];
};

export async function upsertEbayListing(
  settings: EbaySettings,
  item: SyncItem
): Promise<{ offerId: string }> {
  const token = await getUserAccessToken(settings);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Content-Language": "en-CA",
  };

  // 1. Create or replace the inventory item (product data + stock level).
  const invRes = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(item.sku)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        availability: {
          shipToLocationAvailability: { quantity: item.quantity },
        },
        condition: "NEW",
        product: {
          title: item.title,
          description: item.description || item.title,
          imageUrls: item.imageUrls.slice(0, 12),
        },
      }),
    }
  );

  if (!invRes.ok) {
    throw new Error(
      `eBay inventory item upsert failed for SKU ${item.sku}: ${await invRes.text()}`
    );
  }

  // 2. Find (or create) the offer that turns that inventory item into a live listing.
  const offersRes = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(item.sku)}&marketplace_id=${settings.marketplaceId}`,
    { headers }
  );
  const offersData = offersRes.ok
    ? await offersRes.json()
    : { offers: [] };

  let offerId: string | undefined = offersData.offers?.[0]?.offerId;

  if (offerId) {
    // Update price/quantity on the existing offer.
    await fetch(`${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        pricingSummary: { price: { value: item.price, currency: "CAD" } },
        availableQuantity: item.quantity,
      }),
    });
  } else {
    const createRes = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/offer`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sku: item.sku,
        marketplaceId: settings.marketplaceId,
        format: "FIXED_PRICE",
        availableQuantity: item.quantity,
        categoryId: "6030", // Auto Parts & Accessories - adjust per part type
        listingDescription: item.description || item.title,
        pricingSummary: { price: { value: item.price, currency: "CAD" } },
        merchantLocationKey: settings.merchantLocationKey,
      }),
    });

    if (!createRes.ok) {
      throw new Error(
        `eBay offer creation failed for SKU ${item.sku}: ${await createRes.text()}`
      );
    }
    const created = await createRes.json();
    offerId = created.offerId;
  }

  if (!offerId) {
    throw new Error(`No offerId resolved for SKU ${item.sku}`);
  }

  // 3. Publish the offer so it goes live (safe to call again on an already-published offer).
  const publishRes = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/publish`,
    { method: "POST", headers }
  );

  if (!publishRes.ok) {
    const body = await publishRes.text();
    // Already-published offers return an error here that's safe to ignore.
    if (!body.includes("25002")) {
      throw new Error(`eBay publish failed for SKU ${item.sku}: ${body}`);
    }
  }

  return { offerId };
}

export type SoldLineItem = { sku: string; quantitySold: number; orderId: string };

// Sell Fulfillment API: orders placed since a given time. Used by the
// reconciliation job so a sale on eBay decrements stock everywhere else.
export async function fetchRecentEbayOrders(
  settings: EbaySettings,
  sinceIso: string
): Promise<SoldLineItem[]> {
  const token = await getUserAccessToken(settings);
  const filter = encodeURIComponent(`creationdate:[${sinceIso}..]`);
  const res = await fetch(
    `${EBAY_API_BASE}/sell/fulfillment/v1/order?filter=${filter}&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    throw new Error(`eBay order fetch failed: ${await res.text()}`);
  }

  const data = await res.json();
  const lineItems: SoldLineItem[] = [];

  for (const order of data.orders ?? []) {
    for (const item of order.lineItems ?? []) {
      lineItems.push({
        sku: item.sku,
        quantitySold: item.quantity,
        orderId: order.orderId,
      });
    }
  }

  return lineItems;
}
