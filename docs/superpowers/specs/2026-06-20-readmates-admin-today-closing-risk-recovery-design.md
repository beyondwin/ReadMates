# ReadMates — Admin Today Closing Risk Recovery Design

작성일: 2026-06-20
상태: APPROVED DESIGN SPEC
대상 표면: server, frontend, platform admin, host closing board

## 1. 배경

최근 ReadMates는 회차 클로징 흐름을 두 단계로 고도화했다.

- 호스트는 `/clubs/:slug/app/host/sessions/:sessionId/closing`에서 회차별 클로징 상태, checklist, Host/Member/Public surface, evidence ledger를 확인한다.
- 플랫폼 운영자는 `/admin/clubs/:clubId`에서 클럽별 session closing risk row를 보고 host closing board로 drilldown할 수 있다.

현재 남은 흐름상의 빈틈은 발견 표면이다. 운영자가 매일 보는 `/admin/today`에는 클럽 readiness, domain, notification, AI job 신호가 올라오지만, 새로 추가된 회차 클로징 리스크는 클럽 상세에 들어가야만 보인다. 따라서 운영자는 "오늘 어떤 클럽의 어떤 회차가 막혔는가"를 첫 화면에서 바로 알 수 없다.

이 설계는 `/admin/today`에 클로징 리스크를 올리고, 연결되는 호스트 클로징 보드의 다음 액션 문구를 더 구체화한다. 범위는 읽기 전용 projection과 CTA 품질 개선이다. 플랫폼 admin이 세션 내용을 직접 수정하는 mutation, DB migration, host 권한 우회는 포함하지 않는다.

## 2. Source Documents

- Agent router: `AGENTS.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Documentation guide: `docs/agents/docs.md`
- Architecture source of truth: `docs/development/architecture.md`
- Release readiness checklist: `docs/development/release-readiness-review.md`
- Existing admin closing projection spec: `docs/superpowers/specs/2026-06-19-readmates-platform-admin-closing-projection-design.md`
- Existing session closing flywheel spec: `docs/superpowers/specs/2026-06-18-readmates-session-closing-flywheel-design.md`

Graphify was attempted as a scoped discovery aid. The useful live query confirmed the server entry point around `PlatformAdminClubOperationsController` and the current admin club operations slice. Findings were treated as hints and verified against current code.

## 3. Goals

- Make `/admin/today` answer: "Which club/session closing risk needs attention today?"
- Reuse the current session closing and admin club operations concepts without creating admin write access to session content.
- Keep `/admin/today` resilient: closing-risk fetch failure must not blank the whole work queue.
- Preserve public-repo safety by exposing only admin-safe session-level fields.
- Improve host closing board CTA labels so the host can understand the next repair action without decoding internal blocker names.
- Keep implementation inside the existing route-first frontend and feature-local server architecture.

## 4. Non-Goals

- No DB migration.
- No platform-admin mutation for session content, publication, feedback document text, notification send, or AI commit.
- No new host authorization bypass. Host routes remain guarded by the existing host membership checks.
- No historical trend, "days blocked", or durable risk ledger in this pass.
- No raw member data, feedback body, generated JSON, transcript, provider raw error, email body, private domain, deployment identifier, secret, token-shaped example, or local absolute path in UI, fixtures, or docs.
- No large layout redesign of `/admin/today` or the host closing board.

## 5. Selected Approach

Three approaches were considered.

1. Add only better host board copy.
   - Low risk, but it does not help platform operators discover blocked sessions.

2. Add closing risk items to `/admin/today` and lightly improve host board CTA copy.
   - Best fit. It turns the newly built club-detail projection into an actual daily operating signal while keeping the repair path host-owned.

3. Add a durable trend/aging model for closing risks.
   - Valuable later, but too heavy for this pass because it likely needs storage or scheduled aggregation.

This design chooses approach 2.

## 6. Architecture

### 6.1 Server Read Model

Add a platform-admin read-only projection for today's closing risk queue. The endpoint shape should be narrow and work-queue oriented:

```text
GET /api/admin/today/closing-risks
```

Response shape:

```json
{
  "schema": "admin.today_closing_risks.v1",
  "generatedAt": "2026-06-20T00:00:00Z",
  "items": [
    {
      "clubId": "00000000-0000-0000-0000-000000000000",
      "clubSlug": "club-slug",
      "clubName": "클럽명",
      "sessionId": "00000000-0000-0000-0000-000000000000",
      "sessionNumber": 12,
      "bookTitle": "책 제목",
      "meetingDate": "2026-06-20",
      "overallState": "BLOCKED",
      "primaryBlocker": "FEEDBACK_DOCUMENT_INVALID",
      "hostClosingHref": "/clubs/club-slug/app/host/sessions/00000000-0000-0000-0000-000000000000/closing"
    }
  ]
}
```

Allowed item fields:

- `clubId`
- `clubSlug`
- `clubName`
- `sessionId`
- `sessionNumber`
- `bookTitle`
- `meetingDate`
- `overallState`
- `primaryBlocker`
- `hostClosingHref`

The projection may reuse the same SQL concepts as `JdbcAdminClubOperationsAdapter.closingRisks`, but it should not expose the detailed evidence fields used to compute the state. It should scan only recent closed/published sessions, apply a global limit, and sort by operational urgency:

1. `BLOCKED`
2. `IN_PROGRESS`
3. `READY`
4. newest meeting date
5. session number

Suggested global limit: 25 queue items. The limit is a product contract, not an accidental SQL detail.

### 6.2 Server Package Boundary

Keep the slice under the existing platform admin/club operations read surface unless current code shows a cleaner local convention. The implementation should follow:

```text
adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence
```

Rules:

- Controller parses the route and calls a use case.
- Application service owns authorization by requiring `CurrentPlatformAdmin`.
- Persistence adapter owns SQL and row mapping.
- Application service does not depend on Spring Web/HTTP, JDBC, Redis, or adapter types.
- The projection is read-only and must not depend on mutation ports.

### 6.3 Frontend Data Flow

Add platform-admin API/contract/query modules for the new endpoint:

```text
front/features/platform-admin/api
front/features/platform-admin/queries
front/features/platform-admin/model
front/features/platform-admin/route
front/features/platform-admin/ui
```

`adminTodayLoaderFactory()` prefetches the closing-risk query with the existing summary/clubs/AI prefetch. The route also reads the query with `useQuery`.

Failure policy:

- `summary` and `clubs` remain required for `/admin/today`.
- notification, AI, and closing-risk signals are optional operating slices.
- If closing-risk query fails, `buildPlatformAdminWorkbench()` receives `closingRisksUnavailable: true` and creates one partial-error queue item rather than blanking the workbench.

### 6.4 Workbench Model

Extend `PlatformAdminWorkbenchInput` with:

```ts
closingRisks?: ReadonlyArray<PlatformAdminClosingRiskInput>;
closingRisksUnavailable?: boolean;
```

Add queue type:

```ts
type WorkbenchQueueItemType = "club" | "notification" | "ai" | "closing-risk" | "partial-error";
```

Closing risk item mapping:

- `BLOCKED`: severity `critical`, sort rank after publish-readiness blockers and before notification/AI warnings.
- `IN_PROGRESS`: severity `warn`.
- `READY`: severity `attention`.
- Primary action label: `호스트 클로징 보드` when `hostClosingHref` exists, otherwise `클럽 운영 상세`.
- `href`: host closing board for direct repair context, with club operations detail as fallback.

Badges should be typed labels derived in the model, not raw server codes rendered directly. Unknown states or blockers fall back to safe "확인 필요" copy.

## 7. UX Design

### 7.1 `/admin/today`

The existing work queue remains the first screen. Closing risk items appear as normal queue rows with:

- club name and slug
- session number and book title
- safe state label
- safe blocker label
- primary action

Example labels:

```text
한빛 독서모임 · No.12 모던 자바스크립트
차단 · 피드백 문서 확인 필요
호스트 클로징 보드
```

The UI should not add explanatory paragraphs about how the feature works. The row should be self-explanatory through labels and action text.

### 7.2 Selected Brief

When a closing-risk queue item is selected, the selected brief should show:

- club identity
- session identity
- state and blocker labels
- primary action to host closing board
- secondary action to `/admin/clubs/:clubId`

If the current `AdminSelectedBrief` model is too club-centric, add a narrow union variant rather than overloading club fields with null-like values.

### 7.3 Host Closing Board CTA Copy

No new API contract is required. Improve frontend mapping in the host session closing model.

Primary action labels:

| Server action | Current intent | New label |
| --- | --- | --- |
| `CLOSE_SESSION` | close the session first | `세션 종료 확인` |
| `IMPORT_RECORDS` | review or import records | `기록 패키지 검토` |
| `PUBLISH_RECORDS` | publish record surfaces | `기록 공개 설정 확인` |
| `SEND_NOTIFICATION` | check member notification | `멤버 알림 상태 확인` |
| `REVIEW_PUBLIC_PAGE` | inspect public record | `공개 기록 확인` |
| `NONE` | no action | `추가 조치 없음` |

Checklist/blocker labels:

| Blocker | Safe label |
| --- | --- |
| `FEEDBACK_DOCUMENT_INVALID` | `피드백 문서 다시 확인` |
| `SESSION_CLOSE_REQUIRED` | `세션 종료 필요` |
| `RECORD_PACKAGE_REQUIRED` | `기록 패키지 필요` |
| `FEEDBACK_DOCUMENT_REQUIRED` | `피드백 문서 필요` |
| `MEMBER_NOTIFICATION_REQUIRED` | `멤버 알림 확인` |
| `PUBLIC_RECORD_REQUIRED` | `공개 기록 확인` |
| unknown | `확인 필요` |

The board should keep compact ledger-like layout and visible states. Do not add marketing-style hero sections, decorative gradients, or explanatory onboarding copy.

## 8. Authorization and Safety

- The new admin endpoint requires platform admin authentication and the existing capability used for viewing today/admin operations.
- The endpoint returns session-level operational metadata only.
- Host links are navigation links, not permission grants. Existing host route guards continue to decide access.
- Platform admin does not gain a session write path in this feature.
- Public-safe tests must assert private-looking sentinel strings do not render in `/admin/today` closing risk rows.
- Unknown blocker/state codes are mapped to safe fallback labels instead of rendered raw.

## 9. Error Handling

Server:

- Missing admin auth uses existing platform admin security handling.
- Unexpected persistence failures use the existing safe API error contract.
- No stack trace, SQL detail, table detail, provider detail, or private content appears in response bodies.

Frontend:

- Required summary/clubs failure shows the existing full workbench error.
- Closing-risk failure creates a partial-error item with copy such as `클로징 리스크 확인 불가`.
- Empty closing-risk result does not render an alarming warning; it simply contributes no queue items.
- Unknown codes render `확인 필요` and keep the row actionable via safe links.

## 10. Tests and Verification

### 10.1 Server Tests

Add focused tests for:

- endpoint returns `admin.today_closing_risks.v1`
- item fields are limited to the safe contract
- ordering prioritizes `BLOCKED` before `IN_PROGRESS` before `READY`
- global limit is enforced
- unknown or missing computed signals do not leak raw evidence
- platform admin authorization is required

Run:

```bash
./server/gradlew -p server check
./server/gradlew -p server architectureTest
```

If the SQL is covered by integration fixtures, also run the focused integration test class.

### 10.2 Frontend Tests

Add focused tests for:

- API contract parser or fixture accepts the new schema
- query module exposes stable keys and loader prefetch can seed cache
- `buildPlatformAdminWorkbench()` mixes closing-risk items into the queue with the expected severity order
- partial-error item appears when closing-risk query fails
- UI renders safe labels and does not render raw private sentinel strings
- host closing board model maps primary actions to Korean repair labels
- host closing board component renders the new labels without layout-dependent brittle assertions

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

For user-flow confidence, add or extend targeted E2E coverage:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-today-closing-risks.spec.ts
```

If the final implementation touches route/auth/BFF behavior beyond the admin read path, run full E2E.

### 10.3 Public Release Safety

Because the feature touches public-repo-safe admin docs/tests and UI fixtures, run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

## 11. Rollout and Release Notes

Release classification is expected to be a frontend+server additive read feature.

Expected release note:

- `/admin/today` now includes admin-safe session closing risk items that link to host-owned closing boards.
- Host closing board next-action labels are clearer and Korean-first.
- No DB migration, auth/BFF token change, deployment script change, or admin session mutation is introduced.

Production deploy/tag smoke remains a release-operation step and is not proven by local tests.

## 12. Implementation Defaults

The implementation should use these defaults unless current code makes them clearly worse:

- Server code lands with the existing platform-admin club operations read surface, because the current closing-risk calculation already lives there.
- `/admin/today` selected brief becomes a narrow union model so closing-risk rows do not overload club-only fields.
- Targeted E2E coverage uses `tests/e2e/admin-today-closing-risks.spec.ts` unless an existing admin-today spec is already the canonical place for the same flow.

The product contract is fixed: `/admin/today` gets closing risk queue items, the host board gets clearer repair labels, and all data remains read-only and public-safe.
