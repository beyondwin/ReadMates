# 빌드·테스트 시간 측정 도구

빌드/테스트 속도 개선 작업에서 쓴 로컬 wallclock 측정 도구입니다. 배경 설계는 [build/test speed spec](../../docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md)(historical 기록)에 있습니다.

## 사용법

```bash
# 최적화 적용 전 기준값
scripts/bench/measure-local.sh baseline cold
scripts/bench/measure-local.sh baseline warm

# 변경 적용 후 (label은 자유롭게)
scripts/bench/measure-local.sh after-task1 cold
scripts/bench/measure-local.sh after-task1 warm
```

- 인자: `<label> <cold|warm>`
- 결과: `docs/superpowers/reports/2026-05-16-<label>-<mode>.md`
- 각 측정을 3번 실행하고 중앙값과 min/max를 기록합니다.

## 측정 항목

| ID | 명령 | 설명 |
| --- | --- | --- |
| L1 | `./gradlew check` (server) | 서버 전체 검증 |
| L2 | `./gradlew unitTest` | 단위 테스트 |
| L3 | `./gradlew architectureTest` | ArchUnit 경계 테스트 |
| L5 | `pnpm --dir front test` | 프론트 Vitest |
| L6 | `pnpm --dir front build` | 프론트 production build |
| L7 | `pnpm --dir front test:coverage` | 프론트 coverage |

`L4`(`integrationTest`)는 Docker가 필요해서 기본 측정에서 뺐습니다. 필요할 때 따로 실행합니다.

## 모드

- **cold**: 실행 사이마다 Gradle build cache, `server/.gradle`, `server/build`를 지웁니다. 새 CI runner에 가깝습니다.
- **warm**: 한 번 실행해 버리고 다음 실행을 기록합니다. cache가 찬 개발자 환경에 가깝습니다.

## Fork 수 비교

`scripts/bench/sweep-forks.sh`는 `-PmaxForks=1..4`로 `unitTest`를 돌려 설정별 중앙값을 `docs/superpowers/reports/2026-05-16-sweep-forks.md`에 기록합니다. CI의 fork 수는 `.github/workflows/ci.yml`의 `READMATES_TEST_FORKS`로 정합니다.

## CI 기준값 (선택, 수동)

CI 시간은 이 스크립트가 재지 않습니다. 측정 전용 branch에 commit을 3번 push한 뒤 아래로 job 시간을 모읍니다.

```bash
gh run list --workflow=ci.yml --branch=<branch> --limit 3 \
  --json databaseId,conclusion,createdAt
gh run view <run-id> --json jobs \
  --jq '.jobs[] | {name, conclusion, startedAt, completedAt}'
```
