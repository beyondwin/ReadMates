import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  cleanupSecondClubFixture,
  ensureSecondClubFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
  runMysql,
} from "./readmates-e2e-db";
import {
  expectNoHorizontalOverflow,
  expectNoSeriousAccessibilityFindings,
} from "./support/visual-authority-contract";

test.describe.configure({ mode: "serial" });

const CLUB_ID = "00000000-0000-0000-0000-000000000001";
const CLUB_SLUG = "reading-sai";
const OTHER_CLUB_SLUG = "sample-book-club";
const HOST_PATH = `/clubs/${CLUB_SLUG}/app/host`;
const SAFE_PATH = `/clubs/${CLUB_SLUG}/app`;
const HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000201";
let nextSessionNumber = 880;

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function resetHostMembership() {
  runMysql(`
update memberships
join users on users.id = memberships.user_id
set memberships.role = 'HOST',
    memberships.status = 'ACTIVE',
    memberships.updated_at = utc_timestamp(6)
where lower(users.email) = 'host@example.com'
  and memberships.club_id = ${sqlString(CLUB_ID)};
`);
}

function setMembershipAuthority(input: {
  clubSlug: string;
  role: "HOST" | "MEMBER";
  status: "ACTIVE" | "SUSPENDED";
}) {
  runMysql(`
update memberships
join users on users.id = memberships.user_id
join clubs on clubs.id = memberships.club_id
set memberships.role = ${sqlString(input.role)},
    memberships.status = ${sqlString(input.status)},
    memberships.updated_at = utc_timestamp(6)
where lower(users.email) = 'host@example.com'
  and clubs.slug = ${sqlString(input.clubSlug)};
`);
}

function resetAuthorityFixtures() {
  cleanupGeneratedSessions();
  resetHostMembership();
  ensureSecondClubFixture();
  resetSeedGoogleLogins(["host@example.com"]);
}

function createDraftSession(options?: { withRecordDraft?: boolean }) {
  const sessionId = randomUUID();
  nextSessionNumber += 1;
  const title = `D5 권한 경계 모임 ${nextSessionNumber}`;
  runMysql(`
insert into sessions (
  id, club_id, number, title, book_title, book_author, session_date,
  start_time, end_time, location_label, question_deadline_at, state, visibility, access_scope
) values (
  ${sqlString(sessionId)},
  ${sqlString(CLUB_ID)},
  ${nextSessionNumber},
  ${sqlString(title)},
  ${sqlString(`D5 공개 안전 도서 ${nextSessionNumber}`)},
  '테스트 저자',
  '2026-08-25',
  '20:00:00',
  '22:00:00',
  '온라인',
  timestampadd(day, 7, utc_timestamp(6)),
  'DRAFT',
  'HOST_ONLY',
  'HOST_ONLY'
);
`);

  if (options?.withRecordDraft) {
    const snapshot = JSON.stringify({
      schema: "readmates-session-record:v1",
      visibility: "HOST_ONLY",
      publicationSummary: "D5 저장 전 기록 초안",
      highlights: [],
      oneLineReviews: [],
      feedbackDocument: { fileName: "", title: "", markdown: "" },
    });
    const digest = createHash("sha256").update(snapshot, "utf8").digest("hex");
    runMysql(`
insert into session_record_drafts (
  session_id, club_id, base_live_revision, draft_revision, source, snapshot_json,
  snapshot_sha256, updated_by_membership_id
) values (
  ${sqlString(sessionId)},
  ${sqlString(CLUB_ID)},
  0,
  1,
  'MANUAL',
  ${sqlString(snapshot)},
  ${sqlString(digest)},
  ${sqlString(HOST_MEMBERSHIP_ID)}
);
`);
  }

  return { sessionId, title };
}

function createHostParticipantSeenFact() {
  const { sessionId } = createDraftSession();
  const participantId = randomUUID();
  runMysql(`
update sessions
set state = 'OPEN',
    visibility = 'MEMBER',
    access_scope = 'GUEST_READABLE',
    schedule_revision = 3,
    session_revision = session_revision + 1,
    updated_at = utc_timestamp(6)
where id = ${sqlString(sessionId)} and club_id = ${sqlString(CLUB_ID)};

insert into session_participants (
  id, club_id, session_id, membership_id, rsvp_status, attendance_status,
  participation_status, seen_schedule_revision, seen_schedule_at
) values (
  ${sqlString(participantId)}, ${sqlString(CLUB_ID)}, ${sqlString(sessionId)},
  ${sqlString(HOST_MEMBERSHIP_ID)}, 'GOING', 'UNKNOWN', 'ACTIVE', 3,
  '2026-08-30 12:34:56.123456'
);
`);
  return sessionId;
}

function participantSeenFact(sessionId: string) {
  return runMysql(`
select concat(
  participation_status, '|', seen_schedule_revision, '|',
  date_format(seen_schedule_at, '%Y-%m-%dT%H:%i:%s.%fZ')
)
from session_participants
where session_id = ${sqlString(sessionId)}
  and membership_id = ${sqlString(HOST_MEMBERSHIP_ID)};
`).trim().split("\n").at(-1);
}

async function seedScopedBrowserState(
  page: Page,
  secret: string,
  scope: { clubSlug: string; otherClubSlug: string } = {
    clubSlug: CLUB_SLUG,
    otherClubSlug: OTHER_CLUB_SLUG,
  },
) {
  await page.evaluate(({ clubSlug, otherClubSlug, value }) => {
    localStorage.setItem(`readmates:host:${clubSlug}:meeting-form-draft:d5`, value);
    sessionStorage.setItem(`readmates:host:${clubSlug}:notification-preview:d5`, value);
    localStorage.setItem(`readmates:host:${otherClubSlug}:meeting-form-draft:d5`, `other-${value}`);
    sessionStorage.setItem(`readmates:host:${otherClubSlug}:notification-preview:d5`, `other-${value}`);
    sessionStorage.setItem("readmates:last-safe-workspace-target:host", `/clubs/${clubSlug}/app/host/sessions/new`);
  }, { ...scope, value: secret });
}

async function readScopedBrowserState(
  page: Page,
  scope: { clubSlug: string; otherClubSlug: string } = {
    clubSlug: CLUB_SLUG,
    otherClubSlug: OTHER_CLUB_SLUG,
  },
) {
  return page.evaluate(({ clubSlug, otherClubSlug }) => ({
    ownLocal: localStorage.getItem(`readmates:host:${clubSlug}:meeting-form-draft:d5`),
    ownSession: sessionStorage.getItem(`readmates:host:${clubSlug}:notification-preview:d5`),
    otherLocal: localStorage.getItem(`readmates:host:${otherClubSlug}:meeting-form-draft:d5`),
    otherSession: sessionStorage.getItem(`readmates:host:${otherClubSlug}:notification-preview:d5`),
    hostReturn: sessionStorage.getItem("readmates:last-safe-workspace-target:host"),
  }), scope);
}

async function installTanstackQueryClientProbe(page: Page) {
  await page.evaluate(() => {
    type QueryClientProbe = {
      getQueryData(queryKey: readonly unknown[]): unknown;
      setQueryData(queryKey: readonly unknown[], value: unknown): void;
      getMutationCache(): {
        findAll(filters: { mutationKey: readonly unknown[] }): unknown[];
      };
    };
    const root = document.getElementById("root") as (HTMLElement & Record<string, unknown>) | null;
    const containerKey = root && Object.keys(root).find((key) => key.startsWith("__reactContainer$"));
    const stack: unknown[] = containerKey && root ? [root[containerKey]] : [];
    const seen = new Set<unknown>();
    while (stack.length > 0) {
      const fiber = stack.pop();
      if (!fiber || typeof fiber !== "object" || seen.has(fiber)) continue;
      seen.add(fiber);
      const node = fiber as {
        child?: unknown;
        sibling?: unknown;
        memoizedProps?: { client?: QueryClientProbe };
        pendingProps?: { client?: QueryClientProbe };
      };
      const candidate = node.memoizedProps?.client ?? node.pendingProps?.client;
      if (
        candidate
        && typeof candidate.getQueryData === "function"
        && typeof candidate.setQueryData === "function"
        && typeof candidate.getMutationCache === "function"
      ) {
        (globalThis as typeof globalThis & { __d5QueryClient?: QueryClientProbe }).__d5QueryClient = candidate;
        return;
      }
      if (node.sibling) stack.push(node.sibling);
      if (node.child) stack.push(node.child);
    }
    throw new Error("mounted ReadMates QueryClient was not found");
  });
}

async function readTanstackBrowserState(page: Page) {
  return page.evaluate(({ clubSlug, otherClubSlug }) => {
    const client = (globalThis as typeof globalThis & {
      __d5QueryClient?: {
        getQueryData(queryKey: readonly unknown[]): unknown;
        getMutationCache(): {
          findAll(filters: { mutationKey: readonly unknown[] }): unknown[];
        };
      };
    }).__d5QueryClient;
    if (!client) throw new Error("D5 QueryClient probe is unavailable");
    return {
      ownQuery: client.getQueryData(["host", clubSlug, "d5-authority-cache"]) ?? null,
      otherQuery: client.getQueryData(["host", otherClubSlug, "d5-authority-cache"]) ?? null,
      ownMutationCount: client.getMutationCache().findAll({ mutationKey: ["host-mutation", clubSlug] }).length,
      otherMutationCount: client.getMutationCache().findAll({ mutationKey: ["host-mutation", otherClubSlug] }).length,
    };
  }, { clubSlug: CLUB_SLUG, otherClubSlug: OTHER_CLUB_SLUG });
}

async function seedTanstackBrowserState(page: Page, secret: string) {
  await page.evaluate(({ clubSlug, otherClubSlug, value }) => {
    type MutationProbe = { execute(variables: undefined): Promise<unknown> };
    type QueryClientProbe = {
      getQueryData(queryKey: readonly unknown[]): unknown;
      setQueryData(queryKey: readonly unknown[], data: unknown): void;
      getMutationCache(): {
        build(
          client: QueryClientProbe,
          options: {
            mutationKey: readonly unknown[];
            mutationFn: () => Promise<unknown>;
            onSuccess?: () => void;
          },
        ): MutationProbe;
      };
    };
    const client = (globalThis as typeof globalThis & { __d5QueryClient?: QueryClientProbe }).__d5QueryClient;
    if (!client) throw new Error("D5 QueryClient probe is unavailable");
    client.setQueryData(["host", clubSlug, "d5-authority-cache"], `own-${value}`);
    client.setQueryData(["host", otherClubSlug, "d5-authority-cache"], `other-${value}`);
    client.getMutationCache().build(client, {
      mutationKey: ["host-mutation", otherClubSlug, "d5-preserved"],
      mutationFn: async () => ({ preserved: true }),
    });
    const ownMutation = client.getMutationCache().build(client, {
      mutationKey: ["host-mutation", clubSlug, "d5-deferred"],
      mutationFn: async () => {
        const modulePath = "/features/host/api/host-api.ts";
        const api = await import(/* @vite-ignore */ modulePath) as {
          fetchHostNotificationEvents(context: { clubSlug: string }, request: { limit: number }): Promise<unknown>;
        };
        return api.fetchHostNotificationEvents({ clubSlug }, { limit: 1 });
      },
      onSuccess: () => {
        client.setQueryData(["host", clubSlug, "d5-authority-cache"], `late-${value}`);
      },
    });
    (globalThis as typeof globalThis & { __d5PendingStatus?: string }).__d5PendingStatus = "pending";
    void ownMutation.execute(undefined).then(() => {
      (globalThis as typeof globalThis & { __d5PendingStatus?: string }).__d5PendingStatus = "resolved";
    }).catch(() => {
      (globalThis as typeof globalThis & { __d5PendingStatus?: string }).__d5PendingStatus = "rejected";
    });
  }, { clubSlug: CLUB_SLUG, otherClubSlug: OTHER_CLUB_SLUG, value: secret });
}

async function triggerSecurityFailure(page: Page, clubSlug = CLUB_SLUG) {
  return page.evaluate(async ({ requestedClubSlug }) => {
    const modulePath = "/features/host/api/host-api.ts";
    const api = await import(/* @vite-ignore */ modulePath) as {
      processHostNotifications(context: { clubSlug: string }): Promise<Response>;
    };
    try {
      const response = await api.processHostNotifications({ clubSlug: requestedClubSlug });
      return {
        code: null,
        name: null,
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: await response.text(),
      };
    } catch (error) {
      return {
        code: error && typeof error === "object" && "code" in error ? String(error.code) : null,
        name: error instanceof Error ? error.name : null,
      };
    }
  }, { requestedClubSlug: clubSlug });
}

async function openRecordDraft(page: Page, sessionId: string, draft: string) {
  await page.goto(`${HOST_PATH}/sessions/${sessionId}`);
  await expect(page.locator(".rm-host-session-workspace")).toBeVisible();
  await page.getByRole("link", { name: "모임 기록" }).click();
  const summary = page.getByRole("textbox", { name: "공개 요약" });
  await expect(summary).toBeVisible();
  await summary.fill(draft);
  await expect(summary).toHaveValue(draft);
}

async function expectSafeReplacement(page: Page, message: RegExp, safePath = SAFE_PATH) {
  await expect(page).toHaveURL(safePath);
  await expect(page.getByRole("status").filter({ hasText: message })).toBeVisible();
  await expect(page.locator("main h1").first()).toBeFocused();
}

test.beforeEach(() => {
  resetAuthorityFixtures();
});

test.afterEach(() => {
  resetAuthorityFixtures();
  cleanupSecondClubFixture();
});

test("revoked authority cancels in-flight host work and cannot resurrect a meeting form", async ({ page, context }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const secret = "D5-owning-club-private-passcode";
  const originalHostUrl = `${HOST_PATH}/sessions/new`;
  const seenSessionId = createHostParticipantSeenFact();
  const seenFactBeforeDowngrade = participantSeenFact(seenSessionId);
  expect(seenFactBeforeDowngrade).toBe("ACTIVE|3|2026-08-30T12:34:56.123456Z");
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(SAFE_PATH);
  await page.goto(originalHostUrl);
  await expect(page.getByLabel("모임 제목")).toBeVisible();
  await page.getByLabel("모임 제목").fill("권한 해제 직전의 비공개 모임");
  await page.getByLabel("Passcode · 선택").fill(secret);
  await seedScopedBrowserState(page, secret);
  await installTanstackQueryClientProbe(page);

  let releasePending!: () => void;
  const pendingGate = new Promise<void>((resolveGate) => {
    releasePending = resolveGate;
  });
  let markPendingStarted!: () => void;
  const pendingStarted = new Promise<void>((resolveStarted) => {
    markPendingStarted = resolveStarted;
  });
  await page.route("**/api/bff/api/host/notifications/events?*", async (route) => {
    markPendingStarted();
    await pendingGate;
    await route.continue().catch(() => undefined);
  });
  await seedTanstackBrowserState(page, secret);
  await pendingStarted;
  expect(await readTanstackBrowserState(page)).toMatchObject({
    ownQuery: `own-${secret}`,
    otherQuery: `other-${secret}`,
    ownMutationCount: 1,
    otherMutationCount: 1,
  });

  setMembershipAuthority({ clubSlug: CLUB_SLUG, role: "MEMBER", status: "ACTIVE" });
  const failure = await triggerSecurityFailure(page);
  expect(failure).toMatchObject({ code: "HOST_AUTHORITY_REVOKED", name: "ReadmatesApiError" });
  await expectSafeReplacement(page, /호스트 권한이 해제/);
  await expect(page.getByRole("group", { name: "현재 모임" })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "클럽 작업함" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /보류/ })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  expect(await expectNoSeriousAccessibilityFindings(page)).toEqual([]);
  expect(participantSeenFact(seenSessionId)).toBe(seenFactBeforeDowngrade);
  releasePending();
  await expect.poll(() => page.evaluate(() => (
    globalThis as typeof globalThis & { __d5PendingStatus?: string }
  ).__d5PendingStatus)).toBe("rejected");
  expect(await readTanstackBrowserState(page)).toEqual({
    ownQuery: null,
    otherQuery: `other-${secret}`,
    ownMutationCount: 0,
    otherMutationCount: 1,
  });

  const state = await readScopedBrowserState(page);
  expect(state).toEqual({
    ownLocal: null,
    ownSession: null,
    otherLocal: `other-${secret}`,
    otherSession: `other-${secret}`,
    hostReturn: null,
  });
  expect(await page.getByText(secret).count()).toBe(0);

  await page.goBack();
  await expect(page).toHaveURL(SAFE_PATH);
  await page.reload();
  await expect(page).toHaveURL(SAFE_PATH);

  const freshTab = await context.newPage();
  await freshTab.goto(originalHostUrl);
  await expect(freshTab).toHaveURL(SAFE_PATH);
  expect(await freshTab.getByText(secret).count()).toBe(0);
  await freshTab.close();

  await context.setOffline(true);
  await page.goto(originalHostUrl, { waitUntil: "commit", timeout: 5_000 }).catch(() => undefined);
  expect(await page.getByText(secret).count()).toBe(0);
  const offlineState = await readScopedBrowserState(page).catch(() => null);
  expect(offlineState?.ownLocal ?? null).toBeNull();
  await context.setOffline(false);

});

test("suspension purges an open record draft before replacing the host workspace", async ({ page }) => {
  const { sessionId } = createDraftSession({ withRecordDraft: true });
  const secretDraft = "중지 전에만 보이던 비공개 기록 초안";
  await loginWithGoogleFixture(page, "host@example.com");
  await openRecordDraft(page, sessionId, secretDraft);
  await seedScopedBrowserState(page, secretDraft);
  setMembershipAuthority({ clubSlug: CLUB_SLUG, role: "HOST", status: "SUSPENDED" });

  const failure = await triggerSecurityFailure(page);
  expect(failure.code).toBe("MEMBERSHIP_SUSPENDED");
  await expectSafeReplacement(page, /멤버십이 중지/);
  expect(await page.getByText(secretDraft).count()).toBe(0);
  expect((await readScopedBrowserState(page)).ownLocal).toBeNull();

});

test("cross-club scope purges the requested club without touching an open other-club preview", async ({ page }) => {
  const secret = "다른 클럽에는 남아야 하는 알림 초안";
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`${HOST_PATH}/notifications`);
  await expect(page.getByRole("heading", { name: "새 알림 발송" })).toBeVisible();
  const previewButton = page.getByRole("button", { name: "미리보기 열기" });
  await expect(previewButton).toBeEnabled();
  await previewButton.click();
  await expect(page.getByRole("dialog", { name: "발송 전 확인" })).toBeVisible();
  await seedScopedBrowserState(page, secret, {
    clubSlug: OTHER_CLUB_SLUG,
    otherClubSlug: CLUB_SLUG,
  });

  const failure = await triggerSecurityFailure(page, OTHER_CLUB_SLUG);
  expect(failure.code).toBe("CROSS_CLUB_SCOPE");
  await expect.poll(async () => (await readScopedBrowserState(page, {
    clubSlug: OTHER_CLUB_SLUG,
    otherClubSlug: CLUB_SLUG,
  })).ownLocal).toBeNull();
  await expect(page).toHaveURL(`${HOST_PATH}/notifications`);
  await expect(page.getByRole("dialog", { name: "발송 전 확인" })).toBeVisible();
  const state = await readScopedBrowserState(page, {
    clubSlug: OTHER_CLUB_SLUG,
    otherClubSlug: CLUB_SLUG,
  });
  expect(state.ownLocal).toBeNull();
  expect(state.otherLocal).toBe(`other-${secret}`);

});

test("revision conflict preserves the local meeting form draft, compares latest schedule, and retries explicitly", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const { sessionId } = createDraftSession();
  const draftTitle = "리비전 충돌 뒤에도 남아야 하는 제목";
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`${HOST_PATH}/sessions/${sessionId}`);
  await page.getByRole("button", { name: "모임 정보" }).click();
  const title = page.getByLabel("모임 제목");
  await title.fill(draftTitle);
  await page.getByLabel("모임 날짜").fill("2026-08-27");
  await page.getByLabel("시작 시간").fill("20:30");
  await page.getByLabel("장소").fill("내가 선택한 합성 장소");
  let attempts = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PATCH"
      && new URL(request.url()).pathname.endsWith(`/api/host/sessions/${sessionId}`)
    ) attempts += 1;
  });
  runMysql(`
update sessions
set session_date = '2026-08-26',
    start_time = '21:00:00',
    location_label = '최신 서버 합성 장소',
    session_revision = session_revision + 1,
    schedule_revision = schedule_revision + 1,
    updated_at = utc_timestamp(6)
where id = ${sqlString(sessionId)} and club_id = ${sqlString(CLUB_ID)};
`);
  await page.getByRole("button", { name: "기본 정보 저장" }).click();

  const conflict = page.getByRole("alert", { name: "일정 변경 충돌" });
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText("2026-08-27");
  await expect(conflict).toContainText("2026-08-26");
  await expect(conflict).toContainText("내가 선택한 합성 장소");
  await expect(conflict).toContainText("최신 서버 합성 장소");
  await expect(title).toHaveValue(draftTitle);
  expect(attempts).toBe(1);
  await expectNoHorizontalOverflow(page);
  expect(await expectNoSeriousAccessibilityFindings(page)).toEqual([]);

  await conflict.getByRole("button", { name: "내 일정으로 다시 저장" }).click();
  await expect(page.locator("#host-session-basic-save-state")).toHaveText("저장되었습니다.");
  expect(attempts).toBe(2);
  expect(runMysql(`
select concat(date_format(session_date, '%Y-%m-%d'), '|', time_format(start_time, '%H:%i'), '|', location_label)
from sessions where id = ${sqlString(sessionId)};
`).trim().split("\n").at(-1)).toBe("2026-08-27|20:30|내가 선택한 합성 장소");
  await expect(page).toHaveURL(`${HOST_PATH}/sessions/${sessionId}?section=basic`);

});

test("authorized response loss reconciles before retry and preserves the meeting form draft", async ({ page }) => {
  const { sessionId } = createDraftSession();
  const draftTitle = "응답 유실 뒤 조정으로 확정할 제목";
  const order: string[] = [];
  let mutationAttempts = 0;
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`${HOST_PATH}/sessions/${sessionId}`);
  await page.getByRole("button", { name: "모임 정보" }).click();
  const title = page.getByLabel("모임 제목");
  await title.fill(draftTitle);

  await page.route(`**/api/bff/api/host/sessions/${sessionId}?clubSlug=${CLUB_SLUG}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    mutationAttempts += 1;
    order.push(`mutation-${mutationAttempts}`);
    const committed = await route.fetch();
    expect(committed.status(), await committed.text()).toBe(200);
    await route.abort("failed");
  });
  await page.route("**/api/bff/api/host/mutations/SESSION_BASIC_SAVE/**", async (route) => {
    order.push("reconcile");
    await route.continue();
  });

  await page.getByRole("button", { name: "기본 정보 저장" }).click();
  await expect(page.locator("#host-session-basic-save-state")).toHaveText("저장되었습니다.");
  await expect(title).toHaveValue(draftTitle);
  expect(order).toEqual(["mutation-1", "reconcile"]);
  expect(mutationAttempts).toBe(1);
  const storedTitle = runMysql(`select title from sessions where id = ${sqlString(sessionId)};`).trim().split("\n").at(-1);
  expect(storedTitle).toBe(draftTitle);

});
