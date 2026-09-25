# Deploy Attempts

backend 배포 한 번을 attempt 하나로 기록합니다. 자동 재시도는 없습니다. 실패하면 stage와 근거를 남기고 운영자가 rollback, 재시도, 조사 중 하나를 고릅니다.

- 기록 스크립트: `deploy/oci/05-deploy-compose-stack.sh`, `deploy/oci/watch-compose-post-deploy.sh`
- 스키마 결정: [ADR-0016](../../development/adr/0016-deploy-ledger-event-schema.md)

## 상태

ledger의 `status`는 `RUNNING`, `SUCCESS`, `FAILED` 세 가지입니다. 실패 원인은 마지막 `stage`로 나눕니다.

| 결과 | 조건 | 다음 행동 |
| --- | --- | --- |
| `SUCCESS` | image 확인, compose 시작, container health, BFF smoke 통과. post-deploy watch는 통과했거나 명시적으로 skip됨 | 운영 기록에 요약만 남김 |
| `FAILED` | 어느 stage에서든 스크립트가 실패함. `FAILED` event의 `detail`에 `exitCode`가 남음 | 아래 [stage 표](#실패-stage별-1차-확인)로 분류 |

## Ledger 위치

운영 VM의 `/var/log/readmates/deploy-attempts.jsonl`입니다. 스크립트가 없으면 만들고 권한을 맞춥니다(`root:readmates`, 디렉터리 `0750`, 파일 `0640`). 수동으로 맞출 때:

```bash
sudo install -d -o root -g readmates -m 0750 /var/log/readmates
sudo touch /var/log/readmates/deploy-attempts.jsonl
sudo chown root:readmates /var/log/readmates/deploy-attempts.jsonl
sudo chmod 0640 /var/log/readmates/deploy-attempts.jsonl
```

## Ledger 포맷 및 스키마

`READMATES_LEDGER_FORMAT`이 두 스크립트의 기록 형식을 정합니다.

| 값 | 동작 |
| --- | --- |
| `both` (기본) | legacy 줄과 JSON 줄을 모두 기록 |
| `json` | JSON 줄만 기록 (`jq` 필요) |
| `legacy` | legacy 줄만 기록 |

Legacy 줄 (`at`, `detail`은 문자열):

```json
{"attemptId":"20260512T100000Z-12345","event":"IMAGE_VERIFIED","status":"FAILED","stage":"compose-up","at":"2026-05-12T10:00:00Z","durationSeconds":42,"detail":"reason=running-image-id-empty expectedImageId=sha256:abc"}
```

JSON 줄 (`ts`, `detail`은 객체):

```json
{"ts":"2026-05-12T10:00:00Z","stage":"compose-up","event":"IMAGE_VERIFIED","status":"FAILED","detail":{"reason":"running-image-id-empty","expectedImageId":"sha256:abc"},"attemptId":"20260512T100000Z-12345","durationSeconds":42}
```

### jq 쿼리 예시

JSON 줄만 보려면 `select(.ts != null)`를 앞에 붙입니다.

```bash
L=/var/log/readmates/deploy-attempts.jsonl

# 실패 event 전체
jq -c 'select(.ts != null and .status=="FAILED")' "$L"

# attempt 하나의 타임라인
jq -r 'select(.ts != null and .attemptId=="<attempt-id>") | [.ts, .stage, .event, .status] | @tsv' "$L"

# 배포한 image id
jq -r 'select(.ts != null and .event=="IMAGE_ID_RESOLVED") | .detail.imageId' "$L"

# 실패 exitCode
jq -r 'select(.ts != null and .event=="FAILED") | .detail.exitCode' "$L"
```

## 이벤트 필드

| 필드 | 설명 |
| --- | --- |
| `ts` / `at` | UTC ISO-8601 시각 (JSON 줄은 `ts`, legacy 줄은 `at`) |
| `attemptId` | 배포 스크립트가 만든 UTC timestamp 기반 id. `READMATES_DEPLOY_ATTEMPT_ID`로 지정 가능 |
| `event` | 배포: `STARTED`, `PREFLIGHT_PASSED`, `IMAGE_RESOLVED`, `IMAGE_ID_RESOLVED`, `IMAGE_VERIFIED`, `STACK_STARTED`, `HEALTH_PASSED`, `BFF_SMOKE_PASSED`, `POST_DEPLOY_WATCH_PASSED`, `POST_DEPLOY_WATCH_SKIPPED`, `SUCCESS`, `FAILED`. watch: `STAGE_STARTED`, `VM_HEALTH_PASSED`, `BFF_AUTH_SMOKE_PASSED`, `INTEGRATION_SMOKE_PASSED`, `ERROR_LOG_CHECK_PASSED`, `WATCH_PASSED`, `CHECK_FAILED`, `WATCH_FAILED` |
| `status` | `RUNNING`, `SUCCESS`, `FAILED` |
| `stage` | 진행 중이거나 실패한 stage |
| `durationSeconds` | 시작부터 걸린 시간 |
| `detail` | event별 세부값: `image`, `imageSource`, `imageId`, `expectedImageId`, `runningImageId`, `services`, `endpoint`, `path`, `watch`, `exitCode`, `reason` 등 |

- registry digest는 따로 기록하지 않습니다. `image`, `imageId`, `exitCode`는 top-level이 아니라 `detail` 안에만 있습니다.
- `detail` 값은 운영자가 넘긴 image 이름처럼 public-safe일 때만 밖에 공유합니다.

### `attemptId == "unknown"`

watch 스크립트는 `READMATES_DEPLOY_ATTEMPT_ID` → `ATTEMPT_ID` → `unknown` 순서로 id를 고릅니다. `05` 스크립트는 watch를 부를 때 자기 `attemptId`를 넘깁니다. 따라서 `unknown`이 보이면 누군가 watch를 env 없이 직접 실행했거나 회귀가 생긴 것입니다.

```bash
jq -c 'select(.attemptId == "unknown")' /var/log/readmates/deploy-attempts.jsonl
# 최근 배포에 해당하는 줄이 없어야 정상
```

가드 테스트: `deploy/oci/tests/watch-attempt-id.test.sh`

## Image verification

tag 문자열만 믿지 않고 Docker image id를 비교합니다.

1. VM에서 `sudo docker image inspect "$READMATES_SERVER_IMAGE" --format '{{.Id}}'`로 기대 id를 얻습니다.
2. compose 시작 후 `readmates-api` 컨테이너의 `docker inspect --format '{{.Image}}'` 값과 비교합니다.
3. 다르거나 비어 있으면 `IMAGE_VERIFIED`를 `FAILED`로 남기고 배포를 멈춥니다. 자동 rollback은 없습니다.

## 금지 필드

ledger에 아래 값을 넣지 않습니다.

- `/etc/readmates/readmates.env` 내용
- 실제 DB host, password, OAuth/BFF secret, SMTP credential
- cookie, Authorization header, OAuth code, token
- request/response body 전문, smoke 출력 전문
- 실제 회원 이름, 이메일, 클럽 운영 데이터

## 실패 stage별 1차 확인

| Stage | 확인 |
| --- | --- |
| `preflight` | `/etc/readmates/readmates.env` 존재와 권한, 최근 DB backup, VM Docker/Compose, GHCR login |
| `install` | `/opt/readmates`, `/etc/readmates/caddy.env`, `/opt/readmates/.env`, systemd unit 권한 |
| `image` | GHCR tag 존재, registry 인증, image architecture |
| `compose-config` | `sudo docker compose -f /opt/readmates/compose.yml config` |
| `service-stop` | 이전 host `readmates-server`/`caddy` systemd unit 정지 결과 |
| `compose-up` | `sudo docker compose -f /opt/readmates/compose.yml ps`, `IMAGE_VERIFIED` detail |
| `health` | `readmates-api` 로그, `/internal/health`, Flyway migration 로그 |
| `bff-smoke` | Cloudflare Pages secret, `READMATES_API_BASE_URL`, BFF secret 회전 상태 |
| `post-deploy-watch` | 최근 `ERROR` 로그, OAuth redirect smoke, BFF smoke ([Post-deploy watch](post-deploy-watch.md)) |

## 수동 rollback 기준

아래 중 하나면 이전 image로 rollback을 검토합니다.

- 새 image 컨테이너가 health를 통과하지 못한다.
- BFF smoke가 새 서버 API와 맞지 않는다.
- post-deploy watch에서 새 5xx나 반복 `ERROR`가 나온다.
- Flyway migration이 실패했지만 DB는 안전한 상태로 남아 있다.

Rollback 명령은 [OCI Compose Stack](../../deploy/compose-stack.md#rollback)을 따릅니다. 자동 rollback은 없습니다.
