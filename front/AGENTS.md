# ReadMates Frontend

Before editing frontend code, read `../docs/agents/front.md`.

For UI, layout, copy, or visual polish, also read `../docs/agents/design.md`.

This package is the Vite React SPA plus Cloudflare Pages Functions BFF/OAuth proxy routes.

Default checks:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

For route, auth, BFF, or full user-flow changes, also run:

```bash
pnpm --dir front test:e2e
```
