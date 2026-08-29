# ADR-0050: OCI 용량과 복구 guardrail

- 상태: Proposed
- 결정일: 2026-08-30
- 작성자: 운영
- 관련: ADR-0010, `deploy/oci/compose.infra.yml`, `deploy/oci/backup-mysql.timer`, `docs/operations/runbooks/capacity-guardrails.md`

## 컨텍스트

OCI VM은 Docker image, 관측 데이터, system journal, APT cache가 동일한 root filesystem을 공유한다. 관리형 MySQL의 DB storage와 백업은 VM root filesystem과 별도지만, DB storage의 증가를 늦게 발견하면 복구와 확장 판단이 어려워진다. 공개 저장소에는 실제 VM 주소, OCI resource identifier, bucket namespace, 수신자 주소, credential을 기록할 수 없다.

## 결정

Docker의 미참조 image는 7일 유예 뒤 매월 제거하고, Prometheus TSDB는 30일 또는 1GB 중 먼저 도달하는 보관 한도로 제한한다. system journal은 300MB와 14일로 제한하며, obsolete APT archive는 매주 제거한다. Notifications topic quota는 10개로 유지해 경보용 topic 생성을 허용한다. MySQL `DbVolumeUtilization`에는 70% warning과 85% critical alarm을 각각 15분 지속 조건으로 구성하고 Notifications topic으로 전달한다. 일일 logical backup timer와 checksum 검증은 유지하며, production restore는 staging rehearsal과 별도 승인 없이는 실행하지 않는다.

## 근거

자동 정리는 실행 중·중지된 container가 참조하는 image와 current package를 보존해 rollback과 패키지 일관성을 보호한다. Prometheus의 시간·크기 이중 상한은 저활성 환경에서 장기 누적, 고활성 환경에서 급격한 disk 점유를 모두 제한한다. 두 단계 DB alarm은 조기 조사와 긴급 대응을 구분한다.

## 대안

| 대안 | 기각 이유 |
|---|---|
| 수동 점검만 수행 | 사람이 놓치면 disk 또는 DB storage 문제가 장애로 확대될 수 있다. |
| Docker system prune을 무제한 실행 | volume·network 등 더 넓은 surface를 제거할 수 있어 최소 권한 정리 원칙에 맞지 않는다. |
| Prometheus 기간 한도만 사용 | metric 유입량이 증가할 때 disk 사용량 상한이 없다. |
| production DB에 직접 restore | 데이터 손상과 다운타임 위험이 있어 staging 검증과 별도 승인이 필요하다. |

## 결과

긍정적:

- VM disk 증가를 예측 가능한 한도 안에 둔다.
- DB storage 증가를 warning과 critical 단계로 관찰한다.
- backup 존재, checksum, restore rehearsal의 증거를 분리한다.

부정적/감수한 비용:

- 7일을 넘긴 미참조 image는 즉시 rollback 후보가 아니다.
- Prometheus는 오래된 metric을 잃을 수 있으므로 장기 분석은 별도 저장소가 필요하다.
- 이메일 subscription 확인 전에는 alarm delivery가 완전히 검증되지 않는다.

## 검증

- `docker compose -f deploy/oci/compose.infra.yml config`로 Prometheus command를 검증한다.
- 운영 host에서 각 systemd timer의 enabled/active 상태와 최근 service result를 확인한다.
- `backup-mysql.service`의 성공 result, 최신 dump의 checksum, Object Storage object 존재를 확인한다.
- OCI Console 또는 CLI에서 alarm enabled 상태와 Notifications subscription lifecycle state를 확인한다.

## 후속 작업

- 격리된 staging schema로 restore rehearsal을 수행하고, 성공 증거가 쌓이면 상태를 `Accepted`로 승격한다.
- 운영 필요가 바뀌면 보관 한도와 DB alarm 임계값을 실제 사용률 추세로 재검토한다.
