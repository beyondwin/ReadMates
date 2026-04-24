# ReadMates Session Record Visibility Design

작성일: 2026-04-25
상태: DRAFT DESIGN SPEC
문서 목적: 호스트가 세션 기록 요약을 저장하고, 그 기록을 호스트 전용, 멤버 공개, 외부 공개 중 하나로 언제든 변경할 수 있게 하는 제품/UX/API/DB 설계를 정의한다.

## 1. 배경

ReadMates의 호스트 세션 편집 화면에는 현재 `공개 기록 발행` 영역이 있다. 이 영역은 공개 요약 textarea, `요약 초안 저장` 버튼, `공개 기록 발행` 버튼, 그리고 `내부 공개`, `요약 초안 저장`, `공개 기록 발행` 상태 표시를 함께 보여준다.

현재 구현은 서버에 `public_session_publications.public_summary`와 `is_public`을 저장한다. `is_public = true`이면 공개 발행처럼 보이지만, 공개 목록 `/records`는 추가로 `sessions.state = 'PUBLISHED'` 조건을 요구한다. 따라서 열린 세션에서 `공개 기록 발행`을 눌러도 `is_public = true`만 저장되고, 세션 상태가 `OPEN`이면 `/records`에는 나오지 않는다.

이 구조는 사용자에게 세 가지 혼란을 만든다.

- `요약 초안 저장`과 `공개 기록 발행`이 서로 다른 저장 경로처럼 보인다.
- `내부 공개`가 실제로 멤버에게 보이는 상태인지, 그냥 미발행 상태인지 불명확하다.
- 호스트는 지난 세션의 기록을 외부 공개에서 멤버 공개나 호스트 전용으로 되돌리고 싶지만, 현재 UI는 "발행" 중심이라 공개 범위 관리처럼 느껴지지 않는다.

이번 설계는 발행 액션 중심 모델을 버리고, 세션 기록의 "공개 범위"를 호스트가 저장/변경하는 모델로 바꾼다.

## 2. 목표

- 호스트가 세션 기록 요약을 저장할 수 있다.
- 호스트가 기록 공개 범위를 `호스트 전용`, `멤버 공개`, `외부 공개` 중 하나로 선택할 수 있다.
- 호스트는 열린 세션, 지난 세션, 이미 외부 공개된 세션 모두에서 공개 범위를 바꿀 수 있다.
- 외부 공개를 선택하면 `/records`와 공개 세션 상세에 노출된다.
- 멤버 공개를 선택하면 로그인한 멤버 앱 안에서 볼 수 있지만 공개 사이트에는 노출되지 않는다.
- 호스트 전용을 선택하면 호스트 편집 화면에서만 볼 수 있다.
- UI는 버튼 두 개 대신 공개 범위 선택과 저장 버튼 하나로 단순화한다.
- 기존 공개 발행 데이터는 새 공개 범위 모델로 안전하게 마이그레이션한다.
- public API는 외부 공개 기록만 반환한다.
- member/archive API는 멤버 공개와 외부 공개 기록을 반환할 수 있다.

## 3. 비목표

- 기록 요약 자동 생성
- 공개 범위 변경 이력 또는 audit log
- 예약 발행
- 승인 워크플로우
- 세션 상태 모델 전체 재설계
- 공개 기록별 댓글, 좋아요, 공유 통계
- 공개 사이트의 전체 정보 구조 개편
- 피드백 문서 권한 정책 변경
- 공개 기록 URL slug 도입
- 멀티클럽 공개 사이트 설계

## 4. 핵심 제품 결정

세션 기록에는 하나의 요약과 하나의 공개 범위가 있다.

| 공개 범위 | 의미 | 호스트 편집 | 멤버 앱 | 공개 사이트 |
| --- | --- | --- | --- | --- |
| `HOST_ONLY` | 호스트가 운영 기록으로 저장한 상태 | 보임 | 안 보임 | 안 보임 |
| `MEMBER` | 클럽 내부 멤버에게 공유하는 기록 | 보임 | 보임 | 안 보임 |
| `PUBLIC` | 외부 공개 기록 | 보임 | 보임 | 보임 |

호스트가 `PUBLIC`을 선택하면 세션 상태가 `OPEN`, `CLOSED`, `PUBLISHED` 중 무엇이든 공개 기록 목록에 노출한다. 사용자가 명시적으로 "외부 공개"를 선택했는데 세션 상태 때문에 목록에서 숨기면 다시 혼란이 생기기 때문이다.

`sessions.state = 'PUBLISHED'`는 더 이상 공개 목록 노출 여부의 source of truth가 아니다. 공개 목록 노출 여부는 세션 기록의 `visibility = 'PUBLIC'`이 결정한다.

## 5. 선택한 접근

기존 `public_session_publications` 테이블에 `visibility` 컬럼을 추가하고, 기존 `is_public`은 호환 기간을 거쳐 제거하거나 읽지 않게 한다.

선택 이유:

- 현재 요약, 공개 여부, 발행 시각이 이미 이 테이블에 모여 있다.
- table rename이나 큰 데이터 이동 없이 3상태 모델을 도입할 수 있다.
- 공개 API, 호스트 API, 테스트의 변경 범위가 작다.
- 나중에 이름을 `session_record_publications` 또는 `session_record_visibility`로 정리할 수 있지만, 지금은 기능 정합성이 우선이다.

버린 접근:

- `is_public` boolean을 계속 쓰고 별도 `is_member_visible` boolean을 추가하는 방식은 `true/false` 조합이 늘어나고 유효하지 않은 상태가 생긴다.
- 세션 상태 `PUBLISHED`를 공개 여부로 계속 쓰는 방식은 `OPEN` 세션 외부 공개, 외부 공개 취소, 멤버 공개 상태를 표현하지 못한다.
- `HOST_ONLY`, `MEMBER`, `PUBLIC`을 각각 별도 timestamp 컬럼으로 표현하는 방식은 UI와 API가 필요로 하는 "현재 공개 범위" 모델보다 복잡하다.

## 6. UX 설계

### 6.1 호스트 편집 화면

현재 `공개 · 발행 설정` 패널을 `기록 공개 범위` 패널로 바꾼다.

권장 구조:

```text
기록 공개 범위

기록 요약
[textarea]

공개 범위
( ) 호스트 전용
    호스트 편집 화면에서만 볼 수 있습니다.

( ) 멤버 공개
    멤버 앱 안에서 볼 수 있지만 공개 기록 목록에는 나오지 않습니다.

( ) 외부 공개
    멤버 앱과 공개 기록 목록에 표시됩니다.

[저장]
```

삭제할 요소:

- `내부 공개`, `요약 초안 저장`, `공개 기록 발행` 3단계 상태 카드
- `요약 초안 저장` 버튼
- `공개 기록 발행` 버튼
- "초안은 공개 페이지에 노출되지 않고..."처럼 저장 액션을 설명하는 도움말

새 상태 배지:

- 기록이 없으면 `기록 없음`
- 저장 후 `호스트 전용`
- 저장 후 `멤버 공개`
- 저장 후 `외부 공개`

저장 성공 메시지:

- `기록 공개 범위를 저장했습니다.`

저장 실패 메시지:

- 요약이 비어 있음: `기록 요약을 입력한 뒤 저장해주세요.`
- 권한 또는 서버 오류: `기록 공개 범위 저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.`
- 네트워크 오류: `기록 공개 범위 저장에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.`

### 6.2 공개 범위 선택 UI

공개 범위는 라디오 그룹 또는 segmented control로 구현한다. 세 값이 상호 배타적이므로 토글 여러 개보다 단일 선택 UI가 맞다.

라벨은 다음을 사용한다.

- `호스트 전용`
- `멤버 공개`
- `외부 공개`

설명 문구는 짧게 둔다. 호스트 화면은 운영 도구이므로 긴 설명보다 결과가 명확해야 한다.

### 6.3 열린 세션 UX

열린 세션에서도 공개 범위를 저장할 수 있다. `외부 공개`를 선택하면 공개 기록 목록에 바로 노출된다.

이 결정은 다음 이유로 선택한다.

- 호스트가 고른 공개 범위와 실제 노출 결과가 일치한다.
- "모임 종료 후 표시" 같은 지연 조건을 UI가 계속 설명하지 않아도 된다.
- 지난 세션과 열린 세션의 공개 범위 관리 방식이 같다.

다만 열린 세션의 공개 기록에는 아직 하이라이트나 한줄평이 비어 있을 수 있다. 공개 UI는 count가 0인 상태를 자연스럽게 표시해야 한다.

### 6.4 지난 세션 UX

지난 세션도 동일하게 공개 범위를 변경할 수 있다.

- 외부 공개 -> 멤버 공개: `/records`와 공개 세션 상세에서 사라지고, 멤버 앱에서는 계속 보인다.
- 외부 공개 -> 호스트 전용: `/records`, 공개 세션 상세, 멤버 앱에서 사라지고, 호스트 편집 화면에서만 보인다.
- 멤버 공개 -> 외부 공개: `/records`와 공개 세션 상세에 나타난다.
- 호스트 전용 -> 멤버 공개: 멤버 앱에 나타난다.

## 7. 프런트엔드 설계

### 7.1 Contract 변경

기존 contract:

```ts
type HostSessionPublication = {
  publicSummary: string;
  isPublic: boolean;
};

type HostSessionPublicationRequest = {
  publicSummary: string;
  isPublic: boolean;
};
```

새 contract:

```ts
type SessionRecordVisibility = "HOST_ONLY" | "MEMBER" | "PUBLIC";

type HostSessionPublication = {
  publicSummary: string;
  visibility: SessionRecordVisibility;
};

type HostSessionPublicationRequest = {
  publicSummary: string;
  visibility: SessionRecordVisibility;
};
```

프런트 내부 display label은 API enum을 그대로 노출하지 않고 model helper에서 변환한다.

```text
HOST_ONLY -> 호스트 전용
MEMBER -> 멤버 공개
PUBLIC -> 외부 공개
```

### 7.2 HostSessionEditor 상태

기존 상태:

- `publicationMode: "internal" | "draft" | "public"`
- `publicationActionInFlight: "draft" | "public" | null`

새 상태:

- `recordVisibility: "HOST_ONLY" | "MEMBER" | "PUBLIC"`
- `recordSaveInFlight: boolean`
- `recordFeedback: success/error message`

초기값:

- 서버 `publication`이 없으면 `HOST_ONLY`, summary는 빈 문자열
- 서버 `publication.visibility`가 있으면 해당 visibility
- 마이그레이션 전 호환 응답을 일시적으로 지원해야 한다면 `isPublic === true`는 `PUBLIC`, 그 외는 `HOST_ONLY`로 해석한다.

### 7.3 Route-first 경계

수정 위치는 기존 feature 경계를 따른다.

- `front/features/host/api`: request/response contract와 API 호출 타입
- `front/features/host/model`: 초기 visibility, request builder, label helper
- `front/features/host/components` 또는 이후 `ui`: 호스트 편집 화면 렌더링
- `front/features/public/api/model/ui`: public response contract가 바뀌는 경우만 수정
- `front/features/archive` 또는 member session detail: 멤버 공개 기록 표시가 필요한 곳만 수정

새 import가 feature 간 직접 의존을 만들지 않게 한다.

## 8. 서버 API 설계

### 8.1 호스트 저장 API

기존 endpoint를 유지한다.

```text
PUT /api/host/sessions/{sessionId}/publication
```

요청:

```json
{
  "publicSummary": "이번 모임에서는 책의 핵심 질문과 각자의 읽기 경험을 함께 정리했습니다.",
  "visibility": "MEMBER"
}
```

응답:

```json
{
  "sessionId": "00000000-0000-0000-0000-000000000000",
  "publicSummary": "이번 모임에서는 책의 핵심 질문과 각자의 읽기 경험을 함께 정리했습니다.",
  "visibility": "MEMBER"
}
```

검증:

- 호출자는 같은 클럽의 활성 호스트여야 한다.
- `sessionId`는 같은 클럽 세션이어야 한다.
- `publicSummary`는 trim 후 비어 있으면 안 된다.
- `visibility`는 `HOST_ONLY`, `MEMBER`, `PUBLIC` 중 하나여야 한다.

호환성:

- 구현 직후 프런트와 서버를 동시에 배포한다면 `isPublic` 호환 request는 필요 없다.
- 무중단 호환이 필요하면 한 배포 동안 서버가 `isPublic` request도 받아 `PUBLIC` 또는 `HOST_ONLY`로 변환할 수 있다.

### 8.2 공개 API

`GET /api/public/club`과 `GET /api/public/sessions/{sessionId}`는 `visibility = 'PUBLIC'`인 기록만 반환한다.

기존 조건:

```sql
sessions.state = 'PUBLISHED'
and public_session_publications.is_public = true
```

새 조건:

```sql
public_session_publications.visibility = 'PUBLIC'
```

공개 API는 `HOST_ONLY`, `MEMBER` 기록을 절대 반환하지 않는다.

### 8.3 멤버 API

멤버 앱에서 세션 기록 요약을 보여주는 API는 `visibility in ('MEMBER', 'PUBLIC')`인 기록만 반환한다.

적용 대상:

- 멤버 세션 상세
- 아카이브 세션 상세
- 멤버 홈이나 아카이브 목록에서 기록 공개 상태를 표시하는 경우

멤버 API는 `HOST_ONLY` 기록을 반환하지 않는다. 호스트가 멤버 앱 화면을 보더라도 일반 멤버 API surface에서는 `HOST_ONLY`를 숨기는 편이 권한 모델이 단순하다. 호스트 전용 기록은 호스트 편집 화면에서만 다룬다.

### 8.4 호스트 API

호스트 상세 API는 세션 상태와 무관하게 publication row를 반환한다.

```json
{
  "publication": {
    "publicSummary": "요약",
    "visibility": "HOST_ONLY"
  }
}
```

publication row가 없으면 `publication: null`을 유지한다. 프런트는 null을 `HOST_ONLY + empty summary`로 해석한다.

## 9. 데이터 모델과 마이그레이션

### 9.1 컬럼

`public_session_publications`에 `visibility` 컬럼을 추가한다.

```sql
visibility varchar(20) not null default 'HOST_ONLY'
```

제약:

```sql
check (visibility in ('HOST_ONLY', 'MEMBER', 'PUBLIC'))
```

기존 `is_public`과 `published_at`은 첫 구현에서는 유지한다.

- `visibility = 'PUBLIC'`이면 `published_at`을 채운다.
- `visibility != 'PUBLIC'`이면 `published_at`은 null로 둘 수 있다.
- `is_public`은 호환을 위해 `visibility = 'PUBLIC'`과 같은 값으로 갱신한다.

나중에 cleanup migration에서 `is_public`을 제거할 수 있다. 그 전까지 application query는 `visibility`를 source of truth로 사용한다.

### 9.2 기존 데이터 변환

마이그레이션 기본값:

- `is_public = true` -> `visibility = 'PUBLIC'`
- `is_public = false` -> `visibility = 'HOST_ONLY'`

이유:

- 기존 `요약 초안 저장`은 공개 페이지에 노출되지 않는 초안이었다.
- 초안을 자동으로 멤버 공개로 바꾸면 기존보다 더 넓게 노출된다.
- 보수적인 공개 범위가 안전하다.

### 9.3 Upsert 정책

호스트 저장 API는 기존 upsert를 유지하되 `visibility`를 함께 저장한다.

저장 규칙:

- `public_summary = trimmed publicSummary`
- `visibility = request.visibility`
- `is_public = request.visibility == 'PUBLIC'`
- `published_at = utc_timestamp(6)` if `visibility = 'PUBLIC'`
- `published_at = null` if `visibility != 'PUBLIC'`

`updated_at`은 모든 저장에서 갱신한다.

세션 상태 변경:

- 공개 범위 저장 API는 더 이상 `sessions.state`를 바꾸지 않는다.
- 기존 `CLOSED -> PUBLISHED` 전환은 제거한다.
- `PUBLISHED` 상태가 이미 있는 기존 데이터는 유지하되, 공개 노출의 기준으로 쓰지 않는다.

## 10. 표시 정책

### 10.1 공개 기록 목록

`/records`는 `PUBLIC` 기록만 보여준다.

정렬은 기존처럼 세션 번호 역순을 유지한다. 열린 세션이 외부 공개되어 번호가 가장 크면 목록 상단에 나온다.

카운트:

- 공개 홈의 공개 세션 수는 `PUBLIC` 기록 수를 센다.
- 공개 책 수는 `PUBLIC` 기록의 책 title distinct count를 센다.

### 10.2 공개 세션 상세

`/sessions/{sessionId}`는 `PUBLIC` 기록만 접근 가능하다.

`HOST_ONLY` 또는 `MEMBER`이면 존재하지 않는 공개 세션처럼 404 또는 public missing state로 처리한다. 공개 API는 비공개 존재 여부를 드러내지 않는다.

### 10.3 멤버 세션 상세

멤버 세션 상세는 `MEMBER`와 `PUBLIC` 기록 요약을 보여준다.

표시 배지:

- `MEMBER`: `멤버 공개`
- `PUBLIC`: `외부 공개`

호스트 전용 기록은 멤버 세션 상세에 표시하지 않는다.

### 10.4 호스트 편집 상세

호스트 편집 화면은 모든 visibility를 보여주고 바꿀 수 있다.

표시 배지:

- `HOST_ONLY`: `호스트 전용`
- `MEMBER`: `멤버 공개`
- `PUBLIC`: `외부 공개`

## 11. 권한과 보안

- 외부 공개 여부는 오직 `visibility = 'PUBLIC'`으로 판단한다.
- public controller와 public query adapter는 authentication을 요구하지 않지만, `PUBLIC`이 아닌 row를 반환하면 안 된다.
- member/archive controller는 기존 membership guard를 유지하고, `MEMBER`와 `PUBLIC`만 반환한다.
- host controller는 active host guard를 유지하고, 같은 club의 세션만 저장/조회할 수 있다.
- 공개 범위를 넓히는 mutation이므로 request validation과 club scoping을 테스트로 고정한다.
- public-safe 문서와 seed에는 실제 멤버 데이터, private domain, secret, token-shaped 예시를 넣지 않는다.

## 12. 테스트 계획

### 12.1 서버 단위/DB 테스트

공개 API:

- `PUBLIC` 기록은 `/api/public/club` recent sessions에 나온다.
- `MEMBER` 기록은 `/api/public/club`에 나오지 않는다.
- `HOST_ONLY` 기록은 `/api/public/club`에 나오지 않는다.
- `PUBLIC` 기록은 세션 상태가 `OPEN`이어도 public list에 나온다.
- `MEMBER` 또는 `HOST_ONLY` 기록의 `/api/public/sessions/{sessionId}` 요청은 not found로 처리된다.

호스트 API:

- 호스트는 `HOST_ONLY`, `MEMBER`, `PUBLIC`으로 저장할 수 있다.
- 같은 club이 아닌 세션은 저장할 수 없다.
- 호스트가 아니면 저장할 수 없다.
- 빈 요약은 저장할 수 없다.
- `PUBLIC -> MEMBER -> HOST_ONLY -> PUBLIC` 변경이 모두 반영된다.
- `visibility = PUBLIC`일 때 `is_public` 호환 컬럼이 true로 갱신된다.
- `visibility != PUBLIC`일 때 `is_public` 호환 컬럼이 false로 갱신된다.

멤버 API:

- `MEMBER`와 `PUBLIC` 기록 요약은 멤버 세션 상세에서 보인다.
- `HOST_ONLY` 기록 요약은 멤버 세션 상세에서 보이지 않는다.

### 12.2 프런트 단위 테스트

호스트 편집:

- publication이 null이면 `호스트 전용`이 선택되고 textarea는 빈다.
- `HOST_ONLY`, `MEMBER`, `PUBLIC` 응답에 맞는 라디오가 선택된다.
- 저장 시 `publicSummary`와 `visibility`가 한 번만 전송된다.
- 빈 요약이면 API를 호출하지 않고 필드 오류를 보여준다.
- 저장 성공 후 상태 배지와 성공 메시지가 갱신된다.

공개 기록:

- public loader response에 포함된 세션만 렌더링한다.
- 공개 세션 detail missing state는 기존 UX를 유지한다.

### 12.3 E2E 후보

작은 구현이면 서버 DB 테스트와 프런트 unit 테스트를 우선한다. 다만 auth/BFF 경로를 건드리거나 공개 범위 저장 후 공개 목록 이동까지 검증해야 하면 `pnpm --dir front test:e2e`를 추가한다.

권장 E2E 흐름:

1. 호스트로 로그인한다.
2. 세션 편집에서 요약을 입력하고 `외부 공개`로 저장한다.
3. `/records`에서 해당 세션이 보이는지 확인한다.
4. 다시 `멤버 공개`로 저장한다.
5. `/records`에서 해당 세션이 사라지는지 확인한다.

## 13. 구현 순서 제안

1. 서버 enum과 migration을 추가한다.
2. host publication request/response를 `visibility` 기반으로 바꾼다.
3. host upsert query가 `visibility`, `is_public`, `published_at`을 함께 갱신하게 한다.
4. public query adapter 조건을 `visibility = 'PUBLIC'`으로 바꾼다.
5. member/archive query 중 기록 요약을 읽는 surface를 `visibility in ('MEMBER', 'PUBLIC')`로 맞춘다.
6. 프런트 host contract와 model helper를 바꾼다.
7. 호스트 편집 UI를 단일 저장 버튼과 공개 범위 선택으로 바꾼다.
8. 테스트를 추가하고, 가장 작은 관련 체크를 실행한다.

## 14. 위험과 대응

### 위험: 기존 `PUBLISHED` 상태 의미가 흐려진다.

대응: 이번 변경에서 `sessions.state`는 현재 세션 운영 상태로만 남기고, 기록 공개 여부는 `visibility`가 결정한다고 문서화한다. 추후 별도 cleanup에서 `PUBLISHED` 상태를 제거하거나 이름을 재검토할 수 있다.

### 위험: `public_session_publications` 이름이 새 의미와 맞지 않는다.

대응: 첫 구현에서는 기존 테이블명을 유지한다. table rename은 migration과 코드 churn이 크므로 후속 cleanup으로 분리한다.

### 위험: 기존 `is_public`과 새 `visibility`가 불일치한다.

대응: application write path에서 둘을 함께 갱신하고, read path는 `visibility`만 사용한다. cleanup 전까지 DB 테스트로 호환 컬럼 동기화를 확인한다.

### 위험: 호스트 전용 기록이 멤버 API로 새어 나간다.

대응: member/archive query에 `visibility in ('MEMBER', 'PUBLIC')` 조건을 명시하고, `HOST_ONLY` fixture 테스트를 추가한다.

### 위험: 외부 공개 취소 후 공개 URL이 남아 있다.

대응: public session detail query가 `visibility = 'PUBLIC'`만 허용하게 하고, 취소 후 404/missing state 테스트를 추가한다.

## 15. 성공 기준

- 호스트 편집 화면에서 기록 공개 범위가 세 가지 상태로 명확하게 보인다.
- 저장 버튼은 하나만 있다.
- 호스트는 지난 세션과 열린 세션 모두의 공개 범위를 변경할 수 있다.
- `외부 공개` 저장 후 `/records`에 나타난다.
- `멤버 공개` 또는 `호스트 전용` 저장 후 `/records`에서 사라진다.
- 멤버 앱은 `멤버 공개`와 `외부 공개` 기록만 볼 수 있다.
- 공개 API는 `외부 공개` 기록만 반환한다.
- 기존 외부 공개 데이터는 `PUBLIC`으로 유지된다.
- 기존 초안 데이터는 `HOST_ONLY`로 보수적으로 유지된다.

## 16. 남은 결정

현재 설계에서 구현 전 확정해야 할 결정은 없다. 다만 후속 cleanup으로 아래를 검토할 수 있다.

- `public_session_publications` 테이블명 변경 여부
- `sessions.state = PUBLISHED` 상태 제거 또는 의미 재정의
- 공개 범위 변경 이력 저장 필요 여부
- 호스트 전용 기록을 호스트용 아카이브 목록에 별도 노출할지 여부
