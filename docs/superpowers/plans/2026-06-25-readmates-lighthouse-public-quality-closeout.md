# ReadMates Lighthouse Public Quality Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the public Lighthouse diagnostic, classify the first baseline, and close one release-actionable public route quality finding with before/after evidence.

**Architecture:** Keep Lighthouse as a non-gating local diagnostic. Use the existing `front/scripts/lighthouse-diagnostic.ts` and `front/tests/lighthouse/*` harness to produce `.tmp/lighthouse/` evidence, then make the smallest frontend public route/model/ui change needed to close one repeated public finding. Raw Lighthouse artifacts remain local-only; committed changes are product code, tests, and a public-safe closeout note.

**Tech Stack:** Vite React SPA, React Router 7, TanStack Query, TypeScript, Vitest, Playwright-controlled Lighthouse diagnostic, pnpm workspace scripts.

## Global Constraints

- Follow `docs/agents/front.md` for all `front/` changes.
- Follow `docs/agents/design.md` for UI, layout, copy, accessibility, and visual polish.
- Follow `docs/agents/docs.md` for `docs/`, `CHANGELOG.md`, and test-guide changes.
- Do not make Lighthouse a CI hard gate.
- Do not include member, host, or admin route quality improvements in this implementation.
- Do not change server endpoints, persistence, Flyway migrations, BFF proxy behavior, OAuth flow, auth/BFF tokens, or deploy workflow behavior.
- Do not hide route failures or mock around route failures to raise Lighthouse scores.
- Do not commit `.tmp/lighthouse/**`, raw Lighthouse HTML/JSON reports, local absolute paths, private domains, real member data, deployment state, OCIDs, secrets, or token-shaped values.
- Select exactly one release-actionable repeated public finding for this closeout. Record other findings as deferred evidence.
- If no release-actionable public finding exists, stop after Task 1 and report that the baseline produced no eligible product-code target.

---

## File Structure

- Read: `docs/superpowers/specs/2026-06-25-readmates-lighthouse-public-quality-closeout-design.md` — approved scope and acceptance criteria.
- Read: `docs/development/test-guide.md` — local Lighthouse and frontend verification commands.
- Read: `front/tests/lighthouse/route-inventory.ts` — public route ids and expected route entry text.
- Read: `$READMATES_LIGHTHOUSE_BASELINE_RUN/summary.md` — generated baseline summary, not committed.
- Read: `$READMATES_LIGHTHOUSE_BASELINE_RUN/findings.json` — generated baseline machine-readable findings, not committed.
- Create: `docs/superpowers/reports/2026-06-25-readmates-lighthouse-public-quality-closeout.md` — committed public-safe closeout note with commands, selected cause, route ids, audit ids, excluded noise, and before/after result.
- Modify one narrow public frontend surface only after baseline evidence selects it:
  - `front/features/public/model/*` for metadata/display derivation fixes.
  - `front/features/public/ui/*` for public component accessibility/layout fixes.
  - `front/features/public/route/*` for route-owned metadata or route state fixes.
  - `front/src/app/layouts/public-route-layout.tsx` only if the selected finding is caused by the public layout.
  - `front/src/pages/public-*` only if the route shell itself is the selected cause.
- Modify: `CHANGELOG.md` only if the selected fix changes visible public page behavior.
- Do not modify server, DB migration, BFF/OAuth function, deploy, member, host, or admin files.

---

### Task 1: Capture Public Baseline And Pick One Finding

**Files:**
- Read: `front/tests/lighthouse/route-inventory.ts`
- Read generated: `$READMATES_LIGHTHOUSE_BASELINE_RUN/summary.md`
- Read generated: `$READMATES_LIGHTHOUSE_BASELINE_RUN/findings.json`
- Create later in Task 3: `docs/superpowers/reports/2026-06-25-readmates-lighthouse-public-quality-closeout.md`

**Interfaces:**
- Consumes: existing `pnpm --dir front lighthouse:diagnose -- --group public` command.
- Produces: one selected public finding with `bucket`, `auditIds`, `routeIds`, `baselineRunPath`, and `decision`.

- [ ] **Step 1: Confirm the Lighthouse harness unit tests pass**

Run:

```bash
pnpm --dir front exec vitest run tests/lighthouse
```

Expected: PASS. Current known healthy shape is 4 files and 18 tests. If this fails, fix the diagnostic harness before reading Lighthouse page-quality output.

- [ ] **Step 2: Start the local MySQL service if it is not already running**

Run:

```bash
docker compose up -d mysql
```

Expected: command exits 0. If Docker is unavailable, stop and report that the public baseline cannot run because the dev-seed database is unavailable.

- [ ] **Step 3: Start the Spring dev server in a dedicated terminal**

Run from repo root:

```bash
SPRING_PROFILES_ACTIVE=dev \
SERVER_PORT=18080 \
SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/readmates?serverTimezone=UTC&allowPublicKeyRetrieval=true&useSSL=false' \
SPRING_DATASOURCE_USERNAME='readmates' \
SPRING_DATASOURCE_PASSWORD='readmates' \
READMATES_APP_BASE_URL='http://localhost:3100' \
READMATES_ALLOWED_ORIGINS='http://localhost:3100,http://127.0.0.1:3100' \
READMATES_BFF_SECRET='e2e-secret' \
READMATES_IP_HASH_BASE_SECRET='test-secret' \
READMATES_MANAGEMENT_PORT=0 \
READMATES_FLYWAY_LOCATIONS='classpath:db/mysql/migration,classpath:db/mysql/dev' \
READMATES_AUTH_SESSION_COOKIE_SECURE=false \
./server/gradlew -p server bootRun
```

Expected readiness check:

```bash
curl -fsS http://127.0.0.1:18080/internal/health
```

Expected: HTTP 200 response. The response body is local evidence only; do not paste private environment values into committed docs.

- [ ] **Step 4: Start the Vite dev server in a dedicated terminal**

Run from `front/` through pnpm:

```bash
READMATES_API_BASE_URL='http://127.0.0.1:18080' \
READMATES_BFF_SECRET='e2e-secret' \
pnpm --dir front exec vite --host 127.0.0.1 --port 3100
```

Expected readiness check:

```bash
curl -fsS http://localhost:3100/login | head -c 120
```

Expected: HTML content starts printing.

- [ ] **Step 5: Run the full public Lighthouse baseline**

Run:

```bash
pnpm --dir front lighthouse:diagnose -- --group public
```

Expected: command exits 0 and prints a `.tmp/lighthouse/.../summary.md` path.

- [ ] **Step 6: Extract public route status and repeated causes**

Set the generated run directory to the newest local Lighthouse run:

```bash
export READMATES_LIGHTHOUSE_BASELINE_RUN="$(ls -td .tmp/lighthouse/* | head -1)"
test -f "$READMATES_LIGHTHOUSE_BASELINE_RUN/findings.json"
```

Then run:

```bash
sed -n '/## Route Matrix/,$p' "$READMATES_LIGHTHOUSE_BASELINE_RUN/summary.md" | sed -n '1,80p'
node -e 'const fs=require("node:fs"); const path=process.env.READMATES_LIGHTHOUSE_BASELINE_RUN+"/findings.json"; const data=JSON.parse(fs.readFileSync(path,"utf8")); const rows=[]; for (const r of data) for (const f of r.findings) if (f.bucket!=="local_dev_noise") rows.push({bucket:f.bucket, routeId:r.routeId, auditId:f.auditId, score:f.score, title:f.title}); console.table(rows);'
```

Expected: the first command prints the public route matrix; the second command prints every non-local-dev finding.

- [ ] **Step 7: Choose exactly one release-actionable repeated finding**

Apply this decision order:

1. If any public route has `status !== "passed"`, select the route entry failure first and classify it as `route_data_failure`.
2. Otherwise select the non-`local_dev_noise` bucket that affects the most public route ids.
3. If there is a tie, select in this order: `accessibility`, `seo_public_metadata`, `layout_stability`, `image_media`, `bundle_js_cost`, `security_best_practices`.
4. If every finding is `local_dev_noise`, stop after Task 1 and report that no eligible product-code target exists.

Generate and source the selected finding values:

```bash
node <<'NODE' > .tmp/lighthouse/selected-public-finding.env
const fs = require("node:fs");
const path = `${process.env.READMATES_LIGHTHOUSE_BASELINE_RUN}/findings.json`;
const results = JSON.parse(fs.readFileSync(path, "utf8"));
const routeFailures = results.filter((result) => result.status !== "passed");
const noise = new Set();
const byBucket = new Map();

for (const result of results) {
  for (const finding of result.findings) {
    if (finding.bucket === "local_dev_noise") {
      noise.add(finding.auditId);
      continue;
    }
    const entry = byBucket.get(finding.bucket) ?? { routes: new Set(), audits: new Set() };
    entry.routes.add(result.routeId);
    entry.audits.add(finding.auditId);
    byBucket.set(finding.bucket, entry);
  }
}

const priority = [
  "accessibility",
  "seo_public_metadata",
  "layout_stability",
  "image_media",
  "bundle_js_cost",
  "security_best_practices",
];

let selectedBucket = "";
let selectedRouteIds = [];
let selectedAuditIds = [];
let decision = "";

if (routeFailures.length > 0) {
  selectedBucket = "route_data_failure";
  selectedRouteIds = routeFailures.map((result) => result.routeId);
  selectedAuditIds = ["route-entry"];
  decision = "A public route entry failure blocks trustworthy Lighthouse interpretation, so it is the smallest release-actionable target.";
} else {
  const entries = Array.from(byBucket.entries()).sort((a, b) => {
    const routeDelta = b[1].routes.size - a[1].routes.size;
    if (routeDelta !== 0) return routeDelta;
    return priority.indexOf(a[0]) - priority.indexOf(b[0]);
  });
  if (entries.length > 0) {
    const [bucket, entry] = entries[0];
    selectedBucket = bucket;
    selectedRouteIds = Array.from(entry.routes);
    selectedAuditIds = Array.from(entry.audits);
    decision = `${bucket} affects the most public route ids in the baseline, so this closeout handles that one repeated cause first.`;
  }
}

function shell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

console.log(`export READMATES_SELECTED_BUCKET=${shell(selectedBucket || "none")}`);
console.log(`export READMATES_SELECTED_ROUTE_IDS=${shell(selectedRouteIds.join(",") || "none")}`);
console.log(`export READMATES_SELECTED_AUDIT_IDS=${shell(selectedAuditIds.join(",") || "none")}`);
console.log(`export READMATES_EXCLUDED_NOISE=${shell(Array.from(noise).join(",") || "none")}`);
console.log(`export READMATES_CLOSEOUT_DECISION=${shell(decision || "The public baseline produced no release-actionable product-code target.")}`);
NODE
. .tmp/lighthouse/selected-public-finding.env
cat .tmp/lighthouse/selected-public-finding.env
```

If `READMATES_SELECTED_BUCKET` is `none`, stop after Task 1 and report that the baseline produced no eligible product-code target.

Do not commit `.tmp/lighthouse/`.

---

### Task 2: Implement The Selected Public Route Fix

**Files:**
- Modify only the public frontend file(s) required by the selected bucket.
- Test the changed model/UI/route file with a co-located `*.test.ts` or `*.test.tsx`.
- Optionally modify: `CHANGELOG.md` if visible public behavior changes.

**Interfaces:**
- Consumes: `selectedBucket`, `selectedRouteIds`, and `selectedAuditIds` from Task 1.
- Produces: one code fix and one focused regression test that matches the selected Lighthouse finding.

- [ ] **Step 1: Map the selected bucket to the narrowest allowed file set**

Use this table:

| selectedBucket | Primary files to inspect first | Test target |
| --- | --- | --- |
| `route_data_failure` | `front/src/app/routes/public.tsx`, `front/features/public/route/*`, `front/src/app/router-route-order.test.tsx` | targeted route/unit test and targeted E2E only if BrowserRouter behavior changed |
| `accessibility` | `front/features/public/ui/*`, `front/shared/ui/*` only if the primitive causes the public issue | co-located public UI test |
| `seo_public_metadata` | `front/features/public/model/public-page-metadata.ts`, `front/features/public/ui/public-page-metadata-head.tsx`, `front/features/public/ui/public-url-policy-head.tsx` | metadata/head tests |
| `layout_stability` | `front/features/public/ui/*`, `front/shared/ui/book-cover.tsx`, `front/src/styles/globals.css` | public UI test or CT screenshot if component-level |
| `image_media` | `front/shared/ui/book-cover.tsx`, public UI call sites using `BookCover` | `front/shared/ui/book-cover.test.tsx` or public UI test |
| `bundle_js_cost` | `front/src/app/layouts/public-route-layout.tsx`, `front/src/app/routes/public.tsx`, public route imports | route/lazy import test plus build output check |
| `security_best_practices` | inspect raw audit id first; only edit public frontend code for console/deprecation problems | focused unit test for the exact console/deprecation source |

- [ ] **Step 2: Write the failing regression test**

Choose one exact test command based on the selected bucket:

```bash
pnpm --dir front exec vitest run front/features/public/model/public-page-metadata.test.ts
pnpm --dir front exec vitest run front/features/public/ui/public-page-metadata-head.test.tsx
pnpm --dir front exec vitest run front/features/public/ui/public-records-page.test.tsx
pnpm --dir front exec vitest run front/features/public/ui/public-session.test.tsx
pnpm --dir front exec vitest run front/shared/ui/book-cover.test.tsx
pnpm --dir front exec vitest run tests/unit/spa-router.test.tsx
pnpm --dir front exec vitest run src/app/router-route-order.test.tsx
```

Expected: FAIL for the new assertion that reproduces the selected issue. If an existing test already fails before changes, investigate and fix the existing failure before adding implementation code.

- [ ] **Step 3: Implement the minimal public fix**

Implementation rules:

- Keep route modules in charge of loader/query state.
- Keep `features/public/model` pure: no React, router, fetch, QueryClient, or DOM.
- Keep `features/public/ui` prop/callback driven: no API calls, query hooks, route loaders, or `fetch`.
- Keep `shared/ui` generic if touched; do not add public-route knowledge to shared primitives.
- Add no server, BFF, DB, OAuth, deploy, member, host, or admin behavior.

The implementation is complete only when the new failing test from Step 2 passes.

- [ ] **Step 4: Run the focused test again**

Run the same focused command from Step 2.

Expected: PASS.

- [ ] **Step 5: Update `CHANGELOG.md` only if the user-visible public page changed**

If the fix changed visible public route behavior, add one bullet under `## Unreleased` / `### Changed` with this shape:

```md
- **public page quality:** Public routes now describe record links with route-specific accessible names. This is a frontend public-page quality change only; server API contracts, auth/BFF behavior, DB migrations, OAuth scopes, and deploy workflow behavior are unchanged.
```

Adjust the first sentence to the exact selected fix before committing. If the fix is test/tooling-only or invisible metadata-only already covered by the current `public page quality` bullet, do not add a duplicate changelog entry.

- [ ] **Step 6: Commit Task 2**

Stage only files touched for the selected fix:

```bash
git status --short
git diff --name-only -z -- front/features/public front/shared/ui front/src/app/layouts front/src/pages CHANGELOG.md | xargs -0 git add --
git commit -m "fix(front): close public lighthouse quality finding"
```

If the `git add` command fails because no file matched one of the optional path groups, stage the exact changed files shown by `git status --short`. Do not stage `.tmp`, server files, deploy files, member files, host files, or admin files.

---

### Task 3: Write Public-safe Closeout Evidence

**Files:**
- Create: `docs/superpowers/reports/2026-06-25-readmates-lighthouse-public-quality-closeout.md`

**Interfaces:**
- Consumes: Task 1 baseline values and Task 2 changed files.
- Produces: committed closeout note that references local artifact paths without embedding raw reports.

- [ ] **Step 1: Rerun the targeted public Lighthouse diagnostic**

Run:

```bash
pnpm --dir front lighthouse:diagnose -- --group public
```

Expected: command exits 0 and prints a new `.tmp/lighthouse/.../summary.md` path.

- [ ] **Step 2: Confirm the selected finding changed**

Set both run paths:

```bash
export READMATES_LIGHTHOUSE_AFTER_RUN="$(ls -td .tmp/lighthouse/* | head -1)"
test -f "$READMATES_LIGHTHOUSE_BASELINE_RUN/findings.json"
test -f "$READMATES_LIGHTHOUSE_AFTER_RUN/findings.json"
```

Then run:

```bash
node -e 'const fs=require("node:fs"); const [before,after]=[process.env.READMATES_LIGHTHOUSE_BASELINE_RUN,process.env.READMATES_LIGHTHOUSE_AFTER_RUN]; const summarize=(dir)=>JSON.parse(fs.readFileSync(dir+"/findings.json","utf8")).flatMap(r=>r.findings.map(f=>({routeId:r.routeId,bucket:f.bucket,auditId:f.auditId,score:f.score}))).filter(f=>f.bucket!=="local_dev_noise"); console.log("BEFORE"); console.table(summarize(before)); console.log("AFTER"); console.table(summarize(after));'
```

Expected: the selected audit id is removed, affects fewer selected route ids, or has a materially better score. If the selected finding is unchanged, return to Task 2 and refine the product fix.

- [ ] **Step 3: Create the closeout report**

Record the focused test command and product behavior using concrete text from Task 2:

```bash
printf '%s\n' 'pnpm --dir front exec vitest run front/features/public/ui/public-records-page.test.tsx' > .tmp/lighthouse/focused-test-command.txt
printf '%s\n' 'Public routes now close the selected release-actionable Lighthouse finding without changing server, API, DB, auth, or deploy behavior.' > .tmp/lighthouse/product-behavior.txt
printf '%s\n' 'reduced' > .tmp/lighthouse/selected-result.txt
```

Adjust the three `printf` values to the exact focused test command, product behavior, and observed result from this implementation before running them. Use one of these observed result words in `selected-result.txt`: `removed`, `reduced`, or `route-failure-fixed`.

Create `docs/superpowers/reports/2026-06-25-readmates-lighthouse-public-quality-closeout.md` from the exported values:

```bash
export READMATES_FOCUSED_TEST_COMMAND="$(cat .tmp/lighthouse/focused-test-command.txt)"
export READMATES_CHANGED_FILES="$(git show --name-only --format= HEAD | sed '/^$/d' | paste -sd ', ' -)"
export READMATES_PRODUCT_BEHAVIOR="$(cat .tmp/lighthouse/product-behavior.txt)"
export READMATES_ROUTE_FAILURE_SUMMARY='none'
export READMATES_SELECTED_RESULT="$(cat .tmp/lighthouse/selected-result.txt)"
node <<'NODE'
const fs = require("node:fs");
const required = [
  "READMATES_LIGHTHOUSE_BASELINE_RUN",
  "READMATES_LIGHTHOUSE_AFTER_RUN",
  "READMATES_SELECTED_BUCKET",
  "READMATES_SELECTED_ROUTE_IDS",
  "READMATES_SELECTED_AUDIT_IDS",
  "READMATES_EXCLUDED_NOISE",
  "READMATES_CLOSEOUT_DECISION",
  "READMATES_FOCUSED_TEST_COMMAND",
  "READMATES_CHANGED_FILES",
  "READMATES_PRODUCT_BEHAVIOR",
  "READMATES_ROUTE_FAILURE_SUMMARY",
  "READMATES_SELECTED_RESULT",
];
const missing = required.filter((key) => !process.env[key] || process.env[key].includes("NEEDS_CONCRETE_VALUE"));
if (missing.length) {
  console.error(`Missing concrete closeout values: ${missing.join(", ")}`);
  process.exit(1);
}
const content = `# ReadMates Lighthouse Public Quality Closeout

## Scope

- Surface: frontend public routes
- Baseline command: \`pnpm --dir front lighthouse:diagnose -- --group public\`
- Baseline artifact: \`${process.env.READMATES_LIGHTHOUSE_BASELINE_RUN}/summary.md\`
- After artifact: \`${process.env.READMATES_LIGHTHOUSE_AFTER_RUN}/summary.md\`
- Raw artifacts committed: no

## Selected Finding

- Bucket: \`${process.env.READMATES_SELECTED_BUCKET}\`
- Route ids: \`${process.env.READMATES_SELECTED_ROUTE_IDS}\`
- Lighthouse audit ids: \`${process.env.READMATES_SELECTED_AUDIT_IDS}\`
- Decision: ${process.env.READMATES_CLOSEOUT_DECISION}

## Excluded Findings

- Local-dev-only audit ids: \`${process.env.READMATES_EXCLUDED_NOISE}\`
- Route/data failures: ${process.env.READMATES_ROUTE_FAILURE_SUMMARY}

## Change Summary

- Changed files: ${process.env.READMATES_CHANGED_FILES}
- Product behavior: ${process.env.READMATES_PRODUCT_BEHAVIOR}
- Server/API/DB/auth/deploy impact: none

## Verification

- \`pnpm --dir front exec vitest run tests/lighthouse\`
- \`${process.env.READMATES_FOCUSED_TEST_COMMAND}\`
- \`pnpm --dir front lighthouse:diagnose -- --group public\`

## Result

The selected finding was ${process.env.READMATES_SELECTED_RESULT} in the after run. Remaining non-selected findings are deferred because this closeout intentionally handles one release-actionable cause.
`;
fs.mkdirSync("docs/superpowers/reports", { recursive: true });
fs.writeFileSync("docs/superpowers/reports/2026-06-25-readmates-lighthouse-public-quality-closeout.md", content);
NODE
```

Do not paste raw JSON, raw HTML, local absolute paths, private domains, real member data, deployment state, secrets, or token-shaped values.

- [ ] **Step 4: Validate the docs diff**

Run:

```bash
git diff --check -- docs/superpowers/reports/2026-06-25-readmates-lighthouse-public-quality-closeout.md
rg -n "(^|[^A-Za-z0-9_])(sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_[A-Za-z0-9_]+|AKIA[0-9A-Z]{16}|ocid1\\.|BEGIN (RSA|OPENSSH|PRIVATE) KEY|/[U]sers/|/[Hh]ome/[^[:space:]]+)" docs/superpowers/reports/2026-06-25-readmates-lighthouse-public-quality-closeout.md
```

Expected: `git diff --check` exits 0. `rg` exits 1 with no matches.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add docs/superpowers/reports/2026-06-25-readmates-lighthouse-public-quality-closeout.md
git commit -m "docs: record public lighthouse quality closeout"
```

---

### Task 4: Final Verification

**Files:**
- No new files unless verification reveals a targeted fix is needed.

**Interfaces:**
- Consumes: code/test/doc changes from Tasks 2 and 3.
- Produces: final verification evidence for closeout.

- [ ] **Step 1: Run frontend lint**

Run:

```bash
pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 2: Run frontend unit tests**

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

- [ ] **Step 3: Run frontend production build**

Run:

```bash
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 4: Run the public Lighthouse diagnostic one final time**

Run:

```bash
pnpm --dir front lighthouse:diagnose -- --group public
```

Expected: command exits 0. The final report may still contain non-selected findings, but the selected closeout finding must remain removed or reduced compared with the baseline.

- [ ] **Step 5: Confirm raw Lighthouse artifacts are not staged**

Run:

```bash
git status --short
git status --short -- .tmp front/test-results front/playwright-report
```

Expected: no staged `.tmp/lighthouse/**`, Playwright report, or raw Lighthouse artifact files.

- [ ] **Step 6: Commit final verification fixes if any**

If verification required a small follow-up fix, commit it:

```bash
git diff --name-only -z | xargs -0 git add --
git commit -m "fix(front): stabilize public lighthouse closeout"
```

If no files changed, do not create an empty commit.

---

## Self-review

- Spec coverage: Tasks 1 and 3 cover baseline, triage, raw-artifact safety, and evidence. Task 2 covers one release-actionable public route fix. Task 4 covers standard frontend and Lighthouse verification.
- Placeholder scan: runtime values are carried through environment variables and the report generator refuses `NEEDS_CONCRETE_VALUE` values before writing the closeout note.
- Scope check: the plan excludes server, DB, BFF, OAuth, deploy, member, host, and admin changes.
- Type consistency: the plan uses existing route ids, Lighthouse `bucket`, `auditId`, `routeId`, and `.tmp/lighthouse` `findings.json` fields from the current diagnostic harness.
