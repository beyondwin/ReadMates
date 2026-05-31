# Admin vNext S6→S9 Closeout 통합 실행 스펙 (C+D+E 단일 plan)

작성일: 2026-05-31
상태: APPROVED DESIGN SPEC

## 1. 성격 & override 선언

이 스펙은 S6→S9 closeout의 남은 슬라이스(C·D·E)를 **하나의 스펙 + 하나의 implementation plan**으로 묶는 통합 실행 계약이다.

- **명시적 override**: charter §10과 sequencing 엄브렐러 §3·§8 Risk 표는 "슬라이스별 독립 plan, 단일 거대 plan으로 뭉치지 않는다"를 원칙으로 고정했다. 이 스펙은 **2026-05-31 사용자 결정에 따라 그 원칙을 의식적으로 override**한다 — C·D·E를 단일 문서로 합친다. 이는 drift나 누락이 아니라 명시적 결정이다.
- **supersede 관계**: sequencing-only 엄브렐러(`docs/superpowers/specs/2026-05-31-admin-vnext-s6-s9-closeout-umbrella-design.md`)를 대체한다. C→D→E 시퀀싱과 슬라이스 설계는 그대로 상속하되, plan을 통합한다.
- **상속 SSOT**: 차이가 생기면 아래 상위 문서가 우선한다.
  - charter: `docs/superpowers/specs/2026-05-30-admin-vnext-closeout-execution-charter-design.md`
  - C·D 구현 설계 source: `docs/superpowers/specs/2026-05-30-admin-vnext-s6-aiops-depth-s9-host-reinforcement-design.md` (이하 S6/S9 스펙) §5.3(C)·§5.4(D)
  - Slice C 기존 plan(Phase C로 흡수): `docs/superpowers/plans/2026-05-31-admin-s6-t4-aiops-surface-connectivity.md`

성공 기준은 "화면 수가 늘었다"가 아니라, 이미 shipped된 `/admin/ai-ops`·host 표면이 일관된 운영 품질로 닫히고 admin·host 신호가 갈라지지 않는 것이다(charter §1).

### 1.1 override가 잃는 이점과 완화책

단일 plan은 슬라이스별 **독립 머지·롤백** 이점을 잃는다. 이를 다음으로 완화한다:

- **슬라이스 경계 = Phase 경계**: C·D·E는 단일 plan 안의 세 Phase가 된다. Phase는 서로 다른 표면을 건드린다(C: audit/health 프런트 글루 / D: shared 계약 + host / E: 리뷰 리포트).
- **Phase별 검증 게이트**: 각 Phase는 자기 minimum checks(§6)를 통과해야 다음 Phase로 넘어간다. Phase 중간에 다음 Phase 코드를 끼워 넣지 않는다.
- **task별 커밋 유지**: 기존 슬라이스 plan과 동일하게 task 단위로 커밋한다. 롤백이 필요하면 Phase 경계가 자연스러운 revert 지점이 된다.
- **순서 강제**: C → D → E. E는 C·D가 머지된 누적 브랜치를 점검한다.

## 2. 검증된 기준선 (현황)

- **S6 P1** AI Ops 실패 코드 드릴다운 — 머지됨 (`bffecbd2`).
- **Slice A (S6-T2)** 비용/사용량 윈도우 추세 — 머지됨 (`463101c4`).
- **Slice B (S6-T3)** admin retry-commit — 머지됨 (`3b340470`).
- **Phase C (S6-T4)** 표면 연결성 — 미착수. 설계 source: S6/S9 스펙 §5.3 + 기존 Slice C plan.
- **Phase D (S9)** Host-surface 보강 — 미착수. 설계 source: S6/S9 스펙 §5.4.
- **Phase E** closeout release-readiness 리뷰 — 미착수. §3.3에서 정의.

## 3. 세 Phase 설계 (단일 plan 내)

실행 순서: **Phase C → Phase D → Phase E**.

### 3.1 Phase C — 표면 연결성 (S6-T4)

목표: `/admin/audit`의 AI 운영(AI_OPS) 감사 행에서 `/admin/ai-ops?clubId=…` 드릴다운 딥링크를 제공해, 운영자가 감사 신호에서 원인→조치(ai-ops job 필터 뷰)로 한 번에 이동하게 한다.

- **순수 프런트 글루.** 서버 계약 변경 없음 — 감사 행은 이미 `target.clubId`를 노출하고, `/admin/ai-ops`는 이미 `?clubId=`/`?errorCode=` URL 필터(필터 배너 + "전체 보기" + 정직한 empty state)를 받는다.
- P1 드릴다운 필터 모델(`platform-admin-ai-ops-model.ts`)을 SSOT로 재사용해 outbound 경로를 만들고, "어떤 감사 행이 링크를 받는가" 결정은 audit 모델의 **순수 함수**(`aiOpsDrilldownForAuditItem`)로 분리해 단위 테스트한다.
- `/admin/health`의 AI provider 카드는 이미 `/admin/ai-ops`로 drill하므로 **회귀 가드 assertion만** 추가한다.
- **스코프 가드** (S6/S9 §5.3 상속): 신규 서버 계약 없음. `errorCode` 딥링크는 audit 행이 안정적으로 노출하지 않으므로 **clubId 기준 링크만** 만든다(스코프 크리프 방지). 새 라우트·상태·권한 없음. provider raw error/transcript/생성 결과 JSON/raw member email 비노출.
- **흡수**: 기존 Slice C plan(`2026-05-31-admin-s6-t4-aiops-surface-connectivity.md`)의 검증된 task 1–6을 Phase C로 그대로 가져온다. 통합 plan은 이를 재서술하지 않고 동일 task로 편입한다.

### 3.2 Phase D — Host-surface 보강 (S9)

목표: S3 club operations 신호 중 host-적절 부분을 host 화면에서 재사용한다(charter §5.2, S6/S9 §5.4).

- **선결 — 중립 계약 owner 확정**: 현재 club-operations 계약은 platform-admin feature 소유다. host-적절 subset을 **`front/shared/model/club-operations`** 로 분리한다 — 기존 `front/shared/model` 컨벤션을 따른다. admin·host 양쪽이 이 중립 계약을 import한다.
- **import cycle 강제**: `front/tests/unit/host-notifications-ui-boundary.test.ts` 패턴의 **frontend boundary test**로 admin·host 양방향 import cycle 부재를 강제한다.
- **Scope**: host 화면은 S3 신호 중 host-적절 부분(자기 클럽 readiness/세션/AI 사용량 요약)을 **read-only**로 재사용한다. 서버는 host-scoped projection(자기 클럽만)으로 반환하고 admin 전용 신호(support grant, raw member email, notification replay)는 제외한다.
- **Non-goals** (charter §5.3): admin write 명령(support grant, notification replay 등)을 host로 이전 금지. host가 admin 역할 대체 금지. 신규 host CRUD 끼워넣기 금지.

### 3.3 Phase E — Closeout release-readiness 리뷰

목표: C·D가 누적된 브랜치를 닫기 전에, 잔여 운영·릴리즈 리스크를 정직하게 점검하고 기록한다. **이 Phase는 빌드가 아니라 리뷰 리포트다. 버전 태그/릴리즈를 하지 않는다.**

- **입력 범위**: `origin/main..HEAD` 누적분. 최신 plan 하나로 범위를 한정하지 않는다(AGENTS.md residual-risk 규칙). 점검 시점에 머지된 S6 P1·A·B + Phase C·D를 포함한다.
- **점검 룰**: `docs/development/release-readiness-review.md`를 SSOT로 사용한다. 최소한 다음을 다룬다:
  - CHANGELOG `Unreleased` 정합(동작 변경이 빠짐없이, 공개 안전하게 기록).
  - CI/deploy 스크립트 변경의 영향.
  - operator-facing 동작 변경(권한·audit·복구 전이 등).
  - security-code 위생(masked 응답, provider raw error/transcript/member email 비노출).
  - architecture-test 베이스라인/예외(Phase D 경계 이동 시).
  - 공개 저장소 릴리즈 안전(`scripts/build-public-release-candidate.sh` → `scripts/public-release-check.sh`).
- **산출물**: `docs/superpowers/reports/2026-05-31-admin-vnext-s6-s9-closeout-readiness.md`.
  - 룰 항목별 **통과 / 면책(객관적 이유) / 스킵(이유)** 을 명시한다. 실행하지 못한 검증은 통과로 적지 않는다.
  - 잔여 리스크와 follow-up 후보를 목록화한다.
- **갭 처리**: 사소한 갭(문서·copy·작은 마무리)은 인라인 수정. 큰 갭은 별도 follow-up plan으로 분리해 리포트에 링크한다 — 이 Phase에서 새 기능을 끼워 넣지 않는다.
- **연결**: 이 리포트는 charter §7 **S10 재평가 결정 게이트**의 입력이 된다. 이 스펙 범위에서 **S10을 빌드하지 않는다.**

## 4. 공통 하드닝 게이트 (건드린 표면 한정)

charter §6 / S6/S9 §7 상속. 슬라이스가 건드린 표면에 한해 적용한다(전면 retrofit 아님).

- **일관성**: 카드·테이블·필터·badge 톤이 admin shell의 calm operating-ledger 톤과 일치.
- **접근성**: 키보드 포커스 순서, aria 라벨, 색 대비.
- **모바일**: desktop·mobile 레이아웃 모두 검증.
- **Empty/에러**: 데이터가 얇을 때 정직한 empty state, 안전한 실패 카피(provider raw error·private data 비노출).

## 5. 계약 안전 & 공개 안전 (모든 Phase)

- server DTO · frontend type · fixture · E2E mock이 동일 필드명/shape.
- provider raw error, transcript body, 생성 결과 JSON, raw member email은 응답·UI·docs·fixture 어디에도 노출하지 않는다. placeholder·sanitized fixture만 사용한다.
- Phase C·D의 admin/host 동작은 originating Phase에서 audit·권한 동작을 문서화한다.

## 6. 검증 & 릴리즈 안전 (Phase별 minimum checks)

공통 회귀:

- Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`.
- Server: `./server/gradlew -p server clean test`, 경계 이동 시 `architectureTest`.
- Auth/BFF/user-flow 라우트: `pnpm --dir front test:e2e`.
- 동작 변경 시 CHANGELOG `Unreleased`와 관련 운영 docs 갱신.

Phase별:

- **C**: ai-ops outbound 경로 빌더 + 감사 행 결정 함수 단위 테스트. health/audit AI 신호 → ai-ops 드릴다운 e2e. 필터 round-trip(원인→조치). 필터 적용 후 빈 결과는 정직한 empty state.
- **D**: 중립 계약에 대한 frontend boundary test(import cycle 부재). host 화면이 S3 신호를 동일 의미로 표시하는 단위/route 테스트. host 표면에서 공유 운영 신호 렌더링 e2e. host-scoped projection(자기 클럽만, admin 전용 신호 제외) 검증. 서버 경계 이동 시 `architectureTest`.
- **E**: release-readiness 룰 항목별 통과/면책 기록. 공개 릴리즈 후보 스캔(`build-public-release-candidate.sh` → `public-release-check.sh`). CHANGELOG `Unreleased` 정합 확인.

**Phase 게이트**: 각 Phase는 자기 checks 통과 후에만 다음 Phase로 진행한다.

## 7. Risks

| Risk | Where | Mitigation |
| --- | --- | --- |
| 단일 plan이 독립 머지/롤백 이점 상실 | All | Phase 경계 = revert 지점, Phase별 검증 게이트, 순서 강제(§1.1) |
| build(C·D)+review(E) 혼합이 E를 빌드로 번지게 함 | E | E는 리뷰 리포트만, 버전 태그/릴리즈 비포함, 큰 갭은 follow-up 분리 |
| 통합 plan이 C·D 상위 설계를 재서술해 drift | C·D | 재서술 금지, S6/S9 §5.3/§5.4 + Slice C plan 링크/흡수만, 충돌 시 상위 우선 |
| 실행하지 못한 검증을 통과로 기록 | E | 통과/면책/스킵을 이유와 함께 명시, 스킵은 통과로 적지 않음 |
| AI Ops가 raw provider error/transcript 노출 | C | masked 응답, 안전 실패 카피, fixture public-safety 스캔 |
| host/admin 계약 분기와 import cycle | D | 중립 계약 owner(`front/shared/model/club-operations`) 선정 후 boundary test |
| admin 명령이 host로 새어 host가 admin 대체 | D | host는 read 재사용만, write 명령 비이전 |
| 하드닝이 전면 retrofit으로 번짐 | All | Phase가 건드린 표면에 한해 적용 |
| 공개 저장소 안전성 회귀 | All | 변경 파일 대상 public-safety 스캔 |

## 8. Next Step

스펙 승인 후 **C·D·E를 세 Phase로 담은 단일 implementation plan**을 작성한다(writing-plans). Phase C는 기존 Slice C plan task를 흡수하고, Phase D는 중립 계약 분리 + host 재사용 + boundary test를, Phase E는 release-readiness 리뷰 리포트를 정의한다. S10은 charter §7 결정 게이트로만 남으며 이 스펙 범위에서 빌드하지 않는다.
