# ReadMates 내 공간 ‘나의 서재’ UI/UX 리디자인

작성일: 2026-07-27
상태: 디자인 승인 완료, 작성본 검토 대기

## 1. 요약

`/clubs/:clubSlug/app/me`를 계정 설정과 중복 기록 카드가 섞인 화면에서 개인 독서 기록이 중심인 `나의 서재`로 재구성한다.

현재 화면은 다음 문제가 함께 존재한다.

- `나의 리듬`, `내가 남긴 문장`, `독서 여정`, `최근 활동`, `피드백 문서`가 같은 질문·서평·회차 정보를 반복한다.
- 데스크톱의 두 열에서 기록은 좁은 왼쪽 열에 갇히고 설정 열은 먼저 끝나 큰 빈 공간이 생긴다.
- 모바일은 책별 기록 목록 뒤에 같은 회차의 피드백 문서를 다시 전부 나열해 스크롤이 길다.
- `함께 읽어온 길 / 독서 여정`, `기록 · 전체 N개 / 피드백 문서`처럼 eyebrow와 제목이 같은 의미를 반복한다.
- 이메일과 계정 정보가 개인 기록보다 먼저 보여 화면의 목적이 계정 관리처럼 느껴진다.
- 질문, 서평, 피드백 문서를 각각 첫 30개만 가져와 프런트에서 합치므로 기록이 많아지면 전체 수와 책별 여정이 일부 page만으로 계산될 수 있다.

선택한 해법은 `개인 독서 서재`다. 페이지는 최신 책별 기록, 정확한 개인 요약, 책별 기록 목록을 먼저 보여준다. 계정과 알림은 같은 route의 보조 disclosure로 내린다. 질문·서평·피드백을 프런트에서 서로 다른 page로 합치지 않고, 서버가 권한과 cursor를 보장하는 전용 read projection으로 제공한다.

## 2. 목표

1. 사용자가 10초 안에 최근 기록, 참여 규모, 질문·서평 수, 피드백 진입을 파악하게 한다.
2. 한 회차의 책, 질문, 서평, 피드백 문서를 한 기록 단위로 묶는다.
3. 기록과 설정의 시각적 우선순위를 분리한다.
4. 데스크톱과 모바일이 같은 정보 순서와 기능을 사용하게 한다.
5. page limit과 프런트 합성에 기대지 않는 정확한 전체 요약과 cursor 목록을 제공한다.
6. 기록이 없거나 일부 결과물이 없는 상태, 권한 제한, 추가 로딩 실패를 정직하게 표현한다.
7. ReadMates의 따뜻한 종이 면, 잉크 계층, 조용한 편집 지면 톤을 유지한다.

## 3. 비목표

- `/app/archive` 또는 회차 상세 화면의 전면 리디자인
- 새로운 멤버 기록 작성 기능, 검색, 필터, 정렬 옵션 추가
- 알림 종류, 알림 저장 정책 또는 이메일 발송 동작 변경
- 피드백 문서의 열람 권한 또는 PDF feature flag 변경
- 프로필 이름 검증, 클럽 탈퇴, 로그아웃 동작 변경
- 새 데이터베이스 table 또는 Flyway migration 추가
- 공개 사이트, 호스트 앱, 플랫폼 관리자 화면 변경
- 공용 디자인 시스템 전체 리팩터링

## 4. 검토한 접근

### 4.1 선택: 개인 독서 서재

개인 기록을 주인공으로 두고 최신 책별 기록과 전체 책별 목록을 하나의 편집 지면으로 보여준다. 계정과 알림은 명확한 진입을 유지하되 기본 상태에서는 접는다.

장점:

- ReadMates 멤버 화면의 `개인 독서 책상` 정체성과 가장 잘 맞는다.
- 같은 책과 회차를 여러 목록에서 반복하지 않는다.
- 아카이브와 역할이 겹치지 않는다. 아카이브는 클럽 전체 기록, 내 공간은 개인 기록이다.
- 설정이 기록을 밀어내지 않으면서도 같은 route에서 찾을 수 있다.

### 4.2 제외: 기록 대시보드

참석률, 완독률, 질문, 서평을 큰 metric card로 먼저 보여주고 tab으로 기록을 탐색하는 방식이다.

제외 이유:

- 숫자는 빠르게 읽히지만 일반적인 SaaS dashboard처럼 보이기 쉽다.
- 100% 같은 비율이 분모와 실제 의미보다 과도하게 강조된다.
- 현재 사용자가 느끼는 카드 중첩과 톤 불일치를 다시 만들 가능성이 크다.

### 4.3 제외: 계정 관리 허브

프로필, 멤버십, 알림, 탈퇴를 우선 배치하고 개인 기록은 짧은 preview로만 제공하는 방식이다.

제외 이유:

- 설정 찾기는 쉽지만 독서모임 제품의 정체성과 재방문 가치가 약해진다.
- 계정 변경보다 기록 회고의 사용 빈도와 감정적 가치가 높다는 페이지 목적과 맞지 않는다.

## 5. 디자인 원칙

1. 책 한 권과 회차 하나를 하나의 기록 단위로 취급한다.
2. 큰 카드보다 구획선, 여백, 타이포그래피, 작은 책 표지로 계층을 만든다.
3. 숫자는 분모 또는 명확한 단위와 함께 보여준다.
4. 존재하지 않는 결과를 `0` chip으로 과시하지 않는다.
5. 사용 가능한 행동만 구체적인 동사로 보여준다.
6. 이메일 같은 계정 정보는 기록 지면에서 숨기고 설정 안에 둔다.
7. 색상만으로 가용성, 잠김, 오류 또는 선택 상태를 표현하지 않는다.
8. 프런트가 일부 page를 전체 데이터처럼 해석하지 않는다.

## 6. 정보 구조

### 6.1 데스크톱

데스크톱은 최대 너비가 제한된 단일 기록 열을 중앙에 둔다. 현재의 영구적인 오른쪽 설정 열은 제거한다.

```text
내 공간
├─ 나의 서재
│  ├─ 짧은 설명
│  └─ 계정·알림 설정
├─ 개인 요약
│  ├─ 참여한 회차
│  ├─ 완독한 회차
│  ├─ 질문
│  └─ 서평
├─ 최근 책별 기록
│  ├─ 책과 회차 정보
│  ├─ 내 질문·서평 요약
│  ├─ 회차 기록
│  └─ 열람 가능한 경우 피드백 문서
├─ 책별 기록
│  ├─ 연도 구획
│  └─ cursor 기반 기록 행
└─ 계정과 알림 disclosure
   ├─ 프로필과 멤버십
   ├─ 알림 설정
   ├─ 로그아웃
   └─ 계정 경계
```

### 6.2 모바일

모바일은 데스크톱과 같은 정보 순서를 사용한다.

- mobile header의 `내 공간` 제목과 하단 tab bar는 유지한다.
- header 우측에 `설정` 진입을 제공하고 같은 route의 설정 disclosure를 연다.
- 개인 요약은 `참여`, `질문`, `서평` 세 항목을 기본으로 보여준다.
- 완독 정보는 공간이 부족한 화면에서 별도 큰 metric으로 강제하지 않고 요약 문장 또는 확장 정보로 제공한다.
- 최근 기록은 책 표지, 회차, 제목, 내 결과를 한 compact panel로 보여준다.
- 나머지 책별 기록은 카드가 아닌 구분선 목록을 사용한다.
- 설정과 계정 경계는 기록 목록 뒤에 배치한다.

## 7. 문구와 정보 우선순위

### 7.1 주요 문구

| 현재 | 제안 |
| --- | --- |
| `계정과 기록` | `나의 서재` |
| `멤버 정체성 / 계정` | 기본 화면에서 제거하고 `계정과 알림` 안으로 이동 |
| `읽기 기록 / 나의 리듬` | 별도 section을 제거하고 개인 요약으로 통합 |
| `내 글 / 내가 남긴 문장` | 질문·서평 수를 개인 요약과 책별 기록에 통합 |
| `함께 읽어온 길 / 독서 여정` | `책별 기록` |
| `최근 활동` | 제거 |
| `기록 · 전체 N개 / 피드백 문서` | 별도 목록을 제거하고 각 책 행의 `피드백 문서` 행동으로 통합 |
| `전체 보기` | 대상에 따라 `회차 기록`, `피드백 읽기`, `아카이브에서 보기` |

`최근 활동`은 같은 책 제목과 질문·서평 종류를 반복할 뿐 실제 문장이나 다음 행동을 제공하지 않으므로 제거한다. 질문·서평 전문 탐색은 기존 아카이브 tab이 계속 담당한다.

### 7.2 개인 요약

기본 요약은 다음 값을 사용한다.

- `참여`: 참석 확정된 회차 수
- `완독`: 읽기 진행률이 100인 회차 수. 데스크톱에서는 `N/M` 형태로 분모를 함께 표시한다.
- `질문`: 전체 개인 질문 수
- `서평`: 전체 개인 장문 서평 수

퍼센트만 단독으로 크게 표시하지 않는다. page가 더 존재하는 경우 `30+`처럼 추정하지 않고 서버 summary의 정확한 count를 사용한다.

## 8. 책별 기록 행

한 행은 다음 정보를 순서대로 제공한다.

1. 회차 번호
2. 책 표지 또는 typographic fallback
3. 책 제목과 날짜
4. 존재하는 개인 결과만 표시하는 `질문 N`, `서평 N`
5. `회차 기록` 링크
6. 열람 가능할 때 `피드백 문서` 링크

`질문 0`, `서평 0`은 표시하지 않는다. 피드백 문서가 존재하지 않으면 행동을 만들지 않는다.

행 전체를 하나의 링크로 만들면서 내부에 피드백 링크를 중첩하지 않는다. 행은 semantic container로 두고 책 제목 또는 명시적인 `회차 기록`을 primary link로 사용한다. 피드백 문서는 sibling link로 제공한다.

긴 한국어·영어 책 제목은 제어를 밀어내지 않게 줄바꿈한다. 모바일 행동은 최소 44px hit target을 확보한다.

## 9. 계정과 알림 disclosure

설정은 같은 `/app/me` route에 유지한다. 새 route는 만들지 않는다.

- desktop header: `계정·알림 설정`
- mobile header: 접근 가능한 이름이 `계정·알림 설정`인 설정 행동
- 기본 상태: 닫힘
- 열림 상태: profile, notification preferences, logout, membership boundary 순서
- profile 안에서만 email과 account identity를 보여준다.
- notification preference를 관리할 수 없는 membership에는 저장 가능한 switch를 표시하지 않는다.
- 탈퇴는 일반 설정과 시각적으로 분리하고 현재 확인 절차를 보존한다.

header 행동은 disclosure를 연 뒤 설정 heading으로 focus 또는 scroll context를 옮긴다. disclosure는 native button과 `aria-expanded`, `aria-controls` 또는 동등한 semantics를 사용한다.

프로필 저장이나 route revalidation으로 데이터가 바뀌어도 사용자가 열어 둔 disclosure를 불필요하게 닫지 않는다.

## 10. 서버 read projection

### 10.1 필요한 이유

현재 my-page loader는 다음 데이터를 독립적으로 첫 30개씩 읽는다.

- `/api/app/me`
- `/api/feedback-documents/me`
- `/api/archive/me/questions`
- `/api/archive/me/reviews`
- `/api/me/notifications/preferences`

프런트가 질문과 서평을 책별로 합치고, 별도로 피드백 문서를 나열한다. 이 구조는 다음 문제를 만든다.

- page limit 이후 항목이 count와 책별 grouping에서 빠질 수 있다.
- 서로 다른 cursor page 사이의 정합성을 프런트가 보장할 수 없다.
- 한 책을 독서 여정과 피드백 문서에서 중복 렌더링한다.
- my-page 첫 진입에 서로 다른 읽기 요청이 다섯 개 필요하다.

### 10.2 endpoint

archive read-side에 다음 endpoint를 추가한다.

```http
GET /api/archive/me/journey?limit=12&cursor=<cursor>
```

응답은 기존 cursor page shape를 유지하고 목록 전체 summary를 추가한다.

```json
{
  "items": [
    {
      "sessionId": "00000000-0000-0000-0000-000000000001",
      "sessionNumber": 9,
      "bookTitle": "샘플 도서",
      "bookAuthor": "샘플 저자",
      "bookImageUrl": null,
      "date": "2026-07-22",
      "readingProgress": 100,
      "questionCount": 3,
      "reviewCount": 1,
      "feedbackDocument": {
        "available": true,
        "readable": true,
        "lockedReason": null
      }
    }
  ],
  "summary": {
    "attendedSessionCount": 9,
    "completedReadingCount": 7,
    "questionCount": 28,
    "reviewCount": 3,
    "readableFeedbackDocumentCount": 9
  },
  "nextCursor": null
}
```

예시는 공개 저장소에 안전한 샘플 값만 사용한다.

### 10.3 포함 범위

journey item은 현재 멤버에게 archive-visible한 `CLOSED` 또는 `PUBLISHED` 회차 중 다음 하나 이상에 해당하는 회차다.

- 현재 membership의 참석이 확정됨
- 현재 membership이 질문을 남김
- 현재 membership이 장문 서평을 남김
- 현재 membership에 피드백 문서 metadata를 노출할 수 있음

`HOST_ONLY` 회차와 다른 club 데이터는 포함하지 않는다.

summary는 같은 club과 같은 visibility·membership 경계를 사용한다.

- `attendedSessionCount`: 참석이 확정된 archive-visible 회차 수
- `completedReadingCount`: 위 참석 회차 중 reading progress가 100인 회차 수
- `questionCount`: 현재 membership이 남긴 전체 질문 수
- `reviewCount`: 현재 membership이 남긴 전체 장문 서평 수
- `readableFeedbackDocumentCount`: 현재 membership이 실제로 열람할 수 있는 피드백 문서 수

질문과 서평 count는 첫 page 길이가 아니라 전체 aggregate로 계산한다. `completedReadingCount`는 `attendedSessionCount`를 넘을 수 없고, UI는 두 값을 `완독 N/M`으로 함께 사용한다.

피드백 metadata는 가용성과 열람 가능 상태만 제공한다. 문서 본문, file content 또는 다른 멤버 정보는 포함하지 않는다. 실제 문서 route는 기존 권한 검사를 다시 수행한다.

### 10.4 정렬과 cursor

- `date DESC`
- 같은 날짜에서는 `sessionNumber DESC`
- 마지막 tie-breaker는 `sessionId DESC`

cursor는 이 정렬 key를 안전하게 encode한다. 다음 page를 불러와도 기존 행 순서가 바뀌거나 중복되지 않아야 한다.

### 10.5 query와 architecture

- 기존 archive read-side의 controller → use case → `@ReadOnlyApplicationService` → load port → JDBC adapter 경계를 따른다.
- page query와 summary query는 page size와 무관한 고정 query 수를 사용한다.
- 회차별 추가 query를 반복하는 N+1을 허용하지 않는다.
- 새 영속 상태나 migration은 추가하지 않는다.
- BFF route나 trusted header 계약은 변경하지 않는다.

## 11. 프런트엔드 경계와 데이터 흐름

### 11.1 route

`front/features/archive/route/my-page-data.ts`는 다음을 병렬로 시작한다.

1. profile summary
2. journey 첫 page
3. notification preferences

profile과 journey는 페이지의 필수 데이터다. 둘 중 하나를 불러오지 못하면 현재 route error boundary를 사용한다.

notification preferences는 보조 데이터다. 실패해도 나의 서재를 막지 않고 설정 disclosure 안에 `알림 설정을 불러오지 못했습니다.`와 재시도 상태를 제공한다.

추가 journey page는 route module이 cursor와 중복 요청 방지를 소유한다. 실패하면 기존 items를 보존한다.

### 11.2 model

순수 model은 다음만 담당한다.

- 최근 item 선택
- 연도별 item grouping
- 존재하는 결과 chip 계산
- summary label 계산
- membership과 데이터 상태에 맞는 empty-state view model

React, router, fetch 또는 API client를 import하지 않는다.

### 11.3 UI

UI component는 prop과 callback만 사용한다.

- page shell과 summary
- recent journey item
- year-grouped journey list
- journey row
- settings disclosure
- empty, loading-more, load-more-error 상태

API, query, route 또는 `shared/api`를 직접 import하지 않는다.

### 11.4 기존 surface 정리

my-page에서 다음 중복 section을 제거하거나 새 구조로 대체한다.

- `RhythmSection`
- `WritingSection`
- `ReadingJourneySection`
- desktop `FeedbackReports`
- `MobileFeedbackReports`

다른 consumer가 없는 component와 helper는 테스트와 함께 삭제한다. 아카이브 route가 사용하는 API와 UI는 유지한다.

## 12. 상태와 오류

### 12.1 기본 상태

- summary는 정확한 server aggregate를 표시한다.
- 최신 item은 journey 첫 item을 사용한다.
- 동일한 회차는 목록과 별도 피드백 목록에서 중복되지 않는다.
- 추가 page가 있으면 목록 아래에 `기록 더 보기`를 제공한다.

### 12.2 기록 없음

큰 `0` metric을 반복하지 않는다.

- 제목: `아직 쌓인 개인 기록이 없습니다`
- 정식 멤버 또는 호스트: 현재 세션이 있으면 `이번 세션 보기`, 없으면 `아카이브 보기`
- 둘러보기 멤버: 멤버십 상태를 짧게 설명하고 `아카이브 둘러보기`

사용할 수 없는 쓰기 행동을 viewer에게 노출하지 않는다.

### 12.3 일부 정보 없음

- book image 없음: title 기반 typographic cover
- reading progress 없음: 완독 상태를 추측하지 않음
- 질문 또는 서평 없음: 해당 chip 생략
- feedback 없음: 행동 생략
- feedback 잠김: 사용자가 이유를 해결하거나 이해할 수 있을 때만 잠김 상태와 안전한 설명 표시

### 12.4 추가 page 실패

- 이미 렌더링한 행을 보존한다.
- 목록 하단에서 `기록을 더 불러오지 못했습니다.`와 `다시 시도`를 제공한다.
- 같은 cursor에 대한 중복 요청을 차단한다.

### 12.5 설정 실패

- notification load failure는 기록 지면을 차단하지 않는다.
- notification save failure는 현재 draft와 서버 확정값을 혼동하지 않게 기존 inline error를 유지한다.
- profile save validation은 현재 stable error mapping을 유지한다.
- 탈퇴와 로그아웃 실패는 현재 안전 경계를 약화하지 않는다.

## 13. 시각 디자인

### 13.1 표면

- page background와 raised surface는 현재 warm paper token을 사용한다.
- 큰 외곽 card 수를 현재 화면의 절반 이하로 줄인다.
- 책별 목록은 얇은 divider로 연결한다.
- 최근 기록과 열린 설정처럼 실제 경계가 필요한 영역만 surface를 사용한다.
- decorative gradient, glow, glassmorphism은 사용하지 않는다.

### 13.2 타이포그래피

- `나의 서재`, 최근 책 제목, 연도 heading은 editorial hierarchy를 사용한다.
- metadata와 회차 번호는 작은 mono 또는 현재 secondary text style을 사용한다.
- eyebrow는 새로운 시적 문구를 반복하지 않고 필요한 맥락에만 제한한다.

### 13.3 색상

- ink: 제목과 핵심 기록
- book blue: focus, 선택, 핵심 행동
- archive green: 열람 가능한 피드백 상태
- neutral line: 목록 구분

가용성과 잠김은 문구, icon 또는 shape를 함께 사용하고 색만으로 표현하지 않는다.

## 14. 접근성

- heading level은 page `h1`, section `h2`, 책 제목 `h3` 순서를 유지한다.
- journey list는 semantic list 또는 article collection을 사용한다.
- primary 회차 link와 feedback link를 중첩하지 않는다.
- keyboard focus는 DOM 순서와 시각 순서가 일치한다.
- `:focus-visible` outline과 WCAG AA 대비를 유지한다.
- 설정 disclosure는 `aria-expanded`와 controlled region을 연결한다.
- 로딩과 오류는 `aria-busy`, `role="status"`, `role="alert"`를 상태 성격에 맞게 사용한다.
- 긴 한국어·영어 제목, 200% text zoom, reduced motion에서 내용과 행동이 겹치지 않는다.
- 모바일 interactive target은 최소 44px을 확보한다.

## 15. 예상 변경 표면

### 서버

- archive journey web DTO와 mapper
- archive journey use case와 read model
- archive query service와 load port
- JDBC journey page·summary query
- API contract, authorization, cursor, query-budget test

### 프런트엔드

- `front/features/archive/api/archive-contracts.ts`
- `front/features/archive/api/archive-api.ts`
- `front/features/archive/route/my-page-data.ts`
- `front/features/archive/route/my-page-route.tsx`
- `front/features/archive/model/`의 my-page journey view model
- `front/features/archive/ui/my-page.tsx`
- `front/features/archive/ui/my-page/`의 desktop·mobile·journey·settings component
- 관련 co-located unit/component test와 E2E fixture
- 필요한 범위의 my-page 전용 style

구현 계획에서 정확한 파일 소유권과 삭제 대상은 import graph를 다시 확인해 확정한다.

## 16. 검증

### 16.1 acceptance matrix 선택

| row | 선택 이유 | 증거 |
| --- | --- | --- |
| Actor or authorization | viewer, active member, host와 접근 불가 membership의 개인 projection 경계가 다름 | focused authorization test와 denied-path evidence |
| Club context | journey와 summary가 현재 club membership에만 묶여야 함 | 다른 club fixture를 포함한 API integration test |
| Publication visibility | `HOST_ONLY`를 제외하고 member-visible `CLOSED`·`PUBLISHED`만 다룸 | visibility별 server query/API test |
| Cursor collection | 책별 기록을 page로 누적함 | empty, first, continuation, last, duplicate accumulation test |
| Persistence or migration | migration은 없지만 새 JDBC aggregate·page query와 query budget이 생김 | focused integration test와 full `integrationTest` |
| UI or runtime state | empty, partial, denied, load-more error, wrapping, desktop, mobile이 모두 영향받음 | model/component/E2E와 responsive browser evidence |

인접한 high-risk row 중 session lifecycle은 상태 전환을 만들지 않는 read-only projection이므로 제외한다. BFF/OAuth는 기존 `/api/archive/**` proxy와 trusted club context를 그대로 사용하므로 새 BFF 동작 증거가 필요하지 않다. Async, cache, provider도 이번 범위에 side effect나 새 dependency가 없어 제외한다.

### 16.2 서버 집중 검증

- 같은 club과 visibility 경계만 반환한다.
- 다른 club, `HOST_ONLY`, 접근 불가 membership을 반환하지 않는다.
- 참석만 한 회차, 질문만 남긴 회차, 서평만 남긴 회차, 피드백만 열람 가능한 회차를 각각 포함한다.
- feedback body와 다른 멤버 정보가 projection에 포함되지 않는다.
- summary가 page limit과 무관하게 정확하다.
- cursor 다음 page에 중복·누락이 없다.
- query 수가 item 수에 따라 증가하지 않는다.
- viewer, active member, host, suspended 또는 inactive 경계를 현재 authorization 정책과 일치시킨다.

### 16.3 프런트엔드 집중 검증

- 최근 item과 연도 grouping이 안정적으로 계산된다.
- 존재하지 않는 `질문 0`, `서평 0` chip이 렌더링되지 않는다.
- feedback 가용성과 열람 상태에 맞는 행동만 보인다.
- 30개를 넘는 기록에서도 정확한 server summary와 cursor를 사용한다.
- 추가 page 실패 시 기존 items와 retry가 유지된다.
- notification preference load 실패가 기록 화면을 막지 않는다.
- viewer와 empty state가 사용할 수 없는 행동을 보여주지 않는다.
- profile revalidation 후 열린 설정 disclosure가 불필요하게 닫히지 않는다.
- 긴 제목, 표지 없음, 좁은 모바일 폭에서 wrapping이 안전하다.
- primary link와 feedback link가 중첩되지 않는다.

### 16.4 canonical gate

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

API contract와 JDBC projection이 바뀌므로 server integration lane이 필요하다. 멤버 route의 주요 탐색과 responsive UI가 바뀌므로 E2E도 필요하다.

### 16.5 수동 시각 검증

- desktop에서 단일 열의 최대 너비, 빈 오른쪽 공간 제거, 기록 밀도를 확인한다.
- mobile에서 최근 기록, 긴 제목, chip wrapping, 하단 tab bar와 설정 disclosure가 겹치지 않는지 확인한다.
- normal, viewer, empty, missing cover, locked feedback, load-more failure, notification load failure 상태를 확인한다.
- keyboard만으로 회차 기록, 피드백, 더 보기, 설정 disclosure, profile·notification·logout·membership 행동에 접근한다.

## 17. 수용 기준

- `/app/me`의 주제는 계정 관리가 아니라 개인 독서 기록으로 읽힌다.
- 같은 책과 회차가 독서 여정과 피드백 문서 목록에서 중복되지 않는다.
- 데스크톱의 영구 2열과 설정 열 아래의 큰 빈 공간이 사라진다.
- 모바일에서 전체 피드백 문서 목록이 책별 기록과 별도로 반복되지 않는다.
- 모든 count는 server aggregate이며 page limit으로 축소되지 않는다.
- 사용 가능한 피드백은 해당 책 행에서 바로 열 수 있다.
- 이메일은 기본 기록 지면에 노출되지 않는다.
- 설정, 프로필 수정, 알림 저장, 로그아웃, 탈퇴 기능은 계속 찾을 수 있고 기존 안전 동작을 유지한다.
- viewer, empty, partial, loading-more failure 상태가 거짓 숫자나 사용할 수 없는 행동을 보여주지 않는다.
- 데스크톱과 모바일이 같은 정보 순서, 권한 의미, 접근 가능한 행동을 제공한다.
