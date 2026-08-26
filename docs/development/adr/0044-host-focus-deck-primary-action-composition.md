# ADR-0044: 호스트 현재 모임을 Focus Deck 단일 주 행동으로 구성

- 상태: Proposed
- 결정일: 2026-08-26
- 작성자: 제품·디자인·프런트엔드
- 관련: ADR-0003, ADR-0020, ADR-0022, ADR-0023, ADR-0027, ADR-0028, ADR-0035,
  `docs/superpowers/specs/2026-08-26-readmates-host-admin-visual-authority-and-integration-design.md`

## 컨텍스트

현재 host meeting UI는 masthead, local task navigation, main panel, judgment rail을 page-level 구성으로
사용한다(`front/features/host/ui/meeting-workspace/host-meeting-workspace.tsx:106`). 이 구성은 URL deep
link와 많은 운영 사실을 노출하지만 한 화면의 시각적 주인이 여러 개가 되어, 승인된 원 시안의 한 가지
`지금 할 일` 중심 흐름과 다르다. 동시에 route는 panel별 lazy query, revision/CAS, recovery, authority-loss
purge, receipt reconciliation을 이미 소유하므로(`front/features/host/route/host-meeting-workspace-route.tsx:137`)
구성 변경이 이 안전 계약을 되돌려서는 안 된다.

## 결정

호스트 현재 모임의 page-level composition을 **Focus Deck**으로 구성한다. 짧은 meeting header 아래에
한 개의 `지금 할 일`, 3~5개의 실제 진행 사실, 관련 작업, undo/recovery를 우선 배치한다. 정보·참석·기록·
변경 내역은 URL deep link와 focus restoration을 가진 panel/sheet로 제공한다. 기존 page-level local task
navigation과 우측 judgment rail은 primary composition에서 제거하되, 그 정보와 기능은 Focus Deck과
panel로 재배치한다. DRAFT, OPEN, CLOSED, PUBLISHED가 같은 구성을 공유하고 primary action만 domain
state에 따라 바뀐다. Record readiness에 의존하는 primary action은 기존 record query를 lifecycle-aware
prerequisite로 읽은 뒤에만 결정하며 pending/stale/unavailable을 `false`로 추정하지 않는다.

## 근거

- 호스트는 지금 해야 할 한 가지를 먼저 이해하고, 필요할 때 근거와 보조 작업으로 내려갈 수 있다.
- lifecycle을 순차 stepper로 오해시키지 않으면서 상태별 next action을 명확히 한다.
- 모바일에서 desktop navigation을 압축하지 않고 sticky primary action과 full-screen sheet로 완결할 수 있다.
- current route/model/API/safety 계약을 유지하면서 UI composition만 교체할 수 있다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 현재 Meeting Folio/local navigation 유지 | 승인된 원 시안과 다르고 page-level 주인이 분산된다. |
| 과거 host branch를 통째로 복원 | 이후 추가된 안전·recovery·contract를 잃는다. |
| lifecycle stepper | lifecycle, audience, publication, attendance 사실을 잘못된 단일 진행률로 합친다. |
| 모든 보조 작업을 한 페이지에 펼침 | 모바일과 200% zoom에서 주 행동과 evidence hierarchy가 무너진다. |

## 결과

긍정적:

- 원 시안이 다시 host 시각 권위가 된다.
- desktop/mobile에서 같은 primary-action model을 유지한다.
- panel 실패를 격리하면서 주 행동을 보존할 수 있다.

부정적/감수한 비용:

- current Meeting Folio component와 visual baseline을 교체해야 한다.
- task navigation test를 panel/deep-link/focus-restoration test로 재작성해야 한다.
- 상태 조합별 primary action fixture를 별도로 유지해야 한다.

## 검증

- DRAFT, OPEN, meeting-day, overdue, CLOSED stages, PUBLISHED, trash fixture에서 주 행동이 하나인지 확인한다.
- revision conflict, stale cache, authority loss, response loss, undo/restore, public convergence를 E2E 검증한다.
- CLOSED/PUBLISHED direct overview에서 record prerequisite pending/unavailable/stale/ready를 검증하고 잘못된
  upload/publish action이 나타나지 않는지 확인한다.
- 320/390/768/900/1024/1440px, 200% zoom, keyboard/focus, reduced motion, live region을 검증한다.
- visual baseline과 승인된 Focus Deck hierarchy를 desktop/mobile에서 비교한다.

## 후속 작업

- 구현 계획에서 route/model/UI/CSS/test file ownership을 vertical slice로 나눈다.
- 코드·tests·`front/DESIGN.md`·active architecture가 일치한 뒤 `Accepted`로 승격한다.
