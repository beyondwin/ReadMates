# Monthly SLO Report

매월 첫 주에 한 번. SLO 측정치를 `docs/operations/slo-reports/YYYY-MM.md`에 기록한다.

## 절차

1. `slos.yaml`의 6개 SLO 각각에 대해 Prometheus query 실행. 운영자 PC에서 `kubectl/ssh port-forward 9090` 후 브라우저 또는 `curl 'http://localhost:9090/api/v1/query?query=...'`.
2. 결과를 아래 템플릿에 채워 `docs/operations/slo-reports/YYYY-MM.md`로 commit.

## 템플릿

```
# SLO Report YYYY-MM

| SLO id | objective | measured | window | 위반 여부 |
|--------|-----------|----------|--------|-----------|
| api_availability | < 1% 5xx | __% | 30d | __ |
| api_read_latency_p95 | < 500ms | __ms | 30d | __ |
| bff_api_p95 | < 800ms | __ms | 7d | __ |
| login_success_ratio | > 99% | __% | 7d | __ |
| notification_dispatch_success_ratio | > 99% | __% | 7d | __ |
| notification_delivery_latency_p95 | < 5m | __m | 30d | __ |

## 비고
- incident 발생: ...
- 임계 재조정 필요: ...
```

## 자동화 follow-up

스크립트로 6개 query를 일괄 실행하여 markdown 생성하는 작업은 별도 spec.
