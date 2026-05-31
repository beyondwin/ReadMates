# ReadMates Admin vNext Closeout Execution Charter

작성일: 2026-05-30
상태: APPROVED DESIGN SPEC

## 1. 목적 & 기존 로드맵 관계

이 charter는 새 계획을 만들지 않는다. `docs/superpowers/specs/2026-05-30-readmates-admin-vnext-closeout-roadmap-design.md`(이하 closeout 로드맵)를 **유일 source**로 참조해, 남은 작업(S6 → S9)을 **하나의 엄브렐라 세션의 실행 계약**으로 고정한다.

- 로드맵 내용을 재서술하지 않고 링크한다. 차이가 생기면 closeout 로드맵이 우선한다.
- charter가 새로 정하는 것은 *실행 순서 · 공통 게이트 부착 방식 · 각 implementation plan의 분기점*뿐이다.
- closeout 로드맵 13절("S6와 S9는 current가 될 때 각자 spec과 implementation plan을 받는다")과 5절(하드닝은 독립 슬라이스가 아니라 슬라이스 gate의 공통 체크) 원칙을 그대로 따른다.

성공 기준은 "화면 수가 늘었다"가 아니라, 이미 shipped된 표면이 일관된 운영 품질로 닫히고 admin·host 신호가 갈라지지 않는 것이다.

## 2. Source Documents

- Closeout 로드맵(시퀀싱 source): `docs/superpowers/specs/2026-05-30-readmates-admin-vnext-closeout-roadmap-design.md`
- Predecessor reset: `docs/superpowers/specs/2026-05-26-readmates-admin-vnext-operating-roadmap-reset-design.md`
- Parent roadmap(historical): `docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md`
- Architecture source of truth: `docs/development/architecture.md`
- Surface guides: `docs/agents/front.md`, `docs/agents/server.md`, `docs/agents/design.md`, `docs/agents/docs.md`

## 3. 실행 순서 (확정)

```text
S6 AI Ops Depth
→ S9 Host-surface Reinforcement
→ S10 재평가 체크포인트(결정 게이트, 빌드 아님)
```

- 각 슬라이스는 **자기 implementation plan**을 받고 독립적으로 머지·검증 가능하다.
- cross-cutting 하드닝(closeout 로드맵 §5)은 슬라이스가 *건드린 표면에 한해* 각 plan의 gate에 첨부한다. 전면 retrofit이 아니다.
- S10은 **빌드 슬라이스가 아니라 S9 완료 후 결정 게이트**다(§6).

## 4. S6 — AI Ops Depth

### 4.1 현재 코드 상태

`/admin/ai-ops`는 READY지만 1차 표면이다. 데이터 계약(`front/features/platform-admin/model/platform-admin-domain-types.ts`, 서버 `admin.ai-ops` 슬라이스):

- Summary: `activeJobCount`, `failedLast24h`, `monthToDateCostEstimateUsd`, `failureCodes[]`(code/count), `providerCosts[]`(provider/model/cost), `staleCandidateCount`.
- Jobs: `status`·`clubId`·`errorCode` 필터, cursor pagination. 각 job은 `errorCode`·`safeErrorMessage`·`staleCandidate`·`availableActions`.
- Action: `FORCE_CANCEL` 단일.
- Loader: summary + jobs 두 쿼리(`front/features/platform-admin/route/admin-ai-ops-data.ts`).
- Host 측에는 자기 세션 in-flight AI job의 cancel/retry 흐름이 이미 존재(`front/features/host/aigen`).

### 4.2 깊이 목표

1. **실패 코드 드릴다운**: summary `failureCodes` 카운트 → 해당 코드가 영향 준 클럽/세션 목록으로 연결한다. 기존 jobs `errorCode` 필터를 재사용한다.
2. **비용/사용량 추세**: 현재 month-to-date 단일값 → 윈도우 추세로 확장한다. S8 analytics의 7/30/90일 윈도우·현재-대비-직전 델타 패턴을 재사용하고, **차트 라이브러리는 추가하지 않는다**.
3. **stale job 조치 깊이**: `FORCE_CANCEL`만 → host의 cancel/retry와 일관된 admin 시점 조치로 강화한다.
4. **연결성**: `/admin/health`·`/admin/audit`의 AI 신호 → `/admin/ai-ops` 드릴다운이 원인 → 조치로 끊기지 않고 이어진다.

### 4.3 Non-goals

- AI generation 상태머신 의미를 별도 implementation plan 없이 변경 금지.
- provider raw error, transcript body, 생성 결과 JSON 노출 금지.

### 4.4 Gate

- `/admin/health`·`/admin/audit` AI 신호에서 `/admin/ai-ops`로 드릴다운 시 원인·조치가 이어진다.
- admin write 조치는 originating 슬라이스에서 audit-ready다.
- 공통 하드닝 게이트(§6) 통과.

## 5. S9 — Host-surface Reinforcement

### 5.1 현재 코드 상태

S3 `AdminClubOperationsSnapshot` 계약은 현재 platform-admin feature 소유(`front/features/platform-admin/model/platform-admin-club-operations-model.ts`, `.../api/platform-admin-club-operations-api.ts`). Host에는 `front/features/host`에 `aigen`·`club`·`model`·`route`·`ui`가 존재한다.

### 5.2 Scope

- S3 club operations 신호 중 *host에 적절한 부분*을 host 화면에서 재사용한다.
- **선결**: 중립 계약 owner를 먼저 선정한다(platform-admin도 host도 아닌 shared 위치). admin·host 양방향 import cycle을 방지한다.

### 5.3 Non-goals

- admin 전용 운영 명령(support grant, notification replay 등)을 host로 이전 금지.
- host가 admin 역할을 대체하지 않는다.
- 신규 host CRUD 기능 끼워넣기 금지.

### 5.4 Gate

- 공유 계약이 admin·host 양쪽에서 import cycle 없이 동작(frontend boundary test 통과).
- host와 admin이 동일 신호를 동일 의미로 표시.
- 공통 하드닝 게이트(§6) 통과.

## 6. 공통 하드닝 게이트 (각 슬라이스 plan에 포함)

closeout 로드맵 §5를 상속한다. 슬라이스가 건드린 표면에 한해 적용한다.

- **일관성**: 카드·테이블·필터·badge 톤이 admin shell의 calm operating-ledger 톤과 일치.
- **접근성**: 키보드 포커스 순서, aria 라벨, 색 대비.
- **모바일**: desktop·mobile 레이아웃 모두 검증.
- **Empty/에러**: 데이터가 얇을 때 정직한 empty state, 안전한 실패 카피(provider raw error·private data 노출 금지).

## 7. S10 재평가 체크포인트 (결정 게이트)

S9 완료 후 판단한다: sanitized 운영 증거(S6·S9가 만든 fixture·문서)가 공개 포트폴리오에 쓸 만큼 쌓였는가?

- 충족 시에만 별도 spec으로 승격한다.
- 미충족 시 closeout 로드맵의 보류 권고를 유지한다.
- **이 charter 범위에서 S10을 빌드하지 않는다.**

## 8. 검증 & 릴리즈 안전 (슬라이스별)

closeout 로드맵 §10 게이트를 상속한다.

- Contract: server DTO · frontend type · fixture · E2E mock이 동일 필드명/shape.
- Authorization: OWNER/OPERATOR/SUPPORT/member/guest 동작을 슬라이스별 문서화.
- Public safety: private 운영/멤버 데이터가 응답·UI·docs·fixture로 새지 않음. placeholder·sanitized fixture만 사용.
- UI 검증: 각 READY 변화는 최소 1개 Playwright happy path + browser smoke/screenshot QA.
- Release readiness: 동작 변경 시 CHANGELOG `Unreleased`와 관련 운영 docs 갱신.
- Regression:
  - Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`.
  - Server: `./server/gradlew -p server unitTest`, 경계 이동 시 `architectureTest`.
  - Auth/BFF/user-flow 라우트: `pnpm --dir front test:e2e`.
  - Public release 영향: public release candidate checks.

### S6 minimum checks

- 실패 코드 드릴다운, 비용/사용량 추세, stale job 조치 서비스/모델 단위 테스트.
- 권한 거부 및 masked 응답 테스트.
- E2E: health/audit AI 신호 → `/admin/ai-ops` 드릴다운.

### S9 minimum checks

- 중립 계약 owner에 대한 frontend boundary test(import cycle 부재).
- host 화면이 S3 신호를 동일 의미로 표시하는 단위/라우트 테스트.
- E2E: host 표면에서 공유 운영 신호 렌더링.

## 9. Risks

| Risk | Where | Mitigation |
| --- | --- | --- |
| AI Ops가 raw provider error 노출 | S6 | masked 응답, 안전한 실패 카피 |
| 비용/추세가 인위적이거나 빈약 | S6 | 윈도우 델타 재사용, 정직한 empty state, 차트 라이브러리 미추가 |
| host/admin 계약 분기와 import cycle | S9 | 중립 계약 owner 선정 후 boundary test |
| admin 명령이 host로 새어 host가 admin 대체 | S9 | host는 read 재사용만, write 명령 비이전 |
| 하드닝이 전면 retrofit으로 번짐 | All | 슬라이스가 건드린 표면에 한해 적용 |
| 엄브렐라가 단일 거대 plan으로 뭉침 | All | 슬라이스별 독립 plan, 독립 머지/검증 |
| 공개 저장소 안전성 회귀 | All | 변경 파일 대상 public-safety 스캔 |

## 10. Next Step

charter 승인 후 **S6 AI Ops Depth implementation plan만** 작성한다(writing-plans). S6 plan은 S9/S10을 구현하지 않는다. S9는 current가 될 때 자기 spec/plan을 받고, S10은 §7 결정 게이트로만 남는다.
