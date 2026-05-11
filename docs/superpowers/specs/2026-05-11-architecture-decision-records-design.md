# Architecture Decision Records 도입 설계

상태: draft (작성자 검토 대기)
작성일: 2026-05-11
오너: docs / portfolio

## 목적

ReadMates에 이미 내려진 핵심 기술 의사결정을 표준 ADR(Architecture Decision Record) 포맷으로 backfill하고, 앞으로의 결정을 같은 포맷으로 기록할 수 있는 디렉토리·템플릿·인덱스를 만든다. 1순위 독자는 채용 담당자/시니어 면접관, 2순위 독자는 합류 후 코드를 읽게 될 동료 개발자다.

이 작업은 새로운 기능을 추가하지 않고, 이미 코드와 `docs/development/technical-decisions.md`에 분산된 결정을 ADR 형식으로 재구조화한다.

## 현재 맥락

`docs/development/technical-decisions.md`는 결정이 시간순/주제별로 흩어진 산문 형식이다. 강점:

- 모든 결정에 *what*, *why*, *trade-off*가 함께 적혀 있음 (technical-decisions.md 전반).
- 코드와 일치하는 사실만 기록한다는 규약이 명시됨 (technical-decisions.md:1-12).

약점 (포트폴리오 관점):

- 한 페이지 산문이라 "이 사람이 어떤 결정을 거쳤는가"를 30초 안에 스캔하기 어렵다.
- 각 결정의 **status**(accepted/superseded/deprecated)와 **date**, **context**가 명시되어 있지 않다.
- superseded된 결정(예: V24/V25에서 제거된 password column)이 보이지 않는다 → 학습/진화 시그널 손실.
- 향후 새 결정이 생겼을 때 어디에 어떤 형식으로 추가할지 명시되지 않았다.

## 결정

`docs/development/adr/` 디렉토리를 신설하고, 표준 MADR(Markdown Architecture Decision Record) 변형을 사용한다. 초기 10개 ADR을 backfill하고, 기존 `technical-decisions.md`는 ADR 인덱스로 리다이렉트(상단 안내 + 하단 결정 요약 표) 형태로 슬림화한다.

### 디렉토리 구조

```text
docs/development/adr/
  README.md                                  # 인덱스 + 작성 규약
  template.md                                # ADR 템플릿
  0001-cloudflare-pages-functions-bff.md
  0002-server-clean-architecture-with-archunit.md
  0003-frontend-route-first-architecture.md
  0004-transactional-outbox-with-kafka-relay.md
  0005-bff-shared-secret-with-rotation.md
  0006-server-side-hashed-session-cookie.md
  0007-mysql-with-flyway-over-alternatives.md
  0008-multi-club-domain-with-host-resolution.md
  0009-frontend-backend-contract-via-zod.md
  0010-public-repo-safety-automation.md
```

### ADR 템플릿

```markdown
# ADR-NNNN: <짧은 결정 제목>

- 상태: Accepted | Proposed | Superseded by ADR-NNNN | Deprecated
- 결정일: YYYY-MM-DD
- 작성자: <역할>
- 관련: ADR-NNNN, <코드 경로>, <문서 경로>

## 컨텍스트

(이 결정을 내려야 했던 상황. 어떤 제약, 요구사항, 시도가 있었는지. 코드 경로·실측치 인용.)

## 결정

(채택한 선택. 명사형으로 한 문단.)

## 근거

(왜 이 선택인가. 정량/정성 근거. trade-off가 무엇이고 왜 받아들였는가.)

## 대안

| 대안 | 기각 이유 |
|------|----------|
| ... | ... |

## 결과

긍정적:
- ...

부정적/감수한 비용:
- ...

## 검증

(이 결정이 의도대로 동작함을 어떻게 확인했는가. 테스트 명/명령/메트릭.)

## 후속 작업

- (이 결정이 열어둔 follow-up. 별도 ADR이 될 수 있는 항목.)
```

### 작성 규약

- 한 ADR = 한 결정. "여러 결정을 묶는 ADR"은 만들지 않는다 (인덱스가 ADR 그룹화 역할).
- **Superseded never deleted.** 결정이 뒤집히면 새 ADR을 만들고 기존 ADR의 상태를 `Superseded by ADR-NNNN`으로 갱신한다. 본문은 **수정하지 않는다** (당시 맥락 보존).
- ADR은 **사실**만 기록한다 — 미정 의견, 토론 중 사항, 향후 가설은 들어가지 않는다 (그건 spec/plan의 영역).
- 모든 코드 인용은 `path:line`. 인용한 라인은 작성 시점의 commit에서 검증되어야 한다.
- **Public repo safety**: 실제 secret, OCI OCID, 실명 회원 정보, 내부 호스트는 ADR에 적지 않는다. `.gitleaks.toml`이 통과해야 한다.

### 초기 10개 ADR — 한 줄 요약

| 번호 | 제목 | 상태 | 핵심 근거 |
|------|------|------|----------|
| 0001 | Cloudflare Pages Functions를 BFF로 채택 | Accepted | edge에서 cookie domain strip + 내부 헤더 제거 + zero-cost. 자체 reverse proxy 운영 회피. |
| 0002 | Server clean architecture + ArchUnit 강제 | Accepted | adapter↔application 경계를 컴파일 타임에 강제 (`ServerArchitectureBoundaryTest`). 신규 feature가 같은 구조를 따르도록 강제. |
| 0003 | Frontend route-first architecture | Accepted | 라우트가 데이터 흐름의 자연스러운 경계. `frontend-boundaries.test.ts`로 강제. shared/feature/app import 룰. |
| 0004 | Transactional outbox + Kafka relay (notification) | Accepted | mutation과 side effect 분리. `notification_event_outbox` → relay → consumer → SMTP/in-app inbox. PENDING/PUBLISHING/PUBLISHED/FAILED/DEAD state machine. |
| 0005 | BFF shared secret + multi-secret rotation | Accepted | `READMATES_BFF_SECRET` (primary) + `READMATES_BFF_SECRETS` (rotation candidates). `bff_secret_rotation_audit` table로 이력 보관. 무중단 회전. |
| 0006 | 서버 측 hashed session cookie (raw token 미저장) | Accepted | OAuth raw token 저장 회피. `HttpOnly` cookie + 서버측 hash. JWT 채택 안 함 (revoke·짧은 TTL 운영 부담). |
| 0007 | MySQL 8 + Flyway (Liquibase/Prisma migrate 기각) | Accepted | OCI MySQL HeatWave free tier 활용. 26개 버전 incremental migration. reversible pair 패턴 (V24 rename + V25 drop). |
| 0008 | Multi-club domain — host header + slug 우선순위 | Accepted | `X-Readmates-Club-Slug` (명시) > `X-Readmates-Club-Host` (도메인 alias). custom domain alias를 marker file로 health check. |
| 0009 | Frontend-backend contract test (Zod schema) | Accepted | `FrontendZodSchemaContractTest`가 server response shape ↔ frontend Zod schema 일치 강제. CI에서 `zod:export-fixtures` drift 검증. |
| 0010 | 공개 저장소 안전 자동화 (gitleaks + custom scanner) | Accepted | 운영 서비스 코드를 공개로 운영하기 위한 3단계 검증 (`build-public-release-candidate.sh` + `public-release-check.sh` + `verify-public-release-fixtures.sh`). |

각 ADR의 상세 본문은 plan에서 task별로 작성한다.

## 인덱스(README) 구성

`docs/development/adr/README.md`:

```markdown
# Architecture Decision Records

ReadMates의 주요 기술 의사결정을 기록한다. 새 결정을 내릴 때는 `template.md`를 복사해 다음 번호로 추가하고, 이 인덱스를 갱신한다.

작성 규약: <상단 spec 참조>

## 인덱스

| # | 제목 | 상태 | 결정일 | 영향 영역 |
|---|------|------|--------|----------|
| 0001 | Cloudflare Pages Functions BFF 채택 | Accepted | 2026-04-21 | front, security |
| ... |

## 상태 범례

- **Accepted** — 현재 코드/운영의 기준.
- **Proposed** — 작성 중. 코드 반영 전.
- **Superseded by ADR-NNNN** — 새 결정으로 대체. 본문은 보존.
- **Deprecated** — 더 이상 사용하지 않음. 후속 ADR 없음 (단순 폐기).
```

## 기존 `technical-decisions.md` 처리

전체 삭제하지 않는다. 다음과 같이 변형한다:

- 상단 안내 추가: "이 문서의 결정은 ADR 0001~0010으로 이관되었습니다. 새 결정은 `docs/development/adr/`에 ADR로 추가합니다."
- 본문은 ADR 인덱스 표(번호/제목/요약)만 남긴다. 산문 결정 내용은 ADR로 이전.
- `architecture.md`, `README.md`에서 `technical-decisions.md`로 가는 링크는 유지하되, 그 페이지가 ADR로 안내하도록.

## 비목표

- 새 기술 결정 도입. 이 작업은 backfill + 포맷 통일이다.
- ADR 작성 자동화 도구(예: adr-tools CLI) 도입. 첫 라운드에서는 마크다운만으로 충분.
- ADR을 영어로 번역. 기존 문서 톤(한글 기반)을 따른다.
- 코드 변경. ADR 작성 과정에서 코드 인용이 잘못된 경우에만 spec을 따로 만들어 별도 PR로 분리.

## 검증

작성 완료 시:

1. `docs/development/adr/` 디렉토리에 12개 파일(README, template, 0001~0010) 존재.
2. 각 ADR이 템플릿 섹션을 모두 포함 (상태/결정일/컨텍스트/결정/근거/대안/결과/검증/후속).
3. 모든 코드 인용(`path:line`)이 main 브랜치 commit에서 실재 — `grep`으로 확인.
4. `./scripts/public-release-check.sh` 통과 (gitleaks + targeted scanner).
5. `docs/development/README.md`에서 ADR 인덱스 링크 추가.
6. `technical-decisions.md` 상단에 ADR 안내 + 본문 슬림화 완료.
7. (선택) `docs/superpowers/` 인용을 통해 결정의 출처(spec/plan) 백트래킹 가능.

## 위험과 완화

| 위험 | 완화 |
|------|------|
| ADR이 산문 문서보다 *간결한 척하면서 정보가 누락*될 수 있음 | 각 ADR은 "기존 산문 + 추가된 컨텍스트/근거/대안" 합집합이어야 함. 단축이 아니라 재구조화. |
| 코드 인용 라인이 향후 코드 변화로 stale 됨 | 라인 인용 옆에 commit hash 또는 의미 단서를 함께 적어 라인이 바뀌어도 의미 추적 가능하게. ADR 자체는 결정 시점의 사실이므로 라인 drift는 후속 ADR을 만드는 트리거. |
| 첫 라운드에 결정 누락 (10개로 충분한가) | 인덱스에 "ADR 후보" 섹션을 두어 추가 후보(jOOQ adapter, OCI Compute 선택, public-release split 등)를 메모. follow-up. |
| ADR과 spec/plan의 경계 혼동 | 규약 명시: ADR = 사실/결과, spec = 의도/설계, plan = 실행. 한 결정이 진행 중이면 ADR Status는 `Proposed`. |
| `technical-decisions.md`를 참조하던 외부 링크가 깨짐 | 파일은 보존하고 상단 안내로 ADR로 안내. 파일 자체 삭제 금지. |

## 대안과 기각 사유

| 대안 | 기각 이유 |
|------|----------|
| 기존 `technical-decisions.md`만 더 잘 다듬기 | status/date/관계가 표현되지 않음. superseded 결정이 보이지 않음. 면접관 스캔성 떨어짐. |
| `docs/architecture/` 같은 별도 톱레벨 폴더 신설 | 이미 `docs/development/`가 개발자 문서 허브. 톱레벨 분산은 탐색성 저하. |
| ADR 한 파일에 모두 모으기 (`adr.md`) | "한 ADR = 한 파일" 규약이 supersession/cross-link/diff history 추적에 핵심. 한 파일 묶음은 ADR의 의미를 잃음. |
| 영어로 작성 | 기존 docs 톤(한글)과 어긋남. 포트폴리오 1순위 독자(국내 채용)에도 한글이 더 자연스러움. 다국어 ADR은 future. |
| adr-tools CLI 도입 | 새 의존성. 첫 10개에는 과잉. ADR이 100개 단위가 되면 재검토. |

## 후속(이 작업 범위 밖)

- ADR-0011 이후: jOOQ write adapter migration, OCI Compute over Cloud Run, Redis adoption (현재 optional), public-release split workflow 등.
- ADR diagram 자동 생성 (예: superseded chain을 graphviz로).
- ADR linter — Status, Date 누락이나 깨진 ADR-NNNN 참조 검출.
- 영어 번역 (해외 채용 라운드 대비).
