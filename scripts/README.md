# 공개 릴리즈 보조 스크립트

이 디렉터리의 스크립트는 private ReadMates 작업 tree에서 공개 가능한 릴리즈 후보를 만들고 검사합니다. 이 스크립트들은 GitHub에 게시하지 않고, 저장소 공개 설정을 바꾸지 않고, secret을 교체하지 않고, commit을 만들지 않습니다.

공개 저장소 전환과 secret 관리 기준은 [공개 저장소 보안](../docs/deploy/security-public-repo.md)을 함께 확인합니다.

## `build-public-release-candidate.sh`

아래 명령은 저장소 루트에서 실행하는 것을 기준으로 합니다. 스크립트 자체는 저장소 내부 어디에서든 실행할 수 있지만, 이 문서의 `./scripts/...` 경로는 저장소 루트에서 그대로 복사해 실행할 수 있습니다.

```bash
./scripts/build-public-release-candidate.sh
```

출력 위치는 `.tmp/public-release-candidate`로 고정되어 있습니다. 임의 destination 인자는 지원하지 않습니다.

스크립트는 먼저 `.tmp`가 저장소 안의 `.tmp`로 해석되는지 확인합니다. 그 다음 `.tmp/public-release-candidate.staging.*` 아래에 staging tree를 만들고, 검증을 통과한 뒤에만 기존 `.tmp/public-release-candidate`를 교체합니다. 빌드가 실패하면 이전에 성공한 후보는 그대로 남습니다.

공개 릴리즈 후보 manifest는 명시적으로 관리합니다. 주요 포함 범위는 다음과 같습니다.

- `.github/workflows/ci.yml`
- `.gitignore`
- `.gitleaks.toml`, 파일이 있을 때만 포함
- `.env.example`
- `README.md`
- `compose.yml`
- `front/`
- `server/`
- `deploy/oci/`
- `docs/development/`
- `docs/deploy/`
- 공개 릴리즈 보조 스크립트: `scripts/build-public-release-candidate.sh`, `scripts/README.md`, `scripts/public-release-check.sh`, `scripts/verify-public-release-fixtures.sh`

디렉터리를 복사할 때 `copy_dir` 공통 exclude는 `.env*`, `*.env`, key material, dump, `.DS_Store`를 제외합니다. manifest별 exclude는 `front/output`, `front/node_modules`, `front/dist`, `server/build`, `server/.gradle`, `server/.kotlin`, `deploy/oci/.deploy-state`, `deploy/oci/*.state`를 복사하지 않습니다. provider state, screenshot, private planning docs, `design`, `.gstack`, `.superpowers`, `.idea`, `.playwright-cli`, `.tmp`, `recode`처럼 공개 후보 금지 경로로 분류되는 항목은 복사 중 조용히 제외된다고 가정하지 않고, staging 후보 검증에서 발견되면 거부되어 빌드가 실패합니다.

루트 `.env.example`만 의도적으로 포함되는 environment file입니다. 필수 파일과 디렉터리 root는 symlink일 수 없고, 승인된 source root 안에서 발견되는 symlink도 복사 전에 거부합니다. staging 후보 검증 단계에서도 승인된 manifest 밖의 경로, 금지 경로, symlink가 남아 있으면 실패합니다.

성공하면 후보 경로와 후속 확인 명령을 출력합니다. 루트 `.gitleaks.toml`이 있으면 후보에 함께 포함되어, 공개 전 같은 custom scanner rule을 사용할 수 있습니다.

## `public-release-check.sh`

clean 공개 릴리즈 후보를 검사합니다.

```bash
./scripts/public-release-check.sh .tmp/public-release-candidate
```

인자 없이 실행하면 현재 private 작업 tree를 검사합니다.

```bash
./scripts/public-release-check.sh
```

현재 tree 모드는 `git ls-files`를 기준으로 tracked 금지 경로와 tracked symlink를 확인합니다. 후보 모드는 전달한 디렉터리를 `find`로 순회하며, 후보 안의 모든 symlink와 금지 경로를 거부합니다.

checker가 차단하는 주요 항목은 다음과 같습니다.

- private keys
- OCI OCIDs
- GitHub tokens
- OpenAI/API-key-shaped tokens
- 실제처럼 보이는 DB/BFF/OAuth secret assignment
- Gmail addresses
- private club domains
- local workstation paths
- private 또는 generated path로 분류된 금지 경로

`gitleaks`가 설치되어 있으면 repository의 `.gitleaks.toml` 설정으로 `gitleaks dir <path>`를 실행합니다. 설치된 `gitleaks`가 `dir` subcommand를 지원하지 않는 구버전이면 `gitleaks detect --source <path>`로 compatibility fallback을 실행하고, 그 사실을 출력합니다.

`gitleaks`가 없더라도 targeted path/content check는 계속 실행합니다. 다만 fallback check는 좁은 guardrail입니다. 통과했다고 해서 전문적이거나 완전한 secret scan을 통과한 것은 아니며, 공개 전 명백한 실수를 줄이기 위한 로컬 안전장치로 봐야 합니다.

## `verify-public-release-fixtures.sh`

scanner pattern을 바꾼 뒤 fixture 검증을 실행합니다.

```bash
./scripts/verify-public-release-fixtures.sh
```

이 스크립트는 fixture 디렉터리를 `.tmp/public-release-fixtures` 아래에 만들고 `public-release-check.sh`를 호출합니다. 검증 범위는 다음과 같습니다.

- dollar 문자가 포함된 DB password assignment가 차단되는지 확인합니다.
- comment에 placeholder를 적어도 실제처럼 보이는 secret value가 allowlist되지 않는지 확인합니다.
- 문서화된 placeholder와 environment variable indirection은 통과하는지 확인합니다.
- `.tmp` parent가 symlink이면 실행을 거부합니다. 이 기준은 공개 릴리즈 후보 builder의 cleanup guard와 맞춥니다.

fixture 검증도 GitHub 게시, 저장소 공개 설정 변경, secret rotation, commit 생성을 수행하지 않습니다.
