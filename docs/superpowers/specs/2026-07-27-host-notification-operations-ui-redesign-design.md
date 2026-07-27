# ReadMates 호스트 알림 운영·수동 발송 UI/UX 개편

작성일: 2026-07-27
상태: 사용자 승인 완료

## 1. 요약

`/clubs/:clubSlug/app/host/notifications`의 상단 자동 리마인더와 `운영 · 수동 발송` 작업대를 ReadMates의 차분한 운영 원장 톤으로 다시 다듬는다.

이번 개편은 2026-07-25 호스트 알림 발송 작업대 리디자인을 대체하지 않는다. 당시 확정한 페이지 구조와 안전 계약은 유지하면서, 구현 후 남은 다음 문제를 해결하는 좁은 후속 디자인이다.

- 자동 리마인더가 일반 체크박스처럼 보여 ON/OFF 정책이라는 점이 즉시 드러나지 않는다.
- 알림 종류가 작은 버튼 나열이라 각 종류의 목적과 선택 불가 이유를 파악하기 어렵다.
- 대상과 채널이 기본 radio 입력과 텍스트로만 표시되어 다른 운영 화면의 시각 언어와 맞지 않는다.
- 선택 상태, 저장 중, 실패, 비활성, 직접 멤버 선택, 미리보기 만료와 중복 발송 같은 운영 상태가 한 디자인 문법으로 정리되어 있지 않다.

선택한 해법은 `안내형 발송 원장`이다. 자동 리마인더는 독립된 정책 행과 명확한 switch로 표현하고, 수동 발송은 `대상 회차 → 알림 종류 → 대상과 채널 → 발송 미리보기`의 한 화면 흐름으로 구성한다. 실제 발송은 기존 preview → confirm 경계에서만 일어난다.

## 2. 목표

1. 자동 리마인더가 현재 켜짐인지 꺼짐인지 한눈에 이해하게 한다.
2. 알림 종류를 이름만 보고 추측하지 않도록 목적과 준비 상태를 함께 보여준다.
3. 대상과 채널을 충분한 클릭 영역과 명확한 선택 상태를 가진 카드로 표현한다.
4. 회차부터 최종 미리보기까지 한 화면에서 맥락을 잃지 않게 한다.
5. 선택, 저장 중, 실패, 비활성, 만료, 중복과 성공 상태를 색상 외 문구와 형태로도 구분한다.
6. 데스크톱과 모바일에서 동일한 발송 기능과 안전성을 제공한다.
7. 기존 options → preview → confirm API, 기본 OFF 정책, 중복·만료·revision 검증과 confirm-only 발송 계약을 보존한다.

## 3. 비목표

- 서버 API, BFF, 데이터베이스, scheduler, Kafka, outbox 또는 이메일 처리 변경
- 자동 리마인더의 발송 시각, 시간대 또는 기본 OFF 정책 변경
- 새 알림 종류, 새 대상 유형 또는 새 채널 추가
- 알림 제목이나 본문을 직접 편집하는 기능 추가
- 최근 수동 발송 또는 접힌 운영 상세의 기능 재설계
- 호스트 대시보드, 세션 편집기 또는 멤버 알림 화면 리디자인
- 공용 디자인 시스템이나 호스트 앱 전체의 전면 리팩터링

## 4. 검토한 접근

### 4.1 선택: 안내형 발송 원장

자동화 정책은 수동 발송과 분리된 짧은 행으로 두고, 수동 발송은 번호가 있는 세 구획을 한 문서 패널 안에 배치한다. 각 선택지는 설명형 카드로 표현하고 하단에 현재 선택 요약과 유일한 primary action을 둔다.

장점:

- ReadMates 호스트 화면의 따뜻한 종이 표면, 잉크 계층과 운영 원장 구조를 유지한다.
- 반복 업무에서 별도 단계를 오가지 않아도 된다.
- 현재 선택과 최종 행동을 한 화면에서 확인할 수 있다.
- 기존 상태 모델과 API를 바꾸지 않고 표현 계층만 개선할 수 있다.

### 4.2 제외: 2열 운영 데스크

왼쪽에 자동화와 발송 요약, 오른쪽에 작성기를 배치하는 방식이다.

제외 이유:

- 일반적인 SaaS 제어판처럼 보이기 쉽다.
- 데이터가 적으면 빈 공간과 시각적 불균형이 생긴다.
- 모바일에서 다시 긴 세로 카드 묶음으로 바뀐다.

### 4.3 제외: 단계형 마법사

회차, 종류, 대상·채널, 미리보기를 별도 화면이나 단계로 나누는 방식이다.

제외 이유:

- 처음에는 친절하지만 반복 발송의 클릭 수가 늘어난다.
- 이전 선택과 전체 발송 맥락이 가려진다.
- 현재 기능 규모에 별도 단계 상태와 탐색을 추가할 필요가 없다.

## 5. 디자인 원칙

1. 운영 화면은 화려한 대시보드가 아니라 조용하고 정확한 원장처럼 보여야 한다.
2. 카드 수를 늘리기보다 구획선, 간격, 타이포그래피와 선택 표면으로 계층을 만든다.
3. 설명은 짧되 선택 결과와 제한은 숨기지 않는다.
4. 선택 가능한 전체 표면을 클릭 또는 탭할 수 있게 한다.
5. 색상만으로 선택, 오류 또는 상태를 전달하지 않는다.
6. 실제 발송 전에는 `아직 발송되지 않음`을 명확히 보여준다.
7. primary action은 한 시점에 하나만 둔다.

## 6. 정보 구조

이번 변경 범위의 화면 순서는 다음과 같다.

```text
알림 운영 상태 레일
└─ 모임 전날 자동 리마인더 정책
   ├─ 설명
   ├─ 켜짐·꺼짐·저장 중 상태
   └─ switch

운영 · 수동 발송
├─ 헤더와 발송 안전 안내
├─ 01 대상 회차
├─ 02 알림 종류
├─ 03 대상과 채널
│  ├─ 알림 대상
│  ├─ 직접 멤버 선택
│  └─ 발송 채널
└─ 현재 선택 요약 + 발송 미리보기

발송 전 확인 side sheet
├─ 최종 대상·채널 인원
├─ 제목·본문 미리보기
├─ 제외·중복·만료 경고
└─ 명시적 최종 발송
```

최근 수동 발송과 운영 상세는 현재 페이지 순서와 기능을 유지한다. 새 작업대와의 간격과 구획선만 자연스럽게 연결한다.

## 7. 상세 디자인

### 7.1 자동 리마인더 정책

현재 `자동 리마인더`, `모임 전날 · 기본 꺼짐`, `모임 전날 자동 리마인더`가 나뉘어 반복되는 구조를 하나의 정책 행으로 정리한다.

- 제목: `모임 전날 자동 리마인더`
- 꺼짐 설명: `예정된 모임에 자동 알림을 보내지 않습니다.`
- 켜짐 설명: `예정된 모임의 리마인더가 전날 자동 발송됩니다.`
- 상태 문구: `꺼짐`, `켜짐`, `저장 중`
- 조작: 디자인 시스템 색과 크기를 따르는 pill 형태 switch

switch는 시각적으로 숨긴 native checkbox와 연결된 label 또는 동등한 접근 가능한 switch semantics를 사용한다. 제목과 switch가 하나의 충분한 hit target을 이루되, 상태 문구도 항상 노출한다.

변경 동작은 현재 계약을 유지한다.

1. 사용자가 switch를 변경한다.
2. switch를 잠그고 `저장 중`을 표시한다.
3. 저장 성공 후 서버가 반환한 상태를 확정한다.
4. 실패하면 이전 서버 확정값으로 복원하고 같은 정책 행 아래에 `설정을 저장하지 못했습니다.`와 `다시 시도`를 표시한다.

페이지가 정책을 불러오지 못했을 때는 상태를 추측하지 않는다. switch를 비활성화하고 `상태를 불러오지 못했습니다.`와 다시 불러오기 행동을 표시한다.

### 7.2 작업대 헤더

- eyebrow: `운영 · 수동 발송`
- 제목: `새 알림 발송`
- 설명: `선택만으로는 발송되지 않습니다. 미리보기에서 최종 확인합니다.`
- 보조 배지: `미리보기 후 발송`

설명과 배지는 자동 발송에 대한 불안을 줄이는 안전 안내다. 같은 내용을 각 선택 영역에서 반복하지 않는다.

### 7.3 01 대상 회차

회차 선택은 기존 select 계약을 유지하되 문맥을 읽기 쉽게 정리한다.

- option: 회차 번호, 도서명, 날짜
- 선택 아래 문맥: 사용자용으로 번역한 진행 상태, 공개 범위, 기록 준비 상태
- 긴 도서명: 제어 폭을 넘지 않게 줄바꿈 또는 말줄임 처리하고 전체 값은 접근 가능한 이름에 보존
- 선택 가능한 회차 없음: 빈 select 대신 짧은 이유와 세션 관리 경로 제공

`OPEN`, `HOST_ONLY` 같은 내부 enum 문자열은 화면에 그대로 노출하지 않고 기존 formatter 또는 명시적인 UI label mapping을 사용한다.

회차 변경 시 기존 동작대로 선택 멤버, 검색 결과와 미리보기를 무효화하고 새 options를 불러온다.

### 7.4 02 알림 종류

작은 button 나열을 설명형 단일 선택 카드로 바꾼다. 서버가 반환한 템플릿만 표시한다.

각 카드는 다음을 포함한다.

- 사용자용 알림 종류 이름
- 한 줄 목적 설명
- 선택 여부를 나타내는 check mark와 테두리
- 사용할 수 없을 때 준비되지 않은 이유

대표 설명은 다음 문법을 사용한다.

- `모임 전날 리마인더`: `일정과 참석 여부를 다시 안내합니다.`
- `다음 책 공개`: `다음 모임에서 읽을 책을 안내합니다.`
- `피드백 문서 공개`: `정리된 피드백 문서를 멤버에게 안내합니다.`

비활성 카드는 흐리게만 만들지 않는다. `피드백 문서가 아직 준비되지 않았습니다.`처럼 서버의 disabled reason을 사람이 이해할 수 있는 문장으로 카드 안에 표시하고 접근 가능한 설명과 연결한다.

단일 선택 의미는 `fieldset`과 `legend`, native radio 또는 동등한 radiogroup semantics로 표현한다. 선택 표면 전체가 클릭 가능해야 한다.

### 7.5 03 알림 대상

서버가 허용한 대상만 설명형 카드로 표시한다.

- 전체 활성 멤버
- 세션 참가자
- 참석 확정자
- 직접 선택

현재 알림 종류의 기본 또는 권장 대상에는 `추천` 배지를 붙인다. 배지만 `추천 대상`이라고 쓰지 않고 실제 대상 이름과 의미를 먼저 보여준다. 같은 대상 옵션을 중복으로 만들지 않는다.

직접 선택을 고르면 같은 구획 안에서 멤버 선택기를 펼친다.

- 이름 또는 마스킹된 이메일 검색
- 현재 선택 인원
- 선택된 멤버 chip과 개별 해제
- 전체 해제
- 검색 결과의 충분한 행 클릭 영역
- 추가 결과 불러오기

검색이나 추가 로딩이 실패해도 기존 선택은 보존한다. 선택 인원이 0명이면 미리보기 버튼을 비활성화하고 `한 명 이상 선택해 주세요.`를 버튼 가까이에 표시한다.

### 7.6 03 발송 채널

기존 세 채널을 설명형 단일 선택 카드로 표시한다.

- `앱 + 이메일`: `가능한 두 채널 모두 사용`
- `앱 알림`: `ReadMates 안에서만 안내`
- `이메일`: `수신 가능한 이메일로만 발송`

기본 채널에는 `기본` 배지를 붙인다. 실제 전달 가능 인원은 선택 단계에서 추측하지 않고 서버 preview 결과로 보여준다.

알림 대상과 채널은 같은 03 구획에 두되, 서로 다른 `fieldset`과 `legend`를 사용해 screen reader가 두 선택 그룹을 구분하게 한다.

### 7.7 작업대 하단 요약과 primary action

작업대 하단은 현재 선택과 행동을 한 줄로 정리한다.

- 대상 이름 또는 직접 선택 인원
- 요청 채널
- 상태: `아직 발송되지 않음`
- primary action: `발송 미리보기`

미리보기를 만들 수 없을 때는 disabled button만 남기지 않고 해결 방법을 인접한 문구로 표시한다.

모바일에서는 요약과 버튼을 세로로 배치하고 버튼을 전폭으로 만든다. 작업대 안의 하단 행동 영역은 읽는 흐름을 가리지 않는 범위에서 sticky footer로 사용할 수 있다.

### 7.8 발송 전 확인 side sheet

기존 `HostNotificationComposerDialog`와 `ManualNotificationPreviewConfirmation`의 안전 동작을 유지하면서 side-sheet 표현을 정리한다.

표시 내용:

- 선택한 회차와 알림 종류
- 최종 대상 인원
- 앱 알림 가능 인원
- 이메일 가능 인원
- 제목과 본문 미리보기
- 제외된 대상과 사용할 수 없는 채널 경고
- 중복 발송 여부
- preview 유효 상태

최종 버튼은 정상 상태에서 `{N}명에게 알림 발송`으로 표시한다.

닫기, backdrop, `Escape`, route 이탈은 confirm callback을 호출하지 않는다. busy 중에는 중복 클릭과 우발적인 닫기를 막고 진행 상태를 표시한다.

중복 발송이면 `재발송을 확인했습니다`를 명시적으로 선택하기 전까지 최종 버튼을 비활성화한다. preview가 만료되거나 content revision이 stale이면 최종 버튼 대신 `최신 내용으로 다시 미리보기`를 제공한다.

## 8. 상태와 오류

### 8.1 정책 상태

- loading: 상태 문구와 비활성 switch
- loaded OFF: `꺼짐`
- loaded ON: `켜짐`
- saving: `저장 중`, 중복 조작 차단
- load failure: 상태 미확정과 다시 불러오기
- save failure: 이전 확정값 복원과 같은 행의 다시 시도

### 8.2 작업대 상태

- options loading: 작업대 구조를 유지하는 짧은 loading 상태
- options failure: 다른 페이지 영역은 유지하고 작업대 안에서 다시 시도
- no sessions: 이유와 세션 관리 경로
- disabled template: 카드 안의 이유
- member search failure: 선택 보존과 검색 영역의 다시 시도
- direct selection empty: 미리보기 차단과 해결 문구

### 8.3 preview와 confirm 상태

- 대상 0명: 발송 차단과 대상 수정 안내
- 일부 이메일 제외: 최종 인원과 제외 사유 표시
- preview 만료: 현재 선택을 보존하고 다시 미리보기
- stale revision: 오래된 preview 폐기 후 최신 options/preview 요구
- 중복 발송: 명시적 재발송 확인
- confirm pending: 최종 버튼 잠금과 진행 문구
- confirm failure: side sheet 유지, 선택 보존, 재시도
- confirm success: side sheet 닫기, 성공 메시지, 최근 수동 발송과 운영 상태 갱신

선택이 바뀌면 기존 preview를 즉시 무효화한다. 오래된 대상이나 본문으로 발송할 수 없어야 한다.

## 9. 반응형과 접근성

### 9.1 데스크톱

- 작업대는 전폭 단일 문서 패널을 유지한다.
- 각 단계는 왼쪽 번호·설명과 오른쪽 제어 영역의 두 열로 배치한다.
- 알림 종류, 대상과 채널은 최대 3열 카드 grid를 사용한다.
- primary action은 하단 요약 오른쪽에 둔다.

### 9.2 태블릿과 모바일

- 단계 구획을 한 열로 전환한다.
- 선택 카드는 한 열 또는 충분한 폭의 2열로 전환하며 글자를 억지로 줄이지 않는다.
- switch와 상태 문구가 제목을 밀어내지 않게 한다.
- 모든 주요 터치 영역은 최소 44px 높이를 확보한다.
- primary action은 전폭으로 표시한다.
- side sheet는 작은 화면에서 화면형 하단 패널로 동작한다.

### 9.3 접근성

- switch, radio group, checkbox와 dialog semantics를 보존한다.
- 전체 label/card 표면을 클릭 가능하게 한다.
- `:focus-visible`로 명확한 keyboard focus ring을 제공한다.
- 선택은 테두리, check mark와 접근 가능한 checked state를 함께 사용한다.
- 오류는 관련 제어와 `aria-describedby`로 연결한다.
- 상태 변경과 선택 인원은 필요한 범위에서 `aria-live`로 알린다.
- reduced motion 환경에서는 선택·패널 전환 애니메이션을 제거한다.
- 한국어와 영어가 길어져도 control 밖으로 겹치거나 넘치지 않게 한다.

## 10. 컴포넌트와 아키텍처 경계

이번 변경은 `front/features/host/ui` 표현 계층과 namespaced runtime CSS에 한정한다. UI에서 새 fetch나 query 호출을 만들지 않는다.

### 구현 결과 보정: 정책 저장 실패 전파

2026-07-27 whole-branch review에서 실제 route의 policy callback이 mutation 실패를 화면 오류로 처리한 뒤 정상 resolve하여, `HostNotificationOperationsRail`의 실패 목표 보존과 `다시 시도`가 통합 화면에서는 도달 불가능함을 확인했다. 이에 한해 `front/features/host/route/host-notifications-route.tsx`는 기존 오류 문구와 server-truth reconciliation을 수행한 뒤 같은 오류를 다시 throw한다. mutation hook, query 소유권·무효화, PUT payload, policy API, 권한과 기본 OFF 계약은 바꾸지 않는다. 이 최소 예외는 OFF→ON과 ON→OFF 각각의 실패·복원·동일 목표 retry route 통합 테스트 및 whole-branch 추가 검토 대상으로 삼는다.

### 10.1 `HostNotificationOperationsRail`

- 기존 policy 상태와 callback을 그대로 받는다.
- 정책 셀의 checkbox 표현을 switch UI로 바꾼다.
- loading, pending, error와 retry를 같은 셀 안에서 표현한다.
- 대기·실패·중단·최근 24시간 지표의 데이터 계약은 변경하지 않는다.

### 10.2 `ManualNotificationWorkbench`

- 세 단계의 페이지 정보 구조를 소유한다.
- 회차와 템플릿 선택을 현재 draft에 반영한다.
- 선택 변경 시 기존 preview 무효화 callback을 유지한다.
- 하단 선택 요약과 workbench 전용 문구를 조합한다.

### 10.3 `HostNotificationComposer`

- `presentation="workbench"`일 때만 대상·채널 카드 레이아웃을 적용한다.
- 세션 편집기나 다른 흐름에서 사용하는 dialog presentation은 이번 리디자인으로 시각 구조를 변경하지 않는다.
- 허용 대상, 추천 표시, 직접 선택과 preview 가능 여부 계산은 기존 model을 재사용한다.

### 10.4 `NotificationRecipientPicker`

- 검색과 pagination callback을 그대로 사용한다.
- 선택된 멤버 요약, chip, 행 선택과 빈 선택 안내를 표현한다.
- API, query 또는 route 모듈을 import하지 않는다.

### 10.5 `ManualNotificationPreviewConfirmation`

- `presentation="side-sheet"`에서만 이번 정보 계층을 적용한다.
- final count, channel eligibility, warning, duplicate confirm과 confirm action을 기존 preview 응답에서 렌더링한다.
- confirm callback 외에는 실제 발송 행동을 호출하지 않는다.

### 10.6 스타일

`front/src/styles/globals.css`의 `rm-notification-*`와 `rm-host-notifications-*` namespace에 다음 규칙을 둔다.

- 정책 switch
- 단계 구획
- 알림 종류·대상·채널 선택 카드
- 선택·비활성·오류·pending 상태
- 직접 선택 chip과 행
- 하단 선택 요약
- desktop/tablet/mobile breakpoints
- focus-visible과 reduced-motion

인라인 스타일은 상태에서 계산되는 최소 값 외에는 늘리지 않는다. 새 외부 UI dependency는 추가하지 않는다.

## 11. 데이터 흐름

기존 데이터 흐름은 변경하지 않는다.

```text
route loader/query
  → sessions + manual options + policy
  → ManualNotificationWorkbench draft
  → 회차/종류/대상/채널 선택
  → 선택 변경 시 preview 무효화
  → preview API
  → 서버 계산 인원·본문·경고를 side sheet에 표시
  → 명시적 confirm
  → 기존 outbox/전달 파이프라인
  → 최근 수동 발송과 운영 상태 갱신
```

자동 리마인더는 별도 policy mutation을 사용한다.

```text
서버 확정 policy
  → switch 변경
  → pending 잠금
  → PUT policy
  → 성공 시 확정 / 실패 시 이전 값 복원
```

## 12. 발송 안전 불변 조건

1. 회차, 알림 종류, 대상 또는 채널 선택은 발송하지 않는다.
2. preview 생성은 발송하지 않는다.
3. side sheet 닫기, backdrop, `Escape`와 route 이탈은 발송하지 않는다.
4. confirm만 기존 발송 API를 호출한다.
5. 직접 선택은 한 명 이상의 유효한 같은 클럽 활성 멤버가 필요하다.
6. 서버가 대상, 채널 eligibility, 권한, preview 만료와 revision을 최종 검증한다.
7. 중복 발송은 별도 확인 없이는 실행되지 않는다.
8. 자동 리마인더 정책은 기본 OFF이며 수동 작성기 선택과 독립적이다.

## 13. 예상 수정 표면

- `front/features/host/ui/notifications/host-notification-operations-rail.tsx`
- `front/features/host/ui/notifications/host-notification-operations-rail.test.tsx`
- `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- `front/features/host/ui/notifications/manual-notification-workbench.test.tsx`
- `front/features/host/ui/notifications/host-notification-composer.tsx`
- `front/features/host/ui/notifications/host-notification-composer.test.tsx`
- `front/features/host/ui/notifications/notification-recipient-picker.tsx`
- `front/features/host/ui/notifications/manual-notification-preview.tsx`
- 필요한 경우 위 UI 파일과 같은 디렉터리의 focused test
- `front/src/styles/globals.css`
- `front/tests/unit/host-notifications.test.tsx`
- `front/tests/e2e/manual-notifications.spec.ts`

구현 중 현재 컴포넌트로 충분하다고 확인되면 새 파일을 만들지 않는다. 한 파일의 표현 책임이 과도해질 때만 feature-local presentational component로 분리한다.

## 14. 검증

### 14.1 focused unit

- 자동 리마인더의 꺼짐, 켜짐, 저장 중, load/save 오류와 retry
- 알림 종류의 선택, 비활성과 disabled reason 연결
- 대상과 채널의 radio semantics와 선택 표시
- 기본 또는 권장 대상의 실제 이름과 추천 배지
- 직접 선택 0명일 때 preview 차단
- 선택된 멤버 수, chip 해제, 전체 해제와 검색 실패 시 선택 보존
- workbench presentation 변경이 dialog presentation을 바꾸지 않음
- preview 만료, stale, 중복 재발송과 confirm 실패 상태

### 14.2 frontend boundary and canonical checks

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/host-notification-operations-rail.test.tsx \
  features/host/ui/notifications/manual-notification-workbench.test.tsx \
  features/host/ui/notifications/host-notification-composer.test.tsx \
  tests/unit/host-notifications.test.tsx
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Corepack이 PATH에 없으면 repository guide의 `npx --yes corepack@0.35.0 pnpm ...` fallback을 사용하고 실제 실행 명령을 보고한다.

### 14.3 E2E

```bash
corepack pnpm --dir front test:e2e
```

최소한 다음 흐름을 검증한다.

- 정책은 기본 OFF이고 switch로 명시적으로 opt-in
- 정책 저장 실패 시 이전 확정 상태 복원
- 회차를 바꾸면 새 options와 상태가 표시됨
- 알림 종류, 대상과 채널 선택이 preview에 반영됨
- 직접 선택은 0명을 허용하지 않음
- preview 열기·닫기·`Escape`가 발송하지 않음
- 명시적 confirm만 수동 발송을 만듦
- 중복 발송은 재발송 확인이 필요함

### 14.4 브라우저 시각 검증

- 데스크톱 넓은 화면
- 태블릿 중간 폭
- 모바일 좁은 화면
- 긴 한국어 도서명과 긴 disabled reason
- keyboard-only tab 순서와 focus-visible
- screen reader accessible name과 group 구분
- reduced-motion
- 정책 OFF, ON, pending, error
- 직접 선택 펼침과 여러 멤버 선택
- preview 정상, 일부 채널 제외, 중복, 만료와 오류

검증 화면에는 실제 멤버 데이터나 개인 연락처를 사용하지 않는다.

## 15. 완료 기준

1. 자동 리마인더가 체크박스처럼 보이지 않고 명확한 switch와 상태 문구로 표현된다.
2. 알림 종류마다 목적과 선택 불가 이유가 카드 안에서 이해된다.
3. 대상과 채널은 스타일이 적용된 충분한 크기의 단일 선택 카드로 동작한다.
4. 추천 표시는 실제 대상 이름을 대체하지 않는다.
5. 직접 선택은 검색, 선택 요약, 해제와 빈 선택 안내를 제공한다.
6. 작업대 하단에서 현재 대상·채널과 `아직 발송되지 않음`을 확인할 수 있다.
7. 모바일에서 모든 핵심 조작이 가능하고 primary action이 명확하다.
8. focus, checked, disabled, pending과 error 상태를 색상 외 정보로도 구분한다.
9. preview와 confirm의 기존 안전 불변 조건이 단위 테스트와 E2E로 유지된다.
10. 관련 focused test, frontend boundary, lint, 전체 test, build와 E2E 결과가 실제 명령과 함께 보고된다.

## 16. 잔여 위험

- 공용 `HostNotificationComposer`를 수정하므로 workbench 전용 스타일이 다른 작성기 dialog에 새지 않는지 별도 회귀 검증이 필요하다.
- `globals.css`가 큰 파일이므로 selector 범위를 `rm-notification-*` namespace로 제한하지 않으면 다른 host 화면에 영향을 줄 수 있다.
- native select의 option 줄바꿈은 브라우저별로 제한이 있으므로 긴 도서명은 선택된 값과 주변 문맥에서 보완해야 한다.
- 실제 채널 가능 인원은 preview 전에는 확정할 수 없으므로 선택 카드에서 추정 숫자를 보여주면 안 된다.
- sticky mobile action은 작은 화면과 키보드 표시 상태에서 콘텐츠를 가릴 수 있으므로 실제 브라우저에서 확인한 뒤 적용 여부를 확정한다.
