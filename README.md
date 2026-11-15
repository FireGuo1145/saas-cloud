# Mirelia SaaS Cloud

Mirelia Cloud is a Yumeri plugin workspace for a multi-tenant SaaS platform.
It follows the Veloce Lab model: the HTTP server, API routes, services, and
frontend extensions are loaded by the same plugin graph. Development embeds a
Vite module graph into the Yumeri server; production serves the Dashboard shell
and loads plugin bundles from its manifest.

## Initial packages

```text
database-core  SQL database contract and shared SqlDatabase implementation
sqlite         local development driver
pgsql          PostgreSQL driver for SaaS deployments
dashboard      application shell, plugin manifest, shared React runtime, shadcn UI
user           account domain: users, password credentials, sessions, profile API
tenant         tenants, memberships, tenant context, personal workspace creation
auth           login/register policy, auth routes, session gate, login UI
project        workspace-scoped projects, reusable custom field groups, project products
billing        account balance ledger, top-up orders, YiPay adapter
store          product catalog, cart, checkout, order delivery to projects
rainyun        Rainyun API client; sells servers through the store
```

The dependency direction is deliberate:

```text
database driver -> database-core
user            -> database-core, dashboard
tenant          -> user, database-core, dashboard
auth            -> user, dashboard
project         -> tenant, user, database-core, dashboard
billing         -> auth, user, dashboard
store           -> billing, project, tenant, user, dashboard
rainyun         -> store, project, billing, database-core, dashboard
```

The store is the single checkout for every plugin. Sellers register products and
a delivery handler; buyers pick a project, add products to the cart and pay from
their account balance. After payment the store hands each order line to the
selling plugin, which creates the resource, and records it as a project product
so it shows up under *Project → Products*. See
[`packages/store/SELLING.md`](packages/store/SELLING.md).

`user` is the account authority. Other plugins use its `UserService` rather than
reading the users table directly. A successful registration emits
`user:registered`; `tenant` consumes it to create the user's first workspace.
Projects are isolated by the current tenant. Their base identity is stored on
the project record; tenant-level field groups and typed field definitions are
reused across projects while values stay project-specific.

The shared UI lives in `packages/dashboard/frontend/components/ui` and is
initialized with shadcn preset `b27GcrRo`, base `aria`, and the neutral Rhea
style. Plugin pages import `Button`, `Input`, `Label`, `Card`, and future UI
components from `@mirelia/dashboard/frontend`. Business packages do not add a
second theme stylesheet or use native form controls directly.

Run `yarn build` to build every package. Copy `yumeri.example.json` to
`yumeri.json`, then run `yarn dev` to start Yumeri with the TypeScript loader.

## Instance panel (JPGPanel)

The server instance panel lives in its own repository, `panels/JPGPanel` (linked
into this workspace through the `panels/*/packages/*` workspace glob):

* `@jpgpanel/server-instances` — the framework. Plugins register instance types
  (`ctx.component.instances.registerType`); administrators define specifications
  (CPU, memory, disk, price) in *Administration → Instance specifications*, which
  are published to the store automatically; a paid order provisions the instance
  and assigns it to the buyer, with start/stop, a streamed console and a terminal.
* `@jpgpanel/mc-instance` — a reference instance type that sells Minecraft servers,
  including EULA handling and quick configuration of `server.properties`.

See [`panels/JPGPanel/README.md`](panels/JPGPanel/README.md).

## Site administrators

`user` owns site administration. The account configured below is the bootstrap
administrator; it can never be demoted and the last remaining administrator
cannot be removed. Every other account can be promoted or demoted from
*Administration → Users* (`/admin/users`, API `/api/admin/users`).

Other plugins check rights through `ctx.component.user.requireAdmin(session)` or
`ctx.component.user.isAdmin(user)`, and hide administrator navigation with the
`visible` rule on a dashboard navigation item.

## Payments

`billing` charges the account balance and exposes a payment adapter registry.
Two adapters ship with the workspace:

* `epay` — redirects to a YiPay (易支付) gateway and credits the order from a
  signed notification.
* `manual` — manual transfers. Configure the payment text and the payment
  method images in `yumeri.json`:

```json
"@mirelia/billing": {
  "manual": {
    "enabled": true,
    "instructions": "请向支付宝 13800000000（张三）转账 ¥{amount}，备注订单号 {orderId}。",
    "methods": [
      { "id": "alipay-manual", "label": "支付宝转账", "description": "工作日 10:00-18:00 人工确认", "imageUrl": "/api/static/asset/pay/alipay.png" },
      { "id": "wechat-manual", "label": "微信转账", "imageUrl": "https://example.com/wechat.png" }
    ]
  }
}
```

`{amount}` and `{orderId}` are replaced per order. The user pays out of band and
presses *I have paid*: the order moves to **awaiting confirmation** without any
balance change. An administrator confirms it in *Administration → Payments*
(`/admin/payments`), which credits the balance exactly once, or rejects it,
which returns the order to the user for another attempt.

Plugins can add their own method with `billing.registerAdapter(adapter)`; see
`BillingPaymentAdapter` in `packages/billing/src/index.ts`.

## Administrator account

Set `adminUsername` and `adminPassword` in the `@mirelia/user` section of
`yumeri.json` to create the initial administrator. The password must contain at
least 12 characters and at most 72 UTF-8 bytes. `adminEmail` is optional; when
omitted, the account uses `<username>@localhost.localdomain`. Keep the configured password
in your local `yumeri.json`, which is ignored by Git. On startup, the configured
account is promoted to administrator and its password is synchronized; changing
the password revokes that account's existing sessions.
