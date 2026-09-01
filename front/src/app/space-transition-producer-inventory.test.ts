import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SPACE_TRANSITION_PRODUCER_INVENTORY,
  auditMutationProducerInventory,
  buildMountedProductionPaths,
  detectExportedWriteSymbols,
  type MutationProducerClassification,
} from "./space-transition-producer-inventory";

const frontRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const productionRoots = ["src", "shared", "features"];

function productionSources(): Map<string, string> {
  const sources = new Map<string, string>();
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && /\.[jt]sx?$/.test(entry.name)) {
        const relativePath = path.relative(frontRoot, absolutePath).split(path.sep).join("/");
        sources.set(relativePath, fs.readFileSync(absolutePath, "utf8"));
      }
    }
  };
  for (const root of productionRoots) visit(path.join(frontRoot, root));
  return sources;
}

const mountedOwners = buildMountedProductionPaths(productionSources(), ["src/main.tsx"]);

function classifiedWriteConsumerFixture(consumerSource: string) {
  const sources = new Map([
    ["src/main.tsx", `
      import "@/features/example/route/write-owner";
      import "@/features/example/route/rogue-route";
    `],
    ["features/example/api/classified-write.ts", `
      export function classifiedWrite() {
        return fetch("/write", { method: "POST" });
      }
    `],
    ["features/example/route/write-owner.ts", `
      import { classifiedWrite } from "../api/classified-write";
      export function WriteOwner() { return classifiedWrite(); }
    `],
    ["features/example/route/rogue-route.ts", consumerSource],
  ]);
  const inventory: MutationProducerClassification[] = [
    {
      path: "features/example/route/write-owner.ts",
      classification: "register",
      ownerPaths: ["features/example/route/write-owner.ts"],
      recoveryClass: "L1",
      evidenceTokens: ["registered"],
    },
    {
      path: "features/example/api/classified-write.ts",
      exportName: "classifiedWrite",
      classification: "modify",
      ownerPaths: ["features/example/route/write-owner.ts"],
      recoveryClass: "L1",
      evidenceTokens: ["transport"],
    },
  ];
  return { inventory, sources };
}

describe("space transition mutation-producer inventory", () => {
  it("classifies every current mounted producer and exported out-of-domain write", () => {
    expect(SPACE_TRANSITION_PRODUCER_INVENTORY).toHaveLength(97);
    expect(SPACE_TRANSITION_PRODUCER_INVENTORY.reduce<Record<string, number>>(
      (counts, candidate) => ({
        ...counts,
        [candidate.classification]: (counts[candidate.classification] ?? 0) + 1,
      }),
      {},
    )).toEqual({
      register: 28,
      modify: 36,
      "verified-no-change": 24,
      "out-of-domain": 9,
    });
    expect(auditMutationProducerInventory(productionSources(), mountedOwners)).toEqual({
      unclassifiedPaths: [],
      unclassifiedExportedWrites: [],
      unreachableExportsWithMountedImports: [],
      modifyEntriesWithoutMountedOwner: [],
      modifyEntriesWithMissingMountedOwners: [],
      verifiedLeavesWithForbiddenPublication: [],
    });
  });

  it("requires evidence and a mounted registering owner for every modified factory", () => {
    for (const entry of SPACE_TRANSITION_PRODUCER_INVENTORY) {
      expect(entry.evidenceTokens.length, entry.path).toBeGreaterThan(0);
      if (entry.classification === "modify") {
        expect(
          Boolean(entry.exportName || entry.exportNames?.length),
          `${entry.path} must classify exact write exports`,
        ).toBe(true);
        expect(entry.ownerPaths.length, entry.path).toBeGreaterThan(0);
        expect(
          entry.ownerPaths.some((ownerPath) => mountedOwners.has(ownerPath)),
          entry.path,
        ).toBe(true);
      }
    }
  });

  it("catches an unclassified feature regenerate producer", () => {
    const sources = new Map([
      ["features/example/route/example-route.tsx", "export function Example() { regenerateItem(); }"],
    ]);
    expect(auditMutationProducerInventory(sources, new Set()).unclassifiedPaths).toEqual([
      "features/example/route/example-route.tsx",
    ]);
  });

  it("catches an unclassified app or shared touch producer", () => {
    const sources = new Map([
      ["shared/auth/new-touch.ts", "export function mounted() { touchClubAccess(); }"],
      ["src/app/new-touch.ts", "export function mounted() { touchClubAccess(); }"],
    ]);
    expect(auditMutationProducerInventory(sources, new Set()).unclassifiedPaths).toEqual([
      "shared/auth/new-touch.ts",
      "src/app/new-touch.ts",
    ]);
  });

  it("fails when a retired out-of-domain action gains a mounted production import", () => {
    const sources = new Map([
      ["src/main.tsx", 'import "@/features/current-session/actions/save-checkin";'],
      ["features/current-session/actions/save-checkin.ts", "export async function saveCheckin() {}"],
    ]);
    const mounted = buildMountedProductionPaths(sources, ["src/main.tsx"]);
    expect(auditMutationProducerInventory(sources, mounted).unreachableExportsWithMountedImports)
      .toContain("features/current-session/actions/save-checkin.ts#saveCheckin");
  });

  it("follows a nested runtime import chain without consulting manifest owner paths", () => {
    const sources = new Map([
      ["src/main.tsx", 'import "@/src/app/router";'],
      ["src/app/router.ts", 'import "@/features/example/route/mounted-route";'],
      ["features/example/route/mounted-route.ts", 'import "@/features/current-session/actions/save-checkin";'],
      ["features/current-session/actions/save-checkin.ts", "export async function saveCheckin() {}"],
    ]);

    expect([...buildMountedProductionPaths(sources, ["src/main.tsx"])]).toEqual([
      "features/current-session/actions/save-checkin.ts",
      "features/example/route/mounted-route.ts",
      "src/app/router.ts",
      "src/main.tsx",
    ]);
  });

  it("discovers mounted dynamic imports that are absent from the inventory manifest", () => {
    const sources = new Map([
      ["src/main.tsx", 'void import("@/features/example/route/mounted-route");'],
      ["features/example/route/mounted-route.ts", "export function Mounted() { logoutCurrentSession(); }"],
    ]);

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      [],
    ).unclassifiedPaths).toEqual(["features/example/route/mounted-route.ts"]);
  });

  it("scans exported transport, cache, and storage writes including logout", () => {
    const sources = new Map([
      ["features/example/api/write-api.ts", "export async function updateThing() { return fetch('/write'); }"],
      ["features/example/queries/write-query.ts", "export function publishThing() { client.setQueryData([], 1); }"],
      ["features/example/storage/write-storage.ts", "export function saveThing() { sessionStorage.setItem('x', 'y'); }"],
      ["shared/auth/session-api.ts", "export function logoutCurrentSession() { return fetch('/logout'); }"],
    ]);

    expect(detectExportedWriteSymbols(sources)).toEqual([
      "features/example/api/write-api.ts#updateThing",
      "features/example/queries/write-query.ts#publishThing",
      "features/example/storage/write-storage.ts#saveThing",
      "shared/auth/session-api.ts#logoutCurrentSession",
    ]);
  });

  it("detects HTTP write exports regardless of their symbol verb", () => {
    const sources = new Map([
      ["features/example/api/neutral-api.ts", `
        export async function acknowledgeCase() {
          return fetch("/api/cases/1", { method: "POST" });
        }
        export const snapshot = () => fetch("/api/cases/1");
      `],
    ]);

    expect(detectExportedWriteSymbols(sources)).toEqual([
      "features/example/api/neutral-api.ts#acknowledgeCase",
    ]);
  });

  it("reifies direct, aliased, and star re-exports as symbol-level write candidates", () => {
    const sources = new Map([
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/api/logout", { method: "POST" });
        }
      `],
      ["features/auth/actions/password-auth.ts", `
        export { logout } from "../api/auth-api";
      `],
      ["features/auth/actions/aliased-auth.ts", `
        export { logout as endSession } from "../api/auth-api";
      `],
      ["features/auth/actions/all-auth.ts", `
        export * from "../api/auth-api";
      `],
    ]);

    expect(detectExportedWriteSymbols(sources)).toEqual([
      "features/auth/actions/aliased-auth.ts#endSession",
      "features/auth/actions/all-auth.ts#logout",
      "features/auth/actions/password-auth.ts#logout",
      "features/auth/api/auth-api.ts#logout",
    ]);
  });

  it("detects a mounted exact-verb facade caller even when another legitimate owner is mounted", () => {
    const sources = new Map([
      ["src/main.tsx", `
        import "@/features/auth/route/logout-button";
        import "@/features/example/route/rogue-route";
      `],
      ["features/auth/api/auth-api.ts", `export function logout() { return fetch("/logout", { method: "POST" }); }`],
      ["features/auth/actions/password-auth.ts", `export { logout } from "../api/auth-api";`],
      ["features/auth/route/logout-button.tsx", `
        import { logout } from "../api/auth-api";
        export function LogoutButton() { return logout(); }
      `],
      ["features/example/route/rogue-route.tsx", `
        import { logout } from "@/features/auth/actions/password-auth";
        export function RogueRoute() { return logout(); }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
      {
        path: "features/auth/actions/password-auth.ts",
        exportName: "logout",
        classification: "out-of-domain",
        ownerPaths: [],
        recoveryClass: "none",
        evidenceTokens: ["mounted-import-count:0"],
      },
    ];

    const mounted = buildMountedProductionPaths(sources, ["src/main.tsx"]);
    expect(auditMutationProducerInventory(sources, mounted, inventory)).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.tsx"],
      unreachableExportsWithMountedImports: ["features/auth/actions/password-auth.ts#logout"],
    });
  });

  it("detects a mounted aliased write consumer even when the classified owner is mounted", () => {
    const sources = new Map([
      ["src/main.tsx", `
        import "@/features/auth/route/logout-button";
        import "@/features/example/route/rogue-route";
      `],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/route/logout-button.tsx", `
        import { logout } from "../api/auth-api";
        export function LogoutButton() { return logout(); }
      `],
      ["features/example/route/rogue-route.tsx", `
        import { logout as terminate } from "@/features/auth/api/auth-api";
        export function RogueRoute() { return terminate(); }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.tsx"],
      modifyEntriesWithMissingMountedOwners: [
        "features/auth/api/auth-api.ts->features/example/route/rogue-route.tsx",
      ],
    });
  });

  it("detects a mounted top-level aliased write invocation", () => {
    const sources = new Map([
      ["src/main.tsx", `
        import "@/features/auth/route/logout-button";
        import "@/features/example/route/rogue-route";
      `],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/route/logout-button.tsx", `
        import { logout } from "../api/auth-api";
        export function LogoutButton() { return logout(); }
      `],
      ["features/example/route/rogue-route.ts", `
        import { logout as terminate } from "@/features/auth/api/auth-api";
        void terminate();
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.ts"],
      modifyEntriesWithMissingMountedOwners: [
        "features/auth/api/auth-api.ts->features/example/route/rogue-route.ts",
      ],
    });
  });

  it("detects an eager top-level variable initializer that invokes a classified write", () => {
    const { inventory, sources } = classifiedWriteConsumerFixture(`
      import { classifiedWrite } from "@/features/example/api/classified-write";
      const eager = classifiedWrite();
    `);

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.ts"],
      modifyEntriesWithMissingMountedOwners: [
        "features/example/api/classified-write.ts->features/example/route/rogue-route.ts",
      ],
    });
  });

  it.each([
    ["arrow IIFE", "const eager = (() => classifiedWrite())();"],
    ["function-expression IIFE", "const eager = (function () { return classifiedWrite(); })();"],
    [
      "parenthesized type-wrapped arrow IIFE",
      "const eager = (((() => classifiedWrite()) as () => unknown))();",
    ],
    [
      "parenthesized satisfies-wrapped function IIFE",
      "const eager = (((function () { return classifiedWrite(); }) satisfies () => unknown))();",
    ],
    [
      "nested arrow IIFE",
      "const eager = (() => (() => classifiedWrite())())();",
    ],
  ])("detects a classified write in a directly invoked %s", (_kind, initializer) => {
    const { inventory, sources } = classifiedWriteConsumerFixture(`
      import { classifiedWrite } from "@/features/example/api/classified-write";
      ${initializer}
    `);

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.ts"],
      modifyEntriesWithMissingMountedOwners: [
        "features/example/api/classified-write.ts->features/example/route/rogue-route.ts",
      ],
    });
  });

  it.each([
    [
      "omitted arrow parameter",
      "const eager = ((value = classifiedWrite()) => value)();",
    ],
    [
      "omitted function parameter",
      "const eager = (function (value = classifiedWrite()) { return value; })();",
    ],
    [
      "possibly undefined arrow parameter",
      `
        const maybeUndefined = Math.random() > 0.5 ? undefined : "provided";
        const eager = ((value = classifiedWrite()) => value)(maybeUndefined);
      `,
    ],
    [
      "possibly undefined function parameter",
      `
        const maybeUndefined = Math.random() > 0.5 ? undefined : "provided";
        const eager = (function (value = classifiedWrite()) { return value; })(maybeUndefined);
      `,
    ],
  ])("detects a classified write in an immediately invoked %s default", (_kind, initializer) => {
    const { inventory, sources } = classifiedWriteConsumerFixture(`
      import { classifiedWrite } from "@/features/example/api/classified-write";
      ${initializer}
    `);

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.ts"],
      modifyEntriesWithMissingMountedOwners: [
        "features/example/api/classified-write.ts->features/example/route/rogue-route.ts",
      ],
    });
  });

  it.each([
    [
      "named function",
      `
        const eager = (() => {
          function invokeWrite() { return classifiedWrite(); }
          return invokeWrite();
        })();
      `,
    ],
    [
      "const arrow",
      `
        const eager = (() => {
          const invokeWrite = () => classifiedWrite();
          return invokeWrite();
        })();
      `,
    ],
  ])("detects a classified write in an invoked IIFE-local %s", (_kind, initializer) => {
    const { inventory, sources } = classifiedWriteConsumerFixture(`
      import { classifiedWrite } from "@/features/example/api/classified-write";
      ${initializer}
    `);

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.ts"],
      modifyEntriesWithMissingMountedOwners: [
        "features/example/api/classified-write.ts->features/example/route/rogue-route.ts",
      ],
    });
  });

  it.each([
    [
      "non-invoked named function",
      `
        const eager = (() => {
          function dormant() { return classifiedWrite(); }
          return "clean";
        })();
      `,
    ],
    [
      "non-invoked const arrow",
      `
        const eager = (() => {
          const dormant = () => classifiedWrite();
          return "clean";
        })();
      `,
    ],
    [
      "definitely provided arrow default",
      "const eager = ((value = classifiedWrite()) => value)(\"provided\");",
    ],
    [
      "definitely provided function default",
      "const eager = (function (value = classifiedWrite()) { return value; })(\"provided\");",
    ],
    [
      "direct generator creation",
      "const deferred = (function* () { classifiedWrite(); })();",
    ],
    [
      "IIFE-local generator creation",
      `
        const eager = (() => {
          function* deferred() { classifiedWrite(); }
          return deferred();
        })();
      `,
    ],
  ])("keeps %s out of module execution", (_kind, initializer) => {
    const { inventory, sources } = classifiedWriteConsumerFixture(`
      import { classifiedWrite } from "@/features/example/api/classified-write";
      ${initializer}
    `);

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toEqual({
      unclassifiedPaths: [],
      unclassifiedExportedWrites: [],
      unreachableExportsWithMountedImports: [],
      modifyEntriesWithoutMountedOwner: [],
      modifyEntriesWithMissingMountedOwners: [],
      verifiedLeavesWithForbiddenPublication: [],
    });
  });

  it("detects a classified write reached by an anonymous default function export", () => {
    const { inventory, sources } = classifiedWriteConsumerFixture(`
      import { classifiedWrite } from "@/features/example/api/classified-write";
      export default function () { return classifiedWrite(); }
    `);

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.ts"],
      modifyEntriesWithMissingMountedOwners: [
        "features/example/api/classified-write.ts->features/example/route/rogue-route.ts",
      ],
    });
  });

  it.each([
    ["function declaration", "function dormant() { return classifiedWrite(); }"],
    ["stored arrow", "const dormant = () => classifiedWrite();"],
    ["stored function expression", "const dormant = function () { return classifiedWrite(); };"],
    [
      "passed arrow",
      "function retain(callback: () => unknown) { return callback; } const dormant = retain(() => classifiedWrite());",
    ],
    [
      "passed function expression",
      "function retain(callback: () => unknown) { return callback; } const dormant = retain(function () { return classifiedWrite(); });",
    ],
  ])("keeps a non-invoked %s body out of module execution", (_kind, declaration) => {
    const { inventory, sources } = classifiedWriteConsumerFixture(`
      import { classifiedWrite } from "@/features/example/api/classified-write";
      ${declaration}
    `);

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toEqual({
      unclassifiedPaths: [],
      unclassifiedExportedWrites: [],
      unreachableExportsWithMountedImports: [],
      modifyEntriesWithoutMountedOwner: [],
      modifyEntriesWithMissingMountedOwners: [],
      verifiedLeavesWithForbiddenPublication: [],
    });
  });

  it.each([
    ["function", "function dormant() { return terminate(); }"],
    ["const helper", "const dormant = () => terminate();"],
  ])("does not treat a dormant local %s as a mounted write consumer", (_label, dormantDeclaration) => {
    const sources = new Map([
      ["src/main.tsx", `
        import "@/features/auth/route/logout-button";
        import "@/features/example/route/read-route";
      `],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/route/logout-button.tsx", `
        import { logout } from "../api/auth-api";
        export function LogoutButton() { return logout(); }
      `],
      ["features/example/route/read-route.tsx", `
        import { logout as terminate } from "@/features/auth/api/auth-api";
        ${dormantDeclaration}
        export function ReadRoute() { return null; }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toEqual({
      unclassifiedPaths: [],
      unclassifiedExportedWrites: [],
      unreachableExportsWithMountedImports: [],
      modifyEntriesWithoutMountedOwner: [],
      modifyEntriesWithMissingMountedOwners: [],
      verifiedLeavesWithForbiddenPublication: [],
    });
  });

  it.each([
    ["exported component helper", `
      const terminateFromRoute = () => terminate();
      export function RogueRoute() { return terminateFromRoute(); }
    `],
    ["exported handler helper", `
      const terminateFromRoute = () => terminate();
      export const handleLogout = () => terminateFromRoute();
    `],
    ["exported JSX callback helper", `
      const terminateFromRoute = () => terminate();
      export function RogueRoute() { return <button onClick={terminateFromRoute} />; }
    `],
    ["direct top-level invocation", `
      void terminate();
      export function RogueRoute() { return null; }
    `],
  ])("detects a mounted %s write consumer through executable roots", (_label, routeSource) => {
    const sources = new Map([
      ["src/main.tsx", `
        import "@/features/auth/route/logout-button";
        import "@/features/example/route/rogue-route";
      `],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/route/logout-button.tsx", `
        import { logout } from "../api/auth-api";
        export function LogoutButton() { return logout(); }
      `],
      ["features/example/route/rogue-route.tsx", `
        import { logout as terminate } from "@/features/auth/api/auth-api";
        ${routeSource}
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.tsx"],
      modifyEntriesWithMissingMountedOwners: [
        "features/auth/api/auth-api.ts->features/example/route/rogue-route.tsx",
      ],
    });
  });

  it("detects a mounted namespace write consumer even when the classified owner is mounted", () => {
    const sources = new Map([
      ["src/main.tsx", `
        import "@/features/auth/route/logout-button";
        import "@/features/example/route/rogue-route";
      `],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/route/logout-button.tsx", `
        import { logout } from "../api/auth-api";
        export function LogoutButton() { return logout(); }
      `],
      ["features/example/route/rogue-route.tsx", `
        import * as auth from "@/features/auth/api/auth-api";
        export function RogueRoute() { return auth.logout(); }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.tsx"],
      modifyEntriesWithMissingMountedOwners: [
        "features/auth/api/auth-api.ts->features/example/route/rogue-route.tsx",
      ],
    });
  });

  it.each([
    ["direct", `import { logout } from "@/features/auth/api/auth-api";`, "logout()"],
    ["aliased", `import { logout as terminate } from "@/features/auth/api/auth-api";`, "terminate()"],
    ["namespace", `import * as auth from "@/features/auth/api/auth-api";`, "auth.logout()"],
  ])("accepts a registered %s write-consumer chain", (_label, importSource, invocation) => {
    const sources = new Map([
      ["src/main.tsx", `import "@/features/auth/route/logout-button";`],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/route/logout-button.tsx", `
        ${importSource}
        export function LogoutButton() { return ${invocation}; }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toEqual({
      unclassifiedPaths: [],
      unclassifiedExportedWrites: [],
      unreachableExportsWithMountedImports: [],
      modifyEntriesWithoutMountedOwner: [],
      modifyEntriesWithMissingMountedOwners: [],
      verifiedLeavesWithForbiddenPublication: [],
    });
  });

  it("accepts a registered aliased re-export write-consumer chain", () => {
    const sources = new Map([
      ["src/main.tsx", `import "@/features/auth/route/logout-button";`],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/actions/password-auth.ts", `
        export { logout as terminate } from "../api/auth-api";
      `],
      ["features/auth/route/logout-button.tsx", `
        import { terminate } from "../actions/password-auth";
        export function LogoutButton() { return terminate(); }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/actions/password-auth.ts",
        exportName: "terminate",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["facade"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toEqual({
      unclassifiedPaths: [],
      unclassifiedExportedWrites: [],
      unreachableExportsWithMountedImports: [],
      modifyEntriesWithoutMountedOwner: [],
      modifyEntriesWithMissingMountedOwners: [],
      verifiedLeavesWithForbiddenPublication: [],
    });
  });

  it("accepts a registered star-barrel write-consumer chain", () => {
    const sources = new Map([
      ["src/main.tsx", `import "@/features/auth/route/logout-button";`],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/actions/index.ts", `export * from "../api/auth-api";`],
      ["features/auth/route/logout-button.tsx", `
        import * as auth from "../actions";
        export function LogoutButton() { return auth.logout(); }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/actions/index.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["barrel"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toEqual({
      unclassifiedPaths: [],
      unclassifiedExportedWrites: [],
      unreachableExportsWithMountedImports: [],
      modifyEntriesWithoutMountedOwner: [],
      modifyEntriesWithMissingMountedOwners: [],
      verifiedLeavesWithForbiddenPublication: [],
    });
  });

  it("accepts a registered write-consumer chain containing a symbol cycle", () => {
    const sources = new Map([
      ["src/main.tsx", `import "@/features/auth/route/logout-button";`],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/actions/step-a.ts", `
        import { stepB } from "./step-b";
        export function stepA() { return stepB(false); }
      `],
      ["features/auth/actions/step-b.ts", `
        import { stepA } from "./step-a";
        import { logout } from "../api/auth-api";
        export function stepB(repeat: boolean) { return repeat ? stepA() : logout(); }
      `],
      ["features/auth/route/logout-button.tsx", `
        import { stepA } from "../actions/step-a";
        export function LogoutButton() { return stepA(); }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
      {
        path: "features/auth/actions/step-b.ts",
        exportName: "stepB",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["cyclic-write-adapter"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toEqual({
      unclassifiedPaths: [],
      unclassifiedExportedWrites: [],
      unreachableExportsWithMountedImports: [],
      modifyEntriesWithoutMountedOwner: [],
      modifyEntriesWithMissingMountedOwners: [],
      verifiedLeavesWithForbiddenPublication: [],
    });
  });

  it("ignores type-only imports when deriving mounted production consumers", () => {
    const sources = new Map([
      ["src/main.tsx", `import "@/features/example/route/read-route";`],
      ["features/example/route/read-route.ts", `
        import type { saveThing } from "../actions/save-thing";
        export type SaveThing = typeof saveThing;
        export function ReadRoute() { return null; }
      `],
      ["features/example/actions/save-thing.ts", `
        export function saveThing() {
          return fetch("/write", { method: "POST" });
        }
      `],
    ]);
    const mounted = buildMountedProductionPaths(sources, ["src/main.tsx"]);
    const inventory: MutationProducerClassification[] = [{
      path: "features/example/actions/save-thing.ts",
      exportName: "saveThing",
      classification: "out-of-domain",
      ownerPaths: [],
      recoveryClass: "none",
      evidenceTokens: ["mounted-import-count:0"],
    }];

    expect([...mounted]).toEqual([
      "features/example/route/read-route.ts",
      "src/main.tsx",
    ]);
    expect(auditMutationProducerInventory(sources, mounted, inventory)
      .unreachableExportsWithMountedImports).toEqual([]);
  });

  it("detects an aliased consumer mounted through a dynamic route import", () => {
    const sources = new Map([
      ["src/main.tsx", `
        import "@/features/auth/route/logout-button";
        void import("@/features/example/route/rogue-route");
      `],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/route/logout-button.tsx", `
        import { logout } from "../api/auth-api";
        export function LogoutButton() { return logout(); }
      `],
      ["features/example/route/rogue-route.tsx", `
        import { logout as terminate } from "@/features/auth/api/auth-api";
        export function RogueRoute() { return terminate(); }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.tsx"],
      modifyEntriesWithMissingMountedOwners: [
        "features/auth/api/auth-api.ts->features/example/route/rogue-route.tsx",
      ],
    });
  });

  it("does not treat a runtime import used only in a type position as a write consumer", () => {
    const sources = new Map([
      ["src/main.tsx", `
        import "@/features/auth/route/logout-button";
        import "@/features/example/route/type-observer";
      `],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/route/logout-button.tsx", `
        import { logout } from "../api/auth-api";
        export function LogoutButton() { return logout(); }
      `],
      ["features/example/route/type-observer.ts", `
        import { logout } from "@/features/auth/api/auth-api";
        export function observe(_callback: typeof logout) { return null; }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toEqual({
      unclassifiedPaths: [],
      unclassifiedExportedWrites: [],
      unreachableExportsWithMountedImports: [],
      modifyEntriesWithoutMountedOwner: [],
      modifyEntriesWithMissingMountedOwners: [],
      verifiedLeavesWithForbiddenPublication: [],
    });
  });

  it("does not mount or reify a type-only write re-export", () => {
    const sources = new Map([
      ["src/main.tsx", `import type { logout } from "@/features/auth/actions/type-barrel"; type Logout = typeof logout;`],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/actions/type-barrel.ts", `
        export type { logout } from "../api/auth-api";
      `],
    ]);

    expect([...buildMountedProductionPaths(sources, ["src/main.tsx"])]).toEqual([
      "src/main.tsx",
    ]);
    expect(detectExportedWriteSymbols(sources)).toEqual([
      "features/auth/api/auth-api.ts#logout",
    ]);
  });

  it("detects an unregistered consumer through an aliased re-export chain", () => {
    const sources = new Map([
      ["src/main.tsx", `
        import "@/features/auth/route/logout-button";
        import "@/features/example/route/rogue-route";
      `],
      ["features/auth/api/auth-api.ts", `
        export function logout() {
          return fetch("/logout", { method: "POST" });
        }
      `],
      ["features/auth/actions/password-auth.ts", `
        export { logout as terminate } from "../api/auth-api";
      `],
      ["features/auth/route/logout-button.tsx", `
        import { terminate } from "../actions/password-auth";
        export function LogoutButton() { return terminate(); }
      `],
      ["features/example/route/rogue-route.tsx", `
        import { terminate } from "@/features/auth/actions/password-auth";
        export function RogueRoute() { return terminate(); }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/auth/route/logout-button.tsx",
        classification: "register",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/auth/actions/password-auth.ts",
        exportName: "terminate",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["facade"],
      },
      {
        path: "features/auth/api/auth-api.ts",
        exportName: "logout",
        classification: "modify",
        ownerPaths: ["features/auth/route/logout-button.tsx"],
        recoveryClass: "L1",
        evidenceTokens: ["transport"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    )).toMatchObject({
      unclassifiedPaths: ["features/example/route/rogue-route.tsx"],
      modifyEntriesWithMissingMountedOwners: [
        "features/auth/actions/password-auth.ts->features/example/route/rogue-route.tsx",
        "features/auth/api/auth-api.ts->features/example/route/rogue-route.tsx",
      ],
    });
  });

  it("fails when one of two mounted registering owner chains is absent from a modify entry", () => {
    const sources = new Map([
      ["src/main.tsx", `import "@/features/example/route/owner-a"; import "@/features/example/route/owner-b";`],
      ["features/example/route/owner-a.ts", `import { save } from "../queries/write-query"; export function OwnerA() { return save(); }`],
      ["features/example/route/owner-b.ts", `import { save } from "../queries/write-query"; export function OwnerB() { return save(); }`],
      ["features/example/queries/write-query.ts", `export function save() { return fetch("/write", { method: "POST" }); }`],
    ]);
    const inventory: MutationProducerClassification[] = [
      {
        path: "features/example/route/owner-a.ts",
        classification: "register",
        ownerPaths: ["features/example/route/owner-a.ts"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/example/route/owner-b.ts",
        classification: "register",
        ownerPaths: ["features/example/route/owner-b.ts"],
        recoveryClass: "L1",
        evidenceTokens: ["registered"],
      },
      {
        path: "features/example/queries/write-query.ts",
        exportName: "save",
        classification: "modify",
        ownerPaths: ["features/example/route/owner-a.ts"],
        recoveryClass: "L1",
        evidenceTokens: ["write"],
      },
    ];

    expect(auditMutationProducerInventory(
      sources,
      buildMountedProductionPaths(sources, ["src/main.tsx"]),
      inventory,
    ).modifyEntriesWithMissingMountedOwners).toEqual([
      "features/example/queries/write-query.ts->features/example/route/owner-b.ts",
    ]);
  });

  it("fails when an already classified path gains a new write export symbol", () => {
    const sources = new Map([
      ["features/example/api/cases-api.ts", `
        export function updateCase() {
          return fetch("/api/cases/1", { method: "PATCH" });
        }
        export function acknowledgeCase() {
          return fetch("/api/cases/1/acknowledge", { method: "POST" });
        }
      `],
    ]);
    const inventory: MutationProducerClassification[] = [{
      path: "features/example/api/cases-api.ts",
      exportName: "updateCase",
      classification: "out-of-domain",
      ownerPaths: [],
      recoveryClass: "none",
      evidenceTokens: ["exported-write", "mounted-import-count:0"],
    }];

    expect(auditMutationProducerInventory(sources, new Set(), inventory)).toMatchObject({
      unclassifiedExportedWrites: ["features/example/api/cases-api.ts#acknowledgeCase"],
    });
  });
});
