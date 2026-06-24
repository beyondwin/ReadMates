# ReadMates Admin Support And Audit Operations Design

작성일: 2026-06-25
상태: APPROVED DESIGN SPEC
대상 표면: frontend, platform admin, visual evidence, docs

## 1. 배경

ReadMates의 platform admin route catalog는 현재 `today`, `health`, `clubs`, `support`, `notifications`, `ai-ops`, `audit`, `analytics`를 모두 ready route로 노출한다. 최근 고도화는 host closing board, member reading momentum, admin analytics처럼 제품 표면과 visual evidence를 함께 보강해 왔다.

다음 빈틈은 새 대형 admin route가 아니라 이미 ready인 `/admin/support`와 `/admin/audit`의 운영 판단 밀도다.

- `/admin/support`는 사용자 검색, support grant 발급, active grant ledger를 제공하지만 운영자가 발급 전 확인해야 할 위험 요약과 안전한 사유 작성 보조가 얇다.
- `/admin/audit`는 감사 event ledger와 safe metadata detail을 제공하지만 outcome, source, metadata visibility, drilldown 여부를 한눈에 판단하는 운영 요약이 부족하다.
- 일부 주요 화면은 desktop/mobile screenshot evidence가 있지만 support/audit 화면은 같은 수준의 visual confidence가 없다.

이 설계는 서버 API를 넓히지 않고 기존 frontend route-first 구조 안에서 support/audit 워크벤치 완성도와 visual evidence를 보강한다.

## 2. Source Documents

- Agent router: `AGENTS.md`
- Frontend guide: `docs/agents/front.md`
- Design guide: `docs/agents/design.md`
- Documentation guide: `docs/agents/docs.md`
- Architecture source of truth: `docs/development/architecture.md`
- Server state migration status: `docs/development/server-state-migration.md`
- Current route catalog: `front/features/platform-admin/model/admin-route-catalog.ts`
- Current support route/UI/model: `front/features/platform-admin/route/admin-support-route.tsx`, `front/features/platform-admin/ui/admin-support-workbench.tsx`, `front/features/platform-admin/model/platform-admin-support-model.ts`
- Current audit route/UI/model: `front/features/platform-admin/route/admin-audit-route.tsx`, `front/features/platform-admin/ui/admin-audit-ledger.tsx`, `front/features/platform-admin/model/platform-admin-audit-model.ts`

Current code, tests, and architecture docs remain the source of truth if they conflict with historical planning notes.

## 3. Goals

- Make `/admin/support` show whether a support grant is safe to issue before the admin presses the primary action.
- Provide public-safe reason presets that help operators write specific reasons without encouraging private data in fixtures or docs.
- Preserve the current free-text reason input and existing OWNER-only create permission.
- Make `/admin/audit` detail show a concise operational summary for the selected event.
- Keep raw metadata, JSON, tokens, secrets, private domains, and member-private values hidden.
- Add desktop/mobile visual evidence for the support and audit screens using existing Playwright E2E artifact patterns.
- Keep all changes inside the existing platform-admin frontend model/route/ui boundaries.

## 4. Non-Goals

- No server API contract change in the first pass.
- No new platform-admin route.
- No support grant scope expansion.
- No platform admin mutation for club/session/member data beyond existing support grant create/revoke behavior.
- No raw email, private member data, private domain, token-shaped value, secret, raw metadata JSON, provider raw error, transcript, generated result JSON, deployment identifier, OCID, or local absolute path in fixtures, UI, screenshots, or docs.
- No charting library.
- No full E2E suite redesign.
- No production deploy, tag push, or release operation.

## 5. Selected Approach

Three approaches were considered.

1. **Visual evidence matrix only**
   - 장점: 화면 회귀를 빠르게 잡는다.
   - 단점: support/audit가 실제 운영 판단에 도움을 주는 정도는 그대로다.

2. **Support/Audit 운영 워크벤치 보강 only**
   - 장점: 제품 체감이 크고 기존 route에 잘 맞는다.
   - 단점: visual regression confidence가 화면별로 계속 들쭉날쭉하다.

3. **Support/Audit 보강 + 얇은 visual evidence gate** - 선택
   - 장점: ready route의 제품 완성도를 높이면서 desktop/mobile regression artifact도 남긴다.
   - 단점: 서버 read model이나 admin API를 넓히지 않으므로 더 깊은 cross-source correlation은 후속 작업으로 남는다.

## 6. Frontend Architecture

기존 route-first 경계를 유지한다.

```text
src/app/routes/admin.tsx
  -> platform-admin route module
  -> platform-admin query/model helpers
  -> platform-admin UI props
```

Rules:

- Route modules continue to own URL params, Query state, mutation calls, selected row state, and API errors.
- Model modules own deterministic derived labels and risk/summary calculations.
- UI modules render from props and callbacks only.
- UI modules do not import API clients, query hooks, route modules, or `fetch`.
- No browser-exposed secret or server-only config is introduced.

## 7. Support Workbench Design

`AdminSupportWorkbench` remains the route's primary UI surface. The implementation should extract small presentation/model units instead of rewriting the route.

### 7.1 Support Risk Summary

Add a support risk summary derived from:

- `selectedResult`
- `selectedClubId`
- `canCreateGrant`
- `reason`
- `expiresAt`

Suggested model output:

```text
SupportGrantRiskSummary
- status: READY | WARNING | BLOCKED
- items: Array<{ id, label, state, detail }>
- primaryMessage
```

Rules:

- No selected result means blocked with "지원 대상을 먼저 선택" style copy.
- Missing club means blocked with "클럽 선택 필요".
- `canCreateGrant = false` means blocked with existing OWNER-only policy.
- `selectedResult.grantEligible = false` means blocked and uses the existing public-safe `grantBlockedReason` when available.
- Empty reason means blocked.
- Missing or invalid expiry means blocked.
- Expiry longer than the expected short support window should be warning, not a client-only final rejection. The server remains the final policy authority.

### 7.2 Reason Presets

Add safe reason presets near the reason input.

Allowed preset examples:

- `고객 문의 재현 지원`
- `호스트 온보딩 상태 확인`
- `알림 전달 상태 확인`
- `클럽 공개 준비 지원`

Rules:

- Presets set the existing `reason` value through the existing `onReasonChange` callback.
- Free-text editing remains available.
- Presets must not include real ticket numbers, real member names, real domains, private support URLs, or token-like examples.
- Empty or too-vague reasons should still be visible as not ready in the risk summary.

### 7.3 Grant Ledger Hierarchy

Keep the active grant ledger but make the operational state easier to scan.

Rules:

- Active grants should remain visually distinct from expired/revoked entries if those entries are ever present in the response.
- Revoke action remains visible only for active grants.
- Copy should say "support access grant" or Korean equivalent consistently, but should not expose host-owned private data.

## 8. Audit Detail Design

`AdminAuditLedger` keeps its list/filter/detail structure. The change is a stronger detail panel for the selected event.

### 8.1 Operation Summary

Add an audit operation summary derived from:

- `outcome`
- `sourceSlice`
- `actionCategory`
- `metadataState`
- filtered `safeMetadata`
- `aiOpsDrilldownForAuditItem(item)`

Suggested model output:

```text
AdminAuditOperationSummary
- state: NEEDS_REVIEW | RECORDED | FOLLOW_UP_AVAILABLE | LIMITED_DETAIL
- label
- detail
- nextHref?: string
- nextLabel?: string
```

Rules:

- `FAILED`, `DENIED`, and `UNKNOWN` outcomes should produce a review-oriented state.
- `metadataState = UNAVAILABLE` should clearly explain that detail is limited by safety or source availability.
- AI Ops events with a drilldown path should keep the existing "AI Ops에서 보기" link and may surface it in the summary.
- Success events with safe metadata should read as recorded evidence, not an urgent incident.
- Empty pages keep the current "이벤트를 선택하세요" behavior.

### 8.2 Metadata Safety

The current `shouldShowAdminAuditDetailValue()` filter remains mandatory. New summary code must not reintroduce values that this filter hides.

Hide or ignore:

- labels containing raw/json
- values containing object-like JSON
- token or secret shaped text
- provider raw error
- private domains or member-private sentinels if present in test fixtures

## 9. Error And Permission Behavior

Support:

- Keep existing route error copy for create/revoke failures.
- Keep search result state as-is. No results remain an honest empty state.
- Do not infer server authorization beyond `canCreateGrant`.
- Do not enable create for OPERATOR or SUPPORT users.

Audit:

- Keep `GENERIC_ERROR` for query failure.
- Keep partial source warning when `sourceUnavailableCount > 0`.
- Loading, empty, and detail-unavailable states remain visible to assistive technologies through existing status/region patterns where possible.

## 10. Visual Evidence

Add targeted E2E visual evidence for support and audit.

Support scenario:

- Route the platform admin shell with OWNER.
- Route clubs, support search, and support grant ledger with public-safe fixture data.
- Visit `/admin/support?clubId=<fixture-club-id>`.
- Select a result, apply a reason preset or fixture reason, confirm the risk summary is visible.
- Capture desktop and mobile screenshots as test artifacts.

Audit scenario:

- Route the platform admin shell.
- Route audit ledger with at least one success event, one review-needed event, and safe metadata.
- Visit `/admin/audit`.
- Confirm operation summary and existing drilldown behavior.
- Capture desktop and mobile screenshots as test artifacts.

Screenshot rules:

- Screenshots are test artifacts, not committed product assets.
- Assertions must verify non-empty screenshot payloads.
- Assertions must verify private sentinel strings are absent.

## 11. Test Plan

Model/unit tests:

```bash
pnpm --dir front test -- platform-admin-support-model platform-admin-audit-model
```

Expected coverage:

- support summary: no target, no club, non-owner, ineligible result, empty reason, valid ready state, long expiry warning
- reason presets: public-safe labels and callback behavior
- audit summary: failed/denied/unknown, metadata unavailable, AI Ops drilldown, success recorded

UI tests:

```bash
pnpm --dir front test -- admin-support-workbench admin-audit-ledger
```

Expected coverage:

- risk summary renders the correct blocked/warning/ready states
- reason preset updates the existing reason field
- grant create remains disabled when blocked
- audit operation summary renders safe details and drilldown
- hidden metadata remains hidden

Targeted E2E visual:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-support.spec.ts tests/e2e/admin-audit.spec.ts
```

Broader frontend checks if implementation touches shared UI, route shell, or CSS used across admin:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Docs-only spec check:

```bash
git diff --check -- docs/superpowers/specs/2026-06-25-readmates-admin-support-audit-operations-design.md
```

## 12. Release Readiness

If this design is implemented, release-readiness notes should record:

- changed admin surfaces: `/admin/support`, `/admin/audit`
- whether the work remained frontend-only
- targeted unit/UI/E2E commands and results
- screenshot artifact names for support/audit desktop and mobile
- public-safety sentinel assertions
- skipped validations with exact reasons

Passing the targeted tests is evidence for the support/audit operation surfaces. It is not proof that all platform-admin or release risk is closed.

## 13. Implementation Notes

The implementation plan must resolve:

- exact model function names and whether support/audit summary types live in the existing model files or small adjacent files
- exact reason preset labels
- whether mobile screenshots should use the same viewport size as existing visual evidence tests (`390x844`)
- whether `admin-support.spec.ts` and `admin-audit.spec.ts` should receive visual evidence tests or a separate visual spec should be created

Do not start implementation until this spec has been reviewed and an implementation plan has been approved.
