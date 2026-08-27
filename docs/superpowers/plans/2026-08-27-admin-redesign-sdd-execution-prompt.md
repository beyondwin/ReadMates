# 어드민 재설계 SDD 실행 프롬프트 (ADR-0047)

아래 전문을 새 에이전트 세션에 그대로 붙여넣어 실행한다. (이 파일 자체는 실행 대상이 아니라 프롬프트 보관본이다.)

ADR impact: new — ADR-0047

---

/subagent-driven-development 스킬로 ReadMates 플랫폼 어드민 재설계를 처음부터 끝까지 구현해줘. 너는 컨트롤러다. 아래 계약을 그대로 따른다.

## 0. 역할과 자율 계약

- 너는 사람 개입 없이 이 작업을 **끝까지** 완료한다. 진행 중 결함·에러·계획 모순·모호함이 나오면 **나에게 묻지 말고** SDD 스킬의 Ruling 절차로 스스로 최선을 결정하고, 모든 결정을 ledger에 `Ruling:` 으로 기록한 뒤 계속 진행한다. "계속할까요?" 류의 중간 확인 메시지 금지.
- 멈춰도 되는 경우는 단 네 가지: ① 워크트리 밖을 파괴하는 비가역 조작(원격 브랜치 강제 조작, 파일 시스템 광역 삭제) ② 시크릿/실계정 정보가 필요할 때 ③ 공유 브랜치 push / `main` 머지 / 배포 ④ 모든 전진 경로가 추측인 계획 결함. 이 넷 외의 모든 상황은 Ruling으로 통과한다.
- **원격에 푸시하지 않는다. main에 머지하지 않는다.** 모든 커밋은 로컬 feature 브랜치에 남기고, 마지막에 `superpowers:finishing-a-development-branch` 옵션 제시로 끝낸다.
- 서버(API·schema·auth·capability·safe-command) 계약은 절대 바꾸지 않는다. UI가 요구하는 필드가 응답에 없으면 조건부 렌더로 구현하고 2~6단계 계획의 `## 실행 중 발견` 또는 ledger에 서버 후속으로 기록한다. 가짜 값 생성 금지.
- 실행하지 못한 검증은 통과했다고 쓰지 않는다 — 건너뛴 명령과 이유를 최종 보고에 명시한다.
- 구현 서브에이전트를 동시에 둘 이상 돌리지 않는다. 2~6단계가 한 파일에 있어도 그 안의 단계는 **2→3→4→5→6 순서로만** 실행한다.

## 1. 시작 절차

1. `git status --short --branch` 확인. `superpowers:using-git-worktrees` 스킬로 **현재 `main`(설계·ADR·계획이 이미 머지된 커밋)** 기준 격리 워크트리를 만들고, 구현 브랜치 이름은 `codex/admin-case-desk-implementation` 으로 한다.
   - 설계 문서만 있던 옛 브랜치 `codex/admin-case-desk-redesign` 를 구현 베이스로 쓰지 않는다.
   - 이미 이 구현 브랜치의 격리 워크트리에 있으면 새 워크트리를 또 만들지 않는다.
2. 저장소 라우터 `AGENTS.md`와 `docs/agents/front.md`, `docs/agents/design.md`, `docs/agents/execution.md`, `front/AGENTS.md`를 읽는다. 프런트 검증 명령·공개 저장소 안전 규칙은 이 문서들이 권위다.
3. 다음 문서를 **권위 순서대로** 읽는다:
   - 스펙(최상위): `docs/development/2026-08-27-readmates-admin-case-desk-narrative-redesign-design.md`
   - ADR: `docs/development/adr/0047-admin-case-desk-narrative-composition.md` (Proposed)
   - 계획 1: `docs/superpowers/plans/2026-08-27-admin-language-stage1.md`
   - 계획 2: `docs/superpowers/plans/2026-08-27-admin-case-desk-stages2-6.md` (안의 **적응 실행 규약**은 모든 태스크에 구속력)
   - 시각 참고(비규범): `design/mockups/2026-08-27-admin-case-desk/` — 시안과 스펙이 다르면 **스펙 서술이 이긴다**. 구현 후 시각 권위는 tracked CT 스크린샷이다.
   - 현행 시각 계약: `front/DESIGN.md` §Editorial Operations Ledger
4. `/subagent-driven-development` 를 **계획 파일 하나 = SDD 플랜 하나**로 두 번 돌린다. 인덱스가 아니라 위 두 계획 파일이 플랜이다.

## 2. 실행 순서 (고정)

각 플랜마다: 해당 파일로 SDD 태스크 루프를 완주한다 → 공통 게이트를 통과한다 → 다음 플랜으로 간다. 앞 단계가 코드를 바꾼 뒤 문서의 파일·행 참조가 낡을 수 있으므로, 각 계획의 **Task 0 / 앵커 재확인을 건너뛰지 않는다.**

1. `docs/superpowers/plans/2026-08-27-admin-language-stage1.md`
   용어 사전 통일. 화면 구조·내비 그룹 변경 없음. 커밋 프리픽스 `feat(admin-lang):` / `test(admin-lang):`.
2. `docs/superpowers/plans/2026-08-27-admin-case-desk-stages2-6.md`
   한 파일 안의 단계를 순서대로 완주한다. **내비 4축 스위치는 6단계가 마지막이다.**
   - 2단계: 알람 요약 바 + 서사형 건강
   - 3단계: 오늘 케이스 데스크 보강 (도켓 순회, 무시 사유 필수)
   - 4단계: 원장형 셸 통일 (운영 기입·접근·분석)
   - 5단계: 파이프라인 재편 (배달 원장·AI 작업 원장)
   - 6단계: 클럽 상세 재조립 + 내비 4축 전환. 구 경로 리다이렉트.

1단계가 만든 카피 모듈 이름이 권위다 (`admin-copy.ts` 등 1단계 계획이 정한 파일). 2~6단계 본문이 다른 파일명을 쓰면 1단계 산출물을 가리키는 것으로 해석한다.

단계 게이트(계획에 더 큰 게이트가 있으면 그걸 우선):

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

2~6단계는 계획이 admin e2e를 요구한다:

```bash
pnpm --dir front test:e2e
```

CI 패리티가 필요하면 `corepack pnpm --dir front ...`. 계획 본문이 `pnpm --dir front`를 쓰더라도 저장소 권위 명령은 `pnpm --dir front`다. 사용한 명령을 보고한다.

로컬 인프라 부재로 e2e를 못 돌리면 통과 주장 금지, 최종 보고에 명령과 사유를 남긴다. **6단계는 내비 전환이므로 e2e 없이 완료 선언하지 않는다.** tracked CT가 달라진 단계는 재잠금 후 커밋한다.

## 3. 판단 기준 (Ruling 시 권위 순서)

1. 스펙 §5(명령 마찰 3등급)·§6(용어 사전)·§7(페이지 타입 3종: 데스크형/원장형/서사형)·§8(비범위) — 최상위.
2. ADR-0047 결정문. signal→case→docket→command→receipt 운영 문법과 ADR-0040 safe-command 계약은 유지한다.
3. ADR-0039의 작업 중심 Service Spine은 계승하되, 내비 축은 스펙의 오늘·클럽·파이프라인·원장(+비상 레인 긴급 회수)으로 재정의한다. 이 서술 갱신은 6단계 승격 커밋에서만 한다.
4. 해당 단계 계획의 Global Constraints와 적응 실행 규약. 계획의 파일·행 앵커가 코드와 어긋나면 스펙을 지키는 쪽으로 계획을 수정하고 진행한다.
5. `docs/agents/front.md` 라우트-퍼스트 의존 방향, `docs/agents/design.md`의 조용한 원장 톤, `front/DESIGN.md`.
6. 기존 코드 관례.

특기 사항:

- **호스트 재설계(ADR-0046)와 섞지 않는다.** 어드민 표면(`/admin/**`, `front/features/platform-admin/**`)만 만진다. 호스트 라우트·카피·내비는 이 작업 범위가 아니다.
- 멤버/게스트/퍼블릭 composition 변경 금지.
- 1단계에서는 내비 그룹(오늘/클럽/서비스/검토) 재편 금지 — 라벨만 바꾼다. 4축 전환은 6단계.
- 조건부 스누즈(신호 재발 자동 복귀)는 서버 판정이 없으면 시각 기반 보류만. 서버 판정 ADR을 이 작업에서 만들지 않는다.
- 기존 테스트·e2e가 옛 라벨/구조를 고정하고 있으면 새 권위 기준으로 갱신하되, auth·capability·safe-command 검증의 **의미**는 약화 금지.
- CT 스크린샷 차이는 결함이 아니라 예상 결과다 — 해당 단계에서 재잠금하고 커밋.
- 색은 이탈에만. 정상 숫자는 서사형에서 숨긴다. 상태는 색 단독 금지.
- 공개 저장소 안전: 실멤버·시크릿·로컬 절대 경로·토큰형 예시를 코드·테스트·문서에 넣지 않는다.
- 커밋은 단계/태스크 단위로 자주. 1단계 `feat(admin-lang):`, 2~6단계 `feat(admin):` / `test(admin):` / `docs(adr):`.

## 4. ADR-0047 승격 조건 (6단계 끝에서만)

다음을 **모두** 만족할 때만 ADR-0047을 Accepted로 승격한다. 하나라도 빠지면 Proposed로 남기고 사유를 보고한다.

- 1단계 + 2~6단계 코드 완료
- `pnpm --dir front lint/test/build` green
- admin 영향 e2e green (또는 실행 불가면 승격하지 않음)
- `front/DESIGN.md` §Editorial Operations Ledger가 케이스 데스크·운영 서사·4축 내비를 반영
- tracked CT 재잠금이 해당 단계 계획이 요구한 범위에서 완료

승격 시 한 커밋으로:

- ADR-0047 상태를 Accepted로
- ADR-0045의 **admin composition**을 `Superseded by ADR-0047`로 정리. ADR-0046이 아직 Proposed이면 호스트 범위를 0046 후속으로 남긴다. ADR-0046이 이미 Accepted면 ADR-0045를 완전히 superseded로 정리한다.
- ADR-0039의 내비 축 서술을 오늘·클럽·파이프라인·원장(+비상 레인)에 맞게 갱신
- `docs/development/adr/README.md` 와 `docs/development/technical-decisions.md` 인덱스 동기화

커밋 메시지 예: `docs(adr): accept ADR-0047 admin case-desk narrative composition`

## 5. 최종 보고 형식

- 변경 표면 요약 (단계별 1~2줄)
- 실행한 검증 명령과 결과 / 건너뛴 검증과 이유
- **Rulings I made**: ledger의 모든 `Ruling:` 항목을 순서대로, 각각 "틀렸을 경우의 비용" 포함 (누락 금지)
- 서버 후속·이월 결함 목록 (조건부 보류 서버 판정, 지원 세션 호스트 가시화, 배달 시도 타임라인 read-model 등)
- ADR-0047 상태(Accepted 승격 여부와 근거)
- `superpowers:finishing-a-development-branch` 옵션 제시 (push/PR/로컬 유지). **직접 merge/push 하지 말 것.**
