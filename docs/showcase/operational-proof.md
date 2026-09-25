# Operational Proof

기능을 만든 뒤 릴리즈, 배포, 관찰, 장애 학습까지 어떻게 닫는지 보여 주는 리뷰어용 문서입니다.

## Release Evidence Flow

```text
Change
  -> targeted local checks
  -> Lighthouse / route-critical visual evidence when route UI quality changes
  -> release readiness review
  -> public release candidate build/check
  -> changelog/release note update
  -> deploy runbook
  -> smoke/post-deploy watch
  -> postmortem when an incident occurs
```

## Evidence Links

| 단계 | 근거 |
| --- | --- |
| 로컬 사전 점검 | `scripts/pre-push-check.sh`(`--full --release`로 integration/E2E와 공개 후보까지) |
| Release readiness | `docs/development/release-readiness-review.md` |
| 공개 릴리즈 후보 | `scripts/build-public-release-candidate.sh`, `scripts/public-release-check.sh`, `scripts/README.md` |
| 공개 저장소 안전 | `docs/deploy/security-public-repo.md` |
| 배포 runbook | `docs/deploy/README.md`, `docs/deploy/release-publish-runbook.md` |
| 버전과 배포 순서 | `docs/development/versioning.md` |
| Observability | `docs/operations/observability/README.md` |
| Lighthouse와 route UI 시각 증거 | `docs/development/test-guide.md#lighthouse-diagnostic`, `docs/development/test-guide.md#시각-회귀-컴포넌트-하니스` |
| 배포 후 관찰 | `docs/operations/runbooks/post-deploy-watch.md` |
| 장애 학습 | `docs/operations/postmortems/README.md` |

## Product Loop Evidence

host/member reading loop를 바꾸면 제품과 근거를 함께 닫습니다.

```text
Host operating action
  -> role-safe reading-loop state
  -> member next reading action
  -> current-session / notes / archive / feedback continuity
  -> focused unit/route/E2E checks
  -> showcase and changelog update
  -> public release candidate scan when public-facing docs change
```

이 loop는 권한상 비공개입니다. 공개 문서는 멤버·호스트 route를 게스트에게 열지 않고 sanitized 테스트와 소스 참조로 설명합니다.

호스트 운영 신호와 멤버 준비 상태의 desktop/mobile screenshot은 public-safe route mock이나 dev fixture로 만들고, 저장소가 아니라 Playwright 출력에만 둡니다.

## Analytics Confidence Evidence

Admin analytics는 운영 가치와 릴리즈 신뢰를 함께 증명해야 합니다.

```text
Aggregate-only analytics contract
  -> honest availability state
  -> operator drilldown route
  -> query budget guard
  -> visual evidence artifact
  -> public release safety scan when docs or public surfaces change
```

analytics 근거는 집계 값만 씁니다. 실제 멤버 데이터, private domain, provider 원문 오류, 대본, 생성된 세션 본문, 배포 식별자는 넣지 않습니다.

## Operating Principle

테스트 통과는 근거일 뿐 릴리즈 위험이 없다는 증명이 아닙니다. release readiness review는 CHANGELOG, 운영자에게 보이는 동작 변화, CI/deploy script 위험, 보안 코드 위생, architecture-test baseline, 공개 릴리즈 안전도 함께 봅니다.

## Public-Safe Incident Learning

장애 기록에는 아래를 적습니다.

- 계기와 사용자·운영자 영향
- 발견 경로
- rollback 또는 완화
- 근본 원인
- 코드, 테스트, 스크립트, runbook에 더한 재발 방지책

실제 멤버 데이터, private domain, secret, provider 원문 payload, 로컬 경로, 배포 식별자는 넣지 않습니다.
