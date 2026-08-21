# ReadMates 호스트 모임 집중 작업 화면 재설계

작성일: 2026-08-21
상태: APPROVED DESIGN SPEC
대상 표면: host 모임 운영 UI, session lifecycle, session record, 변경 이력, session 삭제·복구

이 문서는 호스트가 한 모임을 처음 작성할 때부터 기록을 공개하고 나중에 수정할 때까지 사용하는 화면의 승인된 재설계다. 현재 동작의 source of truth는 코드와 `docs/development/architecture.md`이며, 이 문서는 구현 목표와 제품 계약을 정한다.

## 1. 앞선 설계와의 관계

`2026-08-21-host-meeting-operating-ledger-design.md`의 다음 결정은 유지한다.

- 한 모임의 작성 → 준비 → 마감 → 정리본 반영 → 공개를 한 운영 흐름으로 묶는다.
- 서버 lifecycle `DRAFT → OPEN → CLOSED → PUBLISHED`와 기존 역방향 동작을 기반으로 한다.
- 정리본 JSON은 preview → draft commit → apply → publish 순서를 지킨다.
- 다음에 읽을 책, schedule defaults, 멤버 노출 규칙, 쉬운 운영 카피를 유지한다.
- 브라우저는 same-origin `/api/bff/**`를 사용하고 클럽·호스트 권한 경계를 유지한다.

이 문서는 앞선 설계의 다음 항목을 대체한다.

- `모임 전 / 진행 중 / 모임 후` 단계 rail
- `개요 / 기본 정보 / 출석 / 기록 / 변경 기록` 5-tab 내비게이션
- 모임을 편집 기능별로 나누어 각 탭에서 별도의 긴 화면을 보여 주는 구조
- 허용된 모임을 즉시 물리 삭제하는 정책

두 문서가 충돌하면 이 문서의 화면 구조와 복구 정책을 우선한다.

## 2. 문제

현재 특정 모임 화면은 lifecycle 단계 rail 안에 다시 5개 편집 탭을 둔다. 두 내비게이션은 서로 다른 기준을 사용하고, `진행 중` rail과 `준비 중` 상태 chip처럼 같은 모임을 다르게 설명할 수 있다.

호스트가 실제로 해야 하는 다음 행동보다 다음 요소가 먼저 보인다.

- 넓은 단계 rail과 큰 상단 여백
- 회차·공개 범위·상태를 따로 나타내는 여러 chip
- 중요도가 같은 것처럼 보이는 5개 탭
- 탭마다 달라지는 길이와 레이아웃
- 기록 작업보다 먼저 보이는 입력 방식과 큰 보조 폼

그 결과 처음 쓰는 호스트는 현재 상태, 지금 해야 할 일, 완료 조건을 한 화면에서 판단하기 어렵다. 잘못 변경했을 때 즉시 되돌리는 경로와 나중에 복원하는 경로도 서로 연결되어 있지 않다.

## 3. 목표

- 첫 viewport에서 현재 상태, 다음 행동 하나, 핵심 진행도를 스크롤 없이 이해한다.
- 화면을 기능 모음이 아니라 **현재 작업 중심 운영 화면**으로 바꾼다.
- lifecycle 상태와 날짜 기반 권장 행동을 구분한다.
- 모든 상태에서 제목·상태·진행도·주 행동의 위치와 문법을 일관되게 유지한다.
- 기본 정보, 출석, 정리본, 공개, 수정과 복구를 같은 화면에서 끝낸다.
- 단순 변경은 빠르게 처리하면서 상태 변경·반영·공개·삭제에는 명시적 승인을 유지한다.
- 실수 직후 실행 취소와 나중의 변경 내역 복원, 7일 휴지통 복구를 제공한다.
- 모바일에서도 하단 앱 내비게이션과 겹치지 않는 주 행동으로 전체 흐름을 완료한다.
- 기존 deep link와 저장 데이터를 깨뜨리지 않는다.

## 4. Non-goals

- 멤버·게스트 화면 전체 정보 구조 재설계
- ReadMates 브랜드, typography, color token의 전면 교체
- 날짜가 되면 lifecycle 상태를 자동 변경하는 기능
- 새 lifecycle enum 추가
- 정리본 JSON 포맷 또는 AI 생성 방식 자체의 변경
- 기존 알림 발송·회수 정책 변경
- 현재 서버가 삭제를 허용하지 않는 `CLOSED/PUBLISHED` 모임까지 새로 삭제 가능하게 만드는 일
- 7일 전에 삭제된 과거 데이터의 소급 복구

## 5. 검토한 구조와 선택

검토한 구조:

1. **집중 작업 카드(Focus Deck)** — 선택. 현재 작업 하나와 짧은 진행도를 같은 화면에 둔다.
2. Journey Map + Work Panel — 전체 여정은 잘 보이지만 기존 단계 rail과 비슷한 두 번째 내비게이션이 다시 생긴다.
3. Folding Ledger — 정보 밀도는 좋지만 처음 쓰는 호스트에게 접힌 영역의 의미와 순서를 학습시킨다.

선택한 구조는 전체 여정을 항상 같은 비중으로 펼치지 않는다. 서버 상태와 완료 데이터를 이용해 지금 가장 중요한 작업을 한 장의 주 카드로 올리고, 나머지는 짧은 진행 목록과 보조 panel로 둔다.

## 6. 단일 화면 정보 구조

특정 모임의 canonical 주소는 계속 `/app/host/sessions/:sessionId`다. 이 주소에는 하나의 `HostSessionWorkspace`만 렌더링한다. 현재의 `HostMeetingLedger` shell 안에 `HostSessionEditor`와 탭을 다시 넣는 중첩 구조는 제거한다.

위에서 아래 순서:

1. **간결한 모임 header**
   - 책 제목 또는 모임 제목
   - `n번째 · 날짜`
   - 네 상태 중 하나
   - 보조 action `모임 정보`, `변경 내역`
2. **지금 할 일**
   - 상태와 완료 데이터에서 계산한 제목·설명
   - 필요한 입력 또는 요약
   - 주 행동 하나
   - 영향이 큰 행동의 약한 역방향 action
3. **진행도**
   - 기본 정보, 멤버 준비, 출석, 기록, 공개 중 이 모임에 해당하는 항목
   - 완료·진행 중·대기·확인 필요 상태
   - 탭이 아니라 작업 목록이며, 선택하면 같은 화면 안의 editor/panel을 연다.
4. **관련 작업**
   - 다음에 읽을 책, 이전 모임 기록 남음, 기록 보조 입력처럼 현재 상태와 관련 있을 때만 노출
5. **복구 feedback**
   - 작업 직후 실행 취소
   - 변경 내역에서 복원
   - 삭제된 모임의 7일 복구

`모임 정보`와 `변경 내역`은 데스크톱 side panel, 모바일 bottom sheet로 연다. URL과 브라우저 뒤로 가기를 통해 닫을 수 있고, 주 작업의 스크롤 위치와 미저장 입력은 유지한다.

## 7. 화면 상태와 날짜

화면에는 하나의 상태만 표시한다.

| 화면 상태 | 서버 상태 | 의미 |
| --- | --- | --- |
| 모임 작성 중 | `DRAFT` | 호스트가 정보를 작성하고 아직 멤버 활동을 열지 않음 |
| 멤버와 준비 중 | `OPEN` | 멤버 RSVP·질문과 호스트 준비가 열림 |
| 기록 정리 중 | `CLOSED` | 멤버 활동은 닫혔고 출석·정리본·공개를 마무리함 |
| 공개 완료 | `PUBLISHED` | 공개 가능한 기록이 반영·공개됨 |

날짜는 상태를 바꾸지 않는다. 날짜와의 거리는 같은 `OPEN` 안에서 권장 행동의 우선순위만 바꾼다.

- 모임 전: 멤버 응답과 질문 확인
- 모임 당일: 출석 확인과 `모임 마치기`
- 날짜가 지났지만 `OPEN`: 지연 상태를 알리고 `모임 마치기`

모든 lifecycle 전환은 호스트가 명시적으로 실행한다.

## 8. 상태별 첫 화면

### 8.1 모임 작성 중

- 주 카드: 필수 정보의 남은 항목과 미리보기
- 주 행동: `멤버와 준비 시작`
- 필수 정보가 부족하면 같은 카드에서 해당 입력을 열고, 버튼 아래 한 줄로 막힌 이유를 말한다.
- 기본 정보 저장은 lifecycle 전환이 아니다. 저장 후에도 `DRAFT`다.
- 삭제 가능 조건을 만족하면 `모임 정보` 안에 `휴지통으로 이동`을 둔다.

### 8.2 멤버와 준비 중

- 평상시 주 카드: 참석 응답, 질문, 확인 필요 항목
- 모임 당일 주 카드: 출석 현황과 `모임 마치기`
- 날짜가 지나면 지연 안내와 `모임 마치기`를 먼저 둔다.
- 기본 정보·출석은 같은 화면에서 언제든 수정할 수 있다.
- 역방향 action은 `작성 중으로 되돌리기`다.

### 8.3 기록 정리 중

하나의 기록 흐름에서 아직 끝나지 않은 첫 단계를 주 카드로 올린다.

1. `정리본 올리기`
2. `반영 전 확인`
3. `기록에 반영`
4. `기록 공개`

업로드·AI·직접 작성으로 만든 내용은 자동 반영하거나 공개하지 않는다. 호스트가 내용을 고치고 명시적으로 반영·공개한다. 출석 수정과 다음에 읽을 책은 관련 작업으로 유지한다. 역방향 action은 `다시 준비 중으로`다.

### 8.4 공개 완료

- 주 카드: 멤버에게 보이는 결과와 `공개 기록 보기`
- 기록을 고칠 때 `수정본 만들기`로 기존 공개본을 바꾸지 않은 채 draft를 연다.
- 수정본은 다시 검토·반영해야 live 기록이 바뀐다.
- 공개 범위와 lifecycle 조건이 허용할 때 `공개 취소`를 제공한다.

## 9. 편집·저장 계약

입력 성격에 따라 저장 방식을 나눈다.

`모임 정보`, 출석, record draft 편집 진입점은 네 상태 모두에서 유지한다. 이를 고치기 위해 lifecycle을 먼저 되돌리게 하지 않는다. `PUBLISHED`에서 멤버·공개 화면에 쓰이는 기본 정보나 출석을 저장하면 영향 범위를 확인 문구로 알리고 관련 cache를 무효화하지만, 모임을 자동으로 `CLOSED`로 바꾸지는 않는다.

### 명시적으로 저장

- 제목, 책, 날짜, 시간, 장소, 접속 정보 같은 기본 정보
- 정리본의 요약·하이라이트·한줄평·피드백 문서
- 여러 필드를 함께 바꾸는 form

입력 중에는 route-local draft를 유지한다. 저장 전에는 서버 값을 부분적으로 바꾸지 않는다. 미저장 상태를 표시하고 pathname 이탈 시 경고한다. panel을 열고 닫거나 같은 모임의 작업을 바꿀 때는 draft를 보존한다.

### 즉시 저장

- 출석 상태
- 단일 공개 범위 toggle처럼 뜻이 분명하고 역변경이 안전한 값

UI는 먼저 결과를 보여 줄 수 있지만 서버 실패 시 이전 값으로 되돌리고 입력 위치를 유지한다. 성공하면 실행 취소 action을 제공한다.

### 명시적 확인 뒤 실행

- 멤버와 준비 시작
- 모임 마치기와 lifecycle 되돌리기
- 기록 반영과 공개·공개 취소
- 휴지통으로 이동과 복원 충돌 해결

확인 dialog는 바뀌는 결과를 한 문장으로 말한다. 네트워크 성공 응답 전에는 완료 상태로 이동하지 않는다.

## 10. 실행 취소와 변경 내역 복원

복원은 과거 audit를 수정하는 일이 아니라 과거 값을 바탕으로 **새 변경을 만드는 일**이다. 누가 무엇을 되돌렸는지 다시 변경 내역에 남긴다.

복구 수준:

| 변경 | 직후 실행 취소 | 나중 복원 |
| --- | --- | --- |
| 기본 정보 저장 | 직전 change로 복원 | 변경 내역에서 당시 값 미리보기 후 복원 |
| 출석 변경 | 직전 상태로 복원 | 변경 내역에서 참석자별 당시 값 확인 후 복원 |
| 기록 draft/apply | 직전 draft 또는 새 수정본 | 기존 revision을 draft로 복원 후 검토·반영 |
| lifecycle | 대응하는 역방향 action | 변경 내역에서 가능한 현재 역방향 action 안내 |
| 삭제 | 현재 화면에서 즉시 복구 | 7일 동안 휴지통에서 복구 |

되돌릴 수 있는 mutation 응답은 `changeId`와 복구 가능 여부를 반환한다. 실행 취소는 이 식별자를 사용하며, 화면에만 남아 있는 임시 inverse 값에 의존하지 않는다.

기본 정보와 출석은 변경 전·후의 복구 가능한 snapshot을 서버에 보관한다. 복원 전 preview에서 현재 값과 복원할 값을 보여 준다. 복원 요청은 현재 version 또는 `updatedAt`을 함께 보내며, 그 사이 다른 변경이 있으면 `409`로 중단한다.

기록은 기존 immutable revision과 `restore-to-draft` 경계를 유지한다. 과거 revision을 live에 바로 덮어쓰지 않는다.

변경 내역은 현재 상태에서 실제로 복원할 수 있는 항목에만 action을 보여 준다. 현재 lifecycle이나 더 최신 변경 때문에 바로 복원할 수 없으면 비활성 버튼 대신 이유와 가능한 다음 행동을 설명한다.

## 11. 7일 휴지통

현재 삭제 허용 범위인 `DRAFT/OPEN`과 기존 내구 이력 blocker는 유지한다. 삭제가 허용된 모임에 대해서만 물리 삭제를 즉시 수행하지 않고 휴지통으로 이동한다.

- `sessions`에 club-scoped soft-delete 메타데이터 `deleted_at`, `deleted_by_membership_id`, `purge_after`를 저장한다.
- 기본 모임·현재 모임·예정 모임·공개 query는 삭제된 row를 제외한다.
- 삭제 직후 현재 주소에는 tombstone 화면을 보여 주고 `방금 삭제한 모임 복구`를 제공한다.
- 모임 목록의 `휴지통`에서는 남은 기간과 함께 복구할 수 있다.
- 서버 시각으로 `purge_after = deleted_at + 7일`을 저장한다. `purge_after` 전까지만 복구할 수 있다.
- `purge_after`가 지나면 복원 API는 `410`을 반환하고, 정기 cleanup이 기존 물리 삭제 규칙으로 관련 row를 제거한다.
- `OPEN` 모임을 복원할 때 다른 `OPEN`이 있으면 복원을 막고 그 모임으로 가는 링크를 제공한다.
- 복원·만료·물리 삭제는 lifecycle/change audit에 남긴다.

기존 hard-delete query는 휴지통 이동에 사용하지 않고 만료 cleanup에만 사용한다. cleanup 전에는 child row와 기록을 보존한다.

## 12. URL과 브라우저 동작

기존 `section` query는 탭 선택이 아니라 새 화면의 작업/panel deep link로 해석한다.

| 기존 주소 상태 | 새 동작 |
| --- | --- |
| query 없음 또는 `section=overview` | 계산된 지금 할 일 |
| `section=basic` | `모임 정보` editor 열기 |
| `section=attendance` | 출석 작업 열기 |
| `section=records` | 기록 정리 작업 열기 |
| `section=records&source=json` 또는 `records=json` | 정리본 올리기 열기 |
| `section=records&source=ai` 또는 `aigen=1` | 기존 AI draft 보조 작업 열기 |
| `section=history` | 변경 내역 panel 열기 |

이 query는 link 호환성과 뒤로 가기 복원을 위해 유지하지만 화면에는 tablist를 만들지 않는다. 잘못된 값은 지금 할 일로 안전하게 돌아간다. panel의 열기·닫기는 browser history와 focus 복원을 지원한다.

## 13. Frontend 구조

기존 feature boundary를 유지한다.

- `api`: 새 복원·휴지통 계약과 기존 BFF 호출
- `queries`: query key, mutation, 세션 detail/list/history/trash invalidation
- `model`: React·router·query import가 없는 순수 workflow model
- `route`: loader/query 조합, URL 호환, local draft, mutation orchestration, undo receipt, panel 상태
- `ui`: workflow view model과 callback만 받아 렌더링

순수 workflow model의 입력:

- session state와 날짜
- 필수 정보 완성 여부
- RSVP·출석 요약
- record draft/live revision과 validation
- publication eligibility
- 확인 필요 항목
- 현재 deep-link task

출력:

- 화면 상태 label
- 지금 할 일의 kind, title, description, CTA, blocker
- 진행 목록과 각 항목의 상태·target
- 관련 작업 노출 여부
- 허용된 역방향·복구 action

현재 `HostMeetingLedger`와 `HostSessionEditor`가 각각 header/navigation을 소유하는 구조를 하나의 route-owned workspace 조합으로 바꾼다. 기록 editor/import/history의 검증된 하위 component는 새 작업 panel 안에서 재사용한다. history와 상태상 필요 없는 무거운 보조 query는 panel이 열릴 때 활성화한다.

## 14. Server와 persistence 경계

기존 controller → application service → port/adapter 구조를 유지한다. controller는 입력과 응답 mapping만, application service는 club-scoped authorization·복원 가능성·lifecycle 충돌을 담당한다.

필요한 서버 변경:

- 세션 soft-delete 메타데이터 migration과 active query filtering
- host-only trash list/read/restore endpoint
- 만료 cleanup과 audit
- 기본 정보·출석의 immutable change snapshot
- change restore preview/commit endpoint와 optimistic concurrency 검사
- 되돌릴 수 있는 기존 mutation 응답의 `changeId` 연결
- 기존 generic BFF proxy를 유지하고 새 host mutation이 same-origin·host client-contract 검사를 그대로 통과하는지 회귀 검증

복원은 현재 club의 host만 실행할 수 있다. browser가 보낸 내부 club header를 신뢰하지 않는다. 삭제·복원 query, lifecycle singleton, 멤버/게스트 current/upcoming, 공개 기록 query 모두 `deleted_at` 조건을 명시적으로 검증한다.

## 15. 실패와 충돌

- 저장 실패: 해당 editor 안에 원인과 `다시 시도`; 입력값 유지
- 즉시 저장 실패: 시각 값을 이전 상태로 되돌리고 해당 control에 오류 연결
- lifecycle 실패: 기존 상태 유지, 버튼 가까이에 이유 표시
- record stale: 현재 draft를 버리지 않고 최신 live와 다시 비교
- 기본 정보·출석 복원 충돌: 자동 덮어쓰기 금지, 최신 값과 복원 예정 값 비교
- 삭제 복원 충돌: 다른 `OPEN` 링크와 해결 조건 표시
- 휴지통 만료: 복원 불가와 만료 시점을 명확히 표시
- query 일부 실패: 전체 화면을 빈 화면으로 바꾸지 않고 해당 작업만 재시도

오류 뒤에도 focus, 스크롤 위치, 입력값을 보존한다. 동일한 영향 큰 요청의 결과를 알 수 없으면 임의로 재전송하지 않고 최신 서버 상태를 먼저 읽는다.

## 16. Responsive와 시각 원칙

현재 ReadMates의 차분한 editorial typography, neutral surface, navy primary action을 유지한다. 새 brand layer나 과도한 gradient·pill·dashboard card grid를 만들지 않는다.

Desktop:

- header와 본문을 같은 content grid에 맞춘다.
- 주 작업은 넓은 column, 진행도·관련 작업은 좁은 보조 column에 둔다.
- 화면 전체를 차지하는 lifecycle rail과 비어 있는 좌우 공간을 만들지 않는다.
- 한 단계에서 한 개의 시각적 primary button만 둔다.

Tablet/mobile:

- 한 column 순서: header → 지금 할 일 → 진행도 → 관련 작업
- 주 행동은 safe-area와 앱 bottom navigation 높이를 고려한 sticky footer에 둔다.
- keyboard가 열리거나 bottom sheet가 열리면 sticky action이 입력을 가리지 않는다.
- 320px에서도 가로 scroll 없이 label과 action이 줄바꿈된다.

상태는 색상만으로 구분하지 않는다. 완료 icon에는 text label을 제공하고, 중요하지 않은 metadata는 작은 chip 여러 개 대신 한 줄의 문장으로 합친다.

## 17. 접근성

- 페이지에는 하나의 `h1`, 각 작업에는 순서가 맞는 heading을 쓴다.
- 진행도는 tablist가 아니라 이름 있는 list로 표현한다.
- 현재 상태는 text와 `aria-current` 또는 동등한 semantic을 함께 쓴다.
- 저장·실패·실행 취소 가능 상태는 적절한 `status`/`alert` live region으로 알린다.
- dialog와 bottom sheet는 focus trap, Escape, backdrop close, trigger focus 복원을 지원한다.
- 오류 메시지는 관련 field/control과 programmatically 연결한다.
- 모든 action은 keyboard로 실행 가능하고 모바일 touch target은 최소 44×44px다.
- reduced motion에서는 panel·toast transition을 줄인다.

## 18. Acceptance

### 사용자 경험

- 각 상태의 첫 viewport에 현재 상태, 지금 할 일, 주 행동, 핵심 진행도가 있다.
- rail과 5-tab nav가 동시에 또는 별도로 다시 나타나지 않는다.
- 처음 보는 호스트가 별도 설명 없이 작성 → 준비 → 출석 → 마감 → 정리본 → 반영 → 공개 → 수정본 흐름을 찾을 수 있다.
- 기본 정보·출석·draft는 현재 lifecycle을 강제로 되돌리지 않고 수정할 수 있다.
- 모든 영향 큰 전환은 명시적 확인 뒤 실행된다.
- 변경 직후 실행 취소, 변경 내역 복원, 7일 휴지통 복구가 서버 새로고침 뒤에도 동작한다.
- 오류·충돌·브라우저 이동에서 입력이 조용히 유실되거나 덮어써지지 않는다.
- 기존 `section` deep link가 해당 작업/panel을 연다.

### 화면

- 320, 390, 768, 1440px에서 horizontal overflow가 없다.
- 모바일 sticky CTA가 bottom navigation, safe area, keyboard와 겹치지 않는다.
- 상태마다 header·주 카드·진행도 위치가 일관된다.
- desktop에서 불필요한 full-width rail과 큰 공백이 없다.

### 자동 검증

Frontend model:

- 네 상태 mapping과 날짜별 `OPEN` 권장 행동
- 완료 데이터별 다음 작업과 blocker
- deep-link mapping
- 진행도와 역방향·복구 action

Frontend UI/route:

- panel/bottom-sheet focus와 browser back
- local draft 보존과 pathname 이탈 guard
- 즉시 저장 rollback과 undo receipt
- record 검토·반영·공개의 명시적 경계
- tombstone과 trash 복원
- responsive rendering과 sticky CTA

Server:

- club/host authorization
- active query가 soft-deleted session을 제외함
- 7일 전 복원, 만료 후 `410`, 만료 cleanup
- `OPEN` 복원 singleton 충돌
- 기본 정보·출석 snapshot과 restore concurrency
- record revision restore 회귀
- lifecycle·guest/public exposure 회귀

Acceptance matrix는 Session lifecycle, UI/runtime state, Actor/authorization, Persistence/migration, Guest/public exposure를 선택한다. 새 host mutation path가 기존 generic BFF proxy의 same-origin·host client-contract 경계를 통과하므로 BFF·auth 회귀도 포함한다.

구현 완료 전 최소 명령:

- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `./scripts/server-ci-check.sh`
- `./server/gradlew -p server integrationTest`
- `pnpm --dir front test:e2e`

브라우저로 네 lifecycle 상태, 320/390px 모바일, desktop, undo/history/trash, deep link를 직접 확인하고 screenshot evidence를 남긴다.

## 19. 구현 순서 제약

1. 순수 workflow model과 기존 URL 호환을 먼저 만든다.
2. 단일 workspace shell과 네 상태별 주 카드로 중첩 navigation을 제거한다.
3. 기존 기본 정보·출석·record component를 작업 panel에 연결한다.
4. 저장 오류·local draft·즉시 undo feedback을 연결한다.
5. 서버 change snapshot과 history restore를 추가한다.
6. soft-delete, trash restore, expiry cleanup을 추가한다.
7. responsive·accessibility·E2E를 닫는다.

각 단계는 기존 API 계약을 깨지 않는 작은 vertical slice로 나눈다. persistence와 API가 준비되기 전에 client-only 가짜 복구를 완성 동작처럼 노출하지 않는다.
