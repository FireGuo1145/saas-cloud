import fs from "node:fs";

const base = "http://127.0.0.1:3001";
const jar = new Map();
let cookie = "";

function saveCookies(response) {
  for (const value of response.headers.getSetCookie?.() ?? []) {
    const [pair] = value.split(";");
    const [name, ...rest] = pair.split("=");
    jar.set(name.trim(), rest.join("=").trim());
  }
  cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function call(method, path, body, language = "zh") {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", "accept-language": language, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  saveCookies(response);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
}

const admin = { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD };
if (!admin.username || !admin.password) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD to run this script");
const login = await call("POST", "/api/auth/login", { identifier: admin.username, password: admin.password });
check("login", login.status === 200, `${login.status} ${JSON.stringify(login.data).slice(0, 160)}`);

const catalog = await call("GET", "/api/store/products");
check("catalog 200", catalog.status === 200, JSON.stringify(catalog.data).slice(0, 200));
const products = catalog.data.products ?? [];
check("rainyun product registered", products.some((product) => product.pluginId === "rainyun"), JSON.stringify(products.map((p) => p.key)));
const projects = catalog.data.projects ?? [];
check("user has a project", projects.length > 0, JSON.stringify(projects).slice(0, 160));

const projectId = projects[0]?.id;
const cartBefore = await call("GET", "/api/store/cart");
check("cart loads", cartBefore.status === 200, `items=${cartBefore.data.items?.length} subtotal=${cartBefore.data.quote?.subtotalCents}`);

for (const item of cartBefore.data.items ?? []) await call("DELETE", `/api/store/cart/${item.id}`);

const rainyun = products.find((product) => product.pluginId === "rainyun");
if (rainyun) {
  const missing = await call("POST", "/api/store/cart", { productKey: rainyun.key, projectId, quantity: 1, selections: {} });
  check("missing required options rejected", missing.status === 400 && missing.data.field === "plan", JSON.stringify(missing.data));
}

const productsForProject = await call("GET", `/api/projects/${projectId}/products`);
check("project products 200", productsForProject.status === 200, JSON.stringify(productsForProject.data).slice(0, 200));

const orders = await call("GET", "/api/store/orders");
check("orders 200", orders.status === 200, `count=${orders.data.orders?.length}`);

const emptyCheckout = await call("POST", "/api/store/checkout", { idempotencyKey: `test-${Date.now()}` });
check("empty checkout rejected", emptyCheckout.status === 400 && emptyCheckout.data.code === "STORE_EMPTY_CART", JSON.stringify(emptyCheckout.data));

const anonymous = await fetch(`${base}/api/store/products`);
check("anonymous blocked", anonymous.status === 401, String(anonymous.status));

const english = await call("GET", "/api/store/products", undefined, "en");
check("english catalog", english.status === 200);

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
process.exit(failures.length ? 1 : 0);
