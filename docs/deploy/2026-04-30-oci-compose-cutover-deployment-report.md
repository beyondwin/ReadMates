# 2026-04-30 OCI Compose Cutover 배포 보고서

이 문서는 ReadMates backend runtime을 Oracle Cloud Always Free 단일 VM의 Docker Compose stack으로 전환한 과정과, 전환 중 발생한 Cloudflare Pages BFF `401` 문제를 어떻게 원인 분석하고 해결했는지 정리한 운영 보고서입니다.

실제 운영 IP, secret, private DB host, OCID, token 값은 기록하지 않습니다. 아래의 `<VM_PUBLIC_IP>`, `<api-origin>`, `<bff-secret>` 같은 값은 placeholder입니다.

## 최종 결과

최종 backend runtime은 OCI VM에서 systemd가 Docker Compose stack을 관리하는 형태입니다.

```text
public internet
  -> Caddy container: 80/443
  -> readmates-api container: 8080, compose internal only
  -> redis container: compose internal only
  -> redpanda container: compose internal only
```

Cloudflare Pages production은 같은 origin의 BFF/OAuth proxy 함수를 제공하고, Spring API는 `X-Readmates-Bff-Secret`으로 Pages Functions 경계를 검증합니다.

완료 시점 검증 결과:

- OCI Compose stack: `caddy`, `readmates-api`, `redis`, `redpanda` 실행 중
- `readmates-api`: Docker healthcheck healthy
- direct API health: `https://<api-origin>/internal/health`가 `200`
- Cloudflare Pages BFF: `https://readmates.pages.dev/api/bff/api/auth/me`가 `200`
- OAuth start: `https://readmates.pages.dev/oauth2/authorization/google`가 `302`
- production integration smoke: Pages marker와 OAuth `redirect_uri` 확인 통과
- public release candidate scan: 통과

최종 반영 commit:

```text
0504e99 fix deploy bff secret handling
```

## 배포 전 확인한 제약

이번 작업의 중요한 제약은 다음과 같았습니다.

- public ingress는 Caddy의 `80/443`만 열고 Spring Boot, Redis, Redpanda는 compose internal network에 둡니다.
- 운영 IP, secret, private DB host, OCID, token-shaped 값은 Git이나 문서에 남기지 않습니다.
- 실제 VM cutover 전에는 DB backup, rollback path, smoke command가 준비됐는지 확인합니다.
- Cloudflare Pages Functions는 `front/functions`까지 같이 배포되어야 합니다.
- `READMATES_API_BASE_URL`은 Spring API의 공개 HTTPS origin입니다.
- `READMATES_BFF_SECRET`은 Cloudflare Pages Functions와 Spring runtime이 공유하는 secret입니다.

## 시작 상태

설계와 구현 계획은 이미 main에 반영된 상태였습니다.

- 설계 문서 commit: `06904e7`
- 구현 계획 문서 commit: `1a45cb7`
- 배포 직전 main 기준 commit: `6338f36`

VM에는 legacy runtime이 남아 있었습니다.

- legacy `readmates-server` systemd service
- host Caddy service
- rollback용 JAR
- `/etc/readmates/readmates.env`
- 최근 DB backup

Docker와 Compose는 처음에는 VM에 없었고, 배포 중 `deploy/oci/04-install-docker.sh`로 설치했습니다.

## 사전 검증

cutover 전에 로컬과 VM에서 다음을 확인했습니다.

로컬:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar
docker build -t readmates-server:local server
READMATES_SERVER_IMAGE=readmates-server:local docker compose -f deploy/oci/compose.yml config
pnpm --dir front test --run tests/unit/cloudflare-bff.test.ts tests/unit/cloudflare-oauth-proxy.test.ts
pnpm --dir front lint
pnpm --dir front build
```

VM:

```bash
systemctl status readmates-server
systemctl status caddy
test -f /etc/readmates/readmates.env
test -f /opt/readmates/readmates-server.jar
ls /var/backups/readmates/mysql
```

확인한 운영 조건:

- `/etc/readmates/readmates.env`는 VM에 존재했습니다.
- 최근 DB backup이 있었습니다.
- rollback용 legacy JAR가 있었습니다.
- VM memory와 disk headroom이 충분했습니다.

## CADDY_SITE 결정

보고 당시 장기 운영용 custom DNS zone이 바로 준비되어 있지 않았습니다.

확인한 내용:

- 운영자가 사용할 custom DNS zone을 아직 확정하지 않았습니다.
- 장기 운영용 API host는 별도 DNS 준비 후 전환하기로 했습니다.
- VM public IP 기반의 임시 HTTPS host를 만들 수 있는 상태였습니다.

그래서 cutover에는 임시 API origin으로 `<VM_PUBLIC_IP>.sslip.io`를 사용했습니다.

이 선택의 이유:

- Caddy가 Let's Encrypt 인증서를 발급받으려면 public HTTPS host가 필요합니다.
- `sslip.io`는 IP 기반 hostname을 DNS로 해석해 주므로, 별도 zone 없이 임시 HTTPS origin을 만들 수 있습니다.
- 장기 운영용 custom domain은 별도 DNS 준비 후 전환하는 것이 맞습니다.

중요한 점:

- 실제 `CADDY_SITE` 값은 Git에 쓰지 않습니다.
- VM에서는 `/etc/readmates/caddy.env`에서 확인합니다.
- 문서에는 `<api-origin>` 또는 `https://api.example.com` 같은 placeholder만 씁니다.

## Cutover 수행

배포는 legacy host service를 중지하고 compose stack으로 전환하는 방식이었습니다.

수행한 주요 단계:

1. 로컬에서 `readmates-server:local` Docker image를 빌드했습니다.
2. image를 VM으로 전송하고 Docker에 load했습니다.
3. VM에 compose runtime 파일을 설치했습니다.
   - `/opt/readmates/compose.yml`
   - `/opt/readmates/Caddyfile`
   - `/etc/systemd/system/readmates-stack.service`
   - `/etc/readmates/caddy.env`
   - `/opt/readmates/.env`
4. legacy `readmates-server`와 host `caddy`를 stop/disable했습니다.
5. `readmates-stack` systemd service를 enable/start했습니다.

전환 직후 stack은 다음 구성으로 올라왔습니다.

- `caddy:2-alpine`
- `readmates-server:local`
- `redis:7.4-alpine`
- `docker.redpanda.com/redpandadata/redpanda:v24.3.7`

초기 smoke에서 direct API health와 Redis/Redpanda health는 정상으로 확인됐습니다.

## 첫 번째 문제: Caddy access log에 BFF secret header가 남음

전환 후 Caddy 로그를 확인하는 과정에서 request header에 포함된 `X-Readmates-Bff-Secret`이 access log에 남는 것을 확인했습니다.

이 문제의 의미:

- `X-Readmates-Bff-Secret`은 Cloudflare Pages Functions와 Spring API 사이의 신뢰 경계입니다.
- 이 값이 log, terminal output, model context, monitoring system에 남으면 secret으로서 신뢰할 수 없습니다.
- 따라서 단순히 로그 필터만 추가하는 것으로는 부족하고, 기존 secret을 폐기하고 회전해야 합니다.

첫 조치:

```caddyfile
log {
	output stdout
	format filter {
		wrap console
		request>headers>Authorization delete
		request>headers>Cookie delete
		request>headers>X-Readmates-Bff-Secret delete
	}
}
```

이후 code review에서 추가 지적이 있었습니다.

헤더만 지우면 OAuth callback의 `code`, `state`, invite token, return target 같은 민감 query 값이 request URI에 남을 수 있습니다. 그래서 최종적으로 request URI 전체도 access log에서 제거했습니다.

최종 Caddy log filter:

```caddyfile
log {
	output stdout
	format filter {
		wrap console
		request>uri delete
		request>headers>Authorization delete
		request>headers>Cookie delete
		request>headers>X-Readmates-Bff-Secret delete
	}
}
```

같은 방어를 rollback용 legacy Caddy 생성 경로인 `deploy/oci/02-configure.sh`에도 반영했습니다. 이유는 장애 시 legacy host Caddy로 되돌아갔을 때 같은 로그 노출 문제가 재발하면 안 되기 때문입니다.

## 두 번째 문제: Cloudflare Pages BFF가 `401` 반환

secret 회전 후 `https://readmates.pages.dev/api/bff/api/auth/me`가 `401`을 반환했습니다.

처음에는 로그인 세션 문제처럼 보일 수 있지만, 실제 원인은 세션이 아니었습니다.

왜 세션 문제가 아니었는지:

- `/api/auth/me`는 anonymous 상태도 `200`으로 응답할 수 있는 endpoint입니다.
- `401`은 Spring controller 이전의 `BffSecretFilter`에서 발생할 수 있습니다.
- API container 내부에서 자기 환경변수의 `READMATES_BFF_SECRET`을 header로 넣어 `http://127.0.0.1:8080/api/auth/me`를 호출하면 `200`이 나왔습니다.

따라서 문제는 다음 둘 중 하나였습니다.

1. Cloudflare Pages Functions가 Spring과 다른 BFF secret을 보내고 있음
2. Cloudflare Pages가 바라보는 public API origin이 self-test한 API container와 다름

## 원인 분석 방법

secret 값을 직접 출력하지 않고 확인해야 했기 때문에, 임시 진단은 길이와 hash prefix만 사용했습니다.

진단 원칙:

- secret 원문은 출력하지 않습니다.
- hash prefix만 비교합니다.
- public debug endpoint는 원인 확인 후 반드시 제거합니다.

임시로 Pages Function에 확인한 값:

- `READMATES_API_BASE_URL`에 fallback query가 있는지
- BFF secret 길이
- BFF secret SHA-256 prefix
- 해당 secret으로 upstream `/api/auth/me`를 호출한 status

진단 결과:

- Pages Functions는 길이 64의 BFF secret을 가지고 있었습니다.
- 하지만 VM Spring runtime의 secret과 hash가 달랐습니다.
- Pages Function이 그 secret으로 upstream을 호출하면 `401`이었습니다.
- API container 내부에서 자기 secret으로 호출하면 `200`이었습니다.

따라서 핵심 원인은 Cloudflare Pages와 Spring runtime의 BFF secret 불일치였습니다.

## 왜 secret이 불일치했는가

문제 해결 중 임시 workaround로 `READMATES_API_BASE_URL`에 `?__readmatesBffSecret=<secret>` 형태의 fallback을 넣고, Pages Functions 코드가 이 query parameter를 `READMATES_BFF_SECRET`보다 먼저 읽도록 만든 적이 있었습니다.

이 방식은 두 가지 이유로 잘못된 방향이었습니다.

1. secret이 URL에 들어갑니다.
   - URL은 dashboard, log, terminal, proxy, browser tooling에 남기 쉽습니다.
   - secret 전달 경로로 적합하지 않습니다.

2. fallback 값이 dedicated `READMATES_BFF_SECRET`을 가립니다.
   - Cloudflare Pages의 `READMATES_BFF_SECRET`을 다시 설정해도, 코드가 `READMATES_API_BASE_URL` query 값을 먼저 읽으면 stale 값이 계속 사용될 수 있습니다.
   - 길이는 64로 같아도 실제 byte 값은 다를 수 있습니다.

그래서 최종 해결은 fallback을 살리는 것이 아니라 제거하는 것이었습니다.

## 최종 해결

### 1. secret을 새 값으로 회전

기존에 로그에 노출된 secret은 폐기해야 하므로 새 64자리 hex secret을 생성했습니다.

반영 위치:

- Cloudflare Pages production secret: `READMATES_BFF_SECRET`
- Spring runtime env: `/etc/readmates/readmates.env`의 `READMATES_BFF_SECRET`

그리고 `READMATES_API_BASE_URL`은 다시 origin만 갖도록 정리했습니다.

```text
READMATES_API_BASE_URL=https://<api-origin>
READMATES_BFF_SECRET=<bff-secret>
```

중요한 점:

- `READMATES_API_BASE_URL`에는 query string이나 fragment를 넣지 않습니다.
- BFF secret은 URL이 아니라 secret binding/env var로만 전달합니다.

### 2. Pages Functions 코드 정리

`front/functions/_shared/proxy.ts`에 API base URL을 정규화하는 helper를 추가했습니다.

```ts
export function apiBaseUrlFromEnv(env: { READMATES_API_BASE_URL: string }) {
  const apiBaseUrl = new URL(env.READMATES_API_BASE_URL);
  apiBaseUrl.search = "";
  apiBaseUrl.hash = "";
  return apiBaseUrl;
}
```

이유:

- 운영자가 실수로 query/hash가 붙은 URL을 넣어도 upstream request에는 origin만 사용합니다.
- secret이나 내부 파라미터가 upstream URL 구성에 섞이지 않게 합니다.

BFF secret helper는 dedicated binding만 읽도록 했습니다.

```ts
export function bffSecretFromEnv(env: { READMATES_BFF_SECRET?: string }) {
  const directSecret = env.READMATES_BFF_SECRET?.trim();
  if (directSecret) {
    return directSecret;
  }

  return null;
}
```

이유:

- secret source를 하나로 고정해야 운영자가 rotation 결과를 예측할 수 있습니다.
- `READMATES_API_BASE_URL` query fallback 같은 우회 경로가 있으면 stale secret이 계속 쓰일 수 있습니다.

반영된 call site:

- `front/functions/api/bff/[[path]].ts`
- `front/functions/oauth2/authorization/[[registrationId]].ts`
- `front/functions/login/oauth2/code/[[registrationId]].ts`

### 3. 임시 debug endpoint 제거

원인 확인에 사용했던 `__debugBffEnv=1` 처리 코드는 제거했습니다.

이유:

- secret length, hash prefix, upstream status는 운영자가 보기에는 유용하지만 public endpoint로 남아 있으면 설정 oracle이 됩니다.
- 운영 진단 코드는 사건 종료 후 제거하는 것이 맞습니다.

제거 후 `?__debugBffEnv=1` 요청은 더 이상 debug 응답을 반환하지 않고, 일반 `/api/auth/me` request로 처리됩니다.

### 4. Caddy log filter 강화

최종 Caddy access log 정책:

- request URI 기록 안 함
- `Authorization` request header 기록 안 함
- `Cookie` request header 기록 안 함
- `X-Readmates-Bff-Secret` request header 기록 안 함

수정 파일:

- `deploy/oci/Caddyfile`
- `deploy/oci/02-configure.sh`

이유:

- compose runtime과 legacy rollback runtime 모두 같은 로그 안전 기준을 가져야 합니다.
- OAuth callback query, invite token, BFF secret header가 access log에 남지 않아야 합니다.

### 5. 문서 contract 업데이트

수정 파일:

- `docs/deploy/cloudflare-pages.md`
- `docs/deploy/oci-backend.md`

문서에 명시한 contract:

- `READMATES_API_BASE_URL`에는 origin만 넣습니다.
- query string이나 fragment를 붙이지 않습니다.
- BFF secret은 URL에 넣지 않고 `READMATES_BFF_SECRET`으로만 전달합니다.
- Caddy access log는 request URI와 민감 request header를 기록하지 않아야 합니다.

## 중간에 있었던 시행착오

### Wrangler deploy 작업 디렉터리 문제

한 번은 repository root에서 `front/dist`를 대상으로 Pages deploy를 실행했습니다.

그 결과:

- static asset은 배포됐습니다.
- 하지만 Pages Functions bundle이 기대대로 포함되지 않았습니다.
- `/api/bff/...` 요청이 Function이 아니라 SPA HTML fallback처럼 동작했습니다.

해결:

Cloudflare Pages 프로젝트 root가 `front`이므로, `front/`를 working directory로 두고 다음 형태로 배포했습니다.

```bash
cd front
npx --yes wrangler@4.84.1 pages deploy dist --project-name readmates --branch main --commit-dirty=true
```

이 방식에서는 output에 `Compiled Worker successfully`, `Uploading Functions bundle`이 나타났습니다.

### VM env 파일 갱신 quoting/permission 문제

secret rotation 중 일부 shell quoting과 임시 파일 권한 문제가 있었습니다.

최종적으로는 다음 원칙으로 정리했습니다.

- secret 원문을 stdout에 출력하지 않습니다.
- 임시 파일은 mode `600`으로 생성합니다.
- VM에 전송한 임시 secret 파일은 env 반영 후 삭제합니다.
- `/etc/readmates/readmates.env`는 `readmates:readmates`, mode `600`으로 유지합니다.
- API container는 env 변경 후 재생성합니다.

## 왜 이 해결이 맞는가

이번 문제의 핵심은 "BFF secret이 틀렸다"가 아니라 "secret의 source of truth가 둘 이상이었다"는 점입니다.

잘못된 구조:

```text
READMATES_API_BASE_URL query fallback
  우선 사용
READMATES_BFF_SECRET
  fallback으로 사용
```

이 구조에서는 운영자가 `READMATES_BFF_SECRET`을 올바르게 회전해도, query fallback이 남아 있으면 계속 틀린 secret이 전송될 수 있습니다.

정리한 구조:

```text
READMATES_API_BASE_URL
  API origin만 담당

READMATES_BFF_SECRET
  BFF 인증 secret만 담당
```

역할이 분리되면 다음이 명확해집니다.

- API endpoint 변경은 `READMATES_API_BASE_URL`만 보면 됩니다.
- BFF secret rotation은 Cloudflare Pages secret과 Spring env만 보면 됩니다.
- URL/log/dashboard에 secret이 섞이지 않습니다.
- test도 "origin query는 제거되고, secret은 dedicated binding에서 온다"는 contract를 검증합니다.

## 최종 검증 명령

로컬 검증:

```bash
pnpm --dir front test --run tests/unit/cloudflare-bff.test.ts tests/unit/cloudflare-oauth-proxy.test.ts
pnpm --dir front lint
pnpm --dir front build
bash -n deploy/oci/02-configure.sh deploy/oci/04-install-docker.sh deploy/oci/05-deploy-compose-stack.sh
READMATES_SERVER_IMAGE=readmates-server:local docker compose -f deploy/oci/compose.yml config --no-env-resolution --quiet
docker run --rm -e CADDY_SITE=api.example.com -v "$PWD/deploy/oci/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
git diff --check -- <changed-files>
```

운영 smoke:

```bash
curl -sS -o /tmp/readmates-auth.json -w '%{http_code}' https://readmates.pages.dev/api/bff/api/auth/me
curl -sS -o /tmp/readmates-health.json -w '%{http_code}' https://<api-origin>/internal/health
curl -sS -o /dev/null -w '%{http_code}' https://readmates.pages.dev/oauth2/authorization/google
READMATES_SMOKE_BASE_URL=https://readmates.pages.dev READMATES_SMOKE_AUTH_BASE_URL=https://readmates.pages.dev ./scripts/smoke-production-integrations.sh
```

public release safety:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

최종 확인된 결과:

- BFF auth smoke: `200`
- direct API health: `200`
- OAuth start: `302`
- debug 전용 필드: 없음
- Compose services: 모두 running, API/Redis/Redpanda healthy
- public-release check: passed

## 수정 파일 요약

배포/운영:

- `deploy/oci/Caddyfile`
  - compose Caddy access log에서 URI와 민감 request header 제거
- `deploy/oci/02-configure.sh`
  - legacy host Caddy rollback 경로에도 같은 log filter 적용

Cloudflare Pages Functions:

- `front/functions/_shared/proxy.ts`
  - `apiBaseUrlFromEnv`
  - `bffSecretFromEnv`
- `front/functions/api/bff/[[path]].ts`
  - API base URL query/hash 제거
  - dedicated BFF secret helper 사용
- `front/functions/oauth2/authorization/[[registrationId]].ts`
  - OAuth start upstream origin 정규화
- `front/functions/login/oauth2/code/[[registrationId]].ts`
  - OAuth callback upstream origin 정규화

테스트:

- `front/tests/unit/cloudflare-bff.test.ts`
  - API base URL query가 upstream에 전달되지 않고, dedicated BFF secret이 header에 들어가는지 검증
- `front/tests/unit/cloudflare-oauth-proxy.test.ts`
  - OAuth proxy도 같은 contract를 따르는지 검증

문서:

- `docs/deploy/cloudflare-pages.md`
  - `READMATES_API_BASE_URL`은 origin-only, BFF secret은 URL 금지
- `docs/deploy/oci-backend.md`
  - Caddy access log 민감값 미기록 contract

## 보고 시점 상태

Compose stack은 계속 실행 중입니다.

```text
caddy           Up
readmates-api   Up, healthy
redis           Up, healthy
redpanda        Up, healthy
```

후속 운영 과제:

- 임시 `<VM_PUBLIC_IP>.sslip.io` API origin을 장기 운영 custom domain으로 교체
- custom DNS/Cloudflare domain 연결 후 `CADDY_SITE`, Cloudflare `READMATES_API_BASE_URL`, Google OAuth 설정을 같은 rollout로 조정
- 실제 Google 로그인 완료 flow는 브라우저 계정 상호작용이 필요하므로, OAuth start smoke 이후 별도 수동 확인 권장

## 재발 방지 규칙

1. `READMATES_API_BASE_URL`에는 origin만 넣습니다.
2. secret은 URL, query string, fragment에 넣지 않습니다.
3. BFF secret source는 `READMATES_BFF_SECRET` 하나로 유지합니다.
4. Caddy access log는 request URI와 민감 request header를 기록하지 않습니다.
5. secret이 log나 terminal output에 노출되면 해당 secret은 폐기하고 회전합니다.
6. Pages Functions 배포는 `front/` project root에서 수행하고, output에 Functions bundle 업로드가 있는지 확인합니다.
7. 임시 debug endpoint는 원인 확인 후 최종 배포 전에 제거합니다.
