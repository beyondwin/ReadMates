# ReadMates Design

| 경로 | 역할 |
| --- | --- |
| `design/system` | 재사용 UI의 코드 source of truth. package 이름은 `@readmates/design-system`입니다. |
| `design/docs` | 실제 package를 그려 보여 주는 정적 catalog(`@readmates/design-system-docs`) |

규칙:

- 제품 코드는 재사용 UI를 `@readmates/design-system`에서 import합니다.
- 안정(stable) 컴포넌트는 널리 쓰기 전에 desktop과 mobile 동작을 문서화합니다.
- 한 기능에서만 쓰는 UI는 여러 화면에서 반복될 때까지 `front/features/*/ui`에 둡니다.
- 샘플은 public-safe만 씁니다. 실제 멤버, 이메일, 초대 token, private domain, 배포 상태, secret, token 모양 예시는 넣지 않습니다.

의존성은 저장소 루트에서 설치합니다.

```bash
corepack pnpm install --frozen-lockfile
```

## Gallery catalog

`design/docs`는 디자인·기획 검토용 Editorial Pattern Gallery로 시작합니다. 안정 scene은 두 개입니다.

- **Public Literary Page**: 공개 클럽 소개, 초대, 멤버 전용 경계 예시
- **Member Reading Desk**: 현재 책, 멤버 정체성, 세션 상태, 다음 행동 예시

package가 export하는 안정 컴포넌트는 `Button`, `Badge`, `TextField`, `TextArea`, `Surface`, `Divider`, `BookCover`, `AvatarChip`, `EmptyState`, `LockedState`, `DocumentPanel`이고, class 조합 helper `cx`도 함께 export합니다. 기준은 `design/system/src/index.ts`입니다.

gallery나 컴포넌트를 바꾸면 merge 전에 로컬에서 점검합니다.

```bash
corepack pnpm design:check
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

화면으로 확인할 때:

```bash
corepack pnpm --dir design/docs exec vite --host 0.0.0.0 --port 5174 --strictPort
```

`http://localhost:5174`를 desktop과 mobile 폭에서 확인합니다. `corepack`이 PATH에 없으면 `npx --yes corepack@0.35.0 pnpm ...`으로 실행합니다.
