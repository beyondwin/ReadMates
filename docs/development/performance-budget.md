# Frontend Performance Budget

production build의 asset 크기를 로컬 release-readiness 근거로 추적합니다. frontend build 품질 게이트이며, 운영 smoke를 대신하지 않습니다.

## Commands

production build와 예산 리포트:

```bash
corepack pnpm --dir front build
corepack pnpm --dir front build:budget
```

위 두 단계를 한 번에:

```bash
corepack pnpm --dir front performance:budget
```

production build 결과를 Vite preview로 띄워 Lighthouse 실행:

```bash
corepack pnpm --dir front lighthouse:preview -- --group public --limit 2
```

`corepack`이 PATH에 없으면 `npx --yes corepack@0.35.0 pnpm --dir front ...`로 실행합니다.

## Artifacts

예산 리포트:

```text
.tmp/performance/build-budget.json
.tmp/performance/build-budget.md
```

Preview Lighthouse 결과:

```text
.tmp/performance/lighthouse-preview/<timestamp>/
```

로컬 근거일 뿐이므로 커밋하지 않습니다.

## Budget Meaning

규칙은 `front/tests/performance/build-budget.ts`에 있습니다.

| Bucket | 한도 | 기준 | 결과 |
| --- | --- | --- | --- |
| `app-entry`, `vendor-framework`, `vendor-misc` | 350 kB | raw | 초과 시 실패 |
| `host-route` | 120 kB | raw | 초과 시 실패 |
| `route` | 80 kB | raw | 경고 |
| `css-global` | 50 kB | gzip | 초과 시 실패 |
| `uncategorized` | 350 kB | raw | 측정만 |

- JavaScript는 parse·실행 비용을 보기 위해 raw 크기로 잽니다.
- 전역 CSS는 gzip 전송 크기로 잽니다. font-face unicode range가 반복돼 raw 크기는 크지만 압축이 잘 되기 때문입니다. 리포트에는 raw와 gzip을 함께 보여 줍니다.
- Preview Lighthouse는 로컬 public-safe API mock을 띄우고 `READMATES_API_BASE_URL`로 Vite preview proxy를 그 mock에 연결합니다. 그래서 public route는 Spring API 없이 돌고, preview 종료는 실패가 아니라 정리 단계로 처리합니다.

## Release Evidence Boundary

통과했다는 것은 production build asset이 저장소 예산 안에 있고, preview에서 선택한 route가 backend proxy 오류 없이 렌더링됐다는 뜻입니다. 운영 OAuth, VM health, provider 콘솔 상태, release tag workflow, OCI compose promotion, 배포 후 smoke는 증명하지 않습니다.
