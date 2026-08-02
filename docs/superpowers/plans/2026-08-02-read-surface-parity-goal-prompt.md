# 읽기 화면 통합 자율 실행 Goal 프롬프트

아래 전체 내용을 ReadMates 저장소에서 시작한 새 Codex 작업에 그대로 전달한다.

```text
이 요청은 새로운 디자인을 제안하거나 구현 계획을 다시 작성하는 작업이 아니다. 이미 승인된 ReadMates 읽기 화면 통합 설계와 구현 계획을 현재 저장소에서 끝까지 구현하고 검증하는 하나의 연속 실행이다.

## Goal

작업을 시작하자마자 `create_goal`을 정확히 한 번 호출한다. token budget은 지정하지 않는다.

Goal objective:

“승인된 ReadMates 읽기 화면 통합 spec과 implementation plan의 Task 1–9를 Subagent-Driven Development로 끝까지 구현한다. Task마다 fresh implementer가 엄격한 TDD RED→GREEN→REFACTOR를 수행하고, 별도의 reviewer가 spec compliance와 code quality를 승인한 뒤에만 다음 Task로 진행한다. 익명 GUEST와 인증 VIEWER가 피드백 문서를 제외한 홈·현재 세션·노트·아카이브·지난 세션 상세를 정식 멤버와 같은 renderer로 보고, 모든 쓰기 입력과 버튼은 숨김 없이 비활성화되며 mutation은 실행되지 않게 한다. GuestMySpace와 계정 전용 잠금은 유지하고, 상단 및 일반 읽기 페이지의 지속적인 전환 링크는 제거한다. 발견한 결함은 failing regression test를 먼저 추가해 수정하고, focused/full/browser 검증·문서 동기화·task review·최종 whole-branch review·작업별 커밋을 완료해 clean한 ready-for-integration feature branch를 만든다. local main 병합, push, PR, tag, deploy는 하지 않는다.”

다음 완료 조건이 모두 충족되기 전에는 Goal을 `complete`로 표시하지 않는다. 일반적인 테스트 실패, 타입 오류, lint/build 오류, selector drift, 브라우저 환경 문제, flaky test, 리뷰 finding은 Goal 중단 사유가 아니라 해결할 작업이다.

## 승인된 source of truth

- 설계: `docs/superpowers/specs/2026-08-02-read-surface-parity-design.md`
- 구현 계획: `docs/superpowers/plans/2026-08-02-read-surface-parity.md`
- 실행 계약: `docs/superpowers/plans/2026-08-02-read-surface-parity-goal-prompt.md`

제품 의미가 충돌할 때의 우선순위:

1. 사용자가 승인한 설계의 제품 결정과 안전 불변식
2. 구현 계획의 Global Constraints와 Task 1–9 acceptance
3. 현재 AGENTS.md, architecture, API contract, tests
4. 가장 작고 가역적이며 public-safe한 구현

spec과 plan을 임의로 재설계하지 않는다. current code가 계획의 예시와 조금 다르면 승인된 의미를 보존하면서 현재 타입과 architecture에 맞는 최소 변경을 선택하고 implementation report에 근거를 기록한다.

## 반드시 사용할 지침과 스킬

구현 전에 다음 파일과 스킬을 완전히 읽고 적용한다.

- root `AGENTS.md`
- `front/AGENTS.md`
- `docs/agents/execution.md`
- `docs/agents/front.md`
- `docs/agents/design.md`
- `docs/agents/docs.md`
- `docs/development/project-map.md`
- `docs/development/vertical-slice-checklist.md`
- `docs/development/acceptance-matrix.md`
- 승인 spec과 implementation plan
- `subagent-driven-development`
- `using-git-worktrees`
- `test-driven-development`
- `test-driven-development/writing-good-tests.md`
- `systematic-debugging`
- `requesting-code-review`
- `verification-before-completion`
- `finishing-a-development-branch`

시작 commentary에서 다음을 명시한다.

“I'm using Subagent-Driven Development to execute the approved read-surface parity plan. Each implementer will use strict TDD.”

이 작업은 Codex가 생성한 별도 worktree에서 실행한다. 현재 checkout이 이미 새 작업용 worktree이면 중첩 worktree를 만들지 않는다. main/master checkout에서 직접 구현하지 않는다.

## 권한과 실행 경계

허용:

- 현재 새 작업 worktree와 feature branch 안에서 plan 범위의 frontend code, tests, CSS, CHANGELOG, implementation report 수정
- 승인된 spec/plan/goal prompt가 uncommitted 상태로 전달되었다면 내용을 검증한 뒤 public-safe한 docs commit으로 보존
- task별 local commit
- frontend unit/component/E2E/browser 검증에 필요한 local process와 fixture 실행
- plan 범위 안의 오류·결함을 failing regression test와 함께 수정
- formatter나 test runner가 만든 plan 소유 임시 산출물 정리

금지:

- local main 병합
- origin fetch/pull을 필수 조건으로 만들기
- push, PR, tag, release, deploy
- production 또는 외부 서비스 mutation
- 실제 이메일·알림·outbox 전송
- 실제 유료 provider 호출
- secret/private member data 사용 또는 저장
- server/BFF/database/Flyway 변경. 현재 frontend/public projection으로 승인 UX를 구현할 수 없다는 재현 가능한 증거가 생겨도 먼저 frontend 범위의 모든 대안을 소진하고 residual blocker로 보고한다.
- 사용자 소유 변경 삭제, 다른 branch/worktree 정리
- `git reset --hard`, broad `git clean`, force checkout, force push

## 시작 및 복구 절차

1. `git status --short --branch`, `git log --oneline --decorate -15`, `git worktree list --porcelain`을 실행한다.
2. 승인 문서 세 개가 존재하고 읽을 수 있는지 확인한다.
3. 작업 트리에 전달된 승인 문서 변경만 있다면 whitespace/public-safety 검증 후 첫 docs commit으로 보존한다. 다른 사용자 변경이 섞여 있으면 건드리지 않고 범위를 분리한다.
4. 다음 expected surface로 preflight를 실행한다.

   `python3 scripts/agent-preflight.py --intent change --base main --paths front/features/current-session,front/features/guest-browse,front/features/member-home,front/features/archive,front/shared/model,front/shared/ui,front/src/app/layouts,front/src/styles/globals.css,front/tests,CHANGELOG.md,docs/superpowers/plans/2026-08-02-read-surface-parity.md`

5. repository pin인 `pnpm@11.13.1`을 Corepack으로 사용한다. dependency가 없으면 lockfile을 바꾸지 않는 방식으로 복구한다.
6. 구현 전 baseline으로 다음을 실행하고 결과를 기록한다.

   - `corepack pnpm --dir front lint`
   - `corepack pnpm --dir front test`
   - `corepack pnpm --dir front build`

7. baseline failure는 즉시 사용자에게 묻지 않는다.

   - 현재 feature 변경 전에도 재현되는지 확인한다.
   - 환경/의존성/port/stale process 문제면 가장 작은 가역적 조치로 복구한다.
   - 기존 결함이 plan 실행을 막으면 별도의 failing regression test를 먼저 만들고 최소 수정한다.
   - 같은 명령을 근거 없이 반복하지 말고 concrete error output에 따라 전략을 바꾼다.

context compaction이나 세션 재개가 발생하면 conversation memory가 아니라 Goal 상태, git status/log, plan checkbox, test output, implementation report를 source of truth로 삼아 첫 미완료 Task부터 계속한다. 이미 검증·커밋된 Task를 처음부터 다시 하지 않는다.

## Subagent-Driven Development 실행 계약

controller는 Task 구현 코드를 직접 수정하지 않는다. `subagent-driven-development`의 script, ledger, brief, report, review-package 계약을 그대로 사용한다.

1. 구현 plan 경로를 `PLAN_FILE=docs/superpowers/plans/2026-08-02-read-surface-parity.md`로 고정한다.
2. skill의 `scripts/sdd-workspace "$PLAN_FILE"`을 실행해 이 plan 전용 ignored workspace를 찾는다.
3. `<workspace>/progress.md` 첫 줄을 다음 identity로 만든다.

   `# SDD ledger — plan: docs/superpowers/plans/2026-08-02-read-surface-parity.md`

4. ledger에 `Task N: complete`가 있고 기록된 commit이 git log에 존재하는 Task는 재실행하지 않는다. fix round가 진행 중이면 다음 round부터 재개한다.
5. 승인 plan을 한 번 읽고 Task 1–9 todo를 만든다. 한 번에 하나만 `in_progress`로 둔다.
6. Task마다 dispatch 직전 `BASE=$(git rev-parse HEAD)`를 기록한다.
7. `scripts/task-brief "$PLAN_FILE" N`으로 생성한 brief만 implementer의 요구사항 source로 제공한다. implementer에게 전체 대화 history나 전체 plan을 붙여 넣지 않는다.
8. implementer report는 brief와 같은 workspace의 `task-N-report.md`에 기록한다. implementer는 전체 보고서를 파일에 쓰고 controller에는 15줄 이내 status/commit/test summary/concern만 반환한다.
9. implementer가 DONE이면 `scripts/review-package "$PLAN_FILE" "$BASE" HEAD`로 diff package를 만들고 fresh task reviewer에게 brief, report, diff package, binding global constraints를 전달한다.
10. task reviewer는 spec compliance와 task quality 두 verdict를 모두 내린다. implementer self-review는 reviewer를 대신하지 않는다.
11. spec gap 또는 Critical/Important finding은 최대 5 round fix/re-review loop로 해결한다.

   - round 1–3: 원래 implementer를 resume하고 finding을 verbatim 전달
   - round 4–5: 더 높은 capability의 fresh implementer에게 brief/report/finding 전달
   - 매 round: covering test, command, output을 report에 append하고 fix diff만 scoped re-review
   - controller가 finding을 직접 고치지 않음
   - Minor는 ledger에 deferred reason을 남기고 final whole-branch review에서 재판정

12. review가 clean하거나 5-round breaker 규칙으로 모든 non-load-bearing finding에 근거 있는 ruling이 기록된 뒤에만 다음 Task로 이동한다.
13. 모든 Task 뒤 `MERGE_BASE..HEAD` review package를 만들고 가장 강한 reviewer model로 whole-branch review를 수행한다.
14. final findings는 한 fresh fix implementer에게 한 번에 전달하고, fix wave 뒤 정확히 한 번 scoped re-review한다. 실제 load-bearing residual이 남으면 완료하지 않는다.

모든 implementer/reviewer dispatch는 `fork_turns="none"`을 사용하고 model을 명시한다. 여러 implementation subagent를 병렬로 실행하지 않는다.

Model policy:

- Task 1–4 implementer: `gpt-5.6-terra`, reasoning `high`
- Task 1–4 reviewer: `gpt-5.6-terra`, reasoning `high`
- Task 5–8 implementer: `gpt-5.6-sol`, reasoning `high`
- Task 5–8 reviewer: `gpt-5.6-sol`, reasoning `high`
- Task 9 implementer: `gpt-5.6-sol`, reasoning `xhigh`
- Task 9 reviewer: `gpt-5.6-sol`, reasoning `xhigh`
- fix round 4–5: fresh `gpt-5.6-sol`, reasoning `xhigh`
- final whole-branch reviewer: `gpt-5.6-sol`, reasoning `xhigh`

implementer가 NEEDS_CONTEXT/BLOCKED를 반환하면 같은 prompt를 무변경 재시도하지 않는다. controller가 repo 증거를 조사해 context를 보충하거나, task를 더 좁게 나누거나, model capability를 올린다. ordinary 구현 선택은 아래 자율 판단 hierarchy로 controller가 답하고 계속한다.

SDD skill이 plan-mandated finding과 제품 결정의 충돌에 사용자 확인을 요구하더라도, 사용자는 이 실행에서 ordinary 오류·결함·구현 충돌에 대해 controller가 최선의 선택을 하도록 명시적으로 위임했다. controller는 승인 spec → plan constraints → current architecture/tests → fail-closed 최소 변경 순으로 판정하고 ledger에 finding, 양쪽 근거, ruling을 기록한 뒤 계속한다. 승인된 제품 의미 자체가 양립 불가능한 경우만 외부 blocker로 취급한다.

## 엄격한 TDD 계약

Iron Law:

`NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`

모든 behavior change와 발견 bug에 다음 cycle을 실제로 수행한다.

1. 테스트를 쓰기 전에 “어떤 잘못된 production change를 이 테스트가 잡는가?”를 한 문장으로 기록한다.
2. 하나의 observable behavior를 검증하는 최소 테스트를 먼저 작성한다.
3. 해당 테스트 명령을 실행해 예상한 이유로 실패하는 RED를 실제로 관찰한다.
4. compile error, fixture 누락, selector typo 때문에 실패하면 올바른 behavioral RED가 될 때까지 테스트만 고친다.
5. 테스트를 통과시키는 최소 production code만 작성한다.
6. 같은 명령으로 GREEN을 관찰한다.
7. 관련 focused regression을 실행한다.
8. GREEN 상태에서만 중복 제거와 이름 정리를 한다.
9. refactor 후 같은 focused tests를 다시 GREEN으로 확인한다.
10. `git diff --check`와 self-review 뒤 task commit을 만든다.

TDD 증거로 인정하지 않는 것:

- production code를 먼저 작성하고 나중에 추가한 테스트
- 처음부터 통과한 테스트
- source text나 제거된 symbol 문자열만 grep하는 테스트
- mock 자체의 존재·호출만 검증하는 테스트
- implementation과 같은 helper로 expected 값을 계산한 mirror assertion
- assertion 삭제, test skip, timeout 증가, 의미 없는 selector 교체로 만든 GREEN

mock은 외부/느린 경계에서 불가피할 때만 사용한다. 실제 component/model/route behavior를 assertion하고, mock response는 실제 contract의 완전한 구조를 반영한다. 기존 테스트를 변경할 때도 그 테스트가 잡아야 하는 실제 regression을 먼저 설명한다.

이미 production code를 먼저 작성한 사실을 발견하면 해당 미검증 코드를 유지한 채 테스트를 맞추지 않는다. 그 task의 미검증 변경을 되돌리고 올바른 failing test부터 다시 시작한다. 다른 사용자의 기존 코드는 삭제하지 않는다.

## Task 실행 순서

implementation plan의 Task 1–9를 순서대로 실행한다. 한 번에 하나만 in progress로 둔다.

각 Task의 완료 증거:

- plan에 지정된 RED command와 예상 실패 이유
- 최소 production implementation
- GREEN command exit 0
- 영향 범위 focused regression exit 0
- task diff self-review
- `git diff --check` exit 0
- 좁은 task commit

Task 사이에 사용자 승인이나 “계속할까요?”를 묻지 않는다. plan의 예시 코드가 현재 interface와 어긋나면 현재 code를 확인하고 승인된 behavior를 만족하는 좁은 타입/adapter 경계를 선택한다.

고정 제품 불변식:

- GUEST public API와 authenticated member API를 합치지 않는다.
- guest/member query key와 cache를 공유하지 않는다.
- GUEST, VIEWER, active MEMBER는 홈·현재 세션·노트·아카이브·지난 세션 상세에서 같은 regular-member renderer와 정보 순서를 사용한다.
- GUEST와 VIEWER의 RSVP, 진행률, 질문, 한줄평, 장문 서평, 추가, 삭제, 저장 control은 숨기지 않고 같은 위치에 렌더링한다.
- 읽기 전용 control은 native `disabled` 또는 필요한 `aria-disabled`와 event guard를 함께 사용한다.
- 읽기 전용 audience의 mutation callback/API 요청은 실행되지 않는다.
- VIEWER에게 실제 개인 값이 있으면 동일한 disabled form에 표시한다.
- GUEST에게 없는 개인 값은 view model에서 `null`/empty로 유지하고, disabled UI default를 saved value처럼 표시하지 않는다.
- 피드백 문서 metadata/body는 GUEST/VIEWER presentation에 전달하거나 추론하지 않는다.
- 정확한 장소, meeting URL/passcode, membership/account identifier를 guest view에 노출하지 않는다.
- `/app/me`의 `GuestMySpace`는 현재 모습과 한 번의 contextual conversion action을 유지한다.
- notifications/settings 계정 잠금과 feedback explicit lock dialog를 유지한다.
- guest desktop/mobile header의 `게스트`, `멤버로 시작`, `공개 홈으로 나가기` 묶음을 제거한다.
- 일반 home/current/notes/archive/detail page의 반복 conversion card를 제거한다.
- explicit feedback/account lock을 사용자가 선택한 뒤에만 한 번의 `멤버로 시작` action을 제공한다.
- guest partial widget error, bounded Retry-After, cursor pagination, filter/search state, returnTo, focus restoration, reduced motion을 보존한다.
- UI module은 API/query/route import를 소유하지 않는다.
- real member data, local absolute path, private domain, secret, token-shaped example을 tracked file이나 final report에 남기지 않는다.

## 오류·결함 발견 시 자율 판단

ordinary 오류와 결함은 질문으로 넘기지 않고 같은 Goal 안에서 해결한다.

1. concrete failing command, exit status, 핵심 stack/error를 기록한다.
2. `systematic-debugging`으로 원인을 재현하고 feature change, baseline defect, environment failure를 분류한다.
3. product defect면 가장 작은 failing regression test를 먼저 추가한다.
4. minimal fix로 GREEN을 만든 뒤 adjacent regression을 실행한다.
5. 같은 실패가 반복되면 동일 명령을 맹목적으로 재시도하지 않고 fixture, state, async boundary, browser/server output을 분리해 전략을 바꾼다.
6. flaky test는 retry 횟수 증가로 숨기지 않고 deterministic state/wait로 원인을 제거한다.
7. plan에 없던 리팩터링은 승인 acceptance를 충족하거나 결함을 고치는 데 필요한 최소 범위로 제한한다.

다음 상황만 진짜 외부 blocker다.

- private data나 secret 없이는 안전한 local fixture를 만들 수 없음
- production/live mutation 권한이 필요함
- user-owned uncommitted change를 버려야만 진행 가능함
- 승인 spec끼리 양립 불가능하고 repo 증거로도 하나를 선택할 수 없음
- 필수 provider/runtime 자체가 지속적으로 unavailable하고 local 대안도 없음

이 경우에도 가능한 local 구현·테스트·진단을 모두 끝낸 뒤에만 blocker를 보고한다. Goal tool의 blocked 조건이 충족되지 않았는데 조기에 `blocked`로 표시하지 않는다.

## Browser와 최종 검증

Task 9에서 plan의 targeted E2E를 실행하고 real browser evidence를 만든다.

필수 viewport:

- desktop 1280×900
- mobile 390×844

필수 확인:

- guest/member 홈 section 순서
- guest/viewer/member 현재 세션의 동일 header/tab/form 배치와 enabled/disabled 차이
- guest/member notes rail 또는 mobile sheet, filter, session transition
- guest/member archive tab과 detail public section 순서
- feedback lock dialog focus trap, Escape, opener focus restore
- `GuestMySpace` 유지
- no horizontal overflow
- reduced-motion notes transition

synthetic/public-safe fixture만 사용한다. 실제 member data나 private URL이 담긴 screenshot을 추적하지 않는다.

최종 feature HEAD에서 새로 실행한다.

- plan Task 9의 targeted E2E
- `corepack pnpm --dir front lint`
- `corepack pnpm --dir front test`
- `corepack pnpm --dir front build`
- `corepack pnpm --dir front test:e2e`
- `git diff --check`
- plan의 dependency-boundary 및 public-safety scan

일부 focused test 통과를 full gate 통과로 보고하지 않는다. 실행하지 못한 검증은 통과했다고 말하지 않고 concrete reason과 residual risk를 남긴다.

## 최종 review와 문서 closeout

모든 Task 뒤 base-to-HEAD 전체 diff를 독립적인 새 검토 관점으로 읽는다.

검토 항목:

- 승인 spec/plan acceptance 전부 충족
- guest DTO privacy와 API/query lane 분리
- disabled control과 handler-level write guard
- VIEWER direct write 및 feedback read 403 evidence
- guest feedback metadata/body 부재
- responsive/accessibility/focus/reduced-motion
- partial errors, pagination, route continuity
- feature dependency direction
- 테스트가 real behavior를 검증하는지와 mock 남용 여부
- CHANGELOG/active docs drift
- unrelated change와 public-repo unsafe value 혼입 여부

finding이 있으면 우선순위에 관계없이 실제 결함인지 판단하고, 실제 결함이면 failing regression test부터 같은 TDD cycle로 수정한다. 수정 뒤 focused test와 영향을 받는 final gate를 다시 실행한다.

다음 report를 작성한다.

- `docs/superpowers/reports/2026-08-02-read-surface-parity-implementation-report.md`

report 내용:

- 사용자에게 보이는 변화
- member/guest adapter와 shared renderer 경계
- Task별 RED/GREEN 명령과 결과
- focused/full/E2E/browser evidence
- 발견 결함과 regression test
- server/BFF/database/migration 변경 없음 확인
- final review finding과 해결
- skipped validation과 residual risk
- 최종 branch/commit 목록
- local main merge, push, PR, deploy를 하지 않았다는 범위

plan checkbox와 CHANGELOG를 실제 완료 상태에 맞게 동기화하고 마지막 docs commit을 만든다.

## 완료 조건

다음이 모두 사실일 때만 `update_goal({ status: "complete" })`를 호출한다.

- Task 1–9의 모든 checkbox와 acceptance 완료
- 모든 새 behavior와 발견 defect에 실제 RED→GREEN 증거 존재
- guest/viewer write control은 보이지만 disabled이고 mutation이 없음
- feedback restriction과 guest privacy 증명
- GuestMySpace 유지 및 persistent conversion 제거 증명
- focused tests와 canonical frontend gates 통과
- desktop/mobile/reduced-motion browser evidence 완료
- final base-to-HEAD review finding 해결
- CHANGELOG와 implementation report 동기화
- task commits와 final docs commit 존재
- worktree clean
- local main merge, push, PR, tag, deploy, live mutation 없음

완료 후 `finishing-a-development-branch`를 사용하되 이 프롬프트가 승인한 범위는 “feature branch를 clean한 ready-for-integration 상태로 유지”까지다. merge/push/PR 선택을 실행하지 않는다.

최종 응답은 다음 순서로 간결하게 보고한다.

1. Goal 완료 여부와 최종 feature branch/HEAD
2. 사용자에게 보이는 핵심 변화
3. 주요 code/docs surface
4. 실제 RED/GREEN, focused, full, E2E, browser evidence
5. server/BFF/database/migration 변경 유무
6. 남은 residual risk 또는 skipped validation
7. integration 상태: local main merge/push/PR/deploy 안 함

“부분 구현”, “대부분 통과”, “테스트는 나중에”를 완료로 보고하지 않는다. 안전하고 관련 있는 다음 단계가 남아 있으면 같은 Goal에서 스스로 계속한다.
```
