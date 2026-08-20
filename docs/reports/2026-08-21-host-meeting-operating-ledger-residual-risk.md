# 모임 운영 장부 남은 리스크

작성일: 2026-08-21
상태: `main` `4f1f3918` 스냅샷. 현재 동작의 source of truth는 코드와 [`docs/development/architecture.md`](../development/architecture.md)다.
대상: [`docs/superpowers/specs/2026-08-21-host-meeting-operating-ledger-design.md`](../superpowers/specs/2026-08-21-host-meeting-operating-ledger-design.md) 구현 후, 배포 태그와 프로모션 전에 남은 일
릴리스 절차: [`docs/development/release-readiness-review.md`](../development/release-readiness-review.md)

이 문서는 작성 시점의 잔여 리스크다. 테스트 통과를 배포 완료로 읽지 않는다.

## 1. 범위

검토 범위는 `6581d6bd..4f1f3918`의 모임 운영 장부다. 마이그레이션은 없다. 제품 버전 태그는 아직 없다. Unreleased 하이라이트는 `CHANGELOG.md`에 있다.

닫힌 것:

- `/app/host`가 지금 다루는 모임 장부이고 `/app/host/sessions/:sessionId`가 canonical이다. `/edit`와 `/closing`은 그 장부로 보낸다.
- 모임 전·진행 중·모임 후 단계와 확인 창(브라우저 `confirm()`이 아닌 기존 dialog)으로 열기·마치기·공개·되돌리기를 한다.
- 다음에 읽을 책 목록, `멤버에게 보이기`, 내구 이력이 없는 `DRAFT` 삭제, `GET /api/host/sessions/schedule-defaults`.
- 모임 후 주 경로는 정리본 올리기 → 미리보기 → 반영 전 확인이다.
- 멤버·게스트 빈 현재 모임은 예정 책을 이어서 보여 준다.
- 장부 주 경로 카피에서 「세션」「회차」「기록 작업대」를 걷어 낸 부분, 관측성 패턴 `/app/host/sessions/:sessionId`, 만들기 POST의 `accessScope`, CHANGELOG·local-setup·Cloudflare smoke 경로.

## 2. 배포 전

스키마 변경이 없으므로 Flyway 순서는 이 기능만으로는 바뀌지 않는다.

프론트만 먼저 나가면:

- `GET /api/host/sessions/schedule-defaults`가 아직 없는 API에서는 폼이 저녁 8–10시·온라인으로만 채워진다. 만들기는 막히지 않는다.
- 내구 이력이 없는 `DRAFT` 삭제는 예전 API가 `SESSION_DELETE_NOT_ALLOWED`를 줄 수 있다. 확인 창은 뜨고 서버가 거절한다.

API만 먼저 나가면 새 필드는 additive다. 구 프론트는 만들 때 `accessScope`를 안 보내고, 보이기는 이후 `PATCH .../access-scope`로 바꿀 수 있다.

권장 순서는 기존과 같다. 서버 이미지 다음에 프론트다. 태그·프로모션·live smoke는 이 문서가 대신하지 않는다.

## 3. 운영자가 화면에서 아직 볼 수 있는 말

장부 주 경로는 「모임」이다. 아래는 같은 호스트 앱에 남은 예전 말이다. 스펙 §10과 어긋나지만 동작은 유지된다.

| 위치 | 남은 말 | 영향 |
| --- | --- | --- |
| `/app/host/sessions/new` 제목 | `세션 문서 만들기` | 첫 모임·빈 장부 폼 |
| 새 모임 저장 버튼 | `세션 문서 저장` | 만들기 주 버튼 |
| 진행 중(`OPEN`) 위험 구역 | `세션 삭제` | DRAFT의 `목록에서 지우기`와 다름. OPEN 삭제 규칙은 그대로 |
| `/app/host/sessions` 목록 | `세션 기록 장부` | 과거·검색 보조 화면 |
| 목록 로딩 | `세션 기록 장부를 불러오는 중` | 보조 화면 로딩 |
| 에디터 쿼리 셸(제목은 숨김) | `세션 기록 편집 정보를 불러오는 중` | 장부 본문 로딩 |
| 마운트되지 않은 `HostDashboard` | `세션 문서 만들기`, `현재로 시작` | 홈은 장부로 바뀌었다. 컴포넌트와 단위 테스트는 남아 있다 |

후속 카피 작업은 장부 주 경로가 아니라 새 모임 폼, OPEN 삭제 트리거, 과거 목록, 죽은 대시보드 정리로 나누면 된다.

## 4. 스펙 한 바퀴와 검증 공백

스펙 §15 한 바퀴는 만들기 → 열기(확인) → 마치기 → 다음 책 두 권 중 하나만 멤버에게 보이기 → 정리본 업로드·반영 → 홈이 가까운 다음 모임 전으로 가고 `이전 모임 기록 남음`이다.

`front/tests/e2e/dev-login-session-flow.spec.ts`는 만들기·열기 확인 창·마치기·정리본 올리기 버튼 노출까지 간다. 한 시나리오 안에 다음을 넣지는 않았다.

- 다음 책 두 권을 만들고 하나만 `GUEST_READABLE`
- 정리본 파일을 preview/commit한 뒤 apply
- 홈이 다음 `DRAFT`를 고르고 `이전 모임 기록 남음`이 보이는지

정리본 preview/commit/apply와 기록 개정은 다른 e2e와 단위 테스트에 있다. 마지막 locator 수정 뒤 Playwright 전체(당시 149개)를 한 명령으로 다시 돌리지는 않았다. 호스트 수명·wrap-up 관련 스펙은 포커스로 다시 돌렸다.

서버는 PR 게이트 `./scripts/server-ci-check.sh`와 defaults·DRAFT 삭제·create `accessScope` 포커스 테스트를 돌렸다. 전체 Testcontainers `integrationTest`는 이 브랜치에서 다시 돌리지 않았다.

브라우저로 호스트 장부를 수동 클릭하지는 않았다. 근거는 단위 테스트와 포커스 e2e다.

## 5. 제품·계약에서 남는 세부

- `PATCH /api/host/sessions/{id}`는 `accessScope`를 받지 않는다. 보이기는 만들기 POST 또는 `PATCH .../access-scope`다.
- 에디터의 저장하지 않은 초안 이탈은 기존 `window.confirm`을 쓴다. 열기·마치기·공개·되돌리기·삭제의 확인 창과는 다른 경로다.
- `docs/development/session-import-generator.md`는 호스트 버튼을 `정리본 올리기`로 한 문장 바꿨고, 문서 나머지에는 「기록 작업대」「회차」가 남아 있다.
- CHANGELOG Unreleased의 이전 항목 「호스트 세션 되돌리기」는 이 기능 이전 문구다. 장부 하이라이트와 섞여 있다.

## 6. 공개 저장소·보안

이 범위에서 스키마, BFF 인가 정책, 새 OAuth는 없다. defaults GET은 호스트만, 클럽 범위다. 접속 암호는 호스트 폼 JSON에만 있고 메트릭 라벨에는 넣지 않는다. canonical 모임 URL은 관측성에서 `:sessionId`로 정규화한다.

공개 릴리즈 후보 스캔은 `4f1f3918` push 훅에서 통과했다. 실제 멤버 데이터, 비밀, 사설 도메인, 로컬 절대 경로는 이 문서에 넣지 않는다.

## 7. 후속 작업 제안

배포 전:

1. 서버 이미지 다음에 프론트.
2. 호스트 스모크: 장부 주소에 `/edit`가 없는지, 열기 확인 창, 마치기 후 `정리본 올리기`.

카피(동작 변경 없음):

3. 새 모임 폼의 `세션 문서 만들기` / `세션 문서 저장`.
4. OPEN `세션 삭제` 트리거를 DRAFT와 같은 `목록에서 지우기` 말로 맞출지 결정.
5. 과거 목록 `세션 기록 장부`와 로딩 문구.
6. 홈에서 빠진 `HostDashboard` 컴포넌트 제거 또는 테스트만 남길지.

검증:

7. 스펙 §15 한 바퀴를 기존 host session e2e에 한 시나리오로 붙인다.
8. 태그 전에 전체 `pnpm --dir front test:e2e`와 필요하면 `./server/gradlew -p server integrationTest`.

## 8. 이 시점에 돌린 검사

| 검사 | 결과 |
| --- | --- |
| `pnpm --dir front lint` | 통과 |
| `pnpm --dir front test` | 통과 (2313) |
| `pnpm --dir front build` | 통과 |
| `./scripts/server-ci-check.sh` | 통과 |
| 포커스 host e2e | 통과. 전체 스위트 재실행은 아님 |
| push 훅 public-release-check | 통과 |

이 표는 `4f1f3918` 머지·push 시점이다. 이후 `main` 커밋에는 다시 확인한다.
