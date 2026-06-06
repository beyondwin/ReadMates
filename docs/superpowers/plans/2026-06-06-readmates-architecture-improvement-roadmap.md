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
| **서버 단위 테스트 커버리지** | **갭** — JaCoCo LINE 게이트 **0.23**(baseline 0.2504), 프론트 87%와 극단적 비대칭 | `server/build.gradle.kts:299` |
| **운영 회복탄력성(Resilience4j)** | **갭** — CircuitBreaker 전혀 미사용(optional Redis는 fail-open만) | grep: `resilience4j` 0건 |
| **프론트 시각 회귀 인프라** | **갭** — Storybook/스냅샷 없음, 이관 문서의 1순위 후속 후보 | server-state-migration.md §후속 후보 |

**결론:** B·E의 "구조" 부분은 새로 할 게 거의 없음 → 실질 작업은 **C(테스트) → F(운영) → E(시각 회귀)** 순서. A는 단독 산출물이 아니라 전 트랙의 리뷰 렌즈.

---

## 1. 강의 → 갭 매핑

| 트랙 | 강의(courseId) | 적용 대상(실 파일/게이트) | 산출물 |
| --- | --- | --- | --- |
| **A 설계 렌즈** | 오브젝트 설계원칙편(336658), 기초편(334416), 리팩토링(328348), 헥사고날 Part1(336073) | 신규/변경 코드 리뷰 기준. 별도 PR 없음 | 리뷰 체크리스트(아래 §3) |
| **B 백엔드 구조** | 멀티모듈(337692), 토비 스프링부트(329974, 완강) | 잔여 미전환 slice 점검(대부분 완료) | 갭 발견 시 슬라이스별 PR |
| **C 서버 테스트** | Practical Testing(329295), Spring Boot TDD(335221) | `server/` JaCoCo 0.23 → 0.40+ | 슬라이스별 단위 테스트 + 게이트 상향 |
| **E 프론트 구조** | Storybook & CDD(334852), React 마스터 Part3(340369) | `front/shared/ui` 시각 회귀 인프라 | `.storybook` + 스토리 + 스냅샷 잡 |
| **F 운영** | Resilience4j CircuitBreaker(331673), 로그 관리(335763) | `shared.adapter.out.redis`, `club.adapter.out.http` | CB config + 메트릭 + 로그 정책 |

---

## 2. 실행 순서 (효율·효과 우선)

각 단계 = **독립 PR 1개**, 프로젝트 원칙(작은 회귀 표면)과 일치. 각 단계 끝에 `docs/development/release-readiness-review.md` 기준 점검.

### Phase C — 서버 단위 테스트 커버리지 (최우선, 첫 구현 문서)
- **왜 먼저:** 단일 최대 품질 리스크(23% vs 프론트 87%). 인프라 0, 순수 단위 테스트만으로 게이트 상향 가능.
- **방식:** 미테스트 `application/model/` 25개(가장 쌈) → integration으로만 커버되는 service에 mocked-port 단위 테스트 추가.
- **검증:** `./server/gradlew -p server check` (JaCoCo 게이트 포함)
- **상세:** [server-coverage-implementation.md](2026-06-06-readmates-server-coverage-implementation.md)

### Phase F — 운영 회복탄력성/로그 (331673·335763)
- **대상:** optional outbound(`shared.adapter.out.redis` rate limit/cache, `club.adapter.out.http` domain marker check)에 Resilience4j CircuitBreaker를 **outbound port 뒤**에 적용. 기존 fail-open 정책 유지하되 상태 전이를 actuator/Micrometer로 노출.
- **경계 주의:** application service는 CB 라이브러리 타입에 의존 금지 — adapter.out 안에서만. ArchUnit 경계 유지.
- **검증:** `./server/gradlew -p server check architectureTest` + actuator endpoint 테스트

### Phase E — 프론트 시각 회귀 인프라 (334852)
- **대상:** `front/shared/ui` primitive부터 Storybook 스토리 + Playwright 스냅샷 회귀. 이관 문서 §후속 후보 1순위.
- **검증:** `pnpm --dir front test` + CI 시각 회귀 잡

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

---

## 4. 트랙별 검증 명령 (요약)

```bash
# C / F (서버)
./server/gradlew -p server check                 # unitTest + architectureTest + detekt + JaCoCo 게이트
./server/gradlew -p server architectureTest       # 경계 fast lane

# E (프론트)
pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build
```

---

## 5. 남은 리스크 / 범위 밖

- **D(데이터/마이그레이션)** 트랙은 이번 스코프에서 제외. 스키마 변경이 나오면 그때 Flyway 규칙(`db/mysql/migration`)으로 끼워넣음.
- 강의 시청은 "완강"이 아니라 **트랙별 해당 unit만** 참조 — 풀 시청은 비효율.
- 이 로드맵은 2026-06-06 스냅샷. 실행 전 각 Phase 시작 시 해당 영역 코드/게이트 현황을 재확인(메모리·문서는 시점 고정값).
