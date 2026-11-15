/**
 * End-to-end check of the store flow against a running dev server:
 * catalog -> cart -> checkout -> delivery -> project products.
 * Requires `scripts/fake-rainyun.mjs`, a seeded balance and `@mirelia/rainyun`
 * pointed at the fake API. Usage: node scripts/store-e2e.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://127.0.0.1:3002";
const jar = new Map();
let cookie = "";

async function call(method, path, body, language = "zh") {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", "accept-language": language, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const value of response.headers.getSetCookie?.() ?? []) {
    const [pair] = value.split(";");
    const [name, ...rest] = pair.split("=");
    jar.set(name.trim(), rest.join("=").trim());
  }
  cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
}

const admin = { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD };
if (!admin.username || !admin.password) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD to run this script");
await call("POST", "/api/auth/login", { identifier: admin.username, password: admin.password });

for (const item of (await call("GET", "/api/store/cart")).data.items) await call("DELETE", `/api/store/cart/${item.id}`);

const catalog = await call("GET", "/api/store/products");
const project = catalog.data.projects[0];
const product = catalog.data.products.find((item) => item.pluginId === "rainyun");
check("catalog has rainyun product and a project", Boolean(product && project), project?.name);

const plan = product.fields.find((field) => field.key === "plan").options.find((option) => !option.disabled);
const selection = { plan: plan.value, os: "10", duration: "1" };
const added = await call("POST", "/api/store/cart", { productKey: product.key, projectId: project.id, quantity: 1, selections: selection });
check("cart accepts rainyun selection", added.status === 201 && added.data.items.length === 1, JSON.stringify(added.data.quote?.lines?.[0]?.problem ?? ""));

const quote = added.data.quote;
const expected = (1500 + 100) /* plan 15 + ipv4 1 */;
check("quote prices the plan and IPv4", quote.subtotalCents === expected, `${quote.subtotalCents} vs ${expected} balance=${quote.balanceCents}`);
check("quote can check out", quote.options.canCheckout, JSON.stringify(quote.options.problems));

const balanceBefore = quote.balanceCents;
const key = `e2e-${Date.now()}`;
const checkout = await call("POST", "/api/store/checkout", { idempotencyKey: key });
check("checkout succeeds", checkout.status === 201, JSON.stringify(checkout.data).slice(0, 260));
check("order fulfilled", checkout.data.order?.status === "fulfilled", checkout.data.order?.status);
check("order total matches quote", checkout.data.order?.total_cents === expected);

const repeat = await call("POST", "/api/store/checkout", { idempotencyKey: key });
check("checkout is idempotent", repeat.data.order?.order_id === checkout.data.order?.order_id);

const cartAfter = await call("GET", "/api/store/cart");
check("cart emptied after checkout", cartAfter.data.items.length === 0);
check("balance debited once", cartAfter.data.quote.balanceCents === balanceBefore - expected, `${cartAfter.data.quote.balanceCents} vs ${balanceBefore - expected}`);

const products = await call("GET", `/api/projects/${project.id}/products`);
const delivered = (products.data.products ?? []).find((item) => item.order_id === checkout.data.order.order_id);
check("product added to project", Boolean(delivered), JSON.stringify(products.data.products?.slice(0, 2)));

const renewal = await call("GET", `/api/projects/${project.id}/rainyun/renewal-options`);
check("renewal options list the server", (renewal.data.servers ?? []).some((server) => String(server.instanceId) === delivered?.resource_id), JSON.stringify(renewal.data).slice(0, 200));
if (renewal.data.servers?.length) {
  const renewQuote = await call("GET", `/api/projects/${project.id}/rainyun/renewal-quote?instanceId=${renewal.data.servers[0].instanceId}&days=30`);
  check("renewal quote available", renewQuote.data.available === true, JSON.stringify(renewQuote.data));
}

const orders = await call("GET", "/api/store/orders");
check("order history lists the order", (orders.data.orders ?? []).some((order) => order.order_id === checkout.data.order?.order_id));

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
process.exit(failures.length ? 1 : 0);
