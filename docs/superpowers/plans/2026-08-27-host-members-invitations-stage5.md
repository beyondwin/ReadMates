# 호스트 멤버+초대 통합 (리디자인 5단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 멤버 화면에 초대를 흡수해 "승인 대기 구역(조건부) + 명단 원장 + 초대 구역"의 단일 목적지로 재구성한다(스펙 §4.3).

**Architecture:** 현행 `/members`는 탭 기반(`HostMembers` + `members/*`), `/invitations`는 별도 페이지다. 이 단계는 멤버 화면 안에 (1) VIEWER(둘러보기) 대기자가 있을 때만 렌더되는 승인 구역, (2) 원장형 명단 테이블, (3) 하단 초대 구역(현행 이메일 초대 원장)을 배치한다. `/invitations` URL은 6단계 리다이렉트 전까지 유지한다.

**계약 한계(스펙 대비):** ① 스펙 §4.3의 "명명된 초대 링크(사용 n/최대 n, 마스킹 URL, 4상태)"는 현행 서버 계약에 없다 — 현행은 이메일 기반 개별 초대(`HostInvitationListItem`, PENDING/ACCEPTED/EXPIRED/REVOKED)다. 이 단계는 **현행 초대 계약의 원장화**까지만 구현하고, 명명된 링크는 §8 비범위(서버 스펙 후보)로 남긴다. ② 멤버별 참석·불참 누계 열도 API에 없으므로 조회 가능한 열(상태, 함께한 기간=joinedAt, 이번 모임 참여)만 넣는다(§4.3의 한정 규칙 그대로).

**Tech Stack:** React/Vite, TypeScript, TanStack Query, Vitest.

**Spec:** 설계 문서 §4.3, §5, §6. 시안: `docs/development/host-redesign-mockups/03-members-desktop.png` (원장 문법 참고 — 불참 누계 열은 이 단계 비범위).

## Global Constraints

- 라벨: 초대 중단은 "중지"(§5 — 현행 UI의 "취소됨"을 교체), 소프트한 상태 표현은 텍스트 병기.
- 멤버 제거/일시정지의 확인 다이얼로그에는 영향 미리보기(§4.3: 기록 처리 정책 — 개인정보 익명화·참석 사실 보존)를 행동 전에 표시. 현행 `LifecyclePolicyDialog`(APPLY_NOW/NEXT_SESSION)를 유지·확장.
- 썸네일은 기존 `AvatarChip`(동물 아트워크) 사용.
- 서버 계약 변경 없음(`hostMemberListQuery`, `useHostMemberLifecycleMutation`, `useHostViewerActionMutation`, `hostInvitationListQuery`, `useCreateInvitationMutation`, `useRevokeInvitationMutation`).
- 각 태스크 종료 시 커밋.

---

### Task 0: 앵커 재확인

- [ ] **Step 1:**

```bash
rg -n "export default function HostMembers" front/features/host/ui/host-members.tsx
rg -n "MemberTab" front/features/host/ui/members/types.ts
rg -n "MemberSummary" front/features/host/ui/members/member-summary.tsx
rg -n "HostInvitationsActions" front/features/host/model/host-invitation-actions.ts
rg -n "useCreateInvitationMutation|useRevokeInvitationMutation" front/features/host/queries/host-invitation-queries.ts
```
Expected: 모두 히트. 1~4단계 변경과 충돌 시 실제 코드 기준으로 조정.

---

### Task 1: 승인 대기 구역 (조건부 렌더)

**Files:**
- Create: `front/features/host/ui/members/member-pending-zone.tsx`
- Modify: `front/features/host/ui/host-members.tsx` (탭 위에 구역 배치)
- Test: `front/features/host/ui/members/member-pending-zone.test.tsx`

**Interfaces:**
- Consumes: `HostMemberListItem`(status === "VIEWER"), `HostViewerAction`("activate" | "deactivate-viewer"), `useHostViewerActionMutation`.
- Produces:

```ts
export function MemberPendingZone({
  viewers,
  submittingId,
  onActivate,
  onRelease,
}: {
  viewers: readonly HostMemberListItem[];
  submittingId: string | null;
  onActivate: (membershipId: string) => void;
  onRelease: (membershipId: string) => void;
}): JSX.Element | null;   // viewers.length === 0 이면 null (Luma 패턴: 있을 때만 존재)
```

- [ ] **Step 1: 실패 테스트** — 대기자 0명 → 렌더 없음; 1명 이상 → 구역 헤더에 "승인·거절은 멤버에게 알림이 갑니다" 명시(§4.3), 행별 승인/거절 버튼.
- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- features/host/ui/members/member-pending-zone.test.tsx`.
- [ ] **Step 3: 구현.** — 기존 viewer 탭의 activate/release 액션을 이 구역으로 승격(탭은 Task 2에서 정리).
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/members front/features/host/ui/host-members.tsx
git commit -m "feat(host): render a conditional pending-approval zone above the member roster"
```

---

### Task 2: 명단 원장 테이블 + lede 요약

**Files:**
- Modify: `front/features/host/ui/host-members.tsx` (헤드 lede "활동 n명 · 둘러보기 n명 · 쉬는 중 n명" 문장 요약 — 카운트 그리드 대체; 탭 구성을 `active/suspended/inactive`로 축소하고 viewer는 Task 1 구역, invitations 탭은 제거)
- Modify: `front/features/host/ui/members/member-list.tsx` (원장 행: AvatarChip + 이름 + 상태 텍스트 + 함께한 기간(mono, joinedAt 기준) + 이번 모임 참여 + hover 액션)
- Modify: `front/features/host/ui/members/member-summary.tsx` (문장 lede로 대체 — 그리드 마크업 제거)
- Test: `front/tests/unit/host-members.test.tsx`

**Interfaces:**
- Consumes: 기존 `HostMembersActions`, `HostMemberListItem`.
- Produces: 멤버 제거·일시정지는 행 오버플로 메뉴로 격리, `LifecyclePolicyDialog`에 영향 미리보기 문구 추가:

```tsx
<p className="small">
  {member.displayName} 님을 {action === "suspend" ? "쉬는 멤버로 전환" : "클럽에서 내보내기"}합니다.
  참석 기록은 보존되고, 내보낸 뒤 개인 정보는 익명화됩니다.
</p>
```

- [ ] **Step 1: 기존 테스트 갱신(실패 유도)** — `tests/unit/host-members.test.tsx`의 탭·카운트 그리드 단언을 lede 문장·원장 행·오버플로 메뉴 단언으로 교체. invitations 탭 단언은 삭제(Task 3에서 하단 구역으로 대체).
- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- tests/unit/host-members.test.tsx`.
- [ ] **Step 3: 구현** — 44px 행, mono·tabular 우측 정렬, "N회 연속 불참" 신호는 데이터가 없으므로 넣지 않는다(누계 API 별도 스펙 — 최종 보고에 명시).
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: Commit**

```bash
git add front/features/host front/tests/unit/host-members.test.tsx
git commit -m "feat(host): reshape the member roster into a ledger table with sentence lede"
```

---

### Task 3: 초대 구역 흡수 (하단 원장)

**Files:**
- Create: `front/features/host/ui/members/member-invitations-section.tsx`
- Modify: `front/features/host/ui/host-members.tsx` (하단 구역 마운트)
- Modify: `front/features/host/route/host-members-route.tsx`(또는 현행 라우트 어셈블리 — Task 0에서 실제 파일 확인) — `hostInvitationListQuery` 병행 로드 + `HostInvitationsActions` 주입
- Test: `front/features/host/ui/members/member-invitations-section.test.tsx`

**Interfaces:**
- Consumes: `HostInvitationListItem`, `HostInvitationsActions`(createInvitation/revokeInvitation — reissue는 현행 관례대로 create 재호출), `useCreateInvitationMutation`, `useRevokeInvitationMutation`.
- Produces:

```ts
export function MemberInvitationsSection({
  invitations,
  pendingCount,
  onCreate,
  onRevoke,
  onReissue,
  busyId,
}: {
  invitations: readonly HostInvitationListItem[];
  pendingCount: number;
  onCreate: (request: { email: string; name: string; applyToCurrentSession: boolean }) => Promise<void>;
  onRevoke: (invitationId: string) => Promise<void>;
  onReissue: (invitation: HostInvitationListItem) => Promise<void>;
  busyId: string | null;
}): JSX.Element;
```

원장 행: 이름·이메일(마스킹 표시, 전체 보기는 명시적 액션) · 상태(대기/수락됨/만료됨/**중지**) · 만료/수락 mono 타임스탬프 · 행 액션(복사/재발송/중지). 상태 라벨 "취소됨" → "중지"(§5), 중지는 이력 보존 문구 병기.

- [ ] **Step 1: 실패 테스트** — 4상태 라벨(중지 포함), 재발송 = create 재호출, 마스킹 기본 + 전체 보기 액션 단언. 기존 `tests/unit/host-invitations.test.tsx`의 해당 단언을 이 구역 기준으로 이관.
- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- features/host/ui/members/member-invitations-section.test.tsx`.
- [ ] **Step 3: 구현.** `/invitations` 페이지 자체는 무변경(6단계에서 리다이렉트).
- [ ] **Step 4: 통과 확인** — `pnpm --dir front test -- features/host/ui/members tests/unit/host-members.test.tsx tests/unit/host-invitations.test.tsx`.
- [ ] **Step 5: Commit**

```bash
git add front/features/host front/tests/unit
git commit -m "feat(host): absorb the invitation ledger into the members destination"
```

---

### Task 4: 단계 검증

- [ ] **Step 1:** `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`.
- [ ] **Step 2:** 영향 e2e — `public-auth-member-host.spec.ts`(`/app/host/members`), `responsive-navigation-chrome.spec.ts`(멤버 탭). 단언 갱신 후 `pnpm --dir front test:e2e`(불가 시 스킵 보고).
- [ ] **Step 3:** 최종 보고 — 계약 한계 2건(명명된 초대 링크, 참석 누계 열)을 서버 스펙 후보로 명시.
