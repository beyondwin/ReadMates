import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APPROVED_MOCKUPS } from "./approved-mockup-manifest";
import {
  REQUIRED_VISUAL_AUTHORITY_COVERAGE,
  VISUAL_AUTHORITY_SCENARIOS,
  parseVisualAuthoritySelection,
  visualAuthorityScenario,
  visualAuthoritySelected,
} from "./approved-route-scenarios";
import {
  APPROVED_ROUTE_PREPARATIONS,
  executeKeyboardMenuSequence,
  isCanonicalRootSpaceSwitcherOpen,
  performHistoryRestore,
  runActualRouteAuthority,
} from "./approved-route-harness";

describe("actual-route visual authority scenarios", () => {
  it("registers one real route for every immutable approved reference", () => {
    expect(VISUAL_AUTHORITY_SCENARIOS).toHaveLength(18);
    expect(VISUAL_AUTHORITY_SCENARIOS.map((item) => item.id).sort())
      .toEqual(APPROVED_MOCKUPS.map((item) => item.id).sort());
    expect(VISUAL_AUTHORITY_SCENARIOS.every((item) => item.route.startsWith("/"))).toBe(true);
  });

  it("requires the exact actor, scope, fixture, geometry, typography, viewport, item-cap, and interaction contracts", () => {
    for (const scenario of VISUAL_AUTHORITY_SCENARIOS) {
      const required = REQUIRED_VISUAL_AUTHORITY_COVERAGE[scenario.id];
      expect(scenario.actor).toEqual(required.actor);
      expect(scenario.fixtureKey).toBe(required.fixtureKey);
      expect(scenario.preparationKey).toBe(required.preparationKey);
      expect(scenario.regions).toEqual(required.regions);
      expect(scenario.typography).toEqual(required.typography);
      expect(scenario.firstViewport).toEqual(required.firstViewport);
      expect(scenario.interactions).toEqual(required.interactions);
      expect(scenario.defaultVisibleItems).toEqual(required.defaultVisibleItems);
      for (const region of required.regions) {
        expect(region.selector.length).toBeGreaterThan(0);
        expect(scenario.regions.some((item) => item.selector === region.selector)).toBe(true);
      }
      for (const entry of required.typography) {
        expect(entry.fontFamilyIncludes).toBe("Pretendard");
        expect(scenario.typography.some((item) => item.selector === entry.selector)).toBe(true);
      }
      for (const entry of required.firstViewport) {
        expect(["fully-visible", "intersects", "absent"]).toContain(entry.visibility);
        expect(scenario.firstViewport.some((item) => item.selector === entry.selector)).toBe(true);
      }
      if (required.defaultVisibleItems) {
        expect(required.defaultVisibleItems.selector.length).toBeGreaterThan(0);
        expect([3, 4]).toContain(required.defaultVisibleItems.count);
      }
      for (const interaction of required.interactions) {
        expect(interaction.kind).toEqual(expect.any(String));
        if (interaction.kind === "history-restore") {
          expect(interaction.expectedUrlAfterActivate).toMatch(/^\//);
          expect(interaction.expectedUrlAfterBack).toMatch(/^\//);
          expect(interaction.expectedUrlAfterForward).toBe(interaction.expectedUrlAfterActivate);
        }
      }
      if (scenario.actor.kind === "club-host") {
        expect(scenario.actor.clubSlug).toBe("visual-authority");
        expect(scenario.actor.perspective).toBe("HOST");
      }
    }
  });

  it("selects all ids by default and only named ids when filtered", () => {
    expect(visualAuthoritySelected("admin-today-desktop")).toBe(true);
    expect(visualAuthoritySelected("admin-today-desktop", undefined)).toBe(true);
    expect(visualAuthoritySelected("admin-today-desktop", "")).toBe(false);
    expect(visualAuthoritySelected("admin-today-desktop", "  \n")).toBe(false);
    expect(visualAuthoritySelected(
      "admin-today-desktop",
      "host-prep-mobile,admin-today-desktop",
    )).toBe(true);
    expect(visualAuthoritySelected("host-live-desktop", "host-prep-mobile")).toBe(false);
    expect(() => parseVisualAuthoritySelection("unknown-authority"))
      .toThrow(/Unknown visual authority id/);
  });

  it("assigns final ownership only to actual-route specs", () => {
    expect(APPROVED_MOCKUPS.every((entry) =>
      entry.ownerTest === "front/tests/e2e/admin-approved-routes.spec.ts"
      || entry.ownerTest === "front/tests/e2e/host-approved-routes.spec.ts",
    )).toBe(true);
  });

  it("rejects blank members and duplicates instead of skipping the whole run", () => {
    expect(() => parseVisualAuthoritySelection("admin-today-desktop,")).toThrow(/blank/i);
    expect(() => parseVisualAuthoritySelection("admin-today-desktop,,host-prep-mobile")).toThrow(/blank/i);
    expect(() => parseVisualAuthoritySelection("admin-today-desktop,admin-today-desktop"))
      .toThrow(/duplicate/i);
    expect(parseVisualAuthoritySelection(undefined).size).toBe(18);
    expect(parseVisualAuthoritySelection("").size).toBe(0);
    expect(parseVisualAuthoritySelection(" \n\t ")).toEqual(new Set());
    expect([...parseVisualAuthoritySelection(" admin-today-desktop ")]).toEqual(["admin-today-desktop"]);
    expect(() => parseVisualAuthoritySelection("admin-today-desktop, host-prep-mobile")).toThrow(/blank/i);
    expect(visualAuthorityScenario("admin-today-desktop").id).toBe("admin-today-desktop");
  });

  it("keeps the installer arity and executes history-restore Back then Forward", async () => {
    expect(typeof runActualRouteAuthority).toBe("function");
    expect(Object.keys(APPROVED_ROUTE_PREPARATIONS).sort()).toEqual([
      "none",
      "open-space-switcher",
      "preview-schedule-notification",
    ].sort());
    const history = ["/admin/today"];
    let index = 0;
    await performHistoryRestore({
      interaction: {
        name: "back-restores-priority",
        kind: "history-restore",
        activate: 'role=button[name=/전체 .*보기/]',
        expectedUrlAfterActivate: "/admin/today?queue=all",
        expectedUrlAfterBack: "/admin/today",
        expectedUrlAfterForward: "/admin/today?queue=all",
        restoreCanonicalState: true,
      },
      activate: async () => {
        history.push("/admin/today?queue=all");
        index = history.length - 1;
      },
      readUrl: () => history[index]!,
      goBack: async () => {
        index -= 1;
      },
      goForward: async () => {
        index += 1;
      },
    });
    expect(history[index]).toBe("/admin/today?queue=all");
  });

  it("selects the first notification row on desktop Today", () => {
    const selectWork = visualAuthorityScenario("admin-today-desktop").interactions
      .find((item) => item.name === "select-work");
    expect(selectWork).toMatchObject({
      kind: "activate",
      expectedUrl: "/admin/today?case=case-notification",
    });
    expect(selectWork).not.toMatchObject({
      expectedUrl: "/admin/today?case=case-closing-risk",
    });
  });

  it("measures work-detail primary action from the in-flow jammy box, not nav.y-48", () => {
    const primary = visualAuthorityScenario("admin-work-detail-mobile").regions
      .find((region) => region.name === "primary-action");
    expect(primary?.expected).toEqual({ x: 20, y: 587, width: 350, height: 44 });
    expect(primary?.expected.y).not.toBe(734 - 48);
    expect(primary?.toleranceCssPx).toBe(4);
  });

  it("measures work-detail heading as the case title, not the list page h1 copy", () => {
    const detail = visualAuthorityScenario("admin-work-detail-mobile");
    expect(detail.regions.find((region) => region.name === "detail-heading")?.selector)
      .toBe(".admin-page-frame h1");
    expect(detail.firstViewport.find((entry) => entry.name === "detail-title")?.selector)
      .toBe(".admin-page-frame h1");
    expect(detail.typography.find((entry) => entry.name === "page-title")).toMatchObject({
      selector: ".admin-page-frame h1",
      fontSizePx: 20,
    });
    expect(detail.regions.find((region) => region.name === "detail-heading")?.expected)
      .toEqual({ x: 20, y: 91, width: 350, height: 48 });
  });

  it("retargets typography and absence checks to live production selectors", () => {
    const today = visualAuthorityScenario("admin-today-desktop");
    expect(today.typography.find((entry) => entry.name === "queue-title")?.selector)
      .toBe(".admin-operations-queue__title");
    expect(today.typography.some((entry) => entry.selector.includes("admin-operations-queue__header h2"))).toBe(false);

    const records = visualAuthorityScenario("admin-records-desktop");
    expect(records.regions.some((region) => region.selector === ".admin-audit__list")).toBe(true);

    const service = visualAuthorityScenario("admin-service-desktop");
    expect(service.regions.some((region) => region.selector === ".admin-health-grid__strip")).toBe(true);
    const noCommand = service.firstViewport.find((entry) => entry.name === "no-command-control");
    expect(noCommand?.visibility).toBe("absent");
    expect(noCommand?.selector).toMatch(/새로 확인|admin-health-grid__refresh/);

    for (const id of [
      "host-prep-desktop",
      "host-live-desktop",
      "host-closing-desktop",
      "host-prep-mobile",
      "host-live-mobile",
    ] as const) {
      expect(
        visualAuthorityScenario(id).typography.find((entry) => entry.name === "work-item-title")?.selector,
        id,
      ).toBe(".rm-host-work-item__label");
    }

    for (const id of ["host-prep-mobile", "host-live-mobile", "host-person-mobile"] as const) {
      const wordmark = visualAuthorityScenario(id).typography.find((entry) => entry.name === "wordmark");
      expect(wordmark, id).toBeUndefined();
      expect(
        visualAuthorityScenario(id).typography.find((entry) => entry.name === "page-title")?.selector,
        id,
      ).toMatch(/h1/);
    }
  });

  it("does not use clipped host mobile header classes as the wordmark", () => {
    for (const id of ["host-prep-mobile", "host-live-mobile", "host-person-mobile"] as const) {
      const selector = visualAuthorityScenario(id).typography.find((entry) => entry.name === "wordmark")?.selector ?? "";
      expect(selector, id).not.toMatch(/m-hdr-heading/);
      expect(selector, id).not.toMatch(/m-hdr-brand/);
    }
  });

  it("orders host operating-room regions next-action before a non-nested status notice", () => {
    for (const id of [
      "host-prep-desktop",
      "host-live-desktop",
      "host-closing-desktop",
      "host-prep-mobile",
      "host-live-mobile",
    ] as const) {
      const names = visualAuthorityScenario(id).regions.map((region) => region.name);
      const index = (name: string) => names.indexOf(name);
      expect(index("current-meeting"), id).toBeGreaterThan(-1);
      expect(index("phase-navigation"), id).toBeGreaterThan(index("current-meeting"));
      expect(index("primary-next-action"), id).toBeGreaterThan(index("phase-navigation"));
      expect(index("phase-status"), id).toBeGreaterThan(index("primary-next-action"));
      expect(index("phase-panel"), id).toBeGreaterThan(index("phase-status"));
      expect(index("workbox"), id).toBeGreaterThan(index("phase-panel"));
      const status = visualAuthorityScenario(id).regions.find((region) => region.name === "phase-status");
      expect(status?.selector, id).toBe(".rm-host-operating-room__phase-notice");
      expect(status?.selector, id).not.toMatch(/next-action__state/);
    }
  });

  it("asserts keyboard-menu focus after the non-Escape prefix then after Escape", async () => {
    const presses: string[] = [];
    let assertedExpandedAt = "";
    let assertedEscapeAt = "";
    await executeKeyboardMenuSequence({
      keys: ["Enter", "ArrowDown", "Escape"],
      press: async (key) => {
        presses.push(key);
      },
      assertExpandedFocus: async () => {
        assertedExpandedAt = presses.join(",");
      },
      assertEscapeFocus: async () => {
        assertedEscapeAt = presses.join(",");
      },
    });
    expect(assertedExpandedAt).toBe("Enter,ArrowDown");
    expect(assertedEscapeAt).toBe("Enter,ArrowDown,Escape");
  });

  it("measures admin space-switcher regions from jammy painted boxes, not rail-derived guesses", () => {
    const scenario = visualAuthorityScenario("admin-space-switcher-desktop");
    expect(scenario.regions.map((region) => region.name)).toEqual([
      "admin-header",
      "space-trigger",
      "root-space-menu",
      "admin-rail",
      "first-priority-item",
    ]);
    expect(scenario.regions.find((region) => region.name === "space-trigger")?.expected)
      .toEqual({ x: 188, y: 19, width: 160, height: 48 });
    expect(scenario.regions.find((region) => region.name === "root-space-menu")?.expected)
      .toEqual({ x: 201, y: 88, width: 334, height: 218 });
    expect(scenario.regions.find((region) => region.name === "first-priority-item")?.expected)
      .toEqual({ x: 260, y: 154, width: 559, height: 122 });
    const keyboard = scenario.interactions.find((item) => item.name === "keyboard-root-menu");
    expect(keyboard).toMatchObject({
      kind: "keyboard-menu",
      keys: ["Enter", "ArrowDown", "Escape"],
      expectedFocused: 'role=menuitem[name="내 클럽"]',
      expectedExpanded: true,
    });
    const escape = scenario.interactions.find((item) => item.name === "escape-restores-trigger");
    expect(escape).toMatchObject({
      kind: "keyboard-menu",
      keys: ["Enter", "Escape"],
      expectedFocused: 'role=menuitemradio[name=/플랫폼 운영/]',
      expectedExpanded: true,
      expectedFocusAfterEscape: '[aria-label="공간 전환, 현재 플랫폼 운영"]',
    });
    expect(escape).not.toMatchObject({ keys: ["Escape"] });
  });

  it("treats only the platform root menu as the canonical space-switcher capture", () => {
    expect(isCanonicalRootSpaceSwitcherOpen({
      menuVisible: true,
      platformRootChoiceVisible: true,
    })).toBe(true);
    expect(isCanonicalRootSpaceSwitcherOpen({
      menuVisible: true,
      platformRootChoiceVisible: false,
    })).toBe(false);
    expect(isCanonicalRootSpaceSwitcherOpen({
      menuVisible: false,
      platformRootChoiceVisible: false,
    })).toBe(false);
  });

  it("measures host ledger regions from actual-route boxes instead of CT main stubs", () => {
    const meetings = visualAuthorityScenario("host-meetings-desktop");
    expect(meetings.regions.find((region) => region.name === "host-nav")?.expected)
      .toEqual({ x: 678, y: 23, width: 233, height: 44 });
    expect(meetings.regions.find((region) => region.name === "meeting-ledger")?.selector)
      .toBe(".rm-meeting-toc__layout");

    const people = visualAuthorityScenario("host-people-desktop");
    expect(people.regions.find((region) => region.name === "member-table")?.selector)
      .toBe(".rm-host-member-ledger");
    expect(people.interactions.find((item) => item.name === "select-member")).toMatchObject({
      target: expect.stringContaining("membership-sky"),
    });

    const records = visualAuthorityScenario("host-records-desktop");
    expect(records.regions.map((region) => region.name)).toEqual([
      "host-header",
      "host-nav",
      "records-heading",
      "closing-link",
      "record-ledger",
    ]);
    expect(records.regions.find((region) => region.name === "closing-link")?.selector)
      .toBe(".rm-host-records-next a");
    expect(records.interactions.find((item) => item.name === "open-closing-record")).toMatchObject({
      target: ".rm-host-records-next a",
      expectedUrl: "/clubs/visual-authority/app/host?phase=closing",
    });

    const settings = visualAuthorityScenario("host-settings-desktop");
    expect(settings.regions.find((region) => region.name === "club-settings")?.selector)
      .toBe('[aria-labelledby="club-settings-title"]');

    const review = visualAuthorityScenario("host-schedule-review-desktop");
    expect(review.regions.find((region) => region.name === "host-nav")?.expected)
      .toEqual({ x: 678, y: 23, width: 233, height: 44 });
    expect(review.regions.find((region) => region.name === "review-heading")?.expected)
      .toEqual({ x: 48, y: 171, width: 1440, height: 41 });
    expect(review.firstViewport.find((entry) => entry.name === "preview-confirmation")?.selector)
      .toBe('[aria-label="발송 전 확인"]');

    const person = visualAuthorityScenario("host-person-mobile");
    expect(person.regions.find((region) => region.name === "person-heading")?.expected)
      .toEqual({ x: 91, y: 121, width: 72, height: 34 });
    expect(person.regions.find((region) => region.name === "person-status")?.expected)
      .toEqual({ x: 91, y: 155, width: 72, height: 20 });
    expect(person.regions.find((region) => region.name === "person-history")?.expected)
      .toEqual({ x: 17, y: 389, width: 356, height: 217 });
  });

  it("does not restore a ratio bypass in the contract source", () => {
    const contractSource = readFileSync(new URL("./approved-mockup-contract.ts", import.meta.url), "utf8");
    expect(contractSource).not.toMatch(
      /allowFontRasterException|fontRasterExceptionMaxRatio|skipMismatchRatioAssertion/,
    );
  });
});
