# ReadMates OCI Free Tier Compose Stack 설계

작성일: 2026-04-30
상태: REVIEW READY DESIGN SPEC
문서 목적: Oracle Cloud Always Free 단일 VM에서 ReadMates 운영 비용을 0원으로 유지하면서 Caddy, Spring Boot, Redis, Redpanda Kafka-compatible broker를 Docker Compose stack으로 운영하는 최종 구조와 전환 전략을 정의한다.

## 1. 배경

ReadMates 운영 백엔드는 현재 OCI Compute VM에서 Spring Boot JAR를 systemd로 실행하고, Caddy가 HTTPS 요청을 받아 `127.0.0.1:8080`으로 reverse proxy한다. v1.3.0에는 Redis 기반 cache/rate-limit 계층과 Kafka 기반 알림 파이프라인이 optional 기능으로 추가됐지만, 운영에서는 아직 Redis/Kafka 기능 flag가 꺼져 있다.

사용자 목표는 월 비용 0원 유지다. 2026-04-30 기준 Oracle 공식 문서상 Always Free A1 Compute는 총 4 OCPU와 24 GB memory를 유연하게 나눠 쓸 수 있고, Block Volume은 boot volume과 block volume 합산 200 GB까지 Always Free 범위에 포함된다. 반면 OCI Streaming은 Kafka-compatible endpoint를 제공하지만 Free Tier에서 운영되는 서비스가 아니므로, 무료 유지 목표와는 맞지 않는다.

따라서 최종 구조는 managed Redis/managed Kafka가 아니라, Always Free A1 VM 안에서 Docker Compose로 Redis와 Redpanda를 직접 운영한다. 레거시 제약이 없다면 reverse proxy인 Caddy도 compose stack에 포함해 배포 단위를 하나로 묶는다.

공식 참고:

- OCI Always Free resources: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>
- OCI Streaming Kafka compatibility: <https://docs.oracle.com/iaas/Content/Streaming/Tasks/kafkacompatibility.htm>
- OCI Streaming FAQ: <https://www.oracle.com/middleeast/cloud/streaming/faq/>

## 2. 목표

- Caddy, Spring Boot API, Redis, Redpanda를 하나의 Docker Compose stack으로 운영한다.
- public internet에 노출되는 서비스는 Caddy의 80/443뿐으로 제한한다.
- Spring Boot, Redis, Redpanda는 compose internal network에서만 접근하게 한다.
- Redis는 실제 rate limit, auth session cache, public/notes cache 기능에 단계적으로 적용한다.
- Redpanda는 Kafka notification pipeline의 저사용량 broker로 제한 운영한다.
- systemd는 개별 Spring Boot process가 아니라 compose stack을 부팅, 정지, 재시작하는 역할만 맡는다.
- 새 VM 재현, rollback, health smoke, 로그 확인 절차를 단순화한다.
- 운영 문서와 스크립트에는 private IP, secret, 운영 도메인, OCI resource identifier를 남기지 않는다.

## 3. 비목표

- MySQL을 compose stack 안으로 옮기지 않는다.
- OCI managed Redis, OCI Streaming, managed Kafka를 1차 운영 목표로 삼지 않는다.
- Kubernetes, Nomad, Docker Swarm 같은 orchestrator를 도입하지 않는다.
- Cloudflare Pages frontend 배포 방식을 바꾸지 않는다.
- Redis를 MySQL의 source of truth로 바꾸지 않는다.
- Kafka/Redpanda를 알림 외의 범용 이벤트 버스로 확대하지 않는다.
- 무중단 blue-green 배포까지 1차 범위에 포함하지 않는다.

## 4. 핵심 결정

### 4.1 최종 운영 단위

최종 구조:

```text
systemd
  -> docker compose stack
       -> caddy
       -> readmates-api
       -> redis
       -> redpanda
```

Compose stack은 단일 VM에서 하나의 운영 단위로 올라간다. systemd unit은 VM 부팅 시 stack을 `up -d`하고, 정지 시 `down` 또는 `stop`을 수행한다. 운영자는 `docker compose ps`, `docker compose logs`, `docker compose restart <service>`로 상태를 본다.

### 4.2 Caddy 포함

레거시가 없다는 전제에서는 Caddy도 compose에 넣는다. 리소스 오버헤드는 무료 플랜 판단에 영향을 줄 수준이 아니다. Caddy를 compose에 넣는 이유는 배포 재현성, 네트워크 경계 명확화, 운영 명령 통일성이 더 크기 때문이다.

Caddy는 host의 80/443 포트를 bind한다. 인증서와 Caddy runtime data는 named volume에 저장한다. stack을 잘못 내리면 reverse proxy도 내려가므로 systemd 자동 복구와 volume 보존을 필수 운영 조건으로 둔다.

### 4.3 Redis 우선 적용

Redis는 실제 사용자 경험과 서버 보호에 바로 가치가 있으므로 Kafka보다 먼저 켠다. 적용 순서는 다음과 같다.

1. `READMATES_REDIS_ENABLED=true`
2. `READMATES_RATE_LIMIT_ENABLED=true`
3. `READMATES_AUTH_SESSION_CACHE_ENABLED=true`
4. `READMATES_PUBLIC_CACHE_ENABLED=true`
5. `READMATES_NOTES_CACHE_ENABLED=true`

Redis 장애 시 기본 정책은 MySQL fallback 또는 fail-open이다. 기능별 flag를 끄면 MySQL-only 동작으로 돌아갈 수 있어야 한다.

### 4.4 Redpanda 제한 운영

Kafka 사용량은 아주 낮다고 가정한다. Redpanda는 단일 노드, 1 core, 작은 memory budget으로 제한한다. Kafka-compatible endpoint는 compose internal network의 `redpanda:9092`만 Spring Boot에 제공한다.

알림은 MySQL `notification_event_outbox`가 source of truth다. Redpanda 장애가 생겨도 도메인 이벤트 row는 DB에 남아야 하며, broker가 복구된 뒤 relay가 재시도한다.

### 4.5 VM 크기

권장 VM 크기는 Always Free 한도 안의 `2 OCPU / 12 GB memory`다. 현재처럼 `1 OCPU / 6 GB memory`에서도 저사용량이면 가능하지만, Spring Boot JVM, Caddy, Redis, Redpanda, OS page cache를 함께 고려하면 여유가 작다.

저장소는 최소 50 GB boot volume으로 시작할 수 있다. Redpanda data, Redis AOF, Docker images, logs가 쌓이므로 장기 운영 전에는 Always Free 200 GB 한도 안에서 boot volume 확장 또는 별도 block volume 부착을 검토한다.

## 5. Compose 구성

### 5.1 서비스

```text
caddy
  image: caddy
  public ports: 80, 443
  volumes: caddy-data, caddy-config, Caddyfile
  upstream: readmates-api:8080

readmates-api
  image: readmates-server:<version>
  env_file: /etc/readmates/readmates.env
  expose: 8080
  depends_on: redis, redpanda
  healthcheck: /internal/health

redis
  image: redis:7.4-alpine
  command: redis-server --appendonly yes
  expose: 6379
  volume: redis-data
  healthcheck: redis-cli ping

redpanda
  image: docker.redpanda.com/redpandadata/redpanda:<pinned-version>
  mode: single node
  expose: 9092
  volume: redpanda-data
  resource profile: 1 core, small memory
```

Host에 직접 publish되는 port는 Caddy의 `80:80`, `443:443`뿐이다. Redis와 Redpanda는 host public interface에 publish하지 않는다. 운영자가 host에서 진단할 필요가 있으면 `docker compose exec redis redis-cli ping`이나 `docker compose exec redpanda rpk cluster health`를 사용한다.

### 5.2 네트워크

Compose default network를 사용하되, 서비스 간 이름 기반 통신만 허용한다.

```text
caddy -> readmates-api:8080
readmates-api -> redis:6379
readmates-api -> redpanda:9092
```

Spring Boot의 운영 env:

```bash
READMATES_REDIS_URL=redis://redis:6379
READMATES_KAFKA_BOOTSTRAP_SERVERS=redpanda:9092
```

### 5.3 Volume

필수 named volume:

```text
caddy-data
caddy-config
redis-data
redpanda-data
```

`caddy-data`에는 인증서와 ACME state가 들어가므로 삭제하면 TLS 재발급이 필요하다. `redis-data`와 `redpanda-data`는 재생성 가능한 계층이지만, 운영 장애와 메시지 유실을 줄이기 위해 정기 백업 또는 최소한 volume 보존 정책을 둔다.

## 6. 배포 흐름

### 6.1 최초 VM 준비

최초 준비는 아래 작업으로 제한한다.

- Docker Engine 설치
- Docker Compose plugin 설치
- `readmates` 운영 사용자와 `/opt/readmates` 디렉터리 준비
- `/etc/readmates/readmates.env` 생성
- `/opt/readmates/compose.yml`, `/opt/readmates/Caddyfile` 배치
- `readmates-stack.service` systemd unit 등록

### 6.2 애플리케이션 배포

권장 배포 흐름:

```text
local build
  -> server test
  -> docker image build
  -> image transfer or registry push
  -> VM compose file/env preflight
  -> DB backup
  -> docker compose up -d
  -> Flyway/app startup 확인
  -> local health smoke
  -> Cloudflare BFF smoke
  -> OAuth start smoke
```

초기에는 registry 없이 `docker save`/`docker load`로 VM에 이미지를 전달해도 된다. 장기적으로는 GitHub Container Registry 같은 registry를 쓰면 rollback과 tag 관리가 더 단순해진다.

### 6.3 Rollback

Rollback 기준은 image tag다.

```text
readmates-server:v1.3.1
readmates-server:v1.3.0
```

문제가 생기면 compose env의 image tag를 이전 버전으로 돌리고 `docker compose up -d readmates-api`를 실행한다. Flyway migration이 이미 적용된 뒤에는 DB schema backward compatibility가 필요하므로, release 전 migration risk review와 DB backup은 필수다.

## 7. 전환 전략

운영 중인 서비스를 한 번에 모두 바꾸면 장애 원인 분리가 어렵다. 최종 구조는 Caddy 포함 compose지만, 실제 전환은 세 단계로 한다.

### 7.1 Stage 1: Compose 인프라 검증

- Docker/Compose 설치
- Redis와 Redpanda compose 기동
- public port가 열리지 않았는지 확인
- Spring Boot는 기존 systemd JAR 유지
- Redis/Kafka endpoint 연결 smoke

이 단계는 compose runtime, volume, resource 사용량을 먼저 검증한다.

### 7.2 Stage 2: Spring Boot compose 전환

- Spring Boot Dockerfile 추가
- `readmates-api` compose service 추가
- Caddy는 임시로 host 유지하거나 maintenance window에서 함께 전환한다.
- `/internal/health`, BFF, OAuth smoke 확인
- 기존 `readmates-server` systemd service는 disable한다.

### 7.3 Stage 3: Caddy compose 전환

- host Caddy를 stop/disable한다.
- compose `caddy`가 80/443을 bind한다.
- Caddy data/config volume 보존을 확인한다.
- Cloudflare Pages BFF, OAuth redirect, public club route를 smoke한다.
- `readmates-stack.service`를 enable한다.

최종 상태에서는 host Caddy와 host Spring Boot systemd service가 운영 traffic을 받지 않는다.

## 8. 오류 처리와 복구

### 8.1 Redis 장애

Redis가 죽거나 timeout이면:

- rate limit은 기본 fail-open
- auth session cache는 MySQL fallback
- public/notes cache는 MySQL fallback
- 운영자는 Redis 기능 flag를 끄고 앱만 재시작할 수 있다.

`READMATES_REDIS_ENABLED=false`는 가장 넓은 rollback switch다.

### 8.2 Redpanda 장애

Redpanda가 죽으면 Kafka relay/consumer가 실패할 수 있다. 이때 알림 이벤트의 source of truth는 MySQL outbox다.

- publish 실패 row는 `FAILED` 또는 retry 상태로 남는다.
- broker 복구 뒤 relay가 재시도한다.
- 장기 장애 시 `READMATES_KAFKA_ENABLED=false` 또는 `READMATES_NOTIFICATIONS_ENABLED=false`로 알림 worker만 끈다.

### 8.3 Caddy 장애

Caddy container가 내려가면 public traffic이 중단된다.

복구 기준:

- `systemctl restart readmates-stack`
- `docker compose up -d caddy`
- Caddy volume이 남아 있는지 확인
- TLS certificate 재발급 rate limit에 걸리지 않도록 `caddy-data` 삭제를 피한다.

### 8.4 Compose stack 장애

Compose stack 전체가 내려가면 앱 전체가 중단된다. systemd unit은 boot 시 자동 기동하고, 실패 시 재시작 정책을 둔다. 서비스별 container에는 `restart: unless-stopped` 또는 운영 정책에 맞는 restart policy를 둔다.

## 9. 보안

- public ingress는 Caddy 80/443만 허용한다.
- Spring Boot, Redis, Redpanda port는 host public interface에 publish하지 않는다.
- Redis password는 단일 VM internal network만 쓰는 1차 구성에서는 필수로 두지 않아도 되지만, future-proofing을 위해 requirepass 또는 ACL 도입 여지를 남긴다.
- `/etc/readmates/readmates.env`는 VM에서만 관리하고 Git에 넣지 않는다.
- compose 파일에는 secret 값을 넣지 않는다.
- Caddyfile에는 공개 가능한 placeholder domain만 문서화한다.
- Docker socket은 앱 컨테이너에 mount하지 않는다.
- container image tag는 mutable `latest` 대신 release tag 또는 commit sha를 쓴다.

## 10. 운영 관측

필수 운영 명령:

```bash
docker compose ps
docker compose logs --tail=200 readmates-api
docker compose logs --tail=200 caddy
docker compose exec redis redis-cli ping
docker compose exec redpanda rpk cluster health
curl -fsS http://127.0.0.1/internal/health
```

Spring Boot actuator management endpoint를 local-only로 유지한다. Prometheus나 외부 APM은 1차 범위에 넣지 않는다. 우선은 container healthcheck, application health, DB Flyway history, notification operations 화면으로 운영 상태를 본다.

## 11. 테스트와 검증

구현 전후 최소 검증:

- `./server/gradlew -p server clean test`
- `./server/gradlew -p server bootJar`
- Docker image build on ARM-compatible target
- compose config validation
- Redis `PING`
- Redpanda cluster health
- Spring `/internal/health`
- Cloudflare Pages BFF `/api/bff/api/auth/me`
- OAuth start redirect URI smoke
- public club route smoke
- notification outbox pending/published count 확인

문서와 public repo 검증:

- `git diff --check -- <changed-docs>`
- public-safety scan for real IPs, private domains, OCIDs, secrets, token-shaped values
- public release candidate scanner는 release 작업에서 실행한다.

## 12. 구현 산출물

예상 변경 파일:

```text
deploy/oci/compose.yml
deploy/oci/Caddyfile
deploy/oci/readmates-stack.service
deploy/oci/04-install-docker.sh
deploy/oci/05-deploy-compose-stack.sh
server/Dockerfile
docs/deploy/oci-backend.md
docs/deploy/compose-stack.md
.env.example
```

파일명은 구현 시 기존 deploy script naming과 충돌하지 않게 조정할 수 있다. 단, 기존 JAR 배포 흐름을 즉시 삭제하지 않고 rollback path로 남긴다.

## 13. 성공 기준

- 새 VM에서 Docker/Compose와 env만 준비하면 Caddy, Spring Boot, Redis, Redpanda가 한 stack으로 올라간다.
- public port는 80/443만 열린다.
- Spring Boot는 Redis와 Redpanda를 compose service name으로 연결한다.
- Redis 기능 flag를 켠 뒤 기존 auth, public club, notes flow가 정상 동작한다.
- Kafka/Redpanda를 켠 뒤 알림 outbox 이벤트가 publish되고 consumer가 delivery ledger를 갱신한다.
- Caddy TLS, Cloudflare BFF, OAuth redirect smoke가 통과한다.
- 문제가 생기면 이전 image tag 또는 기능 flag로 되돌릴 수 있다.

## 14. 남는 리스크

- 단일 VM 구성이라 VM 장애는 전체 서비스 장애다.
- Redpanda는 Redis보다 memory와 disk 부담이 크다. 저사용량 설정, log retention, volume monitoring이 필요하다.
- Flyway migration 이후에는 image rollback만으로 DB schema를 되돌릴 수 없다.
- Caddy까지 compose에 넣으면 stack 장애 시 reverse proxy도 같이 중단된다.
- OCI Always Free capacity는 region 상황에 따라 resize 또는 새 instance 생성이 실패할 수 있다.

이 리스크는 비용 0원 목표를 유지하기 위해 받아들이는 trade-off다. 트래픽이나 알림 중요도가 올라가면 managed Redis, OCI Streaming 또는 별도 VM 분리로 운영 단계를 올린다.
