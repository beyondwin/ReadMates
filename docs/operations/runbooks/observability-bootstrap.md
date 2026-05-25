# Observability Bootstrap

운영자가 OCI VM에서 Prometheus + Alertmanager를 처음 띄울 때 따라가는 절차.

## 사전 준비

OCI VM의 `.env`(또는 systemd EnvironmentFile)에 6개 변수 채우기:

```
READMATES_ALERT_SMTP_HOST=...
READMATES_ALERT_SMTP_PORT=587
READMATES_ALERT_SMTP_USER=...
READMATES_ALERT_SMTP_PASSWORD=...
READMATES_ALERT_SMTP_FROM=alerts@<운영 도메인>
READMATES_ALERT_EMAIL_TO=<운영자 이메일>
```

## Bring-up

```bash
cd /opt/readmates/deploy/oci
docker compose -f compose.infra.yml up -d prometheus alertmanager
```

## Smoke check

1. Target healthy: `docker exec readmates-prometheus wget -qO- http://localhost:9090/api/v1/targets | grep -c '"health":"up"'` — 3 이상이어야 (server, prometheus-self, alertmanager).
2. Alertmanager ready: `docker exec readmates-alertmanager wget -qO- http://localhost:9093/-/ready` — 200 OK.
3. Rule load: `docker exec readmates-prometheus wget -qO- http://localhost:9090/api/v1/rules | grep -c '"name"'` — 최소 6 그룹.
4. Test alert: Prometheus expr 브라우저에서 `vector(1)`로 임시 룰 추가 또는 alertmanager API에 `amtool alert add` — 운영자 inbox 수신 확인. (구체 절차는 alertmanager 공식 docs 참조.)

## Trouble

- `up{job="readmates-server"} == 0`: app container가 `READMATES_MANAGEMENT_ADDRESS=0.0.0.0` 설정인지, docker network에 같이 떠 있는지 확인.
- SMTP 실패: `docker logs readmates-alertmanager | grep 'failed to send email'`. SMTP 자격증명 / smarthost 확인.
- Notification backlog alert: §`notification-backlog` 참고 — outbox 직접 SQL drill-down.

## 후속

- 1주 후 첫 SLO 측정치는 `slo-monthly-report.md` 절차로 `docs/operations/slo-reports/2026-06.md`에 기록.
