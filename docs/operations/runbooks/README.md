# Runbooks

ReadMates 운영자가 반복적으로 수행하는 배포, 진단, 장애 대응 절차를 모은 문서입니다. 배포 대상의 실제 VM IP, private host, OAuth secret, BFF secret, DB password, SMTP credential, smoke 결과 전문은 Git에 기록하지 않습니다.

## 원칙

- 실패한 배포나 진단 명령을 자동 재시도하지 않습니다. 실패 stage와 증거를 남기고 운영자가 다음 행동을 결정합니다.
- 운영 진단은 가능한 한 읽기 전용 command로 제한합니다.
- Claude나 다른 자동화 도구에 production 진단을 맡길 때는 진단 전용 SSH 키와 server-side ForceCommand를 사용합니다.
- runbook command에는 placeholder를 사용합니다. 실제 값은 VM, provider console, 또는 Git 밖 운영 채널에서만 다룹니다.

## 문서

- [Deploy attempts](deploy-attempts.md) — 배포 attempt 상태 모델, JSONL ledger, 실패 stage별 대응.
- [Read-only diagnostics](read-only-diagnostics.md) — 진단 전용 SSH 키와 collector 운영.
- [Observability bootstrap](observability-bootstrap.md) — OCI VM에서 Prometheus + Alertmanager를 처음 올리는 초기 설정과 smoke check.
- [Post-deploy watch](post-deploy-watch.md) — 배포 직후 health, BFF/OAuth smoke, recent log scan 절차.
- [Correlation ID lookup](correlation-id-lookup.md) — 단일 `requestId`로 BFF/Spring/outbox/Kafka/consumer 로그 조인.
- [Deploy observability check](deploy-observability-check.md) — 배포 전후 Prometheus rule, Grafana dashboard, local provisioning, request correlation 증거와 한계를 분리해 확인.
- [AI session generation](ai-session-generation.md) — in-app AI 세션 생성의 model allowlist, cap 운영, provider key 회전, kill switch, alert/PII 진단 절차.
- [DB backup & restore](db-backup.md) — 일일 자동 백업 systemd timer, 릴리스 전 수동 백업, OCI Object Storage 객체 검증, 복구 절차.
- [Secrets management](secrets-management.md) — GitHub Repository Secrets와 sync-config 워크플로 기반 SSH-less 시크릿 추가·회전.
- [SLO monthly report](slo-monthly-report.md) — 매월 첫 주에 6개 SLO를 Prometheus에서 측정해 `docs/operations/slo-reports/`로 기록하는 절차.
- [VM deploy key bootstrap](vm-deploy-key-bootstrap.md) — 신규 OCI VM에 GitHub Actions deploy 키를 1회 연결하는 초기 설정.

## 관련 문서

- [OCI Compose Stack](../../deploy/compose-stack.md)
- [OCI backend](../../deploy/oci-backend.md)
- [Observability](../observability/README.md)
- [Post-mortems](../postmortems/README.md)
