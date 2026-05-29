# ReadMates Admin vNext Operating Depth And Reporting Roadmap

작성일: 2026-05-29
상태: APPROVED DESIGN SPEC

## 1. 배경

2026-05-26 로드맵 reset 이후 `/admin` 콘솔의 거의 모든 라우트가 READY 상태가 되었다. `admin-route-catalog.ts` 기준으로 `today`, `health`, `clubs`, `clubs/:clubId`, `support`, `notifications`, `ai-ops`, `audit`가 모두 ready이고, coming-soon으로 남은 라우트는 `analytics`(S8) 하나뿐이다.

그러나 "라우트가 READY다"가 "운영 표면이 충분히 깊다"를 의미하지는 않는다. S3 클럽 운영, S4 지원 워크벤치, S6 AI Ops는 1차 구현이 끝났지만 대부분 point-in-time 단일 스냅샷이거나 기본 동작만 갖춘 상태다. 이 문서는 그 세 표면의 심화(S3+/S4+/S6+)와 마지막 그린필드인 S8 분석/리포팅을 하나의 시퀀싱 문서로 고정한다.

이 문서는 기존 로드맵을 삭제하거나 덮어쓰지 않는다. 2026-05-25 parent roadmap과 2026-05-26 operating roadmap reset을 historical source로 유지하고, 이 문서는 "거의 모든 라우트가 READY가 된 지금" 남은 심화·리포팅 작업의 실행용 시퀀싱 문서다.

성공 기준은 "화면 수가 늘었다"가 아니다. 각 운영 표면이 point-in-time 스냅샷에서 "추세를 보고 판단하고 다음 조치 라우트로 이어 가는" 깊이로 올라가고, 마지막에 리포팅으로 운영 흐름이 닫히는 것이다.

## 2. Source Documents

- Parent roadmap: `docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md`
- Operating roadmap reset: `docs/superpowers/specs/2026-05-26-readmates-admin-vnext-operating-roadmap-reset-design.md`
- Current architecture source of truth: `docs/development/architecture.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Docs guide: `docs/agents/docs.md`

## 3. Current Code Audit

### Route catalog 상태

`front/features/platform-admin/model/admin-route-catalog.ts`:

- READY: `today`(S1), `health`(S2), `clubs`(S1), `support`(S1), `notifications`(S5), `ai-ops`(S1), `audit`(S7), `clubs/:clubId`(S1).
- COMING_SOON: `analytics`(S8) 단 하나.

### 슬라이스별 1차 구현 상태

S3 클럽 운영 — 이미 풍부한 단일 스냅샷이 존재한다.

- `front/features/platform-admin/route/admin-club-detail-route.tsx`가 `AdminClubOperationsPage`를 렌더한다.
- `front/features/platform-admin/model/platform-admin-club-operations-model.ts`의 `AdminClubOperationsSnapshot` (`admin.club_operations_snapshot.v1`)은 readiness, memberActivity, sessionProgress, notificationHealth, aiUsage, safeLinks를 포함한다.
- 부족한 점: 단일 시점 스냅샷이라 추세/이력이 없고, 클럽 목록(`admin-clubs-route.tsx`)의 신호 밀도와 red-state 우선순위가 약하며, safe drill-down이 일부만 연결되어 있다.

S4 지원 워크벤치 — search→grant→revoke→ledger 흐름이 이미 있다.

- `front/features/platform-admin/route/admin-support-route.tsx`가 lookup, grant(reason/expiry), revoke, ledger를 제공한다. raw-UUID 입력 grant 흐름은 이미 제거됨.
- 부족한 점: lookup 결과 상세(마스킹된 멤버/관리자 컨텍스트)와 grant history 깊이가 얕고, 검증 실패 메시지가 일반화되어 있다.

S6 AI Ops — summary + jobs + force-cancel 가 있다.

- `front/features/platform-admin/route/admin-ai-ops-route.tsx`가 summary, jobs 목록, force-cancel, disabled(503) 상태를 처리한다.
- 부족한 점: 비용 추세, 모델 allowlist·cap 가시화, job 실패 클러스터 분석, kill-switch 상태/조치가 콘솔에 없다.

S8 분석 — 그린필드. coming-soon descriptor만 존재.

### 서버 상태

`server/.../com/readmates/admin/` 하위에 dedicated clean-architecture 패키지는 현재 `audit`, `health`뿐이다. 신규 admin read/ops 기능은 동일한 feature-local clean architecture 패턴(controller=HTTP, service=권한·오케스트레이션, outbound port 뒤로 Prometheus/ledger/persistence/mail/Kafka)을 따른다.

## 4. Operating Flow

순서는 운영자 워크플로를 따른다.

```text
상태 감지 (health / today)
→ 원인 확인 (clubs / club detail)
→ 조치 또는 지원 (support / notifications / ai-ops)
→ 기록/감사 (audit)
→ 리포트/분석 (analytics)
```

감지(health/today), 알림 조치(S5), 기록(S7 audit)은 이미 READY이고 product 품질에 도달했다. 이 문서가 다루는 4개 슬라이스는 "원인 확인" 깊이(S3+), "조치/지원" 깊이(S4+, S6+), "리포트"(S8)를 채운다.

## 5. Slice Order

확정 순서: **S3+ → S4+ → S6+ → S8**.

이유:

- S3+가 먼저인 이유: 클럽은 운영자가 진단하고 조치하는 기본 단위다. health/today가 클럽으로 drill하므로, 클럽 콘솔의 깊이가 다른 조치 표면보다 먼저 의미가 있다.
- S4+가 S6+보다 먼저인 이유: 지원/조치는 운영 흐름의 "조치/지원" 단계의 일반 경로이고, 원래 roadmap 순서(S3→S4)와 일치한다.
- S6+가 S8보다 먼저인 이유: AI Ops 심화는 운영 조치이고, S8 분석은 S6의 비용/job 신호를 재사용한다.
- S8이 마지막인 이유: 2026-05-26 reset이 명시한 대로 "daily operating surface가 유용해진 뒤" 추세를 요약한다. S8은 S3/S5/S6 데이터 계약을 재사용한다.

### S3+ — 클럽 운영 콘솔 심화

Purpose: `/admin/clubs`와 `/admin/clubs/:clubId`를 "지금 무엇이 문제고 어디로 가야 하나"에 답하는 운영 진단 표면으로 끌어올린다.

Scope:

- 클럽 목록 뷰의 신호 밀도 강화: red-state 우선 정렬/필터, 클럽별 핵심 운영 신호(알림 실패, AI 실패, readiness blocking, domain 조치 필요) 요약 노출.
- 스냅샷에서 S5 알림, S6 AI Ops, 호스트 표면으로의 safe drill-down 완결.
- 단일 시점 스냅샷에 최소한의 최근-윈도우 컨텍스트(예: 최근 실패 추이 요약)를 더해 "추세 판단"이 가능하도록.

Non-goals:

- 호스트 명령(세션 편집, 출석, 멤버 lifecycle, notes)을 `/admin`으로 이전하지 않는다.
- 멤버 사적 정보를 기본 노출하지 않는다.
- 일반 CRM 화면으로 만들지 않는다.

Gate:

- 클럽 목록에서 red 신호가 있는 클럽을 즉시 식별하고 상세로 이동할 수 있다.
- 상세의 모든 red 신호가 다음 조치 라우트(S5/S6/호스트 표면)로 연결된다.
- 플랫폼-소유 metadata/readiness와 호스트-소유 클럽 운영이 UI에서 구분된다.
- 서버 계약이 후속 S8 분석과 S9 host-surface 재사용에 안정적이다.

### S4+ — 지원 워크벤치 심화

Purpose: 안전한 운영자 지원 흐름의 lookup 상세와 history 깊이를 채운다.

Scope:

- 마스킹된 멤버/플랫폼-관리자 lookup 결과 상세(목적·역할 범위 안에서만).
- grant history 깊이: 사유, 만료, 취소 이력, 누가 언제 발급/취소했는지.
- 검증 실패 메시지 강화: active grantee, future expiry, max duration, non-blank reason, role 권한 위반을 구체적이고 안전하게 설명.

Non-goals:

- 일반 멤버 관리 콘솔을 만들지 않는다.
- support 접근이 호스트 워크플로를 대체하지 않는다.
- 목적·역할 범위를 넘는 사적 멤버 데이터를 노출하지 않는다.

Gate:

- 성공적인 lookup 없이는 grant 생성이 불가능하다.
- SUPPORT는 역할이 허용하는 것만 읽고 파괴적 동작을 할 수 없다.
- 실패한 grant/revoke는 가시적이고 안전한 설명을 만든다.

### S6+ — AI Ops 심화

Purpose: AI 세션 생성 운영면을 "조치 가능한" 깊이로 끌어올린다.

Scope:

- 비용 추세(일/주 단위)와 cost cap 대비 현황 가시화.
- 모델 allowlist와 cap 설정의 읽기 전용 가시화.
- job 실패 클러스터 분석(safe error code 단위 그룹).
- kill-switch 상태 표시와 콘솔에서의 조치(권한·audit-ready 전제).
- 클럽 단위 AI 신호는 S3 `aiUsage`를 재사용한다.

Non-goals:

- API key를 콘솔에 노출하지 않는다.
- provider raw error, transcript body, 생성 결과 JSON을 노출하지 않는다.
- cap/flag write는 별도 implementation plan이 필요성을 증명하기 전에는 추가하지 않는다(읽기 가시화 우선).

Gate:

- 콘솔에서 AI 비활성 원인, 비용 상태, 실패 원인을 안전하게 설명할 수 있다.
- 모든 콘솔 발 write 동작(kill-switch 등)은 audit-ready다.
- provider key/flag 운영 절차는 기존 환경 운영 문서를 유지한다.

### S8 — 분석/리포팅 lite

Purpose: daily operating surface가 유용해진 뒤 추세를 요약한다. 유일한 그린필드 라우트.

Scope:

- 7/30/90일 클럽 KPI 추세: 활성 멤버, 세션 완료율, RSVP rate, AI 비용/세션, 알림 도달률.
- 데이터가 충분한 경우 cross-club benchmark.
- 데이터가 얇을 때 정직한 "데이터 부족" empty state.
- fixture/dev seed로도 의미 있는 차트.

Non-goals:

- 실시간 스트리밍 대시보드를 만들지 않는다.
- 빈 데이터용 가짜 mock 차트를 만들지 않는다.
- 라이브 운영 지표를 공개 노출하지 않는다.

Gate:

- 분석 라우트가 로컬 fixture/dev seed 데이터로 유용하다.
- empty state가 정직하고 제품 품질 부재로 오해되지 않는다.
- 데이터 계약이 S3/S5/S6를 적절히 재사용한다.
- `analytics` descriptor가 coming_soon → ready로 전환된다.

## 6. Architecture Principles

Frontend:

- Route module이 loader 동작, URL state, query seeding, UI prop 조립을 소유한다.
- Feature API 계약은 `front/features/platform-admin/api`에 둔다.
- 순수 계산과 response 정규화는 `front/features/platform-admin/model`에 둔다.
- UI module은 props와 callback으로만 렌더한다. fetch하거나 route module을 import하지 않는다.
- `admin-route-catalog.ts`와 `platform-admin-permissions.ts`가 shell source of truth로 유지된다.
- READY 라우트 전환은 `front/src/app/routes/admin.tsx`에서 lazy-split로 유지한다.

Server:

- 신규 admin read/ops 기능은 feature-local clean architecture(`audit`/`health` 패턴)를 따른다.
- Controller는 HTTP parsing과 response mapping만 소유한다.
- Application service는 권한, 오케스트레이션, 비즈니스 규칙을 소유한다.
- Prometheus, ledger 파일, persistence, mail, Kafka 세부는 outbound port/adapter 뒤에 둔다.
- Application service는 Spring web/http 예외를 throw하지 않는다.
- admin write 동작은 도입 슬라이스에서부터 audit-ready여야 한다.

Public-safety:

- 실제 멤버 데이터, secret, 사설 domain, deployment state, 로컬 절대 경로, OCID, token-shaped 예시, provider raw error, transcript body, 생성 AI 결과 JSON, 사적 메시지 body를 docs/fixtures/logs/UI 예시에 넣지 않는다.
- placeholder와 sanitized fixture만 사용한다.

## 7. Slice Template

각 후속 슬라이스 spec은 동일 구조를 따른다.

```text
Purpose
Current code state
Scope
Non-goals
Primary files and packages
API/data contract
Permissions and public safety
Testing and verification gates
Dependency on previous/next slices
```

이 문서는 시퀀싱 source다. S3+/S4+/S6+/S8 각각은 현재 슬라이스가 될 때 자기 spec과 implementation plan을 갖는다. 하나의 거대한 plan으로 S3+~S8을 묶지 않는다.

## 8. Verification And Release Safety

공통 게이트:

- Contract: 서버 DTO, 프론트 types, fixtures, E2E mock이 동일 필드명과 shape을 쓴다.
- Authorization: OWNER, OPERATOR, SUPPORT, member, guest 동작을 슬라이스별로 문서화한다.
- Public safety: 사적 운영/멤버 데이터가 예시, 응답, UI, docs로 새지 않는다.
- UI verification: 신규/전환 READY 라우트는 최소 하나의 Playwright happy path와 browser smoke 또는 screenshot QA를 갖는다.
- Release readiness: 동작이 바뀌면 CHANGELOG `Unreleased`와 관련 운영 docs를 갱신한다.
- Regression checks:
  - Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`.
  - Server: `./server/gradlew -p server unitTest`, 경계 이동 시 `architectureTest`.
  - Auth/BFF/user-flow 라우트: `pnpm --dir front test:e2e`.
  - 공개 릴리즈 영향: public release candidate checks.

S3+ minimum checks:

- 클럽 목록 정렬/필터/red-state 우선순위 model 테스트.
- 클럽 상세 snapshot 계약 테스트와 drill-down 링크 안전성 테스트.
- E2E: health/today → 클럽 상세 → 조치 라우트.

S4+ minimum checks:

- lookup 상세 마스킹과 grant history model 테스트.
- 모든 grant/revoke 검증 규칙(active grantee, future expiry, max duration, non-blank reason, role) 테스트.
- UI 테스트: lookup 없는 grant 불가, 안전한 실패 copy.
- E2E: search → grant → revoke.

S6+ minimum checks:

- 비용 추세, cap 대비 현황, 실패 클러스터 model 테스트.
- kill-switch 조치의 권한 거부와 audit-ready 기록 테스트.
- UI 테스트: disabled 상태, key/raw-error 비노출.

S8 minimum checks:

- 7/30/90일 KPI 집계와 empty state model 테스트.
- coming_soon → ready 전환 catalog 테스트.
- fixture/dev seed로 차트 렌더 happy path와 browser smoke.

## 9. Documentation Rules

- 기존 historical planning note를 그대로 유지한다.
- 신규 실행 docs는 historical spec을 다시 쓰지 않고 링크한다.
- CHANGELOG 항목은 내부 plan 언어가 아니라 shipped 동작을 기술한다.
- 운영 docs는 운영자 절차가 바뀔 때만 갱신한다.
- 공개 docs는 placeholder를 쓰고 사적 운영 세부를 피한다.

## 10. Risks

| Risk | Where it appears | Mitigation |
| --- | --- | --- |
| READY로 보이지만 깊이가 얕음 | S3+/S4+/S6+ | "1차 구현 완료, 심화"로 명시하고 게이트를 깊이 기준으로 둠 |
| 클럽 콘솔이 호스트 앱 복제가 됨 | S3+ | admin은 read-mostly 유지, 호스트-소유 명령 보존 |
| 지원 검색이 멤버 데이터 유출 | S4+ | 기본 마스킹, reveal/grant를 역할·목적에 결박 |
| AI Ops가 secret/raw error 노출 | S6+ | key 비노출, raw error 대신 safe error code |
| cross-surface 계약이 import cycle 유발 | S3+/S8/S9 | host 재사용 전 neutral contract owner 선택 |
| 분석이 비거나 인위적임 | S8 | fixture/dev 데이터 요구, 정직한 empty state |
| 공개 저장소 안전이 docs/예시로 회귀 | 전 슬라이스 | 변경 파일 대상 public-safety scan 실행 |

## 11. Next Step

이 spec이 리뷰된 뒤, **S3+ 클럽 운영 콘솔 심화**의 implementation plan만 작성한다. 그 plan은 S4+~S8을 구현하려 하지 않는다. 이 문서는 시퀀싱 source이고, 이후 각 슬라이스는 현재 슬라이스가 될 때 자기 spec과 implementation plan을 갖는다.
