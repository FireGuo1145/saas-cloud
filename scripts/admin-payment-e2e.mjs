/**
 * Exercises the site administrator mechanism and the manual payment flow.
 * Usage: node scripts/admin-payment-e2e.mjs [baseUrl]
 * The server must run with a manual payment method enabled.
 */
const base = process.argv[2] ?? "http://127.0.0.1:3003";
const admin = { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD };
const member = { username: "e2e_member", email: "e2e_member@example.com", password: process.env.E2E_MEMBER_PASSWORD };
if (!admin.username || !admin.password) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD to run this script");
if (!member.password) throw new Error("Set E2E_MEMBER_PASSWORD to run this script");

function client() {
  const jar = new Map();
  let cookie = "";
  const call = async (method, path, body, language = "zh") => {
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
  };
  return { call };
}

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
};

const root = client();
const adminCall = root.call;
const login = await adminCall("POST", "/api/auth/login", { identifier: admin.username, password: admin.password });
check("admin login", login.status === 200, String(login.status));
const me = await adminCall("GET", "/api/user/me");
check("admin flag exposed", me.data.is_admin === true, JSON.stringify(me.data).slice(0, 120));

const users = await adminCall("GET", "/api/admin/users");
check("admin lists users", users.status === 200 && users.data.users.length >= 1, `count=${users.data.users?.length}`);
check("bootstrap administrator listed", users.data.users?.some((user) => user.username === admin.username && user.is_admin), "");

// A regular member account for the payment flow.
let memberId = users.data.users?.find((user) => user.username === member.username)?.id;
if (!memberId) {
  const registered = await adminCall("POST", "/api/auth/register", member);
  if (registered.status !== 201) {
    const created = await adminCall("POST", "/api/admin/users", member);
    check("member account available", created.status < 400, JSON.stringify(created.data).slice(0, 120));
  }
}
const refreshUsers = await adminCall("GET", "/api/admin/users");
memberId = refreshUsers.data.users?.find((user) => user.username === member.username)?.id;
check("member account exists", Boolean(memberId), String(memberId));

const memberClient = client();
let memberReady = await memberClient.call("POST", "/api/auth/login", { identifier: member.username, password: member.password });
if (memberReady.status !== 200) {
  // Registration may be disabled on the site; create the account directly for the check.
  console.log("note: member login failed, member flow skipped");
}

// Non-administrators cannot use the admin endpoints.
const forbidden = await memberClient.call("GET", "/api/admin/users");
check("member blocked from admin API", forbidden.status === 401 || forbidden.status === 403, String(forbidden.status));

// Manual payment flow.
const summary = await memberClient.call("GET", "/api/billing/summary");
const methods = summary.data.methods ?? [];
check("manual methods offered", methods.some((method) => method.id === "alipay-manual" && method.imageUrl), JSON.stringify(methods.map((method) => method.id)));

const topUp = await memberClient.call("POST", "/api/billing/top-up", { amountCents: 5000, method: "alipay-manual" });
check("manual top-up returns instructions", topUp.status === 200 && topUp.data.payment?.kind === "manual", JSON.stringify(topUp.data).slice(0, 200));
const orderId = topUp.data.orderId;
check("instructions carry order reference", topUp.data.payment?.reference === orderId, topUp.data.payment?.reference);

const balanceBefore = summary.data.balanceCents;
const queueBefore = await adminCall("GET", "/api/billing/admin/orders");
check("order waits in the admin queue", queueBefore.data.orders?.some((order) => order.order_id === orderId && order.status === "pending"), "");

const submitted = await memberClient.call("POST", `/api/billing/orders/${orderId}/submit`, { note: "尾号 8888" });
check("member submits payment", submitted.status === 200 && submitted.data.order.status === "awaiting_confirm", JSON.stringify(submitted.data).slice(0, 160));

const afterSubmit = await memberClient.call("GET", "/api/billing/summary");
check("balance unchanged before confirmation", afterSubmit.data.balanceCents === balanceBefore, `${afterSubmit.data.balanceCents} vs ${balanceBefore}`);

const confirm = await adminCall("POST", `/api/billing/admin/orders/${orderId}/confirm`, { tradeNo: "TX-1001" });
check("admin confirms payment", confirm.status === 200 && confirm.data.order.status === "paid", JSON.stringify(confirm.data).slice(0, 160));

const afterConfirm = await memberClient.call("GET", "/api/billing/summary");
check("balance credited after confirmation", afterConfirm.data.balanceCents === balanceBefore + 5000, `${afterConfirm.data.balanceCents}`);

const again = await adminCall("POST", `/api/billing/admin/orders/${orderId}/confirm`, {});
check("confirmation is idempotent", again.status === 409, String(again.status));
const afterAgain = await memberClient.call("GET", "/api/billing/summary");
check("balance credited once", afterAgain.data.balanceCents === balanceBefore + 5000, `${afterAgain.data.balanceCents}`);

// Rejection path.
const second = await memberClient.call("POST", "/api/billing/top-up", { amountCents: 1200, method: "wechat-manual" });
await memberClient.call("POST", `/api/billing/orders/${second.data.orderId}/submit`, { note: "" });
const reject = await adminCall("POST", `/api/billing/admin/orders/${second.data.orderId}/reject`, {});
check("admin rejects payment", reject.status === 200 && reject.data.order.status === "rejected", JSON.stringify(reject.data).slice(0, 160));
const afterReject = await memberClient.call("GET", "/api/billing/summary");
check("rejected order is not credited", afterReject.data.balanceCents === balanceBefore + 5000, `${afterReject.data.balanceCents}`);
const resubmit = await memberClient.call("POST", `/api/billing/orders/${second.data.orderId}/submit`, { note: "重新核对" });
check("rejected order can be resubmitted", resubmit.status === 200 && resubmit.data.order.status === "awaiting_confirm", JSON.stringify(resubmit.data).slice(0, 160));

const unknownMethod = await memberClient.call("POST", "/api/billing/top-up", { amountCents: 5000, method: "does-not-exist" });
check("unknown method rejected", unknownMethod.status === 400, String(unknownMethod.status));

// Administrator rights are granted last so they do not affect the payment checks.

// Grant and revoke administrator rights.
if (memberId) {
  const grant = await adminCall("PUT", `/api/admin/users/${memberId}/admin`, { isAdmin: true });
  check("grant administrator", grant.status === 200 && grant.data.is_admin === true, JSON.stringify(grant.data));
  const granted = await memberClient.call("GET", "/api/admin/users");
  check("member sees admin API after grant", granted.status === 200, String(granted.status));
  const asAdmin = await memberClient.call("GET", "/api/billing/summary");
  check("summary reports administrator rights", asAdmin.data.isAdmin === true, JSON.stringify(asAdmin.data).slice(0, 80));
  const revoke = await adminCall("PUT", `/api/admin/users/${memberId}/admin`, { isAdmin: false });
  check("revoke administrator", revoke.status === 200 && revoke.data.is_admin === false, JSON.stringify(revoke.data));
  const revoked = await memberClient.call("GET", "/api/admin/users");
  check("member blocked after revoke", revoked.status === 403, String(revoked.status));
  const selfDemote = await adminCall("PUT", `/api/admin/users/${me.data.id}/admin`, { isAdmin: false });
  check("bootstrap administrator is protected", selfDemote.status === 400, JSON.stringify(selfDemote.data));
}

const failures = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
