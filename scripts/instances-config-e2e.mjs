/**
 * Buys a Minecraft instance, then exercises the configuration API, the file manager and
 * backups. Usage: node scripts/instances-config-e2e.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://127.0.0.1:3010";
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
const catalog = await call("GET", "/api/store/products");
const project = catalog.data.projects[0];
const spec = (await call("POST", "/api/instances/admin/specs", { type_id: "minecraft", name: `MC ${Date.now()}`, cpu: 2, memory_mb: 2048, disk_gb: 20, price_cents: 100 })).data.spec;
await call("GET", "/api/billing/summary");
for (const item of (await call("GET", "/api/store/cart")).data.items) await call("DELETE", `/api/store/cart/${item.id}`);
const added = await call("POST", "/api/store/cart", { productKey: "server-instances:type-minecraft", projectId: project.id, quantity: 1, selections: { spec: String(spec.id), serverType: "paper", version: "1.21.4" } });
check("cart accepts the minecraft product", added.status === 201, JSON.stringify(added.data).slice(0, 120));
const checkout = await call("POST", "/api/store/checkout", { idempotencyKey: `cfg-${Date.now()}` });
check("checkout fulfils", checkout.data.order?.status === "fulfilled", JSON.stringify(checkout.data).slice(0, 200));
const instance = (await call("GET", "/api/instances")).data.instances[0];
check("instance created", Boolean(instance));

const config = await call("GET", `/api/instances/${instance.instance_id}/config`);
check("config schema served", (config.data.schema?.sections?.length ?? 0) === 5, JSON.stringify(Object.keys(config.data.schema ?? {})));
check("defaults merged", config.data.values?.serverType === "paper" && config.data.values?.maxPlayers === 20, JSON.stringify(config.data.values ?? {}).slice(0, 160));

const invalid = await call("PUT", `/api/instances/${instance.instance_id}/config`, { maxPlayers: 5000 });
check("validation rejects out of range values", invalid.status === 400 && Array.isArray(invalid.data.issues), JSON.stringify(invalid.data).slice(0, 160));

const saved = await call("PUT", `/api/instances/${instance.instance_id}/config`, {
  motd: "JPGPanel test", maxPlayers: 42, difficulty: "hard", enableRcon: true, rconPassword: "secret123", viewDistance: 6, pvp: false, autoBackupHours: 2,
});
check("config saved", saved.status === 200 && saved.data.values?.maxPlayers === 42, JSON.stringify(saved.data).slice(0, 200));
check("summary reflects the software", String(saved.data.summary ?? "").includes("paper"), saved.data.summary);

const files = await call("GET", `/api/instances/${instance.instance_id}/files`);
check("file listing", files.status === 200 && files.data.entries.some((entry) => entry.name === "server" && entry.directory), JSON.stringify(files.data.entries?.map((e) => e.name)));
const properties = await call("GET", `/api/instances/${instance.instance_id}/files?path=server/server.properties&file=1`);
check("server.properties readable", properties.status === 200 && properties.data.content.includes("max-players=42"), properties.data.content?.slice(0, 120));
check("properties carry rcon settings", properties.data.content?.includes("enable-rcon=true"));
const edited = await call("PUT", `/api/instances/${instance.instance_id}/files`, { path: "server/ops.json", content: '[{"uuid":"x","name":"FireGuo","level":4}]' });
check("file editable", edited.status === 200, JSON.stringify(edited.data));
const escape = await call("GET", `/api/instances/${instance.instance_id}/files?path=../../etc/passwd&file=1`);
check("path traversal refused", escape.status === 404 || escape.status === 400, String(escape.status));
const created = await call("POST", `/api/instances/${instance.instance_id}/files`, { action: "mkdir", path: "plugins" });
check("folder created", created.status === 201, String(created.status));
const touched = await call("POST", `/api/instances/${instance.instance_id}/files`, { action: "touch", path: "plugins/test.jar" });
check("file created", touched.status === 201, String(touched.status));

const backup = await call("POST", `/api/instances/${instance.instance_id}/backups`, {});
check("backup created", backup.status === 201 && backup.data.backups?.length >= 1, JSON.stringify(backup.data).slice(0, 160));
const backups = await call("GET", `/api/instances/${instance.instance_id}/backups`);
check("backup listed", backups.data.backups?.length >= 1);
const restored = await call("POST", `/api/instances/${instance.instance_id}/backups/${encodeURIComponent(backups.data.backups[0].id)}/restore`, {});
check("backup restored", restored.status === 200, JSON.stringify(restored.data).slice(0, 160));

const downloads = await call("GET", `/api/instances/${instance.instance_id}/downloads?source=vanilla`);
check("download source lists versions", downloads.status === 200 && downloads.data.files?.length > 0, String(downloads.data.files?.length));

const failures = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
