# ReadMates Real Data Wiring Design

작성일: 2026-04-19
상태: APPROVED FOR PLAN

## 1. 목적

이번 작업은 ReadMates 로컬 데모에서 남아 있는 디자인 샘플 데이터를 실제 1~6회차 모임 데이터와 DB-backed API로 교체한다.

기존 `2026-04-19-readmates-seed-and-dev-login-design.md`는 dev login, 기본 seed, 핵심 앱 흐름을 만든 1차 작업이다. 이 문서는 그 후속 작업으로, `recode/` 하위 텍스트 녹취록을 다시 분석해 1~6회차 실제 데이터 품질을 높이고, 프론트에 남은 샘플 배열과 스텁 API를 실제 데이터 흐름으로 연결한다.

## 2. 목표

- `recode/*.txt` 1~6회차를 기준으로 세션, 참석, 질문, 한줄평, 하이라이트, 체크인 seed를 보강한다.
- 제공된 6명 멤버를 모두 dev seed 계정으로 유지하고, 회차별 참석 여부를 녹취록 메타데이터 기준으로 반영한다.
- 녹취록에 없는 멤버는 해당 회차 불참으로 처리한다.
- 프론트에서 사용자가 볼 수 있는 샘플 이름, 샘플 책, `session-13`, `session-14`, 가짜 리포트 링크를 실제 ReadMates 데이터 또는 빈 상태로 교체한다.
- 현재 세션 공동 보드, 아카이브 보조 탭, 마이페이지, 공개 페이지, 호스트 운영 화면을 API 응답 기반으로 연결한다.
- 리포트는 HTML 본문 자동 생성까지 확장하지 않고, 업로드 메타데이터 저장과 권한 있는 목록/본문 조회까지만 실제화한다.

## 3. 제외 범위

- 녹취록 원문 전체 저장
- AI 자동 요약, 자동 하이라이트 추출, 자동 리포트 생성
- 피드백 HTML 본문 생성기
- 이메일 발송
- 운영 환경에서 dev login 활성화
- 다중 클럽 기능
- 초대 수락 전체 플로우 완성

초대 preview 고정 샘플은 이번 핵심 데모 흐름과 직접 연결되지 않으므로 별도 작업으로 남긴다. 다만 공개 페이지와 앱 내부 화면에 보이는 샘플 데이터는 이번 범위에서 제거한다.

## 4. 데이터 소스

기준 녹취록:

- `recode/251126 1차.txt`
- `recode/251227 2차.txt`
- `recode/260121 3차.txt`
- `recode/260225 4차.txt`
- `recode/260318 5차.txt`
- `recode/260415 6차.txt`

각 파일 상단 메타데이터의 참석자 줄을 회차별 실제 참석 기준으로 사용한다.

멤버:

| 역할 | 이름 | 이메일 |
|---|---|---|
| HOST | 김호스트 | host@example.com |
| MEMBER | 안멤버1 | member1@example.com |
| MEMBER | 최멤버2 | member2@example.com |
| MEMBER | 김멤버3 | member3@example.com |
| MEMBER | 송멤버4 | member4@example.com |
| MEMBER | 이멤버5 | member5@example.com |

녹취록에 `멤버4`, `송멤버4`처럼 표기가 흔들리는 경우는 문맥상 `송멤버4`으로 정규화한다. `호스트`, `멤버2`, `멤버1`, `멤버5`, `멤버3` 같은 짧은 발화자명은 각각 김호스트, 최멤버2, 안멤버1, 이멤버5, 김멤버3로 정규화한다.

## 5. 회차와 참석 정책

모든 회차에 전체 6명 멤버의 `session_participants`를 만든다.

- 녹취록 참석자: `rsvp_status = GOING`, `attendance_status = ATTENDED`
- 녹취록에 없는 멤버: `rsvp_status = DECLINED`, `attendance_status = ABSENT`
- 호스트 김호스트도 참석자 데이터에 포함한다.

회차별 참석 기준:

| 회차 | 날짜 | 책 | 참석자 |
|---:|---|---|---|
| 1 | 2025-11-26 | 팩트풀니스 | 김호스트, 안멤버1, 이멤버5 |
| 2 | 2025-12-17 | 냉정한 이타주의자 | 김호스트, 최멤버2, 이멤버5 |
| 3 | 2026-01-21 | 우리가 겨울을 지나온 방식 | 김호스트, 최멤버2, 이멤버5, 김멤버3, 안멤버1, 송멤버4 |
| 4 | 2026-02-25 | 내 안에서 나를 만드는 것들 | 김호스트, 최멤버2, 김멤버3, 송멤버4 |
| 5 | 2026-03-18 | 지대넓얕 무한 | 김호스트, 송멤버4, 최멤버2, 안멤버1 |
| 6 | 2026-04-15 | 가난한 찰리의 연감 | 김호스트, 이멤버5, 최멤버2 |

## 6. Seed 데이터 정책

`server/src/main/resources/db/dev/R__readmates_dev_seed.sql`은 계속 idempotent repeatable migration으로 유지한다.

질문:

- 기존 `docs/superpowers/specs/2026-04-19-readmates-seeded-questions.md`의 질문을 기본 원천으로 유지한다.
- 녹취록에서 실제 대화가 시작된 질문과 기존 질문 문서가 충돌하면 녹취록 맥락을 우선한다.
- `questions.priority`는 현행 1~5 정책을 유지한다.
- 한 멤버가 한 회차에 5개를 초과하는 질문은 `long_reviews`에 `질문 메모:`로 보존한다.

한줄평:

- 회차별 참석자 중심으로 1~3개 이상을 넣는다.
- 대화의 책 총평, 별점 발언, 강하게 남은 감상을 제품용 한 문장으로 정리한다.
- 발화자의 사적인 구체 사례는 그대로 옮기지 않고 독서 감상으로 추상화한다.

하이라이트:

- 회차별 2~4개를 넣는다.
- 책의 핵심 주제, 모임에서 반복된 논점, 서로 의견이 갈린 지점을 짧게 기록한다.
- 공개 화면에 노출 가능하도록 민감한 개인 발언은 제외한다.

체크인:

- 참석자 중심으로 실제 질문/발언 주제와 맞는 읽기 메모를 넣는다.
- 결석자는 과거 회차 체크인을 seed하지 않는다.

공개 요약:

- 모든 1~6회차 published session에 공개 요약을 넣는다.
- 요약은 녹취록의 실제 대화 주제를 반영하되 원문을 길게 복사하지 않는다.

## 7. Backend API 설계

### 7.1 Current Session

`GET /api/sessions/current` 응답을 확장한다.

기존 필드:

- 세션 기본 정보
- 내 RSVP
- 참석자 목록

추가 필드:

- `myCheckin`
- `myQuestions`
- `board.questions`
- `board.checkins`
- `board.highlights`
- 현재 세션의 내 한줄평과 장문 서평 저장 상태

현재 열린 세션이 없으면 계속 `currentSession: null`을 반환한다. 1~6회차 published seed는 현재 세션으로 노출하지 않는다.

현재 세션의 멤버 기록 저장도 실제 DB에 연결한다.

- `POST /api/sessions/current/one-line-reviews`: 로그인 멤버의 한줄평 upsert
- `POST /api/sessions/current/reviews`: 로그인 멤버의 장문 서평 upsert

기존 echo 응답은 제거한다.

### 7.2 Archive

기존 `GET /api/archive/sessions`는 유지한다.

추가 또는 확장 API:

- `GET /api/archive/me/questions`: 로그인 멤버의 과거 질문
- `GET /api/archive/me/reviews`: 로그인 멤버의 한줄평과 장문 서평
- `GET /api/reports/me`: 로그인 멤버가 열람 가능한 리포트 메타데이터

프론트 아카이브 탭은 이 API들을 사용한다. 데이터가 없으면 샘플 대신 빈 상태를 보여준다.

### 7.3 Notes Feed

`GET /api/notes/feed`는 seed된 질문, 한줄평, 하이라이트, 체크인을 계속 통합 반환한다.

응답에 세션 책 제목과 날짜를 추가해 프론트가 `No.02 기록` 같은 대체 텍스트 대신 실제 책 제목을 표시하게 한다.

### 7.4 Public Pages

공개 페이지용 API를 추가한다.

- `GET /api/public/club`: 클럽 소개, 누적 통계, 최근 공개 세션
- `GET /api/public/sessions/{sessionId}`: 공개 세션 상세

`sessionId`는 기존 `sessions.id` UUID 문자열을 사용한다. 기존 `session-13` 고정 경로는 최신 공개 세션으로 redirect한다.

공개 API는 인증 없이 접근 가능하지만 `public_session_publications.is_public = true`인 데이터만 반환한다.

### 7.5 Host Dashboard

`GET /api/host/dashboard`는 고정 숫자를 제거하고 DB에서 계산한다.

- `rsvpPending`: 현재 OPEN 세션의 `NO_RESPONSE` 수
- `checkinMissing`: 현재 OPEN 세션 참석 예정자 중 체크인 없는 수
- `publishPending`: `CLOSED` 또는 공개 요약 미발행 세션 수
- `feedbackPending`: published/closed 세션 참석자 중 최신 리포트 없는 수

OPEN 세션이 없으면 현재 세션 관련 지표는 0으로 반환한다.

### 7.6 Host Session Detail/Edit

호스트 세션 편집 화면에 필요한 detail API를 추가한다.

- `GET /api/host/sessions/{sessionId}`
- `PATCH /api/host/sessions/{sessionId}`
- `POST /api/host/sessions/{sessionId}/attendance`
- `PUT /api/host/sessions/{sessionId}/publication`

참석자 행과 리포트 행은 실제 멤버십, RSVP, 출석, 리포트 메타데이터에서 가져온다. 아직 동작하지 않는 버튼은 샘플처럼 보이게 두지 않고 비활성 상태나 명확한 빈 상태로 둔다.

### 7.7 Reports

리포트 API는 실제 메타데이터를 저장하고 권한을 확인한다.

- `POST /api/host/reports`: HTML 파일 저장 후 `feedback_reports`에 row 생성
- `GET /api/reports/me`: 로그인 멤버의 리포트 목록
- `GET /api/reports/{reportId}/content`: 본인 리포트 또는 호스트만 HTML 반환

본문 반환 시 기존 CSP 헤더를 유지한다. 없는 리포트는 404, 권한 없는 리포트는 403을 반환한다.

## 8. Frontend 설계

샘플 배열 제거 대상:

- `front/features/current-session/components/current-session.tsx`
- `front/features/archive/components/archive-page.tsx`
- `front/features/archive/components/my-page.tsx`
- `front/features/public/components/public-home.tsx`
- `front/features/public/components/public-club.tsx`
- `front/features/public/components/public-session.tsx`
- `front/features/host/components/host-dashboard.tsx`
- `front/features/host/components/host-session-editor.tsx`
- `front/shared/ui/top-nav.tsx`

원칙:

- API 데이터가 있으면 실제 데이터를 렌더링한다.
- API 데이터가 비어 있으면 샘플을 fallback하지 않는다.
- 공개 세션 링크는 실제 published session id로 만든다.
- 현재 세션 공동 보드는 `board` API 응답을 렌더링한다.
- 마이페이지 리듬, 최근 참석 막대, 리포트 목록은 실제 내 데이터로 계산된 응답을 사용한다.
- 호스트 화면은 실제 current session과 dashboard 지표를 사용한다.

UI 톤과 레이아웃은 유지한다. 이번 작업은 새 디자인이 아니라 데이터 신뢰성 작업이다.

## 9. 보안과 권한

- 앱 내부 API는 인증된 active membership만 접근 가능하다.
- 호스트 API는 `role = HOST`만 접근 가능하다.
- 공개 API는 `is_public = true`인 세션만 반환한다.
- 리포트 본문은 해당 리포트의 멤버 또는 호스트만 열람할 수 있다.
- 클라이언트가 보낸 email, role, membershipId를 권한 판단에 사용하지 않는다.

## 10. 테스트 전략

Backend:

- dev seed가 6개 세션과 6명 멤버를 idempotent하게 생성하는지 검증
- 회차별 참석/불참이 녹취록 메타데이터와 일치하는지 검증
- notes feed에 질문, 한줄평, 하이라이트, 체크인이 모두 포함되는지 검증
- current session hydrate가 내 체크인, 내 질문, board 데이터를 반환하는지 검증
- public API가 공개 세션만 반환하는지 검증
- host dashboard가 DB 지표를 계산하는지 검증
- report upload/list/content 권한을 검증

Frontend:

- archive, notes, my page가 API 데이터만 렌더링하고 샘플 fallback을 렌더링하지 않는지 검증
- public home/session이 `session-13` 샘플 없이 실제 공개 세션을 연결하는지 검증
- current session board가 API board 데이터를 렌더링하는지 검증
- host dashboard/editor가 실제 참석자와 지표를 렌더링하는지 검증

Manual:

- dev profile backend 실행
- dev login으로 김호스트 로그인
- 1~6회차 아카이브와 공개 페이지 확인
- 새 7회차 생성
- 멤버 계정으로 RSVP, 체크인, 질문 저장
- 호스트 대시보드 지표 변화 확인
- 리포트 HTML 업로드 후 해당 멤버로 열람 확인

## 11. 성공 기준

- `recode` 기준 1~6회차 데이터가 seed에 반영되어 있다.
- 제공된 6명 계정이 모두 dev login과 membership에 존재한다.
- 회차별 결석자는 participant row에서 `ABSENT`로 보인다.
- 앱 내부 주요 화면에서 디자인용 인물명, 책 제목, `session-13`, `session-14`, fake report id가 보이지 않는다.
- API 데이터가 없는 영역은 실제 빈 상태를 보여준다.
- backend/frontend 테스트가 샘플 fallback 제거를 검증한다.
- README의 “남아 있는 샘플 상태” 목록이 최신 상태로 줄어든다.

## 12. 구현 순서

1. 녹취록 분석 산출물을 만들고 seed 데이터 보강 범위를 확정한다.
2. backend seed와 read model 테스트를 먼저 추가한다.
3. seed SQL과 repository/API를 구현한다.
4. frontend 타입과 BFF 호출을 확장한다.
5. 각 화면의 샘플 배열을 API 데이터 또는 빈 상태로 교체한다.
6. 리포트 메타데이터 저장/조회/권한을 연결한다.
7. README와 기존 상태 문서를 업데이트한다.
8. 전체 테스트와 수동 데모 플로우를 검증한다.
