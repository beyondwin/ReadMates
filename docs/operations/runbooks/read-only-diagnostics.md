# Read-only Diagnostics

ReadMates 운영 진단은 가능한 한 읽기 전용 command로 제한합니다. Claude나 다른 자동화 도구에 production 진단을 위임할 때는 client를 신뢰하지 않고, 서버 쪽 OpenSSH `ForceCommand`로 실행 가능 command를 물리적으로 제한합니다.

## 보장하려는 것

- 진단 키로 접속하면 `/usr/local/bin/readmates-collect`만 실행되고 연결이 종료됩니다.
- interactive shell, port forwarding, agent forwarding, X11 forwarding, pty, scp/sftp를 막습니다.
- collector는 secret-bearing env file 내용을 출력하지 않습니다.
- collector는 service restart, Docker mutation, package install, file write를 수행하지 않습니다.

## 보장하지 않는 것

- 배포용 SSH key가 유출된 경우
- VM 자체가 다른 경로로 침해된 경우
- root 권한 사용자가 collector를 악성 script로 바꾼 경우
- 운영자가 일반 SSH 세션에서 destructive command를 직접 실행한 경우

## Collector 설치

```bash
scp -i <deploy-ssh-key> deploy/oci/readmates-collect.sh deploy/oci/install-readmates-collector.sh ubuntu@<vm-public-ip>:/tmp/
ssh -i <deploy-ssh-key> ubuntu@<vm-public-ip> 'sudo bash /tmp/install-readmates-collector.sh'
```

## ForceCommand 등록

진단 전용 public key를 `authorized_keys`에 아래 형태로 등록합니다. 실제 key 값은 Git에 기록하지 않습니다.

```text
command="/usr/local/bin/readmates-collect",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty,restrict ssh-ed25519 <diagnostic-public-key> readmates-diagnostic
```

## 동작 확인

아래 세 명령은 모두 같은 collector 출력만 반환해야 합니다.

```bash
ssh -i <diagnostic-private-key> ubuntu@<vm-public-ip> 'whoami'
ssh -i <diagnostic-private-key> ubuntu@<vm-public-ip> 'sudo systemctl restart readmates-stack'
ssh -i <diagnostic-private-key> ubuntu@<vm-public-ip> 'cat /etc/readmates/readmates.env'
```

명령 문자열은 server-side ForceCommand에 의해 무시되어야 합니다.

## 출력 저장 규칙

Collector 출력은 운영 진단에는 사용할 수 있지만, public repo에는 전문을 저장하지 않습니다. post-mortem이나 release note에는 아래처럼 sanitized summary만 남깁니다.

```text
readmates-collect 실행 결과: readmates-api health는 UP, recent ERROR 0건, disk/memory 정상 범위. 운영 host와 로그 전문은 Git 밖 운영 기록에 보관.
```

## 관련 script

- `deploy/oci/readmates-collect.sh`
- `deploy/oci/install-readmates-collector.sh`
