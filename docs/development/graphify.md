# Graphify 개발 워크플로

Graphify는 ReadMates의 코드, 문서, SQL schema를 로컬 지식 그래프로 추출해 탐색을 빠르게 하는 개발 보조 도구입니다. Graphify 결과는 source of truth가 아닙니다. 현재 동작의 기준은 실제 코드, 테스트, migrations, scripts, `docs/development/architecture.md`, 그리고 관련 `docs/agents/*` guide입니다.

## 사용 목적

- 코드베이스 질문의 시작점을 빠르게 찾습니다.
- frontend, BFF, server, migration, 운영 문서 사이의 연결을 탐색합니다.
- 공개 가능한 아키텍처 증거를 만들 때 후보 자료를 생성합니다.
- 에이전트가 영향 범위를 좁힌 뒤 실제 파일을 직접 검증하게 합니다.

## 분석 범위

`.graphifyignore`가 Graphify 입력 범위를 제한합니다.

포함하는 주요 범위:

- `front/src`, `front/features`, `front/shared`, `front/functions`
- `server/src/main`, `server/src/test`, `server/config`
- Flyway migration SQL and dev seed SQL
- `docs/agents`, `docs/development`, `docs/deploy`, `docs/operations`
- `docs/case-studies`, `docs/showcase`
- `scripts`, `deploy`, `ops`
- `design/system`, `design/docs`
- root docs and config such as `README.md`, `AGENTS.md`, `CHANGELOG.md`, `.github/workflows`

기본 제외 범위:

- dependency, build output, coverage, test result
- local runtime/tool state
- private docs and deployment-local state
- `docs/superpowers` historical planning archive
- generated `graphify-out` files

특정 과거 의사결정의 맥락이 필요하면 `docs/superpowers`의 개별 spec이나 plan을 직접 열어 확인합니다. Graphify 기본 입력으로 historical archive 전체를 넣지는 않습니다.

## 기본 명령

현재 설치 확인:

```bash
graphify --version
```

처음 생성:

```bash
graphify .
```

변경분 갱신:

```bash
graphify update .
```

질의:

```bash
graphify query "what connects frontend route guards to server membership authorization?"
graphify query "show the platform admin API and UI surfaces"
graphify query "which files define public release safety checks?"
```

아키텍처 export 후보 생성:

```bash
graphify export callflow-html
```

Export 결과는 바로 커밋하지 않습니다. 먼저 public-safety review를 통과해야 합니다.

## 에이전트 사용 원칙

1. 코드베이스 질문, 영향 범위, cross-surface architecture 탐색이면 Graphify query로 관련 파일 후보를 좁힙니다.
2. Graphify 결과에서 나온 파일을 실제로 열어 확인합니다.
3. 변경 전에는 루트 `AGENTS.md`가 지시하는 surface guide를 읽습니다.
4. Graphify 결과와 실제 코드가 충돌하면 실제 코드, 테스트, migration, active docs를 우선합니다.
5. Release readiness나 residual risk review는 Graphify query가 아니라 branch diff와 `docs/development/release-readiness-review.md`를 기준으로 합니다.

## 커밋 정책

Local-only 산출물:

- `graphify-out/manifest.json`
- `graphify-out/cost.json`
- `graphify-out/cache/`
- `graphify-out/.graphify_labels.json`
- `graphify-out/.graphify_root`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`
- `graphify-out/graph.html`

Review-gated commit candidates:

- public-safe callflow or architecture export
- curated markdown copied into `docs/showcase` or `docs/development`

`graphify-out/GRAPH_REPORT.md`와 `graphify-out/graph.json`은 에이전트 질의 품질에는 유용하지만 공개 repo에 내부 연결과 문서 추출 결과를 과하게 남길 수 있습니다. 기본 생성물은 local-only로 유지하고, 공개 후보가 필요하면 검토한 내용을 `docs/showcase` 또는 `docs/development` 아래 curated 문서로 옮깁니다.

## Public-Safety Review

Graphify 산출물을 커밋 후보로 올리기 전에 다음을 확인합니다.

```bash
scan_paths="docs/showcase docs/development"
test -d graphify-out && scan_paths="graphify-out ${scan_paths}"
rg -n "(^|[^A-Za-z0-9_])(sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_[A-Za-z0-9_]+|AKIA[0-9A-Z]{16}|ocid1\\.|BEGIN (RSA|OPENSSH|PRIVATE) KEY|/[U]sers/|/[Hh]ome/[^[:space:]]+)" ${scan_paths}
```

허용하지 않는 내용:

- secret, token-shaped value, API key, session cookie, OAuth code
- real member data, private email, private domain
- local absolute path, deployment state, OCID
- provider raw error, transcript, private feedback document body
- current code/docs와 충돌하는 inferred relationship

Docs/config만 바꾼 경우 기본 검증:

```bash
git diff --check -- .graphifyignore .gitignore AGENTS.md docs/development/graphify.md docs/development/README.md
```

Public release 정책이나 배포 공개 산출물을 바꾸는 경우에는 루트 `AGENTS.md`의 public release checks를 따릅니다.

## 문제 해결

- `graphify` 명령이 없으면 설치를 먼저 끝내고 이 문서의 명령을 다시 실행합니다.
- Graphify 결과가 너무 크면 `.graphifyignore`에 generated output이나 historical archive가 빠졌는지 확인합니다.
- Graphify query가 불명확하면 질문을 파일, route, package, API path 중심으로 좁힙니다.
- 산출물에 public-safety risk가 보이면 해당 산출물은 커밋하지 않고 local-only로 유지합니다.
