# ReadMates Upcoming Session Management Design

상태: APPROVED DESIGN SPEC

## 목표

ReadMates 호스트가 여러 미래 세션을 미리 만들고 관리할 수 있게 한다. 멤버는 공개된 예정 세션을 홈에서 읽기 전용으로 확인하되, RSVP, 읽기 진행률, 질문, 한줄평, 서평 작성은 지금처럼 현재 `OPEN` 세션 하나에서만 한다.

이번 설계는 새 진행 상태를 늘리지 않고 기존 `DRAFT`를 "예정 세션"으로 재정의한다.

## 비목표

- 여러 세션에 동시에 RSVP, 질문, 체크인을 작성하는 기능은 만들지 않는다.
- 별도 `/app/host/sessions` 목록 화면은 만들지 않는다.
- 예정 세션을 클럽노트나 아카이브 기록으로 보여주지 않는다.
- 회차 번호 재정렬, 세션 복제, 자동 시작 예약은 포함하지 않는다.
- 외부 공개 예정 세션 랜딩이나 공개 캘린더는 이번 범위에 포함하지 않는다.

## 상태와 노출 모델

`sessions.state`는 세션 진행 단계를 나타낸다.

| state | 의미 | 개수 |
| --- | --- | --- |
| `DRAFT` | 아직 현재 참여 세션이 아닌 예정 세션 | 여러 개 가능 |
| `OPEN` | 현재 RSVP, 체크인, 질문, 리뷰 작성이 가능한 이번 세션 | 클럽당 하나 |
| `CLOSED` | 모임 종료 후 내부 기록/정리 대상 | 여러 개 가능 |
| `PUBLISHED` | 공개 기록으로 발행된 세션 | 여러 개 가능 |

`visibility`는 세션 노출 대상을 나타낸다.

| visibility | 의미 |
| --- | --- |
| `HOST_ONLY` | 호스트 관리 화면에만 표시 |
| `MEMBER` | 클럽 멤버에게 표시 |
| `PUBLIC` | 외부 공개 surface에도 표시 가능 |

기존 `public_session_publications.visibility`는 세션 기록 공개 범위에 붙어 있다. 예정 스케줄 공개에는 요약 문서가 필요하지 않아야 하므로, `sessions.visibility`를 새 source of truth로 추가한다. 공개 기록 저장 시에는 기존 publication row의 visibility와 세션 visibility를 호환되게 동기화한다.

기본 생성값:

```text
state = DRAFT
visibility = HOST_ONLY
```

## 화면별 조회 규칙

호스트 관리는 모든 세션을 본다.

```text
DRAFT, OPEN, CLOSED, PUBLISHED
HOST_ONLY, MEMBER, PUBLIC
```

멤버 홈의 "다음 달 선정"과 모바일 "오늘 할 일" 아래 예정 영역은 멤버에게 공개된 예정 세션만 본다.

```text
state = DRAFT
visibility in (MEMBER, PUBLIC)
```

현재 세션 화면과 참여 API는 지금처럼 `OPEN` 하나만 사용한다.

```text
state = OPEN
limit 1
```

클럽노트와 아카이브는 기록 화면이다. 예정 세션과 호스트 전용 기록은 숨긴다.

```text
state in (CLOSED, PUBLISHED)
visibility in (MEMBER, PUBLIC)
```

공개 사이트는 외부 공개 가능한 기록만 반환한다.

```text
visibility = PUBLIC
public surface에 필요한 요약/기록 데이터가 있는 세션
```

## 호스트 UX

호스트 데스크탑 대시보드의 기존 "세션 준비 문서" 영역을 확장한다.

- 현재 `OPEN` 세션이 있으면 상단에 현재 세션 카드를 보여준다.
- 예정 `DRAFT` 세션 목록을 가까운 회차/날짜 순으로 보여준다.
- 각 예정 세션 row에는 노출 상태, 책/날짜, 편집, 멤버 공개/비공개, 현재 세션으로 시작 액션을 둔다.
- 새 세션 만들기 CTA는 "예정 세션 만들기" 의미로 동작한다.

호스트 모바일 대시보드는 기존 "오늘 할 일" 아래에 예정 세션 레일을 추가한다.

- 현재 운영 할 일을 먼저 보여준다.
- 그 아래에 예정 세션 카드들을 가로 또는 compact list로 보여준다.
- 카드에는 편집, 멤버 공개, 현재로 시작 같은 핵심 액션만 둔다.
- 예정 세션이 없으면 짧은 empty state와 생성 CTA를 보여준다.

새 세션 저장 후에는 `/app/host/sessions/{sessionId}/edit` 또는 호스트 대시보드로 이동한다. `/app/session/current`로 보내지 않는다. 새 세션은 더 이상 즉시 현재 세션이 아니기 때문이다.

## 멤버 UX

멤버 데스크탑 홈의 기존 "다음 달 선정" 영역에 예정 세션을 표시한다.

- `DRAFT + MEMBER/PUBLIC` 세션을 가까운 순서로 보여준다.
- 각 항목에는 회차, 책 제목, 저자, 날짜, 장소를 표시한다.
- 참석/질문/체크인 CTA는 제공하지 않는다.
- 예정 세션이 없으면 기존 "아직 등록된 다음 달 후보가 없습니다" empty state를 유지한다.

멤버 모바일 홈은 "오늘 할 일" 영역 아래에 예정 세션 목록을 둔다.

- 현재 세션 할 일과 예정 스케줄을 시각적으로 분리한다.
- 예정 세션은 읽기 전용이다.
- 호스트 전용 예정 세션은 절대 노출하지 않는다.

## API 설계

호스트 세션 목록:

```http
GET /api/host/sessions
```

같은 클럽의 모든 세션을 반환한다. 호스트만 접근 가능하다. 응답에는 `sessionId`, `sessionNumber`, `state`, `visibility`, 책/일정 필드, publication/feedback 요약 상태를 포함한다.

새 예정 세션 생성:

```http
POST /api/host/sessions
```

기본값은 `DRAFT + HOST_ONLY`다. 기존 생성 API의 validation은 유지한다. 즉 이번 범위에서 새 세션 생성은 책 제목, 저자, 날짜까지 갖춘 예정 세션 생성이다. 타이틀만 저장하는 진짜 초안은 이번 범위에 포함하지 않는다.

세션 기본 정보 수정:

```http
PATCH /api/host/sessions/{sessionId}
```

`DRAFT`와 `OPEN` 세션 수정에 사용한다. `CLOSED/PUBLISHED` 수정 범위는 기존 정책을 유지한다.

세션 노출 범위 변경:

```http
PATCH /api/host/sessions/{sessionId}/visibility
```

요청:

```json
{
  "visibility": "MEMBER"
}
```

`HOST_ONLY`, `MEMBER`, `PUBLIC` 중 하나만 허용한다.

현재 세션으로 시작:

```http
POST /api/host/sessions/{sessionId}/open
```

`DRAFT -> OPEN` 전환을 수행한다. 같은 클럽에 기존 `OPEN` 세션이 있으면 `409 Conflict`를 반환한다. 성공하면 active membership을 기준으로 `session_participants`를 생성한다.

멤버 예정 세션:

```http
GET /api/sessions/upcoming
```

로그인한 멤버/호스트가 볼 수 있는 예정 세션만 반환한다.

```text
state = DRAFT
visibility in (MEMBER, PUBLIC)
```

## 서버 동작

생성:

1. 호스트 권한을 확인한다.
2. 클럽 row를 잠근다.
3. `max(number) + 1`로 회차 번호를 부여한다.
4. `state = DRAFT`, `visibility = HOST_ONLY`로 저장한다.
5. `session_participants`는 생성하지 않는다. 참여자는 `OPEN` 전환 시 만든다.

현재 세션으로 시작:

1. 호스트 권한과 세션 소속 club을 확인한다.
2. 대상 세션이 `DRAFT`인지 확인한다.
3. 같은 club에 `OPEN` 세션이 없는지 확인한다.
4. 대상 세션을 `OPEN`으로 변경한다.
5. active membership을 `session_participants`에 upsert한다.
6. `/api/sessions/current`가 새 `OPEN` 세션을 반환한다.

노출 범위 변경:

1. 호스트 권한과 세션 소속 club을 확인한다.
2. `sessions.visibility`를 갱신한다.
3. publication row가 있으면 호환을 위해 `public_session_publications.visibility`도 갱신한다.

아카이브와 노트 조회:

- `DRAFT`를 제외한다.
- `HOST_ONLY`를 제외한다.
- `CLOSED/PUBLISHED` 기록만 반환한다.

## 데이터 변경

MySQL과 기본 migration tree에 `sessions.visibility` 컬럼을 추가한다.

```sql
alter table sessions
  add column visibility varchar(20) not null default 'HOST_ONLY';

alter table sessions
  add constraint sessions_visibility_check
  check (visibility in ('HOST_ONLY', 'MEMBER', 'PUBLIC'));
```

기존 데이터 backfill:

- 기존 `PUBLISHED` 세션 중 publication visibility가 `PUBLIC`이면 `sessions.visibility = 'PUBLIC'`.
- 기존 `CLOSED` 또는 `PUBLISHED` 세션은 명시적 `PUBLIC`이 아닌 한 `sessions.visibility = 'MEMBER'`로 둔다. 기존 내부 아카이브가 migration 이후 갑자기 사라지지 않게 하기 위함이다.
- 기존 `DRAFT` 또는 `OPEN` 세션은 `sessions.visibility = 'HOST_ONLY'`로 둔다.
- 운영 데이터에서 기존 공개 기록이 숨겨지지 않도록 public release 검증에서 공개 목록을 확인한다.

## 오류 처리

`POST /api/host/sessions/{sessionId}/open`:

- 기존 `OPEN` 세션이 있으면 `409 Conflict`.
- 대상 세션이 없거나 다른 club이면 `404 Not Found`.
- 대상 세션이 `CLOSED` 또는 `PUBLISHED`이면 `409 Conflict`.
- 대상 세션이 이미 `OPEN`이면 idempotent 성공으로 처리한다.

`PATCH /api/host/sessions/{sessionId}/visibility`:

- 허용되지 않는 visibility는 `400 Bad Request`.
- 권한이 없으면 기존 host guard와 동일하게 차단한다.

멤버 예정 목록:

- 예정 세션이 없으면 빈 배열을 반환한다.
- `HOST_ONLY`는 서버 응답에서 제외한다.

## 테스트 기준

서버 테스트:

- 여러 `DRAFT` 세션을 생성할 수 있다.
- 새 세션 기본값은 `DRAFT + HOST_ONLY`다.
- 새 세션 생성은 `session_participants`를 만들지 않는다.
- `DRAFT + MEMBER`는 `/api/sessions/upcoming`에 반환된다.
- `DRAFT + HOST_ONLY`는 `/api/sessions/upcoming`에 반환되지 않는다.
- `DRAFT`는 archive/notes API에 반환되지 않는다.
- `HOST_ONLY`는 archive/notes API에 반환되지 않는다.
- `DRAFT -> OPEN` 전환은 active member participants를 생성한다.
- 같은 club에 `OPEN`이 있으면 추가 `OPEN` 전환은 `409`다.
- `GET /api/sessions/current`는 `OPEN` 하나만 반환한다.

프론트 테스트:

- 호스트 대시보드는 현재 세션과 예정 세션 목록을 함께 표시한다.
- 예정 세션이 없으면 호스트 empty state와 생성 CTA를 표시한다.
- 예정 세션의 visibility 변경 액션이 API를 호출하고 row 상태를 갱신한다.
- 현재로 시작 액션 성공 후 현재 세션 카드가 갱신된다.
- 멤버 홈 데스크탑 "다음 달 선정"에 예정 세션이 표시된다.
- 멤버 홈 모바일 "오늘 할 일" 아래에 예정 세션이 표시된다.
- 예정 세션이 없으면 기존 empty copy를 유지한다.

E2E smoke:

- 호스트가 예정 세션을 만든다.
- 멤버에게 공개한다.
- 멤버 홈에서 예정 세션을 본다.
- 호스트가 현재 세션으로 시작한다.
- 멤버 `/app/session/current`에서 해당 세션을 본다.

## 구현 순서 제안

1. `sessions.visibility` migration과 타입 확장.
2. 서버 생성 흐름을 `DRAFT + HOST_ONLY`로 변경.
3. `GET /api/host/sessions`, `PATCH visibility`, `POST open`, `GET /api/sessions/upcoming` 추가.
4. archive/notes query에 `sessions.visibility != HOST_ONLY`와 `state in (CLOSED, PUBLISHED)` 조건 확인.
5. 호스트 대시보드에 예정 세션 관리 UI 추가.
6. 멤버 홈 데스크탑/모바일 예정 세션 UI 추가.
7. 단위/서버/E2E 검증.

## 결정 사항

타이틀만 저장하는 진짜 초안은 이번 설계에서 기본 요구로 넣지 않는다. 기존 validation을 유지해 책 제목, 저자, 날짜가 있는 예정 세션을 만든다. 운영자가 "제목만 임시 저장"을 실제로 원하면 `DRAFT` validation 완화와 UI 분기를 별도 작업으로 설계한다.
