# Project fields for plugins

Project field definitions are contributed by plugins. Users can edit values on each project, but cannot create or alter field definitions.

Add `project` to the contributing plugin's dependencies, then register a group during plugin setup:

```ts
import type { Context } from "yumeri";

export const depend = ["project"];

export async function apply(ctx: Context) {
  await ctx.component.project.registerFieldGroup("@mirelia/deployment", {
    key: "deployment",
    name: "Deployment",
    fields: [
      { key: "region", label: "Region", type: "text", required: true },
      { key: "environment", label: "Environment", type: "select", options: ["staging", "production"] },
    ],
  });
}
```

Registration is idempotent. The plugin ID namespaces group keys, so separate plugins can use the same local group key. Supported field types are `text`, `number`, `boolean`, `date`, `url`, and `select`.
