/**
 * Checks the type → variant → spec flow: types come from plugins, variants from the
 * type plugin, the administrator publishes a spec for one variant and the store sells it.
 * Usage: node scripts/instances-variants-e2e.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://127.0.0.1:3011";
const credentials = { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD };
if (!credentials.username || !credentials.password) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD");
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

await call("POST", "/api/auth/login", { identifier: credentials.username, password: credentials.password });
const types = (await call("GET", "/api/instances/types")).data.types ?? [];
const minecraft = types.find((type) => type.id === "minecraft");
const shell = types.find((type) => type.id === "shell");
check("minecraft type listed", Boolean(minecraft), JSON.stringify(types.map((type) => type.id)));
check("minecraft exposes software variants", (minecraft?.variants?.length ?? 0) > 4, `${minecraft?.variants?.length} variants`);
check("variants carry version parameters", minecraft?.variants?.some((variant) => variant.parameters?.software && variant.parameters?.version), JSON.stringify(minecraft?.variants?.[0]));
check("shell type listed", Boolean(shell), shell?.tagline);
check("shell offers templates", (shell?.variants?.length ?? 0) >= 3, JSON.stringify(shell?.variants?.map((v) => v.title)));

// admin creates a spec for a specific variant
const variant = minecraft.variants.find((entry) => entry.parameters?.software === "paper") ?? minecraft.variants[0];
const created = await call("POST", "/api/instances/admin/specs", { type_id: "minecraft", variant_id: variant.id, name: `Paper 入门 ${Date.now()}`, cpu: 2, memory_mb: 2048, disk_gb: 20, price_cents: 3000 });
check("spec bound to a variant", created.status === 201 && created.data.spec.variant_id === variant.id, JSON.stringify(created.data).slice(0, 160));

const badVariant = await call("POST", "/api/instances/admin/specs", { type_id: "minecraft", variant_id: "does-not-exist", name: "bad", cpu: 1, memory_mb: 512, disk_gb: 5, price_cents: 100 });
check("unknown variant refused", badVariant.status === 400, String(badVariant.status));

// store lists the variant option and prices the spec
const catalog = (await call("GET", "/api/store/products")).data.products ?? [];
const product = catalog.find((entry) => entry.key === "server-instances:type-minecraft");
const variantField = product?.fields?.find((field) => field.key === "variant");
check("store offers variants", Boolean(variantField) && variantField.options.length > 4, `${variantField?.options?.length} options`);

// buy through the variant
const project = (await call("GET", "/api/store/products")).data.projects[0];
for (const item of (await call("GET", "/api/store/cart")).data.items) await call("DELETE", `/api/store/cart/${item.id}`);
const added = await call("POST", "/api/store/cart", { productKey: "server-instances:type-minecraft", projectId: project.id, quantity: 1, selections: { spec: String(created.data.spec.id), variant: variant.id } });
check("cart accepts type + variant", added.status === 201, JSON.stringify(added.data).slice(0, 160));
const checkout = await call("POST", "/api/store/checkout", { idempotencyKey: `variant-${Date.now()}` });
check("checkout fulfils", checkout.data.order?.status === "fulfilled", JSON.stringify(checkout.data).slice(0, 160));
const instance = (await call("GET", "/api/instances")).data.instances?.[0];
check("instance records its variant", instance?.variant_id === variant.id, `${instance?.variant_id} vs ${variant.id}`);

// shell type can be bought too
const shellSpec = await call("POST", "/api/instances/admin/specs", { type_id: "shell", variant_id: "blank", name: `Shell ${Date.now()}`, cpu: 1, memory_mb: 512, disk_gb: 5, price_cents: 500 });
check("shell spec created", shellSpec.status === 201, JSON.stringify(shellSpec.data).slice(0, 160));
const shellProduct = (await call("GET", "/api/store/products")).data.products?.find((entry) => entry.key === "server-instances:type-shell");
check("shell published to the store", Boolean(shellProduct), JSON.stringify((await call("GET", "/api/store/products")).data.products?.map((p) => p.key)));
const shellCart = await call("POST", "/api/store/cart", { productKey: "server-instances:type-shell", projectId: project.id, quantity: 1, selections: { spec: String(shellSpec.data.spec.id), variant: "blank" } });
check("shell cart accepted", shellCart.status === 201, JSON.stringify(shellCart.data).slice(0, 140));
const shellCheckout = await call("POST", "/api/store/checkout", { idempotencyKey: `shell-${Date.now()}` });
check("shell checkout fulfils", shellCheckout.data.order?.status === "fulfilled", JSON.stringify(shellCheckout.data).slice(0, 160));

const failures = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
