import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SPACE_TRANSITION_PRODUCER_INVENTORY,
  auditMutationProducerInventory,
} from "./space-transition-producer-inventory";

const frontRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const productionRoots = ["src/app", "shared", "features"];

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

const mountedOwners = new Set(
  SPACE_TRANSITION_PRODUCER_INVENTORY.flatMap((entry) => (
    entry.classification === "out-of-domain" ? [] : entry.ownerPaths
  )),
);

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
    const sources = productionSources();
    const mounted = new Set(mountedOwners);
    mounted.add("features/current-session/actions/save-checkin.ts");
    expect(auditMutationProducerInventory(sources, mounted).unreachableExportsWithMountedImports)
      .toContain("features/current-session/actions/save-checkin.ts#saveCheckin");
  });
});
