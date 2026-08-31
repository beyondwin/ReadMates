import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import { routeEmptyAdminOperations } from "./admin-operations-e2e-fixtures";
import { expectMinimumTargetSize, expectNoHorizontalOverflow } from "./support/visual-authority-contract";

function platformAdminAuth(role: PlatformAdminRole): AuthMeResponse {
  const email = `${role.toLowerCase()}@example.test`;
  return {
    authenticated: true,
    userId: `platform-${role.toLowerCase()}-user`,
    membershipId: null,
    clubId: null,
    email,
    displayName: `${role} admin`,
    accountName: `${role} admin`,
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: {
      userId: `platform-${role.toLowerCase()}-user`,
      email,
      role,
    },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(
  route: Route,
  status: number,
  body: unknown,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function routeAdminClubs(
  page: Page,
): Promise<{ onboardingRequests: Array<Record<string, unknown>> }> {
  const onboardingRequests: Array<Record<string, unknown>> = [];
  let previewSequence = 0;
  await routeEmptyAdminOperations(page);
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, platformAdminAuth("OWNER"));
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await json(route, 200, {
      platformRole: "OWNER",
      activeClubCount: 2,
      domainActionRequiredCount: 1,
      domains: [],
      domainsRequiringAction: [],
    });
  });
  await page.route("**/api/bff/api/admin/capabilities**", async (route) => {
    await json(route, 200, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: [
        "VIEW_TODAY",
        "VIEW_CLUBS",
        "VIEW_CLUB_OPERATIONS",
        "CREATE_CLUB",
        "MANAGE_CLUBS",
        "MANAGE_CLUB_DOMAINS",
      ],
      generatedAt: "2026-08-24T00:00:00Z",
    });
  });
  await page.route("**/api/bff/api/admin/clubs**", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      requestUrl.pathname !== "/api/bff/api/admin/clubs"
    ) {
      await route.fallback();
      return;
    }
    const cursor = requestUrl.searchParams.get("cursor");
    await json(
      route,
      200,
      cursor === "cursor-2"
        ? {
            items: [
              {
                clubId: "ok-club",
                slug: "healthy",
                name: "Healthy Club duplicate",
                tagline: "",
                about: "",
                status: "ACTIVE",
                publicVisibility: "PUBLIC",
                domainCount: 1,
                domainActionRequiredCount: 0,
                notificationFailureCount: 0,
                aiFailureCount: 0,
                firstHostOnboardingState: "ASSIGNED",
                adminRevision: 4,
              },
              {
                clubId: "page-two-club",
                slug: "page-two",
                name: "Page Two Club",
                tagline: "",
                about: "",
                status: "ACTIVE",
                publicVisibility: "PRIVATE",
                domainCount: 0,
                domainActionRequiredCount: 0,
                notificationFailureCount: 0,
                aiFailureCount: 0,
                firstHostOnboardingState: "MISSING",
                adminRevision: 1,
              },
            ],
            nextCursor: null,
          }
        : {
            items: [
              {
                clubId: "crit-club",
                slug: "broken",
                name: "Broken Club",
                tagline: "",
                about: "",
                status: "ACTIVE",
                publicVisibility: "PRIVATE",
                domainCount: 1,
                domainActionRequiredCount: 2,
                notificationFailureCount: 2,
                aiFailureCount: 0,
                firstHostOnboardingState: "ASSIGNED",
                adminRevision: 7,
              },
              {
                clubId: "ok-club",
                slug: "healthy",
                name: "Healthy Club",
                tagline: "",
                about: "",
                status: "ACTIVE",
                publicVisibility: "PUBLIC",
                domainCount: 1,
                domainActionRequiredCount: 0,
                notificationFailureCount: 0,
                aiFailureCount: 0,
                firstHostOnboardingState: "ASSIGNED",
                adminRevision: 4,
              },
            ],
            nextCursor: "cursor-2",
          },
    );
  });
  await page.route("**/api/bff/api/admin/clubs/crit-club", async (route) => {
    await json(route, 200, {
      clubId: "crit-club",
      slug: "broken",
      name: "Broken Club",
      tagline: "",
      about: "",
      status: "ACTIVE",
      publicVisibility: "PRIVATE",
      domainCount: 1,
      domainActionRequiredCount: 2,
      notificationFailureCount: 2,
      aiFailureCount: 0,
      firstHostOnboardingState: "ASSIGNED",
      adminRevision: 7,
      domains: [],
    });
  });
  await page.route("**/api/bff/api/admin/clubs/new-club", async (route) => {
    await json(route, 200, {
      clubId: "new-club",
      slug: "new-circle",
      name: "New Circle",
      tagline: "",
      about: "",
      status: "ACTIVE",
      publicVisibility: "PRIVATE",
      domainCount: 0,
      domainActionRequiredCount: 0,
      notificationFailureCount: 0,
      aiFailureCount: 0,
      firstHostOnboardingState: "INVITED",
      adminRevision: 1,
      domains: [],
    });
  });
  await page.route(
    "**/api/bff/api/admin/support-access-grants?clubId=*",
    async (route) => {
      await json(route, 200, [{ id: "grant-1" }]);
    },
  );
  await page.route("**/api/bff/api/admin/clubs/*/operations", async (route) => {
    await json(route, 200, {
      schema: "admin.club_operations_snapshot.v1",
      generatedAt: "2026-05-29T00:00:00Z",
      club: {
        clubId: "crit-club",
        slug: "broken",
        name: "Broken Club",
        status: "ACTIVE",
        publicVisibility: "PRIVATE",
      },
      readiness: { state: "READY", blockingReasons: [], nextAction: null },
      memberActivity: {
        activeCount: 0,
        dormantCount: 0,
        pendingViewerCount: 0,
        hostCount: 1,
      },
      sessionProgress: {
        upcomingCount: 0,
        currentOpenCount: 0,
        closedCount: 0,
        publishedRecordCount: 0,
        incompleteRecordCount: 0,
      },
      notificationHealth: {
        pending: 0,
        failed: 0,
        dead: 0,
        lastSuccessAt: null,
        failureClusters: [],
      },
      aiUsage: {
        activeJobs: 0,
        failedRecentJobs: 0,
        staleCandidates: 0,
        costEstimateUsd: "0.0000",
        state: "NO_ACTIVITY",
      },
      safeLinks: [],
    });
  });
  await page.route(
    "**/api/bff/api/admin/clubs/onboarding/preview",
    async (route) => {
      const request = route.request().postDataJSON() as {
        club: { slug: string };
        firstHost: { email: string };
      };
      previewSequence += 1;
      const existing = request.firstHost.email.startsWith("existing-");
      await json(route, 200, {
        previewId: `preview-${previewSequence}`,
        expiresAt: "2026-08-24T01:00:00Z",
        clubSlug: request.club.slug,
        firstHostKind: existing ? "EXISTING_USER" : "NEW_USER",
        requiredConfirmation: existing ? "ASSIGN_EXISTING_USER_AS_HOST" : null,
        impactCodes: [
          "CLUB_CREATED",
          existing ? "HOST_ASSIGNED" : "HOST_INVITED",
        ],
        prerequisiteCodes: existing
          ? ["EXISTING_USER_CONFIRMATION_REQUIRED"]
          : [],
        requestFingerprintPrefix: "abcd1234",
        ...(request.club.slug === "privacy-drift"
          ? { acceptUrl: "https://private.example.test/invite" }
          : {}),
      });
    },
  );
  await page.route("**/api/bff/api/admin/clubs/onboarding", async (route) => {
    const request = route.request().postDataJSON() as Record<
      string,
      unknown
    > & { club: { slug: string; name: string }; firstHost: { email: string } };
    onboardingRequests.push(request);
    const slug = request.club.slug;
    const attempt = onboardingRequests.filter(
      (item) => (item.club as { slug: string }).slug === slug,
    ).length;
    if (slug === "response-loss-circle" && attempt === 1) {
      await json(route, 409, {
        code: "COMMAND_IN_PROGRESS",
        message: "Command in progress",
        status: 409,
      });
      return;
    }
    if (slug === "expired-circle" && attempt === 1) {
      await json(route, 409, {
        code: "PREVIEW_EXPIRED",
        message: "Preview expired",
        status: 409,
      });
      return;
    }
    const existing = request.firstHost.email.startsWith("existing-");
    const delivery =
      slug === "response-loss-circle" && attempt >= 3
        ? "SUCCEEDED"
        : slug === "response-loss-circle"
          ? "PENDING"
          : existing
            ? "NOT_REQUIRED"
            : "PENDING";
    await json(route, 200, {
      receiptId: `receipt-${slug}`,
      club: {
        clubId: "new-club",
        slug,
        name: request.club.name,
        tagline: "",
        about: "",
        status: "ACTIVE",
        publicVisibility: "PRIVATE",
        domainCount: 0,
        domainActionRequiredCount: 0,
        notificationFailureCount: 0,
        aiFailureCount: 0,
        firstHostOnboardingState: existing ? "ASSIGNED" : "INVITED",
        adminRevision: 1,
      },
      originStatus: "SUCCEEDED",
      firstHostKind: existing ? "EXISTING_USER_ASSIGNED" : "INVITATION_CREATED",
      invitationDelivery: delivery,
    });
  });
  return { onboardingRequests };
}

async function fillOnboarding(page: Page, slug: string, email: string) {
  const dialog = page.getByRole("dialog", { name: "새 클럽" });
  await dialog.getByRole("textbox", { name: "클럽 이름" }).fill("New Circle");
  await dialog.getByRole("textbox", { name: "Slug" }).fill(slug);
  await dialog.getByRole("textbox", { name: "Tagline" }).fill("함께 읽는 모임");
  await dialog.getByRole("textbox", { name: "About" }).fill("공개 소개");
  await dialog.getByRole("textbox", { name: "첫 호스트 이메일" }).fill(email);
  await dialog
    .getByRole("textbox", { name: "첫 호스트 이름" })
    .fill("New host");
  return dialog;
}

test.describe("admin clubs registry", () => {
  test("uses server filters and drills into an authoritative club detail", async ({
    page,
  }) => {
    await routeAdminClubs(page);

    await page.goto("/admin/clubs");
    await expect(page.getByRole("heading", { name: "클럽", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMinimumTargetSize(page.getByRole("link", { name: "새 클럽" }));

    await expect(
      page.getByRole("searchbox", { name: "클럽 검색" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "수명주기" }),
    ).toBeVisible();

    const judgementList = page.getByRole("list", {
      name: "클럽 운영 판단 목록",
    });
    const rows = judgementList.getByRole("listitem");

    // The decision sequence starts with the club name, then state/action/signal.
    const criticalRow = rows.first();
    await expect(criticalRow.getByRole("link", { name: "Broken Club" })).toBeVisible();
    await expect(criticalRow.getByText("현재 상태")).toBeVisible();
    await expect(criticalRow.getByText("필요한 조치")).toBeVisible();
    await expect(criticalRow.getByText("실패 신호 확인")).toBeVisible();
    await expect(criticalRow.getByText("최근 신호")).toBeVisible();
    await expect(criticalRow.getByText("알림 실패 2건")).toBeVisible();

    const quietRow = rows.filter({
      has: page.getByRole("link", { name: "Healthy Club" }),
    });
    await expect(quietRow).toHaveCount(1);
    await expect(quietRow.getByText("현재 상태")).toBeVisible();
    await expect(quietRow.getByText("필요한 조치")).toHaveCount(0);
    await expect(quietRow.getByText("최근 신호")).toHaveCount(0);
    await expect(quietRow.getByText("마지막 확인")).toHaveCount(0);

    const technicalDisclosure = criticalRow.getByLabel("기술 정보");
    await technicalDisclosure.getByText("기술 정보", { exact: true }).click();
    await expect(technicalDisclosure.getByText("Slug")).toBeVisible();
    await expect(technicalDisclosure.getByText("broken")).toBeVisible();

    await page
      .getByRole("combobox", { name: "공개 상태" })
      .selectOption("PRIVATE");
    await expect(page).toHaveURL(/visibility=PRIVATE/);

    const firstClubLink = criticalRow.getByRole("link", { name: "Broken Club" });
    await firstClubLink.click();
    await expect(page).toHaveURL(/\/admin\/clubs\/.+/);
    await expect(page).toHaveURL(/returnTo=/);
    await expect(page).toHaveURL(/focusId=/);
    await expect(page).toHaveURL(/visibility%3DPRIVATE/);

    await page.getByRole("link", { name: "← 클럽 목록" }).click();
    await expect(page).toHaveURL(/\/admin\/clubs\?/);
    await expect(page).toHaveURL(/visibility=PRIVATE/);
    await expect(page.getByRole("combobox", { name: "공개 상태" })).toHaveValue(
      "PRIVATE",
    );
    await expect(
      page.getByRole("link", { name: "Broken Club" }),
    ).toBeFocused();
  });

  test("falls back to the clubs list when detail return state is unsafe", async ({
    page,
  }) => {
    await routeAdminClubs(page);
    await page.goto(
      "/admin/clubs/crit-club?returnTo=https://external.example/admin/clubs&focusId=crit-club&scrollTop=12",
    );
    await expect(
      page.getByRole("link", { name: "← 클럽 목록" }),
    ).toHaveAttribute("href", "/admin/clubs");
    await page.getByRole("link", { name: "← 클럽 목록" }).click();
    await expect(page).toHaveURL(/\/admin\/clubs$/);
  });

  test("previews and explicitly confirms durable onboarding without exposing delivery secrets", async ({
    page,
  }) => {
    await routeAdminClubs(page);
    await page.goto("/admin/clubs?onboarding=1");
    const dialog = await fillOnboarding(
      page,
      "new-circle",
      "existing-host@example.test",
    );
    await dialog.getByRole("button", { name: "미리 확인" }).click();
    await expect(dialog.getByText("CLUB_CREATED")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "클럽 생성 확정" }),
    ).toBeDisabled();
    await dialog
      .getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" })
      .check();
    await expect(
      dialog.getByRole("button", { name: "클럽 생성 확정" }),
    ).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: "확인 문구" })
      .fill("ASSIGN_EXISTING_USER_AS_HOST");
    await dialog.getByRole("button", { name: "클럽 생성 확정" }).click();
    await expect(dialog.getByText(/receipt-new-circle/)).toBeVisible();
    await expect(dialog.getByText(/origin SUCCEEDED/)).toBeVisible();
    await expect(dialog.getByText(/초대 전달 NOT_REQUIRED/)).toBeVisible();
    await expect(page).toHaveURL(/onboarding=1/);
    await dialog
      .getByRole("button", { name: "생성된 클럽 상세로 이동" })
      .click();
    await expect(page).toHaveURL(/\/admin\/clubs\/new-club/);
    await expect(page.getByText(/acceptUrl|invitation token/i)).toHaveCount(0);
  });

  test("deduplicates page boundaries and requests the opaque next cursor", async ({
    page,
  }) => {
    await routeAdminClubs(page);
    await page.goto("/admin/clubs");
    await page.getByRole("button", { name: "더 보기" }).click();
    await expect(
      page.getByRole("link", { name: "Page Two Club" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Healthy Club/ })).toHaveCount(
      1,
    );
    await expect(page.getByText("Healthy Club duplicate")).toHaveCount(0);
  });

  test("replays one onboarding identity through response loss and delivery refresh", async ({
    page,
  }) => {
    const harness = await routeAdminClubs(page);
    await page.goto("/admin/clubs?onboarding=1");
    const dialog = await fillOnboarding(
      page,
      "response-loss-circle",
      "new-host@example.test",
    );
    await dialog.getByRole("button", { name: "미리 확인" }).click();
    await dialog
      .getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" })
      .check();
    await dialog.getByRole("button", { name: "클럽 생성 확정" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "같은 명령으로 다시 확인",
    );
    await dialog.getByRole("button", { name: "클럽 생성 확정" }).click();
    await expect(dialog.getByText(/초대 전달 PENDING/)).toBeVisible();
    await dialog.getByRole("button", { name: "전달 상태 새로고침" }).click();
    await expect(dialog.getByText(/초대 전달 SUCCEEDED/)).toBeVisible();
    const requests = harness.onboardingRequests.filter(
      (item) => (item.club as { slug: string }).slug === "response-loss-circle",
    );
    expect(new Set(requests.map((item) => item.idempotencyKey)).size).toBe(1);
  });

  test("requires a fresh preview after an expired onboarding confirm", async ({
    page,
  }) => {
    await routeAdminClubs(page);
    await page.goto("/admin/clubs?onboarding=1");
    const dialog = await fillOnboarding(
      page,
      "expired-circle",
      "new-host@example.test",
    );
    await dialog.getByRole("button", { name: "미리 확인" }).click();
    await dialog
      .getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" })
      .check();
    await dialog.getByRole("button", { name: "클럽 생성 확정" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "새 미리보기를 만들어",
    );
    await expect(dialog.getByText("CLUB_CREATED")).toHaveCount(0);
    await dialog.getByRole("button", { name: "미리 확인" }).click();
    await dialog
      .getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" })
      .check();
    await dialog.getByRole("button", { name: "클럽 생성 확정" }).click();
    await expect(dialog.getByText(/receipt-expired-circle/)).toBeVisible();
  });

  test("fails closed when a development onboarding response adds a private field", async ({
    page,
  }) => {
    await routeAdminClubs(page);
    await page.goto("/admin/clubs?onboarding=1");
    const dialog = await fillOnboarding(
      page,
      "privacy-drift",
      "new-host@example.test",
    );
    await dialog.getByRole("button", { name: "미리 확인" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "같은 명령으로 다시 시도",
    );
    await expect(dialog.getByText("CLUB_CREATED")).toHaveCount(0);
    await expect(
      page.getByText(/private\.example\.test|acceptUrl/i),
    ).toHaveCount(0);
  });

  test("guards dirty onboarding across browser back cancel and accept", async ({
    page,
  }) => {
    await routeAdminClubs(page);
    await page.goto("/admin/clubs");
    await page.getByRole("link", { name: "새 클럽" }).click();
    const dialog = page.getByRole("dialog", { name: "새 클럽" });
    const name = dialog.getByRole("textbox", { name: "클럽 이름" });
    await name.fill("Draft Club");
    await name.focus();
    page.once("dialog", (prompt) => void prompt.dismiss());
    await page.goBack();
    await expect(page).toHaveURL(/onboarding=1/);
    await expect(name).toHaveValue("Draft Club");
    await expect(name).toBeFocused();
    page.once("dialog", (prompt) => void prompt.accept());
    await page.goBack();
    await expect(page).not.toHaveURL(/onboarding=1/);
    await expect(page.getByRole("dialog", { name: "새 클럽" })).toHaveCount(0);
  });

  test("stays usable at desktop and narrow widths with keyboard-safe onboarding", async ({
    page,
  }, testInfo) => {
    await routeAdminClubs(page);
    const viewports = [
      { width: 1440, height: 960, label: "desktop" },
      { width: 390, height: 844, label: "mobile" },
      { width: 320, height: 720, label: "narrow" },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto("/admin/clubs");
      await expect(page.getByRole("heading", { name: "클럽", exact: true })).toBeVisible();
      const hasHorizontalOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(hasHorizontalOverflow).toBe(false);
      const screenshot = await page.screenshot({
        path: testInfo.outputPath(
          `admin-clubs-${viewport.label}-${viewport.width}.png`,
        ),
        fullPage: true,
      });
      expect(screenshot.byteLength).toBeGreaterThan(10_000);
    }

    await page.setViewportSize({ width: 640, height: 720 });
    await page.goto("/admin/clubs");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await expect(page.getByRole("link", { name: "새 클럽" })).toBeVisible();
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    await cdp.detach();

    const onboardingTrigger = page.getByRole("link", { name: "새 클럽" });
    await onboardingTrigger.focus();
    await onboardingTrigger.click();
    const dialog = page.getByRole("dialog", { name: "새 클럽" });
    await expect(dialog.getByRole("button", { name: "닫기" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/onboarding=1/);
    await expect(onboardingTrigger).toBeFocused();
    await expect(
      page.getByText(
        /acceptUrl|idempotencyKey|providerResponse|invitation token/i,
      ),
    ).toHaveCount(0);
  });
});
