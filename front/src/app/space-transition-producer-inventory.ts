import ts from "typescript";

export type MutationProducerClassification = {
  path: string;
  exportName?: string;
  exportNames?: readonly string[];
  classification: "register" | "modify" | "verified-no-change" | "out-of-domain";
  ownerPaths: string[];
  recoveryClass: "L1" | "L2" | "L3" | "none";
  evidenceTokens: string[];
};

const WRITE_EXPORTS_BY_PATH: Readonly<Record<string, readonly string[]>> = {
  "features/archive/api/archive-api.ts": ["leaveMembership", "updateMyAvatar", "updateMyProfile"],
  "features/archive/queries/profile-queries.ts": ["publishUpdatedProfile"],
  "features/current-session/api/current-session-api.ts": ["markCurrentScheduleSeen", "saveCurrentSessionCheckin", "saveCurrentSessionLongReview", "saveCurrentSessionOneLineReview", "saveCurrentSessionQuestion", "saveCurrentSessionQuestions", "updateCurrentSessionRsvp"],
  "features/current-session/queries/current-session-queries.ts": ["publishCurrentScheduleSeen"],
  "features/host/aigen/api/aigen-api.ts": ["cancelGeneration", "commitGeneration", "putClubAiDefault", "regenerateItem", "startGeneration"],
  "features/host/aigen/queries/aigen-job-queries.ts": ["publishAiJobDetail", "publishAiJobSession", "publishCommittedAiJob"],
  "features/host/aigen/storage/aigen-draft-storage.ts": ["saveAigenDraft"],
  "features/host/api/host-api.ts": ["closeHostSession", "commitHostSessionImport", "confirmManualNotification", "correctionPublishHostSession", "createHostInvitation", "createHostSession", "deleteHostSession", "openHostSession", "previewHostSessionImport", "previewManualNotification", "processHostNotifications", "publishHostSession", "reopenHostSession", "restoreHostNotification", "restoreHostSession", "retryHostNotification", "retryHostPublicConvergence", "returnHostSessionToDraft", "revokeHostInvitation", "saveHostSessionAccessScope", "saveHostSessionAttendance", "saveHostSessionPublication", "saveHostSessionVisibility", "sendHostNotificationTestMail", "submitHostMemberLifecycle", "submitHostMemberProfile", "submitHostViewerAction", "unpublishHostSession", "updateHostNotificationPolicy", "updateHostSession"],
  "features/host/api/host-session-record-api.ts": ["applyHostSessionRecord", "deleteHostSessionRecordDraft", "previewHostSessionRecordApply", "rebaseHostSessionRecordDraft", "restoreHostSessionRevisionToDraft", "saveHostSessionRecordDraft"],
  "features/host/api/host-session-recovery-api.ts": ["restoreHostSessionChange"],
  "features/host/queries/host-notification-queries.ts": ["publishHostNotificationPolicy", "publishHostNotificationPolicyFailure", "publishManualNotificationConfirm", "useProcessHostNotificationsMutation"],
  "features/host/queries/host-session-queries.ts": ["publishDeletedHostSession", "publishHostPublicConvergence", "publishHostSessionAttendance", "publishHostSessionCreated", "publishHostSessionImport", "publishHostSessionPublication", "publishHostSessionResponse", "publishHostSessionVisibility", "publishRestoredHostSession"],
  "features/host/queries/host-session-record-queries.ts": ["publishAppliedHostSessionRecord", "publishDeletedHostSessionRecordDraft", "publishRebasedHostSessionRecordDraft", "publishRestoredHostSessionRevisionDraft", "publishSavedHostSessionRecordDraft"],
  "features/host/queries/host-session-recovery-queries.ts": ["publishRestoredHostSessionChange"],
  "features/host/storage/host-sensitive-storage.ts": ["createHostSensitiveStorage", "hostSensitiveStorage"],
  "features/notifications/api/notification-preferences-api.ts": ["saveNotificationPreferences"],
  "features/notifications/api/notifications-api.ts": ["markAllMemberNotificationsRead", "markMemberNotificationRead"],
  "features/platform-admin/api/platform-admin-api.ts": ["checkPlatformAdminDomainProvisioning", "commitPlatformAdminOnboarding", "confirmForceCancelPlatformAdminAiJob", "confirmPlatformAdminClubVisibility", "confirmPlatformAdminDomain", "confirmRetryCommitPlatformAdminAiJob", "createPlatformAdminDomain", "previewForceCancelPlatformAdminAiJob", "previewPlatformAdminClubVisibility", "previewPlatformAdminDomain", "previewPlatformAdminOnboarding", "previewRetryCommitPlatformAdminAiJob", "updatePlatformAdminClub", "updatePlatformAdminClubMetadata"],
  "features/platform-admin/api/platform-admin-notifications-api.ts": ["confirmAdminNotificationReplay", "previewAdminNotificationReplay"],
  "features/platform-admin/api/platform-admin-operations-api.ts": ["acknowledgeAdminOperationCase", "resolveAdminOperationCase", "snoozeAdminOperationCase"],
  "features/platform-admin/api/platform-admin-support-api.ts": ["confirmAdminSupportGrant", "confirmAdminSupportGrantRevoke", "previewAdminSupportGrant", "previewAdminSupportGrantRevoke", "searchAdminSupportSubjects"],
  "features/platform-admin/api/platform-admin-takedown-api.ts": ["confirmAdminPublicTakedown", "previewAdminPublicTakedown"],
  "features/platform-admin/queries/platform-admin-ai-ops-queries.ts": ["publishPlatformAdminAiOps"],
  "features/platform-admin/queries/platform-admin-notifications-queries.ts": ["publishPlatformAdminNotifications"],
  "features/platform-admin/queries/platform-admin-operations-queries.ts": ["publishAdminOperationCase"],
  "features/platform-admin/queries/platform-admin-queries.ts": ["publishPlatformAdminClubState", "publishPlatformAdminOnboarding", "publishUpdatedPlatformAdminClub"],
  "features/platform-admin/queries/platform-admin-support-queries.ts": ["publishAdminSupportLedger"],
  "features/platform-admin/queries/platform-admin-takedown-queries.ts": ["publishAdminTakedownReceipt"],
  "shared/api/host-authority-event.ts": ["cancelClubHostRequests"],
  "shared/auth/club-access-api.ts": ["touchClubAccess"],
  "shared/auth/club-access-query.ts": ["touchClubAccessOnce"],
  "shared/auth/session-api.ts": ["logoutCurrentSession"],
};

const entry = (
  path: string,
  classification: MutationProducerClassification["classification"],
  recoveryClass: MutationProducerClassification["recoveryClass"],
  ownerPaths: string[],
  evidenceTokens: string[],
  exportName?: string,
): MutationProducerClassification => ({
  path,
  classification,
  recoveryClass,
  ownerPaths,
  evidenceTokens,
  ...(exportName ? { exportName } : {}),
  ...(WRITE_EXPORTS_BY_PATH[path] ? { exportNames: WRITE_EXPORTS_BY_PATH[path] } : {}),
});
const register = (path: string, level: "L1" | "L2" | "L3", evidence: string[]) => entry(path, "register", level, [path], evidence);
const modify = (path: string, owners: string[], level: "L1" | "L2" | "L3", evidence: string[]) => entry(path, "modify", level, owners, evidence);
const leaf = (path: string, owners: string[], evidence: string[]) => entry(path, "verified-no-change", "none", owners, evidence);
const unreachable = (path: string, exportName: string) => entry(path, "out-of-domain", "none", [], ["exported-write", "mounted-import-count:0"], exportName);

export const SPACE_TRANSITION_PRODUCER_INVENTORY = [
  register("features/archive/route/account-settings-route.tsx", "L2", ["leaveMembership", "authoritative-auth"]),
  register("features/archive/route/profile-update-controller.ts", "L1", ["useUpdateMyProfileMutation", "dirty-profile"]),
  register("features/current-session/route/current-session-route.tsx", "L1", ["mutateAsync", "current-session-refetch"]),
  register("features/notifications/route/member-notification-settings-route.tsx", "L1", ["saveNotificationPreferences", "dirty-preferences"]),
  register("features/notifications/route/member-notifications-route.tsx", "L1", ["memberNotificationsActions", "notifications-refetch"]),
  leaf("features/auth/route/login-route.tsx", [], ["pre-auth", "outside-authenticated-space-transition"]),
  entry("features/auth/api/auth-api.ts", "verified-no-change", "none", ["features/auth/route/login-route.tsx"], ["pre-auth-dev-login", "outside-authenticated-space-transition"], "submitDevLogin"),
  entry("features/auth/api/auth-api.ts", "modify", "L1", ["features/auth/route/logout-button.tsx"], ["logout-transport", "registered-authenticated-owner"], "logout"),
  leaf("features/host/queries/host-state-purge.ts", ["src/app/host-authority-loss-controller.tsx"], ["authority-loss-cleanup", "not-user-command"]),
  leaf("shared/api/host-authority-event.ts", ["src/app/host-authority-loss-controller.tsx"], ["authority-loss-request-cancel", "not-user-command"]),
  leaf("shared/auth/club-access-api.ts", ["src/app/layouts/app-route-layout.tsx"], ["transport-primitive", "response-ignored"]),
  modify("shared/auth/session-api.ts", ["features/auth/route/logout-button.tsx", "src/app/layouts/app-route-layout.tsx"], "L1", ["logout-transport", "registered-authenticated-owner"]),
  leaf("src/app/layouts/app-route-layout.tsx", ["src/app/layouts/app-route-layout.tsx"], ["touchClubAccessOnce", "ambient-touch", "request-count:1"]),
  register("src/app/layouts/app-route-layout.tsx", "L1", ["guest-continuation-logout", "cache-clear", "auth-reset", "navigation-replace"]),
  register("features/auth/route/logout-button.tsx", "L1", ["authenticated-logout", "accepted-publication"]),
  entry("shared/auth/oauth-join-intent.ts", "verified-no-change", "none", ["shared/ui/member-start-link.tsx"], ["pre-auth-join-intent", "ephemeral-navigation-token"], "oauthJoinHref"),
  entry("shared/observability/frontend-observability-client.ts", "verified-no-change", "none", ["shared/observability/frontend-observability.ts"], ["fail-open-telemetry", "no-product-publication"], "createFrontendObservabilityClient"),
  register("features/host/route/host-operations-route.tsx", "L1", ["ai-defaults", "accepted-publication"]),
  register("features/host/route/host-dashboard-route.tsx", "L1", ["attendanceMutation", "restoreMutation"]),
  register("features/host/route/host-meeting-ledger-route.tsx", "L2", ["createSession", "saveAccessScope"]),
  register("features/host/route/host-meeting-workspace-actions.ts", "L2", ["host-workflow-adapter", "mutation-receipt"]),
  register("features/host/route/host-meeting-workspace-route.tsx", "L3", ["manual-notification", "record-recovery"]),
  register("features/host/route/host-members-route.tsx", "L1", ["createHostMembersActions", "createHostInvitationsActions"]),
  register("features/host/route/host-invitations-route.tsx", "L1", ["createHostInvitationsActions", "still-unknown"]),
  register("features/host/route/host-notification-composer-controller.tsx", "L3", ["previewMutation", "confirmMutation"]),
  register("features/host/route/host-notifications-route.tsx", "L3", ["notification-workflow", "same-receipt"]),
  register("features/host/route/host-session-editor-route.tsx", "L3", ["dirty-draft", "record-workflow"]),
  register("features/host/route/ai-generate-controller.tsx", "L3", ["dirty-ai-draft", "registered-ai-commands"]),
  register("features/host/route/host-session-ledger-route.tsx", "L2", ["restoreMutation", "receipt-recovery"]),
  register("features/host/route/new-host-meeting-route.tsx", "L2", ["dirty-draft", "createMeeting"]),
  modify("features/notifications/route/member-notifications-data.ts", ["features/notifications/route/member-notifications-route.tsx"], "L1", ["observation-only", "explicit-publisher"]),
  modify("features/notifications/api/notifications-api.ts", ["features/notifications/route/member-notifications-data.ts"], "L1", ["transport-write", "registered-route-owner"]),
  modify("features/notifications/api/notification-preferences-api.ts", ["features/notifications/route/member-notification-settings-route.tsx"], "L1", ["transport-write", "registered-route-owner"]),
  modify("features/archive/api/archive-api.ts", ["features/archive/route/account-settings-route.tsx", "features/archive/route/profile-update-controller.ts"], "L2", ["transport-write", "registered-route-owner"]),
  modify("features/current-session/api/current-session-api.ts", ["features/current-session/route/current-session-route.tsx"], "L1", ["transport-write", "registered-route-owner"]),
  modify("features/host/route/host-members-data.ts", ["features/host/route/host-members-route.tsx"], "L1", ["observation-only", "explicit-publisher"]),
  modify("features/host/route/host-invitations-data.ts", ["features/host/route/host-invitations-route.tsx", "features/host/route/host-members-route.tsx"], "L1", ["listInvitations:no-cache", "refreshInvitations:accepted-only"]),
  modify("features/host/route/host-session-editor-actions.ts", ["features/host/route/host-session-editor-route.tsx"], "L3", ["observation-only", "explicit-publisher"]),
  modify("features/archive/queries/profile-queries.ts", ["features/archive/route/profile-update-controller.ts"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/current-session/queries/current-session-queries.ts", ["features/current-session/route/current-session-route.tsx"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/host/aigen/queries/aigen-job-queries.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/host/aigen/api/aigen-api.ts", ["features/host/route/ai-generate-controller.tsx"], "L3", ["transport-write", "registered-route-owner"]),
  modify("features/host/aigen/storage/aigen-draft-storage.ts", ["features/host/route/ai-generate-controller.tsx"], "L3", ["local-draft-write", "registered-dirty-owner"]),
  modify("features/host/api/host-api.ts", ["features/host/route/host-meeting-workspace-actions.ts", "features/host/route/host-members-route.tsx", "features/host/route/host-invitations-route.tsx"], "L3", ["transport-writes", "registered-route-owners"]),
  modify("features/host/api/host-session-record-api.ts", ["features/host/route/host-session-editor-route.tsx"], "L3", ["transport-write", "registered-route-owner"]),
  modify("features/host/api/host-session-recovery-api.ts", ["features/host/route/host-session-editor-route.tsx"], "L3", ["transport-write", "registered-route-owner"]),
  modify("features/host/storage/host-sensitive-storage.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["sensitive-local-write", "registered-route-owner"]),
  modify("features/host/queries/host-invitation-queries.ts", ["features/host/route/host-invitations-route.tsx", "features/host/route/host-members-route.tsx"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-members-queries.ts", ["features/host/route/host-members-route.tsx"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-notification-queries.ts", ["features/host/route/host-notifications-route.tsx", "features/host/route/host-notification-composer-controller.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-session-queries.ts", ["features/host/route/host-dashboard-route.tsx", "features/host/route/host-meeting-ledger-route.tsx", "features/host/route/host-meeting-workspace-actions.ts", "features/host/route/host-session-ledger-route.tsx", "features/host/route/new-host-meeting-route.tsx"], "L2", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-session-record-queries.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-session-recovery-queries.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx", "features/host/route/host-dashboard-route.tsx"], "L2", ["useMutation", "explicit-publisher"]),
  register("features/platform-admin/route/admin-shell-layout.tsx", "L2", ["onboarding", "dirty-preview"]),
  register("features/platform-admin/route/admin-today-route.tsx", "L1", ["allowedActions", "case-history"]),
  register("features/platform-admin/route/admin-club-detail-route.tsx", "L3", ["preview-confirm", "receipt"]),
  register("features/platform-admin/route/admin-support-route.tsx", "L3", ["dirty-review", "receipt"]),
  register("features/platform-admin/route/admin-notifications-route.tsx", "L3", ["preview-confirm", "receipt"]),
  register("features/platform-admin/route/admin-ai-ops-route.tsx", "L3", ["preview-confirm", "receipt"]),
  register("features/platform-admin/route/admin-public-takedown-route.tsx", "L3", ["same-identity-replay", "authority-loss-zero-replay"]),
  modify("features/platform-admin/queries/platform-admin-ai-ops-queries.ts", ["features/platform-admin/route/admin-ai-ops-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-notifications-queries.ts", ["features/platform-admin/route/admin-notifications-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-operations-queries.ts", ["features/platform-admin/route/admin-today-route.tsx"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-queries.ts", ["features/platform-admin/route/admin-shell-layout.tsx", "features/platform-admin/route/admin-club-detail-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-support-queries.ts", ["features/platform-admin/route/admin-support-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-takedown-queries.ts", ["features/platform-admin/route/admin-public-takedown-route.tsx"], "L3", ["one-confirm-request", "explicit-publisher"]),
  modify("features/platform-admin/api/platform-admin-api.ts", ["features/platform-admin/route/admin-ai-ops-route.tsx", "features/platform-admin/route/admin-club-detail-route.tsx", "features/platform-admin/route/admin-shell-layout.tsx"], "L3", ["transport-writes", "registered-route-owners"]),
  modify("features/platform-admin/api/platform-admin-operations-api.ts", ["features/platform-admin/route/admin-today-route.tsx"], "L1", ["case-command-posts", "registered-route-owner"]),
  entry("features/platform-admin/api/platform-admin-audit-api.ts", "verified-no-change", "none", ["features/platform-admin/route/admin-audit-route.tsx", "features/platform-admin/route/admin-club-detail-route.tsx"], ["read-only-sensitive-search-post", "query-observation"], "searchAdminAuditLedger"),
  modify("features/platform-admin/api/platform-admin-notifications-api.ts", ["features/platform-admin/route/admin-notifications-route.tsx"], "L3", ["transport-write", "registered-route-owner"]),
  modify("features/platform-admin/api/platform-admin-support-api.ts", ["features/platform-admin/route/admin-support-route.tsx"], "L3", ["transport-write", "registered-route-owner"]),
  modify("features/platform-admin/api/platform-admin-takedown-api.ts", ["features/platform-admin/route/admin-public-takedown-route.tsx"], "L3", ["transport-write", "registered-receipt-owner"]),
  leaf("features/host/aigen/ui/AiGenerateTab.tsx", ["features/host/route/ai-generate-controller.tsx"], ["presentation-slot"]),
  leaf("features/host/aigen/ui/PreviewView.tsx", ["features/host/route/host-session-editor-route.tsx"], ["callback-only"]),
  leaf("features/host/aigen/ui/RegenerateModal.tsx", ["features/host/route/host-session-editor-route.tsx"], ["callback-only"]),
  leaf("features/host/club/ui/ClubAiDefaultsSection.tsx", ["features/host/route/host-operations-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/host-operations-page.tsx", ["features/host/route/host-operations-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/host-members.tsx", ["features/host/route/host-members-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/host-invitations.tsx", ["features/host/route/host-invitations-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/host-session-editor.tsx", ["features/host/route/host-session-editor-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/meeting-ledger/upcoming-book-list.tsx", ["features/host/route/host-meeting-ledger-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/session-editor/session-record-workspace.tsx", ["features/host/route/host-session-editor-route.tsx"], ["callback-only"]),
  leaf("features/host/ui/session-editor/session-record-completion-panel.tsx", ["features/host/route/host-session-editor-route.tsx"], ["callback-only"]),
  leaf("features/platform-admin/ui/domain-provisioning-panel.tsx", ["features/platform-admin/route/admin-club-detail-route.tsx"], ["callback-only"]),
  leaf("shared/auth/club-access-query.ts", ["src/app/layouts/app-route-layout.tsx"], ["best-effort", "response-ignored", "request-count:1"]),
  unreachable("features/host/actions/invitations.ts", "createInvitation"),
  unreachable("features/host/actions/invitations.ts", "revokeInvitation"),
  unreachable("features/current-session/actions/save-checkin.ts", "saveCheckin"),
  unreachable("features/current-session/actions/save-question.ts", "saveQuestion"),
  unreachable("features/current-session/actions/save-question.ts", "saveQuestions"),
  unreachable("features/current-session/actions/save-review.ts", "saveLongReview"),
  unreachable("features/current-session/actions/save-review.ts", "saveOneLineReview"),
  unreachable("features/current-session/actions/update-rsvp.ts", "updateRsvp"),
] as const satisfies readonly MutationProducerClassification[];

export type ProducerInventoryAudit = {
  unclassifiedPaths: string[];
  unclassifiedExportedWrites: string[];
  unreachableExportsWithMountedImports: string[];
  modifyEntriesWithoutMountedOwner: string[];
  verifiedLeavesWithForbiddenPublication: string[];
};

const WRITE_VERB = "(?:save|update|delete|create|revoke|leave|logout|mark|submit|confirm|commit|retry|restore|open|close|publish|unpublish|reopen|process|send|cancel|regenerate|touch)";
const MUTATION_PATTERN = new RegExp(`\\buseMutation\\b|\\.mutate(?:Async)?\\s*\\(|\\bactions\\.${WRITE_VERB}[A-Z][A-Za-z0-9_]*\\s*\\(`);
const DIRECT_RISKY_WRITE_PATTERN = /\b(?:regenerateItem|touchClubAccess(?:Once)?|logoutCurrentSession)\s*\(/;
const FORBIDDEN_LEAF_PATTERN = /from\s+["'][^"']*\/(?:api|queries|route)(?:\/|["'])|from\s+["'](?:react-router|@\/src\/app|@\/src\/pages)|\bfetch\s*\(/;

function hasImportedWriteInvocation(source: string): boolean {
  const importPattern = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    const modulePath = match[2] ?? "";
    if (!/(?:\/api(?:\/|$)|\/actions(?:\/|$)|\/queries(?:\/|$)|\/storage(?:\/|$)|shared\/auth\/(?:club-access-query|session-api))/.test(modulePath)) {
      continue;
    }
    const names = (match[1] ?? "")
      .split(",")
      .map((part) => part.trim().replace(/^type\s+/, ""))
      .map((part) => part.split(/\s+as\s+/).at(-1) ?? "")
      .filter((name) => new RegExp(`^${WRITE_VERB}[A-Z]`).test(name));
    if (names.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(source.slice(match.index! + match[0].length)))) {
      return true;
    }
  }
  return false;
}

export function detectMutationProducerPaths(sources: ReadonlyMap<string, string>): string[] {
  const exportedWritePaths = new Set(detectExportedWriteSymbols(sources).map((symbol) => symbol.slice(0, symbol.lastIndexOf("#"))));
  return [...sources]
    .filter(([path, source]) => !/\.(?:test|ct|story)\.[jt]sx?$/.test(path)
      && path !== "src/app/space-transition-producer-inventory.ts"
      && (exportedWritePaths.has(path) || MUTATION_PATTERN.test(source) || DIRECT_RISKY_WRITE_PATTERN.test(source) || hasImportedWriteInvocation(source)))
    .map(([path]) => path)
    .sort();
}

const HTTP_WRITE_METHOD_PATTERN = /\bmethod\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i;
const EXPORTED_WRITE_VERB_PATH = /(?:^|\/)(?:api|actions|queries|storage)(?:\/|$)|^shared\/auth\/(?:club-access|session-api)/;

export function detectExportedWriteSymbols(sources: ReadonlyMap<string, string>): string[] {
  const exportedWrites: string[] = [];
  for (const [path, source] of sources) {
    if (/\.(?:test|ct|story)\.[jt]sx?$/.test(path)) continue;
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const declarations = new Map<string, { exported: boolean; calls: Set<string>; writesHttp: boolean }>();
    const exportedModifier = (node: ts.Node) => ts.canHaveModifiers(node)
      && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
    const record = (name: string, node: ts.Node, exported: boolean) => {
      const calls = new Set<string>();
      const visit = (candidate: ts.Node) => {
        if (ts.isCallExpression(candidate) && ts.isIdentifier(candidate.expression)) {
          calls.add(candidate.expression.text);
        }
        ts.forEachChild(candidate, visit);
      };
      visit(node);
      declarations.set(name, {
        exported,
        calls,
        writesHttp: HTTP_WRITE_METHOD_PATTERN.test(node.getText(sourceFile)),
      });
    };
    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
        record(statement.name.text, statement, exportedModifier(statement));
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.initializer) {
            record(declaration.name.text, declaration, exportedModifier(statement));
          }
        }
      }
    }
    const writeFunctions = new Set([...declarations]
      .filter(([name, declaration]) => declaration.writesHttp
        || (EXPORTED_WRITE_VERB_PATH.test(path) && new RegExp(`^${WRITE_VERB}(?:[A-Z]|$)`).test(name)))
      .map(([name]) => name));
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, declaration] of declarations) {
        if (writeFunctions.has(name)) continue;
        if ([...declaration.calls].some((called) => writeFunctions.has(called))) {
          writeFunctions.add(name);
          changed = true;
        }
      }
    }
    for (const [name, declaration] of declarations) {
      if (declaration.exported && writeFunctions.has(name)) {
        exportedWrites.push(`${path}#${name}`);
      }
    }
  }
  return exportedWrites.sort();
}

function runtimeImportSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

function resolveProductionImport(
  importer: string,
  specifier: string,
  sources: ReadonlyMap<string, string>,
): string | null {
  const raw = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? normalizePath(`${importer.slice(0, importer.lastIndexOf("/") + 1)}${specifier}`)
      : null;
  if (raw === null) return null;
  const candidates = [raw, `${raw}.ts`, `${raw}.tsx`, `${raw}.js`, `${raw}.jsx`, `${raw}/index.ts`, `${raw}/index.tsx`];
  return candidates.find((candidate) => sources.has(candidate)) ?? null;
}

function normalizePath(value: string): string {
  const parts: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export function buildMountedProductionPaths(
  sources: ReadonlyMap<string, string>,
  roots: readonly string[],
): ReadonlySet<string> {
  const mounted = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (mounted.has(path) || !sources.has(path)) continue;
    mounted.add(path);
    for (const specifier of runtimeImportSpecifiers(sources.get(path) ?? "")) {
      const resolved = resolveProductionImport(path, specifier, sources);
      if (resolved && !mounted.has(resolved)) pending.push(resolved);
    }
  }
  return new Set([...mounted].sort());
}

export function auditMutationProducerInventory(
  sources: ReadonlyMap<string, string>,
  mountedPaths: ReadonlySet<string>,
  inventory: readonly MutationProducerClassification[] = SPACE_TRANSITION_PRODUCER_INVENTORY,
): ProducerInventoryAudit {
  const inventoryPaths = new Set(inventory.map((candidate) => candidate.path));
  const inventoryExportedWrites = new Set(inventory.flatMap((candidate) => [
    ...(candidate.exportName ? [`${candidate.path}#${candidate.exportName}`] : []),
    ...(candidate.exportNames ?? []).map((exportName) => `${candidate.path}#${exportName}`),
  ]));
  return {
    unclassifiedPaths: detectMutationProducerPaths(sources).filter((path) => !inventoryPaths.has(path)),
    unclassifiedExportedWrites: detectExportedWriteSymbols(sources)
      .filter((symbol) => !inventoryExportedWrites.has(symbol)),
    unreachableExportsWithMountedImports: inventory.filter((candidate) => candidate.classification === "out-of-domain" && mountedPaths.has(candidate.path)).map((candidate) => `${candidate.path}#${candidate.exportName ?? "*"}`),
    modifyEntriesWithoutMountedOwner: inventory.filter((candidate) => candidate.classification === "modify" && !candidate.ownerPaths.some((owner) => mountedPaths.has(owner))).map((candidate) => candidate.path),
    verifiedLeavesWithForbiddenPublication: inventory.filter((candidate) => candidate.classification === "verified-no-change" && /^(?:features\/[^/]+\/.*\/ui\/|features\/[^/]+\/ui\/)/.test(candidate.path) && FORBIDDEN_LEAF_PATTERN.test(sources.get(candidate.path) ?? "")).map((candidate) => candidate.path),
  };
}
