# ReadMates 공개 홈 Living Archive 재설계

작성일: 2026-08-12
상태: APPROVED DESIGN SPEC
구현 상태: 격리 프리뷰 구현 완료; 현재 공개 홈(`/`, `/clubs/:slug`)은 변경하지 않음
대상 표면: `front/`의 격리된 `/living-archive-preview` 디자인 검증 route

## 0. 구현 대상 변경 기록

2026-08-12 사용자 승인 이후 구현 위치가 변경되었다. 이 문서의 시각·브랜드·반응형 계약은
유지하되, 현재 공개 홈(`/`, `/clubs/:slug`)에는 아직 반영하지 않는다. 첫 구현은 다음 조건을
만족하는 격리 프리뷰로 제공한다.

- 정확한 URL은 `/living-archive-preview`다.
- 기존 공개 홈 route, `PublicHomeRoute`, `PublicHome`, 공용 `PublicRouteLayout`의 화면은 변경하지 않는다.
- 프리뷰는 전용 header와 page shell을 사용하며 공용 공개 navigation과 footer에 링크를 추가하지 않는다.
- 검색 노출을 막기 위해 `robots=noindex,nofollow`를 설치하고 route 이탈 시 제거한다.
- 공개 API와 baseline club loader는 재사용하지만 새로운 서버/BFF/API 계약은 만들지 않는다.
- 시안 검수와 사용자의 홈 적용 승인이 끝나기 전에는 `/` 또는 `/clubs/:slug`를 교체하지 않는다.
- 구현된 프리뷰의 활자는 현재 repository typography contract에 따라 `--f-sans`와 `--f-mono`를
  사용하고 모든 시각 text를 최소 `12px`로 유지한다. 아래 7.2의 명조 제안은 최초 승인 당시의
  시각 방향 기록이며 현재 구현 계약을 덮어쓰지 않는다.

아래에서 “공개 홈”이라고 쓴 시각·정보구조 설명은 프리뷰가 장차 대체할 후보 화면을 뜻한다.
현재 운영 route가 이미 교체되었다는 의미로 해석하지 않는다.

## 1. 배경

현재 공개 홈은 클럽 소개, 최근 기록, 통계, 읽는 방식, 공개 범위, 멤버 진입, 기록 목록을 모두
제공한다. 그러나 대부분의 구간이 `eyebrow + 제목 + 설명 또는 원장`의 같은 리듬을 반복하고,
최근 기록과 멤버십 문구도 여러 형태로 재등장한다. 방문자는 제품의 구조를 이해할 수 있지만
`이 모임의 기록을 더 읽고 싶다`거나 `이 모임에 초대받고 싶다`는 감정적 인상을 빠르게 얻기 어렵다.

이번 재설계는 ReadMates를 AI 기능이나 범용 커뮤니티 도구가 아니라 **사람과 문장이 축적되는
초대형 독서모임 아카이브**로 보여준다. 공개 기록은 누구나 읽을 수 있고 모임 참여는 초대받은
멤버에게 열리는 현재 제품 경계를 유지한다.

## 2. 근거와 source of truth

이 문서는 다음 저장소 자료와 현재 코드를 기준으로 한다.

- 공통 실행 계약: `docs/agents/execution.md`
- 프런트엔드 가이드: `docs/agents/front.md`, `front/AGENTS.md`
- 디자인 가이드: `docs/agents/design.md`, `.impeccable.md`
- 아키텍처: `docs/development/architecture.md`
- 프로젝트 탐색: `docs/development/project-map.md`
- 수직 슬라이스 기준: `docs/development/vertical-slice-checklist.md`
- 공개 route와 loader:
  - `front/features/public/route/public-home-route.tsx`
  - `front/features/public/route/public-route-data.ts`
- 공개 query와 API:
  - `front/features/public/queries/public-queries.ts`
  - `front/features/public/api/public-api.ts`
  - `front/features/public/api/public-contracts.ts`
- 공개 모델과 UI:
  - `front/features/public/model/public-display-model.ts`
  - `front/features/public/ui/public-home.tsx`
  - `front/features/public/ui/public-session.tsx`

외부 제품과 문화 매체는 외형 복제가 아니라 감정적 진입, 실제 콘텐츠 증거, 초대 경계,
에디토리얼 위계, 의미 기반 모션을 비교하기 위해 참고했다.

- [Fable](https://fable.co/interactive-reading): 책, 사람, 진도, 반응을 한 장면으로 묶는 사회적 읽기
- [Partiful](https://partiful.com/): 초대 자체를 기대감 있는 제품 경험으로 만드는 구조
- [Letterboxd](https://letterboxd.com/): 홍보 목업보다 실제 작품과 활동을 전면에 두는 방식
- [Are.na](https://www.are.na/about): 휘발성 피드 대신 오래 남는 개인·공동 아카이브
- [Magazine B](https://magazine-b.com/): 한 대상과 한 호를 소장 가능한 문화 콘텐츠로 만드는 편집
- [BE(ATTITUDE)](https://magazine.beattitude.kr/): 한국어 중심의 강한 활자와 사람·작품의 편집
- [현대카드 DIVE](https://dive.hyundaicard.com/web/artlibrary/spaceInfo.hdc): 문화 프로그램과 입장 경계를
  구체적으로 설명하는 멤버십 경험
- [Nordiska Museet](https://www.nordiskamuseet.se/en/): 브랜드 고유 모티프를 이미지 프레임과
  모션 규칙으로 확장하는 방식
- [Rijksmuseum](https://www.rijksmuseum.nl/en): 한 화면에 하나의 작품과 하나의 메시지를 두는 집중도

### 2.1 승인 시안과 충실도 계약

사용자가 선택한 `People Between the Volumes` 3번 시안을 공개 홈 구현의 **canonical visual
reference**로 사용한다. 참조 artifact는 `exec-822d0e31-13e4-4210-802d-e3f20aa23279.png`, 원본 크기는
`1487 x 1058`, SHA-256은
`5300d886fcc62edb8bd2c1b4a71dd3a0e58e39d6701cb4effa1f000fdd8a02ee`다. 로컬 절대 경로는 저장소
문서에 기록하지 않고 구현 handoff에서 artifact 자체를 전달한다.

이 시안은 분위기 참고가 아니라 desktop 구성의 승인 기준본이다. 다음 항목은 그대로 재현한다.

- 상단의 얇고 조용한 wordmark/navigation과 넓은 무장식 여백
- 좌측 상단의 2행 브랜드 문장과 바로 아래의 짧은 보조 문장
- 첫 viewport의 가로폭 전체를 점유하는 연속된 책등, 중앙의 앞으로 나온 최신 회차, 우측의 밝은
  `다음 자리`
- 책등 위로 떠 있는 최대 세 명의 독자 흔적과 회차까지 이어지는 가는 선
- 선반 아래에서 즉시 이어지는 2분할 편집 strip, 세로선, 작은 folio label, 넓은 내부 여백
- 따뜻한 bone 배경, carbon text, 저채도 cloth spine, brass 각인, cobalt/vermilion 관계선
- flat paper와 cloth 물성, 최소 radius, 책이 앞으로 나올 때만 생기는 절제된 그림자

`1487 x 1058` 검수 viewport에서는 다음 normalized composition을 유지한다.

| 구간 | 기준 | 허용 편차 |
| --- | --- | --- |
| header | 높이 약 `9%` | `+/- 12px` |
| 브랜드 문장 시작점 | `x 4%`, `y 11%` | `+/- 16px` |
| 책등 상단 | `y 36.8%` | `+/- 16px` |
| 선반 하단 | `y 73.2%` | `+/- 16px` |
| 최신 회차 중심 | `x 56%` | `+/- 3%` |
| 다음 자리 중심 | `x 82%` | `+/- 3%` |
| 하단 strip 시작 | `y 77.8%` | `+/- 20px` |

실제 구현은 승인 이미지를 hero raster로 사용하지 않는다. DOM, CSS, 실제 공개 데이터로 재구성하고,
AI 시안의 깨진 글자, 임의 인물, 임의 책과 날짜는 제품의 실제 문구와 public-safe fixture로 교정한다.
API가 제공하는 최근 회차 수보다 많은 가짜 책등이나 가짜 멤버를 만들지 않는다. 데이터 수가 달라도
책등의 비례, 연속된 선반, 펼친 회차, 다음 자리, 하단 strip이라는 조형은 유지한다.

다음 결과는 구현 실패로 본다.

- 기존 공개 홈의 카드형 구성을 유지한 채 색과 폰트만 바꾸는 것
- 일반적인 `headline + CTA + feature cards` landing으로 단순화하는 것
- 승인 시안과 대조하지 않고 새 component screenshot만 baseline으로 채택하는 것
- desktop 시안을 그대로 축소해 mobile horizontal scroll을 만드는 것

## 3. 목표

1. 방문자가 첫 3초 안에 ReadMates를 사람과 문장이 쌓이는 독서모임으로 이해한다.
2. 공개 기록을 제품의 핵심 재료로 보여주면서 최신 기록으로 자연스럽게 진입하게 한다.
3. 공개 열람과 초대 기반 참여의 차이를 배타적으로 보이지 않게 설명한다.
4. 책등, 펼친 회차, 독자 문장, 다음 자리를 재사용 가능한 브랜드 자산으로 만든다.
5. 데스크톱과 모바일을 각각의 읽기 맥락에 맞게 조판한다.
6. 현재 공개 API, 권한, URL, OAuth와 초대 계약을 변경하지 않는다.
7. 모션이 꺼져도 정보 구조와 행동 가능성이 완전하게 유지된다.

## 4. 비목표

- 서버 API, 데이터베이스, migration, 공개 범위를 변경하지 않는다.
- 공개 클럽 탐색 마켓플레이스나 추천 피드를 추가하지 않는다.
- AI 생성 기능이나 AI 카피를 공개 홈의 주인공으로 만들지 않는다.
- 실제 멤버 데이터, 검증되지 않은 후기, 가짜 회원 수를 추가하지 않는다.
- 멤버 홈, 호스트 원장, 플랫폼 관리자 화면을 이번 구현 범위에 포함하지 않는다.
- 로고와 제품 이름을 전면 교체하지 않는다. `ReadMates`는 플랫폼명, `읽는사이`는 대표 클럽명으로
  유지한다.
- 생성된 콘셉트 이미지를 제품 배경이나 정적 hero 이미지로 사용하지 않는다.
- 수평 스크롤을 강제하거나 실제 책장처럼 보이는 무거운 WebGL 경험을 만들지 않는다.

## 5. 탐색한 방향과 선택

### 5.1 Private Reading Salon

물성 있는 초대장과 사적 멤버십의 따뜻함을 중심에 둔다. 전환 의도는 강하지만 기록보다 초대가
앞서고, 고급 서재나 배타적 문화 클럽처럼 보일 위험이 있다.

### 5.2 Living Margins

밑줄과 여백 메모가 사람을 연결하는 현대적 에디토리얼 방향이다. 모션 언어는 강하지만 연결선과
떠 있는 메모를 늘리면 AI 도구나 지식 그래프처럼 보일 수 있다.

### 5.3 Living Archive Shelf — 선택

각 모임을 한 권의 장서로 쌓고, 펼친 책에서 사람과 문장을 보여주며, 한 칸의 빈 자리를 다음
모임으로 남긴다. ReadMates의 기록 중심 제품 구조와 초대 기반 참여를 하나의 장면으로 설명할 수
있어 선택한다.

선택안 안에서는 **People Between the Volumes** 변형을 사용한다. 책등만 나열하지 않고 공개가
허용된 사람의 짧은 문장과 식별 표시를 회차에 연결해 아카이브가 살아 있는 모임임을 보여준다.

## 6. 브랜드 정의

### 6.1 핵심 문장

- 브랜드 문장: `책 사이에 사람이 남습니다`
- 보조 문장: `서로 다른 문장이 한 권의 기억이 됩니다`
- 제품 약속: 한 권을 함께 읽고 나눈 생각이 다음 만남까지 오래 남는다.

### 6.2 시그니처 모티프

1. **축적된 책등**: 지난 공개 회차와 시간의 축적
2. **펼친 회차**: 지금 읽을 수 있는 최신 기록
3. **사람과 문장**: 공개가 허용된 독자 흔적과 서로 다른 해석
4. **연결선**: 문장과 회차가 이어지는 관계
5. **다음 자리**: 다음 모임과 초대 가능성

### 6.3 이름의 위계

- `ReadMates`: 여러 클럽을 연결하는 플랫폼 wordmark
- `읽는사이`: 현재 공개 페이지의 클럽 identity
- 두 이름은 헤더에서 구분선과 크기 차이로 함께 표시한다.
- 공개 홈의 큰 문장은 제품명이 아니라 클럽 경험을 말한다.

## 7. 시각 시스템

### 7.1 색

| 역할 | 값 | 사용 |
| --- | --- | --- |
| Warm bone | `#F5F2EB` | 페이지 배경 |
| Carbon ink | `#171817` | 큰 제목, 본문, 기본 아이콘 |
| Warm gray | `#66635D` | 보조 설명, 날짜, metadata |
| Cobalt | `#315BCE` | 첫 번째 독자 연결선, focus와 링크의 제한된 강조 |
| Vermilion | `#D65A3A` | 두 번째 독자 연결선, 선택된 작은 표식 |
| Muted brass | `#B38A45` | 책등 회차 번호와 북플레이트의 가는 선 |

책등은 포레스트, 벽돌, 머스터드, 잉크 블루, 웜 그레이의 저채도 천 제본 색을 사용한다.
초록은 책등의 소재색으로만 허용하고 제목, 본문, 버튼, 링크에는 사용하지 않는다.

### 7.2 타이포그래피

- 공개 홈의 고정 브랜드 문장과 고정 section title: `Noto Serif KR`, weight 500
- 탐색, 버튼, 본문, 날짜, 동적 인용문과 책·사람 데이터: 기존 `Pretendard Variable`
- 회차 번호와 짧은 folio: 기존 monospace token
- 명조는 공개 홈의 큰 고정 문장에만 사용한다. 멤버·호스트·관리자 화면으로 확장하지 않는다.
- 고정 문장에 필요한 한국어 glyph만 self-hosted subset으로 제공하고, font loading 전후 레이아웃
  이동이 없도록 fallback metric을 조정한다. 동적 데이터는 subset font에 의존하지 않는다.

### 7.3 형태와 질감

- 둥근 카드 대신 선반, 책등, 인덱스 선, 여백으로 구획한다.
- radius는 조작 컨트롤에만 현재 design token 범위로 사용한다.
- 그림자는 책이 앞으로 나온 상태를 설명할 때만 사용한다.
- 종이와 천 질감은 저대비 CSS 또는 작은 최적화 asset으로 제한한다. 텍스트 가독성을 떨어뜨리거나
  LCP hero 전체를 대형 raster 이미지로 만들지 않는다.

## 8. 홈페이지 정보 구조

### 8.1 Hero — 살아 있는 서가

첫 화면은 브랜드 문장과 하나의 수평 서가로 구성한다.

- 왼쪽 위: `책 사이에 사람이 남습니다`
- 보조 문장: `서로 다른 문장이 한 권의 기억이 됩니다`
- 서가: 최근 공개 회차를 포함한 제한된 수의 책등
- 펼친 책: 최신 공개 회차의 책, 날짜, 요약 또는 한 문장
- 사람 흔적: 최신 공개 회차 상세에 이미 공개된 작성자와 avatar만 사용
- 빈 칸: `다음 자리`
- 주 CTA: `최근 대화 펼치기`
- 보조 진입: `공개 기록 보기`

Hero는 화면을 작은 앱 카드로 채우지 않는다. 한 서가, 한 펼친 회차, 한 빈 자리만 주인공으로 둔다.

### 8.2 최근 모임

Hero에서 펼친 책과 같은 회차를 이어 받아 도서 표지, 날짜, 공개 요약, 최대 세 개의 공개 문장을
보여준다. 같은 최근 기록을 별도의 카드와 목록으로 반복하지 않는다.

### 8.3 사람과 문장의 연결

- 최대 세 명의 공개 작성자를 사용한다.
- 각 작성자는 avatar, 짧은 이름, 공개 문장 하나로 표현한다.
- 코발트와 주홍 연결선은 작성자, 문장, 해당 회차를 연결한다.
- 색만으로 관계를 전달하지 않고 선의 시작점, 번호, focus 상태를 함께 사용한다.
- 공개 작성자가 없으면 얼굴, 이름, 문장을 추측하거나 생성하지 않는다.

### 8.4 함께 읽는 리듬

기존 설명 섹션을 다음 네 단계로 통합한다.

```text
책 선택 -> 각자의 읽기 -> 함께 대화 -> 기록 보관
```

각 단계는 기능 아이콘 카드가 아니라 책 한 권이 서가에 들어가는 연속된 편집 장면으로 설명한다.

### 8.5 공개와 초대의 경계

핵심 문구는 `기록은 누구나 읽고, 참여는 초대받은 멤버와 이어갑니다`다.

- 공개 기록으로 가는 행동과 멤버 공간으로 가는 행동을 분리한다.
- 초대 token이나 private 상태를 공개 홈에 노출하지 않는다.
- 잠금 아이콘만으로 상태를 설명하지 않고 문구와 다음 행동을 함께 제공한다.
- 현재 `PublicEntryActions`와 OAuth/join 의미를 보존한다.

### 8.6 기록 아카이브

- 데스크톱: 회차를 책등과 folio index로 보여준다.
- 모바일: 수평 서가를 축소하거나 가로 스크롤하지 않고 세로 기록 목록으로 재조판한다.
- 전체 기록 링크는 기존 `publicRecordsHref`를 사용한다.
- 최근 회차를 Hero, 사람 연결, 아카이브에서 서로 다른 전문으로 반복하지 않는다. 아카이브에서는
  제목, 회차, 날짜만 제공한다.

## 9. 모션과 인터랙션

모션 문법은 세 가지로 제한한다.

### 9.1 꺼내기

- Hero 진입 시 최신 회차 책이 18–24px 앞으로 나온다.
- 표지는 최대 2도 열리고 내용이 나타난다.
- 공개 기록 진입은 browser support가 있을 때 progressive enhancement로 같은 표지의 view transition을
  사용한다. 별도 polyfill은 추가하지 않고, 지원하지 않는 browser에서는 즉시 route 이동한다.

### 9.2 이어지기

- 사람이나 문장에 hover, focus, tap하면 해당 회차까지 연결선이 350–450ms에 그어진다.
- 관련 없는 요소는 제거하지 않고 대비만 낮춘다.
- 모바일에서는 동시에 하나의 관계만 강조하고 다시 탭하거나 다른 관계를 선택하면 전환한다.

### 9.3 채워지기

- 읽는 리듬 구간에서 책이 차례로 서가에 들어간다.
- 마지막 한 칸은 `다음 자리`로 남는다.
- 자동 반복하지 않는다.

### 9.4 모션 예산

- 버튼과 작은 상태 피드백: 120–220ms
- section 관계 변화: 350–450ms
- Hero 최초 orchestration: 최대 700ms, 한 번만 실행
- `transform`과 `opacity`를 우선하고 장시간 blur, filter, layout animation은 사용하지 않는다.
- offscreen 모션은 정지한다.
- 모션이 끝나기 전에도 링크와 CTA를 바로 사용할 수 있다.
- `prefers-reduced-motion: reduce`에서는 모든 요소를 최종 위치에 정적으로 표시한다.

## 10. 반응형 동작

### 10.1 Desktop

- 1180px 이상의 container에서 브랜드 문장과 서가를 하나의 넓은 장면으로 구성한다.
- 펼친 회차는 서가 중앙 또는 시선 중심에 두고 빈 자리는 오른쪽에 둔다.
- 연결선은 콘텐츠 위를 지나지 않으며 resize 시 view model의 고정 anchor 관계로 다시 배치한다.

### 10.2 Tablet

- 서가에 보이는 과거 회차 수를 줄인다.
- 브랜드 문장, 펼친 회차, 다음 자리를 두 행으로 나눌 수 있다.
- 숨긴 회차는 아카이브 링크를 통해 접근 가능해야 한다.

### 10.3 Mobile

모바일은 데스크톱 서가를 축소하지 않고 다음 순서로 재조판한다.

```text
브랜드 문장
-> 펼친 최근 회차
-> 공개된 사람과 문장
-> 다음 자리와 멤버 진입
-> 세로 기록 목록
```

- 320px에서도 primary action은 최소 44px 높이를 유지한다.
- avatar와 연결선은 본문을 덮지 않는다.
- 200% 확대에서 horizontal page overflow가 생기지 않는다.
- hover 정보는 tap과 keyboard focus로 동일하게 제공한다.

## 11. 프런트엔드 구조

### 11.1 데이터 흐름

```text
publicClubQuery
  -> recentSessions[0] 선택
  -> publicSessionQuery를 선택적 보강 데이터로 조회
  -> pure living-archive home view model
  -> prop-driven public UI
```

- `publicClubQuery`는 공개 홈의 필수 데이터다.
- 최신 회차의 `publicSessionQuery`는 사람과 문장을 보강하는 비필수 데이터다.
- 공개 session detail 실패가 공개 홈 전체 route error로 승격되지 않게 route에서 fail-soft로 조합한다.
- 현재 공개 API와 response contract를 변경하지 않는다.
- route가 query와 fallback을 소유하고 UI는 fetch, query, router에 의존하지 않는다.

### 11.2 모델

`front/features/public/model/public-home-living-archive.ts`에 순수 projection을 둔다.

책임:

- 최근 회차와 제한된 과거 회차를 책등 view로 변환
- 공개 detail에서 최대 세 개의 사람·문장 trace 선택
- stable trace index와 연결선 style variant 계산
- detail 부재, 문장 부재, 이미지 부재의 fallback 계산
- desktop/tablet에서 보여줄 최대 회차 수를 UI가 결정할 수 있는 순서 정보 제공

모델은 React, router, query, API client를 import하지 않는다. 자체 feature의 wire type은 type-only import만
허용한다.

### 11.3 UI 경계

`front/features/public/ui/public-home.tsx`는 공개 홈 조합을 담당하고 다음 focused UI로 분리한다.

- `living-archive-hero.tsx`
- `archive-shelf.tsx`
- `featured-volume.tsx`
- `reader-traces.tsx`
- `public-reading-rhythm.tsx`
- `public-membership-boundary.tsx`
- `public-archive-index.tsx`

각 UI는 props와 callbacks만 받고 feature API, query, route, `shared/api`를 import하지 않는다. 반복 사용이
확인되기 전에는 design-system export로 승격하지 않는다.

## 12. 오류와 빈 상태

| 상태 | 표시 | 금지 |
| --- | --- | --- |
| 공개 회차 없음 | 비어 있는 첫 서가, `첫 기록을 준비하고 있습니다`, 클럽 소개 | 가짜 책등과 가짜 회차 |
| 최신 detail 조회 실패 | 책, 날짜, 공개 요약 중심의 펼친 회차 | 홈 전체 오류 화면 |
| 공개 문장 없음 | `이 회차는 요약 중심으로 공개했습니다` | 합성 문장, 합성 작성자 |
| 공개 작성자 없음 | 사람 연결 영역 생략 | 익명 얼굴 임의 생성 |
| 도서 이미지 없음 | 기존 `BookCover` 텍스트 표지 | 깨진 이미지 또는 stock cover |
| 긴 제목 | 책등에는 회차 번호, 펼친 회차에 전체 제목 | 의미를 알 수 없는 과도한 축약 |
| route/API 필수 데이터 실패 | 기존 공통 route error 경험 | 별도 브랜드와 복구 없는 raw 오류 |

## 13. 접근성

- semantic `main`, section heading, list 구조를 사용한다.
- 책등이 링크이면 전체 회차 이름을 accessible name으로 제공한다.
- 선택된 사람과 연결된 회차 관계는 `aria-describedby` 또는 동등한 텍스트로 전달한다.
- 연결 상태는 색만으로 표현하지 않고 번호, 선의 endpoint, 텍스트 상태를 병행한다.
- focus ring은 기존 design token을 유지하고 책등 질감 위에서도 AA 대비를 만족한다.
- 장식용 질감, 선, 빈 자리 frame은 스크린리더에서 숨긴다.
- 반복 모션이 없더라도 reduced-motion에서 정보 손실이 없는지 별도 검사한다.
- 한국어와 영어가 섞인 제목, 320px, 200% zoom에서 겹침과 잘림이 없어야 한다.

## 14. 테스트와 검증

### 14.1 모델 테스트

- 최근 회차와 과거 회차의 안정된 순서
- 최대 세 개의 공개 trace 선택
- detail, 문장, 작성자, 이미지 부재 fallback
- 음수 count와 비정상 날짜에 대한 기존 방어 유지
- 같은 입력에서 stable trace index와 style variant 유지

### 14.2 UI 테스트

- Hero의 heading, CTA, 최신 회차 링크
- 공개 기록 없음과 detail 보강 실패의 축소 동작
- 키보드 focus, tap, hover가 같은 관계를 선택
- 초록색 typography token을 사용하지 않음
- `prefers-reduced-motion`에서 최종 상태와 모든 링크 사용 가능
- 동적 한국어·영문 줄바꿈

### 14.3 시각 검증

- 1440px desktop
- 768px tablet
- 390px와 320px mobile
- 200% browser zoom
- 기존 Docker Playwright CT 경로로 결정적 baseline 생성
- 생성된 콘셉트 이미지를 visual regression baseline으로 사용하지 않고 실제 컴포넌트를 캡처한다.

### 14.4 Route와 회귀 검증

- 공개 홈에서 최신 공개 기록 상세로 이동
- 전체 공개 기록으로 이동
- 멤버 진입과 초대 경계 유지
- 공개 detail 실패 시 공개 홈이 유지되는 경로
- 기존 public metadata, canonical URL, route continuity 유지
- view transition 미지원 환경에서도 같은 공개 기록 상세로 즉시 이동

구현 완료 전 최소 명령은 다음과 같다.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
pnpm --dir front test:ct:docker
```

CI parity가 필요한 설치·build·lockfile 경로에서는 root `packageManager`를 Corepack으로 실행한다.

## 15. 완료 조건

1. 공개 홈의 첫 장면이 브랜드 문장, 서가, 펼친 회차, 사람 흔적, 다음 자리로 구성된다.
2. 기존 반복 설명 섹션이 `최근 모임 -> 사람과 문장 -> 읽는 리듬 -> 공개/초대 경계 -> 아카이브`로
   통합된다.
3. 제목과 일반 UI text에 초록색을 사용하지 않는다.
4. 최신 공개 detail이 실패하거나 비어도 공개 홈의 핵심 정보와 링크가 유지된다.
5. 서버 API, 공개 범위, OAuth, invite contract는 변경되지 않는다.
6. desktop, tablet, mobile, reduced-motion, keyboard, 200% zoom 검증이 완료된다.
7. 실제 컴포넌트 baseline과 frontend lint, test, build, E2E가 통과한다.
8. public-safe fixture만 사용하고 실제 멤버 데이터, secret, private domain, local path를 추가하지 않는다.
