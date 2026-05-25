# ReadMates Admin vNext Roadmap (Umbrella Design)

작성일: 2026-05-25
상태: APPROVED ROADMAP (umbrella) — sub-spec 진입 대기

## 배경

호스트 워크벤치(`/host/*`)는 dashboard / members / invitations / session-editor / notifications 5 라우트, 약 7,700 줄 규모로 운영 도구의 부피와 깊이가 누적된 상태다. 반면 플랫폼 어드민(`/admin`)은 단일 라우트, 약 1,300 줄로 onboarding wizard / club registry / domain panel / support grant / AI Ops 가 한 페이지에 세로로 쌓여 있다. 사용자가 "어드민이 호스트에 비해 빈약하다"는 인상을 받는 본질은 (a) 화면 수/페이지 격차가 아니라, (b) 운영 도구로서의 기능 깊이와 (c) 플랫폼 헬스/incident 가시성의 부재다.

이 로드맵은 그 격차를 닫는 작업을 한 번에 큰 spec으로 묶지 않고, 10개의 독립 슬라이스 sub-spec으로 자르고 순차 진행하기 위한 umbrella 문서다. 본 문서 자체는 구현 spec이 아니다. 각 슬라이스는 자기 spec → plan → 구현 사이클을 별도로 돈다.

## 페르소나

세 페르소나 동등 가중치.

- **개발자 운영자(본인 1인)** — incident 발생 시 SSH/DB 없이 어드민에서 1차 진단/대응 가능해야 한다. 단축경로와 정보 밀도가 중요.
- **OWNER 위임 대상** — 비기술 OWNER가 raw UUID 없이 클럽 onboarding, 공개 전환, 멤버 문의 대응을 수행 가능해야 한다.
- **리뷰어/포트폴리오** — `/admin`이 "잘 만든 플랫폼 운영 도구"로 5분 안에 가치를 전달해야 한다. IA, 데이터 근거, 운영 증거가 보여야 한다.

## 분해 철학

1. **Foundation-first** — 라우트/네비/권한 IA를 먼저 닫는다. 그 위에 모든 슬라이스가 동일한 leftnav · 상단 status strip · `/admin/*` 라우트 패밀리에 얹힌다.
2. **Contract before content** — 각 슬라이스는 먼저 서버 API contract와 권한/role gate를 닫고, 그 다음 UI. seed 데이터 약한 슬라이스는 fixture seed를 같이 만든다.
3. **Independent slice = independent release** — 각 sub-spec은 자기 단위로 CHANGELOG `Unreleased`에 한 줄로 들어갈 수 있어야 한다.
4. **Audit/감사 데이터는 후방** — 앞 슬라이스가 audit ledger에 기록하는 액션을 정의한 뒤, 통합 audit 슬라이스가 consume한다.
5. **분석 슬라이스는 후방** — seed 약함 → 운영 데이터로 의미가 생기는 시점에 배치.
6. **Public release safety** — 모든 sub-spec은 `docs/deploy/security-public-repo.md` 규약을 따른다.

## 의존성 그래프

```text
S0 Umbrella roadmap (이 문서)
  └─ S1 IA Foundation
       ├─ S2 Platform Ops Health (+ Deploy ledger 흡수)
       ├─ S3 클럽 운영 콘솔 (`/admin/clubs/:id` 깊이)
       ├─ S4 Support 워크벤치 + 멤버 검색 (5/20 grant 흡수)
       ├─ S5 알림/Outbox 운영          ← S2 헬스의 outbox strip drill-down
       └─ S6 AI Ops 깊이 보강
                                       ┌─ S7 Audit / Activity ledger
                                       ├─ S8 분석/리포팅 lite
                                       └─ S9 호스트 표면 보강
                                            └─ S10 공개 표면 portfolio 강화 (옵션)
```

S2~S6은 S1 완료 후 이론상 병렬이지만 본 로드맵은 단일 차선으로 순서를 강제한다 (아래 "확정 순서").

## 흡수 대상 spec

본 로드맵은 다음 기존 spec을 sub-spec 안으로 흡수한다. 별도 슬라이스로 유지하지 않는다.

- `2026-05-16-readmates-platform-admin-onboarding-design.md` — S1의 onboarding wizard 모달화
- `2026-05-20-readmates-platform-admin-productization-design.md` — S1의 IA, S4의 support 부분, S6의 AI Ops 부분으로 분산 흡수
- `2026-05-17-readmates-platform-admin-triage-console-design.md` — S1의 IA에 흡수

## 슬라이스 카탈로그

각 슬라이스의 자세한 산출물은 자기 sub-spec 파일에서 정의한다. 명명 규칙: `docs/superpowers/specs/YYYY-MM-DD-readmates-admin-vnext-<slug>-design.md`.

### S1 — Admin IA Foundation

- **목적**: `/admin` 단일 페이지 → 라우트 분할 + 좌측 nav + 글로벌 status strip + role badge + 권한 가드 통합 + lazy split.
- **신규 라우트**: `/admin/today` (기본), `/admin/health`, `/admin/clubs`, `/admin/clubs/:id`, `/admin/support`, `/admin/notifications`, `/admin/ai-ops`, `/admin/audit`, `/admin/analytics`. 미구현 라우트(S2~S10이 채울 자리)는 의도된 "준비 중" empty state로 진입 가능.
- **서버**: 변경 없음. 기존 `/api/admin/summary`만 status strip이 의존.
- **흡수**: 5/20 productization spec의 IA + 5/16 onboarding wizard 모달화 + 5/17 triage 콘솔.
- **CHANGELOG**: `platform-admin: split /admin into role-gated route family with shared status strip`.

### S2 — Platform Ops Health (+ Deploy ledger)

- **목적**: `/admin/health`. DB pool / Redis / Kafka consumer lag / AI provider 가용성 / outbox backlog / 알림 발송 성공률 / 최근 deploy attempt 5건 strip. 카드 단위로 status + last-checked + drill 링크.
- **서버**: `/api/admin/health/snapshot` (Micrometer + 기존 metrics aggregator). Deploy ledger는 OCI compose watch가 쓰는 attempt ledger를 readonly 노출.
- **CHANGELOG**: `platform-admin: introduce health snapshot route covering service, queue, AI, outbox, deploy signals`.

### S3 — 클럽 운영 콘솔

- **목적**: `/admin/clubs/:id`. 멤버 활동 매트릭스(active/dormant/대기), 세션 시리즈 진행(예정/진행/닫힘/공개), 호스트 액션 최근 로그, 알림 발송 통계, AI 사용·비용, 공개 readiness(기존 checklist 흡수).
- **서버**: `/api/admin/clubs/:id/operations` cross-domain aggregator. 멤버 PII는 masked default + reveal 권한.
- **계약 owner**: KPI 명세는 이후 S8/S9가 재사용 → 이 슬라이스가 contract owner.
- **CHANGELOG**: `platform-admin: add per-club operations console with member/session/notification/AI overview`.

### S4 — Support 워크벤치 + 멤버 검색

- **목적**: `/admin/support`. 이메일/이름/UUID 검색 → 멤버 프로필 페이지, support grant를 검색 결과에서 발행(raw UUID 입력 제거), grant revoke ledger + reason history.
- **서버**: `/api/admin/members/search`, `/api/admin/members/:id` (admin scope, masked default), 기존 grant API에 search-based 발행 강화. application validation 5종: grantee active admin, future expiry, max duration, reason non-blank, role permission.
- **흡수**: 5/20 productization spec의 support access 부분.
- **CHANGELOG**: `platform-admin: replace raw UUID grant flow with searchable support workbench and grant ledger`.

### S5 — 알림/Outbox 운영

- **목적**: `/admin/notifications`. relay lag, dead letter, manual replay, 발송 실패 cluster (errorCode 그룹), 클럽별 성공률, 호스트 manual notification audit cross-cut view.
- **서버**: `/api/admin/outbox/*` (state list, replay action, masked audit). 정책 변경 없음, 기존 state machine 노출만.
- **선행 관계**: S2 health strip의 outbox 카드가 여기로 drill-down.
- **CHANGELOG**: `platform-admin: add outbox/notification operations view with replay and failure clustering`.

### S6 — AI Ops 깊이 보강

- **목적**: `/admin/ai-ops`. 기존 AI Ops를 raw list → filter(status/club/errorCode) + cursor pagination + 디테일 모달 + 비용 시계열 + kill-switch banner + AI_DISABLED 운영 상태 표시.
- **서버**: 기존 `/api/admin/ai-generation/*` filter/cursor 활용. 시계열은 기존 cost ledger 집계 신규.
- **흡수**: 5/20 productization spec의 AI Ops 부분.
- **CHANGELOG**: `platform-admin: deepen AI Ops with filters, drilldown, cost trend, and kill-switch banner`.

### S7 — Audit / Activity ledger 통합

- **목적**: `/admin/audit`. platform admin 액션 / OWNER 액션 / SUPPORT grant 행위 / club lifecycle / role transition을 시간순 통합 뷰. 액션별 마스킹 정책, club/role/actor 필터.
- **선행 관계**: S2/S3/S4/S5가 이미 audit log에 쓰고 있어야 의미 있음.
- **서버**: 기존 ledger를 cross-domain 통합 read 모델로. 신규 mutation 없음.
- **CHANGELOG**: `platform-admin: unify audit ledger across admin, support, club lifecycle, and operations actions`.

### S8 — 분석/리포팅 lite

- **목적**: `/admin/analytics`. 클럽별 KPI(활성 멤버, 세션 완료율, RSVP rate, AI 비용/세션, 알림 도달률), 7/30/90d, cross-club benchmark.
- **데이터 현실**: seed 약함 → fixture seed 동시 작성 + "데이터 부족" empty state 정직하게 노출. 임의 mock 차트 금지.
- **서버**: `/api/admin/analytics/*` aggregator + 캐시.
- **CHANGELOG**: `platform-admin: add lite analytics with per-club KPI trends and cross-club benchmark`.

### S9 — 호스트 표면 보강 (cross-surface)

- **목적**: 호스트 멤버 페이지에 dormant 분석/활동 heatmap, 호스트 대시보드에 세션 시리즈 progress overview, 알림 수신 거부 통계. S3의 KPI 계약 재사용으로 어드민과 짝.
- **서버**: 기존 host endpoint 확장 (club-scoped). admin contract 일부 재사용.
- **CHANGELOG**: `host: surface dormant analytics, series progress, and notification opt-out signals`.

### S10 — 공개 표면 portfolio 강화 (옵션)

- **목적**: 클럽 about/records에 sanitized 운영 proof, public KPI 카드. README/showcase 톤과 연결.
- **데이터 현실**: sanitized snapshot only. 실시간 prod 노출 금지. 갱신 주기 명시.
- **CHANGELOG**: `public: add sanitized operations proof and public KPI cards on club about pages`.

## 확정 순서

| 순서 | Slice | 1차 페르소나 가중치 | 예상 commits |
|---|---|---|---|
| 1 | S1 IA Foundation | 리뷰어 ≫ 운영자 ≈ OWNER | 3~5 |
| 2 | S2 Platform Ops Health (+ Deploy ledger) | 운영자 ≫ 리뷰어 ≫ OWNER | 4~6 |
| 3 | S3 클럽 운영 콘솔 | OWNER ≈ 운영자 ≫ 리뷰어 | 5~8 |
| 4 | S4 Support 워크벤치 | OWNER ≫ 운영자 ≫ 리뷰어 | 4~6 |
| 5 | S5 알림/Outbox 운영 | 운영자 ≫ 리뷰어 ≫ OWNER | 4~6 |
| 6 | S6 AI Ops 깊이 | 운영자 ≈ 리뷰어 ≫ OWNER | 3~5 |
| 7 | S7 Audit ledger 통합 | 리뷰어 ≫ 운영자 ≫ OWNER | 3~5 |
| 8 | S8 분석/리포팅 lite | 리뷰어 ≫ OWNER ≫ 운영자 | 4~6 |
| 9 | S9 호스트 표면 보강 | OWNER ≫ 리뷰어 ≫ 운영자 | 3~5 |
| 10 | S10 공개 portfolio (옵션) | 리뷰어 | 2~4 |

## Slice acceptance gate

### 공통 gate (모든 slice 필수 통과)

1. Sub-spec 파일이 `docs/superpowers/specs/`에 commit, 본인 spec review 통과.
2. Implementation plan이 `docs/superpowers/plans/`에 commit.
3. CHANGELOG `Unreleased`에 한 줄 추가 (concrete 카테고리, placeholder 없음, pre-push release gate 통과 형태).
4. `./scripts/pre-push-check.sh` standard green.
5. 슬라이스의 라우트/엔드포인트에 대한 unit + 1개 이상 E2E happy path.
6. Public release scan (`./scripts/public-release-check.sh`) clean.
7. README "역할별 기능" 표 또는 architecture doc에 변경이 영향을 주면 1줄 반영.
8. ArchUnit baseline / exception 변동 시 explicit 사유 commit.

### 슬라이스 고유 gate

- **S1**: `/admin`이 옛 단일 페이지로 redirect되지 않고 새 `/admin/today`가 default. `OWNER`/`SUPPORT`/멤버/게스트 4 페르소나 라우트 가드 unit test. 어드민 dev-login 계정 seed 포함.
- **S2**: 모든 헬스 카드는 `unknown` / `ok` / `degraded` / `down` 4-state 정의, mock 환경에서 4-state 각각 렌더 테스트.
- **S3**: KPI 계약 (`AdminClubOperationsSnapshot` 등) public TypeScript 타입 + Kotlin DTO가 같은 필드 셋. S8/S9의 차후 import 경로 결정.
- **S4**: Raw UUID 입력 경로 **삭제**. 검색 없이 grant 발급 불가능. application validation 5종 각각 단위 테스트.
- **S5**: replay action은 audit ledger에 기록. dry-run preview → confirm 두 단계 강제.
- **S6**: AI_DISABLED 503은 운영 상태로 분기, 일반 에러 카피 금지. cost trend는 기존 cost ledger와 합산 일치 단위 테스트.
- **S7**: audit 통합 read 모델에 신규 mutation 없음. 모든 표시 항목은 출처 slice 명시.
- **S8**: 데이터 부족 시 의도된 "데이터 부족" 카피. fixture seed가 dev에서 차트 렌더 가능 수준까지 채움.
- **S9**: 호스트 표면 보강이 어드민 S3와 같은 contract를 import. `front/features/host/...`가 admin 공유 type을 의존.
- **S10**: 공개 노출 데이터는 sanitized snapshot only. 실시간 prod 노출 금지. 갱신 주기 명시.

## 슬라이스 간 데이터/타입 owner

| Owner slice | 산출물 | Consumer slice |
|---|---|---|
| S1 | route 가드 / leftnav / status strip 글로벌 컴포넌트 | 모두 |
| S2 | health snapshot 타입, deploy ledger 타입 | S5 (outbox drill 진입), S7 (헬스 액션 audit) |
| S3 | `AdminClubOperationsSnapshot` (KPI 계약) | S8, S9, S10 |
| S4 | member search 타입 + grant ledger 타입 | S7 |
| S5 | outbox ops 액션 타입 | S7 |
| S6 | AI Ops filter 타입 | S7, S8 |

## Cross-cutting 관심사

**라우팅·진입점**
- `/admin/*` 라우트 패밀리는 같은 layout (좌측 nav + 상단 status strip). S1이 owner.
- 모든 sub-route는 lazy 분할 + react-router `loader` factory + TanStack Query seeding 패턴.
- 미구현 라우트의 default state는 "준비 중" 카드 + 도큐 링크. 404 금지.

**권한 모델**
- 4 페르소나: 게스트 / 멤버 / 호스트 / 플랫폼 어드민(OWNER 또는 SUPPORT).
- 어드민 라우트는 `canUsePlatformAdmin` 가드. slice 단위 추가 가드는 sub-spec에서 명시.
- 서버 `@PreAuthorize`와 UI affordance는 같은 메시지를 표시.

**서버 API 명명**
- 모든 신규 어드민 endpoint는 `/api/admin/<resource>` 하위. cross-domain aggregator는 `/api/admin/<resource>/operations` 또는 `/snapshot` 같은 read-only 의미 명사.
- READ 우선, write는 명시적 verb (`replay`, `force-cancel`, `revoke`). 모든 write는 audit log 기록.
- BFF를 거치는 contract는 기존 `front/shared/api` 규칙을 따른다 (Zod fixture + diff 게이트).

**데이터/PII 마스킹**
- 어드민 화면도 기본 masked (이메일 일부, 표시 이름만). reveal은 명시적 user action + audit log 기록.
- 멤버 검색/프로필은 admin scope read-only. 멤버 수정은 어드민에 안 들어옴 (호스트 도구 보존).
- AI Ops에서 transcript / raw provider error / raw result 노출 금지.

**Public release safety**
- 모든 sub-spec은 `docs/deploy/security-public-repo.md` 규약. portfolio용 screenshot은 sanitized.
- `./scripts/public-release-check.sh`를 매 slice의 acceptance gate에 포함.

**테스트 패턴**
- Unit: Vitest. 모델/쿼리/UI 컴포넌트 우선.
- Route: react-router loader + Query seeding의 happy path + 가드 실패.
- E2E (Playwright): 슬라이스당 최소 1 happy path + 권한 거부 1.
- 서버: Spring `check`. 신규 라우트는 controller test + service slice test.

**ArchUnit / 의존성**
- 기본 방향: `front/features/host`가 `front/features/platform-admin` 타입을 import할 수 있어도, 반대는 금지.
- cross-surface 타입은 `front/shared/admin-contracts` 같은 중립 위치 또는 S3에서 정한 admin owner 모듈에서 호스트가 import (S9 한정 예외, ArchUnit 룰 갱신).

**관측·로그**
- 신규 admin endpoint는 Micrometer counter / histogram 추가, `/admin/health`의 헬스 카드에 등장 가능.
- 모든 admin write는 structured log (`actorId`, `clubId?`, `action`, `outcome`).

**Documentation 동기화**
- 각 slice 종료 시:
  - `README.md` 역할별 기능 표 또는 architecture 문서 1줄 갱신
  - `docs/showcase/architecture-evidence.md` 또는 `engineering-confidence.md`에 sanitized 증거 1줄
  - 필요 시 `docs/operations/runbooks/`에 운영 절차 1개

## 위험

| 위험 | 발생 시점 | 완화 |
|---|---|---|
| 슬라이스 누적으로 어드민 빌드/번들이 비대해짐 | S3 이후 | S1에서 라우트별 lazy split 필수. 각 slice가 자기 lazy chunk |
| seed 데이터가 약해 차트/리스트가 항상 empty | S3, S8 특히 | S1에서 어드민 dev-login 계정 + S8에서 fixture seed 동시 작성 |
| 어드민에 cross-domain aggregator가 늘면서 서비스 경계가 흐려짐 | S3 이후 | aggregator는 read-only 전용, write 없음. ArchUnit으로 강제 |
| OWNER vs SUPPORT 권한 분기가 화면마다 불일치 | S4 이후 | 권한 매트릭스를 sub-spec 표준 섹션으로. S1이 권한 행렬 owner |
| audit ledger가 늦게 들어와서 앞 slice들이 기록 안 함 | S7 진입 시 | 앞 slice들의 acceptance gate에 "audit log 기록" 명시 |
| 분석(S8)이 prod 데이터 없으면 의미 없음 | S8 진입 시 | 진입 직전 데이터 현황 자체 점검. 부족하면 S10 시점 늦춤 |
| 호스트(S9) cross-surface 의존이 양방향 import로 새어나감 | S9 | 중립 contract 모듈 + ArchUnit 룰 |
| 공개(S10)에 실 운영 수치가 새어나감 | S10 | sanitized snapshot 정책 + 검토 게이트 1단계 추가 |
| 본 로드맵 자체가 6개월 늘어지며 흥미 잃음 | 언제든 | S4 종료 시 중간 회고 게이트 (아래) |

## 중간 회고 게이트

S4 종료 시점에 다음을 점검하고 결과를 본 문서에 follow-up entry로 추가한다.

- 호스트 대비 화면 수/깊이 격차가 사용자 체감상 닫혔는가?
- 남은 6개 슬라이스(S5~S10) 중 접거나 순서를 바꿀 것이 있는가?
- 데이터 현실이 S8을 의미 있게 채우기에 충분한가?

## 비목표

- 클럽 내부 멤버/세션/참석/노트 운영을 어드민으로 이동하지 않는다. 호스트 도구는 자기 자리.
- support access를 호스트 workflow 대체 기능으로 확장하지 않는다.
- AI prompt 품질 / 모델 라우팅 / provider key 관리 UI는 다루지 않는다.
- multi-tenant billing / 결제 / 청구 UI는 다루지 않는다.
- 일반 사용자(멤버)용 콘솔/설정은 어드민에 들어오지 않는다.
- 분석(S8)에서 실시간 streaming dashboard는 만들지 않는다. snapshot + trend 만.
- 어드민 자체에서 데이터 삭제/익명화 액션은 본 로드맵에 없다. 필요 시 별도 spec.
- 공개(S10)의 KPI 실시간 노출은 안 한다.
- 외부 운영 secret / 실 멤버 데이터 / private deployment state / DB dump / 로컬 경로 / OCID 는 어떤 sub-spec 문서/예시에도 포함하지 않는다.

## 다음 단계

1. 본 umbrella 문서 사용자 review 게이트.
2. 승인되면 S1 IA Foundation의 brainstorming 세션 시작 (별도 진입).
3. 각 sub-spec은 자기 spec → implementation plan → 구현 → CHANGELOG 사이클을 독립적으로 돈다.
4. S4 종료 시 본 문서에 중간 회고 entry 추가.
