# Runbooks

ReadMates 운영자가 반복하는 배포, 진단, 장애 대응 절차입니다. VM IP, private host, OAuth/BFF secret, DB password, SMTP credential, smoke 출력 전문은 Git에 남기지 않습니다.

## 원칙

- 실패한 배포나 진단 명령을 자동으로 재시도하지 않습니다. 실패 stage와 증거를 남기고 운영자가 다음 행동을 정합니다.
- 운영 진단은 가능한 한 읽기 전용 명령으로 합니다.
- Claude 같은 자동화 도구에 production 진단을 맡길 때는 진단 전용 SSH 키와 server-side `ForceCommand`를 씁니다.
- 명령 예시는 placeholder를 씁니다. 실제 값은 VM, provider console, Git 밖 운영 채널에서만 다룹니다.

## 문서

| 문서 | 언제 보나 |
| --- | --- |
| [Deploy attempts](deploy-attempts.md) | 배포 ledger를 읽거나 실패 stage를 분류할 때 |
| [Post-deploy watch](post-deploy-watch.md) | 배포 직후 health, BFF/OAuth smoke, 최근 ERROR 로그를 확인할 때 |
| [Release bypass ledger](release-bypass-ledger.md) | branch protection이나 정상 release review를 우회해야 할 때 |
| [Read-only diagnostics](read-only-diagnostics.md) | 진단 전용 SSH 키와 collector를 설치하거나 점검할 때 |
| [Correlation ID lookup](correlation-id-lookup.md) | `requestId` 하나로 Spring/outbox/Kafka/consumer 로그를 이을 때 |
| [Observability bootstrap](observability-bootstrap.md) | OCI VM에 Tempo + Prometheus + Alertmanager + Grafana를 처음 올리거나 알림에 대응할 때 |
| [Deploy observability check](deploy-observability-check.md) | 배포 전후 rule, dashboard, local provisioning, request correlation을 확인할 때 |
| [AI session generation](ai-session-generation.md) | AI 생성 장애, cost cap, provider key, kill switch, AI 알림, PII check 실패 |
| [DB backup & restore](db-backup.md) | 일일 백업 timer, 릴리스 전 수동 백업, 복구 |
| [Secrets management](secrets-management.md) | GitHub Secrets/Variables와 `sync-config`로 시크릿을 추가하거나 회전할 때 |
| [SLO monthly report](slo-monthly-report.md) | 매월 8개 SLO를 Prometheus에서 측정해 기록할 때 |
| [VM deploy key bootstrap](vm-deploy-key-bootstrap.md) | 새 OCI VM에 GitHub Actions deploy 키를 처음 연결할 때 |

## 관련 문서

- [OCI Compose Stack](../../deploy/compose-stack.md)
- [OCI backend](../../deploy/oci-backend.md)
- [Observability](../observability/README.md)
- [Post-mortems](../postmortems/README.md)
