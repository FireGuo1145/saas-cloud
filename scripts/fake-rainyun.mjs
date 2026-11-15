/**
 * Local Rainyun API stand-in used by `scripts/store-e2e.mjs`.
 * Start it with `node scripts/fake-rainyun.mjs` and point `@mirelia/rainyun.apiBaseUrl`
 * at http://127.0.0.1:4555 to exercise purchase and delivery without real credentials.
 */
import http from "node:http";

let nextInstance = 8001;
const instances = new Map();

const plans = [
  { id: 1, plan_name: "RCS-S", chinese: "标准型 S", region: "cn_hk", machine: "hk-1", price: 15, cpu: 1, memory: 1024, disk: 20, net_out: 30, available_stock: 5, is_selling: true, ip_prices: { eipv4: 1 } },
  { id: 2, plan_name: "RCS-S", chinese: "标准型 S", region: "us_ca", machine: "ca-1", price: 12, cpu: 1, memory: 1024, disk: 20, net_out: 30, available_stock: 0, is_selling: true, ip_prices: { eipv4: 1 } },
  { id: 3, plan_name: "RCS-M", chinese: "标准型 M", region: "cn_hk", machine: "hk-2", price: 30, cpu: 2, memory: 2048, disk: 40, net_out: 60, available_stock: 3, is_selling: true, ip_prices: { eipv4: 1 } },
  { id: 4, plan_name: "RCS-X", chinese: "已下架", region: "cn_hk", machine: "hk-3", price: 99, cpu: 8, memory: 8192, disk: 80, net_out: 100, available_stock: 1, is_selling: false, ip_prices: {} },
];

const operatingSystems = [
  { id: 10, name: "ubuntu-24.04", chinese_name: "Ubuntu 24.04", os_type: "linux", region: "", is_available: true },
  { id: 11, name: "windows-2022", chinese_name: "Windows Server 2022", os_type: "windows", region: "", is_available: true },
  { id: 12, name: "legacy", chinese_name: "Legacy", os_type: "linux", region: "", is_available: false },
];

const server = http.createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    const url = new URL(request.url, "http://127.0.0.1");
    const send = (status, data) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ Code: 200, Data: data }));
    };
    if (request.method === "GET" && url.pathname === "/product/rcs/plans") return send(200, plans);
    if (request.method === "GET" && url.pathname === "/product/rcs/os-templates") return send(200, operatingSystems);
    if (request.method === "POST" && url.pathname === "/product/rcs/") {
      const payload = JSON.parse(body || "{}");
      const plan = plans.find((item) => item.id === Number(payload.plan_id));
      if (!plan || plan.available_stock < 1) return send(400, { error: "sold out" });
      plan.available_stock -= 1;
      const id = nextInstance++;
      const instance = { ID: id, HostName: `RCS-${id}`, MainIPv4: `10.0.${Math.floor(id / 250)}.${id % 250}`, Status: "running", Node: plan.machine, CPU: plan.cpu, Memory: plan.memory, Disk: plan.disk, ExpDate: new Date(Date.now() + 30 * 86400000).toISOString() };
      instances.set(id, instance);
      return send(200, instance);
    }
    if (request.method === "GET" && url.pathname === "/product/rcs/") return send(200, [...instances.values()]);
    const renewPrice = url.pathname.match(/^\/product\/rcs\/(\d+)\/renew\/price$/);
    if (request.method === "GET" && renewPrice) {
      const days = Number(url.searchParams.get("day") ?? 30);
      return send(200, { price: Number((days * 0.5).toFixed(2)) });
    }
    const renew = url.pathname.match(/^\/product\/rcs\/(\d+)\/renew$/);
    if (request.method === "POST" && renew) return send(200, { ok: true });
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });
});
server.listen(4555, "127.0.0.1", () => console.log("fake rainyun on 4555"));
