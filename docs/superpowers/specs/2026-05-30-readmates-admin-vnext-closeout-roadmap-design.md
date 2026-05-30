# ReadMates Admin vNext Closeout Roadmap

작성일: 2026-05-30
상태: APPROVED DESIGN SPEC

## 1. 배경

Admin vNext operating roadmap reset(`2026-05-26-...-operating-roadmap-reset-design.md`)는 현재 코드 기준으로 운영 흐름을 다시 고정하고 S2H → S5 → S3 → S4 → S7 순서를 정렬했다. 그 문서는 "S6 AI Ops depth, S9 host-surface reinforcement, S10 public portfolio polish는 S4 또는 S5 이후에 재평가한다"고 명시했다.

이제 S4·S5가 실제 코드로 닫혔다. `/admin` nav에서 READY가 아닌 라우트는 `analytics`(S8) 하나만 남았다. 따라서 이 문서는 그 재평가의 결과물이다: 남은 슬라이스(S8 → S6 → S9)와 cross-cutting 하드닝을 닫는 closeout 로드맵.

이 문서는 기존 roadmap을 삭제하거나 덮어쓰지 않는다. parent roadmap과 reset 문서는 historical/predecessor로 유지하고, 이 문서는 남은 작업을 닫기 위한 실행용 시퀀싱 문서로 둔다.

성공 기준은 "화면 수가 늘었다"가 아니다. `/admin` nav의 마지막 coming_soon이 사라지고, 이미 shipped된 표면이 일관된 운영 품질로 닫히며, admin과 host 표면이 갈라지지 않는 것이다.

## 2. Source Documents

- Parent roadmap: `docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md` (historical)
- Predecessor reset: `docs/superpowers/specs/2026-05-26-readmates-admin-vnext-operating-roadmap-reset-design.md`
- Current architecture source of truth: `docs/development/architecture.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Docs guide: `docs/agents/docs.md`

## 3. Current Code Audit

Reset 로드맵 이후 다음이 실제 코드로 들어왔다:

- `front/features/platform-admin/model/admin-route-catalog.ts`에서 `today`·`health`·`clubs`·`clubs/:clubId`·`notifications`·`support`·`ai-ops`·`audit`가 모두 `ready`이고, `analytics`(S8)만 `coming_soon`이다.
- `/admin/notifications`(S5)는 outbox/delivery/실패 cluster/club별 알림 health와 two-step replay preview/confirm을 제공한다.
- `/admin/clubs/:clubId`(S3)는 readiness, 멤버/세션, 알림 health, AI 사용량을 하나의 운영 스냅샷으로 묶고, 최근 7일 알림/AI 실패 추이와 next-action 링크를 보여준다.
- `/admin/support`(S4)는 사용자 검색 기반 grant 생성과 ledger/revoke 흐름을 제공한다.
- `/admin/audit`(S7)는 platform/club/notification replay/AI source를 read-only ledger로 통합한다.
- `/admin/ai-ops`는 summary + jobs 두 쿼리로 된 1차 운영 표면이다(`front/features/platform-admin/route/admin-ai-ops-data.ts`).
- `front/features/host`에 `aigen`·`club`·`model`(`host-dashboard-model`, `host-session-editor-model` 등)·`route`·`ui`가 존재한다. S3 club operations 계약을 재사용할 host 측 표면 후보다.

남은 작업:

- S8 `analytics`는 아직 coming_soon이다. operating flow의 마지막 단계(리포트/분석)가 비어 있다.
- S6 ai-ops는 READY지만 1차 표면이다. 실패 코드 드릴다운·비용/사용량 추세·stale job 조치 흐름이 얕다.
- S9 host 표면은 S3 계약을 아직 재사용하지 않아 admin/host 신호가 갈라질 수 있다.
- shipped된 표면 전반의 일관성·접근성·모바일·empty/에러 품질이 슬라이스마다 균일하지 않다.

## 4. Operating Flow

reset 로드맵의 운영 흐름을 그대로 계승한다:

```text
상태 감지
→ 원인 확인
→ 조치 또는 지원
→ 기록/감사
→ 리포트/분석
```

S8은 이 흐름의 마지막 단계를 채운다. S6은 "원인 확인 → 조치"의 AI 경로를 깊게 만든다. S9는 admin이 본 신호를 host가 동일 계약으로 보게 해 표면 분기를 막는다.

## 5. Cross-cutting 하드닝 Gate

하드닝은 독립 슬라이스가 아니라 **모든 슬라이스(S8/S6/S9)의 gate에 공통 체크로 첨부**한다. S2H가 `/admin/health`에 적용했던 품질 기준을 슬라이스가 건드린 표면에 한해 확장한다. 전면 retrofit이 아니다.

공통 체크:

- **일관성**: 카드·테이블·필터·badge 톤이 admin shell의 calm operating-ledger 톤과 일치한다.
- **접근성**: 키보드 포커스 순서, aria 라벨, 색 대비를 확인한다.
- **모바일**: desktop과 mobile 레이아웃을 모두 검증한다.
- **Empty/에러**: 데이터가 얇을 때 정직한 empty state를 보여주고, 실패 카피는 안전하다(provider raw error·private data 노출 금지).

각 슬라이스 spec은 자기 gate 섹션에 이 공통 체크를 명시적으로 포함한다.

## 6. Slice Order

### S8 — Analytics / Reporting Lite (먼저) — delivered 2026-05-30 (admin.analytics slice, plan 2026-05-30-admin-s8-analytics-reporting-lite.md)

Purpose: 유일하게 남은 coming_soon 라우트(`/admin/analytics`)를 READY로 전환해 operating flow의 마지막 단계를 닫는다.

Scope:

- `analytics` 라우트를 `coming_soon → ready`로 토글.
- 7/30/90일 클럽 KPI 트렌드: 활성 멤버, 세션 완료율, RSVP rate, AI 비용/세션, 알림 도달률.
- 데이터가 충분한 경우 cross-club benchmark.
- 데이터가 얇을 때 정직한 "데이터 부족" empty state.
- 데이터 계약은 S3 club operations와 S5 notification 신호를 재사용하고 신규 인프라를 최소화한다.

Non-goals:

- 실시간 스트리밍 대시보드 금지.
- 빈 데이터용 임의 가짜 차트 금지.
- live 운영 지표의 공개 노출 금지.

Gate:

- analytics 라우트가 fixture/dev seed 데이터로도 유의미하다.
- empty state가 정직하며 품질 결함처럼 보이지 않는다.
- 데이터 계약이 적절한 경우 S3/S5를 재사용한다.
- Cross-cutting 하드닝 gate(섹션 5)를 통과한다.

### S6 — AI Ops Depth (다음)

Purpose: 이미 READY인 `/admin/ai-ops`를 1차 표면에서 운영 가능한 깊이로 만든다.

Current code state: `admin-ai-ops-data.ts`가 summary + jobs 두 쿼리를 로드한다. host 측에는 자기 세션 AI job을 cancel/retry하는 흐름이 이미 있다.

Scope:

- 실패 코드 드릴다운(어떤 실패가 어떤 클럽/세션에 영향을 주는지).
- 비용/사용량 추세 요약.
- stale job 조치 흐름 강화(host 측 cancel/retry와 일관된 admin 시점).

Non-goals:

- AI generation 상태머신 의미를 별도 implementation plan 없이 변경 금지.
- provider raw error, transcript, 생성 결과 JSON 노출 금지.

Gate:

- `/admin/health`·`/admin/audit`의 AI 신호에서 `/admin/ai-ops`로 드릴다운 시 원인과 조치가 끊기지 않고 이어진다.
- admin write 조치는 originating 슬라이스에서 audit-ready다.
- Cross-cutting 하드닝 gate(섹션 5)를 통과한다.

### S9 — Host-surface Reinforcement (마지막)

Purpose: S3에서 만든 클럽 운영 계약을 host 측 화면에서 재사용해 admin/host 표면이 갈라지지 않게 한다.

Current code state: `front/features/host`에 `aigen`·`club`·`model`·`route`·`ui`가 존재한다. S3 `AdminClubOperationsSnapshot` 계약은 platform-admin feature에 있다.

Scope:

- S3 club operations 신호 중 host에 적절한 부분을 host 화면에서 재사용.
- 중립 계약 owner를 먼저 선정해 admin·host 양방향 import cycle을 방지.

Non-goals:

- admin 전용 운영 명령(support grant, notification replay 등)을 host로 이전 금지.
- host가 admin 역할을 대체하지 않는다.
- 신규 host CRUD 기능을 끼워 넣지 않는다.

Gate:

- 공유 계약이 admin과 host 양쪽에서 import cycle 없이 동작한다(frontend boundary test 통과).
- host와 admin이 동일 신호를 동일 의미로 표시한다.
- Cross-cutting 하드닝 gate(섹션 5)를 통과한다.

## 7. S10 재평가

S10(public portfolio polish)은 sanitized 운영 증거가 충분히 쌓인 뒤로 유지한다. 이 closeout 문서 범위 밖이며, 후속 재평가 항목으로만 남긴다. S8/S6/S9 완료 후 별도로 재평가한다.

## 8. Architecture Principles

reset 로드맵의 원칙을 그대로 상속한다(재서술 대신 링크: predecessor 문서 섹션 6).

Frontend:

- 라우트 모듈이 loader·URL state·query seeding·UI prop 조립을 소유한다.
- feature API 계약은 `front/features/platform-admin/api`, host는 `front/features/host/api`.
- 순수 계산·응답 정규화는 각 feature `model`.
- UI 모듈은 props/callback에서 렌더링하고 fetch하거나 route 모듈을 import하지 않는다.
- READY 토글은 `admin.tsx`의 lazy-split로 유지한다.

Server:

- 신규 admin read/ops는 feature-local clean architecture를 따른다.
- 컨트롤러는 HTTP 파싱/응답 매핑만, 애플리케이션 서비스가 인가/오케스트레이션/비즈니스 규칙을 소유한다.
- 애플리케이션 서비스는 Spring web/http 예외를 throw하지 않는다.
- 모든 admin write는 introducing 슬라이스에서 audit-ready다.

Public safety:

- 실제 멤버 데이터, secret, private 도메인, 배포 상태, local 절대경로, OCID, token 형태 예시, provider raw error, transcript body, 생성 AI 결과 JSON, private 메시지 body를 docs/fixture/log/UI 예시에 넣지 않는다.
- placeholder와 sanitized fixture만 사용한다.

## 9. Slice Template

각 후속 슬라이스 spec은 동일 구조를 쓴다:

```text
Purpose
Current code state
Scope
Non-goals
Primary files and packages
API/data contract
Permissions and public safety
Cross-cutting hardening checklist (섹션 5)
Testing and verification gates
Dependency on previous/next slices
```

## 10. Verification And Release Safety

공통 게이트:

- Contract: server DTO, frontend type, fixture, E2E mock이 동일 필드명/shape를 쓴다.
- Authorization: OWNER/OPERATOR/SUPPORT/member/guest 동작을 슬라이스별로 문서화한다.
- Public safety: private 운영/멤버 데이터가 응답·UI·docs·fixture로 새지 않는다.
- UI 검증: 각 READY 변화는 최소 1개 Playwright happy path + browser smoke/screenshot QA.
- Release readiness: 동작이 바뀌면 CHANGELOG `Unreleased`와 관련 운영 docs를 갱신한다.
- Regression:
  - Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`.
  - Server: `./server/gradlew -p server unitTest`, 경계 이동 시 `architectureTest`.
  - Auth/BFF/user-flow 라우트: `pnpm --dir front test:e2e`.
  - Public release 영향: public release candidate checks.

S8 minimum checks:

- analytics 데이터 계약(S3/S5 재사용)과 정규화 model 단위 테스트.
- 라우트 테스트: 데이터 충분/부족(empty), 권한, loading/error 상태.
- Playwright `/admin/analytics` happy path와 정직한 empty state 렌더링.

S6 minimum checks:

- 실패 코드 드릴다운, 비용/사용량 추세, stale job 조치 서비스/모델 테스트.
- 권한 거부 및 masked 응답 테스트.
- E2E: health/audit AI 신호 → `/admin/ai-ops` 드릴다운.

S9 minimum checks:

- 중립 계약 owner에 대한 frontend boundary test(import cycle 부재).
- host 화면이 S3 신호를 동일 의미로 표시하는 단위/라우트 테스트.
- E2E: host 표면에서 공유 운영 신호 렌더링.

## 11. Documentation Rules

- 기존 historical 계획 노트를 그대로 둔다.
- 신규 실행 docs는 historical spec을 재서술하지 않고 링크한다.
- CHANGELOG 항목은 내부 plan 언어가 아니라 shipped 동작을 기술한다.
- 운영 docs는 operator 절차가 바뀔 때만 갱신한다.
- 공개 docs는 placeholder를 쓰고 private 운영 세부를 피한다.

## 12. Risks

| Risk | Where it appears | Mitigation |
| --- | --- | --- |
| Analytics가 비어 있거나 인위적 | S8 | fixture/dev 데이터 요구, 정직한 empty state |
| AI Ops가 raw provider error를 노출 | S6 | masked 응답, 안전한 실패 카피 |
| host/admin 계약 분기와 import cycle | S9 | 중립 계약 owner를 먼저 선정, boundary test |
| admin 명령이 host로 새어 host가 admin을 대체 | S9 | host는 read 재사용만, admin write 명령 비이전 |
| 하드닝이 전면 retrofit으로 번짐 | All slices | 슬라이스가 건드린 표면에 한해 적용 |
| 공개 저장소 안전성 회귀 | All slices | 변경 파일 대상 public-safety 스캔 |

## 13. Next Step

이 spec 검토 후 **S8 Analytics / Reporting Lite** implementation plan만 작성한다. 그 plan은 S6/S9를 구현하지 않는다. 이 closeout 로드맵은 시퀀싱 소스이며, S6와 S9는 current가 될 때 각자 spec과 implementation plan을 받는다.
