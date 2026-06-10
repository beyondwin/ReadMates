# Monthly SLO Report

매월 첫 주에 한 번. SLO 측정치를 `docs/operations/slo-reports/YYYY-MM.md`에 기록한다.

## 절차

1. 운영 Prometheus를 로컬에서 접근 가능한 주소로 연다. 예: SSH tunnel 또는 운영자가 승인한 port-forward.
2. 아래 명령으로 markdown 초안을 생성한다.

```bash
python3 scripts/generate-slo-report.py \
  --prometheus-url http://localhost:9090 \
  --month 2026-06 > docs/operations/slo-reports/2026-06.md
```

3. `CHECK` 행은 Prometheus target health, incident 기록, 배포 이력을 확인해 비고에 판단을 남긴다.
4. 보고서에는 실제 운영 도메인, 수신자 이메일, 토큰, private endpoint를 쓰지 않는다.
