# Public Repo Hygiene Remediation Spec

> 작성일: 2026-05-09
> 범위: ignored 파일을 제외한 Git 추적 파일의 공개 저장소 위생 정리
> 관련 plan: `docs/superpowers/plans/2026-05-09-public-repo-hygiene-remediation-implementation-plan.md`

## 개요

ReadMates 공개 저장소의 현재 HEAD에서 활성 credential 원문은 확인되지 않았다. 다만 ignored 파일을
제외한 Git 추적 파일 기준으로 다음 세 가지 공개 저장소 위생 문제가 남아 있다.

1. `.orchestrator/`가 Git에 추적되어 agent 실행 프롬프트, verifier output, worktree state를 공개한다.
2. `.claude/settings.json`이 Git에 추적되어 local agent hook 설정을 공개한다.
3. `docs/improvements.md`가 workstation 절대경로를 포함한다.

본 스팩은 위 세 항목을 수정하여 **Git 추적 파일만으로 구성된 공개 tree**가 로컬 절대경로와 agent-local
state를 포함하지 않도록 만드는 것이 목적이다. `.server-config/`, `.wrangler/`, `.gstack/`, `.tmp/`,
`docs/private/`처럼 `.gitignore`로 제외된 로컬 운영/도구 산출물은 본 스팩의 수정 대상과 검증 실패
조건에서 제외한다.

---

## 목표

- Git 추적 파일에서 agent execution artifacts를 제거한다.
- Git 추적 파일에서 workstation 절대경로를 제거한다.
- local agent/tooling 디렉터리가 다시 추적되지 않도록 ignore policy를 명확히 한다.
- ignored 로컬 secret 백업은 건드리지 않고, public release 검증은 clean candidate 또는 tracked archive
  기준으로 수행한다.

## 비목표

- Git history rewrite, force-push, author/committer email rewriting은 하지 않는다.
- ignored 로컬 파일 삭제, 이동, 암호화는 하지 않는다.
- Cloudflare, GitHub repository settings, OCI runtime secret 값은 변경하지 않는다.
- `docs/superpowers/`에 이미 존재하는 unrelated historical planning note를 대규모로 정리하지 않는다.
- JVM dependency CVE gate, SBOM, image signing은 별도 hardening task로 남긴다.

---

## 현재 문제

### FIND-PH-001: `.orchestrator/` tracked agent state

`.orchestrator/`는 agent orchestration state, task prompt, verifier prompt, stdout/json result를 담는
작업 산출물이다. 이 경로는 product source of truth가 아니며 public repository에 들어갈 필요가 없다.

대표적으로 `.orchestrator/state.json`에는 다음 범주의 정보가 들어간다.

- agent가 사용한 worktree path
- task label과 implementation state
- verifier result summary
- 내부 작업 command와 output path

이 값들은 credential은 아니지만 공개 저장소에서는 불필요한 reconnaissance 정보다.

### FIND-PH-002: `.claude/settings.json` tracked local agent config

`.claude/settings.json`은 local AI coding agent hook 설정이다. 현재 내용은 destructive command 방지 hook으로
secret은 아니지만, repository behavior나 product behavior를 설명하는 파일이 아니다. local tool config는
public repo가 아니라 developer workstation 또는 ignored directory에 있어야 한다.

### FIND-PH-003: `docs/improvements.md` absolute workstation paths

`docs/improvements.md`는 repo-relative path로 충분한 파일 참조를 workstation 절대경로로 기록한다.
절대경로는 public-safe code behavior를 설명하지 않으며, 공개 저장소에서 개인 환경 정보를 노출한다.

---

## 요구사항

### REQ-PH-001: `.orchestrator/` 추적 제거

1. Git index에서 `.orchestrator/` 아래 모든 파일을 제거해야 한다.
2. local copy 보존 여부와 무관하게, commit 후 다음 명령은 출력이 없어야 한다.
   ```bash
   git ls-files .orchestrator
   ```
3. `.gitignore`는 `.orchestrator/`를 ignore해야 한다.
4. `.orchestrator/` 제거는 product source, tests, migrations, deploy scripts를 변경하지 않아야 한다.

### REQ-PH-002: `.claude/` 추적 제거

1. Git index에서 `.claude/settings.json`을 제거해야 한다.
2. commit 후 다음 명령은 출력이 없어야 한다.
   ```bash
   git ls-files .claude
   ```
3. `.gitignore`는 `.claude/`를 ignore해야 한다.
4. local `.claude/` directory는 필요하면 workstation에 남아도 되지만, Git 추적 대상이 아니어야 한다.

### REQ-PH-003: `docs/improvements.md` 절대경로 제거

1. `docs/improvements.md`의 workstation 절대경로를 repo-relative path로 바꿔야 한다.
2. 문서의 의미는 유지되어야 한다. 파일 위치를 설명하는 bullet은 삭제보다 상대경로 치환을 우선한다.
3. 변경 후 다음 명령은 `docs/improvements.md`에서 출력이 없어야 한다.
   ```bash
   local_path_pattern='/U''sers/|/h''ome/[^/]+/|C:\\U''sers\\'
   git grep -n -I -E "$local_path_pattern" -- docs/improvements.md
   ```

### REQ-PH-004: ignore policy 정리

1. `.gitignore`의 local tool/output block에 `.claude/`와 `.orchestrator/`가 명시되어야 한다.
2. 기존 ignore 항목인 `.server-config/`, `.wrangler`, `.gstack/`, `.tmp`, `docs/private/`는 유지해야 한다.
3. `.env.example` 예외는 유지해야 한다.

### REQ-PH-005: public-safety 검증

수정 후 ignored 파일을 제외한 추적 파일 기준으로 다음 조건을 만족해야 한다.

1. agent-local tracked path 없음:
   ```bash
   git ls-files | rg '(^|/)\.orchestrator/|^\.claude/'
   ```
   기대 결과: 출력 없음.

2. workstation 절대경로 없음:
   ```bash
   local_path_pattern='/U''sers/|/h''ome/[^/]+/|C:\\U''sers\\'
   git grep -n -I -E "$local_path_pattern" -- . ':!front/pnpm-lock.yaml'
   ```
   기대 결과: 출력 없음.

3. changed docs whitespace 검증:
   ```bash
   git diff --check -- .gitignore docs/improvements.md \
     docs/superpowers/specs/2026-05-09-public-repo-hygiene-remediation-spec.md \
     docs/superpowers/plans/2026-05-09-public-repo-hygiene-remediation-implementation-plan.md
   ```

4. clean public release candidate 검증:
   ```bash
   ./scripts/build-public-release-candidate.sh
   ./scripts/public-release-check.sh .tmp/public-release-candidate
   ```

5. tracked archive secret scan:
   ```bash
   tmp="$(mktemp -d)"
   git archive HEAD | tar -x -C "$tmp"
   gitleaks dir "$tmp" --config "$tmp/.gitleaks.toml" --no-banner --redact=100 --verbose
   rm -rf "$tmp"
   ```

`./scripts/public-release-check.sh`를 인자 없이 실행하는 current-tree mode는 ignored 로컬 운영 백업까지
`gitleaks dir`로 읽을 수 있다. 본 스팩은 ignored 파일을 제외하기로 했으므로, current-tree mode가 ignored
파일 때문에 실패하는 것은 본 task의 실패 조건이 아니다. 대신 clean candidate check와 tracked archive
scan을 통과 조건으로 삼는다.

---

## 수용 기준

- `.orchestrator/`와 `.claude/`가 Git 추적 대상에서 제거된다.
- `.gitignore`에 `.orchestrator/`와 `.claude/`가 들어 있다.
- `docs/improvements.md`에는 workstation 절대경로가 없다.
- clean public release candidate가 `scripts/public-release-check.sh`를 통과한다.
- tracked archive가 `gitleaks dir`를 통과한다.
- final response 또는 PR description은 ignored 파일을 제외한 검증 범위를 명확히 적는다.

## 후속 과제

- 새 commit부터 개인 email 대신 GitHub noreply email을 쓰도록 local Git config를 설정한다.
- JVM dependency vulnerability scanner를 CI에 추가한다.
- ignored 운영 secret 백업은 repository 밖의 encrypted storage 또는 password manager로 옮긴다. 이 작업은
  본 스팩의 범위를 벗어난다.
