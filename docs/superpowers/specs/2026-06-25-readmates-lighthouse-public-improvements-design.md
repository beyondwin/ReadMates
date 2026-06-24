# ReadMates Lighthouse Public Improvements Design

## Goal

Use the local Lighthouse diagnostic harness to improve ReadMates public route quality, starting with the routes where the current smoke already shows repeated issues:

- `public-home`
- `public-about`
- `public-records`
- `public-session`
- scoped club equivalents under `/clubs/:clubSlug/**`

The work should turn Lighthouse findings into product-safe frontend improvements. It should not change server API contracts, auth behavior, database migrations, Cloudflare Pages Functions behavior, or deployment workflow behavior.

## Current Evidence

The existing diagnostic harness can run:

```bash
pnpm --dir front lighthouse:diagnose -- --group public
```

The latest local smoke that covered `public-home` and `public-about` had no route entry failures, but both routes reported:

- performance around `0.56`
- SEO around `0.73` to `0.75`
- repeated findings in `bundle_js_cost`, `seo_public_metadata`, and `security_best_practices`

That smoke only covered two routes, so implementation must first create a fresh full public baseline under the same local conditions before choosing exact code changes.

## Non-Goals

- Do not make Lighthouse a CI gate in this iteration.
- Do not improve member, host, or admin route UI in this iteration.
- Do not hide route failures, auth failures, or data failures to raise scores.
- Do not add real member data, private domains, local absolute paths, deployment state, secrets, or token-shaped examples to docs or tests.
- Do not change OAuth, BFF proxy, server persistence, migrations, or production deployment settings.

## Scope

### Included

- Public route SEO metadata.
- Public canonical and robots head behavior where it affects Lighthouse findings.
- Public route initial loading cost when the issue is in frontend route imports, public-only modules, or safe Vite chunk boundaries.
- Tests for metadata builders, head side effects, and route behavior that could regress SEO output.
- Before and after Lighthouse public reports saved under `.tmp/lighthouse/`.

### Excluded

- Authenticated route optimization.
- Server-side rendering or pre-rendering.
- New image CDN or external asset pipeline.
- Production provider-console changes.
- Blocking performance budgets.

## Design Approach

Use a four-step improvement loop:

1. Capture a fresh public baseline.
2. Fix low-risk public SEO/head issues.
3. Reduce public initial bundle and style cost where the current module graph supports it.
4. Re-run the same public diagnostic and document the delta.

This keeps the implementation close to the existing architecture and prevents the Lighthouse tool from becoming a disconnected report generator.

## Public Baseline Capture

Before editing application code, run the full public group:

```bash
pnpm --dir front lighthouse:diagnose -- --group public
```

Use the generated `summary.md`, `findings.json`, and per-route HTML reports to create the exact target list. The plan should treat route entry failures separately from Lighthouse scores:

- If a public route fails entry, fix that first.
- If only audits fail, group them by bucket.
- Prioritize repeated findings across multiple public routes over one-off route-specific findings.

Expected first priority buckets are:

- `seo_public_metadata`
- `bundle_js_cost`
- specific `security_best_practices` audits that are actionable in local frontend code

## Public SEO and Head Model

Create a small public metadata model that derives page metadata from the same public route data used for rendering.

Recommended responsibilities:

- Build a stable default title and description for generic public pages.
- Build club-aware title and description for public home, about, and records pages.
- Build session-aware title and description for public session detail pages.
- Keep canonical and robots logic in the existing public URL policy boundary.
- Avoid route-specific string assembly inside UI components when the same logic needs tests.

Likely files:

- `front/features/public/model/public-page-metadata.ts`
- `front/features/public/model/public-page-metadata.test.ts`
- `front/features/public/ui/public-url-policy-head.tsx`
- public route components under `front/features/public/route/`

The head component should manage only nodes it owns, using a data attribute similar to the existing canonical and robots implementation. It should update:

- `document.title`
- `meta[name="description"]`
- `link[rel="canonical"]` where current policy says it is available
- `meta[name="robots"]` where current policy says a local or non-primary host should not be indexed

Fallback behavior:

- If route data is unavailable, keep the default app title and default description.
- If a public session is missing, use the public missing-session page metadata instead of a blank or misleading session title.
- If canonical inputs are not available, do not invent a canonical URL.

## Public Loading Cost

Public routes already use React Router `lazy`, so the plan should avoid broad router rewrites. Instead, inspect the fresh baseline and build output for specific, low-risk savings:

- Check whether public routes import member, host, admin, or app-only modules through shared layout imports.
- Check whether top-level layout imports pull authenticated-only navigation or mobile app shell code into public initial chunks.
- Check whether public-only components can avoid importing heavy shared components that are not visible on first route render.
- Check whether Vite chunk grouping can separate stable app-only chunks without increasing public route waterfall.
- Check whether large global CSS findings are actionable in `front/src/styles/globals.css` or should become a separate design-system cleanup.

Do not split chunks purely to satisfy a byte count if it makes public route loading slower by adding dependent requests. The metric to compare is Lighthouse route score and audit findings under the same local baseline command.

## Security and Best-Practice Findings

The current classifier groups unknown failed audits under `security_best_practices`, so the implementation plan must inspect raw audit IDs before changing code.

Actionable examples:

- console errors from public route rendering
- missing or unstable link text
- local header behavior that is represented in `front/public/_headers`

Non-actionable or deferred examples:

- local dev server minification warnings
- third-party or generated report noise
- production-only header changes that cannot be validated locally without deployment

Any production header change requires separate release-risk review and should not be bundled into this public route frontend pass unless the fresh report proves it is the primary repeated cause.

## Data Flow

```text
public loader data
  -> public route component
  -> public metadata builder
  -> PublicUrlPolicyHead
  -> managed document head nodes
```

The page UI and page metadata should derive from the same source data:

- Club pages use `PublicClubView`.
- Session pages use public session route data.
- Missing/error pages use explicit fallback metadata.

This keeps Lighthouse SEO output aligned with visible page content.

## Error Handling

- Route entry failures remain failures in the diagnostic report.
- Public route error boundaries should not add optimistic metadata that misrepresents the page.
- Head side effects should clean up after route changes and tests.
- Metadata text should be deterministic and safe for public repository tests.
- Canonical generation should continue using existing public URL policy functions.

## Testing Strategy

Run targeted tests while implementing, then the standard frontend checks before closeout.

Targeted tests:

```bash
pnpm --dir front exec vitest run front/features/public/model/public-page-metadata.test.ts
pnpm --dir front exec vitest run front/features/public/ui/public-url-policy-head.test.tsx
```

Adjust file names to the actual test placement if the implementation uses a different existing test surface.

Frontend verification:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Lighthouse verification:

```bash
pnpm --dir front lighthouse:diagnose -- --group public
```

Compare the new public report with the pre-change public baseline:

- route entry failures stay at `0`
- SEO finding count decreases on public pages
- `public-home` and `public-about` SEO scores improve from the current smoke range
- performance findings either improve or are documented as deferred with raw audit IDs

`pnpm --dir front test:e2e` is only required if route behavior, auth boundaries, or BFF behavior changes. It is not required for a metadata-only pass.

## Documentation

Update development docs only if implementation changes the workflow:

- `docs/development/test-guide.md` if Lighthouse usage or interpretation changes.
- `CHANGELOG.md` if public user-visible SEO/performance behavior changes.
- `docs/development/release-readiness-review.md` if the work closes a release-risk item.

Do not commit `.tmp/lighthouse/` reports.

## Acceptance Criteria

- A fresh pre-change public Lighthouse baseline exists locally under `.tmp/lighthouse/`.
- Public metadata is generated through a tested model or helper, not duplicated string assembly in multiple route components.
- Public pages have stable title and meta description behavior.
- Canonical and robots behavior remains scoped to the existing public URL policy.
- Public route entry failures remain at `0` after changes.
- The post-change public Lighthouse report shows reduced SEO metadata findings on affected public routes.
- Any remaining performance or best-practice findings are listed with raw audit IDs and a clear follow-up boundary.
- Standard frontend checks pass, or any skipped check is explicitly reported with the reason.
