/**
 * Exercises the instance framework: type registration, administrator specs,
 * store publication, purchase -> instance creation, terminal and power control.
 * Usage: node scripts/instances-e2e.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://127.0.0.1:3004";
const jar = new Map();
let cookie = "";
async function call(method, path, body) {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "accept-language": "zh", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const value of response.headers.getSetCookie?.() ?? []) { const [pair] = value.split(";"); const [name, ...rest] = pair.split("="); jar.set(name.trim(), rest.join("=").trim()); }
  cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`); };

const admin = { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD };
if (!admin.username || !admin.password) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD to run this script");
await call("POST", "/api/auth/login", { identifier: admin.username, password: admin.password });
const me = await call("GET", "/api/user/me");

// 1. mc-instance registered its type through the framework.
const types = await call("GET", "/api/instances/types");
const minecraft = types.data.types?.find((type) => type.id === "minecraft");
check("minecraft type registered", Boolean(minecraft && minecraft.pluginId === "mc-instance"), JSON.stringify(types.data.types?.map((type) => type.id)));
check("type exposes extra routes", (minecraft?.routeCount ?? 0) >= 3, String(minecraft?.routeCount));

// 2. administrator defines a spec, which is published to the store.
const created = await call("POST", "/api/instances/admin/specs", { type_id: "minecraft", name: "MC 入门", cpu: 2, memory_mb: 2048, disk_gb: 20, price_cents: 2500, description: "2 核 2G" });
check("spec created", created.status === 201, JSON.stringify(created.data).slice(0, 200));
const specId = created.data.spec?.id;
const catalog = await call("GET", "/api/store/products");
const product = catalog.data.products?.find((item) => item.key === "server-instances:type-minecraft");
check("spec published to store", Boolean(product), JSON.stringify(catalog.data.products?.map((item) => item.key)));
check("spec is a store option", product?.fields?.find((field) => field.key === "spec")?.options?.some((option) => option.value === String(specId)), "");

// 3. buy it: the store checkout must provision an instance for the buyer.
const project = catalog.data.projects?.[0];
const balance = (await call("GET", "/api/billing/summary")).data.balanceCents;
if (balance < 2500) {
  const order = await call("POST", "/api/billing/top-up", { amountCents: 5000, method: me.data.is_admin ? "alipay" : "alipay" });
  console.log("top-up:", order.status, JSON.stringify(order.data).slice(0, 80));
}
for (const item of (await call("GET", "/api/store/cart")).data.items) await call("DELETE", `/api/store/cart/${item.id}`);
const added = await call("POST", "/api/store/cart", { productKey: "server-instances:type-minecraft", projectId: project.id, quantity: 1, selections: { spec: String(specId), edition: "paper", version: "1.21.4" } });
check("cart accepts the instance product", added.status === 201, JSON.stringify(added.data).slice(0, 160));
const checkout = await call("POST", "/api/store/checkout", { idempotencyKey: `instances-${Date.now()}` });
check("checkout fulfilled", checkout.data.order?.status === "fulfilled", JSON.stringify(checkout.data).slice(0, 200));

const mine = await call("GET", "/api/instances");
const instance = mine.data.instances?.[0];
check("instance assigned to buyer", Boolean(instance), JSON.stringify(mine.data.instances?.map((item) => item.instance_id)));
check("instance uses the spec", instance?.spec_id === specId, String(instance?.spec_id));

// 4. the type's own routes work against the assigned instance.
const config = await call("GET", `/api/instances/${instance.instance_id}/type/config`);
check("type config endpoint", config.status === 200 && config.data.config?.serverType === "paper", JSON.stringify(config.data).slice(0, 160));
const saved = await call("PUT", `/api/instances/${instance.instance_id}/type/config`, { motd: "Hello JPGPanel", max_players: 30 });
check("type config saved", saved.data.config?.motd === "Hello JPGPanel" && saved.data.config?.maxPlayers === 30, JSON.stringify(saved.data.config));

// 5. starting requires the EULA, which the type enforces through the power hook.
const blocked = await call("POST", `/api/instances/${instance.instance_id}/power`, { action: "start" });
check("start blocked before EULA", blocked.status === 502, JSON.stringify(blocked.data).slice(0, 160));
const eula = await call("POST", `/api/instances/${instance.instance_id}/type/eula`, { accept: true });
check("eula accepted", eula.data.accepted === true, JSON.stringify(eula.data));

// 6. console history endpoint answers.
const consoleHistory = await call("GET", `/api/instances/${instance.instance_id}/console`);
check("console history", consoleHistory.status === 200 && Array.isArray(consoleHistory.data.lines), JSON.stringify(consoleHistory.data).slice(0, 120));

// 7. spec lifecycle: cannot delete a spec that is in use.
const blockedDelete = await call("DELETE", `/api/instances/admin/specs/${specId}`);
check("spec in use is protected", blockedDelete.status === 409, String(blockedDelete.status));
const disabled = await call("PUT", `/api/instances/admin/specs/${specId}`, { enabled: false });
check("spec can be unpublished", disabled.data.spec?.enabled === false, JSON.stringify(disabled.data).slice(0, 120));

const failures = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
