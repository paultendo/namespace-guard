# namespace-guard

A small open-source library for checking slug/handle uniqueness across multiple database tables with reserved name protection.

## What This Is

This solves the "shared URL namespace" problem that every multi-tenant app has:

- `yourapp.com/sarah` - is this a user?
- `yourapp.com/acme-corp` - or an organization?
- `yourapp.com/settings` - or a reserved route?

When someone picks a username or org slug, you need to check all of these in one go. This library does that with a clean API and adapters for Prisma, Drizzle, and raw SQL.

## Project Structure

```
namespace-guard/
├── src/
│   ├── index.ts              # Core logic: createNamespaceGuard, normalize, types
│   └── adapters/
│       ├── prisma.ts         # Prisma adapter
│       ├── drizzle.ts        # Drizzle ORM adapter
│       └── raw.ts            # Raw SQL adapter (pg, mysql2, etc.)
├── tests/
│   └── (to be created)       # Vitest tests
├── package.json              # npm package config
├── tsconfig.json             # TypeScript config
├── tsup.config.ts            # Build config (tsup bundles to CJS + ESM)
└── README.md                 # Documentation
```

## Tech Stack

- **Language**: TypeScript 5, strict mode
- **Build**: tsup (outputs CJS + ESM + .d.ts)
- **Test**: Vitest
- **No runtime dependencies** - adapters use peer dependencies

## Key Concepts

### NamespaceGuard

The main factory function. Takes a config (reserved names, data sources, validation pattern) and an adapter (database interface).

### Adapters

Each adapter implements one method:
```typescript
type NamespaceAdapter = {
  findOne: (source: NamespaceSource, value: string) => Promise<Record<string, unknown> | null>;
};
```

This keeps the core logic database-agnostic.

### Ownership Scoping

When checking availability, you can pass a "scope" object to exclude your own records from collision detection. This prevents false "already taken" errors when users update their own handle.

```typescript
// User updating their own handle
await guard.check("new-handle", { id: currentUser.id });
```

## Commands

```bash
npm install          # Install dependencies
npm run build        # Build with tsup (outputs to dist/)
npm run test         # Run tests with Vitest
npm run test:watch   # Run tests in watch mode
npm run typecheck    # TypeScript type checking
```

## Development Tasks

### Immediate (before first publish)

1. Add tests for core logic:
   - `normalize()` function
   - Format validation (valid patterns, invalid patterns)
   - Reserved name blocking
   - Multi-source collision detection
   - Ownership scoping (should not collide with own record)

2. Add tests for adapters (mock-based):
   - Prisma adapter
   - Drizzle adapter
   - Raw SQL adapter

3. Add `.gitignore` (node_modules, dist, etc.)

4. Verify build works: `npm run build`

5. Test publish dry-run: `npm publish --dry-run`

### Future

- Add more adapters (Kysely, Knex)
- Add async validation hook for custom checks
- Consider caching layer for reserved names

## Code Style

- Keep it minimal - this is a small utility library
- No runtime dependencies in core
- Adapters use peer dependencies (optional)
- Full TypeScript, all types exported
- Clear error messages for end users

## Publishing to npm

### First-time setup

1. Create an npm account at https://www.npmjs.com/signup

2. Log in from the terminal:
   ```bash
   npm login
   ```
   This will open a browser to authenticate, or prompt for username/password + 2FA.

3. Verify you're logged in:
   ```bash
   npm whoami
   ```

### Publishing a new package

1. Make sure the package name is available:
   ```bash
   npm search namespace-guard
   ```
   If taken, change the name in package.json (e.g., `@paultendo/namespace-guard` for a scoped package).

2. Build the package:
   ```bash
   npm run build
   ```

3. Do a dry run to see what will be published:
   ```bash
   npm publish --dry-run
   ```
   This shows the files that would be included without actually publishing.

4. Publish for real:
   ```bash
   npm publish
   ```
   For scoped packages (`@paultendo/...`), add `--access public`:
   ```bash
   npm publish --access public
   ```

5. Verify it's live:
   ```bash
   npm info namespace-guard
   ```
   Or visit https://www.npmjs.com/package/namespace-guard

### Updating the package

1. Update the version in package.json:
   - Patch (bug fixes): `0.1.0` → `0.1.1`
   - Minor (new features, backwards compatible): `0.1.0` → `0.2.0`
   - Major (breaking changes): `0.1.0` → `1.0.0`

   Or use npm to do it:
   ```bash
   npm version patch   # 0.1.0 → 0.1.1
   npm version minor   # 0.1.0 → 0.2.0
   npm version major   # 0.1.0 → 1.0.0
   ```

2. Build and publish:
   ```bash
   npm run build && npm publish
   ```

### Tips

- The `files` field in package.json controls what gets published (currently just `dist/`)
- `prepublishOnly` script runs automatically before publish (runs `npm run build`)
- Use `.npmignore` if you need to exclude files not covered by `files`
- npm caches packages aggressively - if you need to test locally, use `npm link`

## Origin

Extracted from Oncor (oncor.io), a music platform. The original implementation is in `/Users/pw/Code/oncor-io/src/lib/namespace.ts` - this library is a generalized, ORM-agnostic version of that pattern.

## Author

Paul Wood FRSA (@paultendo)
