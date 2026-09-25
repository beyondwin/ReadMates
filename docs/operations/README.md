# Operations

ReadMates 운영 문서의 진입점입니다. 배포 절차는 `docs/deploy/`, 개발 절차는 `docs/development/`를 봅니다.

## 하위 문서

- [Runbooks](runbooks/README.md) — 배포, 진단, 장애 대응처럼 반복하는 운영 절차.
- [Post-mortems](postmortems/README.md) — 지난 incident 회고.
- [Observability](observability/README.md) — 메트릭, 대시보드, 알림 룰, SLO. 처음 올릴 때는 [observability bootstrap runbook](runbooks/observability-bootstrap.md)을 따릅니다.

## Request correlation

BFF는 모든 요청에 `X-Readmates-Request-Id`를 만들거나 그대로 전달합니다. 같은 값이 Spring 로그, notification outbox row, Kafka header, consumer 로그까지 이어집니다. 조회 방법은 [correlation id lookup runbook](runbooks/correlation-id-lookup.md)을 봅니다.
