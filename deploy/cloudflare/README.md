# Cloudflare 수동 프론트 배포

Cloudflare Pages production 자동 배포를 끄고 deploy hook으로만 프론트를 배포할 때 사용하는 보조 절차입니다.

## GitHub Actions 버튼으로 배포

1. Cloudflare Pages 프로젝트 `readmates`에서 `main` branch용 Deploy Hook을 만듭니다.
2. GitHub repository secret에 `CLOUDFLARE_PAGES_DEPLOY_HOOK_URL`을 추가합니다.
3. GitHub Actions에서 `Deploy Front` workflow를 열고 `Run workflow`를 실행합니다.

CLI로도 실행할 수 있습니다.

```bash
gh workflow run deploy-front.yml
```

## 로컬에서 배포

예시 파일을 복사한 뒤 실제 deploy hook URL을 채웁니다.

```bash
cp deploy/cloudflare/.deploy-hook.env.example deploy/cloudflare/.deploy-hook.env
$EDITOR deploy/cloudflare/.deploy-hook.env
```

그 다음 스크립트를 실행합니다.

```bash
./deploy/cloudflare/deploy-front.sh
```

`deploy/cloudflare/.deploy-hook.env`는 Git에 올리지 않습니다. deploy hook URL은 URL 자체가 production 배포 권한입니다.
