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
    expect(visualAuthoritySelected("admin-today-desktop", "")).toBe(true);
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

  it("retargets typography and absence checks to live production selectors", () => {
    const today = visualAuthorityScenario("admin-today-desktop");
    expect(today.typography.find((entry) => entry.name === "queue-title")?.selector)
      .toBe(".admin-operations-queue__header h2");
    expect(today.typography.some((entry) => entry.selector.includes("admin-operations-queue__title"))).toBe(false);

    const records = visualAuthorityScenario("admin-records-desktop");
    expect(records.regions.some((region) => region.selector === ".admin-audit__list")).toBe(true);

    const service = visualAuthorityScenario("admin-service-desktop");
    expect(service.regions.some((region) => region.selector === ".admin-health-grid__strip")).toBe(true);
    const noCommand = service.firstViewport.find((entry) => entry.name === "no-command-control");
    expect(noCommand?.visibility).toBe("absent");
    expect(noCommand?.selector).toMatch(/새로 확인|admin-health-grid__refresh/);

    const prep = visualAuthorityScenario("host-prep-desktop");
    expect(prep.typography.find((entry) => entry.name === "work-item-title")?.selector)
      .toBe(".rm-host-work-item__destination strong");

    for (const id of ["host-prep-mobile", "host-live-mobile", "host-person-mobile"] as const) {
      const wordmark = visualAuthorityScenario(id).typography.find((entry) => entry.name === "wordmark");
      expect(wordmark?.selector, id).toMatch(/m-hdr-heading|m-hdr-brand/);
      expect(wordmark?.selector, id).not.toMatch(/header\.topnav/);
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

  it("does not restore a ratio bypass in the contract source", () => {
    const contractSource = readFileSync(new URL("./approved-mockup-contract.ts", import.meta.url), "utf8");
    expect(contractSource).not.toMatch(
      /allowFontRasterException|fontRasterExceptionMaxRatio|skipMismatchRatioAssertion/,
    );
  });
});
