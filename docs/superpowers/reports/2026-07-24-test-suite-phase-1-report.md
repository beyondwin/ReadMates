# ReadMates 테스트 스위트 Phase 1 기준선 보고서

## 1. 범위와 기준 HEAD

이 보고서는 `7cb38818124742d340dc26e8bfa8c1d43ebca848`에서 수집한 Phase 1 증거다. 제품 코드와 테스트를 바꾸지 않고, 510개 자동화 테스트 파일의 runner 연결성, 정적 검토 후보, 공식 lane의 1회 실행 결과를 기록했다. 실행 실패나 로컬 선행 조건 부재는 테스트 제거 근거로 사용하지 않았다.

## 2. 도구 및 환경 준비 상태

| 의존성 | 상태 | 관찰값 |
| --- | --- | --- |
| Node.js 24 | READY | `v24.18.0` |
| pnpm | READY | `npx --yes corepack@0.35.0 pnpm --version` = `11.13.1` |
| Java | READY | OpenJDK 25.0.3 |
| Docker CLI | READY | 실행 파일 존재 |
| Docker daemon | UNVERIFIED_ENV | 로컬 socket에 daemon 없음 |
| MySQL CLI | UNVERIFIED_ENV | 실행 파일 없음 |
| ShellCheck | UNVERIFIED_ENV | 실행 파일 없음 |
| jq, ripgrep | READY | 실행 파일 존재 |

시스템 패키지를 설치하거나 worker, fork, retry, timeout을 변경하지 않았다.

## 3. 파일·케이스·runner 연결성

| lane | 파일 | 정적 수집 case | selection source | 연결성 |
| --- | ---: | ---: | --- | --- |
| front-vitest-node | 69 | 403 | `front/vitest.config.ts:node` | included |
| front-vitest-jsdom | 114 | 948 | `front/vitest.config.ts:jsdom` | included |
| front-playwright-e2e | 40 | 82 | `front/playwright.config.ts` | included |
| front-playwright-ct | 6 | 7 | `front/playwright-ct.config.ts` | included |
| design-system-vitest | 7 | 13 | `design/system/package.json` | included |
| design-docs-vitest | 1 | 2 | `design/docs/package.json` | included |
| server-unit | 173 | 943 | `server/build.gradle.kts:unitTest` | dry-run 일치 |
| server-integration | 98 | 692 | `server/build.gradle.kts:integrationTest` | dry-run 일치 |
| server-architecture | 2 | 25 | `server/build.gradle.kts:architectureTest` | dry-run 일치 |

총 510개 파일은 중복·누락 없이 한 lane에만 속한다. Gradle dry-run은 nested class 때문에 각각 173/101/3개 XML을 만들었지만 source로 정규화하면 273개 server 경로이며, unmapped 경로와 inventory lane 차이는 모두 0이다.

## 4. CI job과 공식 명령 대응

| CI job | 로컬 기준선 lane | 대응 명령 |
| --- | --- | --- |
| scripts | agent-guidance, script-* | `python3 scripts/check-agent-guidance.py`; `bash -n` 및 저장소 validation scripts; CI의 ShellCheck는 로컬 선행 조건 부재 |
| public-release | public-release | `./scripts/build-public-release-candidate.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate` |
| frontend | front-lint, front-coverage, front-build, front-zod-fixtures | `pnpm --dir front lint`; `pnpm --dir front test:coverage`; `pnpm --dir front build`; fixture export 후 diff |
| frontend-visual-regression | front-ct-docker | `pnpm --dir front test:ct:docker` |
| design-system | design-check | `pnpm design:check` |
| backend | server-ci | `./scripts/server-ci-check.sh` |
| backend-integration | server-integration | `./server/gradlew -p server integrationTest` |
| e2e (1/3) | front-e2e | CI는 `playwright test --shard=1/3`; 로컬 공식 대표 명령은 `pnpm --dir front test:e2e` |
| e2e (2/3) | front-e2e | CI는 `playwright test --shard=2/3`; 로컬 공식 대표 명령은 `pnpm --dir front test:e2e` |
| e2e (3/3) | front-e2e | CI는 `playwright test --shard=3/3`; 로컬 공식 대표 명령은 `pnpm --dir front test:e2e` |

모든 pnpm 명령은 Node 24를 앞세운 PATH에서 `npx --yes corepack@0.35.0 pnpm`으로 실행했다.

## 5. 실행 결과와 wallclock

`case/file`은 해당 명령이 직접 실행하는 테스트 수를 알 수 있을 때만 적었다. 스크립트와 build 계열에는 해당 없음으로 표시했다.

| lane | 정확한 명령 | 상태 | real 초 | case/file | retry 관찰 | 원시 증거 |
| --- | --- | ---: | ---: | --- | --- | --- |
| front-lint | `pnpm --dir front lint` | 0 | 19.01 | 해당 없음 | 없음 | `.tmp/test-suite-audit/front-lint.log` |
| front-coverage | `pnpm --dir front test:coverage` | 0 | 43.48 | 1,425/183 | 없음 | `.tmp/test-suite-audit/front-coverage.log` |
| front-build | `pnpm --dir front build` | 0 | 2.28 | 해당 없음 | 없음 | `.tmp/test-suite-audit/front-build.log` |
| front-zod-fixtures | `pnpm --dir front zod:export-fixtures && git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/` | 0 | 1.44 | 해당 없음 | 없음 | `.tmp/test-suite-audit/front-zod-fixtures.log` |
| design-check | `pnpm design:check` | 0 | 8.28 | 15/8 | 없음 | `.tmp/test-suite-audit/design-check.log` |
| server-ci | `./scripts/server-ci-check.sh` | 0 | 9.11 | unit 943, architecture 25/175 source files | 없음 | `.tmp/test-suite-audit/server-ci.log` |
| server-integration | `./server/gradlew -p server integrationTest` | UNVERIFIED_ENV | - | 692/98 source files | 실행 안 함 | Docker daemon 없음 |
| front-e2e | `pnpm --dir front test:e2e` | UNVERIFIED_ENV | - | 82/40 | 실행 안 함 | MySQL CLI 없음 |
| front-ct-docker | `pnpm --dir front test:ct:docker` | UNVERIFIED_ENV | - | 7/6 | 실행 안 함 | Docker daemon 없음 |
| agent-guidance | `python3 scripts/check-agent-guidance.py` | 0 | 1.75 | 해당 없음 | 없음 | `.tmp/test-suite-audit/agent-guidance.log` |
| script-bash-syntax | `for test_audit_script in scripts/*.sh deploy/oci/*.sh; do bash -n "$test_audit_script"; done` | 0 | 0.14 | 해당 없음 | 없음 | `.tmp/test-suite-audit/script-bash-syntax.log` |
| script-shellcheck | `shellcheck scripts/*.sh deploy/oci/*.sh` | UNVERIFIED_ENV | - | 해당 없음 | 실행 안 함 | ShellCheck 실행 파일 없음 |
| script-aigen-pii | `bash scripts/aigen-pii-check.sh` | 0 | 3.89 | 해당 없음 | 없음 | `.tmp/test-suite-audit/script-aigen-pii.log` |
| script-observability-config | `./scripts/validate-prometheus-rules.sh && ./scripts/validate-prometheus-config.sh && bash scripts/validate-tempo-config.sh && ./scripts/lint-grafana-dashboards.sh` | 1 | 0.44 | 해당 없음 | 없음 | `.tmp/test-suite-audit/script-observability-config.log` |
| script-production-ai-config | `bash scripts/validate-production-ai-config.sh && bash scripts/verify-production-ai-config-fixtures.sh` | 0 | 0.16 | 해당 없음 | 없음 | `.tmp/test-suite-audit/script-production-ai-config.log` |
| public-release | `./scripts/build-public-release-candidate.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate` | 0 | 24.90 | 해당 없음 | 없음 | `.tmp/test-suite-audit/public-release.log` |

## 6. Coverage 기준선

Frontend V8 coverage는 lines 82.57%, statements 81.77%, functions 82.06%, branches 77.69%로 현재 80/79/80/75 gate를 통과했다. Server JaCoCo line counter는 covered 11,272, missed 13,676으로 45.18%이며 0.23 minimum을 통과했다. threshold를 변경하지 않았다.

## 7. Retry·flake·실패 신호

각 lane은 정확히 한 번 실행했고 retry를 추가하지 않았다. 성공 로그에는 retry, retried, flaky 또는 두 번째 attempt 신호가 없었다. `front-coverage`는 183 files/1,425 tests, design suites는 8 files/15 tests를 한 번에 통과했다. `script-observability-config`의 non-zero 1은 테스트 assertion 실패가 아니라 첫 Docker 기반 validator가 daemon socket에 연결하지 못한 환경 실패이며, `&&` 뒤의 validator는 실행되지 않았다. 따라서 이 1회 기준선으로 flake 유무를 판정하지 않는다.

## 8. 미검증 항목과 환경 원인

- `server-integration`과 `front-ct-docker`: Docker CLI는 있지만 daemon이 없어 `UNVERIFIED_ENV`다.
- `front-e2e`: 공식 helper가 요구하는 MySQL CLI가 없어 `UNVERIFIED_ENV`다.
- `script-shellcheck`: ShellCheck 실행 파일이 없어 `UNVERIFIED_ENV`다. CI `scripts` job은 이를 설치한다.
- `script-observability-config`: 실행은 됐지만 Docker daemon 연결 실패로 non-zero다. config 자체의 성공 여부는 미검증이다.
- Playwright E2E/CT의 runtime, retry, screenshot drift는 수집하지 못했다. 정적 list 결과만 file/case census 근거로 사용했다.
