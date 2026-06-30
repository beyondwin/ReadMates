# Observability Bootstrap

운영자가 OCI VM에서 Prometheus + Alertmanager + Grafana를 처음 띄울 때 따라가는 절차.

## 사전 준비

Alertmanager까지 같이 띄울 때는 SMTP 환경변수 6개를 준비합니다:

```
READMATES_ALERT_SMTP_HOST=...
READMATES_ALERT_SMTP_PORT=587
READMATES_ALERT_SMTP_USER=...
READMATES_ALERT_SMTP_PASSWORD=...
READMATES_ALERT_SMTP_FROM=alerts@<운영 도메인>
READMATES_ALERT_EMAIL_TO=<운영자 이메일>
```

Grafana를 같이 띄울 때는 Git 밖 운영 채널에서 admin password를 정합니다:

```
READMATES_GRAFANA_ADMIN_USER=readmates
READMATES_GRAFANA_ADMIN_PASSWORD=<긴 임의 비밀번호>
```

## 로컬 smoke

운영 VM에 올리기 전에 로컬에서 dashboard/rule/provisioning이 깨지지 않았는지 확인합니다.

```bash
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
./scripts/observability-local-smoke.sh
```

로컬 Spring Boot 서버가 `8081` management port를 열고 있으면 Prometheus target health까지 같이 확인합니다.
서버가 떠 있지 않은 상태에서는 target presence까지만 확인하고 실제 scrape health는 운영 bring-up 단계에서 확인합니다.

## Bring-up

자동 배포 스크립트를 쓰는 경우:

```bash
READMATES_GRAFANA_ADMIN_PASSWORD=<긴 임의 비밀번호> \
VM_PUBLIC_IP=<vm-public-ip> \
./deploy/oci/06-deploy-observability-stack.sh
```

Prometheus + Grafana만 먼저 붙이고 email alert는 나중에 연결하려면:

```bash
READMATES_OBSERVABILITY_SERVICES="prometheus grafana" \
READMATES_GRAFANA_ADMIN_PASSWORD=<긴 임의 비밀번호> \
VM_PUBLIC_IP=<vm-public-ip> \
./deploy/oci/06-deploy-observability-stack.sh
```

이 모드에서는 Prometheus가 `readmates-api` metric을 긁고 Grafana dashboard를 볼 수 있다. Alertmanager container는 아직 없으므로 Prometheus target 목록에서 `alertmanager`가 down으로 보일 수 있다. Email alert까지 운영하려면 SMTP env를 채운 뒤 full stack으로 다시 실행한다.

VM 안에서 직접 compose를 실행하는 경우:

```bash
cd /opt/readmates/deploy/oci
docker compose -p readmates -f compose.infra.yml up -d prometheus alertmanager grafana
```

Grafana는 VM의 `127.0.0.1:3001`에만 바인딩한다. 운영자가 로컬 브라우저로 보려면 SSH 터널을 연다:

```bash
ssh -i <ssh-key> -L 13001:127.0.0.1:3001 ubuntu@<vm-public-ip>
```

그 다음 로컬 브라우저에서 `http://localhost:13001`을 연다.

## Smoke check

1. Target healthy: `docker compose -p readmates -f compose.infra.yml exec -T prometheus wget -qO- http://localhost:9090/api/v1/targets | grep -c '"health":"up"'` — full stack 기준 3 이상이어야 (readmates-api, prometheus-self, alertmanager). Prometheus + Grafana만 먼저 올린 경우에는 readmates-api와 prometheus-self가 up인지 확인한다.
2. Alertmanager ready: `docker compose -p readmates -f compose.infra.yml exec -T alertmanager wget -qO- http://localhost:9093/-/ready` — 200 OK.
3. Grafana ready: `docker compose -p readmates -f compose.infra.yml exec -T grafana wget -qO- http://localhost:3000/api/health` — 200 OK.
4. Rule load: `docker compose -p readmates -f compose.infra.yml exec -T prometheus wget -qO- http://localhost:9090/api/v1/rules | grep -c '"name"'` — 최소 6 그룹.
5. Test alert: Prometheus expr 브라우저에서 `vector(1)`로 임시 룰 추가 또는 alertmanager API에 `amtool alert add` — 운영자 inbox 수신 확인. (구체 절차는 alertmanager 공식 docs 참조.)

## Trouble

- `up{job="readmates-server"} == 0`: app container가 `READMATES_MANAGEMENT_ADDRESS=0.0.0.0` 설정인지, `readmates-api` service와 같은 compose project/network에 떠 있는지 확인.
- SMTP 실패: `docker logs readmates-alertmanager | grep 'failed to send email'`. SMTP 자격증명 / smarthost 확인.
- Grafana 접속 실패: VM 보안그룹을 열지 말고 SSH 터널 `-L 13001:127.0.0.1:3001`이 살아있는지, `docker compose -p readmates -f compose.infra.yml ps grafana`가 healthy인지 확인.
- Notification backlog alert: §`notification-backlog` 참고 — outbox 직접 SQL drill-down.

## 후속

- 1주 후 첫 SLO 측정치는 `slo-monthly-report.md` 절차로 `docs/operations/slo-reports/2026-06.md`에 기록.
