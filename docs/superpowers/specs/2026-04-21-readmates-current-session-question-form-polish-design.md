# ReadMates Current Session Question Form Polish Design

작성일: 2026-04-21
상태: USER-APPROVED DESIGN SPEC
문서 목적: `/app/session/current`의 새 질문 입력 폼에서 파란색 강조 배경을 제거하고, 기존 ReadMates 무드에 맞는 모바일/데스크탑 인라인 질문 편집 UI를 정의한다.

## 1. 문제 정의

현재 질문 작성 UI는 새 질문 입력 영역만 `accent-soft` 배경과 `accent-line` 테두리를 사용해 주변 카드보다 강하게 떠 보인다. ReadMates의 기존 화면은 종이색 표면, 얇은 라인, 절제된 잉크 블루 액션을 중심으로 구성되어 있어, 새 질문 입력 박스의 파란 배경은 현재 세션 카드의 차분한 분위기와 어긋난다.

또한 질문 작성 흐름은 새 질문을 별도 composer에 입력해 `추가`한 뒤, 작성된 질문 목록에서는 다시 `수정` 버튼을 눌러 편집해야 한다. 모바일에서는 이 분리된 모드가 더 크게 느껴지고, 사용자가 "질문을 여러 개 준비한다"는 작업보다 "입력 모드와 목록 모드를 오간다"는 조작에 주의를 쓰게 된다.

## 2. 목표

- 새 질문 입력 영역의 파란색 배경을 제거한다.
- 저장된 질문과 새 질문을 모두 같은 계층의 textarea 행으로 편집한다.
- 데스크탑과 모바일 모두에서 질문 작성, 추가, 삭제, 저장 흐름을 한 카드 안에서 자연스럽게 완료하게 한다.
- 기존 ReadMates 무드와 맞게 표면은 `surface`/`m-card`, 입력 행은 `bg`/`bg-sub`, 테두리는 `line`/`line-soft` 중심으로 구성한다.
- 잉크 블루는 저장 버튼, 포커스 링, 작은 번호 액센트처럼 기능적 강조에만 사용한다.
- 질문 저장 API와 최소 2개, 최대 5개 정책은 유지한다.

## 3. 비목표

- 질문 공개 범위, 투표, 댓글, 정렬 드래그 앤 드롭은 추가하지 않는다.
- 공동 보드의 질문 표시 디자인은 이번 변경에서 바꾸지 않는다.
- 질문 저장 API의 경로나 서버 검증 정책은 바꾸지 않는다.
- 현재 세션 화면 전체 레이아웃이나 RSVP, 체크인, 리뷰 영역은 재설계하지 않는다.

## 4. 확정 방향

사용자가 승인한 방향은 "기존 무드에 맞춘 인라인 리스트 편집"이다.

질문 작성 카드는 별도의 파란 새 질문 composer를 갖지 않는다. 대신 `질문 1`, `질문 2`, `질문 3`처럼 각 질문이 동일한 입력 행으로 렌더링되고, 모든 행은 곧바로 textarea로 편집 가능하다.

초기 렌더링은 저장된 질문을 priority 오름차순으로 보여준다. 저장된 질문이 2개 미만이면 빈 입력 행을 추가해 최소 2개 행을 보여준다. 사용자는 `+ 질문 추가`로 최대 5개까지 빈 행을 늘릴 수 있다. 추가된 빈 행도 다른 질문과 같은 스타일을 사용하되, `border-style: dashed` 같은 낮은 강도의 차이만 허용한다.

저장 시에는 각 textarea 값을 trim하고, 비어 있지 않은 질문만 서버에 보낸다. 유효 질문이 2개 미만이면 네트워크 요청 없이 인라인 오류를 보여준다. 유효 질문이 2~5개이면 기존 `saveQuestions` action을 통해 전체 질문 목록을 저장한다.

## 5. 데스크탑 UX

데스크탑 `이번 달 내 질문` 카드는 기존 `surface` 카드 안에 다음 구조를 갖는다.

- 상단: `Question`, `이번 달 내 질문`, `최소 2개, 최대 5개까지 준비해 주세요.`
- 우측 상태: `내 질문 N/5`
- 본문: 동일 계층의 질문 textarea 행 리스트
- 하단: 안내 문구, `+ 질문 추가`, `질문 저장`

각 질문 행은 다음 요소로 구성한다.

- 라벨: `질문 1`, `질문 2` 등
- 작은 번호 액센트: 원형 또는 badge형 숫자. 블루는 이 작은 요소에만 제한적으로 사용한다.
- textarea: 질문 내용 직접 편집
- 삭제 버튼: 최소 행을 깨지 않는 범위에서 노출한다.

새 질문 입력 영역은 더 이상 별도 파란 배경 박스가 아니다. 빈 질문 행은 같은 행 스타일을 사용하고, 필요하면 점선 테두리나 placeholder만으로 빈 상태를 표현한다.

## 6. 모바일 UX

모바일 `질문 작성` 섹션도 같은 모델을 사용한다.

- `m-card` 안에 질문 행을 세로로 쌓는다.
- 각 textarea는 터치 편집을 위해 최소 3줄 높이를 유지한다.
- `+ 추가`와 `저장` 버튼은 카드 하단에 배치한다.
- 저장 안내 또는 오류 문구는 버튼 위/옆의 작은 텍스트로 유지한다.
- 새 질문이 추가되어도 화면 톤이 갑자기 파란 박스로 바뀌지 않는다.

모바일에서는 입력 행 간격을 데스크탑보다 약간 넓게 잡고, 버튼 터치 목표는 기존 `.btn` 높이를 유지한다.

## 7. Visual Tone Rules

- 외부 카드: 기존 `surface` 또는 `m-card`.
- 질문 행: `background: var(--bg)` 또는 `var(--bg-sub)`, `border: 1px solid var(--line-soft)`.
- textarea: 기존 `.textarea` 또는 `.m-textarea` 패턴을 따른다.
- 파란 계열 제거 대상: 새 질문 입력 wrapper의 `background: var(--accent-soft)`와 `border: 1px solid var(--accent-line)`.
- 파란 계열 유지 대상: primary save button, focus ring, 작은 번호/badge 정도.
- 카드 radius는 기존 시스템에 맞춰 8~10px 범위를 유지한다.
- 별도 그림자, 큰 컬러 블록, 새 디자인 토큰은 추가하지 않는다.

## 8. Frontend State Design

권장 상태는 질문 전체를 단일 배열로 관리한다.

```ts
type QuestionInput = {
  clientId: string;
  text: string;
};
```

제거 대상 상태:

- `newQuestionText`
- `editingQuestionIndex`
- `editingQuestionText`

대체 동작:

- `updateQuestionInput(index, value)`로 textarea 변경을 즉시 배열에 반영한다.
- `addQuestionInput()`은 빈 `{ clientId, text: "" }`를 추가한다.
- `removeQuestionInput(index)`는 최소 2개 행을 유지하면서 해당 행을 제거한다.
- `writtenQuestionCount`는 `questionInputs.filter((input) => input.text.trim()).length`로 계산한다.

초기화:

- 저장된 질문을 priority 오름차순으로 정렬한다.
- 최대 5개까지만 화면에 배치한다.
- 결과가 2개 미만이면 빈 입력 행을 추가해 2개로 맞춘다.

## 9. Component Design

주요 변경은 `front/features/current-session/components/current-session.tsx`의 `QuestionEditor`에 한정한다.

`QuestionEditor`는 새 질문 composer와 작성한 질문 목록을 분리하지 않는다. 대신 `questionInputs.map(...)`으로 textarea 행을 렌더링한다. 데스크탑과 모바일은 같은 데이터 모델을 공유하고, `variant`에 따라 className과 간격만 다르게 적용한다.

가능하면 인라인 스타일을 크게 늘리지 않고, 기존 `.textarea`, `.m-textarea`, `.btn`, `.surface`, `.m-card`, `.badge` 계열을 재사용한다. 필요한 경우 `current-session.tsx` 내부의 제한된 style 객체만 수정한다.

## 10. Error Handling

- 저장 시 유효 질문이 2개 미만이면 `질문은 최소 2개 작성해 주세요.`를 표시한다.
- 질문 행이 5개이면 `+ 질문 추가`는 비활성화하거나 최대 5개 안내를 보여준다.
- 서버 저장 실패 시 기존 `질문 저장 실패 · 다시 시도해 주세요` 피드백을 유지한다.
- 저장 중에는 기존처럼 저장 버튼을 비활성화한다.

## 11. Testing

단위 테스트는 기존 `front/tests/unit/current-session.test.tsx`를 갱신한다.

확인할 동작:

- 새 질문 입력 영역이 별도 `새 질문 내용` textbox로 렌더링되지 않는다.
- 초기 질문이 textarea로 직접 편집 가능하다.
- `+ 질문 추가`를 누르면 빈 질문 textarea 행이 추가된다.
- 유효 질문이 2개 미만이면 저장 요청 없이 validation 문구가 보인다.
- 저장 시 비어 있지 않은 질문만 payload로 전달된다.
- 모바일/데스크탑이 동시에 렌더링되어도 id 중복이 생기지 않는다.

시각 확인:

- `http://localhost:3000/app/session/current`에서 데스크탑 폭과 모바일 폭을 모두 확인한다.
- 새 질문 입력 주변에 파란 배경 블록이 남지 않았는지 확인한다.
- textarea, 버튼, 안내 문구가 모바일에서 겹치지 않는지 확인한다.

## 12. Acceptance Criteria

- `/app/session/current`의 질문 작성 카드에서 새 질문 입력 파란 배경이 제거된다.
- 질문은 읽기 전용 카드가 아니라 인라인 textarea 리스트로 직접 편집된다.
- 데스크탑과 모바일에서 같은 질문 모델을 사용한다.
- 최소 2개, 최대 5개 저장 정책이 유지된다.
- 기존 ReadMates 화면과 같은 차분한 종이색, 얇은 라인 중심의 무드를 유지한다.
- 관련 단위 테스트가 통과한다.
