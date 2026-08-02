# ReadMates Avatar Scale And Selection UX Goal Prompt

아래 프롬프트를 새 Codex 작업의 최초 메시지로 사용한다.

---

당신은 현재 ReadMates 저장소 루트에서 승인된 아바타 크기와 선택 UX 개선을 끝까지 구현하는 실행 책임자다.

## 완료 목표

이번 작업을 시작할 때 `create_goal`을 정확히 한 번 호출한다. `token_budget`은 지정하지 말고 다음 단일 목표를 등록한다.

> 승인된 ReadMates 아바타 크기 및 선택 UX 계획을 subagent-driven-development 방식으로 완전히 구현하고, 모든 필수 프런트엔드 검증과 전체 브랜치 리뷰를 통과시킨 뒤, 검증된 결과를 로컬 main에 통합하고 깨끗한 최종 상태로 마무리한다.

Goal을 만든 뒤에는 구현, 검토, 결함 수정, 재검증, 로컬 `main` 통합까지 중단 없이 진행한다. 목표가 실제로 달성되고 필수 작업이 남지 않았을 때만 Goal을 `complete`로 표시한다.

## 승인된 소스 오브 트루스

- 설계: `docs/superpowers/specs/2026-08-02-avatar-scale-and-selection-ux-design.md`
- 구현 계획: `docs/superpowers/plans/2026-08-02-avatar-scale-and-selection-ux.md`
- 저장소 지침: 루트 `AGENTS.md`, `docs/agents/execution.md`, `docs/agents/front.md`, `docs/agents/design.md`, `front/AGENTS.md`
- 위험별 검증 선택: `docs/development/acceptance-matrix.md`

설계와 구현 계획은 사용자 승인 완료 상태다. 일반적인 디자인 방향이나 범위를 다시 묻지 말고 그대로 실행한다.

## 필수 실행 방식

1. 시작 직후 현재 저장소와 브랜치 상태를 읽고 위 지침과 소스 오브 트루스를 모두 확인한다.
2. `$subagent-driven-development` 스킬을 반드시 사용한다. 해당 스킬이 요구하는 `$using-git-worktrees`, `$test-driven-development`, `$systematic-debugging`, `$requesting-code-review`, `$verification-before-completion`, `$finishing-a-development-branch`도 각 단계에서 적용한다.
3. 구현은 현재 `main`을 직접 수정하지 말고 현재 `main` HEAD를 기준으로 격리된 worktree에서 수행한다. 새 Codex 작업에 이미 전용 worktree와 feature branch가 배정되어 있으면 그것을 SDD workspace로 사용하고 중첩 worktree를 만들지 않는다. 직접 격리가 필요한 경우에만 `codex/avatar-scale-selection-ux` 브랜치와 별도 worktree를 만든다.
4. `subagent-driven-development`의 ledger를 생성하고 각 계획 Task를 순서대로 실행한다. Task마다 새 implementer를 배정하고, RED/GREEN 증거와 task commit을 남긴 뒤 task reviewer의 spec compliance 및 code quality 검토를 수행한다.
5. reviewer가 발견한 결함은 같은 Task 안에서 수정하고 해당 검사를 다시 통과시킨다. 다음 Task로 넘어가기 전에 현재 Task의 review verdict가 `PASS`인지 확인한다.
6. 모든 Task가 끝나면 새 reviewer로 전체 diff와 브랜치를 다시 검토하고, 발견된 문제를 수정한 뒤 최종 검증을 반복한다.
7. 각 subagent dispatch에는 사용 가능한 모델을 명시한다. 구현과 최종 review에는 가장 강한 코딩 모델을, 좁고 기계적인 검토에는 적절한 모델을 선택하되 품질을 속도보다 우선한다.

## 자율 처리 권한과 경계

- 계획 범위 안에서 발견한 결함, 테스트 실패, responsive 문제, 접근성 문제, 타입 오류, 스타일 회귀와 누락된 관련 consumer는 사용자에게 묻지 말고 원인을 진단해 직접 고친다.
- 계획의 의도를 보존하는 작은 개선, 테스트 보강, 안전한 리팩터링은 스스로 판단해 포함할 수 있다. ledger와 task commit에 이유와 증거를 남긴다.
- 명령 실패나 환경 문제는 한 번 보고 멈추지 말고 원인을 조사해 안전한 대체 경로로 복구한다. Corepack 또는 Docker 같은 필수 실행 환경도 저장소 지침에 맞춰 스스로 해결한다.
- 구현 도중 사용자 승인 체크포인트를 만들거나 보통의 선택을 질문하지 않는다. 긴 실행에서도 계속 다음 안전한 작업을 진행한다.
- 다른 사용자의 변경을 덮어쓰거나 삭제하지 않는다. 격리 worktree에서 작업하고, 예상하지 못한 변경이 보이면 ancestry와 diff를 확인해 보존한다.
- 서버, BFF, API, DB, avatar key, catalog 순서, asset 및 저장 payload 계약은 변경하지 않는다.
- 실제 회원 데이터, 비밀값, 배포 정보나 로컬 절대 경로를 소스, fixture, 문서 또는 커밋에 추가하지 않는다.
- 커밋, feature branch 작업, 검증 후 로컬 `main` 병합과 사용한 feature worktree/branch 정리는 승인되어 있다.
- 원격 push, PR 생성, tag, deploy, live data 변경은 승인 범위가 아니므로 수행하지 않는다.
- 오직 승인된 설계와 현재 아키텍처가 서로 양립할 수 없는 경우, 복구 불가능한 데이터 손실 위험이 있는 경우, 또는 필요한 private data/권한이 실제로 없는 경우에만 중단 사유를 보고한다. 그 외 결함과 개선은 자율적으로 끝까지 처리한다.

## 구현 불변 조건

- semantic avatar role과 desktop/mobile 크기는 구현 계획의 정확한 값을 사용한다.
- 브랜드 마크는 desktop/mobile 모두 32px로 줄이고 내부 책 SVG나 다른 navigation icon은 건드리지 않는다.
- My Space에는 `나의 아바타 · <서정 이름>`을 supporting text로 표시한다.
- 프로필 편집의 아바타 행 전체가 한 개의 명확한 선택 버튼이어야 하며, `눌러서 다른 아바타 선택`과 chevron, 현재 서정 이름을 보여준다.
- picker는 desktop 5열, mobile 3열이며 모든 서정 이름을 생략 없이 표시한다.
- 선택 표시는 승인된 B안인 accent-filled 원형 배지와 흰색 round-cap SVG check를 사용한다. 배지는 타일 안쪽에 완전히 들어가고 별도 raster asset을 만들지 않는다.
- `aria-pressed`, focus-visible, hover, selected가 서로 구분되고 color-only 표현이 되지 않아야 한다.
- profile draft, dirty-close, focus trap, opener focus restoration, disabled, save error, wire key 저장 동작은 유지한다.
- 모든 user-facing member, host, public/guest avatar consumer를 역할 기반 크기로 통일하고 platform-admin 전용 표면은 제외한다.

## 필수 검증

각 Task의 focused Vitest/Playwright component test를 RED에서 GREEN으로 통과시킨다. 마지막에는 최소한 아래 canonical gate를 정확히 실행한다.

```bash
corepack pnpm --dir front test:ct:update
corepack pnpm --dir front test:ct
corepack pnpm --dir front test:e2e -- tests/e2e/account-navigation-avatars.spec.ts
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
git diff --check
```

- component baseline은 Docker-backed 명령으로만 생성하고 검증한다.
- 320px, 390px, 1280px에서 크기, grid 열 수, label wrapping, badge containment, sticky footer, overflow와 focus를 확인한다.
- 테스트 결과, Playwright report, 임시 screenshot 등 생성 artifact는 커밋하지 않는다.
- 실패한 검사는 원인을 수정한 뒤 다시 실행한다. 실행하지 못한 검사를 통과했다고 보고하지 않는다.

## 커밋과 로컬 main 통합

1. 각 Task는 리뷰 가능한 좁은 commit으로 남기고 unrelated change를 포함하지 않는다.
2. 전체 review가 통과하고 feature branch가 깨끗하면 `$finishing-a-development-branch` 절차로 통합한다.
3. 원래 checkout의 로컬 `main` 상태와 ancestry를 확인한다. 가능하면 `--ff-only`로 병합하고, 불가능하면 unique commit과 충돌을 검토한 뒤 변경을 보존하는 안전한 병합을 수행한다.
4. 병합된 로컬 `main`에서 lint, 전체 frontend test, build, `git diff --check`를 다시 실행한다. 시각 baseline 또는 통합 경계가 병합에 의해 달라질 가능성이 있으면 CT/E2E도 재실행한다.
5. 로컬 `main`이 구현 commit을 포함하고 최종 검증이 통과하며 worktree가 깨끗한 것을 확인한 뒤에만 feature worktree와 병합 완료 feature branch를 정리한다.
6. 원격에는 push하지 않는다.

## 최종 보고

최종 응답에는 다음 증거를 간결하게 포함한다.

- 변경한 frontend 표면과 핵심 UX 결과
- task commit 및 로컬 main 통합 commit/HEAD
- 실제로 실행한 검증 명령과 결과
- reviewer verdict와 수정한 결함 요약
- skipped validation 또는 남은 위험. 없다면 없다고 명시
- 원격 push를 하지 않았으며 결과가 로컬 `main`에 있다는 사실

Goal을 `complete`로 표시한 결과에 token usage가 포함되면 최종 응답에 그대로 기록한다.
