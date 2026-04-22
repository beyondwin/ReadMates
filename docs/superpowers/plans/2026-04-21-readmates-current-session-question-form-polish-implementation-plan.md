# ReadMates Current Session Question Form Polish Implementation Plan

작성일: 2026-04-21
대상 스펙: `docs/superpowers/specs/2026-04-21-readmates-current-session-question-form-polish-design.md`

## Scope

`/app/session/current`의 질문 작성 UI를 승인된 A안으로 구현한다. 기존 질문 다중 저장 API 작업과 한줄평 순서 변경 작업은 유지하고, 질문 폼의 상태와 렌더링만 인라인 textarea 리스트 모델로 정리한다.

## Steps

1. `CurrentSessionBoard`의 질문 상태를 단일 `QuestionInput[]`로 정리한다.
   - 저장 질문을 priority 순서로 최대 5개 로드한다.
   - 초기 입력 행은 최소 2개를 보장한다.
   - `newQuestionText`, `editingQuestionIndex`, `editingQuestionText` 상태와 관련 handler를 제거한다.

2. `QuestionEditor`를 인라인 textarea 리스트로 변경한다.
   - 새 질문 composer와 작성한 질문 목록 섹션을 제거한다.
   - 각 질문 행은 라벨, 번호 액센트, textarea, 삭제 버튼으로 구성한다.
   - 빈 질문 행은 같은 톤을 유지하되 점선 테두리와 placeholder로만 구분한다.
   - 파란 배경 wrapper를 제거하고, 블루는 번호/포커스/저장 버튼에만 남긴다.

3. 저장 흐름을 정리한다.
   - 저장 시 trim 후 비어 있지 않은 질문만 payload로 보낸다.
   - 유효 질문이 2개 미만이면 기존 inline validation을 표시하고 fetch를 호출하지 않는다.
   - 최대 5개 제한과 저장 피드백은 유지한다.

4. 단위 테스트를 갱신한다.
   - `새 질문 내용` textbox 기대를 제거한다.
   - 저장된 질문이 textarea로 직접 렌더링되는지 확인한다.
   - `+ 질문 추가`로 빈 textarea 행이 추가되는지 확인한다.
   - 저장 payload가 비어 있지 않은 질문 목록으로 구성되는지 확인한다.
   - 최소 2개 validation과 id 중복 방지를 확인한다.

5. 검증한다.
   - `pnpm test -- current-session.test.tsx`
   - 가능하면 브라우저에서 `/app/session/current` 데스크탑/모바일 폭을 확인한다.
