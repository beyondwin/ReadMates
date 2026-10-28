# Reports

특정 시점에 작성된 분석·진단·사후 보고서를 모아 둡니다. 운영 중인 runbook이나 현재 아키텍처 기준이 아니라 **그 시점의 스냅샷 기록**입니다.

- 현재 동작 기준: [`docs/development/architecture.md`](../development/architecture.md)
- 현재 설계 결정: [ADR 목록](../development/adr/README.md)
- 제거된 spec과 plan: Git 이력의 `docs/superpowers/` 경로
- 운영 절차: [`docs/deploy`](../deploy)

## 파일 명명 규칙

`YYYY-MM-DD-<주제>.md` 형식을 사용합니다. 작성 시점을 파일명으로 박아 두어, 오래된 보고서가 현재 기준처럼 읽히는 것을 방지합니다.

## 보관 보고서

이 디렉터리는 full source checkout에만 포함됩니다. 현재 절차는 [release-readiness checklist](../development/release-readiness-review.md)를 사용합니다.

| 작성일 | 파일 | 내용 |
| --- | --- | --- |
| 2026-08-17 | [`2026-08-17-release-readiness-v2.4.1.md`](2026-08-17-release-readiness-v2.4.1.md) | v2.3.0–v2.4.1 릴리스 검토·배포 증거 snapshot |
| 2026-08-15 | [`2026-08-15-backend-quality-phase-0-2-closeout.md`](2026-08-15-backend-quality-phase-0-2-closeout.md) | Backend quality Phase 0–2 저장소·로컬 검증 snapshot; 배포 증거와 구분 |
| 2026-08-09 | [`2026-08-09-release-readiness-v2.3.0.md`](2026-08-09-release-readiness-v2.3.0.md) | v2.2.0–v2.3.0 릴리스 검토·배포 증거 snapshot |
| 2026-08-03 | [`2026-08-03-release-readiness-v2.md`](2026-08-03-release-readiness-v2.md) | v2.0.0–v2.2.0 릴리스 검토·배포 증거 snapshot |
| 2026-07-24 | [`2026-07-23-host-notification-composer-integration-v2-release-readiness.md`](2026-07-23-host-notification-composer-integration-v2-release-readiness.md) | Host notification composer v2 branch 검토; 본문의 작성일은 7월 24일 |
| 2026-07-11 | [`2026-07-11-release-readiness-history.md`](2026-07-11-release-readiness-history.md) | 2026-07-11 이전 release-readiness closeout evidence 모음 |
| 2026-05-15 | [`2026-05-15-v19-perf-explain-verification.md`](2026-05-15-v19-perf-explain-verification.md) | v1.9 publicStats/publicSessions query EXPLAIN 검증 |
| 2026-05-08 | [`2026-05-08-improvements-v1.md`](2026-05-08-improvements-v1.md) | v1.5.2 기준 1차 개선 분석: 보안 history, 거대 파일 분해, CI 가드 |
| 2026-05-08 | [`2026-05-08-improvements-v2.md`](2026-05-08-improvements-v2.md) | v1.5.2 기준 2차 개선 분석: 도메인 모델, 관측성, 운영 메트릭 |
| 2026-05-08 | [`2026-05-08-implementation-plan-v1.md`](2026-05-08-implementation-plan-v1.md) | improvements-v1을 PR 단위 36개 태스크로 분해한 당시 실행 계획 |
| 2026-05-08 | [`2026-05-08-implementation-plan-v2.md`](2026-05-08-implementation-plan-v2.md) | improvements-v2를 PR 단위 30개 태스크로 분해한 당시 실행 계획 |
| 2026-04-30 | [`2026-04-30-oci-compose-cutover.md`](2026-04-30-oci-compose-cutover.md) | OCI Compose 전환과 BFF 401 진단·해결 기록 |
| 2026-04-25 | [`2026-04-25-production-version-skew.md`](2026-04-25-production-version-skew.md) | Frontend/backend 배포 버전 불일치 진단·해결 기록 |
