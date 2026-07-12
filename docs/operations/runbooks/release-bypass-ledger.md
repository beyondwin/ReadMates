# Release Bypass Ledger

ReadMates의 branch protection 또는 정상 release review 경로를 우회해야 할 때 사용하는 기록 절차입니다. 로컬 branch merge만 수행했거나 GitHub의 보호 규칙을 실제로 우회하지 않았다면 ledger entry를 만들지 않습니다.

## 사용 조건

- 정상 CI 또는 scanner 실패는 bypass 대상이 아닙니다. 실패 원인을 먼저 수정합니다.
- reviewer가 존재하지 않는 solo-admin 환경의 `POLICY_MISMATCH`, 또는 즉시 대응해야 하는 incident에서만 사용합니다.
- DB migration, public API, auth/permission, secret handling, deploy workflow, CI/CD 변경은 가능한 경우 release PR과 외부 review를 우선합니다.
- 우회 후에도 실행 가능한 검증은 모두 수행하고, 생략한 검증은 이유와 종료 조건을 함께 기록합니다.

## 기록 위치

해당 release의 GitHub Release `Deployment Notes` 또는 release PR 설명에 아래 템플릿을 남깁니다. 저장소에 기록해야 하면 `CHANGELOG.md`의 해당 version `Deployment Notes` 또는 `docs/development/release-readiness-review.md`가 가리키는 public-safe report를 사용합니다.

실제 member data, 운영 host/domain, OCID, token, secret, private endpoint, 원본 로그는 기록하지 않습니다. 민감한 incident 증거는 Git 밖 운영 채널에 보관하고 공개 기록에는 sanitized summary와 참조 식별자만 남깁니다.

## 템플릿

```markdown
### Release bypass

- Classification: POLICY_MISMATCH | INCIDENT
- Release/commit: <public tag or commit>
- Reason: <why the normal protected path could not be used>
- Affected high-control surfaces: <none or public-safe paths>
- Checks completed: <commands and summarized results>
- Checks skipped or failed: <none or reason>
- Follow-up owner and deadline: <role and public-safe date>
- Closure evidence: <release PR, workflow run, release note, or sanitized incident reference>
```

## 종료 조건

다음 항목이 모두 확인되면 entry를 닫습니다.

1. 우회 사유와 영향 범위가 기록되어 있습니다.
2. 생략하거나 실패한 검증이 없거나, 후속 검증 결과가 closure evidence에 연결되어 있습니다.
3. tag workflow, image promotion, migration, smoke처럼 배포 후에만 가능한 항목은 실제 결과가 기록되어 있습니다.
4. 같은 `POLICY_MISMATCH`가 반복되면 branch protection 또는 reviewer 구성을 조정할 후속 작업이 만들어져 있습니다.

## 관련 문서

- [Release management](../../development/release-management.md#branch-protection-bypass-policy)
- [Release readiness review](../../development/release-readiness-review.md)
- [Release publish runbook](../../deploy/release-publish-runbook.md)
