# Capacity Guardrails

이 runbook은 OCI VM의 루트 디스크가 예측 가능하게 유지되도록 Docker image, Prometheus 데이터, system journal, APT cache를 제한하고, 관리형 MySQL storage가 임계값을 넘으면 OCI Notifications로 알리는 절차를 정의한다. 실제 VM 주소, compartment/resource identifier, bucket namespace, 수신자 주소, 알림 topic identifier는 Git에 기록하지 않는다.

## 정책

| 대상 | 정책 | 자동화 |
|---|---|---|
| Docker image | 어떤 container도 참조하지 않는 image 중 7일 초과분만 제거 | 매월 systemd timer |
| Prometheus TSDB | 최대 30일, 최대 1GB | `compose.infra.yml` command |
| systemd journal | 최대 300MB, 최근 14일 | `/etc/systemd/journald.conf.d/50-readmates-retention.conf` |
| APT cache | obsolete package archive만 제거 | 매주 systemd timer |
| OCI Notifications topic | tenancy quota 최대 10개 | OCI quota policy |
| MySQL storage | 70% warning, 85% critical, 각 15분 지속 시 알림 | OCI Monitoring + Notifications |

Docker prune은 실행 중이거나 중지된 container가 참조하는 image를 지우지 않는다. Prometheus는 시간과 크기 한도 중 먼저 도달하는 쪽에서 오래된 블록을 정리한다. 두 정책 모두 장애 조사와 최근 rollback을 위한 짧은 여유를 감수한 선택이다.

## 설치와 상태 확인

운영 host에서 unit을 설치하고 timer를 활성화한다. 예시의 모든 식별자는 placeholder다.

```bash
scp deploy/oci/readmates-docker-image-prune.{service,timer} <operator>@<vm-host>:/tmp/
scp deploy/oci/readmates-apt-autoclean.{service,timer} <operator>@<vm-host>:/tmp/
ssh <operator>@<vm-host> '
  sudo install -m 0644 /tmp/readmates-*.service /tmp/readmates-*.timer /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now readmates-docker-image-prune.timer readmates-apt-autoclean.timer
  systemctl list-timers readmates-docker-image-prune.timer readmates-apt-autoclean.timer
'
```

Docker cleanup의 영향은 먼저 다음 command로 확인한다. `RECLAIMABLE`이 0이어도 정상이다.

```bash
sudo docker system df
sudo journalctl -u readmates-docker-image-prune.service -n 50 --no-pager
sudo journalctl -u readmates-apt-autoclean.service -n 50 --no-pager
```

Prometheus 설정을 변경한 뒤에는 해당 container만 재생성하고 readiness를 확인한다. 다른 compose service를 `--remove-orphans`로 정리하지 않는다.

```bash
cd /opt/readmates
sudo docker compose -f deploy/oci/compose.infra.yml up -d prometheus
sudo docker compose -f deploy/oci/compose.infra.yml ps prometheus
```

system journal 보관은 Linux `systemd-journald` drop-in으로 설정한다. 운영 중인 drop-in을 먼저 확인하고, 다른 정책 파일과 충돌하지 않게 한 파일에서 관리한다.

```bash
sudo install -d -m 0755 /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/50-readmates-retention.conf >/dev/null <<'EOF'
[Journal]
SystemMaxUse=300M
SystemKeepFree=1G
SystemMaxFileSize=50M
MaxRetentionSec=14day
EOF
sudo systemctl restart systemd-journald
sudo journalctl --rotate --vacuum-time=14day --vacuum-size=300M
journalctl --disk-usage
```

`SystemKeepFree`는 작은 root filesystem에서 journal이 여유 공간을 모두 점유하지 않게 한다. vacuum은 보관 밖의 journal만 제거하므로 application data, Docker volume, MySQL backup에는 영향을 주지 않는다.

## Backup과 복구 증거

`backup-mysql.timer`는 별도 systemd timer이며 VM filesystem에 dump와 checksum을 먼저 만든 뒤 Object Storage에 업로드한다. storage 한도와 별개로 다음을 정기 점검한다.

```bash
systemctl is-enabled backup-mysql.timer
systemctl show backup-mysql.service --property=Result --property=ExecMainStatus
sudo find /var/backups/readmates/mysql -maxdepth 1 -name '*.sql.gz' -printf '%T@ %p\n' | sort -nr | head -1
```

가장 최근 dump의 `.sha256`을 `sha256sum -c`로 확인하고, Object Storage에는 같은 이름의 dump와 checksum object가 있는지 `head`로 확인한다. 실 production restore는 별도 승인 대상이다. 먼저 격리된 staging schema에 복원해 schema, row count, 핵심 제약을 확인하고, 그 결과를 비밀값 없이 운영 기록에 남긴다. 상세 절차는 [DB backup & restore](db-backup.md)를 따른다.

## MySQL storage 알림

Notifications topic을 막는 비용 보호 quota가 있다면, 경보용 topic을 만들 수 있도록 다음 한도는 유지한다. 이 값은 Always Free topic 기본 한도보다 낮은 운영 guardrail이며 실제 quota policy identifier는 Git에 기록하지 않는다.

```
set notifications quota topic-count to 10 in tenancy
```

OCI Console에서 DB system의 `DbVolumeUtilization` metric을 대상으로 alarm 두 개를 만든다.

- Warning: 70% 초과가 15분 지속
- Critical: 85% 초과가 15분 지속

각 alarm은 같은 Notifications topic으로 전달한다. 이메일 endpoint는 subscription 확인을 마쳐야 active가 되며, 문서나 commit에 주소를 쓰지 않는다. topic과 subscription의 lifecycle state, alarm enabled 상태, metric query의 resource filter를 OCI Console 또는 CLI에서 검증한다.

알림을 받은 뒤에는 다음 순서로 대응한다.

1. MySQL storage 사용률 추세와 최근 backup/restore 작업을 확인한다.
2. VM root disk와 DB allocated storage를 혼동하지 않는다. 관리형 DB backup은 VM root disk에 쓰지 않는다.
3. 급격한 증가면 신규 대용량 데이터·log·migration을 조사하고, 필요하면 DB storage 확장을 별도 승인으로 진행한다.
4. 경보 해제 후에도 원인과 실제 조치만 운영 기록에 남긴다. 실제 endpoint나 recipient는 남기지 않는다.

## 정기 점검

월 1회 다음을 확인한다.

```bash
df -h /
sudo docker system df
journalctl --disk-usage
systemctl list-timers backup-mysql.timer readmates-docker-image-prune.timer readmates-apt-autoclean.timer
```

용량 값이나 보관 한도를 바꾸면 [ADR-0052](../../development/adr/0052-oci-capacity-and-recovery-guardrails.md)와 이 runbook을 함께 갱신한다.
