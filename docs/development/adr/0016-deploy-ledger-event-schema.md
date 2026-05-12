# ADR-0016: Deploy ledger NDJSON event schema + dual-format writer

- 상태: Accepted
- 결정일: 2026-05-12
- 작성자: ops
- 관련: `deploy/oci/05-deploy-compose-stack.sh`,
  `deploy/oci/watch-compose-post-deploy.sh`,
  `deploy/oci/01-vm-setup.sh`,
  `docs/operations/runbooks/deploy-attempts.md`

## 컨텍스트

`05-deploy-compose-stack.sh`의 `remote_ledger_append` 헬퍼는 배포 이벤트를 NDJSON 형태로
`/var/log/readmates/deploy-attempts.jsonl`에 기록한다.
기존 포맷(`legacy`)은 `detail` 필드를 flat string으로 기록했다 — 예: `"reason=running-image-id-empty expectedImageId=sha256:..."`.

이 포맷은 사람이 읽기에는 충분하지만 jq, grep 등 기계 처리에 적합하지 않다.
예를 들어 `imageId`를 추출하려면 `grep` + 문자열 파싱이 필요하며,
`SELECT .detail.imageId`처럼 jq 필드 접근이 불가능하다.

또한 `watch-compose-post-deploy.sh`는 ledger 기록을 전혀 하지 않아
post-deploy watch 단계의 이벤트가 누락된다.

## 결정

### 1. 새 NDJSON 스키마 (json 포맷)

```json
{
  "ts": "2026-05-12T10:00:00Z",
  "stage": "compose-up",
  "event": "IMAGE_VERIFIED",
  "status": "FAILED",
  "detail": { "reason": "running-image-id-empty", "expectedImageId": "sha256:abc123" },
  "attemptId": "20260512T100000Z-12345",
  "durationSeconds": 42
}
```

필드 정의:

| 필드 | 설명 |
|------|------|
| `ts` | UTC ISO-8601 timestamp (기존 `at` 필드를 `ts`로 rename) |
| `stage` | `ATTEMPT_STAGE` global 값 (`preflight`, `install`, `image`, …) |
| `event` | 이벤트 이름 (`STARTED`, `IMAGE_VERIFIED`, …) |
| `status` | `RUNNING`, `SUCCESS`, `FAILED` |
| `detail` | whitespace-separated `k=v` 문자열을 파싱한 JSON object. `=`가 없는 토큰은 빈 문자열 값으로 저장 |
| `attemptId` | 배포 시도 id (하위 호환) |
| `durationSeconds` | attempt 경과 시간 (하위 호환) |

### 2. `READMATES_LEDGER_FORMAT` 환경 변수

| 값 | 동작 |
|----|------|
| `both` (기본값) | legacy 라인 먼저, 이어서 json 라인 기록 |
| `json` | 새 스키마 라인만 기록 |
| `legacy` | 기존 flat-string 라인만 기록 (현재 동작 보존) |

기본값 `both`는 기존 파싱 도구와 새 jq 쿼리를 모두 지원하는 이행 기간 동작이다.
새 운영 스크립트 작성 시 `READMATES_LEDGER_FORMAT=json`을 권장한다.

### 3. 헬퍼 시그니처 보존 (Option A)

`remote_ledger_append event status detail_string` 인터페이스를 유지한다.
13개 이상의 기존 호출 위치를 변경하지 않는다.
내부에서 `detail_string`을 jq로 파싱해 `detail` 오브젝트를 생성한다.

SSH append 플럼빙은 `_ledger_remote_emit payload` 내부 헬퍼로 분리한다.

### 4. watch 스크립트 ledger 기록

`watch-compose-post-deploy.sh`에 `watch_ledger_emit event status [detail]` 함수를 추가한다.
이 함수는 동일한 NDJSON 스키마로 post-deploy watch 이벤트를 ledger에 기록한다.

## legacy → json 변환 예시

| legacy detail 문자열 | json detail 오브젝트 |
|---------------------|---------------------|
| `"image=ghcr.io/org/repo:v1"` | `{"image": "ghcr.io/org/repo:v1"}` |
| `"reason=running-image-id-empty expectedImageId=sha256:abc"` | `{"reason": "running-image-id-empty", "expectedImageId": "sha256:abc"}` |
| `"exitCode=1"` | `{"exitCode": "1"}` |
| `""` (빈 문자열) | `{}` |

## 근거

1. **하위 호환 우선**: 기존 `remote_ledger_append` 시그니처(3-arg)와 13개 호출 위치를 유지해
   회귀 위험을 최소화한다. ADR에서 Option A(시그니처 보존)를 채택한다.
2. **jq 기반 파싱**: `detail_string`을 Bash 문자열 처리가 아닌 jq `capture`로 분해한다.
   이미 `jq`는 `01-vm-setup.sh`에서 설치된다.
3. **단계적 전환**: `READMATES_LEDGER_FORMAT=both` 기본값은 기존 도구가 `at`/`detail` flat string을
   기대하더라도 영향이 없도록 legacy 라인을 먼저 기록한다.
4. **watch 가시성**: post-deploy watch 단계 이벤트가 ledger에 누락되던 문제를 해결한다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| A — 시그니처 보존, 내부 augment (채택) | 호환성 위험 최소. 13개 call site 변경 불필요. |
| B — 4-arg 시그니처 (`event status stage detail`) | 13개 call site 변경 필요. 스테이지는 이미 `ATTEMPT_STAGE` global로 관리 중이라 중복. |
| C — detail을 사전에 JSON으로 전달 | call site에서 jq 또는 json 직렬화 로직 필요. 스크립트 가독성 저하. |

## 결과

긍정적:
- `jq '.detail.imageId'` 등 필드 직접 접근 가능 → 운영 쿼리 작성 용이.
- watch 스크립트 이벤트도 ledger에 기록되어 배포 이력 완결성 개선.
- 기존 call site 변경 없음 — 회귀 위험 없음.
- `READMATES_LEDGER_FORMAT=legacy`로 기존 동작 완전 복원 가능.

부정적/감수한 비용:
- `READMATES_LEDGER_FORMAT=both` 시 같은 이벤트에 두 라인이 기록된다.
  ledger 파일 크기가 최대 2배로 증가할 수 있다.
- jq가 없는 환경에서 json/both 모드는 동작하지 않는다. `01-vm-setup.sh`에서
  jq 설치를 보장하므로 실제 운영 VM에서는 문제없다.
- `detail_string`에 공백을 포함한 값(예: 파일 경로에 공백)은 k=v 파싱 시
  별개 토큰으로 분리된다. 현재 detail 값에는 이런 패턴이 없으므로 감수 가능.

## 검증

```bash
# Bash 구문 검사
bash -n deploy/oci/05-deploy-compose-stack.sh
bash -n deploy/oci/watch-compose-post-deploy.sh
bash -n deploy/oci/01-vm-setup.sh

# shellcheck (설치된 경우)
shellcheck deploy/oci/05-deploy-compose-stack.sh
shellcheck deploy/oci/watch-compose-post-deploy.sh

# jq detail 파싱 단위 테스트
detail_string="reason=running-image-id-empty expectedImageId=sha256:abc123"
printf '%s' "$detail_string" | jq -Rn '[inputs | split(" ")[] | select(length > 0) | capture("^(?<k>[^=]+)=(?<v>.*)$") // {k: ., v: ""}] | map({(.k): .v}) | add // {}'
# 기대값: {"reason":"running-image-id-empty","expectedImageId":"sha256:abc123"}
```

## 후속 작업

- `READMATES_LEDGER_FORMAT=json` 전환 후 legacy 라인 제거 검토 (v1.8 이후).
- `ts` 필드 기반 배포 duration 분포 dashboard 추가 검토.
- watch 스크립트의 `watch_ledger_emit` 호출이 누락되지 않도록 PR 리뷰 체크리스트에 추가.
