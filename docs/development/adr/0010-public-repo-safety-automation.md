# ADR-0010: 공개 저장소 안전 자동화 (gitleaks + custom scanner)

- 상태: Accepted
- 결정일: 2026-04-22
- 작성자: 운영/보안
- 관련: ADR-0005 (BFF secret rotation),
  `scripts/build-public-release-candidate.sh`,
  `scripts/public-release-check.sh`,
  `scripts/verify-public-release-fixtures.sh`,
  `.gitleaks.toml`,
  `docs/deploy/security-public-repo.md`

## 컨텍스트

ReadMates는 운영 중인 서비스의 코드베이스를 포트폴리오 목적으로 GitHub public repository로 공개한다. 운영 코드를 그대로 공개할 때 발생할 수 있는 위험은 세 가지다:

### 1. Secret 누출

환경 변수, API key, BFF shared secret, DB password, OAuth client secret이 코드 또는 주석에 포함될 수 있다. 특히:
- `READMATES_BFF_SECRET`, `READMATES_BFF_SECRETS` — Cloudflare Pages Functions BFF 인증 키 (ADR-0005)
- `SPRING_DATASOURCE_PASSWORD` — OCI MySQL 연결 자격증명
- `GOOGLE_CLIENT_SECRET` — Google OAuth 클라이언트 시크릿
- git history 전체를 스캔해야 한다. 현재 코드에서 제거해도 과거 commit에 남아 있을 수 있다.

### 2. 실명 회원 정보 노출

테스트 fixture, seed 데이터, 주석에 실제 사용자의 이메일, 이름이 포함될 수 있다. `@gmail.com` 주소가 코드에 나타나서는 안 된다.

### 3. 내부 배포 정보 노출

- OCI OCID(Oracle Cloud resource identifier): `ocid1.instance.oc1...` 형식. 운영 인프라 자원 식별자가 노출되면 대상이 특정된다.
- 내부 호스트명: 운영 MySQL 호스트, 내부 DNS 이름.
- 로컬 개발 환경의 절대 경로: macOS의 홈 디렉토리 기반 경로 — 기여자의 로컬 경로가 주석이나 하드코딩으로 남을 수 있다.
- 실제 서비스 도메인: 등록된 운영 도메인명. 구현 코드에 직접 사용하면 노출됨.

### 기존 수동 리뷰의 한계

단순 `.gitignore` 추가나 manual review만으로는 반복적인 확인이 어렵다. 새 파일이나 주석 한 줄이 추가될 때마다 수동으로 스캔하는 것은 실수가 발생하기 쉽다.

특히 다음 상황에서 놓치기 쉽다:
- 테스트 코드에 임시로 추가한 실제 이메일이 PR 리뷰에서 빠질 때
- 주석에 OCI OCID나 내부 호스트를 복사해 붙일 때
- `.env.example`에 실제 값을 실수로 커밋할 때

### 검토한 접근

- **gitleaks 단독**: 알려진 secret 패턴에 대한 regex 기반 스캔. 강력하지만 OCI OCID, Gmail, 로컬 경로, ReadMates 도메인 같은 ReadMates-specific 패턴은 별도로 추가해야 한다.
- **GitHub secret scanning만**: push 후 GitHub이 스캔한다. CI/CD 파이프라인 early stage에서 결과를 받을 수 없고, local에서 실행할 수 없다. false positive 관리가 불편하다.
- **수동 리뷰 체크리스트**: 매 PR에서 수동으로 확인. 피로도로 인해 실수 가능성이 높다.
- **Git pre-commit hook**: local 개발에서는 유용하지만 hook을 우회하거나 설정되지 않은 환경에서는 동작하지 않는다.

## 결정

3단계 검증 체계를 구축한다.

### 1단계: 공개 릴리즈 후보 clean manifest 생성

`scripts/build-public-release-candidate.sh`:

금지된 경로를 제외한 clean tree를 `.tmp/public-release-candidate/`에 생성한다.

허용 경로(whitelist)는 `is_allowed_candidate_root()`에 정의된다:
- `front/`, `server/`, `deploy/oci/`(일부), `docs/deploy/`, `docs/development/`, `docs/superpowers/`
- `scripts/build-public-release-candidate.sh`, `scripts/public-release-check.sh`, `scripts/smoke-production-integrations.sh`, `scripts/verify-public-release-fixtures.sh`

금지 경로 패턴은 `build-public-release-candidate.sh:403`의 `is_forbidden_candidate_path()`에 정의된다:

파일 확장자 기반 금지:
- `.env*`, `*.env`, `*.pem`, `*.key`, `*.p8`, `*.p12`, `*.pfx`, `*.jks` — 환경 설정, 인증서, 개인 키
- `*.sql.gz`, `*.dump`, `*.db`, `*.sqlite*`, `*.bak` — DB dump/백업
- `*.tfstate`, `*.state` — Terraform 상태 파일

경로 패턴 기반 금지:
- `node_modules`, `front/dist`, `server/build`, `server/.gradle` — 빌드 산출물
- `design/`, `.gstack/`, `.superpowers/`, `.idea/` — 내부 도구
- `.wrangler/`, `.cloudflare/`, `.vercel/`, `.terraform/`, `.pulumi/` — cloud provider 로컬 상태
- `private/`, `recode/`, `.tmp/`, `output/` — 내부 전용 디렉토리
- `screenshot*`, `*screenshot*` — 스크린샷 파일

### 2단계: gitleaks + targeted scanner 실행

`scripts/public-release-check.sh`:

**gitleaks** (`useDefault = true` + ReadMates-specific rules):

`.gitleaks.toml:6-34`에 5개 custom rule 정의:

```
[[rules]]
id = "readmates-private-key-block"
regex = '''-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----'''
keywords = ["PRIVATE KEY"]

[[rules]]
id = "readmates-oci-ocid"
regex = '''ocid1[.][a-z0-9][a-z0-9._-]{16,}'''
keywords = ["ocid1."]

[[rules]]
id = "readmates-github-token"
regex = '''(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})'''
keywords = ["ghp_", "gho_", "github_pat_"]

[[rules]]
id = "readmates-openai-or-api-key"
regex = '''(?i)(?:\bsk-[A-Za-z0-9][A-Za-z0-9_-]{20,}\b|...)'''
keywords = ["sk-", "AIza", "OPENAI_API_KEY", "API_KEY"]

[[rules]]
id = "readmates-real-secret-assignment"
regex = '''(?i)(?:READMATES_BFF_SECRET|SPRING_DATASOURCE_PASSWORD|MYSQL_ADMIN_PASS|...)...'''
keywords = ["READMATES_BFF_SECRET", "SPRING_DATASOURCE_PASSWORD", ...]
```

**allowlist** (`.gitleaks.toml:36-51`):

```
[[allowlists]]
description = "Documented placeholders and local/test-only secrets"
regexes = [
  '''(?i)<(?:db-password|secret|shared-secret|shared-bff-secret|...)>''',
  '''(?i)\$\{(?:READMATES_BFF_SECRET|BFF_SECRET|APP_DB_PASS|...)(?::[^}]*)?\}''',
  '''(?i)\b(?:local-dev-secret|e2e-secret|test-secret|test-bff-secret|wrong-secret)\b''',
  '''(?i)\b(?:host|member[0-9]+|new[.]member)@example[.]com\b'''
]

[[allowlists]]
description = "Secret scanning config contains scanner regexes, not credentials"
paths = ['''^\.gitleaks\.toml$''']
```

**targeted scanner** (`public-release-check.sh:344-350`):

gitleaks 외에 추가 패턴을 bash `grep -E`로 검사한다:

```bash
# 실제 패턴은 scripts/public-release-check.sh:344-350 참조
run_content_check "OCI OCID"              '<ocid1-pattern>'
run_content_check "Gmail address"         '<gmail-regex>'
run_content_check "private club domain"   '<private-domain-regex>'
run_content_check "local workstation path" '<homedir-path-regex>'
run_content_check "private key block"     '<private-key-header-regex>'
run_content_check "GitHub token"          '<github-token-regex>'
run_content_check "real-looking DB/BFF secret" '<secret-assignment-regex>'
```

### 3단계: scanner pattern 자체 검증

`scripts/verify-public-release-fixtures.sh`:

scanner가 실제로 금지 패턴을 감지하는지 fixture로 검증한다. "이 패턴이 스캔되어야 한다"는 fixture를 정의하고, scanner가 해당 fixture에서 finding을 보고하는지 확인한다. scanner가 fixture를 통과하면(finding 없음) fixture 검증이 실패한다. scanner 자체의 회귀(새 regex에서 패턴을 놓치는 경우)가 CI에서 발견된다.

## 근거

### Fixture-driven validation으로 false negative 방지

scanner를 단순히 실행하는 것만으로는 "이 패턴이 실제로 스캔되는가"를 확인할 수 없다. `verify-public-release-fixtures.sh`는 scanner pattern 자체를 테스트한다. 새 secret 패턴이 발견되면 fixture에 추가하고, scanner가 해당 fixture를 감지하는지 확인한 후 release를 진행한다. "deny-list 갱신 → fixture 갱신 → scanner 검증 → release" 사이클이 명확해진다.

### allowlist로 false positive 관리

placeholder와 테스트 전용 값이 scanner를 트리거하지 않도록 `.gitleaks.toml:[[allowlists]]`에 명시적으로 관리한다. allowlist가 코드에 있으므로 "왜 이 패턴이 허용되는가"가 git history에 기록된다.

예: `local-dev-secret`, `test-bff-secret`, `wrong-secret` — 테스트 코드에서 잘못된 secret 검증에 사용하는 값. `${READMATES_BFF_SECRET}` 형식 — 환경 변수 참조이므로 실제 secret이 아님. `host@example.com`, `member1@example.com` — 테스트 전용 placeholder.

`.gitleaks.toml` 파일 자체는 scanner regex를 포함하므로, `.gitleaks.toml` 파일 경로 전체를 allowlist path로 제외한다 (`.gitleaks.toml:47-51`).

### clean manifest가 scanner 대상을 좁힌다

1단계에서 생성한 clean manifest만 scanner가 검사한다. `node_modules`, `server/build`, `design/`, `.gstack/` 같은 내부 경로가 scanner 대상에서 미리 제외된다. scanner가 더 빠르고 false positive가 줄어든다.

### 스크립트가 공개되므로 패턴 자체가 포트폴리오

세 스크립트가 `scripts/` 아래 공개된다. 같은 문제를 가진 다른 팀이 이 패턴을 fork해서 사용할 수 있다. ReadMates의 공개 repo 운영 모델이 스스로 포트폴리오의 일부가 된다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| gitleaks 단독 (custom rule 없이) | OCI OCID, Gmail, 로컬 경로, ReadMates 도메인 같은 ReadMates-specific 위험이 기본 gitleaks 규칙에 포함되지 않는다. tailored scanner가 필요하다. |
| GitHub secret scanning만 | push 후 GitHub이 스캔하므로, CI/CD 파이프라인 early stage에서 결과를 받을 수 없다. PR review 전에 local에서 실행할 수 없다. false positive 알림을 repo settings에서 관리해야 해 번거롭다. |
| 수동 리뷰 체크리스트 | 피로도로 인한 실수 가능성이 높다. 새 패턴 추가 시 checklist를 업데이트해야 하는데, 이 과정이 자동화되지 않는다. |
| Git pre-commit hook만 | local 개발에서는 유용하지만 hook을 우회하거나(`--no-verify`) hook이 설정되지 않은 환경에서는 동작하지 않는다. CI 레벨의 강제가 필요하다. pre-commit hook과 CI를 병행하면 가장 이상적이지만, hook이 없어도 CI가 보장한다. |
| Detect-secrets (Yelp) | Python 기반 도구다. entropy 분석이 강점이지만, ReadMates-specific 패턴(OCID, 도메인)은 custom plugin이 필요하다. 기존 gitleaks + bash scanner로 충분한 커버리지가 달성되어 추가 도구 불필요. |
| Trufflehog | git history 전체를 entropy 분석하는 도구다. 강력하지만 scan 시간이 길다. CI 매 PR에서 full history scan은 실용적이지 않다. gitleaks의 regex 기반 스캔이 더 빠르다. |

## 결과

긍정적:
- 공개 repo 운영 중 secret 누출 위험이 자동화된 스캔으로 지속적으로 차단된다.
- fixture-driven validation으로 scanner 자체의 회귀(false negative)가 발견된다.
- allowlist와 placeholder 정책이 코드(`.gitleaks.toml`)에 명시되어 있어 의도가 명확하다. git history에서 추적 가능하다.
- clean manifest 생성이 scanner 대상을 최소화해 scanner 실행이 빠르다.
- 스크립트가 공개되어 다른 팀이 재사용할 수 있다.

부정적/감수한 비용:
- 새 환경 변수나 비밀 패턴을 추가할 때마다 scanner allowlist 또는 deny-list를 동기화해야 한다. 이 동기화를 잊으면 false positive로 release가 차단된다.
- `.gitleaks.toml`의 allowlist regex가 잘못 작성되면 실제 secret이 허용될 수 있다. allowlist 변경 시 `verify-public-release-fixtures.sh`로 검증 필요.
- gitleaks의 regex 기반 스캔은 entropy 분석 없이 패턴 매칭만 한다. 완전히 새로운 형태의 secret은 regex가 없으면 감지하지 못한다.
- targeted scanner가 bash `grep -E` 기반이라 false positive/negative tuning이 regex 문법에 의존한다. 복잡한 경계 조건 처리가 어렵다.

## 검증

scanner 실행:
```bash
./scripts/public-release-check.sh
```

scanner pattern 자체 검증:
```bash
./scripts/verify-public-release-fixtures.sh
```

기대: 모든 스캔 통과. finding 없음.

공개 릴리즈 후보 전체 검증:
```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

기대: clean manifest 생성 성공 + scanner 통과.

scanner regression 검증:
- fixture에 OCI OCID 형식 문자열(`<ocid-format-example>` — 실제 fixture에는 `ocid1.<resource>.<realm>.<region>.<id>` 형식의 표본 값 사용) 삽입 → `verify-public-release-fixtures.sh` 실행 → `readmates-oci-ocid` finding 보고 확인
- `.gitleaks.toml`에 새 allowlist 추가 후 `public-release-check.sh` 재실행 → false positive가 사라지는지 확인

## 후속 작업

- scanner를 SARIF(Static Analysis Results Interchange Format)로 export해 GitHub code scanning에 통합. PR에서 scanner finding이 GitHub UI에 inline으로 표시된다.
- IP hash salt(`READMATES_IP_HASH_BASE_SECRET`) 패턴을 `.gitleaks.toml` custom rule에 추가 검토.
- 새 환경 변수 추가 프로세스에 scanner 동기화 체크 추가: "환경 변수 추가 시 `.gitleaks.toml`과 allowlist를 함께 검토한다"는 PR 체크리스트 항목.
- pre-commit hook으로 local 개발에서 `public-release-check.sh`를 자동 실행해 CI 이전에 조기 발견.
- entropy 분석 보강: gitleaks의 `entropy` 옵션 또는 Trufflehog를 release tag 시 1회 full scan으로 실행하는 방안 검토.
