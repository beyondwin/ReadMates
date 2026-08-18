# ReadMates Host Session Lifecycle Revert Design

작성일: 2026-08-18
상태: APPROVED DESIGN SPEC
대상 표면: server `session` lifecycle, host session editor UI, architecture docs

## 1. 배경

호스트 세션 상태 기계는 한 방향이다.

```text
DRAFT → OPEN → CLOSED → PUBLISHED
```

- `POST /api/host/sessions/{sessionId}/open`은 `DRAFT`만 `OPEN`으로 바꾼다. 이미 열린 세션에 대한 재요청은 그대로 두고, `CLOSED`나 `PUBLISHED`를 현재 세션으로 되돌리지 않는다.
- `POST /api/host/sessions/{sessionId}/close`는 `OPEN`만 `CLOSED`로 바꾼다.
- `POST /api/host/sessions/{sessionId}/publish`는 `CLOSED`만 `PUBLISHED`로 바꾼다.
- 클럽당 `OPEN`은 하나다.
- `PUBLISHED` 되돌림 API는 없다.

호스트 에디터 개요는 `OPEN`에서 확인 없이 「세션 마감」을 보낸다. `CLOSED`에는 「기록 작업대」와 「세션 공개」만 있고, 마감 취소 버튼은 없다. `POST /open`을 마감된 세션에 다시 보내면 거절된다. 테스트 `host cannot open closed session`이 이 계약을 고정한다.

실수로 마감한 뒤 멤버 RSVP·질문·서평 쓰기는 현재 세션이 사라져 멈춘다. 멤버 홈은 「아직 열린 세션이 없습니다」만 보여 준다.

## 2. 목표

- 호스트가 한 단계씩 세션 상태를 되돌릴 수 있다.
- 실수 마감 취소(`CLOSED → OPEN`)와 공개 취소·열기 취소(`PUBLISHED → CLOSED`, `OPEN → DRAFT`)를 같은 규칙으로 다룬다.
- 확인 없이는 앞으로 가기(`close`/`publish`)와 되돌리기가 실행되지 않는다.
- 이미 만든 기록·참석·질문·알림 row는 지우지 않는다.
- 화면이 거절 이유를 구분해서 말할 수 있다.
- `architecture.md`의 한 방향 전이를 현재 계약과 맞게 고친다.

성공 기준:

- 호스트가 `CLOSED` 세션을 다시 `OPEN`으로 만들면 그 세션이 현재 세션이 되고 멤버 쓰기가 살아난다.
- 다른 `OPEN`이 있으면 `reopen`은 거절되고, 호스트는 그 세션을 먼저 정리하라는 안내를 본다.
- 호스트가 `PUBLISHED`를 `CLOSED`로 되돌리면 공개 사이트 목록에서 내려가고, publication row와 이미 보낸 알림은 남는다.
- 호스트가 `OPEN`을 `DRAFT`로 되돌리면 현재 세션이 아니고, 참석자 row는 남는다.
- 브라우저 `confirm()`을 쓰지 않는다.

## 3. Non-goals

- `PUBLISHED → OPEN` 같은 두 단계 점프.
- 알림 회수, inbox 삭제, 이메일 unsend.
- 기록 패키지·하이라이트·한줄평·질문·RSVP·출석 row 삭제.
- 새 Flyway migration, 새 영속 상태, `REOPENED` 같은 추가 session state.
- 클로징 보드에서 lifecycle mutation.
- `DRAFT` 세션 삭제, 현재 세션 한 번에 교체, lifecycle 감사 원장.
- 멤버 빈 화면 개선, 클로징 보드 영어 라벨, `마감됨`/`닫힘` 문구 통일.
- BFF 계약 변경. 브라우저는 기존처럼 same-origin `/api/bff/**`로 Spring API를 호출한다.

## 4. 선택한 접근

명시적 역전이 API 세 개와, 에디터 개요의 상태별 버튼 하나를 쓴다.

검토한 대안:

1. **명시적 `/unpublish`, `/reopen`, `/return-to-draft` + 개요 버튼 하나**
   - 장점: 기존 `open`/`close`/`publish`와 대칭이고, 권한·에러·로그가 전이마다 분명하다.
   - 단점: path가 세 개 늘고 SecurityConfig allowlist를 같이 고쳐야 한다.

2. **단일 `/revert`**
   - 장점: API 표면이 작다.
   - 단점: 실패 코드와 감사가 한 경로에 섞인다.

3. **마감 취소만**
   - 장점: 범위가 작다.
   - 단점: 공개 취소·열기 취소를 같은 규칙으로 받기로 한 결정과 어긋난다.

1번을 선택한다.

안전 규칙:

- 확인만 있으면 한 단계 되돌린다.
- 다른 `OPEN`이 있으면 그 세션을 먼저 마감하거나 예정으로 되돌린다.
- 이미 보낸 알림과 공개 페이지 본문은 자동으로 지우지 않는다.

## 5. 상태 기계

허용된 한 단계 전이:

| 명령 | from | to | 이미 목표 상태일 때 |
| --- | --- | --- | --- |
| `POST .../open` | `DRAFT` | `OPEN` | 같은 세션이면 변경 없이 detail 반환. 다른 `OPEN`이 있으면 거절 |
| `POST .../close` | `OPEN` | `CLOSED` | 변경 없이 detail 반환 |
| `POST .../publish` | `CLOSED` | `PUBLISHED` | 변경 없이 detail 반환. 기존 publish 자격(요약, `GUEST_READABLE`)은 유지 |
| `POST .../unpublish` | `PUBLISHED` | `CLOSED` | 이미 `CLOSED`면 변경 없이 detail 반환 |
| `POST .../reopen` | `CLOSED` | `OPEN` | 이미 `OPEN`이고 그 세션이면 변경 없이 detail 반환. 다른 `OPEN`이 있으면 거절 |
| `POST .../return-to-draft` | `OPEN` | `DRAFT` | 이미 `DRAFT`면 변경 없이 detail 반환 |

잘못된 단계와 두 단계 점프는 모두 `409`다.

CAS 패턴은 기존 close/publish와 같다. `UPDATE ... WHERE state = <expected>`가 0행이면 현재 상태를 읽어 멱등 또는 거절을 결정한다. 다른 트랜잭션이 먼저 바꾼 상태를 덮어쓰지 않는다.

`return-to-draft`와 `reopen`은 `open`과 같이 클럽 lock으로 동시 `OPEN`을 막는다.

## 6. Server

기존 `session` write-side slice에 명령을 더한다. 새 feature 패키지를 만들지 않는다.

영향 지점:

- `HostSessionController` — 세 path
- `HostSessionLifecycleUseCase` / `HostSessionLifecycleService`
- `HostSessionLifecyclePort` / `HostSessionLifecycleWriteOperations`
- `HostSessionWritePolicy` — reopen / unpublish / return-to-draft 결정
- `SessionApplicationErrorHandler` — 구분된 conflict code
- `SecurityConfig` host allowlist
- `architecture.md` lifecycle 절

컨트롤러는 path와 `CurrentMember`만 넘긴다. 인가와 전이 규칙은 application service / write policy가 소유한다.

### 6.1 Endpoints

세 경로 모두 호스트 전용이다. 성공 응답은 기존 `open`/`close`/`publish`와 같은 session detail이다.

```http
POST /api/host/sessions/{sessionId}/unpublish
POST /api/host/sessions/{sessionId}/reopen
POST /api/host/sessions/{sessionId}/return-to-draft
```

요청 body는 없다. 확인은 브라우저 모달이 담당한다. 서버 preview endpoint는 두지 않는다.

### 6.2 부작용

공통: 상태가 바뀌면 기존과 같이 클럽 콘텐츠 캐시를 커밋 후 무효화하고, club/session/oldState/newState를 로그한다.

`reopen` (`CLOSED → OPEN`):

- 같은 클럽에 다른 `OPEN`이 있으면 거절한다. 응답에 그 세션 id를 넣는다.
- `site_visibility = PUBLIC_RECORD`이면 같은 트랜잭션에서 `HIDDEN`으로 내리고 compatibility `is_public = false`를 dual-write한다. 요약·하이라이트·한줄평·publication row는 남긴다.
- 참석자·RSVP·질문·서평 row는 다시 만들지 않고 그대로 둔다. `/open`의 `createActiveParticipants`는 호출하지 않는다. 그 insert는 기존 참석자의 RSVP를 초기화하므로 `reopen`에 재사용하지 않는다. 마감 이후 새로 활성화된 멤버는 자동으로 넣지 않고, 호스트가 기존 참석자 추가 흐름으로 넣는다.
- 이 세션이 현재 세션이 된다. 멤버 RSVP/질문/서평 쓰기가 다시 열린다.
- 아카이브/게스트 archive의 `CLOSED|PUBLISHED` 목록에서 빠진다.
- 공개 사이트는 원래 `PUBLISHED + PUBLIC_RECORD`만 보여 주므로 `reopen`만으로도 사이트에 나오지 않는다. `HIDDEN` 전환은 `OPEN + PUBLIC_RECORD` invariant를 지키기 위한 것이다.

`unpublish` (`PUBLISHED → CLOSED`):

- 상태만 `CLOSED`로 바꾼다.
- publication row, `site_visibility`, `public_summary`는 유지한다.
- 공개 사이트 쿼리는 `PUBLISHED + PUBLIC_RECORD`만 반환하므로 목록에서 내려간다.
- 게스트·멤버 archive는 `CLOSED + GUEST_READABLE`이면 계속 읽을 수 있다. notes는 `PUBLISHED`가 아니므로 닫힌다.
- 이미 만든 알림 event/delivery/inbox는 회수하지 않는다.

`return-to-draft` (`OPEN → DRAFT`):

- 상태만 `DRAFT`로 바꾼다.
- `/open`이 만든 참석자 row와 RSVP·질문·체크인·서평은 남긴다.
- 이후 같은 세션을 다시 `/open`하면 기존 `ON DUPLICATE KEY UPDATE` 참석자 insert가 기존 참여를 유지한다.
- 현재 세션이 없어진다. 다른 draft를 `/open`할 수 있다.

### 6.3 에러

기존 `OpenSessionAlreadyExistsException`과 새 역전이 거절은 더 이상 공통 `CONFLICT` 메시지에 묶지 않는다.

| 상황 | HTTP | code | 메시지 |
| --- | --- | --- | --- |
| 다른 `OPEN`이 있어 `/open` 또는 `/reopen` 불가 | 409 | `SESSION_OPEN_ALREADY_EXISTS` | 이미 진행 중인 세션이 있습니다. 그 세션을 마감하거나 예정으로 되돌린 뒤 다시 시도하세요. |
| `/reopen` 단계 불일치 | 409 | `SESSION_REOPEN_NOT_ALLOWED` | 마감된 세션만 다시 열 수 있습니다. |
| `/unpublish` 단계 불일치 | 409 | `SESSION_UNPUBLISH_NOT_ALLOWED` | 공개된 세션만 공개를 취소할 수 있습니다. |
| `/return-to-draft` 단계 불일치 | 409 | `SESSION_RETURN_TO_DRAFT_NOT_ALLOWED` | 진행 중인 세션만 예정으로 되돌릴 수 있습니다. |
| 세션 없음 / 다른 클럽 | 404 | `SESSION_NOT_FOUND` | 기존과 동일 |
| 호스트 아님 | 403 | 기존 host denial | 기존과 동일 |
| 잘못된 UUID | 400 | 기존 invalid session id | 기존과 동일 |

`SESSION_OPEN_ALREADY_EXISTS` 응답 body는 가능하면 `openSessionId`를 포함한다. 프론트는 이 id로 그 세션 에디터로 보낸다. id를 안전하게 읽지 못하면 문구만 보여 준다.

`DRAFT`나 `PUBLISHED`에 `/close`를 보내는 기존 거절은 이번 범위에서 메시지 리팩터를 강제하지 않는다. `/open`의 이미-열림 충돌만 새 코드를 쓴다.

멤버·게스트·VIEWER는 세 path를 호출할 수 없다.

## 7. Host UI

되돌리기와 앞으로 가기 확인은 세션 에디터 개요의 「다음 할 일」만 담당한다. 클로징 보드는 읽기·링크로 남긴다. 삭제는 기본 정보의 위험 작업에 그대로 둔다.

### 7.1 버튼

| 지금 상태 | 앞으로 | 되돌리기 |
| --- | --- | --- |
| `DRAFT` | 열기는 기존 대시보드 흐름. 이 화면에서 새 열기 버튼을 추가하지 않는다 | 없음 |
| `OPEN` | 「세션 마감」 (`btn-quiet`) | 「예정으로 되돌리기」 (`btn-ghost`) |
| `CLOSED` | 「기록 작업대」 + 「세션 공개」 (`btn-primary`) | 「마감 취소」 (`btn-ghost`) |
| `PUBLISHED` | 없음. 기록 수정은 기존과 같다 | 「공개 취소」 (`btn-ghost`) |

공통 「되돌리기」 라벨은 쓰지 않는다. 다음 상태를 버튼 이름에 넣는다.

모바일에서는 앞으로 버튼을 위에, 되돌리기를 아래에 둔다. 같은 시각 무게로 나란히 두지 않는다. `lifecyclePending`이면 둘 다 비활성이다. 최소 터치 영역은 기존 host `btn` 높이를 유지한다.

### 7.2 확인 모달

마감, 공개, 마감 취소, 공개 취소, 예정으로 되돌리기는 모두 확인 모달을 거친다. 브라우저 `confirm()`은 쓰지 않는다.

패턴은 `HostSessionDeletionPreviewDialog`를 따른다.

- `role="dialog"`, `aria-modal="true"`, 제목 id
- 포커스 트랩, 열릴 때 취소 버튼 포커스, 닫힌 뒤 트리거 복귀
- Escape와 취소는 mutation을 만들지 않는다
- 전송 중에는 확인·취소·Escape를 잠근다
- 확인 버튼은 삭제의 빨강을 쓰지 않는다. 데이터를 지우는 작업이 아니다

제목과 본문:

- **세션 마감** — 멤버 RSVP·질문·서평이 멈추고 현재 세션에서 내려갑니다. 기록은 남습니다.
- **세션 공개** — 멤버 노트·아카이브에 나갑니다. 공개 배치가 켜져 있으면 사이트에도 나갑니다.
- **마감 취소** — 다시 진행 중이 됩니다. 공개 사이트 배치는 숨깁니다. 기록은 남습니다.
- **공개 취소** — 공개 사이트에서 내려갑니다. 기록과 이미 보낸 알림은 남습니다.
- **예정으로 되돌리기** — 현재 세션이 아닙니다. 참석·질문은 남습니다.

`SESSION_OPEN_ALREADY_EXISTS`는 flash만 쓰지 않는다. 모달이 열린 채로 위 안내를 보여 주고, `openSessionId`가 있으면 그 세션 에디터 링크로 보낸다.

성공 후 개요 배지·설명이 즉시 바뀌고 짧은 flash만 쓴다.

- 마감 취소: 마감을 취소했습니다. 세션이 다시 진행 중입니다.
- 공개 취소: 공개를 취소했습니다.
- 예정 환원: 진행을 취소했습니다. 세션이 예정 상태로 돌아갔습니다.

`/open` 확인 모달은 이번 범위에 넣지 않는다. 열기는 기존 대시보드 흐름을 유지한다.

## 8. 데이터 흐름

```text
Host overview button
  -> confirm dialog (no network)
  -> POST /api/bff/api/host/sessions/{id}/{reopen|unpublish|return-to-draft}
  -> HostSessionController
  -> HostSessionLifecycleService
  -> HostSessionLifecycleWriteOperations (CAS + club lock)
  -> cache invalidation after commit
  -> session detail
  -> editor SESSION_LIFECYCLE_UPDATED
```

프론트 경계:

- `features/host/api` — BFF path와 응답 contract
- `features/host/queries` — mutation과 세션/대시보드/클로징 상태 invalidation
- `features/host/model` — 상태별 버튼·모달 문구. React/query/api import 금지
- `features/host/route` — action wiring
- `features/host/ui` — 개요 버튼과 확인 모달

BFF는 새 정책을 갖지 않는다. host session POST allowlist가 path 패턴으로 이미 열려 있는지 구현 시 확인하고, 막혀 있으면 세 path만 추가한다.

## 9. 테스트와 검증

Acceptance matrix:

- 선택: Session lifecycle, Guest/public exposure, Actor/authorization, UI/runtime state
- 제외: BFF/OAuth(신규 인증 흐름 없음), Persistence/migration(스키마 변경 없음), Cursor collection

서버:

- `CLOSED → OPEN`, `PUBLISHED → CLOSED`, `OPEN → DRAFT` 성공
- 잘못된 단계와 점프 거절
- 다른 `OPEN`이 있을 때 `reopen`/`open`이 `SESSION_OPEN_ALREADY_EXISTS`와 `openSessionId`를 반환
- `reopen`이 `PUBLIC_RECORD`를 `HIDDEN`으로 내리고 기록 row는 유지
- `unpublish` 후 공개 사이트 쿼리에서 제외, publication row 유지
- `return-to-draft` 후 참석자 유지, 같은 세션 재open 시 참여 유지
- 비호스트·다른 클럽 거절
- 상태가 바뀐 경우에만 캐시 무효화
- 기존 close CAS(다른 트랜잭션이 `PUBLISHED`로 바꾼 상태를 덮어쓰지 않음)와 같은 패턴을 reopen/unpublish/return-to-draft에 적용

프론트:

- 상태별 버튼 라벨과 노출
- 확인 전에는 close/publish/revert가 나가지 않음
- Escape/취소 무mutation, 전송 중 잠금
- `SESSION_OPEN_ALREADY_EXISTS`를 모달에 표시
- 성공 후 개요 배지 갱신
- 모바일에서 앞으로/되돌리기 세로 배치

문서:

- `docs/development/architecture.md` lifecycle 절에 역전이, `PUBLIC_RECORD` 숨김, 데이터 보존을 반영
- CHANGELOG Unreleased에 호스트 세션 되돌리기 한 줄

검증 명령:

- 서버 포커스: `HostSessionControllerDbTest`, `HostSessionServicesTest`, 관련 write-policy test
- PR-level: `./scripts/server-ci-check.sh`
- 프론트: `pnpm --dir front` lint/test 중 에디터·overview·host api/query 포커스 후 `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`
- auth/host mutation 경로가 늘면 `pnpm --dir front test:e2e`의 기존 host session 수명 시나리오를 확장할지 구현 계획에서 고른다. 새 Playwright 스펙은 기존 수명 테스트가 세 전이를 커버하지 못할 때만 추가한다.

## 10. 범위 밖 사각지대

이번 구현에 넣지 않는다. 후속 후보 우선순위:

1. `DRAFT` 삭제. 지금 삭제는 `OPEN`만 가능하다.
2. 현재 세션 한 번에 교체. 지금은 기존 `OPEN`을 내린 뒤에야 다른 회차를 열 수 있다.
3. 멤버 빈 화면. 마감 직후 「아직 열린 세션이 없습니다」만 보인다.
4. 출석 쓰기가 세션 상태와 무관하다. 마감·공개 후에도 호스트가 출석을 바꿀 수 있다.
5. 클로징 보드 서버 `overall.label`이 영어다.
6. 개요는 `마감됨`, 기본 정보 모델은 `닫힘`이다.
7. lifecycle 감사가 로그뿐이다.
8. `/publish` 자격과 클로징 체크리스트 기준이 다르다.

1번이 되돌리기 다음으로 호스트 체감이 크다. 3번은 실수 마감의 멤버 쪽 여파다.

## 11. 구현 시 주의

- `OPEN + PUBLIC_RECORD`는 기존 invariant를 깨므로 `reopen`의 `HIDDEN` 전환을 빠뜨리지 않는다.
- `closeDecision`은 이미 `CLOSED`일 때만 멱등이고, 실제 `OPEN → CLOSED`는 SQL CAS가 담당한다. 역전이도 같은 구조를 따른다. policy만으로 `OPEN`을 되돌리려 하지 않는다.
- 공개 사이트 숨김은 row 삭제가 아니라 `PUBLISHED` 조건이 빠지는 것이다. 테스트는 쿼리 제외와 row 보존을 둘 다 본다.
- 관리자 closing-risk ledger는 이번 API의 직접 대상이 아니다. `reopen` 후 기존 sync가 `OPEN`을 열린 세션으로 다시 잡을 수 있는지만 구현 중 확인한다. 새 ledger write는 넣지 않는다.
- 예시에 실제 멤버 데이터, 비밀, 사설 도메인, 로컬 절대 경로를 넣지 않는다.
