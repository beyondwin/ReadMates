# Cloudflare 프론트 배포 보조 절차

프론트엔드(Cloudflare Pages) 배포를 실행하는 방법을 정리합니다. 전체 릴리즈 순서는 [새 버전 발행 Runbook](../../docs/deploy/release-publish-runbook.md)을 따릅니다.

> 이 절차는 production 배포를 실제로 시작합니다. 사용자가 배포를 명시적으로 요청하지 않았다면 문서 확인이나 설정 준비에서 멈춥니다.

완료 기준: workflow(또는 deploy hook) 성공, Cloudflare Pages production 배포 확인, SPA/BFF/OAuth smoke 통과.

`CLOUDFLARE_API_TOKEN`, account id, deploy hook URL은 문서나 Git에 남기지 않습니다.

## GitHub Actions로 배포 (정상 경로)

`.github/workflows/deploy-front.yml`(`Deploy Front`)은 수동 실행(`workflow_dispatch`) 전용입니다. `main` push나 tag push로는 실행되지 않습니다.

1. GitHub repository secret에 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`이 있는지 확인합니다.
2. 같은 release tag의 backend 배포와 health 확인을 먼저 끝냅니다.
3. release tag를 입력해 workflow를 실행합니다.

   ```bash
   gh workflow run "Deploy Front" --ref main -f release_tag=vX.Y.Z
   gh run list --workflow "Deploy Front" --event workflow_dispatch --limit 5
   gh run watch <deploy-front-run-id> --exit-status
   ```

4. job은 `production` environment를 사용합니다. 저장소에 environment 보호 규칙이 있으면 GitHub Actions 화면에서 승인해야 진행됩니다.

Workflow가 하는 일:

- `release_tag`가 `vMAJOR.MINOR.PATCH` 형식인지 검사합니다.
- 그 tag를 checkout하고, checkout commit이 tag commit과 같은지 확인합니다.
- `pnpm install --frozen-lockfile` → `lint` → `test` → `build` → Zod fixture 최신 여부를 확인합니다.
- Wrangler로 `front/dist`와 `front/functions`를 Pages project `readmates`의 `main` branch(production)에 올립니다.

## 로컬에서 deploy hook으로 배포 (보조 경로)

Cloudflare Pages Deploy Hook을 따로 만든 경우에만 씁니다. hook은 Pages 쪽 build를 시작할 뿐, 위 workflow의 tag 검증과 테스트를 거치지 않습니다.

1. 예시 파일을 복사하고 hook URL을 채웁니다.

   ```bash
   cp deploy/cloudflare/.deploy-hook.env.example deploy/cloudflare/.deploy-hook.env
   $EDITOR deploy/cloudflare/.deploy-hook.env
   ```

2. 스크립트를 실행합니다. `CLOUDFLARE_PAGES_DEPLOY_HOOK_URL`을 환경 변수로 직접 넘겨도 됩니다.

   ```bash
   ./deploy/cloudflare/deploy-front.sh
   ```

`deploy/cloudflare/.deploy-hook.env`는 `.gitignore` 대상입니다. hook URL 자체가 production 배포 권한이므로 공유하지 않습니다.
