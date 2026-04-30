# Cloudflare 프론트 배포 보조 절차

Cloudflare Pages production 자동 배포를 끄거나, GitHub Actions에서 명시적으로 프론트 배포를 실행할 때 참고하는 보조 절차입니다.

이 절차는 production frontend 배포를 실제로 트리거할 수 있습니다. 사용자가 배포 실행을 명시적으로 요청하지 않았으면 문서 확인이나 설정 준비에서 멈춥니다.

배포 완료 기준은 workflow 또는 deploy hook 실행 성공, Cloudflare Pages production deployment 확인, SPA/BFF/OAuth smoke 통과입니다. `CLOUDFLARE_API_TOKEN`, account id, deploy hook URL은 공개 문서나 Git에 남기지 않습니다.

## GitHub Actions로 배포

`.github/workflows/deploy-front.yml`은 `front`를 빌드한 뒤 Wrangler로 Cloudflare Pages에 직접 업로드합니다.

1. GitHub repository secret에 `CLOUDFLARE_ACCOUNT_ID`와 `CLOUDFLARE_API_TOKEN`을 추가합니다.
2. `vMAJOR.MINOR.PATCH` 형식의 release tag를 push합니다. 예: `git push origin v1.2.0`

이 workflow는 `v*` tag push를 구독하므로 `main` push만으로는 production 배포를 실행하지 않습니다.

수동으로도 실행할 수 있습니다. GitHub Actions에서 `Deploy Front` workflow를 열고 `Run workflow`를 실행합니다.

CLI로도 실행할 수 있습니다.

```bash
gh workflow run deploy-front.yml
```

## 로컬에서 deploy hook으로 배포

Cloudflare Pages Deploy Hook을 따로 만든 경우에는 로컬 보조 스크립트로 배포를 트리거할 수 있습니다. 예시 파일을 복사한 뒤 실제 deploy hook URL을 채웁니다.

```bash
cp deploy/cloudflare/.deploy-hook.env.example deploy/cloudflare/.deploy-hook.env
$EDITOR deploy/cloudflare/.deploy-hook.env
```

그 다음 스크립트를 실행합니다.

```bash
./deploy/cloudflare/deploy-front.sh
```

`deploy/cloudflare/.deploy-hook.env`는 Git에 올리지 않습니다. deploy hook URL은 URL 자체가 production 배포 권한입니다.
