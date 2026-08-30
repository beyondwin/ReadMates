import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SPACE_TRANSITION_PRODUCER_INVENTORY,
  auditMutationProducerInventory,
  buildMountedProductionPaths,
  detectExportedWriteSymbols,
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

describe("space transition mutation-producer inventory", () => {
  it("classifies every current mounted producer and exported out-of-domain write", () => {
    expect(auditMutationProducerInventory(productionSources(), mountedOwners)).toEqual({
      unclassifiedPaths: [],
      unreachableExportsWithMountedImports: [],
      modifyEntriesWithoutMountedOwner: [],
      verifiedLeavesWithForbiddenPublication: [],
    });
  });

  it("requires evidence and a mounted registering owner for every modified factory", () => {
    for (const entry of SPACE_TRANSITION_PRODUCER_INVENTORY) {
      expect(entry.evidenceTokens.length, entry.path).toBeGreaterThan(0);
      if (entry.classification === "modify") {
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
});
