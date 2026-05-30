# Admin vNext S6→S9 Closeout 엄브렐러 (Slice C · D · E)

작성일: 2026-05-31
상태: APPROVED DESIGN SPEC

## 1. 성격 & 기존 문서 관계

이 스펙은 새 로드맵·새 설계를 만들지 않는 **얇은 closeout 엄브렐러**다. S6/S9 실행이 P1·T2·T3까지 진행된 상태에서, **남은 슬라이스(C·D)의 시퀀싱과 마지막 release-readiness 점검(E)** 만 묶어 S6→S9를 닫는 실행 계약이다.

두 상위 문서를 SSOT로 **링크만** 한다 — 내용을 재서술하지 않는다. 차이가 생기면 상위 문서가 우선한다.

- **시퀀싱/원칙 source**: `docs/superpowers/specs/2026-05-30-admin-vnext-closeout-execution-charter-design.md` (이하 charter)
- **C·D 구현 설계 source**: `docs/superpowers/specs/2026-05-30-admin-vnext-s6-aiops-depth-s9-host-reinforcement-design.md` (이하 S6/S9 스펙) §5.3(Slice C)·§5.4(Slice D)

이 스펙이 *새로* 추가하는 것은 두 가지뿐이다:
1. 남은 슬라이스의 **C → D → E 실행 시퀀싱**.
2. **Slice E (closeout release-readiness 리뷰 리포트)** 정의.

charter §10과 S6/S9 스펙 §3의 원칙을 그대로 상속한다: **하나의 스펙 → 슬라이스별 독립 implementation plan**. 단일 거대 plan으로 뭉치지 않는다.

## 2. 진행 기준선 (검증된 현황)

- **S6 P1** AI Ops 실패 코드 드릴다운 — 머지됨 (`bffecbd2`).
- **Slice A (S6-T2)** 비용/사용량 윈도우 추세 — 머지됨 (`463101c4`).
- **Slice B (S6-T3)** admin retry-commit — 머지됨 (`3b340470`).
- **Slice C (S6-T4)** 표면 연결성 — 미착수. 설계는 S6/S9 스펙 §5.3.
- **Slice D (S9)** Host-surface 보강 — 미착수. 설계는 S6/S9 스펙 §5.4.
- **Slice E** closeout release-readiness 리뷰 — 미착수. 이 스펙 §4에서 신규 정의.

## 3. 슬라이스 구성 & 실행 순서 (확정)

```text
Slice C (S6-T4) 표면 연결성      → S6/S9 스펙 §5.3 상속 (health/audit → ai-ops 딥링크)
Slice D (S9)    Host-surface 보강 → S6/S9 스펙 §5.4 상속 (중립 club-ops 계약 + boundary test)
Slice E (신규)  Closeout 점검     → origin/main..HEAD release-readiness 리뷰 리포트
  ── 실행 순서: C → D → E ──
```

- charter §3 순서(S6 → S9)를 상속한다. C·D는 S6/S9 스펙이 정의한 내용 그대로 구현하고 서로 독립 머지·검증한다. E는 C·D가 머지된 누적 브랜치를 점검한다.
- 각 슬라이스는 자기 implementation plan을 받고 독립적으로 머지·검증 가능하다.
- 스펙 승인 후 **첫 plan은 Slice C만** 작성한다. D·E는 current가 될 때 자기 plan을 받는다(charter §10).
- cross-cutting 하드닝(§5)은 슬라이스가 *건드린 표면에 한해* 각 plan의 gate에 첨부한다. 전면 retrofit이 아니다.

## 4. Slice E 정의 — Closeout release-readiness 리뷰 (이 스펙의 유일한 신규 설계)

목표: S6 깊이 완주(P1·T2·T3·C)와 S9(D)가 누적된 브랜치를 닫기 전에, 잔여 운영·릴리즈 리스크를 정직하게 점검하고 기록한다. **버전 태그/릴리즈는 하지 않는다.**

- **입력 범위**: `origin/main..HEAD` 누적분. 최신 implementation plan 하나로 범위를 한정하지 않는다(AGENTS.md residual-risk 규칙). 점검 시점에 머지된 S6 P1·T2·T3 + Slice C·D를 포함한다.
- **점검 룰**: `docs/development/release-readiness-review.md` 를 SSOT로 사용한다. 최소한 다음을 다룬다:
  - CHANGELOG `Unreleased` 정합(동작 변경이 빠짐없이, 공개 안전하게 기록).
  - CI/deploy 스크립트 변경의 영향.
  - operator-facing 동작 변경(권한·audit·복구 전이 등).
  - security-code 위생(masked 응답, provider raw error/transcript/member email 비노출).
  - architecture-test 베이스라인/예외(슬라이스 경계 이동 시).
  - 공개 저장소 릴리즈 안전(`scripts/build-public-release-candidate.sh` → `scripts/public-release-check.sh`).
- **산출물**: `docs/superpowers/reports/2026-MM-DD-admin-vnext-s6-s9-closeout-readiness.md`.
  - 룰 항목별 **통과 / 면책(객관적 이유) / 스킵(이유)** 을 명시한다. 실행하지 못한 검증은 통과로 적지 않는다.
  - 잔여 리스크와 follow-up 후보를 목록화한다.
- **갭 처리**: 사소한 갭(문서·copy·작은 마무리)은 인라인 수정한다. 큰 갭은 별도 follow-up plan으로 분리해 리포트에 링크한다 — 이 슬라이스에서 새 기능을 끼워 넣지 않는다.
- **연결**: 이 리포트는 charter §7 **S10 재평가 결정 게이트**의 입력이 된다. 이 스펙 범위에서 **S10을 빌드하지 않는다.**
- **Non-goals**: 버전 bump·태그·GitHub Release, 새 기능, C·D 설계 재정의, S10 빌드.

## 5. 공통 하드닝 게이트 (charter §6 / S6/S9 스펙 §7 상속, 건드린 표면 한정)

- **일관성**: 카드·테이블·필터·badge 톤이 admin shell의 calm operating-ledger 톤과 일치.
- **접근성**: 키보드 포커스 순서, aria 라벨, 색 대비.
- **모바일**: desktop·mobile 레이아웃 모두 검증.
- **Empty/에러**: 데이터가 얇을 때 정직한 empty state, 안전한 실패 카피(provider raw error·private data 비노출).

## 6. 계약 안전 & 공개 안전 (모든 슬라이스, charter §8 상속)

- server DTO · frontend type · fixture · E2E mock이 동일 필드명/shape.
- provider raw error, transcript body, 생성 결과 JSON, raw member email은 응답·UI·docs·fixture 어디에도 노출하지 않는다. placeholder·sanitized fixture만 사용한다.
- Slice C·D의 admin/host 동작은 originating 슬라이스에서 audit·권한 동작을 문서화한다.

## 7. 검증 & 릴리즈 안전 (슬라이스별 minimum checks)

공통 회귀:

- Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`.
- Server: `./server/gradlew -p server clean test`, 경계 이동 시 `architectureTest`.
- Auth/BFF/user-flow 라우트: `pnpm --dir front test:e2e`.
- 동작 변경 시 CHANGELOG `Unreleased`와 관련 운영 docs 갱신.

슬라이스별:

- **C**: health/audit AI 신호 → ai-ops 드릴다운 e2e. 필터 round-trip(원인→조치). 필터 적용 후 빈 결과는 정직한 empty state. 신규 서버 계약 보강 시 안전 metadata projection 범위 검증.
- **D**: 중립 계약에 대한 frontend boundary test(import cycle 부재). host 화면이 S3 신호를 동일 의미로 표시하는 단위/route 테스트. host 표면에서 공유 운영 신호 렌더링 e2e. host-scoped projection(자기 클럽만, admin 전용 신호 제외) 검증.
- **E**: release-readiness 룰 항목별 통과/면책 기록. 공개 릴리즈 후보 스캔(`build-public-release-candidate.sh` → `public-release-check.sh`). CHANGELOG `Unreleased` 정합 확인.

## 8. Risks

| Risk | Where | Mitigation |
| --- | --- | --- |
| 엄브렐라가 단일 거대 plan으로 뭉침 | All | 슬라이스별 독립 plan, 독립 머지/검증 (charter §10) |
| 이 스펙이 C·D 설계를 재서술해 상위 스펙과 drift | C·D | 재서술 금지, S6/S9 스펙 §5.3/§5.4 링크만, 충돌 시 상위 우선 |
| Slice E가 리뷰를 넘어 새 기능/릴리즈로 번짐 | E | 종착=리뷰 리포트만, 버전 태그/릴리즈 비포함, 큰 갭은 follow-up 분리 |
| 실행하지 못한 검증을 통과로 기록 | E | 통과/면책/스킵을 이유와 함께 명시, 스킵은 통과로 적지 않음 |
| AI Ops가 raw provider error/transcript 노출 | C | masked 응답, 안전 실패 카피, fixture public-safety 스캔 |
| host/admin 계약 분기와 import cycle | D | 중립 계약 owner 선정 후 boundary test |
| admin 명령이 host로 새어 host가 admin 대체 | D | host는 read 재사용만, write 명령 비이전 |
| 하드닝이 전면 retrofit으로 번짐 | All | 슬라이스가 건드린 표면에 한해 적용 |
| 공개 저장소 안전성 회귀 | All | 변경 파일 대상 public-safety 스캔 |

## 9. Next Step

스펙 승인 후 **Slice C (S6-T4 표면 연결성) implementation plan만** 작성한다(writing-plans). Slice C plan은 D·E를 구현하지 않는다. D·E는 current가 될 때 각자 plan을 받는다. S10은 charter §7 결정 게이트로만 남으며 이 스펙 범위에서 빌드하지 않는다.
