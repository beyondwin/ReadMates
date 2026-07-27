# 호스트 세션 편집 UI/UX 재편 새 세션 Goal 프롬프트

아래 전체 내용을 ReadMates 저장소에서 시작한 새 Codex 세션에 그대로 전달한다.

```text
이 요청은 새 설계나 추가 계획을 만드는 작업이 아니다. 이미 승인된 호스트 세션 편집 UI/UX 재편을 구현하고, 검증하고, active 문서를 동기화한 뒤, 최종 결과를 local `main`에 병합하는 하나의 연속 실행이다.

## Goal

이 세션에서 `create_goal`을 정확히 한 번 호출하고 token budget은 지정하지 않는다.

Goal objective:

“승인된 ReadMates 호스트 세션 편집 UI/UX 재편 spec과 implementation plan의 모든 task와 acceptance criteria를 Subagent-Driven Development로 끝까지 구현한다. 작업별 TDD, 독립 리뷰와 수정 loop, responsive browser evidence, active 문서 및 CHANGELOG 동기화, 최종 whole-branch review와 merged-main 재검증을 완료한 뒤 feature branch를 local main에 안전하게 병합하고 전용 worktree를 정리한다. Push, PR, tag, deploy, 실제 AI provider 호출, 실제 이메일/알림 발송은 하지 않는다.”

Goal은 local `main` 병합과 병합 결과 재검증이 모두 끝나기 전에는 `complete`로 표시하지 않는다. ordinary code/test/review/environment 오류 때문에 Goal을 중단하거나 새 Goal을 만들지 않는다.

## Repository와 승인 문서

Repository root:

- 현재 ReadMates repository root

승인된 source of truth:

- `docs/superpowers/specs/2026-07-27-host-session-editor-ui-ux-redesign-design.md`
- `docs/superpowers/plans/2026-07-27-host-session-editor-ui-ux-redesign.md`

Anchor commits:

- design: `713cbd27`
- design refinement: `870002ee`
- implementation plan: `18c346b4`

현재 `main`이 anchor commit보다 앞서 있어도 reset하지 않는다. 다음 조건만 확인한다.

1. `git merge-base --is-ancestor 18c346b4 main`이 성공한다.
2. 위 spec/plan 파일이 존재한다.
3. plan의 첫 번째 미완료 task부터 시작한다.
4. 이미 SDD ledger가 있으면 ledger와 git log로 완료 task를 복구하고 재실행하지 않는다.

Anchor가 현재 `main`의 조상이 아니면 먼저 현재 branch/worktree와 문서 위치를 조사한다. 같은 승인 문서가 다른 descendant commit에 안전하게 존재하면 그 current source를 사용한다. reset, force checkout, commit amend로 다른 작업을 지우지 않는다.

## 반드시 읽을 지침

구현 전에 다음을 완전히 읽고 적용한다.

- repository root `AGENTS.md`
- `front/AGENTS.md`
- `docs/agents/front.md`
- `docs/agents/design.md`
- `docs/agents/execution.md`
- `docs/agents/docs.md`
- `docs/development/project-map.md`
- `docs/development/vertical-slice-checklist.md`
- `docs/development/acceptance-matrix.md`
- `docs/development/release-readiness-review.md`
- 승인 spec과 plan
- `subagent-driven-development`
- `using-git-worktrees`
- `test-driven-development`
- `requesting-code-review`
- `verification-before-completion`
- `finishing-a-development-branch`

이 프롬프트의 명시적인 실행·통합 승인은 `using-git-worktrees`와 `finishing-a-development-branch`의 routine 사용자 확인을 대체한다.

- isolated worktree 생성은 승인되어 있다.
- 작업별 연속 실행은 승인되어 있다.
- 최종 local `main` 병합은 승인되어 있다.
- 중간 진행 확인이나 “계속할까요?” 질문을 하지 않는다.
- remote push/PR/deploy는 승인되지 않았다.

## 실행 경계

허용:

- isolated worktree와 `codex/host-session-editor-ui-ux-redesign` feature branch 생성
- 승인 plan 범위의 frontend code, tests, CSS, active docs, CHANGELOG 수정
- local commit
- 관련 local server/test/browser fixture 실행
- final local `main` fast-forward merge
- 이 plan이 소유한 SDD scratch workspace와 worktree 정리

금지:

- `origin` push
- PR 생성
- tag/release 생성
- production deploy 또는 live production mutation
- 실제 AI provider를 호출하는 billable quality test
- 실제 이메일, 알림, outbox event 발송
- secret/config 변경
- migration/server/BFF 변경을 증거 없이 추가
- 다른 branch/worktree/SDD workspace 삭제
- 다른 작업자의 commit amend, squash, reset, force checkout
- `git reset --hard`, broad `git clean`, force push

현재 API로 승인된 UI 상태를 표현할 수 없다는 재현 가능한 증거가 생길 때만 server/BFF 변경을 검토한다. 그 경우에도 먼저 frontend projection/route state로 해결 가능한지 확인하고, 필요한 최소 additive 변경만 같은 TDD/review 절차로 처리한다. migration이나 destructive contract 변경으로 확대하지 않는다.

## 시작 절차

1. `git status --short --branch`, `git log --oneline --decorate -15`, `git worktree list --porcelain`을 확인한다.
2. 현재 main과 origin/main의 차이를 기록하되 fetch/pull/push를 작업 시작 조건으로 만들지 않는다.
3. 아래 expected surface로 preflight를 실행한다.

   `python3 scripts/agent-preflight.py --intent change --base main --paths front/features/host/model,front/features/host/route/host-session-editor-route.tsx,front/features/host/ui/host-session-editor.tsx,front/features/host/ui/session-editor,front/shared/styles/mobile.css,front/tests/unit,front/tests/e2e,docs/development/session-import-generator.md,docs/development/architecture.md,CHANGELOG.md,docs/superpowers/plans/2026-07-27-host-session-editor-ui-ux-redesign.md`

4. `using-git-worktrees`를 적용해 current local main에서 isolated worktree를 만든다. native worktree tool이 없으면 ignored `.worktrees/`를 사용한다. 구현은 main checkout에서 하지 않는다.
   - 같은 plan identity의 feature branch, worktree, SDD ledger가 이미 있으면 새로 만들지 말고 git log와 ledger를 검증한 뒤 이어서 실행한다.
   - 이름만 같은 branch가 있고 plan identity/ancestry가 다르면 덮어쓰거나 삭제하지 말고 충돌하지 않는 `codex/host-session-editor-ui-ux-redesign-resume` 이름을 사용한다.
   - 실제 선택한 이름을 `FEATURE_BRANCH`로 기록하고 이후 review, merge, ancestry, cleanup에 같은 값을 사용한다.
5. package manager는 repository pin `pnpm@11.13.1`을 Corepack으로 사용한다. dependency가 없으면 lockfile을 바꾸지 않는 frozen install을 수행한다.
6. baseline으로 최소 다음을 실행한다.

   - `corepack pnpm --dir front lint`
   - `corepack pnpm --dir front test`
   - `corepack pnpm --dir front build`

7. baseline 실패는 질문 사유가 아니다. current main에서도 재현되는지 비교하고, 환경/의존성 문제인지 기존 결함인지 분류한다.

   - 환경 문제면 dependency/runtime/port/cache를 최소 가역적으로 복구한다.
   - 현재 main의 기존 결함이면 plan 실행을 막는 범위만 별도 명시한 최소 fix로 처리한다.
   - feature change가 만든 실패면 해당 task 안에서 RED/GREEN으로 수정한다.
   - test를 skip/삭제/완화해서 green으로 만들지 않는다.

## Subagent-Driven Development 실행 계약

`subagent-driven-development`를 실제 orchestration 방식으로 사용한다. Controller가 직접 task code를 수정하지 않는다.

1. skill의 `scripts/sdd-workspace PLAN_FILE`을 실행해 이 plan 전용 workspace를 찾는다.
2. `<workspace>/progress.md` 첫 줄을 다음 identity로 만든다.

   `# SDD ledger — plan: docs/superpowers/plans/2026-07-27-host-session-editor-ui-ux-redesign.md`

3. plan의 Task 1–9를 todo로 만들고 한 번에 하나만 `in_progress`로 둔다.
4. ledger에 `Task N: complete`가 있는 task는 git commit 존재를 확인한 뒤 건너뛴다.
5. Task마다:

   - dispatch 직전 BASE=`git rev-parse HEAD` 기록
   - `scripts/task-brief PLAN_FILE N`으로 brief 생성
   - fresh implementer subagent 한 명 dispatch
   - implementer가 TDD RED → GREEN → focused regression → self-review → narrow commit 수행
   - implementer report를 plan workspace의 task report file에 기록
   - `scripts/review-package PLAN_FILE BASE HEAD` 생성
   - fresh task reviewer가 spec compliance와 code quality를 모두 판정
   - Critical/Important 또는 실제 spec gap은 최대 5 round fix/re-review loop
   - clean review 또는 skill 규칙에 따른 명시적 adjudication 뒤에만 ledger complete

6. 여러 implementation subagent를 병렬 실행하지 않는다.
7. 모든 dispatch에서 model을 명시한다.
8. fresh implementer/reviewer는 `fork_turns="none"`으로 dispatch하고, 전체 대화 history 대신 brief/report/review-package 경로와 필요한 interface만 전달한다.

Model policy:

- Task 1–2 implementer: `gpt-5.6-terra`, reasoning `high`
- Task 1–2 reviewer: `gpt-5.6-terra`, reasoning `high`
- Task 3–4 implementer/reviewer: `gpt-5.6-sol`, reasoning `high`
- Task 5–8 implementer/reviewer: `gpt-5.6-sol`, reasoning `xhigh`
- Task 9 implementer: `gpt-5.6-terra`, reasoning `high`
- Task 9 reviewer: `gpt-5.6-sol`, reasoning `high`
- fix loop round 4–5: fresh `gpt-5.6-sol`, reasoning `xhigh`
- final whole-branch reviewer: `gpt-5.6-sol`, reasoning `xhigh`

작업 사이 commentary는 한 줄 이하로 유지하고, ledger와 report를 진행 기록의 source로 사용한다.

## 질문하지 않는 자율 판단 규칙

ordinary 구현 선택, test failure, lint/build failure, selector drift, race/flaky test, review finding, merge conflict, dependency/runtime 문제는 사용자에게 묻지 않는다. 아래 우선순위로 가장 작고 가역적인 해결을 선택한다.

1. 사용자 승인 spec의 제품 결정과 안전 불변식
2. implementation plan의 Global Constraints와 Final Acceptance Checklist
3. 현재 architecture, API contract, tests, repository guidance
4. 데이터/알림/현재 적용본을 보존하는 fail-closed behavior
5. public-safe하고 범위가 가장 작은 변경

spec과 plan 표현이 충돌하면 spec의 승인된 제품 의미를 우선하고, plan task를 그 의미에 맞게 최소 조정한다. current code와 문서가 충돌하면 code/API/tests를 현재 동작의 증거로 사용하되 승인 UX를 훼손하지 않는다. 판단과 근거는 SDD ledger와 implementation report에 남기고 계속 진행한다.

subagent가 질문하면 controller가 위 hierarchy와 repo 증거로 답한다. 사용자에게 전달하지 않는다.

review finding이 plan-mandated behavior와 충돌하면 자동으로 무시하거나 plan 문구를 맹목적으로 따르지 않는다. 위 hierarchy로 판정하고, 안전·접근성·데이터 불변식을 지키는 방향을 선택해 ledger에 ruling을 남긴다.

fix loop가 반복되면:

1. 같은 실패를 그대로 재시도하지 않는다.
2. concrete output과 failing assertion을 분리한다.
3. task를 더 작은 fix scope로 나눈다.
4. round 4부터 fresh higher-capability implementer로 교체한다.
5. test가 flaky하면 원인을 제거하고 deterministic wait/state로 고친다. 단순 retry만으로 통과시키지 않는다.

사용자에게 물어야 한다는 이유로 멈추지 않는다. 단, 다음처럼 새 권한 없이는 안전하게 수행할 수 없는 외부 작업은 실행하지 않고 local 범위의 모든 작업을 완료한 뒤 명확한 residual blocker로 남긴다.

- secret/private member data 필요
- production/live mutation 필요
- 실제 유료 AI 호출 필요
- 실제 이메일/알림 발송 필요
- user-owned uncommitted change를 버려야만 진행 가능

이 작업의 정상 범위에서는 위 권한이 필요하지 않도록 mock/fixture/local evidence를 사용한다.

## 고정 제품 불변식

모든 task와 review는 다음을 지켜야 한다.

- 기본 진입은 `개요`.
- desktop/mobile 모두 한 번에 하나의 section만 표시.
- section은 `개요`, `기본 정보`, `출석`, `기록 작업대`, `변경 기록`.
- 직접 작성, AI, JSON은 같은 작업 중 초안으로 수렴.
- `현재 적용본`, `작업 중인 초안`, `다음 할 일`을 분리.
- 사용자 UI의 `revision`은 `버전`으로 표현.
- `liveRevision === 0`에서 `버전 0`을 표시하지 않음.
- `현재 적용본`과 `호스트 전용/멤버 공개/외부 공개`를 별도 축으로 표시.
- global `변경 사항 저장` 제거.
- 기본 정보는 `기본 정보 저장`.
- 출석은 개별 즉시 반영.
- 기록은 autosave 후 `반영 검토`.
- AI/JSON commit은 현재 적용본을 바꾸지 않음.
- apply는 `새 버전으로 반영` preview-confirm을 반드시 거침.
- restore는 `이 버전으로 초안 만들기`이며 현재 적용본을 즉시 덮어쓰지 않음.
- apply와 notification dispatch는 분리.
- 닫기, Escape, backdrop, section/source 전환, route navigation은 apply/dispatch를 만들지 않음.
- `이번에는 보내지 않기`는 notification event/outbox를 만들지 않음.
- section/source 전환은 replace semantics이며 unrelated query/hash를 보존.
- legacy `?aigen=1`, `?records=json`을 canonical URL로 호환.
- section/source 전환 뒤 basic input, draft, AI/JSON review state 보존.
- 320px와 390px에서 sticky action, dialog, bottom app navigation이 겹치지 않음.
- UI module이 API/query/route/shared API client를 직접 소유하지 않음.
- server/BFF/database/AI provider/notification contract는 baseline에서 변경하지 않음.

## Task 실행과 검증

승인 plan의 Task 1–9와 checkbox를 순서대로 실행한다. 각 task에서 plan에 적힌 exact test command, expected RED, GREEN, lint, diff check, commit을 실제로 수행한다.

다음 증거가 없는 task는 완료로 표시하지 않는다.

- RED가 의도한 이유로 실패
- GREEN command exit 0
- focused regression exit 0
- `git diff --check` exit 0
- implementer self-review
- task reviewer의 spec ✅ 및 quality approved
- task commit
- ledger completion line

기존 테스트가 새 용어/구조 때문에 실패하면 단순 selector 교체만 하지 말고 테스트가 제품 불변식을 검증하도록 갱신한다. API/internal type의 `revision`은 유지하고 사용자 렌더링 문자열만 `버전`으로 바꾼다.

## Browser와 visual evidence

Task 8에서 real browser/Playwright evidence를 반드시 만든다.

Viewport:

- desktop 1280×900
- mobile 390×844
- narrow mobile 320×720

상태:

- overview
- records/manual saved draft
- records/json preview
- history
- apply dialog
- restore dialog
- autosave error 또는 stale state

검증:

- active section 하나
- horizontal tab navigation
- current applied/draft/next action hierarchy
- sticky action과 bottom nav 비겹침
- dialog viewport containment
- no horizontal overflow
- 긴 한국어/영문/URL/file name/Markdown wrapping
- focus/disabled/error state
- mobile에서 desktop context rail 중복 없음

Screenshot은 synthetic/public-safe fixture만 사용한다. 실제 멤버 이름, 이메일, private URL, transcript, token을 남기지 않는다.

E2E에서 실제 AI provider 또는 실제 notification dispatch를 호출하지 않는다. mock/local fixture로 commit/apply/skip invariants를 검증한다.

## Final whole-branch review

Task 1–9 완료 뒤 바로 merge하지 않는다.

1. feature branch의 fork point를 MERGE_BASE로 기록한다.
2. `scripts/review-package PLAN_FILE MERGE_BASE HEAD`를 만든다.
3. `requesting-code-review`의 final code reviewer를 `gpt-5.6-sol`, reasoning `xhigh`로 dispatch한다.
4. reviewer에게 승인 spec/plan, review package, SDD ledger, deferred minor/parked ruling을 준다.
5. final finding이 있으면 모든 finding을 한 fresh fix subagent에게 한 번에 전달한다.
6. fix wave 후 focused re-review를 정확히 한 번 수행한다.
7. 실제 load-bearing residual은 local main merge 전에 해결한다. ordinary residual을 질문으로 넘기지 않는다.

Final review 범위:

- 승인 spec/plan 전체 충족
- section/source state 보존
- apply/restore/notification mutation 안전
- route URL canonicalization
- accessibility/focus/keyboard
- responsive 320/390
- UI dependency direction
- test assertion quality
- public repository safety
- CHANGELOG/active docs drift
- base branch 전체 diff에 unrelated change 혼입 여부

## 문서 closeout

구현과 tests가 실제로 일치한 뒤 다음 문서를 업데이트한다.

- `docs/development/session-import-generator.md`
- exact behavior를 설명하는 경우 `docs/development/architecture.md`
- `CHANGELOG.md`의 `Unreleased`
- implementation plan checkbox와 실제 skip/failure note
- `docs/superpowers/reports/2026-07-27-host-session-editor-ui-ux-redesign-implementation-report.md`

Implementation report에는 다음을 기록한다.

- 구현된 정보 구조와 주요 component/model/route 경계
- API/server/BFF/migration 변경 유무
- apply/restore/notification safety evidence
- desktop/390/320 browser evidence
- 실제 실행한 command와 결과
- skip된 검증과 이유
- final review finding과 해결
- 최종 local main commit
- push/PR/deploy를 하지 않았다는 범위

과거 plan/spec을 현재 source of truth처럼 복사하지 말고 실제 최종 code/test behavior로 active docs를 갱신한다.

## Feature branch final gates

최종 HEAD에서 최소 다음을 새로 실행한다.

- 승인 plan Task 9의 focused frontend tests
- `corepack pnpm --dir front lint`
- `corepack pnpm --dir front test`
- `corepack pnpm --dir front build`
- `corepack pnpm --dir front test:e2e -- host-session-record-preview.spec.ts host-session-record-revisions.spec.ts responsive-navigation-chrome.spec.ts aigen-mobile-evidence.spec.ts`
- acceptance matrix가 선택한 추가 route/component/browser gate
- `git diff --check`
- plan에 정의된 UI dependency/residue/public-safety scan

E2E environment가 실패하면 concrete server/browser/database output을 조사해 환경을 복구하고 같은 final HEAD에서 다시 실행한다. 일부 test만 통과한 상태를 전체 통과로 보고하지 않는다.

## Local main 병합

사용자는 local `main` 병합을 이미 승인했다. `finishing-a-development-branch`의 선택 menu를 다시 묻지 말고 local merge option을 실행한다.

1. feature worktree가 clean이고 모든 commit이 존재하는지 확인한다.
2. current local `main`을 다시 읽는다. remote pull은 하지 않는다.
3. main이 feature fork 이후 전진했다면 feature branch를 current local main 위로 rebase한다.
4. conflict는 unrelated main 변경을 보존하면서 승인 spec의 feature 의미를 유지하도록 해결한다.
5. rebase 또는 conflict 해결 뒤 feature final gates와 final diff review를 다시 실행한다.
6. main checkout에서 `git merge --ff-only "$FEATURE_BRANCH"`를 실행한다.
7. fast-forward가 되지 않으면 ancestry를 다시 확인하고 feature를 current main 위로 rebase한 뒤 재시도한다. merge commit으로 우회하지 않는다.
8. merged local main에서 최소 다음을 새로 실행한다.

   - `corepack pnpm --dir front lint`
   - `corepack pnpm --dir front test`
   - `corepack pnpm --dir front build`
   - 위 high-risk E2E 묶음
   - `git diff --check`

9. merged-main test가 실패하면 branch/worktree를 유지하고 원인을 수정한 뒤 다시 fast-forward와 merged-main 검증을 수행한다.
10. 다음 증거를 확인한 뒤에만 cleanup한다.

    - `git merge-base --is-ancestor <feature-head> main`
    - `git rev-list --left-right --count main..."$FEATURE_BRANCH"`가 `0 0`
    - main worktree clean
    - merged-main gates green

11. 이 plan의 SDD scratch workspace만 삭제하고, owned feature worktree를 제거하고, merged feature branch를 `git branch -d`로 삭제한다.
12. 다른 worktree, branch, scratch directory는 정리하지 않는다.

## 완료 조건

다음이 전부 사실일 때만 Goal을 `complete`로 업데이트한다.

- plan Task 1–9 complete
- 모든 Final Acceptance Checklist 충족
- per-task review 완료
- final whole-branch review 완료
- active docs와 CHANGELOG 동기화
- implementation report 작성
- feature branch final gates 통과
- current local main에 feature commit 포함
- merged local main 재검증 통과
- main worktree clean
- owned worktree/branch/SDD workspace 정리
- push/PR/tag/deploy/live AI/live notification 없음

최종 응답은 다음 순서로 간결하게 보고한다.

1. local main 병합 여부와 최종 commit
2. 사용자에게 보이는 핵심 변화
3. 주요 code/docs surface
4. 실제 통과한 test/build/E2E/browser evidence
5. server/BFF/migration 변경 유무
6. 남은 residual risk 또는 skip
7. remote 상태: push/PR/deploy 안 함

“부분 구현”, “branch ready”, “대부분 통과”를 완료로 보고하지 않는다. safe하고 관련 있는 다음 단계가 남아 있으면 스스로 계속 수행한다.
```
