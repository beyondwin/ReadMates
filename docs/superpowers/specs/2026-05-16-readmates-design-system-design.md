# ReadMates 디자인 시스템 설계

작성일: 2026-05-16
상태: USER-APPROVED DESIGN SPEC
문서 목적: ReadMates의 웹/모바일 UI를 하나의 코드 기반 디자인 시스템으로 수렴시키고, 별도 정적 문서 사이트가 그 원천을 보여주는 구조를 정의한다.

## 1. 배경

ReadMates 프런트엔드는 이미 `front/shared/styles/tokens.css`, `front/shared/ui`, `front/features/*/ui`에 디자인 토큰, 공용 UI, feature별 presentation code를 나누어 두고 있다. 현재 디자인 방향은 `docs/agents/design.md`에 정의된 것처럼 "사려 깊은 아카이브, 조용한 읽는 방, 정밀한 운영 원장"이다.

이번 목표는 Claude Code의 design system page처럼 별도 웹페이지에서 ReadMates의 디자인 컴포넌트를 볼 수 있게 하는 것이다. 다만 문서 페이지가 실제 앱 UI를 흉내 내는 두 번째 구현이 되면 drift가 생긴다. 따라서 source of truth는 문서 페이지가 아니라 코드 기반 디자인 시스템 모듈이어야 한다. 문서 사이트와 실제 ReadMates 앱은 같은 토큰과 컴포넌트를 import해야 한다.

## 2. 목표

- ReadMates의 유일한 UI source of truth를 코드 기반 디자인 시스템 모듈로 만든다.
- 별도 정적 디자인 시스템 사이트를 만들어 토큰, 컴포넌트, 패턴, responsive behavior, migration status를 보여준다.
- 실제 제품 앱과 디자인 시스템 문서 사이트가 같은 `@readmates/design-system` package를 import한다.
- 웹과 모바일을 모두 first-class로 다룬다. 각 stable 컴포넌트는 desktop/tablet/mobile 상태와 터치/줄바꿈/접근성 기준을 문서화한다.
- 기존 `front/shared/styles/tokens.css`, `.btn`, `.badge`, `.input`, `front/shared/ui` 자산을 폐기하지 않고 점진적으로 디자인 시스템으로 승격한다.
- 기존 `front/`, `server/`, `docs/`, `deploy/`, `ops/`, `scripts/` 중심의 repo mental model을 유지한다.

## 3. 비목표

- v1에서 browser 기반 디자인 편집기를 만들지 않는다. 디자인 시스템 변경은 코드 변경으로 수행한다.
- v1에서 모든 feature 화면을 즉시 디자인 시스템 컴포넌트로 리팩터링하지 않는다.
- `front/`를 `apps/front/`로 이동하는 강한 monorepo 재배치는 하지 않는다.
- 문서 사이트가 실제 회원 데이터, 운영 데이터, 배포 상태, private domain, secret, token-shaped example을 포함하지 않는다.
- Storybook 같은 별도 외부 도구 도입은 v1 필수 범위가 아니다. 필요한 기능은 Vite 정적 문서 사이트로 시작한다.

## 4. 핵심 결정

선택한 구조는 top-level `design/` 표면이다.

```text
design/
  system/      # @readmates/design-system, UI source of truth
  docs/        # static design system catalog site
  README.md    # design system contribution and migration rules
front/         # product app, imports @readmates/design-system
server/
docs/
deploy/
ops/
scripts/
```

Root에는 `pnpm-workspace.yaml`을 추가해 기존 `front` package와 새 디자인 package를 workspace로 묶는다.

```yaml
packages:
  - front
  - design/system
  - design/docs
```

이 구조를 선택한 이유:

- `design/system`이 제품 앱 밖에 있어 진짜 공용 source of truth가 된다.
- `front`와 `design/docs`가 같은 package를 import해 문서와 실제 앱의 drift를 줄인다.
- 기존 `front/` 위치를 유지하므로 Cloudflare Pages Functions, 프런트엔드 테스트, deploy/public-release scripts, 문서 경로를 한 번에 흔들지 않는다.
- `packages/` + `apps/` 구조보다 현재 ReadMates repo의 top-level surface 모델과 잘 맞는다.
- 향후 강한 monorepo가 필요해지면 `front/` 이동을 별도 구조 변경으로 다룰 수 있다.

## 5. Source Of Truth 모델

디자인 시스템 페이지는 원천이 아니라 catalog와 validation surface다.

```text
design/system
  -> front
  -> design/docs
```

`design/system`이 토큰, CSS contracts, primitive components, pattern components, responsive rules를 소유한다. `front`와 `design/docs`는 이를 소비한다.

따라서 "디자인 시스템 페이지가 수정되면 앱 전체에 적용된다"는 말은 v1에서 다음 의미를 가진다.

1. 개발자가 `design/system`의 토큰이나 컴포넌트 코드를 수정한다.
2. `design/docs`는 같은 모듈을 import하므로 문서 preview가 바뀐다.
3. `front`도 같은 모듈을 import하므로 해당 컴포넌트를 사용하는 제품 UI가 바뀐다.

문서 사이트에서 직접 색상/spacing/component option을 편집하고 저장해 source code를 갱신하는 browser editor는 v1 범위가 아니다.

## 6. `design/system` 경계

`design/system`은 세 계층을 제공한다.

### 6.1 Foundations

- CSS token source: color, text, spacing, radius, shadow, motion, state tokens.
- Base CSS contracts: focus ring, disabled state, reduced motion compatibility, Korean/English wrapping.
- Typography utilities: display, heading, body, small, mono, eyebrow.
- Theme support: 현재 paper theme를 기본으로 유지하고, 기존 dark/light token contract는 깨지지 않게 이관한다.

초기 source는 `front/shared/styles/tokens.css`다. 첫 구현은 이 파일을 그대로 복사해 분리하기보다, 디자인 시스템 package가 소유하도록 옮기고 `front`가 compatibility import를 통해 소비하게 한다.

### 6.2 Primitives

초기 primitive 후보:

- `Button`
- `Badge`
- `TextField`
- `TextArea`
- `Surface`
- `Divider`
- `AvatarChip`
- `BookCover`

Primitive는 role-specific product data를 알지 않는다. Props와 CSS variables로 상태와 variant를 표현하고, route, fetch, feature API, React Router loader에 의존하지 않는다.

### 6.3 Patterns

초기 pattern 후보:

- `TopNav`
- `MobileHeader`
- `MobileTabBar`
- `ActionCluster`
- `EmptyState`
- `LockedState`
- `DocumentPanel`
- `RecordRow`
- `LedgerRow`

Pattern은 ReadMates 제품 문맥을 반영할 수 있지만, feature API나 route loader를 직접 import하지 않는다. 필요한 링크 컴포넌트나 callback은 props로 주입한다. 이는 기존 frontend guide의 route-first dependency direction과 맞춘다.

## 7. `design/docs` 사이트 구조

`design/docs`는 별도 Vite 정적 사이트다. server API를 호출하지 않고, public-safe 샘플 데이터만 사용한다.

초기 information architecture:

| 섹션 | 내용 |
| --- | --- |
| Foundations | 색, 타이포, spacing, radius, shadow, motion, focus, state tokens |
| Components | Button, Badge, TextField/TextArea, Surface, Empty/Locked/Warning state, BookCover, AvatarChip |
| Patterns | public literary page, member reading desk, host operating ledger, action cluster, record row, document panel |
| Navigation/Shell | desktop top nav, mobile header, mobile tab bar, workspace switch |
| Responsive | 각 컴포넌트의 desktop/tablet/mobile preview와 터치 기준 |
| Migration | legacy class/component가 design-system으로 승격됐는지 추적 |

각 component detail page는 다음 정보를 포함한다.

- 실제 `@readmates/design-system` component preview
- Variant와 props table
- 사용 규칙과 금지 패턴
- 접근성 상태: focus, disabled, readonly, error, loading, selected
- Responsive preview: desktop/tablet/mobile
- Source link: package export path와 product usage path
- Status: `stable`, `experimental`, `legacy`, `deprecated`

문서 사이트는 "보이는 예시"만이 아니라 migration dashboard 역할도 한다. 문서화됐지만 제품 앱이 아직 legacy import를 쓰는 경우를 표시해 drift를 발견하기 쉽게 한다.

## 8. Frontend 적용 방식

기존 `front`는 route-first 구조를 유지한다.

```text
front/src/app -> front/src/pages -> front/features -> front/shared
```

`@readmates/design-system`은 `front/shared`와 같은 재사용 primitive source로 취급한다. Feature UI는 design-system primitive와 pattern을 import할 수 있지만, `design/system`은 `front` 내부 코드를 import하지 않는다.

초기 compatibility 전략:

- `front/src/styles/globals.css`는 점진적으로 `@readmates/design-system/styles.css`를 import한다.
- 기존 `.btn`, `.badge`, `.input`, `.textarea`, `.surface` CSS contract는 제품 앱을 깨지 않도록 compatibility layer로 유지한다.
- 새 reusable component는 `@readmates/design-system`에서 먼저 만들고, `front/shared/ui`는 필요한 경우 thin wrapper 또는 re-export로 남긴다.
- Feature-local UI가 하나의 feature에서만 쓰이면 그대로 둔다.
- 두 개 이상의 feature에서 반복되는 UI는 design-system 승격 후보로 표시한다.

## 9. Migration 규칙

- 문서 사이트에 `stable`로 올라간 컴포넌트는 제품 앱에서도 `@readmates/design-system` import를 사용해야 한다.
- 모바일 동작이 정의되지 않은 컴포넌트는 `stable`이 될 수 없다.
- Accessibility state가 빠진 컴포넌트는 `experimental` 또는 `legacy`로 둔다.
- 기존 class를 제거할 때는 먼저 문서 사이트의 Migration 섹션에 replacement와 affected paths를 남긴다.
- Public/member/host 중 한 역할에만 맞는 pattern은 이름과 props에서 역할 범위를 명확히 한다.
- 디자인 시스템 package는 route, API client, BFF, auth loader, feature API를 import하지 않는다.

## 10. Responsive 기준

디자인 시스템은 desktop과 mobile을 별도 부록으로 다루지 않는다. 모든 stable component는 responsive contract를 가진다.

공통 기준:

- 모바일 터치 target은 최소 44px를 목표로 한다. 작은 inline action은 주변 hit area 또는 placement로 보완한다.
- Korean/English mixed text가 버튼, badge, card, nav item에서 overflow하지 않아야 한다.
- 버튼과 고정-format UI는 hover/focus/loading/disabled 상태에서 layout shift가 없어야 한다.
- Desktop top nav, mobile header, mobile tab bar는 role별 public/member/host 사례를 가진다.
- Reduced motion 환경에서는 decorative transition이 기능 이해를 막지 않아야 한다.

## 11. Build 흐름

기본 build order:

```text
design/system build
  -> front build
  -> design/docs build
```

Root workspace scripts는 아래 방향으로 둔다.

- `pnpm --filter @readmates/design-system build`
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `pnpm --filter @readmates/design-system-docs build`

구체 script 이름은 구현 계획에서 현재 `front/package.json` 관습과 pnpm workspace 지원 방식을 맞춰 확정한다.

## 12. Testing And Verification

디자인 시스템 변경은 작은 변경이라도 문서 사이트와 제품 앱 양쪽을 검증한다.

필수 체크 후보:

- `design/system`: type check, unit test, export boundary test
- `design/docs`: build, responsive preview smoke test
- `front`: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`
- UI 확인: desktop/mobile viewport에서 docs site와 대표 제품 화면을 확인

시각 QA는 첫 구현에서 최소한 다음을 확인한다.

- Button/Badge/Input/Surface preview가 docs와 app에서 같은 token을 사용한다.
- Mobile preview에서 텍스트가 control 밖으로 넘치지 않는다.
- Focus-visible state가 docs와 app에서 동일하다.
- Public/member/host navigation pattern의 active state와 줄바꿈이 깨지지 않는다.

## 13. Error Handling

`design/docs`는 실제 API를 호출하지 않으므로 일반적인 server error state가 없다. 대신 문서 품질과 migration 상태를 명확히 표시한다.

Component status:

- `stable`: 제품 앱에서 사용할 표준. desktop/mobile/accessibility contract가 정의됨.
- `experimental`: 문서화 중이거나 API가 바뀔 수 있음.
- `legacy`: 기존 앱 compatibility를 위해 남아 있지만 새 코드에서 권장하지 않음.
- `deprecated`: replacement가 정해졌고 제거 계획이 있음.

빌드 실패나 export 누락은 문서 사이트 런타임 fallback으로 숨기지 않는다. CI/build에서 실패하게 두는 편이 drift를 빨리 발견한다.

## 14. Public Repo Safety

디자인 시스템 문서와 샘플은 public-safe 데이터만 사용한다.

- 실제 회원명, 이메일, 초대 token, session cookie, deployment hostname, OCI 값, private domain을 쓰지 않는다.
- 샘플 인물은 `member@example.com` 같은 안전한 예시 주소 또는 완전히 가상의 표시 이름을 사용한다.
- API key나 token처럼 보이는 예시는 넣지 않는다.
- 샘플 도서/세션 데이터는 공개 제품 설명에 적합한 가상의 데이터로 둔다.

## 15. Rollout 순서

구체 구현 계획은 별도 implementation plan에서 작성한다. 설계 기준 rollout은 다음 순서가 적절하다.

1. Root pnpm workspace를 추가하고 기존 `front` script가 깨지지 않는지 확인한다.
2. `design/system` package를 만들고 기존 token/CSS contract를 source of truth로 옮긴다.
3. `front`가 design-system CSS를 import하도록 compatibility path를 만든다.
4. Button, Badge, TextField/TextArea, Surface부터 React primitive를 추가한다.
5. `design/docs` Vite site를 만들고 Foundations/Components/Responsive/Migration 골격을 렌더링한다.
6. `front/shared/ui`의 재사용 component를 얇은 wrapper 또는 direct import로 점진 이관한다.
7. Navigation/Shell과 public/member/host patterns를 문서화하고 제품 앱과 맞춘다.
8. Responsive smoke test와 representative app screen 확인을 CI 또는 로컬 체크로 고정한다.

## 16. 승인된 결정 요약

- 대상 사용자는 개발자/에이전트와 디자이너/기획자를 모두 포함한다.
- 별도 정적 문서 사이트를 만든다.
- 첫 버전은 전체 목차를 얕게 깔고, 자주 쓰는 컴포넌트부터 깊게 확장한다.
- 독립 HTML/CSS 복제가 아니라 실제 앱과 같은 코드 기반 source of truth를 사용한다.
- 웹과 모바일을 모두 first-class로 다룬다.
- v1은 코드 기반 source of truth 방식이며 browser editor는 만들지 않는다.
- `packages/` + `apps/` 대신 top-level `design/` 아래 `system`과 `docs`를 둔다.
