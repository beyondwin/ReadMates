# ReadMates 전역 타이포그래피 가독성 정비 설계

작성일: 2026-08-01

상태: 디자인 승인, 구현 전

## 1. 요약

ReadMates의 공개, 멤버, 호스트, 플랫폼 관리자 화면 전반에서 글꼴 역할과 크기 기준을 다시 정리한다. 현재 긴 기록 문장에 적용되는 `reading-editorial`은 `--f-reading`을 통해 `Iowan Old Style`을 우선 사용한다. 이 구분은 문학적 분위기를 강화하려는 의도와 달리 한국어 UI 안에서 제목, 본문, 기록 문장의 형태를 불연속적으로 만들고 전체 가독성을 낮춘다. 동시에 전역 CSS에는 10~13px 직접 지정값이 넓게 분산되어 있어 작은 글자의 시인성과 정보 계층도 일관되지 않다.

승인된 방향은 **가독성 중심 전역 리셋**이다. 제목, 본문, 기록, 컨트롤을 Pretendard 기반 sans 계열로 통일하고, 화면의 역할별 성격은 별도 글꼴이 아니라 크기, 굵기, 행간, 여백, 정보 밀도로 표현한다. 모노스페이스는 정렬 의미가 있는 짧은 수치와 식별자에만 남긴다.

## 2. 현재 문제

1. `reading-editorial`이 적용된 기록 제목과 본문만 주변 UI와 다른 serif 계열로 렌더링되어 한 화면 안에서 시각적 연결이 끊긴다.
2. serif fallback 순서가 운영체제에 따라 달라 같은 화면도 플랫폼별 인상과 글자 폭이 달라질 수 있다.
3. `.small`, `.tiny`, `.eyebrow`와 화면별 직접 지정값이 10~13px에 집중되어 보조 정보가 지나치게 약하고 직관적인 탐색을 방해한다.
4. 한국어 제목과 강조문에 강한 음수 자간이 적용되어 글자가 눌려 보일 수 있다.
5. 공통 type class 외에 컴포넌트 인라인 `fontSize`, 전역 CSS 직접값, 정의되지 않은 `--font-editorial` 참조가 함께 존재해 같은 역할의 텍스트가 서로 다른 크기로 렌더링된다.
6. 역할별 분위기를 글꼴 교체로 구분하면서 공개 기록, 멤버 활동, 운영 화면 사이의 일관된 제품 인상이 약해졌다.

## 3. 목표

1. 모든 제품 화면의 기본 글꼴을 Pretendard 기반 sans stack으로 통일한다.
2. 긴 문장은 최소 14px, 일반 본문은 16px을 기본으로 보장한다.
3. 제목, 본문, 보조 문구, 라벨, 수치의 역할을 의미 기반 type scale로 명확히 구분한다.
4. 공개, 멤버, 호스트, 플랫폼 관리자 화면의 성격을 유지하면서 한 제품으로 읽히는 일관성을 회복한다.
5. 한국어와 영어의 긴 문자열, 320px 모바일, 브라우저 확대에서도 겹침, 잘림, 가로 스크롤이 없게 한다.
6. 향후 컴포넌트가 임의의 작은 글자 크기나 별도 읽기용 글꼴을 다시 도입하기 어렵게 테스트 경계를 둔다.

## 4. 비목표

- 색상, 카드 구조, 라우팅, 기능 동작 또는 정보 구조의 전면 재설계
- server, BFF, API contract, query, 인증, 권한, persistence 또는 migration 변경
- 새 웹폰트 또는 외부 font CDN 도입
- 사용자가 브라우저에서 선택하는 글꼴 설정 기능 추가
- 공개, 멤버, 호스트, 관리자 역할 간 콘텐츠 문구나 업무 우선순위 변경
- 타이포그래피와 무관한 전역 CSS 리팩터링

## 5. 검토한 접근

### 5.1 채택: Pretendard 중심 전역 가독성 리셋

`Iowan Old Style`, `--f-reading`, `reading-editorial`을 제거하고 공통 sans stack을 사용한다. 작은 크기, 행간, 자간, 굵기를 의미 기반 역할로 다시 정의하고 전체 화면의 직접 지정값을 감사한다.

- 장점: 사용자가 지적한 글꼴 이질감과 전역 크기 불일치를 함께 해결한다.
- 장점: 운영체제별 serif fallback 차이를 제거한다.
- 장점: 역할별 화면이 같은 제품으로 읽히면서 공간 구성으로 각 성격을 유지할 수 있다.
- 비용: 여러 화면의 줄바꿈과 스냅샷 기준을 다시 검토해야 한다.

### 5.2 제외: `reading-editorial`만 기존 sans로 복원

최근의 읽기용 글꼴 분리만 제거하면 변경 폭은 작다. 그러나 기존 10~13px 직접값, 강한 자간, 화면별 크기 편차가 남아 전반적인 가독성 문제를 해결하지 못한다.

### 5.3 제외: 다른 한국어 serif 웹폰트 도입

한국어에 최적화된 serif를 별도 로드하면 문학적 인상은 유지할 수 있다. 하지만 글꼴 분리 자체에서 생기는 이질감과 로딩 비용, fallback 차이를 계속 안고 가므로 이번 목표에 맞지 않는다.

## 6. 승인된 글꼴 역할

### 6.1 Sans

`--f-sans`를 제목, 본문, 기록, 인용, 내비게이션, 버튼, 입력, 상태 설명의 단일 기본 글꼴로 사용한다. 기존 Pretendard 우선 stack은 유지한다.

### 6.2 Editorial emphasis

`.editorial`은 별도 font family를 선택하지 않는다. 동일한 Pretendard 안에서 굵기와 제한적인 자간으로 제목 또는 기록의 중요도만 표현한다. 한국어 가독성을 해치는 강한 음수 자간은 완화한다.

### 6.3 Monospace

`--f-mono`와 `.ledger-number`는 다음처럼 정렬 의미가 있는 짧은 값에만 허용한다.

- 회차 번호와 고정 폭 수치
- 운영 지표와 표의 숫자 열
- 사람이 식별해야 하는 짧은 코드

내비게이션, 버튼, 상태 설명, 긴 날짜 문장, 제목에는 모노스페이스를 사용하지 않는다. 숫자 정렬만 필요하면 먼저 `font-variant-numeric: tabular-nums`를 사용하고 font family 교체는 최소화한다.

### 6.4 제거 대상

- `--f-reading`
- `reading-editorial` class와 해당 class를 요구하는 테스트
- `Iowan Old Style` 및 읽기용 serif fallback contract
- 정의되지 않은 `--font-editorial` 참조

## 7. 승인된 type scale

| 역할 | 데스크톱 | 모바일 | 행간 | 기본 굵기 |
| --- | --- | --- | --- | --- |
| H1 | 36px | 30px | 1.15~1.2 | 600 |
| H2 | 28px | 24px | 1.2~1.25 | 600 |
| H3 | 20px | 20px | 1.3 | 600 |
| H4 | 17px | 17px | 1.4 | 600 |
| 강조 본문 | 17px | 17px | 1.6 | 400~500 |
| 기본 본문 | 16px | 16px | 1.6 | 400~500 |
| 컨트롤·내비게이션 | 14~15px | 14~15px | 1.35~1.5 | 500~600 |
| 보조 문구 | 14px | 14px | 1.5 | 400~500 |
| 짧은 라벨 | 12px 이상 | 12px 이상 | 1.4 | 500~600 |

추가 규칙은 다음과 같다.

1. 10px와 11px 시각 텍스트는 사용하지 않는다.
2. 12px은 eyebrow, 짧은 badge, 단위가 분명한 한 줄 metadata처럼 보조적인 짧은 정보에만 허용한다.
3. 안내, 오류, 권한 제한, 상태 원인, 행동 label에는 12px을 사용하지 않는다.
4. 긴 기록과 인용은 16~17px, 행간 1.6 이상을 사용한다.
5. 모바일은 본문을 축소하지 않고 큰 제목과 주변 여백만 단계적으로 줄인다.
6. 제목 자간은 H1 최대 `-0.02em`, H2 최대 `-0.015em`, H3 최대 `-0.01em` 수준으로 완화한다. 본문은 기본 자간을 사용한다.
7. eyebrow의 대문자 자간은 현재의 과도한 벌림을 줄이고, 한국어 eyebrow에는 `text-transform`이 시각적 의미를 만들지 않는다는 점을 반영한다.

## 8. 화면별 적용

### 8.1 공개 화면

- 공개 기록 제목, 요약, 인용을 Pretendard로 통일한다.
- 문학적 분위기는 콘텐츠 폭, 여백, divider, 16~17px 본문과 넉넉한 행간으로 표현한다.
- 책 제목과 기록 제목은 600 굵기를 사용하되 본문과 다른 font family를 사용하지 않는다.
- 저자, 날짜, 회차 metadata는 14px을 기본으로 하고 짧은 eyebrow만 12px을 허용한다.

### 8.2 멤버 화면

- 읽기 기록, 회고, 활동 문장은 15px 미만으로 내리지 않으며 일반적으로 16~17px을 사용한다.
- 상태, 날짜, 기록 종류는 14px을 사용한다.
- 주요 행동과 내비게이션 label은 14~15px, 500~600 굵기로 구분한다.
- 개인 서재의 차분한 인상은 serif가 아니라 행간과 section rhythm으로 유지한다.

### 8.3 호스트 화면

- 표, 목록, 운영 상태의 기본 글자는 14px 이상으로 유지한다.
- 핵심 수치와 정렬된 숫자 열만 `.ledger-number` 또는 tabular number를 사용한다.
- 운영 밀도는 글자를 축소하지 않고 row padding, column grouping, progressive disclosure로 조정한다.
- 상태 설명과 위험 원인은 읽어야 하는 문장이므로 14px 미만으로 내리지 않는다.

### 8.4 플랫폼 관리자 화면

- 작은 모노스페이스와 영문 대문자 label 의존을 줄인다.
- 업무 제목, 상태, 원인, 다음 행동은 Pretendard 14px 이상으로 표현한다.
- 지표의 숫자는 tabular number를 사용할 수 있지만 label과 설명은 sans를 유지한다.
- 관리자 화면의 정밀함은 글자 축소가 아니라 alignment와 반복 가능한 row hierarchy로 만든다.

## 9. 디자인 시스템과 컴포넌트 경계

재사용 가능한 기준은 `design/system/src/styles/tokens.css`가 소유하고, app 전용 조정은 `front/src/styles/globals.css`와 `front/shared/styles/mobile.css`가 소유한다.

1. 공통 type class인 `.h1`~`.h4`, `.body`, `.body-lg`, `.small`, `.tiny`, `.eyebrow`, `.editorial`, `.ledger-number`를 승인된 scale에 맞춘다.
2. `reading-editorial`은 alias로 남기지 않고 markup에서 제거한다. 과거 class를 남기면 별도 읽기용 글꼴이 다시 생기거나 의미가 혼동될 수 있다.
3. 컴포넌트 인라인 `fontSize`와 화면별 CSS 직접값은 실제 의미 역할로 분류한 뒤 공통 class 또는 공통 custom property로 치환한다.
4. 예외 크기는 selector마다 임의로 만들지 않는다. 12px 예외가 필요하면 짧은 라벨이라는 의미와 사용 범위를 함께 명시한다.
5. 화면별 차이는 font family가 아니라 layout, spacing, weight, content density로 표현한다.
6. 새 React abstraction은 만들지 않는다. 이번 변경은 CSS type contract와 기존 markup class 정리가 중심이며, 데이터와 컴포넌트 책임 경계는 그대로 유지한다.

## 10. 마이그레이션 방식

전역 token만 한 번에 바꾸고 끝내지 않는다. 다음 순서로 전체 화면을 감사한다.

1. 디자인 시스템 font family와 type scale을 변경한다.
2. `reading-editorial`, `--f-reading`, `Iowan Old Style`, `--font-editorial` 사용처를 제거한다.
3. public, member, host, platform-admin 순서로 직접 지정된 10~13px 값을 분류한다.
4. 본문, 상태 설명, 행동 label은 승인된 scale로 올린다.
5. 짧은 label과 badge에만 12px 예외를 남기고 이유를 코드 구조상 식별 가능하게 한다.
6. 글자 증가로 깨진 레이아웃은 개별 글자 축소가 아니라 `min-width: 0`, wrapping, gap, padding, grid/flex track 조정으로 해결한다.
7. desktop과 mobile이 같은 semantic hierarchy를 공유하는지 확인하고 viewport별로 제목과 spacing만 조정한다.

## 11. 상태와 실패 처리

이번 변경은 데이터 요청이나 제품 오류 상태를 추가하지 않는다. 기존 loading, empty, error, permission state의 문구와 동작을 보존하되 그 텍스트도 승인된 가독성 하한을 적용한다.

타이포그래피 변경으로 발생할 수 있는 실패는 다음 기준으로 처리한다.

| 실패 | 처리 |
| --- | --- |
| 버튼 label이 두 줄이 됨 | 버튼 폭, padding, wrapping contract를 조정하고 글자를 14px 아래로 줄이지 않는다. |
| 표 또는 ledger가 넘침 | column 우선순위, wrapping, responsive presentation을 조정하고 설명 글자를 축소하지 않는다. |
| 긴 한국어·영문 제목이 영역을 밀어냄 | `min-width: 0`, `overflow-wrap`, grid/flex track을 조정한다. |
| 모바일에서 section 높이가 증가함 | 읽기 흐름을 유지하고 spacing을 조정한다. 본문 축소로 되돌리지 않는다. |
| snapshot 차이가 대량 발생함 | 차이를 화면별로 육안 검토한 뒤 승인된 새 기준만 갱신한다. 일괄 무검토 갱신은 하지 않는다. |

## 12. 접근성

- 일반 본문과 중요한 상태 정보는 최소 14px을 보장하고 WCAG AA 색상 대비를 유지한다.
- 브라우저 확대와 운영체제 글꼴 렌더링 차이에서도 텍스트가 잘리지 않아야 한다.
- 320px, 390px, desktop viewport에서 한국어와 영어 wrapping을 확인한다.
- 버튼과 link의 글자가 커져도 focus ring, 44px 이상 target, accessible name을 유지한다.
- 상태 차이는 글꼴 크기나 색상만으로 전달하지 않는다.
- 사용자의 font scaling과 zoom을 방해하는 고정 viewport 또는 text-size-adjust 억제 설정을 추가하지 않는다.

## 13. 예상 변경 표면

핵심 변경 표면은 다음과 같다.

- `design/system/src/styles/tokens.css`
- `design/system/src/design-system-boundaries.test.ts`
- `front/src/styles/globals.css`
- `front/shared/styles/mobile.css`
- `reading-editorial`, `ledger-number`, 직접 `fontSize`를 사용하는 public/member/host/platform-admin UI와 해당 unit/component tests
- 승인된 시각 차이가 있는 기존 component screenshot baseline

server, BFF, API, query, migration은 변경 표면에 포함하지 않는다.

## 14. 검증 계약

### 14.1 정적 경계

- 활성 frontend와 design system source에 `Iowan Old Style`, `--f-reading`, `reading-editorial`, `--font-editorial`이 남지 않았는지 검사한다.
- 시각 텍스트에 10px 또는 11px 새 값이 남지 않았는지 검사하고, 기존 값을 모두 분류한다.
- 디자인 시스템 테스트에서 sans, mono, type scale contract를 검증한다.

### 14.2 focused tests

- `reading-editorial`을 직접 검증하던 public/member unit 및 component tests를 새 sans contract로 변경한다.
- public record, member activity, host ledger, platform admin work queue의 대표 화면에서 computed font family와 핵심 크기를 검증한다.
- 320px와 390px에서 긴 한국어·영문 fixture의 `scrollWidth <= clientWidth`를 확인한다.

### 14.3 시각 검토

- 공개 홈과 공개 기록
- 멤버 홈과 멤버 기록
- 호스트 dashboard 또는 session ledger
- 플랫폼 관리자 today/work queue
- 각 대표 화면의 desktop과 mobile viewport

비교 기준은 글꼴 통일, 정보 계층, 긴 문장 행간, 작은 metadata의 시인성, 버튼·내비게이션의 즉시성, overflow 유무다.

### 14.4 frontend gates

- 디자인 시스템의 관련 test command
- `corepack pnpm --dir front lint`
- `corepack pnpm --dir front test`
- `corepack pnpm --dir front build`
- 영향받은 component test와 screenshot suite
- 실제 route layout 또는 responsive user flow assertion을 바꾸는 경우 focused E2E

구현 계획에서 현재 package scripts를 다시 확인해 디자인 시스템과 component test의 정확한 명령을 고정한다.

## 15. 완료 기준

- 모든 제품 화면의 제목, 본문, 기록, 컨트롤이 Pretendard 기반으로 일관되게 렌더링된다.
- `Iowan Old Style`, `--f-reading`, `reading-editorial`, `--font-editorial` 활성 사용이 없다.
- 일반 본문은 16px, 보조 문구는 14px, 짧은 라벨은 12px 이상이라는 하한이 지켜진다.
- 10px와 11px 시각 텍스트가 남지 않는다.
- 공개, 멤버, 호스트, 플랫폼 관리자 화면의 역할 차이는 spacing, weight, density로 유지된다.
- 320px, 390px, desktop과 확대 환경에서 텍스트 겹침, 잘림, 의도하지 않은 가로 스크롤이 없다.
- 관련 unit, component, screenshot, lint, test, build 검증이 통과한다.
- API, 권한, route, 데이터 동작에는 변화가 없다.
