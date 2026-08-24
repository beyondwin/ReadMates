# ADR-0017: Web과 notification worker process를 분리 운영

- 상태: Proposed
- 결정일: 2026-08-22
- 작성자: 서버·운영
- 관련: ADR-0004, `server/src/main/kotlin/com/readmates/notification/application/config/NotificationWorkerConfiguration.kt:13`

## 컨텍스트

현재 단일 Spring Boot application은 web request와 notification scheduling/listener를 같은 process에서 실행한다. `NotificationWorkerConfiguration`에는 worker runtime flag가 있지만(`NotificationWorkerConfiguration.kt:13-21`) web과 모든 worker inbound path를 별도 process profile로 검증한 운영 계약은 아직 없다.

## 결정

같은 jar를 web replica와 notification worker instance로 실행하되, web process에서는 worker inbound bean을 끄고 worker process에서는 operator가 의도한 worker만 켠다. Process별 health/readiness와 deploy/rollback 절차를 분리한다. Gradle multi-module 분리는 이 결정에 포함하지 않는다.

## 근거

- 별도 binary 없이 web availability와 notification 처리의 failure domain을 줄인다.
- 현 배포 단위와 codebase 경계를 유지한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 현재 단일 process 유지 | worker 장애와 web 장애가 같은 재시작·resource 경계를 공유한다. |
| 즉시 별도 Gradle module로 분리 | 현재 규모에서 build/deploy 복잡도가 이득보다 크다. |

## 결과

긍정적:
- web과 notification backlog를 독립 배포·확장할 수 있다.

부정적/감수한 비용:
- 두 process profile과 중복 실행 방지 증거가 필요하다.

## 검증

- web profile에서 scheduler/listener bean이 없고 API가 정상인지 확인한다.
- worker profile에서 단일 claim/dispatch가 실행되고 web-only surface가 노출되지 않는지 확인한다.

## 후속 작업

- deploy manifest, health, operator runbook, integration test가 일치할 때 `Accepted`로 승격한다.
