# ReadMates Post–Admin vNext 고도화 엄브렐러

작성일: 2026-05-31
상태: APPROVED DESIGN SPEC

## 1. 배경

Admin vNext closeout(S8 → S6 → S9)가 실제 코드로 닫혔다. `front/features/platform-admin/model/admin-route-catalog.ts`의 모든 `/admin` 라우트가 `ready`이고, 마지막 `coming_soon`이던 `analytics`(S8)도 READY로 전환됐다. 운영 콘솔(`today`·`health`·`clubs`·`clubs/:clubId`·`notifications`·`ai-ops`·`support`·`audit`·`analytics`)은 한 흐름으로 동작한다.

이 문서는 closeout 이후 남은 고도화 작업을 **하나의 엄브렐러로 시퀀싱**한다. 기존 로드맵(`2026-05-30-readmates-admin-vnext-closeout-roadmap-design.md` 등)을 삭제하거나 덮어쓰지 않는다. 그 문서들은 historical/predecessor로 유지하고, 이 문서는 closeout 이후 실행 순서를 고정하는 용도다.

이 문서의 핵심 가치는 "기능 4개를 한 번에 구현"이 아니라 **순서·의존성·슬라이스 경계**를 고정하는 것이다. 각 슬라이스는 자기 implementation plan을 따로 갖고, 작게 유지된다.

## 2. 성공 기준

"화면 수가 늘었다"가 아니다.

- 이미 shipped된 표면 전반이 균일한 품질 기준에 도달한다.
- 분석 표면이 운영에 쓸 수 있는 깊이를 갖는다.
- 멤버/호스트 제품 경험이라는 새 표면이 **경계가 명확한 상태로** 열린다.
- 위가 갖춰진 뒤에야 공개 showcase를 다듬는다.
- 그 과정에서 admin과 host 표면이 의미상 갈라지지 않는다.

## 3. Source Documents

- 직전 closeout 로드맵: `docs/superpowers/specs/2026-05-30-readmates-admin-vnext-closeout-roadmap-design.md` (historical)
- Parent roadmap: `docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md` (historical)
- 아키텍처 source of truth: `docs/development/architecture.md`
- Frontend 가이드: `docs/agents/front.md`
- Server 가이드: `docs/agents/server.md`
- Design 가이드: `docs/agents/design.md`
- Docs 가이드: `docs/agents/docs.md`

## 4. 슬라이스 순서와 의존성

확정 순서: **H → A → M → P**

의존성 근거:

- **H(하드닝)를 먼저** 둔다. 이미 shipped된 admin(+host) 표면의 품질 베이스라인을 먼저 올려야, 그 위에 쌓거나 그것을 showcase하는 downstream 작업이 재작업 없이 진행된다.
- **A(분석 심화)는 그 다음.** 이미 shipped된 표면을 확장하는 작업이라 하드닝된 패턴을 재사용한다.
- **M(멤버/호스트)은 그 다음.** host 표면이 베이스라인을 물려받도록 H 이후에 둔다. 단, 이 슬라이스는 **이름과 경계만** 고정하고 상세 설계는 자체 brainstorm으로 분리한다(섹션 5.3).
- **P(S10 공개 포트폴리오)는 마지막.** 직전 로드맵이 S10을 "sanitized 운영 증거가 충분히 쌓인 뒤"로 명시적으로 미뤘다. 하드닝되고 깊어진 제품을 showcase하는 편이 현재 상태를 보여주는 것보다 강하다.

운영 흐름과의 관계: closeout 로드맵의 `상태 감지 → 원인 확인 → 조치/지원 → 기록/감사 → 리포트/분석` 흐름은 이미 채워졌다. 이 엄브렐러는 그 흐름의 **품질·깊이·공개 표현**을 닫는다.

## 5. 슬라이스 정의

### 5.1 H — 하드닝 베이스라인 스윕 (먼저)

Purpose: closeout 동안 슬라이스가 건드린 표면에만 적용됐던 품질 기준을, 이미 shipped된 모든 표면에 일관되게 적용한다.

Scope:

- **접근성**: 키보드 포커스 순서, aria 라벨, 색 대비를 admin 전 라우트와 host dashboard에서 점검·교정.
- **모바일**: desktop/mobile 레이아웃을 동일 표면에서 검증·교정.
- **Empty/에러**: 데이터가 얇을 때 정직한 empty state, 실패 카피는 안전(provider raw error·private data·token-shaped 예시 노출 금지).
- **일관성**: 카드·테이블·필터·badge 톤을 admin shell의 calm operating-ledger 톤과 정렬.
- **산출물**: 위 항목을 **문서화된 베이스라인 체크리스트**로 만들어 A/M/P의 공통 gate로 재사용한다.

Non-goals:

- 신규 기능 추가 금지.
- 일관성 교정을 넘어선 시각 재설계 금지.
- 전면 리라이트 금지(표면별 교정에 한정).

Gate:

- 베이스라인 체크리스트가 건드린 모든 라우트에서 통과한다.
- 체크리스트가 A/M/P가 참조할 수 있는 형태로 문서화된다.
- `pnpm --dir front lint` / `pnpm --dir front test` / `pnpm --dir front build` 통과.

### 5.2 A — 분석/리포팅 심화 (다음)

Purpose: 의도적으로 "lite"로 출시된 `/admin/analytics`를 운영에 쓸 수 있는 깊이로 만든다.

Current code state: `/admin/analytics`는 현재-대비-직전 윈도우 델타(7/30/90일)와 cross-club benchmark를 제공하고, 분모가 0이면 "데이터 부족" empty state를 정직하게 표기한다. 서버 슬라이스 `admin.analytics`(controller → service → JDBC adapter)는 원시 카운트만 집계하고 비율·델타·가용성 파생은 순수 application service에서 단위 테스트로 검증한다. 메트릭 계약은 `admin.analytics_overview.v1`.

Scope:

- 기존 KPI(활성 멤버·세션 완료율·RSVP rate·AI 비용/세션·알림 도달률)에 대한 **시계열 뷰**(현재-대비-직전 델타를 넘어선 추세).
- 분석 overview의 **CSV export**.

Non-goals:

- 실시간 스트리밍 대시보드 금지.
- 데이터가 얇을 때 가짜 차트 생성 금지("데이터 부족" 유지).
- live 운영 지표의 공개 노출 금지.
- 정당화되지 않은 무거운 차팅 인프라 도입 금지.

Gate:

- 데이터가 얇아도 "데이터 부족"이 정직하게 유지된다.
- 데이터 계약은 가능한 경우 S3 club operations·S5 notification 신호를 재사용한다.
- 메트릭 계약(`admin.analytics_overview.v1`) 또는 신규 계약 버전이 명시적으로 핀된다.
- H 베이스라인 체크리스트 통과.
- 서버 변경 시 `./server/gradlew -p server clean test` 통과, 프론트 lint/test/build 통과.

### 5.3 M — 멤버/호스트 제품 경험 (다음, 경계만 고정)

Purpose: closeout가 admin에 집중된 동안 상대적으로 손대지 않은 실제 사용자(멤버·호스트) 경험을 고도화할 **새 표면**을 연다.

이 엄브렐러에서의 처리: **이름과 경계만 고정**한다. 구체 기능 설계는 H/A 완료 후 **자체 brainstorm → spec → plan** 사이클로 분리한다. 이 슬라이스를 엄브렐러 안에서 끝까지 구체화하지 않는 이유는, 제품 요구가 아직 열려 있어 인라인 over-spec이 엄브렐러를 실행 불가능하게 만들기 때문이다.

경계(이 엄브렐러가 고정하는 것):

- Purpose: 멤버 리딩 경험 / 호스트 클럽 운영 흐름의 고도화.
- Dependencies: H 베이스라인 이후 시작(host 표면이 베이스라인을 물려받도록). S3 club-operations 중립 계약(`front/shared/model/club-operations.ts`)을 host 측에서 재사용하는 S9 패턴을 따른다.

Non-goals:

- admin 전용 운영 명령(support grant, notification replay 등)을 host/멤버로 이전 금지.
- 신규 host CRUD를 끼워 넣기 금지.
- 엄브렐러 안에서의 인라인 over-spec 금지.

Gate:

- 코드 착수 전 **자체 spec이 존재**한다.
- admin↔host 공유 계약이 양방향 import cycle 없이 동작한다(frontend boundary test 통과).
- host와 admin이 동일 신호를 동일 의미로 표시한다.
- H 베이스라인 체크리스트 통과.

### 5.4 P — S10 공개 포트폴리오 폴리시 (마지막)

Purpose: 하드닝되고 깊어진 제품을 리뷰어/공개 대상에게 showcase한다.

Scope:

- sanitized 운영 증거를 `docs/showcase/` 세트로 정리·폴리시.
- 리뷰어 대상 진입 경험 정리(예: README의 "How to Review This Project" 흐름 보강).

Non-goals:

- 실 멤버 데이터·secret·live 운영 지표·private 도메인/경로·OCID·token-shaped 예시 노출 금지.
- 새 운영 기능을 showcase 명목으로 끼워 넣기 금지.

Gate:

- public release 스크립트 통과: `./scripts/build-public-release-candidate.sh` 후 `./scripts/public-release-check.sh .tmp/public-release-candidate`.
- H 베이스라인 체크리스트 통과.

## 6. Cross-cutting 하드닝 Gate

H는 **첫 슬라이스이면서 동시에 상시 gate**다. closeout 로드맵에서 하드닝을 독립 슬라이스가 아니라 각 슬라이스 gate에 붙였던 패턴을 그대로 계승한다. 차이는, 이번에는 H가 한 번 베이스라인 스윕을 수행해 **문서화된 체크리스트**를 만들고, A/M/P가 그 체크리스트를 자기 gate에 명시적으로 포함한다는 점이다.

공통 체크(H 산출물):

- 일관성 — admin shell calm operating-ledger 톤 정렬.
- 접근성 — 키보드 포커스 순서, aria 라벨, 색 대비.
- 모바일 — desktop/mobile 레이아웃 검증.
- Empty/에러 — 정직한 empty state, 안전한 실패 카피.

## 7. 아키텍처 원칙

- `docs/development/architecture.md`를 source of truth로 따른다.
- 가능한 경우 S3 club-operations·S5 notification 계약을 재사용하고 신규 인프라를 최소화한다.
- admin↔host 경계 테스트를 보존한다(직접 import 차단).
- 서버 슬라이스는 controller → service → adapter 경계와 application-service-owned `@Transactional` 정책을 유지한다.
- 공개 저장소 안전을 전 슬라이스에서 지킨다.

## 8. 검증 (슬라이스 공통)

각 슬라이스는 건드린 표면에 해당하는 최소 검증을 실행한다:

- Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`
- Server: `./server/gradlew -p server clean test`
- E2E / auth·BFF 변경 시: `pnpm --dir front test:e2e`
- 공개 릴리즈(P 또는 공개 표면 변경): `./scripts/build-public-release-candidate.sh` → `./scripts/public-release-check.sh .tmp/public-release-candidate`

CHANGELOG `Unreleased` 갱신과 release-readiness 검토(`docs/development/release-readiness-review.md`)는 각 슬라이스 완료 시 적용한다.

## 9. 범위 밖 / 후속

- M의 구체 기능 설계는 이 문서 범위 밖이며, 자체 brainstorm으로 분리한다(섹션 5.3).
- 멀티 클럽 도메인 확장, 관측성/SLO 추가 심화 등은 이 엄브렐러 범위 밖이며 필요 시 별도 재평가한다.
