# Monthly SLO Report

매월 첫 주에 한 번, 지난달 SLO 측정치를 `docs/operations/slo-reports/YYYY-MM.md`로 남깁니다. 디렉터리가 없으면 첫 보고서를 쓸 때 만듭니다.

- SLO 정의: `server/src/main/resources/slo/slos.yaml` (8개)
- 생성 스크립트: `scripts/generate-slo-report.py`
- 해설: [SLO](../observability/slos.md)

## 절차

1. 운영 Prometheus를 로컬에서 열 수 있게 합니다. 예: SSH 터널 또는 승인된 port-forward.
2. markdown 초안을 만듭니다.

   ```bash
   mkdir -p docs/operations/slo-reports
   python3 scripts/generate-slo-report.py \
     --prometheus-url http://localhost:9090 \
     --month 2026-08 > docs/operations/slo-reports/2026-08.md
   ```

   - `--prometheus-url` 기본값은 `http://localhost:9090`입니다.
   - `--month`는 보고서 제목에만 쓰입니다(기본: 이번 달). 지난달 데이터를 따로 조회하지 않습니다.
   - 측정값은 `slos.yaml` query를 **실행 시점에 한 번** 돌린 값입니다. 대부분 최근 5분 `rate`라서 `window`(예: 30d) 전체 달성률이 아닙니다. 월간 판단에는 Prometheus range query, incident 기록, 배포 이력을 함께 봅니다.

3. 결과가 `CHECK`인 행은 Prometheus target health, incident 기록, 배포 이력을 보고 비고에 판단을 적습니다. 메트릭이 아직 없는 SLO도 `CHECK`로 나옵니다.
4. 보고서에 실제 운영 도메인, 수신자 이메일, 토큰, private endpoint를 쓰지 않습니다.
