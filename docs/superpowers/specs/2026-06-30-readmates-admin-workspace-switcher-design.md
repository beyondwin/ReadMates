# ReadMates Admin Workspace Switcher Design

작성일: 2026-06-30
상태: APPROVED DESIGN SPEC
대상 표면: platform admin shell, auth session UX, frontend route navigation

## 1. 배경

ReadMates의 platform admin은 `/admin`에서 클럽 공개 readiness, 운영 health, 알림, AI Ops, 감사, 분석을 확인한다. 현재 어드민 헤더에는 `-> 멤버 공간` 링크가 있지만, 이 링크는 `/app`으로만 이동한다. 사용자가 platform admin이면서 특정 클럽의 멤버 또는 호스트 권한도 가진 경우, 어드민 화면에서 바로 해당 클럽의 멤버/호스트 공간으로 이동하는 방법이 충분히 드러나지 않는다.

현재 인증 구조는 이 문제를 새 서버 API 없이 해결할 수 있다. `/api/auth/me`는 이미 `platformAdmin`, `joinedClubs`, `currentMembership`, `recommendedAppEntryUrl`을 내려준다. 아키텍처상 platform admin 권한은 클럽 membership role과 별개이며, platform admin은 특정 클럽의 host가 아니다. 따라서 이번 UX는 "관리자 권한으로 호스트처럼 들어가기"가 아니라 "현재 로그인 계정이 이미 가진 클럽 권한으로 이동하기"로 설계한다.

다른 Google 계정으로 들어가야 하는 운영자 흐름도 있다. 이 경우는 같은 계정 안의 워크스페이스 전환이 아니라 계정 변경이다. 1차 범위에서는 ReadMates 세션을 명확히 로그아웃한 뒤 로그인 화면으로 이동시키는 보조 액션으로 처리한다.

## 2. 목표

성공 기준:

- `/admin` 헤더에서 현재 계정이 가진 멤버/호스트 공간으로 바로 이동할 수 있다.
- HOST membership이 있는 클럽은 `/clubs/:slug/app/host` 목적지를 제공한다.
- MEMBER, VIEWER, SUSPENDED처럼 멤버 공간을 열 수 있는 클럽은 `/clubs/:slug/app` 목적지를 제공한다.
- 다른 계정으로 들어가야 할 때는 명시적인 "다른 계정으로 로그인" 액션으로 현재 세션을 정리한 뒤 로그인 화면으로 이동한다.
- UX 문구는 권한 상승, impersonation, support access처럼 보이지 않게 현재 계정의 실제 권한만 표현한다.
- 새 API, DB migration, OAuth provider behavior 변경 없이 frontend/admin shell 범위에서 닫는다.

## 3. Non-goals

- Platform admin이 클럽 호스트 권한을 임시로 얻는 기능을 만들지 않는다.
- Support access grant, impersonation, audit-backed session delegation을 만들지 않는다.
- Google OAuth의 `prompt=select_account` 강제 전달 계약을 이번 범위에 포함하지 않는다.
- 서버 `/api/auth/me` response shape를 변경하지 않는다.
- 클럽 membership role, status, platform admin role 판정 로직을 변경하지 않는다.
- 어드민 사이드바 전체 IA나 `/app` 클럽 선택 화면을 재설계하지 않는다.
- Real member data, private domains, deployment state, local absolute paths, OCIDs, secrets, token-shaped examples를 문서나 fixture에 추가하지 않는다.

## 4. 선택한 접근

선택한 접근은 **어드민 헤더의 "내 공간" 메뉴**이다.

검토한 대안:

1. **어드민 헤더 "내 공간" 메뉴** - 추천
   - 장점: 사용자가 어드민 컨텍스트를 떠나지 않고 가능한 목적지를 바로 볼 수 있다. 현재 `AuthMeResponse`만으로 구현할 수 있고 권한 경계가 명확하다.
   - 단점: 어드민 헤더에 작은 메뉴 상태와 테스트가 추가된다.

2. **`/app` 클럽 선택 화면으로 위임**
   - 장점: 전환 UI를 한 곳에 모을 수 있다.
   - 단점: 어드민에서 호스트 공간으로 바로 가려는 사용자는 여전히 한 단계를 더 거친다.

3. **어드민 전용 계정/역할 전환 패널**
   - 장점: 향후 support access나 impersonation까지 담을 수 있다.
   - 단점: 현재 문제에 비해 과하고, platform admin 권한과 club host 권한을 혼동시킬 위험이 있다.

## 5. Architecture

구성 단위:

```text
/admin route loader
  -> requirePlatformAdminLoaderAuth()
  -> /api/auth/me
  -> AuthMeResponse(joinedClubs, platformAdmin)
  -> admin shell query cache or scoped auth read
  -> workspace switcher model
  -> AdminShellLayout header menu
```

책임 분리:

- `front/features/platform-admin/route`: 어드민 shell loader와 layout composition을 유지한다.
- `front/features/platform-admin/model`: `joinedClubs`에서 메뉴 항목과 목적지를 계산하는 순수 모델을 둔다.
- `front/features/platform-admin/ui`: 메뉴 렌더링, 비어 있는 상태, 로그아웃 실패 상태를 props/callback으로 표현한다.
- `front/features/auth/api`와 기존 `logout()`은 "다른 계정으로 로그인"에서 현재 세션을 정리하는 데 재사용한다.
- `shared/auth/member-app-access`의 의미는 유지한다. 메뉴 목적지는 `AuthJoinedClub`의 `role`과 `status`로 계산하며, 실제 route 접근은 기존 route guard와 loader 권한 판정이 최종적으로 막는다.

새 server API는 만들지 않는다. `/api/auth/me`의 `joinedClubs`가 충분하지 않은 경우에도 이번 범위에서는 response contract를 확장하지 않고 빈 상태 또는 현재 가능한 목적지만 보여준다.

## 6. Workspace Menu Behavior

어드민 헤더의 기존 `-> 멤버 공간` 링크를 `내 공간` 메뉴 버튼으로 대체한다. 현재 platform role badge는 그대로 유지한다.

메뉴 구조:

- 제목: `내 ReadMates 공간`
- 현재 계정 표시: email 또는 account/display name 중 public-safe한 값
- 클럽 항목:
  - `role=HOST`, `status=ACTIVE`: 주 목적지 `호스트 공간`, href `/clubs/:slug/app/host`
  - `status=VIEWER | ACTIVE | SUSPENDED`: 멤버 목적지 `멤버 공간`, href `/clubs/:slug/app`
  - host 항목은 클럽 이름, `HOST` badge, `호스트 공간` 주 링크와 `멤버 공간` 보조 링크를 함께 보여준다.
  - member/viewer 항목은 클럽 이름, role/status badge, 멤버 목적지를 보여준다.
- 빈 상태: `이 계정으로 열 수 있는 클럽이 없습니다.`
- 하단 구분선: `다른 계정으로 로그인`

메뉴는 어드민 header 안에서 동작한다. 데스크톱과 좁은 폭 모두에서 버튼 텍스트, badge, 클럽 이름이 겹치지 않아야 한다. 검색, impersonation, support grant 설명은 넣지 않는다.

## 7. Other Account Login

`다른 계정으로 로그인`은 워크스페이스 전환이 아니라 계정 변경이다.

동작:

1. 현재 admin path, search, hash를 안전한 relative return target으로 보존한다.
2. 기존 `POST /api/auth/logout`을 호출한다.
3. 성공하면 `/login?returnTo=<현재 admin 경로>`로 이동한다.
4. 실패하면 현재 메뉴 안에 `로그아웃에 실패했습니다. 다시 시도해 주세요.`를 표시하고 `/admin`에 머문다.

이 액션은 Google 계정 선택을 강제한다고 약속하지 않는다. Google 계정 선택 강제가 필요하면 별도 후속 작업에서 BFF와 Spring OAuth authorization request resolver가 `prompt=select_account`를 안전하게 통과시키는 계약을 설계한다.

## 8. Error Handling

- `joinedClubs`가 없거나 빈 배열이면 빈 상태를 보여준다.
- 알 수 없는 membership status는 이동 항목에서 제외한다.
- HOST role이지만 status가 `ACTIVE`가 아니면 host 목적지를 만들지 않는다.
- 생성하는 href는 `/clubs/:slug/app` 또는 `/clubs/:slug/app/host` 형태의 내부 경로만 허용한다.
- 로그아웃 실패는 메뉴-local error로 표시한다.
- 로그아웃 성공 후 return target은 safe relative path만 사용한다.

## 9. Testing

Frontend 테스트:

- 순수 모델 테스트
  - HOST ACTIVE club -> `/clubs/:slug/app/host`
  - MEMBER ACTIVE club -> `/clubs/:slug/app`
  - VIEWER/SUSPENDED club -> 멤버 공간 항목
  - INVITED/LEFT/INACTIVE club -> 항목 제외
  - empty joined clubs -> 빈 상태
- UI 테스트
  - `AdminShellLayout` 또는 분리된 menu component가 role badge와 `내 공간` 메뉴를 함께 보여준다.
  - host membership이 있는 platform admin fixture에서 호스트 공간 링크가 보인다.
  - joined clubs가 없는 platform admin fixture에서 빈 상태가 보인다.
  - logout failure가 메뉴-local error를 표시한다.
- E2E 보강
  - `tests/e2e/admin-shell.spec.ts`에 platform admin + host membership fixture를 추가하고 `/admin`에서 메뉴를 통해 `/clubs/:slug/app/host`로 이동하는 흐름을 확인한다.

권장 검증 명령:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front test:e2e -- tests/e2e/admin-shell.spec.ts
```

문서 변경 검증:

```bash
git diff --check -- docs/superpowers/specs/2026-06-30-readmates-admin-workspace-switcher-design.md
```

## 10. Release And Safety Notes

이번 변경은 frontend/admin shell UX 변경이다. Server API, auth cookie format, OAuth callback, DB migration, production deployment scripts는 바꾸지 않는다.

Release readiness에서 확인할 잔여 위험:

- 어드민 헤더 메뉴가 좁은 폭에서 겹치지 않는지.
- platform admin과 club host 권한이 copy나 badge에서 혼동되지 않는지.
- 다른 계정 로그인 실패가 사용자를 반쯤 로그아웃된 상태로 보이게 하지 않는지.
- E2E fixture가 real member data나 private domain을 포함하지 않는지.

후속 후보:

- Google 계정 선택 강제 옵션을 별도 OAuth 계약으로 추가한다.
- `/app` 클럽 선택 화면과 어드민 `내 공간` 메뉴의 destination 계산 모델을 공유한다.
- support access나 impersonation이 필요해지면 감사 로그, 만료, reason, visible banner를 포함하는 별도 설계를 만든다.
