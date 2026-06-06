# ReadMates 구조·아키텍처 개선 로드맵 (강의 적용)

> **이 문서의 성격:** A~F 강의 트랙을 ReadMates의 **실측 코드 상태**에 매핑한 상위 로드맵입니다.
> 실행용 TDD 구현 문서는 트랙별로 분리합니다. 첫 구현 문서는 트랙 C입니다 →
> [`2026-06-06-readmates-server-coverage-implementation.md`](2026-06-06-readmates-server-coverage-implementation.md)

**작성 기준일:** 2026-06-06 · **base:** `origin/main..HEAD` 아닌 현재 `main` HEAD 기준 스냅샷

---

## 0. 핵심 전제 (실측으로 뒤집힌 가정)

처음 가정은 "강의로 아키텍처를 도입/개편한다"였으나, 코드 확인 결과 **구조는 이미 성숙**합니다. 따라서 이 로드맵은 *구조 리팩토링이 아니라 진행 중 이관의 마무리와 품질·운영 깊이 보강*입니다.

| 영역 | 실측 상태 | 출처 |
| --- | --- | --- |
| 서버 hexagonal 경계 | **완료** — 전 feature가 `adapter.in → application.port.in → service → port.out → adapter.out` 레이어 보유, ArchUnit 강제 | `ServerArchitectureBoundaryTest`, architecture.md §서버 내부 구조 |
| CQRS read/write 분리 | **완료** — write-side(`domain/` 보유) / read-side(`@ReadOnlyApplicationService`) 강제 | architecture.md §CQRS, server.md |
| 프론트 route-first 경계 | **완료** — `app → pages → features → shared`, `frontend-boundaries.test.ts` 강제 | architecture.md §프런트엔드 route-first |
| 프론트 TanStack Query 이관 | **완료** — 11개 영역 전부 done, 잔여는 "후속 후보"뿐 | server-state-migration.md |
| 프론트 `components/`→`ui/` 정리 | **완료** — 전 feature가 `ui/` 보유, legacy `components/` 없음 | `front/features/*` 실측 |
| **서버 단위 테스트 커버리지 게이트** | **갭** — 실제 LINE 커버리지는 `7340/19134 = 0.3836`이나 게이트는 **0.23**으로 stale. 0.40까지 약 314라인 추가 커버 필요 | `server/build.gradle.kts:299`, `server/build/reports/jacoco/test/jacocoTestReport.xml` |
| **운영 회복탄력성(Resilience4j)** | **갭** — `resilience4j` 의존/CB 타입 없음. 다만 Redis fail-open, cache metrics, `/admin/health` provider, Micrometer 기반 운영 카드가 이미 있어 "운영 인프라 전무"는 아님 | grep: `resilience4j` 0건, `RedisCacheMetrics`, `RedisHealthCardProvider` |
| **프론트 시각 회귀 인프라** | **갭** — Storybook/스토리/시각 스냅샷 없음. 단, admin/host/member/public E2E screenshot evidence는 이미 다수 존재하므로 갭은 "기초 시각 증거 없음"이 아니라 "component-level visual regression baseline 없음" | server-state-migration.md §후속 후보, `front/tests/e2e/*.spec.ts` |

**결론:** B·E의 "구조" 부분은 새로 할 게 거의 없음 → 실질 작업은 **C(테스트 게이트 현실화) → F(운영 resilience 고도화) → E(component-level 시각 회귀)** 순서. A는 단독 산출물이 아니라 전 트랙의 리뷰 렌즈.

---

## 1. 강의 → 갭 매핑

| 트랙 | 강의(courseId) | 적용 대상(실 파일/게이트) | 산출물 |
| --- | --- | --- | --- |
| **A 설계 렌즈** | 오브젝트 설계원칙편(336658), 기초편(334416), 리팩토링(328348), 헥사고날 Part1(336073) | 신규/변경 코드 리뷰 기준. 별도 PR 없음 | 리뷰 체크리스트(아래 §3) |
| **B 백엔드 구조** | 멀티모듈(337692), 토비 스프링부트(329974, 완강) | 잔여 미전환 slice 점검(대부분 완료) | 갭 발견 시 슬라이스별 PR |
| **C 서버 테스트** | Practical Testing(329295), Spring Boot TDD(335221) | `server/` JaCoCo gate 0.23 → 0.40+; 현재 측정 0.3836 | 동작 중심 model/service/adapter unit test + 게이트 상향 |
| **E 프론트 구조** | Storybook & CDD(334852), React 마스터 Part3(340369) | `front/shared/ui`와 route-owned UI의 component-level 시각 회귀 인프라 | `.storybook` 또는 Playwright component/story harness + 스냅샷 잡 |
| **F 운영** | Resilience4j CircuitBreaker(331673), 로그 관리(335763) | optional Redis/read-cache/rate-limit, domain marker HTTP check, provider/client boundaries | CB/fail-open policy 명문화 + metric/health/log correlation |

---

## 2. 실행 순서 (효율·효과 우선)

각 단계 = **독립 PR 1개**, 프로젝트 원칙(작은 회귀 표면)과 일치. 각 단계 끝에 `docs/development/release-readiness-review.md` 기준 점검.

### Phase C — 서버 단위 테스트 커버리지 (최우선, 첫 구현 문서)
- **왜 먼저:** 현재 coverage 자체는 0.3836이지만 게이트가 0.23으로 stale이라 회귀 차단력이 낮다. 0.40+로 올리려면 현재 denominator 기준 약 314 covered line이 더 필요하다.
- **방식:** `application/model`의 명시적 helper/계산 프로퍼티를 먼저 고정하되 DTO getter 테스트는 피한다. 이후 `InvitationService`, `MemberLifecycleService`, `PlatformAdminService`, `FeedbackDocumentService`, Redis/cache adapter, web mapper처럼 unit-suitable missed line을 측정 기반으로 추가한다.
- **검증:** `./server/gradlew -p server check` (JaCoCo 게이트 포함)
- **상세:** [server-coverage-implementation.md](2026-06-06-readmates-server-coverage-implementation.md)

### Phase F — 운영 회복탄력성/로그 (331673·335763)
- **대상:** optional outbound(`auth/publication/note/shared.adapter.out.redis` rate limit/cache/invalidation, `club.adapter.out.http` domain marker check)에 Resilience4j CircuitBreaker 또는 동등한 adapter-local failure policy를 **outbound port 뒤**에 적용. 기존 fail-open 정책은 유지하되 상태 전이를 actuator/Micrometer와 `/admin/health` card에서 관측 가능하게 만든다.
- **경계 주의:** application service는 CB 라이브러리 타입에 의존 금지 — adapter.out 안에서만. ArchUnit 경계 유지.
- **검증:** `./server/gradlew -p server check architectureTest` + health/provider 단위 테스트 + 필요한 경우 Redis adapter integration

### Phase E — 프론트 시각 회귀 인프라 (334852)
- **대상:** `front/shared/ui` primitive와 prop-driven feature `ui/`에서 시작한다. 기존 E2E screenshot evidence는 route smoke로 유지하고, 새 작업은 component/story 단위 baseline과 flake policy를 만든다.
- **검증:** `pnpm --dir front test` + `pnpm --dir front build` + CI 시각 회귀 잡. Storybook을 쓰면 dev/build command와 snapshot artifact path를 `docs/development/test-guide.md`에 함께 기록한다.

### 상시 — A 설계 렌즈
- 위 모든 PR의 코드 리뷰에 §3 체크리스트 적용. 별도 일정 없음.

---

## 3. A 설계 렌즈 — 리뷰 체크리스트

(오브젝트 설계원칙편 + 헥사고날 Part1을 ReadMates 경계 규칙으로 환산)

- [ ] 의존성 방향: 안쪽(application/domain)이 바깥쪽(adapter/framework)을 모르는가? (ArchUnit이 이미 강제 — 위반 시 테스트 실패)
- [ ] application service가 Spring Web/HTTP 타입을 던지지 않는가? feature application error로 던지고 `adapter.in.web`에서 매핑하는가?
- [ ] read-only service가 mutation port/`@Transactional`을 쓰지 않는가?
- [ ] 단일 책임: 한 클래스가 파싱+권한+영속성을 동시에 들지 않는가?
- [ ] 신규 outbound 의존(외부 HTTP/Redis/Kafka)이 port로 추상화되고 adapter로 분리되는가?
- [ ] 테스트가 데이터 클래스가 아니라 **동작(분기/계산/검증)**을 검증하는가?
- [ ] coverage gate를 올릴 때 DTO constructor line만 채워 숫자를 맞추지 않는가? JaCoCo는 지표이고, 우선순위는 회귀 가치다.
- [ ] 운영 resilience를 추가할 때 fail-open/fail-closed policy, metric label cardinality, public-safe log redaction이 함께 고정되는가?

---

## 4. 트랙별 검증 명령 (요약)

```bash
# C / F (서버)
./server/gradlew -p server check                 # unitTest + architectureTest + detekt + JaCoCo 게이트
./server/gradlew -p server architectureTest       # 경계 fast lane
./server/gradlew -p server unitTest jacocoTestReport

# E (프론트)
pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build
```

---

## 5. 남은 리스크 / 범위 밖

- **D(데이터/마이그레이션)** 트랙은 이번 스코프에서 제외. 스키마 변경이 나오면 그때 Flyway 규칙(`db/mysql/migration`)으로 끼워넣음.
- 강의 시청은 "완강"이 아니라 **트랙별 해당 unit만** 참조 — 풀 시청은 비효율.
- 이 로드맵은 2026-06-06 스냅샷. 실행 전 각 Phase 시작 시 해당 영역 코드/게이트 현황을 재확인(메모리·문서는 시점 고정값).
- C 단계의 가장 큰 리스크는 coverage gaming이다. 0.40을 못 넘겼다면 게이트를 임의로 0.40으로 올리지 말고, 측정치 -2pp baseline rule을 적용하거나 추가 unit-suitable 후보를 더 덮는다.
