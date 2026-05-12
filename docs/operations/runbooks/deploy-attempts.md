# Deploy Attempts

ReadMates backend 배포는 한 번의 명시적 attempt로 기록합니다. Attempt는 자동 재시도되지 않으며, 실패하면 stage와 근거를 남긴 뒤 운영자가 rollback, 재시도, 조사를 선택합니다.

## 상태

| 상태 | 의미 | 다음 행동 |
| --- | --- | --- |
| `SUCCESS` | image pull/load, compose start, container health, BFF smoke가 통과하고, post-deploy watch가 통과했거나 명시적으로 skip됨 | release note 또는 운영 기록에 sanitized summary만 남김 |
| `FAILED_PREFLIGHT` | env file, Docker/Compose, backup, registry 준비 부족 | 배포를 시작하지 않고 준비 조건 복구 |
| `FAILED_DEPLOY` | runtime file install, image pull/load, compose config/up 실패 | compose 상태와 ledger 확인 후 rollback 판단 |
| `FAILED_HEALTH` | `/internal/health`, BFF smoke, OAuth smoke, post-deploy watch 실패 | running image/env/log 조사 또는 이전 image 수동 rollback |
| `USER_ABORTED` | 운영자가 중단 | 중단 stage를 기록하고 수동 정리 |

## Ledger 위치

운영 VM:

```text
/var/log/readmates/deploy-attempts.jsonl
```

권장 권한:

```bash
sudo install -d -o root -g readmates -m 0750 /var/log/readmates
sudo touch /var/log/readmates/deploy-attempts.jsonl
sudo chown root:readmates /var/log/readmates/deploy-attempts.jsonl
sudo chmod 0640 /var/log/readmates/deploy-attempts.jsonl
```

## Ledger 포맷 및 스키마

`05-deploy-compose-stack.sh`는 `READMATES_LEDGER_FORMAT` 환경 변수로 기록 포맷을 제어합니다.

| 값 | 동작 |
| --- | --- |
| `both` (기본값) | legacy 라인 + 새 NDJSON 라인 모두 기록 |
| `json` | 새 NDJSON 스키마 라인만 기록 |
| `legacy` | 기존 flat-string detail 라인만 기록 |

### Legacy 스키마 (기존)

```json
{"attemptId":"20260512T100000Z-12345","event":"IMAGE_VERIFIED","status":"FAILED","stage":"compose-up","at":"2026-05-12T10:00:00Z","durationSeconds":42,"detail":"reason=running-image-id-empty expectedImageId=sha256:abc"}
```

### 새 NDJSON 스키마 (ADR-0016, v1.7+)

```json
{"ts":"2026-05-12T10:00:00Z","stage":"compose-up","event":"IMAGE_VERIFIED","status":"FAILED","detail":{"reason":"running-image-id-empty","expectedImageId":"sha256:abc"},"attemptId":"20260512T100000Z-12345","durationSeconds":42}
```

`detail` 필드가 flat string에서 JSON 오브젝트로 변경되어 jq로 직접 필드 접근이 가능합니다.

### jq 쿼리 예시

```bash
# 모든 FAILED 이벤트 출력 (새 스키마)
jq -r 'select(.status=="FAILED")' /var/log/readmates/deploy-attempts.jsonl

# 특정 이벤트 필터 (새 스키마)
jq -r 'select(.event=="IMAGE_VERIFIED" and .status=="FAILED")' /var/log/readmates/deploy-attempts.jsonl

# imageId 추출 (새 스키마)
jq -r 'select(.event=="IMAGE_ID_RESOLVED") | .detail.imageId' /var/log/readmates/deploy-attempts.jsonl

# 특정 attemptId의 전체 이벤트 타임라인 (새 스키마)
jq -r 'select(.attemptId=="20260512T100000Z-12345") | [.ts, .stage, .event, .status] | @tsv' /var/log/readmates/deploy-attempts.jsonl

# 실패한 배포의 exitCode 확인 (새 스키마)
jq -r 'select(.event=="FAILED") | .detail.exitCode' /var/log/readmates/deploy-attempts.jsonl

# READMATES_LEDGER_FORMAT=both 시 legacy 라인 제외하고 새 스키마만 필터
jq -r 'select(.ts != null)' /var/log/readmates/deploy-attempts.jsonl
```

## 이벤트 필드

| 필드 | 설명 | 민감도 |
| --- | --- | --- |
| `ts` | UTC ISO-8601 timestamp (새 스키마. legacy 스키마에서는 `at`) | 낮음 |
| `attemptId` | 배포 script가 생성한 UTC timestamp 기반 id | 낮음 |
| `event` | `STARTED`, `PREFLIGHT_PASSED`, `IMAGE_ID_RESOLVED`, `IMAGE_RESOLVED`, `IMAGE_VERIFIED`, `STACK_STARTED`, `HEALTH_PASSED`, `BFF_SMOKE_PASSED`, `POST_DEPLOY_WATCH_PASSED`, `POST_DEPLOY_WATCH_SKIPPED`, `SUCCESS`, `FAILED`. watch 스크립트 추가 이벤트: `STAGE_STARTED`, `VM_HEALTH_PASSED`, `BFF_AUTH_SMOKE_PASSED`, `INTEGRATION_SMOKE_PASSED`, `ERROR_LOG_CHECK_PASSED`, `WATCH_PASSED` | 낮음 |
| `status` | `RUNNING`, `SUCCESS`, `FAILED` 중 하나 | 낮음 |
| `stage` | 실패 또는 진행 중 stage | 낮음 |
| `at` | UTC ISO-8601 timestamp (legacy 스키마) | 낮음 |
| `durationSeconds` | attempt 소요 시간 | 낮음 |
| `detail` | 새 스키마: JSON 오브젝트 (`{"image":"..."}` 등). legacy 스키마: flat string (`"image=..."` 등). `image`, `imageSource`, `imageId`, `expectedImageId`, `runningImageId`, `services`, `endpoint`, `path`, `watch`, `exitCode`, `reason` 등 이벤트별 세부 정보 | 낮음. operator가 제공한 image 이름이나 detail 값이 public-safe일 때만 외부 공유 가능 |

현재 ledger는 registry digest를 별도 필드로 기록하지 않습니다. `image`, `imageId`, `exitCode`도 top-level field가 아니라 필요한 event의 `detail` 안에만 기록합니다. 관련: [ADR-0016](../../development/adr/0016-deploy-ledger-event-schema.md)

## Image verification

릴리즈 배포는 tag 문자열만 믿지 않고 Docker image id를 확인합니다.

1. VM에서 `sudo docker image inspect "$READMATES_SERVER_IMAGE" --format '{{.Id}}'`로 expected image id를 얻습니다.
2. Compose start 후 `readmates-api` container id를 얻습니다.
3. `sudo docker inspect "$container" --format '{{.Image}}'` 값이 expected image id와 같은지 확인합니다.
4. 값이 다르면 배포를 실패로 처리하고 자동 rollback하지 않습니다.

## 금지 필드

Ledger에 아래 값을 넣지 않습니다.

- `/etc/readmates/readmates.env` 내용
- DB host 실제 값, password, OAuth secret, BFF secret, SMTP credential
- cookie, Authorization header, OAuth code, token
- request/response body 전문
- 운영 smoke 결과 전문
- 실제 멤버 이름, 이메일, club 운영 데이터

## 실패 stage별 1차 확인

| Stage | 확인 |
| --- | --- |
| `preflight` | `/etc/readmates/readmates.env` 존재와 권한, 최근 DB backup, VM Docker/Compose, GHCR login |
| `image` | GHCR image tag 존재, registry auth, image architecture |
| `install` | `/opt/readmates`, `/etc/readmates/caddy.env`, `/opt/readmates/.env`, systemd unit 권한 |
| `compose-config` | `sudo docker compose -f /opt/readmates/compose.yml config` |
| `compose-up` | `sudo docker compose -f /opt/readmates/compose.yml ps` |
| `health` | `readmates-api` container logs, `/internal/health`, Flyway migration logs |
| `bff-smoke` | Cloudflare Pages secret, `READMATES_API_BASE_URL`, BFF secret rotation state |
| `post-deploy-watch` | recent `ERROR`, OAuth redirect smoke, public API smoke |

## 수동 rollback 기준

아래 중 하나면 이전 image로 rollback을 검토합니다.

- 새 image container가 health를 통과하지 못한다.
- BFF smoke가 새 서버 API와 맞지 않는다.
- post-deploy watch에서 새로운 5xx 또는 반복 `ERROR`가 발생한다.
- Flyway migration이 실패했고 DB가 안전한 상태로 남아 있다.

Rollback command는 [OCI Compose Stack](../../deploy/compose-stack.md#rollback)을 따른다. 자동 rollback은 수행하지 않는다.
