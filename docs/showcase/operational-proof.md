# Operational Proof

이 문서는 ReadMates가 기능 구현 뒤 release, deploy, observability, incident learning까지 어떻게 닫는지 보여주는 reviewer-facing guide입니다.

## Release Evidence Flow

```text
Change
  -> targeted local checks
  -> release readiness review
  -> public release candidate build/check
  -> changelog/release note update
  -> deploy runbook
  -> smoke/post-deploy watch
  -> postmortem when an incident occurs
```

## Evidence Links

| Stage | Evidence |
| --- | --- |
| Release readiness | `docs/development/release-readiness-review.md` |
| Public release candidate | `scripts/build-public-release-candidate.sh`, `scripts/public-release-check.sh`, `scripts/README.md` |
| Public repository safety | `docs/deploy/security-public-repo.md` |
| Deploy runbooks | `docs/deploy/README.md`, `docs/deploy/release-publish-runbook.md` |
| Observability | `docs/operations/observability/README.md` |
| Post-deploy watch | `docs/operations/runbooks/post-deploy-watch.md` |
| Incident learning | `docs/operations/postmortems/README.md` |

## Product Loop Evidence

Host/member reading-loop changes should close both product and evidence work:

```text
Host operating action
  -> role-safe reading-loop state
  -> member next reading action
  -> current-session / notes / archive / feedback continuity
  -> focused unit/route/E2E checks
  -> showcase and changelog update
  -> public release candidate scan when public-facing docs change
```

The loop is private by permission. Public docs describe it through sanitized tests and source references rather than opening member or host routes to guests.

The host/member loop also has desktop/mobile screenshot evidence for host operating signals and member reading-prep states. Screenshots are generated from public-safe route mocks or dev fixtures and stay in Playwright output, not in the repository.

## Analytics Confidence Evidence

Admin analytics should prove both operator value and release confidence:

```text
Aggregate-only analytics contract
  -> honest availability state
  -> operator drilldown route
  -> query budget guard
  -> visual evidence artifact
  -> public release safety scan when docs or public surfaces change
```

Analytics evidence must stay aggregate-only. It should not include real member data, private domains, raw provider errors, transcripts, generated session bodies, or deployment identifiers.

## Operating Principle

Passing tests is evidence, not proof that release risk is closed. Release readiness review also checks changelog coverage, operator-facing behavior changes, CI/deploy script risks, security-code hygiene, architecture-test baselines, and public-release safety.

## Public-Safe Incident Learning

Incident writeups should explain:

- trigger and customer/operator impact
- detection path
- rollback or mitigation
- root cause
- prevention added to code, tests, scripts, or runbooks

Incident writeups must not include real member data, private domains, secrets, raw provider payloads, local paths, or deployment identifiers.
