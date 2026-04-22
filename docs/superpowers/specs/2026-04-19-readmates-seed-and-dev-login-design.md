# ReadMates Seed And Dev Login Design

작성일: 2026-04-19
상태: IMPLEMENTATION SYNCED
문서 목적: 기존 1~6회차 독서모임 기록을 실제 DB seed로 넣고, 로컬에서 Gmail 기반 멤버/호스트 로그인을 빠르게 테스트할 수 있는 dev login과 핵심 DB 연동 범위를 정의한다.

## 0. 구현 동기화 메모: 2026-04-19

이 문서는 현재 코드 기준으로 다시 대조했다.

- seed/dev-login 작업은 현재 완료 상태다.
- 기존 문서 변경에서 반영한 `questions.priority` 1~5 정책은 최신이다. 레거시가 아니다.
- `V2__session_core.sql`의 1~3 제약은 초기 migration 기록이고, `V4__allow_five_questions.sql`이 최신 DB 제약을 1~5로 바꾼다.
- 로컬 데모의 최신 기준은 1~6회차 seed와 호스트가 직접 생성하는 7회차다.
- 현재 세션 저장 흐름은 RSVP, 체크인, 질문이 DB에 저장되며, 현재 세션 조회 응답은 저장된 체크인/질문과 공유 보드 데이터를 함께 반환한다.
- real-data wiring 이후 공개 API, 한줄평/장문 서평 저장, 호스트 집계/수정/출석/발행 DB 연동, 리포트 메타데이터/권한 조회, 아카이브/My page 리포트 목록은 현재 코드에 반영되어 있다.
- 현재 코드 기준으로 남은 것은 초대 수락 컨트롤러와 자동 피드백 HTML 생성기다. 초대 preview는 아직 고정 샘플 응답이며, 피드백 HTML은 수동 업로드만 지원한다.

## 1. 목표

이번 작업의 목표는 로컬 환경에서 ReadMates를 실제 독서모임처럼 테스트할 수 있게 만드는 것이다.

- 기존 1~6회차 모임 기록을 DB에 seed한다.
- 김호스트 호스트와 5명의 멤버 계정을 Gmail 기준으로 미리 등록한다.
- 로컬에서는 dev login으로 계정을 골라 바로 로그인할 수 있게 한다.
- Google OAuth 정책은 유지하되, seed된 Gmail과 일치하는 사용자만 멤버십을 가진다.
- 6회차는 이미 끝난 과거 모임으로 처리한다.
- 앱 초기 상태에서는 현재 열린 세션이 없고, 김호스트 호스트가 7회차를 새로 등록해야 한다.
- 7회차 등록 후 멤버들이 RSVP, 읽기 체크인, 질문을 실제로 저장하고 확인할 수 있게 한다.

## 2. 범위

포함한다.

- 단일 클럽 `읽는사이` seed
- 6명 사용자와 멤버십 seed
- 1~6회차 세션, 참석 기록, 공개 요약, 실제 준비 질문, 한줄평, 하이라이트 seed
- 로컬 전용 dev login
- 인증 상태 API의 사용자/역할 반환
- 현재 세션 조회, 7회차 생성, 아카이브, 노트 피드, RSVP, 체크인, 질문 저장 API의 DB 연동
- 테스트에 필요한 프론트 화면의 API 연결

포함하지 않는다.

- 녹취록 원문 전체 DB 저장
- 자동 요약, 자동 하이라이트 추출, AI 리포트 생성
- HTML 피드백 리포트 자동 생성
- 멀티클럽 운영 기능
- 이메일 발송
- 운영 환경에서 dev login 활성화

## 3. Seed 계정

단일 클럽의 멤버십은 아래처럼 고정한다.

| 역할 | 이름 | 짧은 표시명 | 이메일 |
|---|---|---|---|
| HOST | 김호스트 | 호스트 | host@example.com |
| MEMBER | 안멤버1 | 멤버1 | member1@example.com |
| MEMBER | 최멤버2 | 멤버2 | member2@example.com |
| MEMBER | 김멤버3 | 멤버3 | member3@example.com |
| MEMBER | 송멤버4 | 멤버4 | member4@example.com |
| MEMBER | 이멤버5 | 멤버5 | member5@example.com |

현재 `users` 테이블에는 짧은 표시명 컬럼이 없다. 이번 작업에서는 별도 사용자 프로필 컬럼을 추가하지 않는다. `users.name`에는 전체 이름을 저장하고, 화면용 짧은 이름은 read model의 고정 매핑으로 계산한다.

## 4. Seed 세션

기존 6회차는 모두 과거 모임이다. 회차 번호는 오래된 순서대로 1~6을 사용한다.

| 회차 | 날짜 | 책 | 참석자 |
|---:|---|---|---|
| 1 | 2025-11-26 | 팩트풀니스 | 호스트, 멤버5, 멤버1 |
| 2 | 2025-12-17 | 냉정한 이타주의자 | 호스트, 멤버5, 멤버2 |
| 3 | 2026-01-21 | 우리가 겨울을 지나온 방식 | 호스트, 멤버5, 멤버2, 멤버1, 멤버4, 멤버3 |
| 4 | 2026-02-25 | 내 안에서 나를 만드는 것들 | 호스트, 멤버2, 멤버4, 멤버3 |
| 5 | 2026-03-18 | 지대넓얕 무한 | 호스트, 멤버2, 멤버4, 멤버1 |
| 6 | 2026-04-15 | 가난한 찰리의 연감 | 호스트, 멤버5, 멤버2 |

세션 상태는 아래처럼 저장한다.

- 1~6회차: `PUBLISHED`
- 현재 열린 세션: 없음
- 호스트가 새로 만든 다음 세션: `OPEN`, 회차 번호 `7`

6회차도 이미 끝난 상황이므로 `/api/sessions/current`의 대상이 아니다. 현재 세션은 `state = OPEN`인 세션이 있을 때만 반환한다.

## 5. 참석 기록 정책

각 세션에는 전체 멤버의 `session_participants`를 만든다.

- 실제 참석자는 `rsvp_status = GOING`, `attendance_status = ATTENDED`
- 불참 또는 기록상 참석하지 않은 멤버는 `rsvp_status = DECLINED`, `attendance_status = ABSENT`
- 7회차가 생성되면 전체 멤버에 대해 `rsvp_status = NO_RESPONSE`, `attendance_status = UNKNOWN`으로 participant를 만든다.

이 방식은 호스트 화면에서 참석률, 미응답자, 체크인 미작성자 같은 운영 지표를 안정적으로 계산하기 위한 선택이다.

## 6. 녹취록 기반 제품 데이터

`recode/`의 녹취록은 seed 데이터의 출처로 사용한다. 다만 원문 전체는 DB에 넣지 않는다.

DB에 넣는 데이터는 제품 화면에 맞게 정제된 기록만 포함한다.

- 세션별 공개 요약 1개
- 세션별 하이라이트 2~4개
- 제공된 실제 준비 질문 전체
- 멤버별 한줄평 일부
- 멤버별 읽기 체크인 일부

요약과 하이라이트는 녹취록의 실제 대화 주제를 반영하되, 민감하거나 개인적인 발언을 장문으로 그대로 옮기지 않는다. 화면 테스트에 필요한 현실감은 유지하고, 개인정보성 원문 노출 위험은 줄인다.

질문 seed의 원천은 `docs/superpowers/specs/2026-04-19-readmates-seeded-questions.md`이다. 구현 시 DB 제약을 `priority between 1 and 5`로 변경하고, 이 문서의 질문은 세션 번호, 작성자 멤버십, 질문 순번을 보존해서 `questions` 테이블에 넣는다. 한 멤버가 한 세션에 5개를 초과해 질문한 경우에만 6번째 이후 질문을 `long_reviews`에 `질문 메모` 형식으로 넣어 원문 손실을 피한다.

## 7. Dev Login

로컬 테스트에서는 개발 전용 로그인 경로를 제공한다.

동작:

- `readmates.dev.login-enabled=true`일 때만 dev login API와 UI가 활성화된다.
- production profile에서는 dev login이 항상 비활성화된다.
- dev login은 seed된 이메일만 허용한다.
- 성공 시 일반 OAuth 로그인과 동일한 Spring Security 세션을 만든다.
- 로그인 후 `/app`으로 이동한다.

프론트 `/login` 화면은 개발 설정이 켜진 경우에만 6명 계정 선택 UI를 표시한다. 운영 환경에서는 Google 로그인 버튼만 보인다.

## 8. Google OAuth 정책

Google OAuth는 제품의 기본 인증 정책으로 유지한다.

- Google 계정 이메일은 verified 상태여야 한다.
- 로그인한 이메일이 `users.email`과 일치하면 해당 사용자의 멤버십을 불러온다.
- seed에 없는 이메일은 인증은 되었더라도 클럽 멤버 권한을 받지 못한다.
- 호스트 권한은 `memberships.role = HOST`인 김호스트 계정에만 부여한다.

초대 수락 흐름은 기존 제품 정책과 충돌하지 않아야 한다. 이번 작업은 seed된 계정으로 로컬 테스트를 빠르게 만드는 것이며, 초대 생성/수락 전체 구현을 대체하지 않는다.

## 9. 핵심 API

이번 작업에서 DB 기반으로 연결할 API는 아래로 제한한다.

### 9.1 Auth

`GET /api/auth/me`

반환:

- `authenticated`
- `userId`
- `membershipId`
- `email`
- `displayName`
- `shortName`
- `role`
- `clubId`

### 9.2 Current Session

`GET /api/sessions/current`

- `OPEN` 세션이 없으면 `currentSession: null` 형태의 빈 상태를 반환한다.
- `OPEN` 세션이 있으면 현재 구현은 세션 정보, 내 RSVP, 참가자 현황을 반환한다.
- 내 체크인과 내 질문은 저장 API로 DB에 기록되지만, 조회 응답에 다시 포함하는 hydrate 작업은 아직 남아 있다.

### 9.3 Host Session Creation

`POST /api/host/sessions`

- 호스트만 호출할 수 있다.
- 서버가 `max(number) + 1`로 새 회차 번호를 계산한다.
- 1~6회차 seed 이후 최초 생성은 7회차가 된다.
- 새 세션은 `OPEN`으로 생성한다.
- 전체 활성 멤버의 `session_participants`를 기본 생성한다.

### 9.4 Archive

`GET /api/archive/sessions`

- 1~6회차 과거 세션을 최신순으로 반환한다.
- 각 항목에는 회차, 날짜, 책 제목, 저자, 참석 수, 전체 멤버 수, 공개 여부를 포함한다.

### 9.5 Notes Feed

`GET /api/notes/feed`

- seed된 질문, 한줄평, 하이라이트, 체크인을 최신순으로 반환한다.
- 화면 필터링을 위해 `kind` 값을 포함한다.

### 9.6 Member Actions

- `PATCH /api/sessions/current/rsvp`
- `PUT /api/sessions/current/checkin`
- `POST /api/sessions/current/questions`

이 API들은 로그인한 멤버의 `membershipId`를 서버에서 결정한다. 클라이언트가 임의의 membership id를 보내지 않는다.

## 10. 프론트 변경 범위

전체 화면을 한 번에 전부 리팩터링하지 않는다. 실제 테스트 흐름에 필요한 화면만 우선 DB/API 기반으로 연결한다.

| 화면 | 변경 |
|---|---|
| `/login` | 로컬 dev login 계정 선택 표시 |
| `/app` | 현재 세션 없음 또는 7회차 상태 표시 |
| `/app/session/current` | 열린 세션 없음 빈 상태, 생성 후 RSVP/체크인/질문 입력 |
| `/app/archive` | 1~6회차 DB 목록 표시 |
| `/app/notes` | seed된 기록 피드 표시 |
| `/app/me` | 로그인한 멤버 정보와 참석 횟수 표시 |
| `/app/host` | 호스트만 접근, 7회차 등록 CTA 표시 |
| `/app/host/sessions/new` | 실제 7회차 생성 POST 연결 |

기존 디자인 톤과 레이아웃은 유지한다. 변경의 목적은 새 디자인을 만드는 것이 아니라 하드코딩 샘플을 실제 seed/API 데이터로 교체하는 것이다.

## 11. 보안과 환경 게이트

- dev login은 명시적 개발 설정이 켜진 경우에만 활성화한다.
- dev login API는 운영 환경에서 등록되지 않거나 항상 404/403을 반환해야 한다.
- 호스트 API는 `HOST` membership만 허용한다.
- 멤버 액션 API는 현재 로그인한 membership 기준으로만 저장한다.
- 클라이언트가 전달한 role, email, membershipId를 신뢰하지 않는다.
- `readmates.dev.permit-api-access`처럼 인증을 우회하는 기존 개발 설정이 있다면, dev login과 역할이 겹치지 않게 정리한다.

## 12. 테스트 기준

백엔드 테스트:

- seed가 중복 실행되어도 같은 데이터가 유지된다.
- `/api/auth/me`가 dev login 사용자 정보를 반환한다.
- dev login이 seed에 없는 이메일을 거부한다.
- 7회차 생성 시 number가 7로 계산된다.
- 7회차 생성 시 전체 멤버 participant가 `NO_RESPONSE`로 만들어진다.
- 현재 열린 세션이 없으면 `/api/sessions/current`가 빈 상태를 반환한다.
- 7회차 생성 후 `/api/sessions/current`가 해당 세션을 반환한다.
- 멤버가 RSVP, 체크인, 질문을 저장할 수 있다.
- 일반 멤버가 호스트 API를 호출하면 거부된다.

프론트 테스트:

- dev login UI가 로컬 설정에서만 보인다.
- 김호스트으로 로그인하면 호스트 CTA가 보인다.
- 멤버로 로그인하면 호스트 화면 접근이 차단되거나 멤버 화면으로 유도된다.
- 7회차 생성 전 현재 세션 화면은 빈 상태를 보여준다.
- 7회차 생성 후 멤버가 RSVP/체크인/질문을 입력할 수 있다.
- 아카이브에 1~6회차가 표시된다.

수동 확인:

1. 서버와 프론트를 로컬에서 실행한다.
2. 김호스트 계정으로 dev login한다.
3. `/app/host`에서 새 세션을 만든다.
4. 생성된 세션이 7회차인지 확인한다.
5. 멤버 계정으로 dev login한다.
6. `/app/session/current`에서 RSVP, 체크인, 질문을 저장한다.
7. `/app/archive`에서 기존 1~6회차를 확인한다.
8. `/app/notes`에서 과거 기록 seed를 확인한다.

## 13. 구현 원칙

- 기존 DB 스키마를 유지한다. 이번 작업에서 새 DB 컬럼을 추가하지 않는다.
- 제품 데이터 seed는 운영 migration과 분리하고, 개발/데모 설정에서만 실행한다.
- 컨트롤러에 SQL이나 하드코딩 데이터를 직접 두지 않는다.
- 현재 하드코딩된 샘플 배열은 API 응답으로 점진적으로 대체한다.
- 실패 상태는 조용히 숨기지 않고 빈 상태, 권한 없음, 저장 실패를 화면에 명확히 표현한다.
- 7회차 기본값은 seed하지 않는다. 호스트가 직접 등록하는 테스트 흐름을 보존한다.

## 14. 성공 기준

이번 작업이 끝나면 아래가 가능해야 한다.

- 로컬에서 6명 중 하나로 로그인할 수 있다.
- 김호스트은 호스트로 인식된다.
- 멤버 5명은 멤버로 인식된다.
- 기존 1~6회차가 아카이브와 노트 피드에 보인다.
- 6회차는 현재 세션으로 보이지 않는다.
- 김호스트이 7회차를 새로 만들 수 있다.
- 7회차 생성 후 멤버들이 각자 참여 준비 기록을 저장할 수 있다.
- 운영 환경에서는 dev login이 노출되지 않는다.
