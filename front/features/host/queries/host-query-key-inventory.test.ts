import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { hostClubOperationsKeys } from "./host-club-operations-queries";
import { hostInvitationKeys } from "./host-invitation-queries";
import { hostMemberKeys } from "./host-members-queries";
import { hostNotificationKeys } from "./host-notification-queries";
import { hostSessionKeys } from "./host-session-queries";
import { hostSessionRecordKeys } from "./host-session-record-query-keys";
import { hostSessionRecoveryKeys } from "./host-session-recovery-queries";
import { aiClubKeys, aiJobKeys } from "../aigen/queries/aigen-job-queries";
import { hostClubQueryPrefix } from "./host-state-purge";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("host query-key inventory", () => {
  it("puts every exported host query family under one mandatory club prefix", () => {
    const clubSlug = "reading-sai";
    const prefix = hostClubQueryPrefix(clubSlug);
    const keys = [
      hostSessionKeys.scope({ clubSlug }),
      hostSessionRecordKeys.scope({ clubSlug }),
      hostSessionRecoveryKeys.scope({ clubSlug }),
      hostMemberKeys.scope({ clubSlug }),
      hostInvitationKeys.scope({ clubSlug }),
      hostNotificationKeys.scope({ clubSlug }),
      hostClubOperationsKeys.scope({ clubSlug }),
      aiJobKeys.scope({ clubSlug }),
      aiClubKeys.scope({ clubSlug }),
    ];

    for (const key of keys) {
      expect(key.slice(0, prefix.length)).toEqual(prefix);
      expect(key).not.toContain(null);
      expect(key).not.toContain("__self__");
    }
  });

  it("changes every current host query family when the URL-owned club changes", () => {
    const scopes = (clubSlug: string) => ({
      sessions: hostSessionKeys.scope({ clubSlug }),
      sessionRecords: hostSessionRecordKeys.scope({ clubSlug }),
      sessionRecovery: hostSessionRecoveryKeys.scope({ clubSlug }),
      members: hostMemberKeys.scope({ clubSlug }),
      invitations: hostInvitationKeys.scope({ clubSlug }),
      notifications: hostNotificationKeys.scope({ clubSlug }),
      clubOperations: hostClubOperationsKeys.scope({ clubSlug }),
      aiJobs: aiJobKeys.scope({ clubSlug }),
      aiClub: aiClubKeys.scope({ clubSlug }),
    });
    const clubA = scopes("club-a");
    const clubB = scopes("club-b");

    expect(Object.keys(clubA)).toEqual(Object.keys(clubB));
    for (const family of Object.keys(clubA) as Array<keyof typeof clubA>) {
      expect(clubA[family].slice(0, 2)).toEqual(["host", "club-a"]);
      expect(clubB[family].slice(0, 2)).toEqual(["host", "club-b"]);
      expect(clubA[family]).not.toEqual(clubB[family]);
      expect(clubA[family]).not.toContain("club-b");
      expect(clubB[family]).not.toContain("club-a");
    }
  });

  it("keeps Stage 1 schedule-seen and access projections inside the session club scope", () => {
    const clubA = { clubSlug: "club-a" };
    const clubB = { clubSlug: "club-b" };
    const sessionId = "session-7";
    const stageOneKeys = [
      [hostSessionKeys.current(clubA), hostSessionKeys.current(clubB)],
      [hostSessionKeys.detail(sessionId, clubA), hostSessionKeys.detail(sessionId, clubB)],
      [hostSessionKeys.scheduleDefaults(clubA), hostSessionKeys.scheduleDefaults(clubB)],
    ];

    for (const [keyA, keyB] of stageOneKeys) {
      expect(keyA.slice(0, 2)).toEqual(["host", "club-a"]);
      expect(keyB.slice(0, 2)).toEqual(["host", "club-b"]);
      expect(keyA).not.toEqual(keyB);
    }
  });

  it("rejects manual host keys and generic error parser usage in host production code", () => {
    const hostRoot = join(process.cwd(), "features", "host");
    const violations = sourceFiles(hostRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const findings: string[] = [];
      if (/queryKey\s*:\s*\[\s*["']host["']/.test(source)) findings.push("literal-query-key");
      if (/\bapiErrorFromResponse\b/.test(source)) findings.push("generic-error-parser");
      return findings.map((finding) => `${relative(hostRoot, path)}:${finding}`);
    });

    expect(violations).toEqual([]);
  });

  it("requires every host mutation to declare the owning club mutation key", () => {
    const hostRoot = join(process.cwd(), "features", "host");
    const violations = sourceFiles(hostRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
      const findings: string[] = [];
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node)
          && ts.isIdentifier(node.expression)
          && node.expression.text === "useMutation"
        ) {
          const options = node.arguments[0];
          const mutationKey = options && ts.isObjectLiteralExpression(options)
            ? options.properties.find((property) =>
                ts.isPropertyAssignment(property)
                && property.name.getText(file) === "mutationKey")
            : undefined;
          if (
            !mutationKey
            || !ts.isPropertyAssignment(mutationKey)
            || !mutationKey.initializer.getText(file).includes("hostMutationKey(")
          ) {
            findings.push(`${relative(hostRoot, path)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      return findings;
    });

    expect(violations).toEqual([]);
  });

  it("rejects raw host responses that bypass the host parser or guarded body consumption", () => {
    const hostRoot = join(process.cwd(), "features", "host");
    const violations = sourceFiles(hostRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const findings: string[] = [];
      if (source.includes("readmatesFetchResponse(")) {
        if (!source.includes("hostApiErrorFromResponse")) findings.push("missing-host-parser");
        if (!/(completeHostResponseBody|readHostResponseJson|rawHostResponse)/.test(source)) {
          findings.push("missing-body-guard");
        }
      }
      if (/\bresponse(?:\.clone\(\))?\.json\(\)/.test(source)) {
        findings.push("unguarded-response-json");
      }
      return findings.map((finding) => `${relative(hostRoot, path)}:${finding}`);
    });

    expect(violations).toEqual([]);
  });
});
