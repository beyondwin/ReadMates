# ReadMates Host Closing Board Confidence Gates

작성일: 2026-06-25
상태: APPROVED DESIGN SPEC
대상 표면: server performance tests, frontend component visual regression, test documentation, release confidence evidence

## 1. 배경

최근 ReadMates는 host session closing board를 제품 표면으로 정리했다.

- 호스트는 `/clubs/:slug/app/host/sessions/:sessionId/closing`에서 회차 마감 상태, 다음 조치, checklist, host/member/public surface 상태, 안전한 evidence ledger를 본다.
- 서버는 `sessionclosing` read-side slice에서 기존 session, publication, feedback, notification 데이터를 조합해 `GET /api/host/sessions/{sessionId}/closing-status`를 계산한다.
- E2E는 host board, member reflection, public record 흐름을 한 번에 확인한다.
- 플랫폼 admin closing risk는 host-owned repair link로 closing board를 가리킨다.

다음 고도화의 목적은 새 기능 추가가 아니다. 이미 제품화된 운영 표면이 커질 때 SQL round trip, MySQL plan drift, 레이아웃 회귀가 조용히 누적되지 않도록 반복 가능한 confidence gate를 붙인다.

## 2. 목표

성공 기준:

- Host closing status API의 query count가 관찰된 작은 budget 안에 고정된다.
- `JdbcSessionClosingStatusAdapter`의 핵심 read query가 의도한 index path를 사용한다.
- `SessionClosingBoard` UI가 props 기반 component visual baseline으로 보호된다.
- `docs/development/test-guide.md`가 closing board confidence lane을 안내한다.
- 검증 실패나 환경 미지원은 통과로 포장하지 않고 skipped validation과 residual risk로 기록된다.

## 3. Non-goals

- 새 host closing board 기능.
- API response schema 변경.
- DB migration 또는 index 추가를 기본 범위에 포함.
- Platform admin이 세션 마감을 직접 수정하는 기능.
- Notification event type 추가.
- Production deploy, release tag push, provider console smoke.
- 전체 E2E suite 재설계 또는 Playwright worker 병렬화 변경.

## 4. 선택한 접근

선택한 접근은 **최근 제품화된 host closing board에 좁은 confidence gate를 추가**하는 것이다.

검토한 대안:

1. **Host closing board에 기능 추가**
   - 장점: 사용자가 바로 보는 변화가 크다.
   - 단점: 현재 흐름은 막 제품화되었고, 다음 리스크는 기능 부재보다 회귀 감지 부족이다.

2. **시각 회귀 coverage만 확대**
   - 장점: UI 회귀를 빠르게 잡는다.
   - 단점: closing board의 서버 read model 비용과 SQL plan drift는 잡지 못한다.

3. **Server read-model query budget만 확대**
   - 장점: 운영 데이터 증가에 강하다.
   - 단점: host board의 실제 UI 형태와 copy 회귀는 놓친다.

4. **Host closing board confidence gate** - 추천
   - 장점: 서버 query budget, SQL plan, component visual baseline, test docs를 같은 좁은 표면에 묶는다.
   - 단점: 새 제품 기능은 작고, 검증 인프라 성격이 강하다.

## 5. Architecture

기존 architecture는 유지한다.

```text
Frontend route
  -> host feature API/query/model
  -> SessionClosingBoard UI

Spring controller
  -> GetHostSessionClosingStatusUseCase
  -> SessionClosingStatusService
  -> LoadSessionClosingStatusPort
  -> JdbcSessionClosingStatusAdapter
```

새 confidence gate는 production behavior를 바꾸지 않는다. 테스트와 문서만 확장한다.

- `ServerQueryBudgetTest`는 실제 authenticated host request가 closing status endpoint를 호출할 때 prepare statement count를 측정한다.
- `MySqlQueryPlanTest`는 adapter SQL과 같은 핵심 projection query가 sessions, publication/feedback/notification 관련 테이블에서 indexed access를 유지하는지 확인한다.
- `SessionClosingBoard` CT는 deterministic fixture를 mount하고 committed PNG baseline과 비교한다.
- `test-guide.md`는 어떤 변경에서 어떤 lane을 실행해야 하는지 설명한다.

## 6. Server Confidence Gate

### 6.1 Query Budget

`server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`에 host closing status request를 추가한다.

요구사항:

- host fixture user로 인증한다.
- BFF secret placeholder를 사용한다.
- endpoint는 기존 dev seed 또는 테스트 fixture의 닫힌/발행된 세션을 사용한다.
- budget 값은 처음 측정된 실제 query count보다 과도하게 높게 잡지 않는다. 여유는 최대 2~3 queries 정도만 둔다.
- 설명 문구는 "성능 숫자 자랑"이 아니라 accidental N+1 guard임을 명시한다.

예상 검증 명령:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
```

### 6.2 SQL Plan Guard

`server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt`에 closing status projection plan guard를 추가한다.

요구사항:

- `JdbcSessionClosingStatusAdapter`가 사용하는 핵심 SQL과 의미가 같아야 한다.
- `sessions`는 club/session lookup에서 indexed access를 써야 한다.
- feedback document, public publication, notification event/outbox 또는 adapter가 실제로 조인/집계하는 테이블은 각자 의도한 index/access path를 확인한다.
- 테스트가 current SQL과 쉽게 drift하지 않도록 SQL helper 또는 상수 공유를 검토하되, production adapter가 테스트 전용 API를 갖게 만들지는 않는다.
- plan assertion이 현재 schema에서 실패한다면 먼저 원인을 조사한다. 필요한 경우 별도 design/plan으로 index migration을 분리한다.

예상 검증 명령:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.MySqlQueryPlanTest
```

## 7. Frontend Visual Gate

`SessionClosingBoard`는 props 기반 UI이므로 Playwright component test 대상에 적합하다.

파일:

- `front/features/host/ui/session-closing-board.ct.tsx`
- generated baseline under `front/__screenshots__/features/host/ui/session-closing-board.ct.tsx/`

Fixture 원칙:

- public-safe Korean copy와 placeholder UUID만 사용한다.
- real member email, private domain, deployment state, token-shaped value를 넣지 않는다.
- 상태는 최소 두 가지를 검토한다.
  - `PUBLISHED` 또는 완료 상태: 현재 주요 happy path baseline.
  - `BLOCKED` 또는 action-required 상태: badge/tone/wrapping이 깨지기 쉬운 상태.
- 첫 implementation은 한 baseline으로 시작해도 된다. 단, blocked copy가 가장 회귀 위험이 크다고 판단되면 blocked fixture를 우선한다.

Baseline 정책:

- 기존 CT 정책을 따른다.
- Docker-generated baseline만 commit한다.
- macOS 로컬에서 생성된 PNG는 commit하지 않는다.
- Docker 또는 Playwright CT가 로컬에서 실행 불가능하면 skipped validation으로 기록한다.

예상 검증 명령:

```bash
pnpm --dir front test:ct
pnpm --dir front test:ct:update:docker
```

## 8. Documentation

`docs/development/test-guide.md`에 "Host closing board confidence" 항목을 추가한다.

포함할 내용:

- closing board, `sessionclosing`, admin closing-risk repair link를 변경하면 query budget과 plan guard를 확인한다.
- UI/copy/layout을 변경하면 CT visual baseline을 확인한다.
- E2E visual screenshot은 evidence artifact이고, CT baseline은 committed regression gate라는 차이를 설명한다.
- `./server/gradlew -p server clean test`는 이 프로젝트에서 no-op일 수 있으므로 integration lane을 직접 호출해야 한다는 기존 주의와 연결한다.

## 9. Safety And Public Repo Constraints

테스트와 문서는 공개 저장소 안전 기준을 지킨다.

금지:

- real member data
- raw email 또는 private recipient
- private domains
- deployment state
- local absolute paths
- OCIDs
- secrets
- token-shaped examples
- raw feedback body, provider raw error, transcript text

허용:

- placeholder UUID
- `host@example.com` 같은 test-safe email
- `reading-sai` 같은 dev seed/public-safe slug가 이미 테스트에서 쓰이는 경우
- 공개-safe Korean copy

## 10. Verification Plan

Targeted server:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```

Targeted frontend visual:

```bash
pnpm --dir front test:ct
pnpm --dir front test:ct:update:docker
```

Docs:

```bash
git diff --check -- docs/development/test-guide.md docs/superpowers/specs/2026-06-25-readmates-host-closing-board-confidence-gates-design.md
```

Broader checks, if implementation touches shared frontend/server behavior beyond tests:

```bash
pnpm --dir front test
./server/gradlew -p server check
```

Run full E2E only if implementation changes route behavior, BFF/auth behavior, or production frontend code beyond CT fixtures.

## 11. Release Readiness

If this work is implemented, release-readiness notes should record:

- observed query budget for closing status endpoint
- SQL plan guard target and whether any index migration was needed
- CT baseline generation path and renderer
- skipped validations with exact reason
- public-safety scan result for changed docs/tests, if release-sensitive paths are touched

Passing these gates is evidence for the host closing board surface. It is not proof that all release or production operational risk is closed.

## 12. Open Implementation Decisions

These are intentionally left for the implementation plan, not product design:

- exact budget value for `closing-status`
- whether the plan guard reuses adapter SQL as a helper or duplicates the projection query in test code
- whether the first CT baseline covers `PUBLISHED`, `BLOCKED`, or both
- whether Docker CT can run in the current local environment

The implementation plan must resolve each item before editing production or test code.
