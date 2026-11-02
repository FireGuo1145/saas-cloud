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
```

The dependency direction is deliberate:

```text
database driver -> database-core
user            -> database-core, dashboard
tenant          -> user, database-core, dashboard
auth            -> user, dashboard
```

`user` is the account authority. Other plugins use its `UserService` rather than
reading the users table directly. A successful registration emits
`user:registered`; `tenant` consumes it to create the user's first workspace.

The shared UI lives in `packages/dashboard/frontend/components/ui` and is
initialized with shadcn preset `b27GcrRo`, base `aria`, and the neutral Rhea
style. Plugin pages import `Button`, `Input`, `Label`, `Card`, and future UI
components from `@mirelia/dashboard/frontend`. Business packages do not add a
second theme stylesheet or use native form controls directly.

Run `yarn build` to build every package. Copy `yumeri.example.json` to
`yumeri.json`, then run `yarn dev` to start Yumeri with the TypeScript loader.

## Administrator account

Set `adminUsername` and `adminPassword` in the `@mirelia/user` section of
`yumeri.json` to create the initial administrator. The password must contain at
least 12 characters and at most 72 UTF-8 bytes. `adminEmail` is optional; when
omitted, the account uses `<username>@localhost.localdomain`. Keep the configured password
in your local `yumeri.json`, which is ignored by Git. On startup, the configured
account is promoted to administrator and its password is synchronized; changing
the password revokes that account's existing sessions.
