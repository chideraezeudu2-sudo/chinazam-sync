// Amazon's SP-API requires LWA OAuth + AWS SigV4-signed requests. Rather than
// hand-roll that signing, this uses the community "amazon-sp-api" package,
// which is the standard way to call SP-API from Node. Run:
//   npm install amazon-sp-api
// before deploying this route.
//
// Setup you'll need once, from Seller Central > Apps & Services > Develop apps:
//   - refreshToken (from authorizing your own app against your seller account)
//   - lwaAppId / lwaClientSecret
//   - AWS access key / secret / role ARN (only if your app is not "self-authorized")
//   - sellerId, marketplaceId (e.g. A2EUQ1WTGCTBG2 for Amazon.ca)
//
// Many auto-parts categories are gated on Amazon and require approval before
// you can list in them - that approval is separate from and slower than the
// API setup itself, so it's worth applying for it in parallel.

export type AmazonSettings = {
  refreshToken: string;
  lwaAppId: string;
  lwaClientSecret: string;
  sellerId: string;
  marketplaceId: string;
  region: "na" | "eu" | "fe";
};

export type AmazonSyncItem = {
  sku: string;
  title: string;
  description: string;
  price: number;
  quantity: number;
  productType: string; // Amazon requires a specific product type per listing, e.g. "AUTO_PART"
};

export async function upsertAmazonListing(
  settings: AmazonSettings,
  item: AmazonSyncItem
) {
  // Imported dynamically so the app still builds/runs even before this
  // dependency is installed - it's only required once Amazon sync is used.
  const mod: any = await import("amazon-sp-api");
  const SellingPartnerAPI = mod.default || mod;

  const client = new SellingPartnerAPI({
    region: settings.region,
    refresh_token: settings.refreshToken,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: settings.lwaAppId,
      SELLING_PARTNER_APP_CLIENT_SECRET: settings.lwaClientSecret,
    },
  });

  // Listings Items API: one PUT creates or fully replaces a listing.
  const result = await client.callAPI({
    operation: "putListingsItem",
    endpoint: "listingsItems",
    path: {
      sellerId: settings.sellerId,
      sku: item.sku,
    },
    query: { marketplaceIds: [settings.marketplaceId] },
    body: {
      productType: item.productType,
      attributes: {
        item_name: [{ value: item.title }],
        purchasable_offer: [
          {
            currency: "CAD",
            our_price: [{ schedule: [{ value_with_tax: item.price }] }],
          },
        ],
        fulfillment_availability: [
          {
            fulfillment_channel_code: "DEFAULT",
            quantity: item.quantity,
          },
        ],
      },
    },
  });

  return result;
}

export type AmazonSoldLineItem = { sku: string; quantitySold: number; orderId: string };

// Orders API: orders placed since a given time, used by the reconciliation
// job so a sale on Amazon decrements stock everywhere else.
export async function fetchRecentAmazonOrders(
  settings: AmazonSettings,
  sinceIso: string
): Promise<AmazonSoldLineItem[]> {
  const SellingPartnerAPIMod: any = await import("amazon-sp-api");
  const SellingPartnerAPI = SellingPartnerAPIMod.default || SellingPartnerAPIMod;

  const client = new SellingPartnerAPI({
    region: settings.region,
    refresh_token: settings.refreshToken,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: settings.lwaAppId,
      SELLING_PARTNER_APP_CLIENT_SECRET: settings.lwaClientSecret,
    },
  });

  const ordersRes = await client.callAPI({
    operation: "getOrders",
    endpoint: "orders",
    query: {
      MarketplaceIds: [settings.marketplaceId],
      CreatedAfter: sinceIso,
    },
  });

  const lineItems: AmazonSoldLineItem[] = [];

  for (const order of ordersRes.Orders ?? []) {
    const itemsRes = await client.callAPI({
      operation: "getOrderItems",
      endpoint: "orders",
      path: { orderId: order.AmazonOrderId },
    });

    for (const item of itemsRes.OrderItems ?? []) {
      lineItems.push({
        sku: item.SellerSKU,
        quantitySold: Number(item.QuantityOrdered ?? 0),
        orderId: order.AmazonOrderId,
      });
    }
  }

  return lineItems;
}
