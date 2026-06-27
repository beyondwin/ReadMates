# ReadMates Performance Budget And Bundle Diet Design

작성일: 2026-06-28
상태: APPROVED DESIGN SPEC
대상 표면: frontend build output, Vite chunking, Lighthouse diagnostics, performance docs, release-readiness evidence

## 1. 배경

ReadMates는 최근 public Lighthouse diagnostic, route-critical visual regression, CT visual regression CI gate를 순서대로 갖추었다. 이제 UI 품질 회귀는 더 잘 보이지만, production build의 초기 payload와 성능 예산은 아직 명시적인 gate로 관리하지 않는다.

현재 `npx --yes pnpm@10.33.0 --dir front build`는 통과하지만 Vite가 다음 경고를 낸다.

- `vendor-KpyIp2hn.js`: 388.58 kB, gzip 118.62 kB
- `host-route-elements-Bu0IYxh2.js`: 206.72 kB, gzip 50.60 kB
- `index-CZWTFmii.css`: 104.49 kB, gzip 18.18 kB
- Vite warning: "Some chunks are larger than 350 kB after minification"

라우트 정의는 이미 React Router `lazy`를 사용한다. 따라서 이번 고도화는 단순히 lazy route를 도입하는 일이 아니라, 현재 build 산출물에서 남은 큰 chunk를 측정 가능한 예산으로 만들고, 가장 큰 원인을 줄이며, release-readiness 리뷰에서 재사용 가능한 public-safe evidence를 남기는 작업이다.

## 2. 목표

성공 기준:

- Production build 산출물에서 JS/CSS chunk 크기를 수집하고 예산 초과를 JSON/Markdown으로 보고한다.
- `vendor`, `host-route-elements`, route chunks, app entry, global CSS를 분리된 budget bucket으로 추적한다.
- 현재 초과 상태를 그대로 hard gate로 묶지 않고, 이번 작업에서 닫을 항목과 측정-only 항목을 구분한다.
- Vite의 350 kB chunk warning을 제거하거나, 제거하지 못한 경우 release-actionable residual로 명확히 남긴다.
- Host route entry chunk를 줄이되 route-first dependency direction과 Query loader ownership을 유지한다.
- 기존 Lighthouse diagnostic을 build/preview 기반으로도 실행할 수 있게 하여 dev-server-only noise와 release-actionable performance evidence를 분리한다.
- 새 evidence와 명령을 `docs/development`와 release-readiness note에 기록한다.

## 3. Non-goals

- 새 제품 기능, route, API contract를 추가하지 않는다.
- Server API, DB migration, auth/BFF, OAuth scope, Cloudflare Pages Functions behavior를 바꾸지 않는다.
- CSS Module, vanilla-extract, Panda CSS 같은 styling system migration을 이번 범위에 포함하지 않는다.
- Lighthouse 점수를 production SLO처럼 과도하게 hard gate하지 않는다.
- 전체 E2E screenshot diff, 외부 monitoring service, 외부 performance SaaS를 도입하지 않는다.
- Public release candidate에 build artifact, Lighthouse artifact, screenshot artifact를 포함하지 않는다.
- Real member data, private domains, local absolute paths, deployment state, OCIDs, secrets, token-shaped examples를 문서나 fixture에 추가하지 않는다.

## 4. 선택한 접근

선택한 접근은 **예산 게이트 먼저, 다이어트는 근거 기반**이다.

검토한 대안:

1. **번들만 빠르게 줄이기**
   - 장점: `vendor` chunk 또는 host chunk 경고를 빠르게 줄일 수 있다.
   - 단점: 이후 회귀를 막는 budget evidence가 남지 않는다. 어떤 chunk가 다시 커졌는지 리뷰가 어렵다.

2. **Lighthouse 운영화 먼저**
   - 장점: 사용자 체감 지표를 먼저 볼 수 있다.
   - 단점: dev-server noise와 route data failure를 분리하지 않으면 false failure가 많고, 실제 chunk warning이 남을 수 있다.

3. **예산 수집과 chunk diet를 함께 진행** - 추천
   - 장점: 측정, 개선, 회귀 방지가 한 흐름으로 닫힌다. 최근 Lighthouse/visual regression 작업과 연결해 release-readiness evidence로 재사용할 수 있다.
   - 단점: 단순 Vite 설정 변경보다 설계와 테스트 표면이 조금 넓다.

## 5. Architecture

구성 단위:

```text
pnpm --dir front build
  -> front/dist/assets/*
  -> build budget collector
  -> .tmp/performance/build-budget.json
  -> .tmp/performance/build-budget.md

front/src/app/routes/host.tsx
  -> route-specific host lazy imports
  -> smaller host route chunks

pnpm --dir front lighthouse:preview
  -> production build
  -> Vite preview server
  -> existing lighthouse diagnostic runner
  -> .tmp/performance/lighthouse-preview/*
```

책임 분리:

- `front/scripts/*`: CLI orchestration only. Build output reading, preview-server lifecycle, and report path selection live here.
- `front/tests/performance/*`: pure classification, budget evaluation, report formatting tests.
- `front/src/app/routes/host.tsx`: route composition remains the owner of host lazy imports and loaders.
- `front/src/app/host-route-elements.tsx`: no longer acts as a large route-element aggregation point if it keeps creating a single host chunk.
- `front/features/*`: existing feature `route`, `ui`, `queries`, `model`, `api` boundaries remain unchanged.
- `docs/development/performance-budget.md`: explains budgets, commands, interpretation, and release evidence boundaries.
- `docs/development/release-readiness-review.md`: records scoped closeout evidence and residual risk after implementation.

This design does not change browser-facing API responses, route authorization semantics, BFF trusted header behavior, session cookies, OAuth return behavior, or server persistence.

## 6. Build Budget Collector

The collector reads build artifacts after Vite build has finished.

Inputs:

- `front/dist/assets/*`
- budget configuration defined in source control

Outputs:

- `.tmp/performance/build-budget.json`
- `.tmp/performance/build-budget.md`

Suggested buckets:

| Bucket | Matching rule | Initial policy |
| --- | --- | --- |
| `vendor-framework` | React, React DOM, React Router, TanStack Query framework chunk after split | hard limit after split |
| `vendor-misc` | remaining node_modules chunk after split | hard limit after split |
| `host-route` | host route entry chunks | hard limit for each chunk after entry split |
| `route` | public/member/admin route chunks | warn or hard limit depending on current size |
| `app-entry` | main app entry chunk | hard limit |
| `css-global` | global CSS bundle | measure-only in first implementation |
| `uncategorized` | unmatched assets | report-only, with a test requiring intentional classification for new hard-gated buckets |

Initial target policy:

- No single JS chunk over 350 kB after minification.
- Host route entry chunks should target 120 kB or lower after split.
- Ordinary route chunks should target 80 kB or lower unless documented as intentionally larger.
- Global CSS is measured in this iteration but not hard-failed until a CSS boundary design exists.

The collector should fail only on buckets marked as hard-gated. It should still report all measured assets, sorted by size.

## 7. Bundle Diet Plan

### Vendor split

Current Vite config creates a single `vendor` group for all `node_modules`. Replace this with smaller, named groups when the build tool supports it cleanly:

- `vendor-react`: React and React DOM.
- `vendor-router`: React Router.
- `vendor-query`: TanStack Query.
- `vendor-misc`: other dependencies.

The exact group names can change during implementation if Rolldown output constraints require it, but the resulting report must make framework-vendor weight visible.

### Host route entry split

Current evidence shows `host-route-elements` is the second largest JS artifact. The likely cause is that multiple host route elements are imported from a single module by route-level lazy imports.

Change direction:

- Keep route definitions in `front/src/app/routes/host.tsx`.
- Replace multi-export host route aggregation with route-specific entry modules.
- Keep loaders and queryClient injection in route modules.
- Keep UI components props/callback driven; do not add direct API or query imports to presentation UI.

Candidate route entries:

- Host dashboard
- Host members
- Host invitations
- Host notifications
- New session editor
- Edit session editor
- Session closing board

This should reduce the host route chunk and improve route-level caching. If the implementation proves that a shared host dependency dominates the chunk, that shared dependency should be reported instead of forcing artificial splits.

### CSS boundary

`index.css` is large enough to measure, but a CSS architecture migration is intentionally out of scope. This iteration should:

- keep existing styling behavior;
- report CSS size as a measured bucket;
- document a future path for feature-level CSS boundaries if CSS size becomes release-actionable.

## 8. Lighthouse Preview Mode

The existing `lighthouse:diagnose` command runs against a base URL and writes reports. It already separates local-dev noise in report output.

Add a preview-oriented path:

```text
build production assets
start Vite preview on a local port
run existing route inventory against preview base URL
write reports under .tmp/performance/lighthouse-preview/<timestamp>
stop preview server
```

Report context should identify:

- commit
- timestamp
- device profile
- `serverProfile: vite-preview`
- route count
- route entry failure count
- release-actionable repeated root causes
- local-dev-only or preview-only limitations

The preview mode is evidence, not a production smoke replacement. Production OAuth, VM/provider-console, release tag workflow, OCI compose promotion, and post-deploy smoke remain release-operation evidence outside this local task.

## 9. Error Handling

Build budget collector:

- Missing `front/dist/assets`: fail with an explicit message telling the user to run the build first or use the wrapper command that builds automatically.
- No matching assets for a hard-gated bucket: fail because the budget rule is stale.
- Unmatched assets: place in `uncategorized` and report, but do not fail unless the config marks uncategorized assets as hard-gated.
- Invalid budget config: fail before reading build output.

Preview Lighthouse:

- Preview server fails to start: fail the command and preserve logs.
- A route cannot enter: record `route_failure` separately from Lighthouse scores.
- Lighthouse audit fails: record `audit_failure` and keep other route results.
- Local-only performance noise: keep it out of release-actionable root causes unless the preview profile proves it persists after production build.

Route split:

- If route entry split changes route order, auth guards, or loader behavior, treat it as a frontend route change and run targeted E2E.
- If chunk output names change, tests should classify by stable matching rules rather than exact hash names.

## 10. Testing

Spec verification:

```bash
git diff --check -- docs/superpowers/specs/2026-06-28-readmates-performance-budget-bundle-diet-design.md
```

Implementation verification should include:

```bash
npx --yes pnpm@10.33.0 --dir front build
pnpm --dir front lint
pnpm --dir front test
```

Focused tests should cover:

- budget bucket classification;
- budget pass/fail evaluation;
- Markdown/JSON report writing;
- preview Lighthouse command argument handling or orchestration boundary;
- host route split behavior through existing route-order and host route tests.

Because host route entry composition can affect user navigation, implementation should also run targeted E2E for touched host paths, for example:

```bash
pnpm --dir front test:e2e -- tests/e2e/session-closing-flywheel.spec.ts tests/e2e/manual-notifications.spec.ts tests/e2e/host-club-operations.spec.ts
```

If docs, release-readiness, or public release safety files are touched, run:

```bash
git diff --check -- <changed-docs>
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Full server Gradle checks are not required unless implementation touches server code, API contracts, migrations, BFF/auth assumptions, or release scripts consumed by the backend.

## 11. Acceptance Criteria

- A build-budget command or equivalent script reports production build asset sizes as JSON and Markdown.
- Budget buckets distinguish framework vendor, miscellaneous vendor, host route entries, ordinary route chunks, app entry, and global CSS.
- Vite 350 kB chunk warning is eliminated, or a precise residual risk explains why it remains and what follow-up closes it.
- Host route entry split does not change auth guard behavior, route paths, loader ownership, query invalidation, or route-first dependency direction.
- Preview-based Lighthouse evidence can run against production build output and writes reports separate from dev-server diagnostics.
- Docs explain how to run and interpret build budget and preview Lighthouse evidence.
- Release-readiness note records local evidence, skipped production-only evidence, and remaining risk.
- Public release candidate excludes generated performance artifacts.
- No real member data, secrets, private domains, local absolute paths, deployment state, OCIDs, or token-shaped examples are introduced.
- Required checks are run or explicitly reported as skipped with exact reasons.

## 12. Spec Self-review

- Placeholder scan: no TBD/TODO markers or incomplete file paths remain.
- Internal consistency: the design treats performance as build evidence plus focused chunk reduction, not as a product feature.
- Scope check: this is one implementation plan touching frontend build tooling, host route composition, Lighthouse preview evidence, and docs.
- Ambiguity check: hard-gated versus measure-only budget behavior, route split boundaries, preview Lighthouse interpretation, and non-goals are explicit.
