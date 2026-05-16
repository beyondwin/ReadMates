# Operations

ReadMates 운영 관련 문서를 모은 진입점입니다. 배포 절차는 `docs/deploy/`, 개발 절차는 `docs/development/`를 참조하세요.

## 하위 문서

- [Runbooks](runbooks/README.md) — 반복 운영 절차, 배포 attempt, 읽기 전용 진단, 배포 후 관찰.
- [Post-mortems](postmortems/README.md) — 발생한 incident의 회고 기록.
- [Observability](observability/README.md) — 메트릭, 대시보드, 알림 룰, SLO.

## Request correlation

ReadMates는 모든 요청에 `X-Readmates-Request-Id`를 BFF에서 생성/수용해 Spring 로그, outbox row, Kafka header, consumer 로그까지 동일 값으로 전파합니다. 조회 절차는 [correlation id lookup runbook](runbooks/correlation-id-lookup.md)을 참고합니다.
