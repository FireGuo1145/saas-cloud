# Selling products through the store

`@mirelia/store` owns the customer-facing shop: catalog, cart, checkout, orders and
delivery. Provider plugins such as `@mirelia/rainyun` never build their own
checkout; they register products and a delivery handler, and the store charges
the buyer's balance, records the order and asks the provider to create the
resource.

Add `@mirelia/store` to the provider's dependencies and use the `store` component:

```ts
import type { StoreService } from "@mirelia/store";

export const depend = ["store", ...];

export async function apply(ctx: Context) {
  const store = ctx.component.store as StoreService;
}
```

## Registering a product

```ts
store.registerProduct("my-provider", {
  id: "gpu-a10",                     // stable provider id, unique per plugin
  name: "A10 GPU worker",
  summary: "24 GB VRAM, billed monthly",
  provider: "my-provider",
  category: "server",                // grouping in the catalog
  priceCents: 19900,                 // recurring unit price per period
  period: "month",                   // "month" | "year" | "one-time"
  quantity: "select",                // "fixed" | "select"
  minQuantity: 1,
  maxQuantity: 6,
  highlights: ["24 GB VRAM", "2 vCPU"],
  sortOrder: 10,
  available: true,
  repeatable: true,                  // false: block buying again once fulfilled
  fields: [                          // options the buyer picks before buying
    { key: "region", label: "Region", required: true, options: [
      { value: "cn-hk", label: "Hong Kong" },
      { value: "us-west", label: "US West", priceCents: 500 },
    ] },
  ],
});
```

`registerProduct` returns an unsubscribe function and is cleaned up with the
plugin context. Option prices are added to the unit price; option `disabled`
marks sold-out choices. Options can also be a function that receives the
selections already made, which lets dependent fields — for example the operating
systems of a chosen plan — resolve against live provider data:

```ts
{ key: "os", label: "Operating system", required: true,
  options: async (selections) => (await osTemplates(Number(selections.plan))).map((os) => ({ value: String(os.id), label: os.name })) }
```

Prices and options are resolved on every catalog, cart and checkout request, so
stock and price changes are reflected immediately. Registering the same product
id again replaces the previous definition.

## Delivering an order

```ts
store.registerPurchaseHandler("my-provider", async (request) => {
  // request: { user, tenant, project, selections, quantity, idempotencyKey }
  const created = await createServer(request.selections.region, request.quantity);
  return {
    name: created.hostname,                 // shown in the project product list
    resourceId: String(created.id),         // provider-side id
    status: "active",
    attributes: { ipv4: created.ipv4, expiresAt: created.expiresAt },
  };
});
```

The handler runs once the order has been paid, inside a per-user lock. The store
then records the product in the target project through
`ProjectService.addProduct`, so it appears under *Project → Products* next to
the provider's own management page. If a handler throws, that order line is
marked `failed` and its amount is refunded to the balance; the buyer can retry
from the orders page. Handlers should therefore be idempotent and rely on the
provider's own dedupe where possible.

## What the store provides

| API | Purpose |
| --- | --- |
| `GET /api/store/products` | Catalog with resolved options plus the projects the user may buy into |
| `GET /api/store/cart` | Cart items and a re-priced quote |
| `POST /api/store/cart` | Add `{ productKey: "<plugin>:<product>", projectId, quantity, selections }` |
| `PUT /api/store/cart/:id` | Change quantity, project or selections |
| `DELETE /api/store/cart/:id` | Remove a line |
| `POST /api/store/checkout` | Charge the balance, create the order and deliver products |
| `GET /api/store/orders` | The user's orders with line-level delivery state |
| `GET /api/store/orders/:orderId` | Refresh and retry delivery of one order |

A cart line is only purchasable when the product is available, its selections
still validate, the user can manage products in the chosen project and the
balance covers the subtotal. Checkout is idempotent through the `idempotencyKey`
sent by the browser.

## Billing

The store debits `billing` with the ledger reference `store-order:<orderId>` and
refunds individual lines with `refund:store-order:<orderId>:<random>`, so the
ledger stays the single source of truth for money. Top-ups remain in the
`billing` plugin.
