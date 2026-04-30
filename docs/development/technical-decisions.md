# 주요 기술적 의사결정

이 문서는 ReadMates의 현재 구조에서 반복해서 참고해야 하는 기술 선택과 그 배경을 정리합니다. 상세 구현 경계는 [architecture.md](architecture.md)를, 로컬 실행과 운영 변수는 [local-setup.md](local-setup.md)와 [../deploy/README.md](../deploy/README.md)를 기준으로 합니다.

## 결정 문서의 범위

- 현재 코드, 테스트, 배포 문서와 맞는 결정만 기록합니다.
- 과거 계획 문서의 맥락은 참고할 수 있지만 현재 동작의 기준으로 삼지 않습니다.
- 운영 secret, 실제 멤버 데이터, private deployment state, DB dump, 로컬 절대 경로, OCI OCID는 예시에 넣지 않습니다.
- 각 결정은 "무엇을 선택했는가", "왜 선택했는가", "어떤 trade-off를 감수했는가"를 함께 남깁니다.
- 새 결정을 추가하거나 기존 결정을 바꾸면 관련 문서와 검증 명령도 함께 갱신합니다.
- Cloudflare, OCI, Google, GitHub처럼 외부 서비스의 한도, 가격, UI, API 동작은 바뀔 수 있으므로 운영 판단 전에 현재 공식 문서나 콘솔에서 재확인합니다. 재확인하지 않았다면 문서에 현재 기준으로 단정하지 않습니다.

## Cloudflare Pages Functions를 BFF로 둔다

**결정:** 브라우저가 직접 Spring API origin을 신뢰하지 않고, 같은 origin의 Cloudflare Pages Functions BFF를 통해 `/api/bff/**`, `/oauth2/**`, `/login/oauth2/**` 요청을 전달합니다.

**이유:** SPA, API 호출, OAuth 시작과 callback을 public demo origin 기준으로 정렬할 수 있습니다. 브라우저에는 API origin과 BFF secret을 노출하지 않고, Pages Functions가 upstream Spring `/api/**`로 요청을 전달하면서 `X-Readmates-Bff-Secret`과 cookie를 관리합니다.

**Trade-off:** Cloudflare Pages Functions와 Spring의 환경 변수가 동시에 맞아야 하며, 로컬 개발에서는 Vite proxy가 같은 구조를 흉내 내야 합니다. OAuth redirect URI, app base URL, allowed origin이 어긋나면 인증 흐름이 바로 깨지므로 배포 runbook에서 함께 점검합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#요청-흐름), [../deploy/cloudflare-pages.md](../deploy/cloudflare-pages.md), `pnpm --dir front test:e2e`

## Google OAuth와 서버 측 session cookie를 사용한다

**결정:** 운영 로그인은 Google OAuth를 사용하고, 로그인 성공 후 Spring이 `readmates_session` cookie를 발급합니다. 서버는 raw token이 아니라 hash를 `auth_sessions`에 저장합니다.

**이유:** invite-only 멤버십 서비스에서 자체 비밀번호 운영 부담을 줄이고, 세션 revoke와 membership 상태 반영은 서버에서 통제합니다. Cookie는 `HttpOnly`, `SameSite=Lax`, production `Secure` posture를 사용해 브라우저 JavaScript가 session token을 직접 다루지 않게 합니다.

**Trade-off:** OAuth provider 설정과 callback proxy가 서비스 가용성에 포함됩니다. 비밀번호 로그인과 비밀번호 재설정 경로는 운영 경로에서 제외되어 `410 Gone` stub으로 남기므로, 문서와 UI는 Google OAuth 중심으로 유지해야 합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#인증과-세션), [local-setup.md](local-setup.md#dev-login-흐름), `./server/gradlew -p server clean test`

## BFF secret과 Origin/Referer 검증을 함께 둔다

**결정:** Spring은 `/api/**` 요청에서 `X-Readmates-Bff-Secret`을 검증하고, mutating method인 `POST`, `PUT`, `PATCH`, `DELETE`에는 허용된 `Origin` 또는 `Referer`도 요구합니다.

**이유:** BFF를 통과한 요청과 브라우저에서 발생한 state-changing 요청을 함께 확인하기 위해서입니다. BFF secret은 Cloudflare Pages Functions와 Spring runtime 설정에만 있고, `VITE_` 또는 `NEXT_PUBLIC_` 변수로 만들지 않습니다.

**Trade-off:** preview, local, production 환경마다 secret과 allowed origin 설정을 분리해야 합니다. 설정 누락은 API 실패로 드러나므로 배포 체크리스트와 E2E가 함께 필요합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#bff-보안-경계), [../deploy/README.md](../deploy/README.md#bff-신뢰-경계), `pnpm --dir front test:e2e`

## MySQL과 Flyway를 source of truth로 둔다

**결정:** 세션, 멤버십, 기록, 피드백 문서, 알림 상태의 최종 권위는 MySQL schema와 Flyway migration에 둡니다.

**이유:** ReadMates의 핵심 데이터는 운영자가 회차를 열고 닫고 발행하는 상태 전환, 참석 여부, 권한 있는 문서 열람처럼 일관성이 중요한 데이터입니다. 상태 전환과 공개 범위를 DB에 남겨야 서버와 프론트엔드가 같은 source of truth를 바라볼 수 있습니다.

**Trade-off:** schema 변경은 migration과 regression test가 필요합니다. Redis, Kafka, 이메일 발송 같은 주변 계층은 MySQL 상태를 보조하거나 전파할 뿐, MySQL을 대체하지 않습니다.

**관련 문서와 검증:** [architecture.md](architecture.md#세션-lifecycle과-공개-범위), [test-guide.md](test-guide.md), `./server/gradlew -p server clean test`

## Redis는 optional 보조 계층으로만 사용한다

**결정:** Redis는 기본 비활성화이며, 켜더라도 rate limit counter, auth session metadata cache, public/notes read-through cache, read-cache invalidation에만 사용합니다.

**이유:** Redis 장애나 cache 유실이 서비스의 핵심 데이터 손실로 이어지지 않게 하기 위해서입니다. Cache decode 실패 또는 Redis 오류가 발생하면 best-effort 정리 후 MySQL fallback을 사용합니다.

**Trade-off:** Redis를 켜도 모든 조회가 항상 빨라지는 구조는 아닙니다. Source of truth를 MySQL에 유지하므로 invalidation과 fallback 경로를 함께 테스트해야 합니다. Redis key와 metric label에는 raw session token, 초대 token 원문, BFF secret, OAuth code, private feedback document body, 이메일, 표시 이름을 넣지 않습니다.

**관련 문서와 검증:** [architecture.md](architecture.md#optional-redis-계층), [test-guide.md](test-guide.md#redis-backed-server-features), targeted Redis adapter tests

## 세션 lifecycle과 공개 범위를 서버에서 확정한다

**결정:** `sessions.state`는 `DRAFT`, `OPEN`, `CLOSED`, `PUBLISHED` 운영 단계를 구분하고, `sessions.visibility`는 `HOST_ONLY`, `MEMBER`, `PUBLIC` 공개 범위의 DB source of truth입니다.

**이유:** 정기 독서모임 운영에는 예정 세션, 현재 참여 세션, 닫힌 기록, 발행된 공개 기록이 동시에 존재합니다. 상태와 공개 범위를 분리해야 호스트가 여러 예정 세션을 준비하면서도 클럽당 하나의 현재 `OPEN` 세션만 유지하고, 닫힌 기록을 검토한 뒤 발행할 수 있습니다.

**Trade-off:** route별 조회 조건이 복잡해집니다. Public surface, member archive, notes feed, upcoming sessions가 각각 다른 상태와 공개 범위를 사용하므로 서버 contract와 프론트엔드 모델을 같이 맞춰야 합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#세션-lifecycle과-공개-범위), `pnpm --dir front test`, `./server/gradlew -p server clean test`

## 역할 기반 권한과 문서 접근 제어를 분리한다

**결정:** `게스트`, `둘러보기 멤버`, `정식 멤버`, `호스트`의 route/API 권한을 분리하고, 피드백 문서는 참석 여부와 host 권한을 별도로 검증합니다.

**이유:** 초대 없이 Google로 로그인한 사용자는 일부 멤버 공개 정보를 읽을 수 있지만 쓰기와 참석자 전용 문서 열람은 제한되어야 합니다. 피드백 문서는 공개 기록보다 민감하므로 membership status만으로 열지 않고 참석 상태를 확인합니다.

**Trade-off:** 같은 화면에서도 read-only, locked, unavailable state를 구분해야 합니다. API authorization과 UI guard가 엇갈리면 사용자는 버튼을 보지만 서버에서 거절당하는 경험을 하므로 route loader와 server test를 함께 관리합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#멤버십과-역할-모델), [architecture.md](architecture.md#피드백-문서-흐름), `pnpm --dir front test:e2e`

## 알림은 transactional outbox와 Kafka relay/consumer로 처리한다

**결정:** 알림 이벤트는 먼저 MySQL `notification_event_outbox`에 저장하고, relay scheduler가 Kafka topic으로 발행합니다. Kafka consumer는 수신자와 선호도를 계산해 `notification_deliveries`와 `member_notifications`를 만듭니다.

**이유:** 세션 발행, 피드백 문서 공개, 서평 공개 같은 domain mutation과 알림 생성 시점을 분리하되, 이벤트 발생 사실은 MySQL transaction 안에 남기기 위해서입니다. 이메일 발송은 retryable side effect로 `notification_deliveries`에 남기고, in-app 알림은 `member_notifications`를 source of truth로 사용합니다.

**Trade-off:** 운영해야 할 상태가 `PENDING`, `PUBLISHING`, `PUBLISHED`, `FAILED`, `DEAD`처럼 늘어납니다. 대신 호스트 알림 운영 화면, retry/restore API, Prometheus metrics로 실패를 추적하고 복구할 수 있습니다.

**관련 문서와 검증:** [architecture.md](architecture.md#이메일-알림-멤버-알림함-호스트-운영), [../deploy/oci-backend.md](../deploy/oci-backend.md#email-notification-operations), `./server/gradlew -p server test --tests 'com.readmates.notification.*'`

## 프론트엔드는 route-first 구조를 따른다

**결정:** React Router route module이 loader/action, API 호출, 모델 조립, UI props assembly를 담당합니다. Feature는 가능한 범위에서 `api`, `model`, `route`, `ui` 책임으로 나눕니다.

**이유:** 인증 상태, 역할별 접근, 세션 상태에 따라 화면 데이터가 달라지는 앱에서는 route 단위가 데이터 흐름의 자연스러운 경계입니다. UI는 props와 callback만 받아 렌더링하게 두면 권한, fetch, redirect 판단이 presentation component로 번지는 것을 줄일 수 있습니다.

**Trade-off:** route module이 얇은 page보다 더 많은 책임을 가집니다. 그래서 feature 간 직접 import, shared-to-app import, UI layer의 API import 같은 경계를 unit test로 확인합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#프런트엔드-route-first-경계), [test-guide.md](test-guide.md#frontend), `pnpm --dir front test`

## 서버는 feature 단위 clean architecture로 점진 전환한다

**결정:** 전환된 서버 API surface는 `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence` 방향을 따릅니다.

**이유:** Spring controller가 persistence detail이나 `JdbcTemplate`에 직접 묶이면 권한 검증, transaction orchestration, retryable side effect 처리가 route별로 흩어집니다. Inbound/outbound port를 두면 web, scheduler, Kafka adapter가 같은 application service를 호출할 수 있습니다.

**Trade-off:** 작은 기능에도 파일 수가 늘어납니다. 아직 전환되지 않은 legacy surface와 공존하므로, 새 기능이나 전환된 slice에서는 boundary test가 허용하는 방향을 기준으로 확장합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#서버-내부-구조), `./server/gradlew -p server clean test`

## 공개 릴리즈 후보를 별도 scan한다

**결정:** 공개 저장소로 내보낼 후보는 `scripts/build-public-release-candidate.sh`로 별도 tree를 만든 뒤 `scripts/public-release-check.sh`로 scanner를 실행합니다.

**이유:** 이 저장소는 포트폴리오 공개를 전제로 하지만, 개발 과정에는 private path, deployment state, token-shaped 예시, 실제 멤버 데이터가 섞일 위험이 있습니다. 공개 후보를 별도로 만들고 scanner를 돌리면 현재 작업 tree와 공개 배포물을 분리해서 검증할 수 있습니다.

**Trade-off:** 공개 릴리즈 전 단계가 하나 늘어납니다. 대신 README, docs, scripts, deploy runbook이 public-safe placeholder 정책을 유지하는지 반복적으로 확인할 수 있습니다.

**관련 문서와 검증:** [../deploy/security-public-repo.md](../deploy/security-public-repo.md), [../../scripts/README.md](../../scripts/README.md), `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`
