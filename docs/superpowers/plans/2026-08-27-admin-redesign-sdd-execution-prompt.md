# 어드민 재설계 SDD 실행 프롬프트

아래 전문을 새 에이전트 세션에 그대로 붙여넣어 실행한다. (이 파일 자체는 실행 대상이 아니라 프롬프트 보관본이다.)

---

/subagent-driven-development 스킬로 ReadMates 어드민 재설계를 처음부터 끝까지 구현해줘. 너는 컨트롤러다. 아래 계약을 그대로 따른다.

## 0. 역할과 자율 계약

- 너는 사람 개입 없이 이 작업을 **끝까지** 완료한다. 진행 중 결함·에러·계획 모순·모호함이 나오면 **나에게 묻지 말고** SDD 스킬의 Ruling 절차로 스스로 최선을 결정하고, 모든 결정을 ledger에 `Ruling:` 으로 기록한 뒤 계속 진행한다. "계속할까요?" 류의 중간 확인 메시지 금지.
- 멈춰도 되는 경우는 단 두 가지: ① 워크트리 밖을 파괴하는 비가역 조작(예: 원격 브랜치 강제 조작, 파일 시스템 광역 삭제)이 필요해 보일 때 ② 시크릿/실계정 정보가 필요할 때. 이 둘 외의 모든 상황은 Ruling으로 통과한다.
- **원격에 푸시하지 않는다. main에 머지하지 않는다.** 모든 커밋은 로컬 feature 브랜치에 남기고, 마지막에 finishing-a-development-branch 옵션 제시로 끝낸다.
- 서버(API·capability·safe-command·schema) 계약은 절대 바꾸지 않는다. 서버 데이터가 없어 UI 요구를 못 채우면 조건부 렌더로 구현하고 계획 문서의 `## 실행 중 발견`에 기록한다. 가짜 값 생성 금지.
- 실행하지 못한 검증은 통과했다고 쓰지 않는다 — 건너뛴 명령과 이유를 최종 보고에 명시한다.

## 1. 시작 절차

1. `git status --short --branch` 확인. superpowers:using-git-worktrees 스킬로 **`codex/admin-case-desk-redesign` 브랜치 기준** 격리 워크트리를 만든다 (이 브랜치에 스펙·ADR·계획·시안이 이미 커밋되어 있다).
2. 저장소 라우터 `AGENTS.md`와 `docs/agents/front.md`, `docs/agents/design.md`, `docs/agents/execution.md`, `front/AGENTS.md`를 읽는다. 프런트 검증 명령·공개 저장소 안전 규칙은 이 문서들이 권위다.
3. 다음 문서를 읽는다 (권위 순서대로):
   - 스펙(최상위 권위): `docs/development/2026-08-27-readmates-admin-case-desk-narrative-redesign-design.md`
   - ADR: `docs/development/adr/0046-admin-case-desk-narrative-composition.md`
   - 계획 1: `docs/superpowers/plans/2026-08-27-admin-language-stage1.md`
   - 계획 2: `docs/superpowers/plans/2026-08-27-admin-case-desk-stages2-6.md` (안의 **적응 실행 규약**은 모든 태스크에 구속력이 있다)
   - 시각 참고(권위 아님): `design/mockups/2026-08-27-admin-case-desk/README.md`와 PNG들, 현행 권위 `front/DESIGN.md`
4. SDD 절차대로 계획별 workspace/ledger를 만들고, 기존 ledger가 있으면 완료 태스크는 재실행하지 않는다.

## 2. 실행 순서

1. **계획 1 (1단계: 용어 사전 통일)** 을 SDD 태스크 루프로 완주한다. Task 1~8. 같은 모양의 소규모 문자열 치환 태스크는 SDD의 배치 규칙대로 한 번에 묶어 dispatch해도 된다.
2. 계획 1의 최종 게이트(lint/test/build/e2e/CT 재잠금) 통과 후, **계획 2 (2~6단계)** 를 이어서 완주한다. 단계 순서 고정: 2 → 3 → 4 → 5 → 6. 각 단계 끝의 공통 검증 게이트와 릴리스 체크포인트(CHANGELOG Unreleased 한 줄)를 지킨다.
3. 6단계 완료 + 전체 게이트 green + `front/DESIGN.md` 갱신이 끝났을 때만 ADR-0046을 Accepted로 승격하고 ADR-0045 superseded / ADR-0039 내비 축 서술 / ADR 인덱스를 동기화한다. 조건 미충족이면 Proposed로 남기고 사유를 보고한다.
4. 두 계획 모두 끝나면 merge-base 기준 최종 whole-branch 리뷰(가장 유능한 모델) → 1회 fix wave → 잔여 findings 판결까지 SDD 절차대로.

## 3. 판단 기준 (Ruling 시 권위 순서)

1. 스펙 §5(명령 마찰 3등급)·§6(용어 사전)·§7(페이지 타입 3종) — 최상위. 계획 세부가 코드 현실과 충돌하면 스펙을 지키는 쪽으로 계획을 수정해 진행.
2. 계획 2의 적응 실행 규약(결함 30분 룰, 서버 데이터 부재 처리, 테스트 갱신 원칙).
3. `front/DESIGN.md`의 상태·오류 문법과 접근성 계약(44px, 한국어 줄바꿈, reduced-motion, 색 단독 금지).
4. 기존 코드 관례.

특기 사항:
- 기존 테스트·e2e가 옛 라벨/구조를 고정하고 있으면 새 권위 기준으로 갱신하되, auth·capability·safe-command 검증의 **의미**는 약화 금지.
- CT 스크린샷 차이는 결함이 아니라 예상 결과다 — 해당 단계에서 재잠금하고 커밋.
- Impeccable design hook이 write를 막으면 지적을 실제 문제로 보고 수정해 통과시킨다(억제는 명백한 오탐에만, 사유 기록).
- 공개 저장소 안전: 실멤버·시크릿·로컬 절대 경로·토큰형 예시를 코드·테스트·문서에 넣지 않는다.

## 4. 최종 보고 형식

- 변경 표면 요약 (단계별 1~2줄)
- 실행한 검증 명령과 결과 / 건너뛴 검증과 이유
- **Rulings I made**: ledger의 모든 `Ruling:` 항목을 순서대로, 각각 "틀렸을 경우의 비용" 포함 (누락 금지)
- `## 실행 중 발견`에 쌓인 서버 후속·이월 결함 목록
- ADR-0046 상태(Accepted 승격 여부와 근거)
- finishing-a-development-branch 옵션 제시
