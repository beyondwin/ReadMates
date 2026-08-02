# 통합 멤버 프로필 및 30개 아바타 카탈로그 개편 자율 실행 Goal 프롬프트

아래 계약을 새 Codex 작업의 최상위 실행 지시로 사용한다. 이 작업은 설계나 계획을 다시 작성하는 작업이 아니다. 승인된 설계와 구현 계획을 현재 저장소에 끝까지 적용하고, 검증된 결과를 로컬 `main`에 통합하는 작업이다.

## 1. 최종 목표

승인된 통합 멤버 프로필 및 30개 아바타 카탈로그 개편을 테스트 주도 개발로 구현한다. 30개 아바타를 개별 crop·검수한 뒤 한 번만 섞은 고정 순서로 frontend, server, migration에 반영하고, 모든 아바타 사용처의 중첩 프레임을 제거한다. `/clubs/:clubSlug/app/me`에는 이름과 아바타를 함께 원자적으로 저장하는 adaptive 프로필 편집기를 구현한다. API, 권한, multi-club, stale runtime, 반응형·접근성·시각 회귀를 검증하고 독립 리뷰를 통과한 뒤 로컬 `main`에 fast-forward 통합하고 통합 HEAD를 다시 검증한다.

## 2. Goal 규칙

작업을 시작하자마자 Goal 상태를 한 번 확인한다.

1. 현재 작업에 미완료 Goal이 없으면 `create_goal`을 정확히 한 번 호출한다.
2. `objective`에는 위 최종 목표를 구체적으로 적는다.
3. 사용자가 token budget을 지정하지 않았으므로 `token_budget`은 넣지 않는다.
4. 이미 이 실행과 동일한 미완료 Goal이 있으면 새 Goal을 만들지 말고 그대로 재개한다.
5. 구현, 리뷰, 로컬 통합, 통합 HEAD 검증 중 하나라도 남아 있으면 Goal을 완료 처리하지 않는다.
6. 같은 외부 차단 조건이 Goal 규칙이 요구하는 횟수만큼 반복되기 전에는 `blocked`로 바꾸지 않는다. 일반적인 테스트 실패, 빌드 오류, 포트 충돌, stale process, crop 보정, 리뷰 finding은 차단 사유가 아니라 해결할 작업이다.
7. 모든 완료 조건을 충족했을 때만 `update_goal(status="complete")`를 호출한다.

## 3. 고정된 승인 문서와 기준점

다음 두 문서가 제품 범위와 구현 순서의 source of truth다.

- 설계: `docs/superpowers/specs/2026-08-02-integrated-member-profile-avatar-catalog-redesign.md`
- 구현 계획: `docs/superpowers/plans/2026-08-02-integrated-member-profile-avatar-catalog-redesign.md`

고정 기준:

- 승인 설계 커밋: `36c92417`
- 승인 구현 계획 커밋: `a18c82dd`
- 구현 계획의 8개 Task와 Global Constraints를 순서대로 모두 수행한다.
- 과거 animal-avatar/name-editor 문서는 역사 기록일 뿐이며 이 범위의 source of truth가 아니다.
- starter message가 제공하는 canonical repository와 local-only source input document를 사용한다. 로컬 절대 경로와 원본 source sheet는 tracked 파일, 테스트 fixture, 로그 요약, 커밋 메시지나 최종 응답에 복사하지 않는다.

시작 전에 다음을 확인한다.

```bash
git -C "$CANONICAL_REPO" status --short --branch --untracked-files=all
git -C "$CANONICAL_REPO" merge-base --is-ancestor 36c92417 main
git -C "$CANONICAL_REPO" merge-base --is-ancestor a18c82dd main
python3 "$CANONICAL_REPO/scripts/agent-preflight.py" \
  --intent change \
  --paths front,server,design/system,docs/development/architecture.md,CHANGELOG.md
```

승인되지 않은 기존 변경이 발견되면 덮어쓰거나 폐기하지 않는다. 구현과 겹치지 않으면 그대로 보존하고, 겹치면 CPE의 별도 worktree 안에서 승인 기준점으로 구현해 결과를 완성한 뒤 통합 직전에 정확한 충돌만 판정한다.

## 4. 반드시 읽고 적용할 지침과 스킬

코드를 수정하기 전에 다음 파일을 완전히 읽는다.

- `AGENTS.md`
- `docs/agents/execution.md`
- `docs/agents/front.md`
- `docs/agents/server.md`
- `docs/agents/design.md`
- `front/AGENTS.md`
- `server/AGENTS.md`
- `docs/development/architecture.md`
- `docs/development/acceptance-matrix.md`

다음 스킬을 완전히 읽고 그 절차를 적용한다.

- `test-driven-development`
- `test-driven-development/writing-good-tests.md` 또는 TDD 스킬이 지정한 동등한 테스트 품질 문서
- `subagent-driven-development`
- `systematic-debugging`
- `requesting-code-review`
- `verification-before-completion`
- `finishing-a-development-branch`

이 계약에서는 CPE가 격리 worktree와 실행 연속성을 소유한다. CPE worker 안에서 별도의 두 번째 구현 worktree를 만들지 않는다. `subagent-driven-development`의 plan별 ledger, task brief, task reviewer, fix loop, final whole-branch review 규칙은 그대로 지킨다.

## 5. 단 하나의 CPE 실행 런

이 새 작업은 supervisor다. 제품 코드를 supervisor가 즉흥적으로 고치지 말고, 승인 문서를 CPE에 넘겨 `subagent-driven-development`로 실행한다.

starter message가 제공한 값을 사용해 다음과 같이 정확히 하나의 CPE run을 만든다.

```bash
CPE_SCRIPT="<starter message가 제공한 cpe.py>"
EXECUTION_BASE="$(git -C "$CANONICAL_REPO" rev-parse main)"

python3 "$CPE_SCRIPT" run \
  --document "$CANONICAL_REPO/docs/superpowers/plans/2026-08-02-integrated-member-profile-avatar-catalog-redesign-goal-prompt.md" \
  --document "$CANONICAL_REPO/docs/superpowers/specs/2026-08-02-integrated-member-profile-avatar-catalog-redesign.md" \
  --document "$CANONICAL_REPO/docs/superpowers/plans/2026-08-02-integrated-member-profile-avatar-catalog-redesign.md" \
  --document "$LOCAL_SOURCE_INPUT_DOCUMENT" \
  --workspace "$CANONICAL_REPO" \
  --superpowers-skill subagent-driven-development \
  --base "$EXECUTION_BASE"
```

출력된 `RUN_ID`를 작업의 유일한 실행 ID로 기록한다.

- 오류, 프로세스 종료, context compaction, `execution_ledger_invalid`, 검증 실패가 발생해도 새 run을 만들지 않는다.
- 먼저 같은 `RUN_ID`를 `inspect`하고, 원인을 수정할 수 있으면 동일 run을 `resume`한다.
- CPE와 SDD ledger, git log를 복구 source of truth로 사용한다. 완료된 Task를 다시 실행하지 않는다.
- CPE가 terminal 상태가 될 때까지 상태를 추적한다. 단순히 run을 생성한 것은 완료가 아니다.
- CPE의 `handed_off`는 feature branch 구현 완료 신호일 뿐 전체 Goal 완료가 아니다. supervisor가 아래 통합 절차를 끝내야 한다.

## 6. TDD 불변 규칙

모든 동작 변경과 bugfix는 다음 순서를 지킨다.

1. 요구사항을 증명하는 가장 작은 테스트를 먼저 작성한다.
2. 그 테스트를 실행해 예상한 이유로 실패하는 RED를 실제로 관찰한다.
3. 실패가 test typo, fixture 오류 또는 환경 문제라면 올바른 RED가 될 때까지 테스트를 고친다.
4. 통과에 필요한 최소 구현만 작성한다.
5. 같은 테스트가 GREEN이 되는 것을 관찰한다.
6. 관련 회귀 테스트를 실행한 뒤에만 refactor한다.

생산 코드를 먼저 작성했거나 RED를 관찰하지 못했다면 그 구현을 테스트 근거로 인정하지 않는다. 작업자가 새 오류나 결함을 발견하면 먼저 그 결함을 재현하는 failing regression test를 추가한 뒤 수정한다. 테스트를 삭제·skip·완화하거나 assertion을 무의미하게 바꿔 통과시키지 않는다.

각 Task의 SDD report와 ledger에는 최소한 다음 증거가 있어야 한다.

- RED 명령, 핵심 실패 원인, exit status
- GREEN 명령, 통과 결과, exit status
- focused regression과 Task가 요구한 넓은 gate 결과
- 구현 커밋과 task review verdict
- fix round가 있다면 finding, covering test, re-review verdict

Asset 생성처럼 바이너리 산출물이 포함된 Task도 manifest/inventory/alpha/safe-margin/edge-contamination 검사를 먼저 RED로 만들고, 계획의 육안 QA를 자동 검사 대신 생략하지 않는다.

## 7. 자율 판단과 오류 복구 규칙

중간 승인이나 “계속할까요?”를 묻지 않는다. 계획에 명시된 선택은 다시 토론하지 않는다. 일반적인 구현 세부사항은 다음 우선순위로 가장 좁고 되돌릴 수 있는 해법을 선택한다.

1. 승인 설계의 불변 조건
2. 승인 구현 계획의 Task와 exact value
3. 현재 architecture와 package boundary
4. 기존 테스트와 인접 코드 pattern
5. 최소 범위, fail-closed, public-safe 선택

오류가 나면 symptom을 우회하지 말고 `systematic-debugging`으로 root cause를 찾는다.

- 테스트 실패: failing test를 보존하고 원인을 수정한다.
- 새 결함: failing regression test를 먼저 만든다.
- build/cache 문제: 저장소 고정 package manager와 깨끗한 격리 cache로 재현한다.
- 포트 충돌: 기존 프로세스를 종료하지 말고 alternate port와 고유 container project를 쓴다.
- stale backend 또는 403: 요청 contract, 실행 중인 binary/version, security route를 확인하고 격리 backend를 새 build로 재시작한 뒤 실제 mutation smoke를 반복한다.
- migration/Testcontainers 문제: 기존 schema나 이전 migration을 수정하지 말고 V45 forward path와 test fixture를 고친다.
- crop clipping/이웃 oval 오염: 선택 slot이나 30-key 계약을 바꾸지 말고 해당 TSV row와 masking/scale만 보정한 후 전체 QA를 다시 실행한다.
- flaky test: 무작정 재실행해 통과로 처리하지 말고 timing/state 원인을 고치고 안정성을 반복 검증한다.
- reviewer finding: SDD fix loop와 scoped re-review를 끝까지 수행한다. controller가 리뷰 없이 직접 고치지 않는다.

사용자 입력이 정말 필요한 경우는 승인 문서끼리 해결할 수 없는 모순, 기존 사용자 변경을 보존하면서 통합할 수 없는 충돌, 새로운 외부 권한, destructive data operation, push/deploy/live mutation처럼 현재 권한을 넓혀야 하는 경우뿐이다. 그 전에는 안전한 대안을 모두 소진한다.

## 8. 제품 불변 조건

아래 조건은 구현 편의를 위해 바꿀 수 없다.

- source sheet 유지 slot은 정확히 `1:[6,9]`, `2:[1,2,5,8]`, `3:[1,2,4,8]`, `4:[1,4,5,10]`, `5:[1,4,5,10]`, `6:[1,2,5,7,8]`, `7:[1,2,3,4,6,7,8]`다.
- 최종 asset은 정확히 30개 256×256 WebP이며 source oval과 subject만 남고 바깥은 투명하다. 이웃 oval fragment가 없고 최소 8% safe margin이 있다.
- 30개를 모두 crop·소형 QA한 뒤 정확히 한 번만 섞는다. runtime shuffle은 금지하고 literal order를 frontend manifest, server enum, V45 assignment에 동일하게 고정한다.
- `cloud-green-book`은 shuffled 위치와 관계없이 unknown/decode/anonymous/left-member fallback이다.
- 일반 상태의 로컬 artwork는 이미지의 cream oval 한 겹만 보인다. `AvatarChip` 원형 frame, picker의 상시 사각 frame, 중첩 selection/focus ring을 만들지 않는다.
- 참석 명단, 현재 세션 board, 기록, host member 관리, navigation, account menu, public record를 포함한 모든 shared `AvatarChip` consumer를 확인한다.
- own profile 저장은 `PUT /api/me/profile?clubSlug=<current-club>`과 required `{displayName, avatarKey}` 하나의 transaction이다. club context 누락·불일치는 fail closed다.
- compatibility 기간 동안 기존 `PATCH /api/me/profile`과 `PATCH /api/me/avatar`는 유지하되 새 30-key vocabulary만 허용하고 새 UI는 호출하지 않는다.
- UI 의존 방향은 `route -> ui`, `route -> queries -> api`; server 의존 방향은 승인 설계의 hexagonal boundary를 유지한다.
- V44 이하 migration은 수정하지 않고 V45만 추가한다.
- upload, 사용자 crop, 외부 URL, Google image, runtime generation, avatar history/category/search, 타인 avatar 편집은 추가하지 않는다.

## 9. 작업별 실행과 리뷰

구현 계획의 Task 1부터 Task 8까지 순서대로 실행한다.

- Task마다 fresh implementer를 사용하고 동시에 여러 implementer가 같은 worktree를 수정하지 않게 한다.
- Task brief는 SDD helper가 생성한 파일 하나를 요구사항 source로 사용한다.
- 각 Task 구현자는 테스트를 먼저 RED로 만들고 구현·GREEN·focused regression·self-review·commit까지 수행한다.
- 매 Task 뒤에는 spec compliance와 code quality를 모두 판정하는 독립 task review를 수행한다.
- Critical/Important 또는 실제 spec gap은 SDD fix loop로 수정하고 scoped re-review한다.
- 완료 Task, commit range, test evidence, review 결과를 plan별 ledger에 즉시 기록한다.
- 마지막에는 merge base부터 HEAD까지 전체 branch diff를 가장 강한 reviewer로 독립 검토한다.
- final review finding은 한 번의 통합 fix wave와 한 번의 scoped re-review로 처리한다. load-bearing finding이 남으면 완료 처리하지 않는다.

## 10. 필수 런타임·시각 증거

구현 계획의 exact commands를 우선한다. 최소한 다음 종류의 증거를 실제로 만든다.

- frontend manifest와 30개 on-disk asset equality, fallback, fixed-order, traversal, RIFF/WebP 검사
- 30개 원본 crop contact sheet와 20/22/24/26/28/32/46/52/72px small-size QA
- alpha outer band, safe margin, edge contamination 자동 검사와 전 항목 육안 검사
- server exact key/order/fallback, V45 idempotent assignment semantics, named constraint, transaction rollback, club scope, auth contract 테스트
- frontend API/query/route/editor tests에서 단일 PUT, optimistic/local draft가 아닌 authoritative response 반영, error mapping, permission loss, double-submit, discard 확인 검증
- desktop 1280px right panel, mobile 320/390px full-screen, 200% zoom, keyboard/focus/escape/scroll lock/component screenshot 증거
- 참석 명단과 모든 shared avatar consumer에서 중첩 frame과 상태 의미 혼합이 없는지 회귀 확인
- 새로 build한 격리 backend를 사용한 실제 `PUT /api/me/profile` local smoke. 403, 잘못된 club, invalid key, 성공 response와 reload persistence를 구분해 검증
- frontend lint/test/build, server PR gate, 필요한 integration/Testcontainers, auth/BFF 관련 E2E를 계획대로 실행

시각 증거는 screenshot test가 생성됐다는 사실만으로 통과시키지 않는다. 실제 이미지를 열어 crop 오염, clipping, 중첩 원·사각 frame, 모바일 overflow, desktop panel hierarchy를 직접 검사한다.

## 11. CPE handoff 이후 로컬 통합

CPE가 `handed_off`를 반환하면 같은 `RUN_ID`의 receipt, ledger, feature worktree와 branch를 inspect한다.

1. 8개 Task가 모두 complete인지 확인한다.
2. final whole-branch review와 필요한 fix re-review가 clean인지 확인한다.
3. feature worktree가 clean하고 모든 변경이 의도적인 커밋인지 확인한다.
4. 계획의 최종 검증 결과가 실제 command output과 일치하는지 확인한다.
5. canonical `main`이 실행 시작 이후 바뀌었는지 확인한다.
6. `main`이 앞섰다면 feature branch를 최신 local `main` 위에 안전하게 재정렬하고 충돌을 해결한 뒤 영향 검증을 다시 수행한다. unrelated 사용자 변경을 버리거나 force update하지 않는다.
7. canonical repository가 clean하고 fast-forward 가능한 경우에만 local `main`으로 `git merge --ff-only <feature-branch>` 한다.
8. push, PR, tag, deploy는 하지 않는다.
9. 통합된 `main` HEAD에서 계획의 focused regression과 canonical frontend/server/E2E gates를 다시 실행한다. merged-path 증거가 없는 상태에서 완료라고 하지 않는다.
10. 통합 HEAD가 clean하고 검증됐을 때만 CPE/SDD가 만든 이 계획 전용 worktree와 scratch를 정리한다. 다른 worktree, branch, cache, container, process는 건드리지 않는다.

통합 중 새 결함이 나타나면 같은 Goal과 같은 CPE run의 복구 맥락을 유지한다. 필요한 failing regression test와 fix/review를 feature branch에서 수행한 뒤 다시 fast-forward 통합한다.

## 12. 권한 경계

허용됨:

- repository 구현과 테스트·문서 변경
- 격리 local worktree, local branch, local test DB/container, alternate port
- 승인된 source sheet의 local crop과 ignored QA artifact
- task별 commit과 검증 완료 후 local `main` fast-forward 통합

허용되지 않음:

- remote push, PR 생성·merge, release tag, deploy
- production 또는 실제 member data mutation
- 실서비스 OAuth, email, AI provider 같은 billable/user-impacting action
- 기존 사용자 변경, unrelated branch/worktree/process/container 삭제
- 테스트 skip·완화, migration history 수정, public repository에 private path·data 저장

## 13. 완료 조건과 최종 보고

다음을 모두 충족해야 Goal을 완료한다.

- 승인 구현 계획의 8개 Task 완료
- 모든 동작 변경과 발견 bug에 유효한 RED → GREEN 증거 존재
- 정확히 30개 asset과 고정 shuffled order가 frontend/server/V45에서 일치
- crop·small-size·global consumer·adaptive editor 시각 검수 완료
- 단일 PUT의 transaction, club scope, auth, stale runtime 사각지대 검증 완료
- task review와 final whole-branch review의 load-bearing finding 0개
- 모든 변경이 local `main`에 fast-forward 통합됨
- 통합 `main` HEAD의 필수 gate 통과
- canonical repository clean
- push/PR/tag/deploy/live mutation 없음

최종 응답은 다음만 간결하고 증거 중심으로 보고한다.

- 변경된 frontend/server/design-system/migration/docs surface
- 최종 30-key fixed order와 asset QA 결과
- 실제 RED/GREEN, focused, full, browser/runtime 명령과 결과
- task/final review 결과와 해결한 결함
- local `main` 통합 commit/HEAD와 clean 상태
- 실행하지 않은 검증과 남은 위험이 있다면 정확한 이유
- remote 작업을 하지 않았다는 명시

검증하지 않은 것을 통과했다고 말하지 않는다. 위 완료 조건이 하나라도 남으면 Goal을 완료 처리하지 않고 같은 실행을 계속한다.
