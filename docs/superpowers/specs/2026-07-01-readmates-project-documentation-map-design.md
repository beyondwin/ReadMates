# ReadMates Project Documentation Map Design

작성일: 2026-07-01
상태: APPROVED DESIGN SPEC
대상 표면: project documentation, agent routing, developer onboarding

## 1. 배경

ReadMates 문서는 이미 제품, 아키텍처, 로컬 실행, 테스트, 배포, 운영, case study, 과거 spec/plan 기록을 넓게 보유한다. 문제는 문서 부족이 아니라 처음 보는 개발자나 에이전트가 현재 source of truth와 역사 기록을 빠르게 구분하기 어렵다는 점이다.

현재 active docs는 `README.md`, `docs/README.md`, `docs/development/README.md`, `docs/development/architecture.md`, `docs/development/new-developer-onboarding-guide.md`, `docs/agents/*.md`에 분산되어 있다. 반면 `docs/superpowers/**`에는 많은 과거 design spec과 implementation plan이 쌓여 있다. 이 archive는 의사결정 맥락으로는 유용하지만 현재 동작의 기준이 아니다.

이번 개선은 문서 전체 재배치가 아니라, 에이전트와 개발자가 같은 current source of truth로 수렴하도록 얇은 project map을 추가하고 기존 entrypoint를 정렬하는 작업이다.

## 2. 목표

성공 기준:

- 에이전트가 처음 5분 안에 작업 표면, 읽을 guide, source of truth, 최소 검증 명령을 고를 수 있다.
- 신규 개발자가 처음 하루 안에 제품 표면, 코드 지형, 문서 지형, 로컬 실행/검증 흐름을 자연스럽게 따라갈 수 있다.
- `docs/superpowers/**`와 `docs/reports/**`가 현재 source of truth가 아니라 historical archive 또는 snapshot이라는 경계를 더 명확히 한다.
- `README.md`, `docs/README.md`, `docs/development/README.md`, `AGENTS.md`, `docs/agents/docs.md`는 길게 늘리지 않고 새 project map으로 연결한다.
- 새 지도 문서는 `docs/development/architecture.md`를 대체하지 않고, 충돌 시 코드, 테스트, migrations, scripts, architecture 문서를 우선하도록 명시한다.
- public repo safety 규칙을 유지하고 secret, 실제 멤버 데이터, private domain, deployment state, local absolute path, OCID, token-shaped 예시는 추가하지 않는다.

## 3. Non-goals

- `docs/` 디렉터리 전체 IA를 대규모로 재배치하지 않는다.
- `docs/superpowers/**`를 이동, 삭제, 요약, 재작성하지 않는다.
- 과거 spec/plan을 현재 동작 문서로 승격하지 않는다.
- 코드, 테스트, 배포 스크립트, migration, runtime 설정을 변경하지 않는다.
- Graphify 산출물을 커밋하지 않는다.
- 운영 secret, 실제 운영 도메인, VM/IP, OCID, credential, private deployment state를 문서에 추가하지 않는다.

## 4. 선택한 접근

선택한 접근은 **Project Map + 얇은 라우터 정리**이다.

새 문서 `docs/development/project-map.md`를 추가하고, 기존 entrypoint에서 이 문서를 링크한다. 이 문서는 현재 프로젝트를 이해하기 위한 작업 지도이며, 세부 source of truth를 한 곳에 복제하지 않는다.

검토한 대안:

1. **Project Map + 얇은 라우터 정리** - 추천
   - 장점: 현재 문서 구조를 크게 흔들지 않고 에이전트와 개발자의 탐색 비용을 낮춘다.
   - 단점: 기존 README류 문서와 일부 중복될 수 있어 지도 문서는 링크 중심으로 유지해야 한다.

2. **Documentation IA 대개편**
   - 장점: 장기적으로 `current`, `archive`, `operations` 같은 구분을 더 강하게 만들 수 있다.
   - 단점: 링크 변경, public release safety, 과거 문서 참조 영향이 크고 이번 목표보다 비용이 크다.

3. **Agent-first 최소 패치**
   - 장점: `AGENTS.md`와 `docs/agents/docs.md`만 바꾸면 빠르다.
   - 단점: 신규 개발자 온보딩과 전체 문서 지형 이해 문제는 거의 남는다.

## 5. 문서 IA

개편 후 역할 분담:

| 문서 | 역할 |
| --- | --- |
| `README.md` | 외부 리뷰어와 첫 방문자를 위한 제품/기술 요약 |
| `docs/README.md` | 전체 문서 디렉터리 허브 |
| `docs/development/project-map.md` | 에이전트와 개발자가 현재 프로젝트를 빠르게 이해하는 작업 지도 |
| `docs/development/new-developer-onboarding-guide.md` | 더 긴 학습형 온보딩 |
| `docs/development/architecture.md` | 현재 제품/기술 경계의 active source of truth |
| `AGENTS.md`, `docs/agents/*.md` | 작업 전 반드시 읽는 에이전트 규칙 |
| `docs/superpowers/**` | historical design/plan archive |
| `docs/reports/**` | 작성 시점의 분석/진단 snapshot |

`project-map.md`는 다른 문서의 본문을 복제하지 않고, "어떤 작업이면 무엇을 먼저 읽고 무엇으로 검증하는가"를 답한다.

## 6. `project-map.md` 목차

문서는 길어도 150-250줄 안쪽으로 유지한다.

예상 목차:

1. **이 문서의 역할**
   - project map은 source of truth가 아니라 지도임을 명시한다.
   - 충돌 시 코드, 테스트, migrations, scripts, `architecture.md`를 우선한다.

2. **처음 5분**
   - `git status --short --branch`
   - 루트 `AGENTS.md`
   - 변경 표면 선택
   - 관련 agent guide 확인
   - 필요한 `architecture.md` 섹션 확인
   - 최소 검증 선택

3. **현재 프로젝트 표면**
   - public, member, host, platform admin, auth, BFF, operations를 짧게 표로 요약한다.
   - 상세 route와 권한 규칙은 `architecture.md`로 링크한다.

4. **코드와 문서 지형**
   - `front/`, `front/functions`, `server/`, `design/`, `scripts/`, `docs/development`, `docs/deploy`, `docs/operations`의 책임과 첫 확인 파일을 표로 정리한다.

5. **변경 유형별 읽는 순서**
   - UI/frontend
   - BFF/auth/API
   - server/persistence/migration
   - deploy/public-release/security
   - docs-only
   - release readiness

6. **검증 선택표**
   - 루트 `AGENTS.md`의 검증 규칙을 복제하지 않고, 작업 유형별 선택 가이드와 핵심 명령 링크를 둔다.

7. **역사 문서 경계**
   - `docs/superpowers/**`는 맥락 기록이다.
   - `docs/reports/**`는 작성 시점 snapshot이다.
   - 현재 동작 근거로 쓰려면 코드와 active docs로 재검증해야 한다.

8. **Graphify 사용법**
   - Graphify는 후보 탐색용이다.
   - 결과는 실제 코드, 테스트, migrations, active docs로 검증한다.
   - historical archive 전체를 기본 탐색 범위처럼 다루지 않는다.

## 7. Entry Point 변경 범위

변경은 링크 보강 중심으로 제한한다.

- `README.md`
  - "문서 사용 기준" 또는 "문서 링크"에 `docs/development/project-map.md`를 추가한다.
  - README 본문을 project map 내용으로 확장하지 않는다.

- `docs/README.md`
  - "어디로 갈지" 표에 "프로젝트 작업 지도" 항목을 추가한다.
  - directory meaning에서 active docs와 historical archive 경계를 유지한다.

- `docs/development/README.md`
  - 바로 가기와 처음 읽는 순서에 `project-map.md`를 추가한다.
  - 기존 onboarding guide는 더 긴 학습 문서로 남긴다.

- `AGENTS.md`
  - architecture questions, impact analysis, cross-surface work에서 `project-map.md`를 보조 지도처럼 활용하도록 한 줄 수준으로 추가한다.
  - 기존 guide selection, public safety, release-readiness rules를 대체하지 않는다.

- `docs/agents/docs.md`
  - 문서 구조, entrypoint, agent-routing 변경 시 `project-map.md` 정합성도 확인하도록 추가한다.
  - docs-only 검증과 public-safety scan 규칙은 유지한다.

## 8. Error Handling And Drift Control

문서 drift는 이번 작업의 주요 리스크다.

대응:

- `project-map.md`는 상세 구현 설명을 복제하지 않고 source 문서로 링크한다.
- active source of truth 우선순위를 문서 상단에 명시한다.
- `docs/agents/docs.md`에 project map 정합성 확인 규칙을 추가한다.
- release readiness나 residual risk 판단은 계속 `docs/development/release-readiness-review.md`와 branch diff를 기준으로 한다.
- Graphify 결과는 discovery support로만 설명한다.

## 9. Verification

Docs-only 검증:

```bash
git diff --check -- <changed-docs>
```

Targeted public-safety scan:

```bash
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" <changed-docs>
```

Link review:

- Newly added relative links should point to existing files.
- README and agent guide links should stay short and not duplicate large rule blocks.

No frontend, server, E2E, or public release candidate check is required unless the implementation changes deploy/public-release/scanner behavior beyond documentation links.

## 10. Acceptance Criteria

- `docs/development/project-map.md` exists and follows the approved scope.
- `README.md`, `docs/README.md`, `docs/development/README.md`, `AGENTS.md`, and `docs/agents/docs.md` link to or mention the project map where useful.
- `project-map.md` clearly distinguishes current source of truth, active docs, historical archive, and snapshots.
- The docs avoid private values, real member data, local absolute paths, OCIDs, secrets, and token-shaped examples.
- Docs-only whitespace and public-safety scans pass or skipped checks are explicitly reported.

## 11. Open Questions

No open product or architecture question remains for this design. The implementation plan should decide exact wording and line placement while keeping changes scoped to documentation entrypoints.
