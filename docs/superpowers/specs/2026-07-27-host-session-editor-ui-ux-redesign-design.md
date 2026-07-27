# 호스트 세션 편집 UI/UX 재편 설계

작성일: 2026-07-27
상태: 사용자 승인 완료

## 1. 목적

호스트 세션 편집 화면을 “여러 저장 양식이 한 페이지에 쌓인 화면”에서 “현재 상태와 다음 행동이 분명한 세션 운영 문서”로 재편한다.

특히 다음 표현과 영역이 서로 다른 결과물처럼 보이는 문제를 해결한다.

- 공개 기록
- 공개 기록 초안
- 세션 기록
- 세션 기록 완성
- 변경 이력
- revision과 작업 이력

재편 후 호스트는 기술 용어를 배우지 않고도 다음 관계를 이해할 수 있어야 한다.

1. 현재 적용된 기록
2. 작업 중인 공유 초안
3. 초안을 만드는 여러 방법
4. 검토 후 새 버전으로 반영하는 행동
5. 과거 버전과 일반 작업 기록

## 2. 현재 구조와 문제

현재 `/clubs/:clubSlug/app/host/sessions/:sessionId/edit` 화면은 기능적으로 다음 능력을 이미 제공한다.

- 책, 일정, 접속 정보 수정
- 출석 확정
- 서버 공유 초안 자동 저장
- 공개 범위, 요약, 하이라이트, 한줄평, 피드백 문서 편집
- AI 생성 또는 외부 JSON 가져오기를 통한 초안 저장
- apply preview 후 live 기록 반영
- 불변 revision 조회와 과거 revision의 새 초안 복원
- 콘텐츠 반영 후 선택적인 알림 작성기 진입

문제는 기능 부족이 아니라 정보 구조와 표현이다.

- 데스크톱은 기본 정보, 출석, 공개 기록 초안, 세션 기록 완성, 변경 이력을 한 문서에 연속으로 쌓는다.
- 모바일은 같은 패널을 section별로 숨길 뿐, 공개 기록 section 안에는 여전히 수동 편집과 AI/JSON 생성이 긴 세로 흐름으로 이어진다.
- `공개 기록 초안`과 `세션 기록 완성`이 같은 공유 초안을 다루지만 별도 결과물처럼 보인다.
- `공개 기록`, `세션 기록`, `피드백 문서`의 상하 관계가 화면에서 설명되지 않는다.
- `live revision`, `draft revision`, `revision 복원`은 서버 계약에는 정확하지만 일반 호스트에게는 작업 결과를 설명하지 못한다.
- 기본 정보의 명시적 저장, 기록 초안의 자동 저장, 기록 apply가 같은 화면에서 서로 다른 방식으로 동작한다.
- 오른쪽 상태 패널은 데스크톱에서는 보조 정보지만 모바일에서는 선택 section 아래에 길게 붙어 현재 작업과 무관한 정보까지 노출한다.
- 빈 history는 기술적인 section 제목과 빈 상자만 남겨 사용 가치가 약하다.

`front/features/host/ui/host-session-editor.tsx`는 route에서 전달된 여러 workflow를 한 컴포넌트에서 조립하며 UI 책임도 크다. 이번 작업은 관련 화면을 책임별 component로 나누되 API, query, route, model, UI의 기존 방향을 유지한다.

## 3. 승인된 제품 결정

1. 편집 화면의 기본 진입은 `개요`이며 현재 상태와 다음 행동을 먼저 보여준다.
2. 데스크톱과 모바일 모두 한 번에 하나의 section만 보여준다.
3. 상위 section은 `개요`, `기본 정보`, `출석`, `기록 작업대`, `변경 기록`이다.
4. AI 생성, 외부 JSON 가져오기, 직접 편집은 모두 같은 작업 중 초안을 만드는 방법이다.
5. 기록 작업대는 `현재 적용본`, `작업 중인 초안`, `다음 할 일`을 명확히 분리한다.
6. `revision`은 사용자 화면에서 `버전`으로 표현한다. 기술 식별자는 필요한 상세 정보에서만 보조적으로 사용한다.
7. 적용 여부와 공개 범위를 섞지 않는다. `현재 공개본` 대신 `현재 적용본`을 쓰고 `호스트 전용`, `멤버 공개`, `외부 공개`를 별도 상태로 표시한다.
8. 초안 저장만으로 현재 적용본이나 member/public surface를 바꾸지 않는다.
9. 과거 버전 복원은 현재 적용본을 즉시 덮어쓰지 않고 새 작업 초안을 만든다.
10. 콘텐츠 반영과 알림 발송은 계속 분리한다. 닫기, Escape, backdrop, route navigation은 알림이나 apply를 만들지 않는다.
11. 모바일은 desktop 축소판이 아니라 짧은 section label과 문맥별 sticky action을 가진 독립적인 작업 흐름으로 구성한다.
12. 현재 서버 API로 표현 가능한 범위는 frontend 재편으로 해결한다. 새 상태가 실제로 필요할 때만 additive API 변경을 검토한다.

## 4. 목표

- 화면 진입 직후 세션 상태, 현재 적용본, 작업 중인 초안, 다음 행동을 이해할 수 있다.
- `세션 기록 완성`이라는 별도 결과물 없이 직접 작성, AI, JSON이 하나의 초안으로 수렴한다.
- 기본 정보 저장, 초안 자동 저장, 기록 반영의 차이를 버튼 위치와 카피로 구분한다.
- 호스트 전용 기록을 `공개본`이라고 부르지 않는다.
- 과거 버전과 기본 정보·출석·알림 작업을 하나의 읽기 쉬운 변경 기록에서 구분한다.
- desktop과 320–390px mobile에서 모든 핵심 행동을 수행할 수 있다.
- 오류, 충돌, 긴 한국어·영문·Markdown, 빈 상태에서도 정보 계층과 복구 행동이 유지된다.
- route-first frontend 경계를 유지하고 관련 UI를 독립적으로 이해하고 테스트할 수 있게 한다.

## 5. 비목표

- session record server domain 또는 persistence 재설계
- 새 revision API family 도입
- 실시간 공동 편집 또는 자동 병합
- AI generation 내부 workflow, provider, evidence contract 재설계
- 알림 운영 페이지 또는 manual composer 재설계
- 본문 전체 line-by-line diff viewer
- 여러 회차 일괄 수정
- 기본 정보와 출석 값의 자동 복원
- public/member record surface의 시각 재설계

## 6. 전체 정보 구조

### 6.1 화면 header

상단 header는 현재 세션의 정체성과 상태만 보여준다.

- 회차
- 세션 제목 또는 책 제목
- 세션 lifecycle 상태
- 기록 공개 범위
- 초안 존재 여부
- 세션 목록으로 돌아가기

기존의 전역 `변경 사항 저장` 버튼은 제거한다. section마다 저장 의미가 다르기 때문이다.

- 기본 정보: `기본 정보 저장`
- 출석: 각 참석/불참 action이 즉시 반영
- 기록 작업대: 초안 자동 저장 + `반영 검토`
- 변경 기록: mutation 없는 탐색 화면

### 6.2 개요

개요는 기본 진입 section이다. 다음 세 상태를 첫 화면에 보여준다.

| 항목 | 표현 |
| --- | --- |
| 현재 적용본 | 적용 기록 유무, 버전, 공개 범위, 마지막 반영 시각 |
| 작업 중인 초안 | 없음, 저장 중, 저장됨, 저장 필요, 충돌, 검토 필요 |
| 다음 할 일 | 현재 server state에서 가장 안전하고 구체적인 단일 행동 |

개요의 다음 행동은 순수 model에서 계산한다.

1. 새 세션이 아직 저장되지 않음 → `기본 정보를 먼저 저장하세요`
2. 초안 저장 실패 또는 stale → `초안 저장 문제를 해결하세요`
3. 초안 validation 오류 → `확인이 필요한 항목을 수정하세요`
4. 저장된 유효 초안이 있음 → `초안 내용을 검토하세요`
5. 적용 기록이 없고 초안도 없음 → `기록 초안을 만들어 보세요`
6. 현재 적용본과 초안이 모두 정상이며 별도 작업이 없음 → `현재 기록이 최신입니다`

개요는 dashboard card 모음처럼 보이지 않도록 한 회차의 운영 ledger와 다음 action을 연결하는 문서형 구성으로 표현한다.

### 6.3 section navigation

desktop과 mobile은 같은 의미의 section을 사용한다.

| Desktop | Mobile |
| --- | --- |
| 개요 | 개요 |
| 기본 정보 | 기본 |
| 출석 | 출석 |
| 기록 작업대 | 기록 |
| 변경 기록 | 변경 |

desktop은 header 아래의 안정적인 horizontal section navigation을 사용한다. mobile은 thumb-friendly horizontal tab을 사용하고 320px에서 스크롤 가능해야 한다.

section navigation은 다음을 만족한다.

- role/tab/tabpanel 관계
- ArrowLeft, ArrowRight, Home, End keyboard 이동
- 선택한 tab만 `tabIndex=0`
- section 변경 시 선택 tab focus 유지
- 색상뿐 아니라 label과 selected semantics로 상태 구분

## 7. 기록 작업대

### 7.1 상단 상태

기록 작업대 상단은 다음을 항상 함께 보여준다.

- `현재 적용본`
  - 적용 기록 없음 또는 버전
  - 공개 범위
  - 마지막 반영 시각
  - 적용본 미리보기
- `작업 중인 초안`
  - 초안 유무
  - 자동 저장 상태
  - validation 상태
  - 적용본 기준이 stale인지 여부
- `다음 할 일`
  - 초안 만들기
  - 저장 문제 해결
  - 검증 오류 수정
  - 반영 검토

적용 기록이 없을 때 `버전 0`을 표시하지 않는다. `아직 적용된 기록이 없습니다`라고 표현한다.

### 7.2 초안 만들기

`세션 기록 완성` panel을 제거하고 `초안 만들기` 도구로 재구성한다.

세 가지 진입은 같은 수준의 선택지다.

- 직접 작성
- AI로 만들기
- JSON 가져오기

직접 작성은 기본값이며 바로 아래 작업 중인 초안 editor로 이어진다.

AI와 JSON을 선택하면 기록 작업대 안에 해당 subpanel을 연다. 결과 commit이 성공하면 별도 완료 화면을 유지하지 않고 공통 초안을 다시 불러온 뒤 `작업 중인 초안`으로 focus를 이동한다.

AI generation job의 진행 상태는 저장된 초안 상태와 분리한다.

- 생성 준비
- 업로드·preflight
- 생성 중
- 결과 검토
- 초안 저장 중
- 초안 저장 완료

AI 결과가 준비됐다는 사실을 `공개 기록 완료` 또는 `적용 완료`로 표현하지 않는다.

### 7.3 작업 중인 초안

공통 editor는 다음 section을 순서대로 제공한다.

1. 공개 범위
2. 기록 요약
3. 하이라이트
4. 한줄평
5. 피드백 문서

빈 하이라이트와 한줄평은 큰 빈 panel을 만들지 않는다. 해당 section의 간단한 empty message와 생성·가져오기 이후 채워질 수 있다는 문맥만 제공한다.

초안 editor 상단은 다음 상태 중 하나를 표시한다.

- 수정하면 자동 저장됩니다
- 저장 대기 중
- 저장 중
- 자동 저장됨
- 저장 필요
- 다른 호스트가 먼저 수정함
- 적용본이 변경되어 다시 확인 필요

desktop은 editor 오른쪽 context rail에서 현재 적용본과 최근 변경을 참조할 수 있다. mobile에서는 이 rail을 화면 끝에 그대로 붙이지 않는다.

- 현재 적용본 요약은 기록 section 상단으로 이동
- 최근 변경은 2건까지 compact preview로 보여주고 변경 section으로 연결
- 저장 안내와 운영 순서는 개요 또는 현재 section help로 이동
- 위험 작업은 개요의 명시적인 별도 영역에 둔다

### 7.4 반영 action

desktop은 초안 editor 하단에 compact sticky action bar를 둔다. mobile은 bottom app navigation과 겹치지 않는 sticky action bar를 둔다.

표시 내용:

- 초안 저장 상태
- 현재 적용본 버전
- `반영 검토`

`반영 검토`는 다음 조건을 모두 만족할 때만 활성화한다.

- 서버 초안이 존재
- 최신 입력이 저장됨
- validation 통과
- 초안의 live base가 stale하지 않음
- apply preview mutation이 진행 중이지 않음

반영 dialog 또는 mobile bottom sheet는 다음을 보여준다.

- 변경된 section
- 현재 적용본 버전 → 새 버전
- 공개 범위
- apply가 알림을 자동으로 만들지 않는다는 설명
- 취소
- `새 버전으로 반영`

닫기, Escape, backdrop click, route navigation은 apply를 호출하지 않는다.

## 8. 변경 기록

상위 section label은 `변경 기록`, panel 제목은 `버전과 작업 기록`으로 쓴다.

기록 항목은 server type을 그대로 노출하지 않고 사용자 문장으로 표현한다.

| Server type | 사용자 표현 |
| --- | --- |
| `RECORD_REVISION_APPLIED` | `버전 3을 적용했습니다` |
| `RECORD_REVISION_RESTORED` | `버전 1로 새 초안을 만들었습니다` |
| `BASIC_INFO_UPDATED` | `모임 날짜를 수정했습니다` |
| `ATTENDANCE_UPDATED` | `출석 명단을 수정했습니다` |
| `NOTIFICATION_SENT` | `기록 변경 알림을 발송했습니다` |
| `NOTIFICATION_SKIPPED` | 현재 서버 의미에 맞는 중립적인 미발송 기록 |

각 항목은 다음 정보를 가질 수 있다.

- 작업 종류
- 사람이 읽을 수 있는 결과 문장
- 발생 시각
- actor display name이 public-safe host response에 있을 때만 작업자
- 변경 field 또는 section 요약
- 관련 버전
- 가능한 후속 action

버전 항목의 action은 `버전 N 복원`이 아니라 `이 버전으로 초안 만들기`로 표현한다.

복원 확인 dialog는 다음을 분명히 한다.

- 현재 적용본은 바뀌지 않음
- 선택한 버전의 내용으로 새 공유 초안을 만듦
- 기존 작업 중인 초안이 있으면 server conflict 정책에 따라 먼저 해결해야 함
- 복원 후 기록 작업대로 이동해 검토와 반영을 다시 진행함

history가 비어 있으면 `아직 기록된 변경이 없습니다`와 함께 이 section에 앞으로 기록될 작업의 예시를 짧게 설명한다. 기술 용어만 있는 빈 panel은 사용하지 않는다.

## 9. 용어 체계

| 기존 표현 | 새 표현 |
| --- | --- |
| 공개 기록 | 상위 작업 문맥에서는 `기록 작업대`; 실제 public surface를 뜻할 때만 `공개 기록` |
| 공개 기록 초안 | 작업 중인 초안 |
| 세션 기록 | 문맥에 따라 `기록` 또는 구체 section명 |
| 세션 기록 완성 | 초안 만들기 |
| 현재 live revision | 현재 적용본 · 버전 N |
| draft revision | 사용자 기본 화면에서는 숨김; 충돌 상세에서만 초안 버전 |
| 변경 이력 | 변경 기록 |
| revision과 작업 이력 | 버전과 작업 기록 |
| revision N 복원 | 이 버전으로 초안 만들기 |
| 기록 반영 | 새 버전으로 반영 |

`공개`는 외부 공개만 뜻하지 않는다. 공개 범위는 항상 다음 세 값을 구체적으로 사용한다.

- 호스트 전용
- 멤버 공개
- 외부 공개

## 10. URL과 navigation 상태

기존 edit route를 유지한다.

```text
/app/host/sessions/:sessionId/edit
/clubs/:clubSlug/app/host/sessions/:sessionId/edit
```

section은 query state로 표현한다.

```text
?section=overview
?section=basic
?section=attendance
?section=records
?section=history
```

query가 없으면 `overview`와 같다. 기본 URL에 불필요한 query를 강제로 추가하지 않는다.

기록 생성 도구 deep link:

```text
?section=records&source=ai
?section=records&source=json
```

현재 진입 계약은 호환한다.

- `?aigen=1` → `section=records&source=ai`
- `?records=json` → `section=records&source=json`

호환 query를 읽은 뒤 현재 route를 canonical query로 `replaceState`할 수 있다. 다른 return state와 hash를 보존한다.

변경 기록에서 복원에 성공하면 `section=records`로 이동하고 새 초안 상태를 보여준다. 실패하면 history section과 기존 item을 유지한다.

## 11. frontend component 경계

기존 route-first 방향을 유지한다.

### 11.1 route

`HostSessionEditorRoute`가 다음을 소유한다.

- loader/query data
- club-scoped API context
- section/source URL state
- draft controller
- rebase, restore, apply preview/apply mutation
- history pagination
- composer handoff
- UI props와 callbacks 조립

### 11.2 model

React와 API에 의존하지 않는 pure model을 추가한다.

- section query parse/serialize
- legacy query compatibility
- overview state projection
- next action 계산
- server history item의 사용자 문장 mapping
- applied/draft 상태 label
- action enablement reason

### 11.3 UI

`HostSessionEditorShell`은 props와 callback만 받는다.

권장 UI 단위:

- `SessionEditorHeader`
- `SessionEditorSectionNav`
- `SessionOverviewSection`
- `BasicInfoSection`
- `AttendanceSection`
- `RecordWorkspace`
  - `AppliedRecordSummary`
  - `DraftSourcePicker`
  - `RecordDraftEditor`
  - `RecordApplyActionBar`
- `ChangeLogSection`
- `RecordApplyReviewDialog`
- `RestoreVersionDialog`

UI module은 feature API, query, route 또는 `shared/api` client를 import하지 않는다.

현재 `front/features/host/ui/host-session-editor.tsx`의 기본 form state와 삭제 dialog 등 이번 section 재편과 직접 관련 없는 behavior는 기존 model과 UI를 재사용한다. 파일 분리는 새 정보 구조를 이해하는 데 필요한 범위에서만 수행한다.

## 12. data flow

### 12.1 초기 진입

1. route loader가 session detail, record editor, history first page, notification dispatch summary를 로드한다.
2. route가 overview projection과 section별 UI props를 만든다.
3. UI는 기본적으로 overview만 렌더링한다.
4. section deep link가 있으면 해당 section을 선택한다.

### 12.2 초안 생성과 편집

1. 호스트가 직접 편집, AI, JSON 중 하나를 선택한다.
2. 직접 편집은 record draft autosave controller를 사용한다.
3. AI/JSON commit은 검증된 결과를 같은 server draft에 저장한다.
4. commit 성공 후 record editor query를 다시 읽는다.
5. 공통 draft editor가 최신 snapshot과 save state를 보여준다.
6. member/public live projection은 apply 전까지 변하지 않는다.

### 12.3 반영

1. `반영 검토`가 apply preview를 요청한다.
2. route가 changed section과 현재/다음 버전을 dialog props로 만든다.
3. 호스트가 명시적으로 confirm한다.
4. apply mutation이 content, immutable revision, receipt를 갱신한다.
5. record editor, history, session/closing 관련 query를 invalidate한다.
6. server가 composer context를 반환한 경우에만 별도 알림 작성기를 열 수 있다.
7. 알림 작성기를 닫거나 건너뛰어도 content apply는 유지된다.

### 12.4 복원

1. 변경 기록에서 `이 버전으로 초안 만들기`를 선택한다.
2. 확인 dialog가 현재 적용본 미변경을 설명한다.
3. restore mutation이 선택 버전을 새 draft로 복사한다.
4. route가 record editor를 갱신한다.
5. 기록 작업대로 이동해 일반 autosave, preview, apply 흐름을 사용한다.

## 13. 오류와 충돌

### 13.1 자동 저장 실패

- 입력을 local state에 유지한다.
- 상단 상태와 sticky action bar를 `저장 필요`로 바꾼다.
- `다시 저장` action을 제공한다.
- 저장되지 않은 상태에서만 route 이탈 경고를 표시한다.

### 13.2 draft stale

- 자동 덮어쓰기 또는 자동 병합을 하지 않는다.
- `최신 초안 보기`
- `내 입력 복사`
- 충돌 해소 전 apply 비활성화

### 13.3 live base stale

- 현재 적용본 또는 validation 참여 기본 정보가 변경됐음을 설명한다.
- `최신 적용본과 다시 비교`
- 재확인 완료 전 apply 비활성화

### 13.4 validation 오류

- 입력 초안을 보존한다.
- 오류 총 개수와 section별 바로가기를 제공한다.
- 해당 field에 accessible error association을 연결한다.
- 오류를 해결하기 전 apply 비활성화

### 13.5 apply 결과 불명확

- 새 apply request를 즉시 만들지 않는다.
- 같은 idempotent request의 결과를 먼저 재확인한다.
- 결과가 확인되지 않으면 현재 적용본이 변경됐다고 단정하지 않는다.

### 13.6 history pagination 실패

- 기존 item을 유지한다.
- 더 보기 button 근처에 retry 가능한 inline error를 표시한다.
- section 전체를 error page로 교체하지 않는다.

## 14. session lifecycle과 공개 범위 사각지대

세션 lifecycle과 기록 공개 범위는 서로 다른 축이다.

- `DRAFT`: 기본 정보를 먼저 저장해야 AI와 server draft 기능을 사용할 수 있다.
- `OPEN`: 기록 초안을 준비할 수 있으며 현재 적용된 feedback document가 있으면 별도 알림 기능이 가능할 수 있다.
- `CLOSED`: 출석 확정, 기록 초안 검토, apply가 주 작업이다.
- `PUBLISHED`: 현재 적용본 수정과 새 버전 반영, 과거 버전 복원이 가능하다.

공개 범위는 lifecycle과 별도로 표시한다.

- `HOST_ONLY`
- `MEMBER`
- `PUBLIC`

UI는 `PUBLISHED`를 곧바로 외부 공개로 해석하지 않는다. 실제 적용본과 visibility를 함께 본다.

적용 기록이 없고 초안만 있는 경우, 초안이 없고 적용 기록만 있는 경우, 둘 다 없는 경우를 각각 표현한다.

## 15. responsive와 접근성

### 15.1 Desktop

- 한 번에 한 section만 렌더링한다.
- 기록 작업대는 main editor와 좁은 context rail을 사용한다.
- context rail은 현재 적용본과 최근 변경만 보여준다.
- 주요 form width가 지나치게 넓어지지 않도록 reading measure를 유지한다.
- panel/card 수를 줄이고 typography, divider, spacing으로 계층을 만든다.

### 15.2 Mobile

- 320px와 390px를 모두 지원한다.
- short tab label을 사용하고 horizontal overflow를 허용한다.
- 기록 section은 상단 상태 → 초안 생성 → 초안 editor 순서다.
- sticky action은 bottom app navigation과 safe area를 침범하지 않는다.
- desktop context rail을 본문 끝에 복제하지 않는다.
- 위험 작업은 현재 편집 action과 시각적으로 분리한다.

### 15.3 Accessibility

- WCAG AA contrast
- visible focus
- tab/tabpanel semantics
- dialog focus trap과 trigger focus restore
- Escape와 취소의 mutation 없음
- reduced-motion compatibility
- 상태를 색상만으로 표현하지 않음
- Korean/English wrapping, URL, 긴 file name, Markdown overflow 대응
- form error를 field와 programmatically 연결
- status/alert live region의 과도한 반복 방지

## 16. visual direction

ReadMates의 `Modern editorial · warm neutral · ink blue` 방향을 유지한다.

- warm paper surface
- ink-toned hierarchy
- editorial spacing
- restrained ledger/archive cues
- 작은 상태 badge와 divider
- 문서 중심 typography

피한다.

- generic SaaS dashboard KPI tile
- Notion-style block stack
- excessive card nesting
- gradient, glow, glassmorphism
- AI tool을 과도하게 강조하는 hero treatment
- 긴 설명문으로 interaction을 대신하는 구성

호스트 화면은 조용하지만 정확한 운영 원장처럼 보여야 한다. 상태는 차분하게 표현하되 다음 action은 모호하지 않아야 한다.

## 17. loading, empty, denied 상태

### 17.1 Loading

- route shell과 header hierarchy를 유지한다.
- section navigation을 사용할 수 없는 동안 명확한 loading state를 보여준다.
- record editor만 다시 읽을 때 전체 page를 blank로 만들지 않는다.

### 17.2 Empty

- 적용 기록 없음
- 작업 초안 없음
- 하이라이트 없음
- 한줄평 없음
- 피드백 문서 없음
- 변경 기록 없음

각 empty state는 해당 위치의 다음 action과 연결하되 불필요한 button을 만들지 않는다.

### 17.3 Denied 또는 unavailable

- active host가 아니면 기존 route guard를 유지한다.
- section 일부 API 실패는 가능한 범위에서 section-local unavailable state로 격리한다.
- 권한 또는 club context를 browser 입력으로 우회하지 않는다.

## 18. 테스트 설계

### 18.1 Model unit

- section query parse/serialize
- legacy `aigen=1`, `records=json` compatibility
- lifecycle, applied record, draft, validation 조합별 next action
- applied/draft 상태 label
- history item 사용자 문장 mapping
- apply action enablement와 disabled reason

### 18.2 Component

- desktop/mobile section navigation
- keyboard tab 이동
- 한 번에 선택 section만 노출
- overview 상태 3종
- 적용 기록 없음에서 `버전 0` 미노출
- 초안 생성 수단 선택과 공통 editor 복귀
- autosave success/failure/stale 상태
- validation section link
- sticky action과 bottom navigation 간격
- apply dialog cancel/Escape/backdrop 무 mutation
- restore dialog의 현재 적용본 미변경 설명과 focus restore
- history empty, pagination, retry
- 긴 한국어·영문·URL·file name wrapping

### 18.3 Route

- loader/query data 조립
- club-scoped query key 유지
- section/source URL state
- old query canonicalization
- AI/JSON commit 후 record editor refresh
- restore 후 records section 이동
- apply 후 editor/history/session invalidation
- composer context가 없을 때 composer 미오픈

### 18.4 E2E

1. edit route 진입 시 개요가 보인다.
2. 기록 deep link로 기록 작업대를 연다.
3. 직접 편집한 초안이 자동 저장되지만 member/public live 기록은 변하지 않는다.
4. apply preview를 취소하면 live version과 알림이 변하지 않는다.
5. confirm하면 새 적용 버전과 변경 기록이 보인다.
6. 과거 버전으로 새 초안을 만들고 현재 적용본이 유지되는지 확인한다.
7. 복원 초안을 다시 apply한다.
8. AI 또는 JSON commit이 같은 작업 중 초안으로 수렴한다.
9. mobile 390px에서 section navigation과 sticky action을 사용한다.

### 18.5 Browser evidence

- desktop normal viewport
- 390px mobile
- 320px narrow mobile
- loading, empty, validation error, stale conflict
- long Korean/English/Markdown
- keyboard focus order
- reduced motion

### 18.6 Canonical frontend checks

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

CI parity 또는 Corepack 미설치 환경에서는 repository guide의 fallback을 사용하고 실제 실행 명령을 기록한다.

## 19. acceptance matrix

선택 row:

- Session lifecycle: `DRAFT`, `OPEN`, `CLOSED`, `PUBLISHED`에서 section과 next action이 달라진다.
- Publication visibility: 적용 여부와 `HOST_ONLY`, `MEMBER`, `PUBLIC`을 분리해 표현한다.
- UI or runtime state: loading, empty, stale, validation, error, wrapping, desktop, mobile이 핵심 범위다.
- Actor or authorization: host route guard와 denied state가 약화되지 않아야 한다.

인접 high-risk row:

- BFF/OAuth: endpoint, cookie, redirect, trusted header 동작은 변경하지 않으므로 직접 범위가 아니다.
- Persistence/migration: 현재 API로 구현 가능하면 migration은 없다.
- Async/provider: AI generation 내부 contract는 변경하지 않고 기존 결과가 공통 초안으로 수렴하는 UI만 검증한다.
- Cursor collection: history pagination UI는 유지하지만 cursor API contract 자체는 변경하지 않는다.

## 20. 구현 예상 표면

주요 frontend 후보:

- `front/features/host/route/host-session-editor-route.tsx`
- `front/features/host/ui/host-session-editor.tsx`
- `front/features/host/ui/session-editor/*`
- `front/features/host/model/*session-editor*`
- `front/shared/styles/mobile.css`
- 관련 co-located unit/component test
- 관련 `front/tests/e2e/host-session-record-*.spec.ts`

구현 시 먼저 현재 component 책임을 characterization test로 고정한 뒤 다음 순서로 진행한다.

1. section/overview pure model
2. shell과 section navigation
3. 개요
4. 기록 작업대 통합
5. 변경 기록 카피와 복원 action
6. mobile sticky action과 context rail 재배치
7. route URL compatibility
8. focused regression과 browser evidence

server 또는 BFF 변경은 frontend 구현 중 현재 response로 승인된 상태를 표현할 수 없다는 구체적인 증거가 있을 때만 별도 task로 추가한다.

## 21. 성공 기준

- 세션 편집 진입 시 상태와 다음 행동이 form보다 먼저 보인다.
- desktop과 mobile 모두 한 번에 하나의 section만 보여준다.
- `공개 기록 초안`과 `세션 기록 완성`이 별도 결과물처럼 보이지 않는다.
- 직접 작성, AI, JSON은 같은 작업 중 초안으로 수렴한다.
- 적용 여부와 공개 범위가 분리되어 `호스트 전용 공개본` 같은 모순이 없다.
- 기본 사용자 화면에 `revision` 용어가 남지 않는다.
- 적용 기록이 없을 때 `버전 0`을 표시하지 않는다.
- 초안 저장, 기록 apply, 알림 발송이 각각 명확한 행동으로 구분된다.
- 복원은 새 초안을 만들고 현재 적용본을 즉시 바꾸지 않는다.
- 저장 실패, validation, stale conflict에서 입력과 복구 action이 유지된다.
- mobile 320–390px에서 navigation, form, sticky action, bottom app navigation이 겹치지 않는다.
- UI component가 route/API/query를 직접 소유하지 않고 route-first dependency direction을 지킨다.
- 관련 unit, component, route, E2E와 browser evidence가 최종 HEAD에서 통과한다.
