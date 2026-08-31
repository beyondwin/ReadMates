# ADR-0048: 호스트 워크스페이스를 모임 생애주기 운영실 + 작업함으로 구성

- 상태: Accepted
- 결정일: 2026-09-01
- 작성자: product/design/front
- 관련: ADR-0018, ADR-0019, ADR-0021, ADR-0026, ADR-0035, ADR-0038, ADR-0045, ADR-0046, ADR-0049, `docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md`

> 코드·focused test·`front/DESIGN.md`·active architecture가 이 결정을 구현하며, Stage 5 전체 gate와 acceptance evidence가 일치해 `Accepted`로 승격했다. 아래 미측정 운영 범위는 배포 증거가 아니며 이 결정의 구현 수락과 분리한다.

## 컨텍스트

ADR-0046은 호스트 워크스페이스를 `오늘` 트리아지, `모임` 다이어리, `멤버` 원장으로 줄여 중복 화면과 용어 분열을 해소했다. 현재 `HostTodayView`도 다음 모임과 단일 처리 큐, 다가오는 일정을 조합한다(`front/features/host/model/host-today-model.ts:23`). 그러나 호스트가 실제로 관리하는 중심 객체는 날짜가 아니라 현재 모임이며, 준비·진행·마감 단계와 모임 밖 운영 업무를 한 문맥에서 함께 판단하기 어렵다. 기록, 초대·설정, 멤버 시야의 발견성도 약해질 수 있다.

2026-08-29 사용자는 warm paper/ink와 restrained navy 브랜드를 유지하면서 현재 모임의 상태, 다음 행동, 멤버 준비 상태, 모임 밖 작업을 한눈에 관리하는 `Quiet Editorial Desk` 시안을 승인했다. 최종 시각 권위는 bundled Pretendard Variable과 기존 북클럽 artwork avatar를 사용하는 desktop 07–14, mobile 15–17이며 중간 candidate는 구현 입력으로 사용하지 않는다.

## 결정

호스트 워크스페이스의 기본 composition을 **모임 생애주기 운영실 + 호스트 작업함**으로 구성한다. 전역 업무 영역은 `운영실`, `일정과 모임`, `사람`, `기록` 네 개이며, `초대와 설정`, `멤버 시야`, 알림, 계정, `새 모임`을 utility/action으로 항상 발견 가능하게 둔다. 운영실은 현재 모임을 기준으로 `준비실 → 현장 → 마감실` local task navigation, 계산된 다음 행동 하나, 준비 현황 원장, 상태 기반 호스트 작업함을 한 화면에 배치한다. 작업함은 가입 승인, 알림 실패, 기록 마감, 초대 만료처럼 현재 모임 밖 업무를 보존한다.

작업함 v1 source는 `SCHEDULE_UNSEEN`, `MEMBER_APPROVAL`, `RECORD_CLOSING`, `INVITATION_EXPIRY`, `NOTIFICATION_FAILURE`다. 각 item은 source type, club-scoped resource identity, source generation/revision으로 식별한다. 완료 여부는 source domain 사실 또는 allowlist receipt에서 파생하고 mutable completed flag를 별도로 저장하지 않는다. 보류만 `(club, host membership, work-item key)`에 귀속해 저장하며, 만료되면 자동으로 `NOW`로 돌아온다. 완료 projection은 allowlist 결과·receipt summary만 30일 제공하고 email, token, provider body, page history, userId를 포함하지 않는다.

작업함 cursor는 purpose-signed opaque token이다. club ID, host membership ID, state/filter fingerprint, source-set epoch 또는 동등한 snapshot generation, `evaluatedAt`, sort tuple, expiry, key version을 결속한다. v1은 한 `REPEATABLE_READ` 평가에서 만든 15분 immutable allowlist snapshot을 equivalent generation으로 사용한다. 다른 club/host/state에서의 재사용, tamper, expiry, retired key는 fail closed하고, concurrent source mutation과 무관하게 같은 snapshot continuation의 no-gap/no-duplicate를 보장한다. fresh first page만 새 source 상태를 본다.

전역 context switcher는 club 선택과 member/host workspace 전환을 하나의 trigger가 소유한다. `초대와 설정`은 기존 이메일 초대만 재포장하지 않고 named invitation link와 club settings의 실제 vertical slice를 제공한다. named link는 raw token을 저장하지 않고 생성 때 share path를 한 번만 돌려주며, 기존 signed OAuth invitation flow에서만 ACTIVE MEMBER로 원자적으로 소비한다. legacy password accept를 다시 열거나 HOST를 부여하지 않는다. 위험한 클럽 운영 종료는 active HOST authority, club revision, idempotency, preview/confirm을 요구한다.

공유 paper/ink primitive와 Pretendard-only typography는 ADR-0045를 따른다. 계정·멤버 identity는 `book-club-avatar.ts` catalog와 `AvatarChip`으로 실제 WebP artwork를 직접 렌더링하며 이니셜, 생성형 동물 avatar, 시안에서 추출한 bitmap을 만들지 않는다. KPI 카드 대시보드와 좌측 사이드바는 host composition 권위로 사용하지 않는다. 이 결정은 ADR-0046을 대체한다.

## 근거

- 화면의 첫 질문을 `오늘 무엇을 하지?`에서 `이 모임을 지금 어떻게 운영하지?`로 바꿔 호스트의 실제 업무 문맥과 맞춘다.
- 단계 navigation과 다음 행동을 같은 현재 모임 문맥에 두어 준비·현장·마감 전환을 쉽게 이해한다.
- 별도 작업함이 모임 밖 업무를 보존하므로 모임 중심 설계가 가입 승인·초대·과거 기록을 숨기지 않는다.
- 네 업무 영역과 utility action을 명시해 기능 발견성과 destination ownership을 높인다.
- 연속 원장과 hairline 구조가 ReadMates의 차분한 브랜드를 유지하면서 운영 밀도를 확보한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| ADR-0046의 오늘 트리아지 + 모임 다이어리 유지 | 날짜 트리아지와 모임 단계가 분리되어 현재 모임을 관리할 때 화면 전환이 남는다. |
| 모임만 유일한 1급 객체로 구성 | 가입 승인, 초대 만료, 이전 기록 마감 같은 모임 밖 업무가 다시 흩어진다. |
| 좌측 사이드바 + 카드형 관리 대시보드 | 일반 SaaS 문법이 브랜드와 충돌하고 숫자보다 행동 근거가 뒤로 밀린다. |
| 모든 기능을 한 운영실 화면에 펼침 | 현재 모임의 다음 행동이 목록·설정 업무에 묻히고 모바일 완료성이 낮아진다. |

## 결과

긍정적:

- 현재 모임, 단계, 다음 행동, 준비 상태, 다른 운영 업무의 스캔 순서가 고정된다.
- 기록·초대·설정·멤버 시야를 포함한 기능 완전성을 내비게이션 계약으로 검증할 수 있다.
- 데스크톱은 68/32 운영실, 모바일은 같은 순서의 단일 열로 재구성할 수 있다.
- 호스트의 전역 업무와 모임 local task가 분리되어 navigation 의미가 명확해진다.

부정적/감수한 비용:

- ADR-0046의 3탭 셸과 오늘형/다이어리형 구분을 다시 바꾸므로 route, tests, visual baseline 갱신 비용이 크다.
- `사람`, `기록`, `초대와 설정`의 destination과 기존 redirect를 재정리해야 한다.
- 현재 모임을 계산하지 못하거나 일부 widget이 실패하는 상태의 partial rendering 계약이 필요하다.
- 승인 데스크톱 시안만으로 모바일 composition을 복제할 수 없어 별도 responsive CT가 필요하다.

## 검증

- Canonical route, 네 영역과 compatibility replace는 [`route-continuity.ts`](../../../front/src/app/route-continuity.ts), [`host.test.tsx`](../../../front/src/app/routes/host.test.tsx), [`host-lifecycle-route-continuity.spec.ts`](../../../front/tests/e2e/host-lifecycle-route-continuity.spec.ts)가 검증한다. Stage 5 Task 3 report SHA-256은 `6c2894be75d1991cb8b2943f52ce3fd157e36a5860b36fe43c224df8bdd4e988`이다.
- 현재 모임 selection, 준비실/현장/마감실, 다음 행동과 five-source 작업함의 immutable snapshot/source-derived completion은 [`HostOperatingRoomCurrentServiceTest.kt`](../../../server/src/test/kotlin/com/readmates/hostworkspace/application/service/HostOperatingRoomCurrentServiceTest.kt), [`HostWorkboxServiceTest.kt`](../../../server/src/test/kotlin/com/readmates/hostworkspace/application/service/HostWorkboxServiceTest.kt), [`JdbcHostWorkSourceAuthorityTest.kt`](../../../server/src/test/kotlin/com/readmates/hostworkspace/adapter/out/source/JdbcHostWorkSourceAuthorityTest.kt)가 검증한다. Stage 4 gate report SHA-256은 `d502dd76a1493cecce93c988f66fcbebb5c8a0997d448b16be418d3caec586d4`, range-fix report는 `e5f6474080e23e90772cc633522123cf5e0c359741ae9e080f685c98e3f509ed`이다.
- 403/409/partial/unknown recovery는 [`host-authority-loss.spec.ts`](../../../front/tests/e2e/host-authority-loss.spec.ts), [`host-workbox-stage4.spec.ts`](../../../front/tests/e2e/host-workbox-stage4.spec.ts)가 검증한다. Stage 5 Task 2 report SHA-256은 `48bb13f4130db085399d351fa896aa161ccc084b62f951d4539e2fd074bf3796`이다.
- Responsive/keyboard/focus/44px/reduced-motion은 [`host-operating-room-responsive.ct.tsx`](../../../front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx), [`host-shell.ct.tsx`](../../../front/features/host/ui/shell/host-shell.ct.tsx)가 검증한다. Bounded custom DOM/ARIA evidence와 한계는 [`front/DESIGN.md`](../../../front/DESIGN.md#responsive-and-accessibility-evidence-index)에 기록했다. Stage 5 Task 1 report SHA-256은 `bf8cd34d1ccf0a3893449d66e1df623add66143c14a942bcb0550c377149a130`, Task 7 report는 `7338e31f0b578e415890ed05c6cd12427943d4f20ca5bd2563f54e0184216076`이다.
- Named invitation link/settings는 [`NamedInvitationLinkOAuthDbTest.kt`](../../../server/src/test/kotlin/com/readmates/auth/api/NamedInvitationLinkOAuthDbTest.kt), [`HostClubSettingsConcurrencyDbTest.kt`](../../../server/src/test/kotlin/com/readmates/club/application/service/HostClubSettingsConcurrencyDbTest.kt)와 frontend Zod contract tests가 검증한다.
- Stage 5 최종 gate는 네 destination/utility, 세 lifecycle phase, authoritative next action, immutable workbox/ledger, 403/409/partial/unknown recovery, 390–1440 responsive·keyboard, compatibility redirect와 active docs를 함께 확인했다. Canonical Docker CT는 121건을 실행해 118건이 처음 통과했고, 의도적으로 바뀐 CLOSED-768 baseline은 갱신 뒤 focused Docker 검증을 통과했다. 남은 admin 이미지 두 건의 1px renderer 차이는 host load-bearing surface와 무관하다.

## 잔여 리스크와 미측정 범위

- Authority base에서 이미 존재하던 admin login-return E2E residual은 이 호스트 결정과 무관하게 남아 있으며 통과로 간주하지 않는다.
- Manual VoiceOver/NVDA와 hardware assistive technology는 `not measured`다.
- 외부 OAuth/provider, 실제 email delivery와 실제 club-end confirm, production deploy는 `not measured`이며 repository evidence를 production rollout 증거로 사용하지 않는다.
