# ReadMates 호스트 알림 발송 작업대 리디자인

작성일: 2026-07-25
상태: 사용자 승인 완료

## 1. 요약

`/clubs/:clubSlug/app/host/notifications`를 호스트 운영 대시보드와 같은 “정확한 운영 장부” 톤으로 재구성한다.

핵심 업무는 새 알림 작성과 명시적 발송이다. 자동 리마인더 정책과 운영 지표는 상단 상태 레일로 압축하고, 최근 발송은 짧은 장부 행으로 표시한다. 이벤트·배송 장부와 테스트 메일은 평소 접힌 운영 상세에 둔다. 대기·실패·중단이 있으면 운영 상세가 자동으로 열린다.

이번 변경은 프런트엔드 정보 구조, 레이아웃, 표현, 접근성에 한정한다. 기존 options → preview → confirm API, 클럽 정책 API, 발송 파이프라인과 안전 규칙은 변경하지 않는다.

## 2. 현재 문제

현재 화면은 기능은 완성되어 있지만 다음 문제가 있다.

1. 자동 리마인더 정책이 독립된 큰 문서 카드로 표시되어 새 알림 발송 흐름과 시각적으로 분리된다.
2. `클럽 정책 · opt-in`, `Asia/Seoul` 같은 구현 중심 문구가 호스트의 실제 결정과 결과보다 먼저 보인다.
3. 수동 발송 작업대가 넓은 카드의 왼쪽에만 조밀하게 쌓이고 오른쪽은 비어, 화면 폭을 사용하지 못한다.
4. 회차, 템플릿, 대상, 채널, 미리보기가 하나의 긴 세로 흐름에 놓여 현재 선택과 다음 행동을 빠르게 파악하기 어렵다.
5. 최근 수동 발송, 상태 요약, 운영 장부, 테스트 메일이 같은 시각적 무게의 카드로 이어져 평상시에도 스크롤이 길다.
6. 사용할 수 없는 템플릿의 이유가 화면에서 충분히 드러나지 않는다.
7. 화면의 카드·간격·계층이 최근 호스트 운영 대시보드의 선형 지표 레일과 장부 행 패턴과 다르다.

## 3. 목표

1. 호스트가 화면 진입 직후 `어느 회차에 어떤 알림을 보낼지` 결정할 수 있게 한다.
2. 회차 → 알림 종류 → 대상·채널 → 미리보기 → 최종 발송 흐름을 한눈에 이해할 수 있게 한다.
3. 자동 리마인더 상태와 이상 징후를 짧은 상태 레일에서 확인하게 한다.
4. 정상 상태에서 불필요한 스크롤을 줄이고, 이상 상태에서는 필요한 운영 장부가 자동으로 드러나게 한다.
5. 최근 호스트 운영 대시보드와 동일한 따뜻한 종이 표면, 잉크 계층, 선형 장부, 절제된 상태 배지를 사용한다.
6. 데스크톱과 모바일에서 핵심 발송 업무를 완전하게 수행할 수 있게 한다.
7. 저장과 발송을 계속 분리하고, 최종 확인 전에는 이벤트·outbox·이메일을 만들지 않는다.

## 4. 비목표

- 서버 API, BFF, 데이터베이스, Kafka, outbox 또는 이메일 처리 변경
- 자동 리마인더의 스케줄, 시간대, 기본 OFF 정책 변경
- 새 알림 종류 또는 새 수신자 유형 추가
- 멤버 알림 설정이나 수신 동의 정책 변경
- 호스트 운영 대시보드 외 다른 페이지 리디자인
- 운영 장부를 새 route로 분리
- 현재 화면과 무관한 공용 컴포넌트 전면 재작성

## 5. 검토한 접근

### 5.1 선택: 발송 작업대 + 압축 장부

상단에 정책과 상태를 한 레일로 통합하고, 새 알림 발송을 전폭 작업대로 배치한다. 최근 발송은 짧은 행으로 표시하며 기술 운영 정보는 접힌 상세로 이동한다. 미리보기와 최종 발송은 기존 dialog 기반 패널에서 처리한다.

장점:

- 최근 호스트 운영 대시보드와 가장 일관된다.
- 정상 상태의 스크롤을 가장 많이 줄인다.
- 현재 선택과 주 행동이 한 화면에 남는다.
- 기존 API와 상태 모델을 유지하면서 UI 경계만 정리할 수 있다.

### 5.2 제외: 2열 운영 데스크

왼쪽에 발송 작업대, 오른쪽에 정책·상태·최근 기록을 둔다.

제외 이유:

- 데이터가 적을 때 오른쪽 레일에 빈 공간이 생긴다.
- 모바일에서는 카드가 긴 세로 묶음으로 바뀐다.
- 사용자가 지적한 불균형한 빈 공간 문제를 재현할 가능성이 높다.

### 5.3 제외: 3단계 발송 마법사

회차·종류, 대상·채널, 미리보기·발송을 별도 단계로 나눈다.

제외 이유:

- 처음 사용하는 호스트에게는 단순하지만 반복 업무에서는 클릭이 늘어난다.
- 전체 선택 내용을 한눈에 비교하기 어렵다.
- 현재 기능 규모에는 별도 단계 상태와 탐색을 추가할 필요가 없다.

## 6. 디자인 원칙

1. 호스트 화면은 일반 SaaS 대시보드가 아니라 조용하고 정확한 운영 장부처럼 보여야 한다.
2. 카드 수를 줄이고 구획선, 행, 간격, 타이포그래피로 계층을 만든다.
3. 기술 구현보다 호스트가 결정하는 대상과 결과를 먼저 보여준다.
4. 정상 상태는 조용하게, 조치가 필요한 상태는 문구와 상태 배지로 분명하게 표현한다.
5. 색상만으로 상태를 구분하지 않는다.
6. 실제 발송 버튼은 결과와 대상 인원을 구체적으로 말해야 한다.

## 7. 정보 구조

화면 순서는 다음으로 고정한다.

```text
페이지 헤더
└─ 압축 상태 레일
   ├─ 자동 리마인더 정책
   ├─ 대기
   ├─ 실패
   ├─ 중단
   └─ 최근 24시간

새 알림 발송 작업대
├─ 01 대상 회차
├─ 02 알림 종류
├─ 03 대상과 채널
└─ 미리보기 열기

최근 수동 발송
└─ 최근 3건 장부 행

운영 상세
├─ 이벤트·배송 장부
└─ 테스트 메일
```

### 7.1 페이지 헤더

- eyebrow: `운영 · 알림 발송`
- 제목: `알림 발송 작업대`
- 설명: `필요한 알림을 고르고, 확인한 뒤 발송합니다.`
- 처리할 항목이 없으면 비활성 `처리할 알림 없음` 버튼을 보여주지 않는다.
- 대기 또는 실패 항목이 있을 때만 실제 처리 건수를 포함한 처리 행동을 노출한다.

### 7.2 압축 상태 레일

상태 레일은 별도 카드 묶음이 아니라 하나의 선형 구획이다.

첫 셀은 다른 셀보다 넓은 자동 리마인더 정책 셀이다.

- 제목: `자동 리마인더`
- 상태: `켜짐` 또는 `꺼짐`
- 보조 문구: `모임 전날 · 기본 꺼짐`
- 조작: 명확한 label을 가진 switch

나머지 셀은 `대기`, `실패`, `중단`, `최근 24시간`을 숫자와 상태 문구로 표시한다.

`opt-in`, `Asia/Seoul`, scheduler 같은 구현 용어는 사용자 화면에서 제거한다. 시간대와 기본 정책은 동작 계약과 테스트에서 유지한다.

### 7.3 새 알림 발송 작업대

데스크톱에서는 `대상 회차`와 `알림 종류`를 같은 행의 2열 선택 블록으로 둔다. `대상과 채널`은 그 아래 전폭 요약 행으로 둔다.

#### 01 대상 회차

- 회차 번호
- 도서명
- 날짜
- 진행 상태와 공개 범위

긴 도서명은 선택 제어와 상태를 밀어내지 않고 줄바꿈 또는 말줄임 경계 안에서 표시한다. 전체 값은 접근 가능한 이름에 남긴다.

#### 02 알림 종류

서버가 반환한 템플릿만 표시한다.

- 선택 가능 항목은 명확한 선택 상태를 가진다.
- 선택 불가 항목은 흐린 버튼만 두지 않고 이유를 바로 옆 또는 아래에 표시한다.
- 비활성 이유는 화면 문구와 접근 가능한 설명에 동일하게 연결한다.

#### 03 대상과 채널

현재 선택을 한 행에서 요약한다.

- 대상 유형과 추천 여부
- 직접 선택한 경우 선택 인원
- 요청 채널

대상·채널 편집 제어는 같은 영역 안에 두며, 직접 선택을 고른 경우에만 멤버 선택기를 펼친다.

#### 주 행동

`미리보기 열기`를 작업대의 유일한 primary action으로 둔다. 대상이 없거나 템플릿을 사용할 수 없으면 버튼을 비활성화하는 데 그치지 않고 해결 방법을 함께 표시한다.

### 7.4 최근 수동 발송

최근 3건만 전폭 장부 행으로 표시한다.

각 행은 다음 정보를 포함한다.

- 회차 번호와 도서명
- 알림 종류
- 대상 유형과 인원
- 채널
- 상태
- 요청 시각

기록이 없으면 큰 빈 카드를 만들지 않고 `아직 수동 발송 기록이 없습니다.`라는 한 줄 상태를 표시한다.

3건을 넘는 기록은 운영 상세 안에서 기존 더 보기 흐름으로 확인한다. 새 route는 추가하지 않는다.

### 7.5 운영 상세

운영 상세는 native button 기반 disclosure로 구현한다.

- 정상 상태의 초기값: 접힘
- 대기·실패·중단 중 하나라도 있으면 초기값: 펼침
- 화면이 열린 뒤 상태가 정상에서 이상으로 바뀌면 다시 펼침
- 사용자는 펼쳐진 상세를 직접 접을 수 있음
- 이미 인지한 동일 상태 때문에 사용자의 접기 선택을 반복해서 되돌리지 않음

펼친 영역에는 기존 이벤트·배송 tablist와 테스트 메일을 둔다. 테스트 메일은 별도 주요 카드가 아니라 `운영 도구` 하위 영역으로 표시한다.

초기 선택 탭은 조치할 배송 항목이 있으면 `배송`, 그렇지 않고 대기 이벤트가 있으면 `이벤트`다. 사용자가 탭을 바꾼 뒤에는 동일 상태에서 선택을 강제로 되돌리지 않는다.

## 8. 상호작용

### 8.1 자동 리마인더

1. 사용자가 switch를 변경한다.
2. 셀은 `저장 중` 상태가 되고 중복 조작을 막는다.
3. 서버 저장 성공 후에만 새 상태를 확정한다.
4. 실패하면 서버 확정 상태로 돌아가고 `저장하지 못했습니다 · 다시 시도`를 같은 셀에 표시한다.

켜짐 상태에는 `모임 전날 자동 발송` 결과 문구를 함께 표시한다. 상태 변경은 콘텐츠 저장 또는 수동 알림 발송을 실행하지 않는다.

### 8.2 회차와 알림 종류

회차 변경은 현재 선택한 멤버, 검색 결과, 미리보기를 무효화하고 해당 회차 options를 다시 불러온다.

알림 종류 변경은 서버가 제공한 기본 대상과 기본 채널을 반영하고 기존 미리보기를 무효화한다. 사용자가 편집한 상태와 오래된 preview를 섞지 않는다.

### 8.3 대상과 채널

서버가 허용한 대상만 보여준다.

- 추천 대상
- 전체 활성 멤버
- 세션 참가자 또는 참석 확정자
- 직접 선택

추천 대상에는 `추천` 배지와 실제 의미를 함께 표시한다. 직접 선택 시 검색, 더 보기, 선택 해제와 현재 선택 인원을 제공한다.

채널은 다음 중 서버가 허용한 현재 계약을 사용한다.

- 앱+이메일
- 앱 알림
- 이메일

### 8.4 미리보기 패널

기존 `HostNotificationComposerDialog`의 focus trap, body scroll lock, opener focus 복귀, `Escape` 동작을 재사용한다. 스타일은 데스크톱에서 우측 패널, 모바일에서 화면형 하단 패널이 되도록 조정한다.

패널은 다음을 표시한다.

- 회차와 알림 종류
- 최종 대상 인원
- 앱 알림 예상 인원
- 이메일 예상 인원
- 제목과 본문 미리보기
- 제외 대상과 사용할 수 없는 채널 경고
- 중복 발송 여부

최종 버튼 문구는 `{N}명에게 알림 발송`으로 표시한다.

닫기, backdrop, 뒤로 가기, `Escape`는 confirm callback을 호출하지 않는다. busy 중에는 우발적인 닫기를 막고 진행 상태를 표시한다.

### 8.5 최종 발송

최종 confirm만 실제 발송 상태를 변경한다.

- 미리보기 전: 발송 없음
- 패널 열기·닫기: 발송 없음
- 대상·채널 편집: 발송 없음
- 최종 버튼: 기존 confirm API 호출

중복 발송 경고가 있으면 `재발송을 확인했습니다`를 명시적으로 선택해야 버튼이 활성화된다.

## 9. 오류와 복구

### 9.1 정책

- 정책 loading: switch 비활성화와 짧은 loading 문구
- 정책 load 실패: 현재 상태를 추측하지 않고 다시 불러오기 제공
- 정책 save 실패: 서버 확정값 복원과 같은 셀의 재시도

### 9.2 작성 options

- 회차 options load 실패: 다른 페이지 영역은 유지하고 작업대 안에 재시도 표시
- 선택 가능한 회차 없음: 이유와 세션 관리 경로 표시
- 템플릿 사용 불가: 이유를 각 항목에 표시
- 멤버 검색 실패: 기존 선택을 보존하고 검색 영역에 재시도 표시

### 9.3 preview와 confirm

- 최종 대상 0명: preview 또는 confirm을 막고 대상 수정 방법 표시
- preview 만료: 발송을 막고 `최신 내용으로 다시 확인`
- stale content revision: 기존 preview를 폐기하고 최신 options/preview 요구
- 중복 발송: 명시적인 재발송 확인 필요
- confirm 응답 유실: 기존 idempotency 동작으로 같은 요청 결과를 안전하게 재확인
- 성공: 패널을 닫고 최근 수동 발송과 운영 상태를 갱신

### 9.4 운영 이상

대기·실패·중단이 새로 발생하면 운영 상세를 펼치고 조치 가능한 탭을 먼저 보여준다. 상태는 색상뿐 아니라 문구와 숫자로 표현한다.

## 10. 컴포넌트 경계

현재 route-first 의존 방향을 유지한다.

### 10.1 route

`front/features/host/route`는 계속 다음을 소유한다.

- loader와 query data 조합
- URL의 초기 회차·알림 종류
- options, preview, confirm, policy mutation
- query invalidation과 새 데이터 반영
- UI callback 조립

이번 리디자인은 새 API 호출을 UI 컴포넌트에 추가하지 않는다.

### 10.2 page composition

`HostNotificationsPage`는 다음 순서와 페이지 수준 상태만 조합한다.

- header
- operations rail
- manual workbench
- recent dispatch ledger
- operations disclosure
- preview dialog open/close
- 페이지 수준 status와 alert

### 10.3 UI 단위

구현 계획에서 다음 경계를 사용한다.

- `HostNotificationOperationsRail`
  - policy, summary와 callback을 props로 받음
  - 정책 저장·오류의 표현을 소유
- `ManualNotificationWorkbench`
  - 기존 draft 상태와 options 전환을 유지
  - 회차·종류·대상·채널을 새 정보 구조로 조합
- `HostNotificationComposer`
  - 허용 대상, 직접 선택, 채널과 preview 가능 여부 유지
- `HostNotificationComposerDialog`
  - 접근 가능한 modal 경계와 반응형 패널 shell 유지
- `ManualNotificationPreviewPanel`
  - preview 내용, 경고, 재발송 확인과 최종 confirm
- `ManualNotificationDispatchLedger`
  - 최근 3건 압축 행과 상세의 전체 목록 표현
- `NotificationOperationsDisclosure`
  - 이벤트·배송 장부, 자동 펼침 규칙, 테스트 메일 조합

UI 모듈은 API, query, route 또는 fetch를 import하지 않고 props/callback 기반으로 유지한다.

### 10.4 스타일

현재 화면에 흩어진 큰 inline layout style 중 리디자인 대상은 의미 있는 `rm-host-notifications-*` 클래스와 반응형 규칙으로 옮긴다. 무관한 전역 스타일과 다른 화면은 정리하지 않는다.

기존 색상, line, surface, text token을 사용하며 새 장식용 gradient, glow, glass effect는 추가하지 않는다.

## 11. 데이터 흐름

```text
route/query data
  ├─ summary ────────────────┐
  ├─ policy ──────────────── operations rail
  ├─ host sessions ─────────┐
  ├─ manual options ──────── manual workbench
  ├─ manual dispatches ───── recent ledger
  ├─ events/deliveries ───── operations disclosure
  └─ audit ───────────────── operations tools

manual workbench
  └─ preview callback
       └─ preview response
            └─ preview dialog
                 └─ explicit confirm callback
                      └─ invalidate and refresh visible ledgers
```

클라이언트는 서버가 반환한 허용 대상, 기본값, preview 결과를 표시한다. 최종 권한·활성 멤버십·수신 채널·중복·revision 검증은 기존 서버 계약에 남는다.

## 12. 반응형

### 12.1 데스크톱

- 페이지 본문 최대 너비 안에서 상태 레일과 작업대를 전폭 사용
- 자동 리마인더 셀은 지표 셀보다 넓게 배치
- 회차와 알림 종류는 2열
- preview dialog는 우측 패널
- 최근 발송은 선형 장부 행

### 12.2 태블릿

- 상태 레일은 2열 또는 CSS grid auto-fit
- 정책 셀은 필요한 경우 전폭
- 회차와 알림 종류는 가용 폭이 부족하면 한 열

### 12.3 모바일

- 정책 셀 전폭
- 네 지표는 2열
- 회차, 알림 종류, 대상, 채널은 한 열
- primary action은 전폭, 최소 높이 44px
- preview는 화면형 하단 패널
- 운영 상세의 tab과 action은 줄바꿈
- 가로 스크롤 없음

긴 한국어·영어 도서명, 멤버명, 오류 문구는 컨트롤과 배지 위로 겹치지 않는다.

## 13. 접근성

1. 각 영역은 semantic heading과 region 또는 disclosure 관계를 가진다.
2. 회차 select는 연결된 label을 유지한다.
3. 대상과 채널은 각각 fieldset/legend를 사용한다.
4. 자동 리마인더는 상태와 결과를 읽을 수 있는 접근 가능한 switch label을 가진다.
5. 비활성 템플릿 이유는 화면 문구와 `aria-describedby`로 연결한다.
6. 상태는 색상과 함께 이름, 숫자, 배지를 사용한다.
7. dialog는 focus trap, 초기 초점, opener 초점 복귀, `Escape`를 지원한다.
8. 주요 모바일 조작 영역은 최소 44px이다.
9. visible focus를 유지하고 reduced-motion 환경에서 불필요한 전환을 제거한다.
10. disclosure와 tablist는 키보드로 완전하게 조작할 수 있다.

## 14. 테스트 전략

### 14.1 컴포넌트와 route 테스트

- 독립된 큰 정책 카드와 중복 상태 요약이 더 이상 렌더링되지 않음
- 처리할 항목이 없을 때 비활성 처리 버튼이 없음
- 대기·실패·중단이 있을 때 운영 상세가 열림
- 동일 이상 상태에서 사용자가 상세를 접으면 반복해서 강제 재개방하지 않음
- 새 이상 상태 전환에서 상세가 다시 열림
- 정책 load/save success, failure, retry와 서버 확정 상태 복원
- 비활성 템플릿 이유가 화면과 접근 가능한 설명에 표시됨
- 직접 선택 시 선택 인원 표시
- draft 변경 시 오래된 preview 무효화
- 대상 0명, 만료, stale, 중복 발송 상태
- dialog 닫기, backdrop, `Escape`가 confirm을 호출하지 않음
- 최종 버튼에 실제 대상 인원이 표시됨
- 최근 발송이 최대 3건의 압축 행으로 표시됨

### 14.2 E2E

기존 수동 알림 E2E를 새 접근 가능한 이름과 흐름에 맞춰 갱신한다.

- 회차와 알림 종류 선택
- 전체 활성 멤버, 세션 참가자, 직접 선택
- 앱+이메일, 앱 알림, 이메일
- preview 전 무발송
- dialog 닫기와 `Escape` 무발송
- 최종 confirm 발송
- 만료·stale·중복 재발송
- 자동 리마인더 정책 저장 성공과 실패
- 최근 발송 갱신

### 14.3 시각 검증

- 데스크톱 viewport에서 계층, 상태 레일, 작업대, disclosure 확인
- 390px 모바일에서 한 열 흐름과 하단 패널 확인
- `scrollWidth === clientWidth`
- 주요 모바일 action 최소 44px
- 긴 도서명과 오류 문구 wrapping
- title, body, status badge WCAG AA 대비
- keyboard focus와 reduced motion

### 14.4 명령

구현 완료 후 최소 다음을 실행한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front exec playwright test tests/e2e/manual-notifications.spec.ts
git diff --check
```

E2E fixture 또는 공용 route 동작 영향이 예상보다 넓으면 전체 `corepack pnpm --dir front test:e2e`로 확장한다.

## 15. 수용 기준

1. 상단의 큰 자동 리마인더 카드가 사라지고 정책과 네 지표가 하나의 상태 레일에 표시된다.
2. 정상 상태에서 비활성 `처리할 알림 없음` 버튼이 표시되지 않는다.
3. 새 알림 발송 작업대가 회차, 종류, 대상·채널의 세 결정으로 읽힌다.
4. 사용할 수 없는 알림 종류의 이유가 화면에 보인다.
5. `미리보기 열기` 전에는 어떤 발송 confirm도 실행되지 않는다.
6. preview는 데스크톱 우측 패널과 모바일 화면형 패널에서 열린다.
7. 최종 버튼은 대상 인원을 포함하고, 이 버튼만 confirm을 호출한다.
8. 닫기, backdrop, 뒤로 가기, `Escape`는 발송하지 않는다.
9. 최근 수동 발송은 최대 3건의 장부 행으로 표시된다.
10. 정상 상태의 운영 상세는 접히고 새 이상 상태에서는 자동으로 열린다.
11. 이벤트·배송 장부와 테스트 메일은 운영 상세 안에 있다.
12. 390px에서 가로 overflow가 없고 핵심 조작이 44px 이상이다.
13. 기존 서버·BFF·DB·발송 안전 계약은 변경되지 않는다.

## 16. 예상 변경 표면

주요 예상 경로:

- `front/features/host/ui/host-notifications-page.tsx`
- `front/features/host/ui/notifications/host-notification-policy-card.tsx`
- `front/features/host/ui/notifications/host-notifications-summary.tsx`
- `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- `front/features/host/ui/notifications/host-notification-composer.tsx`
- `front/features/host/ui/notifications/host-notification-composer-dialog.tsx`
- `front/features/host/ui/notifications/manual-notification-preview.tsx`
- `front/features/host/ui/notifications/manual-notification-dispatch-ledger.tsx`
- `front/features/host/ui/notifications/notification-ledger-tabs.tsx`
- `front/src/styles/globals.css`
- 관련 co-located component test
- `front/tests/unit/host-notifications.test.tsx`
- `front/tests/e2e/manual-notifications.spec.ts`
- `CHANGELOG.md`

구현 중 현재 책임을 더 명확히 나눌 필요가 있으면 동일 `front/features/host/ui/notifications` 경계 안에 작은 UI 컴포넌트를 추가한다. 새 API 또는 서버 표면은 추가하지 않는다.

## 17. 잔여 위험과 완화

### 상태 disclosure가 사용자의 선택을 방해할 위험

같은 이상 상태에서 반복해서 자동으로 열지 않는다. 정상 → 이상 전환 또는 새로운 조치 상태가 생겼을 때만 다시 연다.

### dialog 재사용 시 다른 작성기 흐름에 영향을 줄 위험

공용 dialog의 접근성 동작은 유지하고, 알림 운영 화면 전용 layout class 또는 variant로 시각 변화 범위를 제한한다.

### 최근 3건과 전체 기록의 중복 위험

상단 최근 목록은 빠른 확인용 3건으로 한정하고, 전체 목록과 pagination은 운영 상세에만 둔다.

### 모바일 하단 내비게이션과 dialog가 겹칠 위험

modal stacking context, safe-area inset, body scroll lock과 하단 action padding을 실제 모바일 viewport에서 검증한다.

### 기술 문구 제거로 정책 의미가 약해질 위험

`모임 전날`, `기본 꺼짐`, `자동 발송`이라는 운영 결과는 유지한다. 시간대와 scheduler 세부는 UI가 아니라 동작 계약과 테스트에 남긴다.
