# ReadMates Lighthouse Diagnostic Design

## Goal

Create a repeatable local diagnostic loop that uses Google Lighthouse to find page-quality improvement opportunities across ReadMates public, member, host, and platform-admin surfaces without treating the first baseline as a release gate.

The first version should answer:

- Which local dev-seed routes can be entered successfully?
- Which Lighthouse findings repeat across route groups?
- Which findings are likely safe, incremental improvement goals?
- Which failures are route, auth, data, or test-environment failures rather than page-quality failures?

This design intentionally avoids changing production application behavior. The implementation surface is frontend test/tooling and documentation only.

## Context

ReadMates is a React/Vite SPA with React Router route groups, Cloudflare Pages Functions BFF behavior in production, and a Kotlin/Spring Boot API. Local E2E already starts MySQL, Spring dev profile, and Vite together through `front/playwright.config.ts`.

The current route architecture is grouped by:

- Public routes under `/`, `/about`, `/records`, `/sessions/:sessionId`, and `/clubs/:clubSlug/**`.
- Member routes under `/clubs/:clubSlug/app/**`.
- Host routes under `/clubs/:clubSlug/app/host/**`.
- Platform-admin routes under `/admin/**`.

Lighthouse navigation scores alone are not enough for this app because many important screens require authentication and existing page state. The diagnostic should combine:

- Navigation audits for cold-load public routes.
- Snapshot audits for authenticated route states.
- Timespan audits for SPA transitions or route-entry interactions where layout shifts and JavaScript work matter.

The baseline should be deterministic enough for local comparison, but not used as a hard gate until the route inventory and noise sources are understood.

## Non-Goals

- Do not add production server code, DB migrations, or BFF contract changes.
- Do not change product UI as part of the diagnostic tool implementation.
- Do not run real OAuth, email, notification delivery, or external provider flows.
- Do not introduce score thresholds as blocking CI gates in the first version.
- Do not publish Lighthouse reports, local paths, deployment state, private domains, secrets, or real member data.

## Architecture

Add a frontend-owned Lighthouse diagnostic harness.

Suggested files:

- `front/scripts/lighthouse-diagnostic.ts`
- `front/tests/lighthouse/route-inventory.ts`
- `front/tests/lighthouse/lighthouse-runner.ts`
- `front/tests/lighthouse/report-writer.ts`

Suggested scripts:

- `front/package.json`: `lighthouse:diagnose`
- Root `package.json`: optional `front:lighthouse` alias

Suggested development dependencies:

- `lighthouse`
- Use Playwright already present in the frontend package for browser/session control.

Lighthouse CI is not the primary first-version tool. It is useful later for representative route budgets, but the local all-route baseline needs Playwright-controlled auth state and user-flow mode selection.

## Route Inventory

Route inventory should be explicit data, not inferred from the router at runtime. Each entry should include:

- `id`
- `group`: `public`, `member`, `host`, or `admin`
- `path`
- `mode`: `navigation`, `snapshot`, or `timespan`
- `auth`: `none`, `member`, `host`, or `admin`
- `description`
- optional `expectedHeading` or stable selector
- optional `notes` for known local-only caveats

The first baseline should use desktop Chromium only. Mobile profiles can be added after the report format and route inventory stabilize.

Use named fixture constants for route examples:

- `READING_SAI_CLUB_ID`: `00000000-0000-0000-0000-000000000001`
- `READING_SAI_SLUG`: `reading-sai`
- `PUBLIC_SESSION_ID`: `00000000-0000-0000-0000-000000000301`
- `MEMBER_SESSION_ID`: `00000000-0000-0000-0000-000000000301`

These values come from the local dev seed and should be centralized in the diagnostic route inventory or fixture helper. If the dev seed changes, update the constants and route inventory together.

### Public Navigation Routes

- `/`
- `/about`
- `/records`
- `/sessions/00000000-0000-0000-0000-000000000301`
- `/clubs/reading-sai`
- `/clubs/reading-sai/about`
- `/clubs/reading-sai/records`
- `/clubs/reading-sai/sessions/00000000-0000-0000-0000-000000000301`
- `/login`
- `/reset-password/sample-token`
- One intentionally missing public path for route-error quality

### Member Authenticated Routes

- `/clubs/reading-sai/app`
- `/clubs/reading-sai/app/session/current`
- `/clubs/reading-sai/app/notes`
- `/clubs/reading-sai/app/archive`
- `/clubs/reading-sai/app/me`
- `/clubs/reading-sai/app/notifications`
- `/clubs/reading-sai/app/sessions/00000000-0000-0000-0000-000000000301`
- `/clubs/reading-sai/app/feedback/00000000-0000-0000-0000-000000000301`
- `/clubs/reading-sai/app/feedback/00000000-0000-0000-0000-000000000301/print`

### Host Authenticated Routes

- `/clubs/reading-sai/app/host`
- `/clubs/reading-sai/app/host/members`
- `/clubs/reading-sai/app/host/invitations`
- `/clubs/reading-sai/app/host/notifications`
- `/clubs/reading-sai/app/host/sessions/new`
- `/clubs/reading-sai/app/host/sessions/00000000-0000-0000-0000-000000000301/edit`
- `/clubs/reading-sai/app/host/sessions/00000000-0000-0000-0000-000000000301/closing`

### Admin Authenticated Routes

- `/admin/today`
- `/admin/health`
- `/admin/clubs`
- `/admin/support`
- `/admin/notifications`
- `/admin/ai-ops`
- `/admin/audit`
- `/admin/analytics`
- `/admin/clubs/00000000-0000-0000-0000-000000000001`

## Execution Flow

1. Start from the same local dev assumptions as Playwright E2E:
   - MySQL dev database with Flyway dev seed.
   - Spring dev profile.
   - Vite dev server.
2. Resolve stable seed IDs in one fixture helper.
3. Open a browser with Playwright.
4. For each route:
   - Establish the required auth state with dev-login or fixture session helpers.
   - Navigate or transition to the route.
   - Confirm the page is not blank and does not show an unexpected auth/error state.
   - Capture console errors and failed network requests.
   - Run the configured Lighthouse mode.
   - Save raw result and normalized summary.
5. Continue after per-route failures.
6. Write a final Markdown summary and machine-readable findings.

The harness should accept filters:

- `--group public|member|host|admin`
- `--route <id>`
- `--limit <n>`
- `--output <directory>`

The default output directory is `.tmp/lighthouse/<timestamp>/`.

## Output Format

Write all generated artifacts under `.tmp/lighthouse/`, which must remain untracked.

Expected files:

- `summary.md`
- `routes.json`
- `findings.json`
- `results/*.json`
- `reports/*.html`

`summary.md` should contain:

```md
# ReadMates Lighthouse Diagnostic

## Run Context
- commit
- timestamp
- device profile
- server profile
- route count
- failed route count

## Executive Summary
- Lowest scores
- Most repeated causes
- Route entry failures
- Suggested next improvement goals

## Route Matrix
| group | route | mode | status | performance | accessibility | best-practices | seo | key findings |

## Repeated Root Causes
| cause | affected routes | evidence | safe improvement direction |

## Suggested Goal Prompts
- Improve public route layout stability for repeated CLS findings.
- Reduce host/admin route JavaScript cost after route entry succeeds.
```

`findings.json` should preserve route IDs, Lighthouse audit IDs, normalized category scores, numeric metrics, and the derived ReadMates cause bucket.

## Cause Buckets

Map raw Lighthouse audits into implementation-oriented buckets:

- `bundle_js_cost`: unused JavaScript, bootup time, main-thread work, legacy JavaScript.
- `image_media`: image optimization, responsive images, offscreen images, external book cover noise.
- `layout_stability`: cumulative layout shift, layout shift records, missing image dimensions, late skeleton replacement.
- `accessibility`: color contrast, unnamed controls, unnamed links, ARIA problems, heading order.
- `seo_public_metadata`: document title, meta description, canonical, crawlable links, public route metadata.
- `security_best_practices`: CSP/header/cookie warnings, console errors, deprecated browser APIs.
- `route_data_failure`: non-200 route, redirect loop, API failure, blank state, unexpected auth state, uncaught console error.
- `external_asset_noise`: external image/CDN instability or unavailable third-party assets.

Only page-quality buckets should become Lighthouse improvement goals. `route_data_failure` should become a route/auth/data debugging goal instead.

## Suggested Goal Prompt Format

The diagnostic should generate goal prompts in this structure:

```md
Goal: Improve ReadMates <surface> <quality area> without changing product behavior.

Context:
- Evidence: .tmp/lighthouse/<run>/summary.md
- Affected routes: copy the route IDs listed under the repeated cause.
- Lighthouse audits: copy the audit IDs and metric values from `findings.json`.
- Cause bucket: copy one of the diagnostic cause buckets.

Constraints:
- Follow docs/agents/front.md and docs/agents/design.md when editing frontend UI.
- Do not change API contracts, migrations, or seed data unless the evidence proves a route/data bug.
- Preserve public-repo safety.
- Keep changes scoped to the affected surface.

Verification:
- pnpm --dir front lint
- pnpm --dir front test
- pnpm --dir front build
- Rerun targeted Lighthouse routes.

Success:
- No route/data failures.
- Targeted Lighthouse finding is removed or materially reduced.
- No visible desktop regression on affected routes.
```

## Error Handling

Route entry failure should be classified before Lighthouse scoring:

- Unexpected 401 or 403: `route_data_failure`
- Redirect loop: `route_data_failure`
- API 5xx or failed required API response: `route_data_failure`
- Blank screen or missing expected shell: `route_data_failure`
- Uncaught console error: `route_data_failure`
- Lighthouse runtime failure after route entry succeeds: `audit_failure`
- External image or third-party asset instability: `external_asset_noise`

The run should continue after individual route failures. The final summary should separate failed route entry from low Lighthouse scores.

## Verification Strategy

Tooling implementation checks:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Harness smoke checks:

```bash
pnpm --dir front lighthouse:diagnose -- --group public --limit 2
pnpm --dir front lighthouse:diagnose -- --group member --limit 1
```

Full diagnostic:

```bash
pnpm --dir front lighthouse:diagnose
```

The first implementation does not require full Playwright E2E unless the code changes existing E2E setup, auth helpers, route behavior, or product UI. Later Lighthouse-driven product fixes should run the checks required by the touched surface.

## Rollout

1. Implement the local diagnostic harness with desktop-only route inventory.
2. Run a small public/member smoke to prove auth and report writing.
3. Run the full local baseline and inspect noise.
4. Use generated goal prompts to pick the first small quality improvement.
5. After several stable runs, add warning-only budgets for representative routes.
6. Consider Lighthouse CI only for a small representative route subset once noise is understood.

## Open Risks

- Lighthouse scores vary by machine load. The first version should compare findings and repeated buckets more than raw score deltas.
- Authenticated snapshot and timespan audits may require careful browser port wiring between Playwright and Lighthouse.
- External book cover images can produce noisy image findings. These should be marked as external asset noise unless the app layout can reserve dimensions safely.
- Admin and host routes may have large JS costs because they are operational surfaces. Improvements should focus on lazy loading and rendering work only when evidence points there.
