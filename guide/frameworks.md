# Frameworks

Every framework uses namespace-guard the same way. Create one guard in a module of its own. While someone types a name, check it and show the answer. When they submit, `claim()` it, which checks again and runs your write, and send back `message` if it fails. This page shows that in Next.js, Express and tRPC, and what changes on an edge runtime.

## One guard for the app

Create the guard once, at module level, and import it wherever you need it. The examples on this page use Prisma; any [adapter](adapters.md) works the same way.

```ts title="lib/guard.ts"
import { createNamespaceGuardWithProfile, type OwnershipScope } from "namespace-guard";
import { createPrismaAdapter } from "namespace-guard/adapters/prisma";
import { prisma } from "./db";

export const guard = createNamespaceGuardWithProfile("consumer-handle", {
  reserved: ["admin", "api", "settings", "login", "signup"],
  sources: [
    { name: "user", column: "handleCanonical", scopeKey: "id" },
    { name: "organization", column: "slugCanonical", scopeKey: "id" },
  ],
  risk: { protect: ["yourapp"] },
  suggest: {},
  cache: { ttl: 5000 },
}, createPrismaAdapter(prisma));

/** For checking while someone types: free, and not passing for a protected name */
export async function checkName(name: string, scope: OwnershipScope = {}) {
  const result = await guard.check(name, scope);
  if (!result.available) {
    return { available: false, message: result.message, suggestions: result.suggestions ?? [] };
  }
  const risk = guard.enforceRisk(name);
  if (!risk.allowed) return { available: false, message: risk.message, suggestions: [] };
  return { available: true };
}
```

`check()` answers whether a name is free, and suggests others when it's taken. It doesn't score lookalikes of your protected names, so `checkName()` adds `enforceRisk()`, which applies the same rule as `claim()`. Without it, someone could type `rnicrosoft`, see that it's free, and be refused only when they submit.

The same helper, with a stand-in adapter so it runs on this page:

```ts run
const adapter = { findOne: async (source, value) => (value === "sarah" ? { id: "u1" } : null) };
const guard = createNamespaceGuardWithProfile("consumer-handle", {
  reserved: ["admin", "settings"],
  sources: [{ name: "user", column: "handleCanonical", scopeKey: "id" }],
  risk: { protect: ["microsoft"] },
  suggest: { strategy: "sequential" },
}, adapter);

async function checkName(name, scope = {}) {
  const result = await guard.check(name, scope);
  if (!result.available) {
    return { available: false, message: result.message, suggestions: result.suggestions ?? [] };
  }
  const risk = guard.enforceRisk(name);
  if (!risk.allowed) return { available: false, message: risk.message, suggestions: [] };
  return { available: true };
}

await checkName("my-new-app");          // → { available: true }
await checkName("sarah");               // → { available: false, message: "That name is already in use.", suggestions: ["sarah-1", "sarah1", "sarah-2"] }
await checkName("Sarah", { id: "u1" }); // → { available: true }
await checkName("rnicrosoft");          // → { available: false, message: "Identifier is too confusable with a protected name. Closest protected target: \"microsoft\"." }
```

`Sarah` is free for `u1` because the record that holds it is theirs: the scope tells the guard who is asking. Pass it whenever someone edits a name they already have.

`claim()` returns `{ claimed: true, normalized, value }`, where `value` is whatever your write returned, or `{ claimed: false, reason: "unavailable", message }`. The `message` covers every reason: the format, a reserved name, a validator, a taken name, a lookalike of a protected name, or someone else's write winning the race. With a unique index on the canonical column, that last one comes back as "That name is already in use." rather than as a database error. See [Claiming](claiming.md).

## Next.js

### Server actions

```ts title="app/signup/actions.ts"
"use server";

import { redirect } from "next/navigation";
import { guard, checkName } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Called from the form as the person types (debounce it)
export async function checkHandle(handle: string) {
  return checkName(handle);
}

// The form's action, for useActionState
export async function claimHandle(_state: { error?: string } | null, formData: FormData) {
  const handle = String(formData.get("handle") ?? "");

  const result = await guard.claim(handle, (canonical) =>
    prisma.user.create({ data: { handle, handleCanonical: canonical } }),
  );
  if (!result.claimed) return { error: result.message };

  redirect(`/${result.normalized}`);
}
```

```tsx title="app/signup/form.tsx"
"use client";

import { useActionState } from "react";
import { claimHandle } from "./actions";

export function SignupForm() {
  const [state, action, pending] = useActionState(claimHandle, null);
  return (
    <form action={action}>
      <input name="handle" autoComplete="username" required />
      <button disabled={pending}>Claim</button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
```

### Route handlers

```ts title="app/api/handle/route.ts"
import { guard, checkName } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth"; // your session lookup

// GET /api/handle?name=sarah
export async function GET(request: Request) {
  const user = await getUser(request);
  const name = new URL(request.url).searchParams.get("name") ?? "";
  return Response.json(await checkName(name, { id: user?.id }));
}

// PATCH /api/handle with { "handle": "sarah" }
export async function PATCH(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = await request.json();
  const handle = String(body.handle ?? "");
  const result = await guard.claim(
    handle,
    (canonical) =>
      prisma.user.update({ where: { id: user.id }, data: { handle, handleCanonical: canonical } }),
    { scope: { id: user.id } },
  );
  if (!result.claimed) return Response.json({ error: result.message }, { status: 409 });

  return Response.json({ handle: result.normalized });
}
```

The scope lets someone change `Sarah` to `sarah` without being told their own name is taken.

## Express

```ts title="server.ts"
import express from "express";
import { guard, checkName } from "./lib/guard";
import { prisma } from "./lib/db";

const app = express();
app.use(express.json());

// GET /api/handles/sarah
app.get("/api/handles/:name", async (req, res) => {
  res.json(await checkName(req.params.name));
});

// POST /api/handles with { "handle": "sarah" }
app.post("/api/handles", async (req, res) => {
  const handle = String(req.body?.handle ?? "");
  const result = await guard.claim(handle, (canonical) =>
    prisma.user.create({ data: { handle, handleCanonical: canonical } }),
  );
  if (!result.claimed) return res.status(409).json({ error: result.message });

  res.status(201).json({ handle: result.normalized });
});
```

Express 5 passes a rejected promise from an async handler to your error handler, so a database error that isn't a unique violation reaches it. On Express 4, wrap the handler body in `try`/`catch` and call `next(error)`.

Turn the input into a string before you pass it on: `normalize()` expects one, and a JSON body can hold anything.

## tRPC

```ts title="server/routers/handle.ts"
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { guard, checkName } from "../../lib/guard";

export const handleRouter = router({
  check: protectedProcedure
    .input(z.object({ handle: z.string() }))
    .query(({ input, ctx }) => checkName(input.handle, { id: ctx.user.id })),

  claim: protectedProcedure
    .input(z.object({ handle: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await guard.claim(
        input.handle,
        (canonical) =>
          ctx.db.user.update({
            where: { id: ctx.user.id },
            data: { handle: input.handle, handleCanonical: canonical },
          }),
        { scope: { id: ctx.user.id } },
      );
      if (!result.claimed) throw new TRPCError({ code: "CONFLICT", message: result.message });
      return { handle: result.normalized };
    }),
});
```

On the client, the refusal arrives as the error's `message`. `check` returns the helper's result as it is, so the client can show `message` and `suggestions` while the person types.

## Edge runtimes

The library has no dependencies and uses no Node APIs, so it runs on edge runtimes such as Vercel's Edge runtime, Cloudflare Workers and Deno Deploy. Three things differ there:

- **The database client.** The adapter uses whatever client you give it, and that client has to work in the runtime: usually a driver that talks to the database over HTTP or WebSockets. namespace-guard adds no constraint of its own.
- **Size.** The core package carries its character maps: about 470 KB minified, 61 KB gzipped. `namespace-guard/confusable-weights` adds about 177 KB (18 KB gzipped), and only if you import it. Both fit inside Workers' limits.
- **The cache.** It lives in the guard's memory, so each isolate has its own, and it goes when the isolate does. Treat it as a way to save repeated queries while someone types, not as shared state.

NFKC normalisation and Unicode script checks use the runtime's own Unicode data, so a runtime on an older Unicode version can give a different answer for characters added since. [Data and maps](data.md) has an example: the composability suite has 34 vectors on Unicode 16 or later and 31 before.
