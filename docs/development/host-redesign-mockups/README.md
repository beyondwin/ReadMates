# 호스트 리디자인 시안

## 2026-08-29 승인 시안 — Quiet Editorial Desk

`07-host-lifecycle-operating-room-approved.png`는 ADR-0048과
`docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md`의 page composition 시각 권위입니다.
code-native UI는 편집·runtime source이며 PNG를 그대로 UI 배경으로 사용하지 않습니다.
tracked snapshot은 보조 회귀 cache이고, token·shared CSS·fixture 변경은 영향 reference 증거를 무효화합니다.
메뉴·상태·접근성·responsive contract는 디자인 문서와 ADR-0048이 규범입니다.

- 화면: 호스트 운영실 desktop 1536×1024
- 핵심 흐름: 현재 모임 → 준비실/현장/마감실 → 다음 행동 → 준비 현황 → 호스트 작업함
- 생성 경로: Codex built-in image generation, `precise-object-edit`, 승인된 composition에 기존 Pretendard와 북클럽 아바타 자산을 적용
- 파일: PNG, RGB, alpha 없음
- SHA-256: `fc5f8fd00301d90f3616c335306ca9cf99c59293589841ca3601afdbb04c25a9`
- 데이터: 가상 클럽·모임·상태 값만 사용

07–17만 ADR-0048 구현의 승인 시각 권위다. 별도 candidate 번호나 폐기된 중간 생성물은 프로젝트에 보존하지 않는다. 계정·멤버 썸네일은 생성 이미지에서 추출하지 않고 실제 구현에서 `front/shared/ui/book-club-avatar.ts`와 `front/shared/ui/avatar-chip.tsx`를 통해 `/assets/avatars/book-club/*.webp`를 직접 렌더링한다.

### 승인된 확장 화면

| 파일 | 화면 | SHA-256 |
| --- | --- | --- |
| `08-host-operating-room-live-approved.png` | 운영실·현장 — 실제 출석, 진행 순서, 현장 작업함 | `9a0b50081506f266eccff15606e2e74da0b926b699166d9ce56020c8b263ff15` |
| `09-host-operating-room-closing-approved.png` | 운영실·마감실 — 5단계 마감 원장과 게시 준비 | `be94c7e1adc587d27c6f5e37b2a2f61f658d47e067b44961f8bb6e527542ac08` |
| `10-host-meetings-library-approved.png` | 일정과 모임 — 예정·지난 모임 원장과 월간 index | `7385c5f2369be3b3fcbfe7a87f737a4325802890e3dff2d9892161e0eed28f94` |
| `11-host-people-ledger-approved.png` | 사람 — 멤버 상태, 현재 일정 확인, 참석 응답을 분리한 원장 | `a1b2afb663cc9cdf304563f189bc2306908eb9da28cb3da9cd94d47ba908c50f` |
| `12-host-records-ledger-approved.png` | 기록 — 회차 기록, 마감 상태, 게시 이력 원장 | `8ca899b88148f9491149017653d7d71e8b8d34642f4f8b92c794b5f3717254cf` |
| `13-host-invites-settings-approved.png` | 초대와 설정 — 초대 링크 운영과 클럽 설정의 utility 화면 | `80cb99506f90337660fcf42857d5f556e8a92a9932cf0e3f9f15e39180675b95` |
| `14-host-unread-schedule-review-approved.png` | 일정 미열람 검토 — 대상·문구 확인 후 수동 발송 | `ca58ef916dd5487dca5811f395ed44792febfa86a4c3bf60f4bd5f9333a0bd61` |

확장 화면 일곱 파일은 모두 Codex built-in image generation의 `precise-object-edit` 경로로 갱신했고 1536×1024 PNG, RGB, alpha 없음으로 검증했다. 공통 타이포그래피 기준은 bundled Pretendard Variable이며, 아바타 기준은 기존 북클럽 artwork catalog다.

### 승인된 모바일 화면

| 파일 | 화면 | 크기 | SHA-256 |
| --- | --- | --- | --- |
| `15-mobile-host-operating-room-prep-approved.png` | 모바일 운영실·준비실 — 다음 행동, 준비 원장, 작업함, 하단 4탭 | 866×1846 | `fde68389cc111e6c9cfe06543a50ac749cca937f65f3cd4f07d7369796e3ec3a` |
| `16-mobile-host-live-attendance-approved.png` | 모바일 운영실·현장 — 응답과 분리된 실제 출석, 즉시 저장·실행 취소 | 866×1846 | `b3fd160481039d28857ee9de88593c897f4ee9a51a19de99fb395453ee4e33d5` |
| `17-mobile-host-person-detail-approved.png` | 모바일 사람 상세 — 접속·일정 확인·응답·실제 출석의 분리 | 866×1846 | `12c542d4d409f2390c987acbb2c0bed886fa874bfe256f4fda8653df1afe44c5` |

모바일 세 파일은 Codex built-in image generation의 `precise-object-edit` 경로로 갱신한 portrait PNG이며 RGB, alpha 없음으로 검증했다. 세 파일은 866×1846으로 통일하고 Pretendard Variable, 실제 북클럽 아바타, 390px 화면의 한 손 조작과 하단 safe-area를 공통 계약으로 사용한다.

### Code-native 구현 근거

07–17 PNG는 page composition의 시각 권위이고, code-native UI는 편집·runtime source다. PNG를 runtime 배경으로 쓰지 않는다. tracked snapshot은 보조 회귀 cache이며 snapshot 갱신만으로 합격하지 않는다. token, shared CSS/component, fixture 변경은 영향 reference 증거를 무효화한다. Host 첫 화면 독립 시각 검토는 `docs/reports/2026-09-02-host-approved-first-viewport-acceptance.md` 기준 11/11 PASS-with-font-raster다. 픽셀 비율 0.02와 사람 30초 gate는 남아 픽셀 수락 완료가 아니다. ADR-0053은 `Proposed`다.

현재 responsive·interaction 근거는 [운영실 CT](../../../front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx), [모임 생애주기 CT](../../../front/features/host/ui/meeting-workspace/host-lifecycle-responsive.ct.tsx), [호스트 shell CT](../../../front/features/host/ui/shell/host-shell.ct.tsx), [route continuity E2E](../../../front/tests/e2e/host-lifecycle-route-continuity.spec.ts), [authority-loss E2E](../../../front/tests/e2e/host-authority-loss.spec.ts), [workbox E2E](../../../front/tests/e2e/host-workbox-stage4.spec.ts)에 있다. 승인 PNG 비교는 `front/tests/e2e/support/approved-mockup-manifest.ts`와 `pnpm --dir front test:ct:approved`가 담당한다. 접근성 근거는 [bounded DOM/ARIA helper](../../../front/tests/e2e/support/visual-authority-contract.ts)를 사용한 코드 기반 검사이며 axe/axe-core나 수동 VoiceOver·NVDA 전체 검증으로 확대 해석하지 않는다.

위 근거는 repository-local synthetic fixture만 사용하고 production/private member data를 포함하지 않는다. CT/E2E screenshot·trace는 저장소 권위로 보존하지 않는다.

아래 01–06 시안은 ADR-0046의 과거 구현 맥락을 보존하는 역사 참고 자료입니다. ADR-0048 구현의 시각 권위로 사용하지 않습니다.

`docs/development/2026-08-27-readmates-host-triage-diary-redesign-design.md`의 참고 시안입니다.

**구현 기준은 스펙 문서의 서술이며, 이 시안은 참고 자료입니다.** 시안과 스펙이 다르면 스펙을 따릅니다. 알려진 차이:

- 시안 일부는 4탭 내비와 "멤버와 준비 중" 상태 라벨을 쓰지만, 스펙은 3탭과 §5 용어 사전을 확정했습니다.
- 시안의 멤버 썸네일이 실제 catalog와 다르면 역사적 자리표시자로만 해석한다. 실제 구현은 기존 북클럽 아트워크 아바타 시스템(공유 `AvatarChip`, `rm-avatar-chip--artwork`)을 그대로 사용한다.

현재 runtime 근거는 위 code-native CT/E2E 절이며, 아래 역사 PNG는 runtime proof로 승격하지 않습니다.

모든 데이터는 가상 인물·예시 값입니다. HTML은 `design/system/src/styles/tokens.css`에서 복사한 실제 디자인 토큰을 사용하므로 브라우저로 열면 그대로 확인할 수 있습니다(폰트는 CDN 로드).

| 파일 | 화면 | 스펙 절 |
| --- | --- | --- |
| `01-home-desktop` | 오늘(홈) 트리아지 — 살펴볼 일 큐 + 다음 모임 히어로 | §4.1 |
| `02-meeting-desktop` | 모임 상세 준비 단계 — 단계 레일, 응답 원장, 인라인 컴포저, 자동 알림 | §4.2 |
| `03-members-desktop` | 멤버 원장 — 알린/무단 불참 분리, hover 액션 | §4.3 |
| `04-mobile` | 모바일 홈 + 모임 당일 원탭 출석 | §4.4 |
| `05-home-desktop-b` | 차례식 구성 변형 — 홈에는 미채택, 목차 문법만 모임 목록에 채택 | §4.2 목록 |
| `06-closing-desktop` | 기록 정리(장부 마감) 체크리스트 + 소감 수집 | §4.2 |
| `07-host-lifecycle-operating-room-approved` | 승인된 모임 생애주기 운영실 + 호스트 작업함 desktop 방향 | 2026-08-29 설계 §3–§9 |
| `08-host-operating-room-live-approved` | 승인된 현장 출석·진행 운영실 | 2026-08-29 설계 §3.2, §6–§9 |
| `09-host-operating-room-closing-approved` | 승인된 마감 원장·게시 준비 운영실 | 2026-08-29 설계 §3.2, §7–§9 |
| `10-host-meetings-library-approved` | 승인된 일정과 모임 목록·월간 index | 2026-08-29 설계 §3.1, §9 |
| `11-host-people-ledger-approved` | 승인된 멤버·일정 확인·응답 상태 원장 | 2026-08-29 설계 §3.1, §6–§9 |
| `12-host-records-ledger-approved` | 승인된 회차 기록·마감·게시 원장 | 2026-08-29 설계 §3.1, §7–§9 |
| `13-host-invites-settings-approved` | 승인된 초대 링크·클럽 설정 utility 화면 | 2026-08-29 설계 §3.1, §8–§9 |
| `14-host-unread-schedule-review-approved` | 승인된 일정 미열람 대상·문구 수동 검토 화면 | 2026-08-29 설계 §6–§9 |
| `15-mobile-host-operating-room-prep-approved` | 승인된 모바일 준비실·준비 원장·작업함 | 2026-08-29 설계 §4.2, §6–§9 |
| `16-mobile-host-live-attendance-approved` | 승인된 모바일 현장 실제 출석·즉시 저장·실행 취소 | 2026-08-29 설계 §4.2, §6–§9 |
| `17-mobile-host-person-detail-approved` | 승인된 모바일 사람 상세·상태 분리·개인정보 경계 | 2026-08-29 설계 §4.2, §6–§9 |
