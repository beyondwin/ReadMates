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
  "features/host/api/host-club-settings-api.ts": ["changeHostCoHost", "confirmHostClubClose", "previewHostClubClose", "updateHostClubSettings"],
  "features/host/api/host-invitation-link-api.ts": ["createHostInvitationLink", "updateHostInvitationLink"],
  "features/host/api/host-workbox-api.ts": ["deferHostWorkboxItem", "removeHostWorkboxDeferral"],
  "features/host/api/host-session-record-api.ts": ["applyHostSessionRecord", "deleteHostSessionRecordDraft", "previewHostSessionRecordApply", "rebaseHostSessionRecordDraft", "restoreHostSessionRevisionToDraft", "saveHostSessionRecordDraft"],
  "features/host/api/host-session-recovery-api.ts": ["restoreHostSessionChange"],
  "features/host/queries/host-invitation-queries.ts": ["invalidateHostInvitations", "useCreateInvitationMutation", "useRevokeInvitationMutation"],
  "features/host/queries/host-club-settings-queries.ts": ["publishHostClubSettings"],
  "features/host/queries/host-invitation-link-queries.ts": ["publishHostInvitationLinks"],
  "features/host/queries/host-members-queries.ts": ["invalidateHostMembers", "useHostMemberLifecycleMutation", "useHostMemberProfileMutation", "useHostViewerActionMutation"],
  "features/host/queries/host-notification-queries.ts": ["publishHostNotificationPolicy", "publishHostNotificationPolicyFailure", "publishManualNotificationConfirm", "useProcessHostNotificationsMutation"],
  "features/host/queries/host-session-queries.ts": ["publishDeletedHostSession", "publishHostPublicConvergence", "publishHostSessionAttendance", "publishHostSessionCreated", "publishHostSessionImport", "publishHostSessionPublication", "publishHostSessionResponse", "publishHostSessionVisibility", "publishRestoredHostSession"],
  "features/host/queries/host-session-record-queries.ts": ["publishAppliedHostSessionRecord", "publishDeletedHostSessionRecordDraft", "publishRebasedHostSessionRecordDraft", "publishRestoredHostSessionRevisionDraft", "publishSavedHostSessionRecordDraft"],
  "features/host/queries/host-session-recovery-queries.ts": ["publishRestoredHostSessionChange"],
  "features/host/queries/host-workbox-queries.ts": ["publishHostWorkboxComposition"],
  "features/host/route/host-invitations-data.ts": ["createHostInvitationsActions"],
  "features/host/route/host-members-data.ts": ["createHostMembersActions", "publishHostMembersRefresh"],
  "features/host/route/host-session-editor-actions.ts": ["wrapHostSessionEditorActionsForUndo"],
  "features/host/storage/host-sensitive-storage.ts": ["createHostSensitiveStorage", "hostSensitiveStorage", "registerHostSensitiveState"],
  "features/notifications/api/notification-preferences-api.ts": ["saveNotificationPreferences"],
  "features/notifications/api/notifications-api.ts": ["markAllMemberNotificationsRead", "markMemberNotificationRead"],
  "features/notifications/route/member-notifications-data.ts": ["memberNotificationsActions", "publishMemberNotificationsRefresh"],
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
  entry("features/auth/api/auth-api.ts", "modify", "L1", ["features/auth/route/logout-button.tsx", "src/app/layouts/app-route-layout.tsx"], ["logout-transport", "registered-authenticated-owner"], "logout"),
  leaf("features/host/queries/host-state-purge.ts", ["src/app/host-authority-loss-controller.tsx"], ["authority-loss-cleanup", "not-user-command"]),
  leaf("shared/api/host-authority-event.ts", ["src/app/host-authority-loss-controller.tsx"], ["authority-loss-request-cancel", "not-user-command"]),
  leaf("src/app/host-authority-loss-controller.tsx", ["src/app/layouts/app-route-layout.tsx"], ["authority-loss-terminal-cleanup", "not-user-command"]),
  leaf("shared/auth/club-access-api.ts", ["src/app/layouts/app-route-layout.tsx"], ["transport-primitive", "response-ignored"]),
  modify("shared/auth/session-api.ts", ["features/auth/route/logout-button.tsx", "src/app/layouts/app-route-layout.tsx", "features/platform-admin/route/admin-shell-controller.tsx"], "L1", ["logout-transport", "registered-authenticated-owner"]),
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
  register("features/host/route/host-schedule-review-route.tsx", "L3", ["preview-confirm", "schedule-revision", "accepted-publication"]),
  register("features/host/route/host-settings-route.tsx", "L3", ["settings", "invitation-links", "club-close", "accepted-publication"]),
  register("features/host/route/new-host-meeting-route.tsx", "L2", ["dirty-draft", "createMeeting"]),
  modify("features/notifications/route/member-notifications-data.ts", ["features/notifications/route/member-notifications-route.tsx"], "L1", ["observation-only", "explicit-publisher"]),
  modify("features/notifications/api/notifications-api.ts", ["features/notifications/route/member-notifications-data.ts", "features/notifications/route/member-notifications-route.tsx"], "L1", ["transport-write", "registered-route-owner"]),
  modify("features/notifications/api/notification-preferences-api.ts", ["features/notifications/route/member-notification-settings-route.tsx"], "L1", ["transport-write", "registered-route-owner"]),
  modify("features/archive/api/archive-api.ts", ["features/archive/route/account-settings-route.tsx", "features/archive/route/profile-update-controller.ts"], "L2", ["transport-write", "registered-route-owner"]),
  modify("features/current-session/api/current-session-api.ts", ["features/current-session/route/current-session-route.tsx"], "L1", ["transport-write", "registered-route-owner"]),
  modify("features/host/route/host-members-data.ts", ["features/host/route/host-members-route.tsx"], "L1", ["observation-only", "explicit-publisher"]),
  modify("features/host/route/host-invitations-data.ts", ["features/host/route/host-invitations-route.tsx", "features/host/route/host-members-route.tsx"], "L1", ["listInvitations:no-cache", "refreshInvitations:accepted-only"]),
  modify("features/host/route/host-session-editor-actions.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["observation-only", "explicit-publisher"]),
  modify("features/archive/queries/profile-queries.ts", ["features/archive/route/profile-update-controller.ts"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/current-session/queries/current-session-queries.ts", ["features/current-session/route/current-session-route.tsx"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/host/aigen/queries/aigen-job-queries.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/host/aigen/api/aigen-api.ts", ["features/host/route/ai-generate-controller.tsx"], "L3", ["transport-write", "registered-route-owner"]),
  modify("features/host/aigen/storage/aigen-draft-storage.ts", ["features/host/route/ai-generate-controller.tsx"], "L3", ["local-draft-write", "registered-dirty-owner"]),
  modify("features/host/api/host-api.ts", ["features/host/route/host-dashboard-route.tsx", "features/host/route/host-meeting-workspace-actions.ts", "features/host/route/host-meeting-workspace-route.tsx", "features/host/route/host-members-route.tsx", "features/host/route/host-invitations-route.tsx", "features/host/route/host-notification-composer-controller.tsx", "features/host/route/host-notifications-route.tsx", "features/host/route/host-schedule-review-route.tsx", "features/host/route/host-session-ledger-route.tsx", "features/host/route/new-host-meeting-route.tsx"], "L3", ["transport-writes", "registered-route-owners"]),
  modify("features/host/api/host-club-settings-api.ts", ["features/host/route/host-settings-route.tsx"], "L3", ["transport-writes", "registered-route-owner"]),
  modify("features/host/api/host-invitation-link-api.ts", ["features/host/route/host-settings-route.tsx"], "L2", ["transport-writes", "registered-route-owner"]),
  modify("features/host/api/host-workbox-api.ts", ["features/host/route/host-dashboard-route.tsx"], "L2", ["transport-writes", "registered-route-owner"]),
  modify("features/host/api/host-session-record-api.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["transport-write", "registered-route-owner"]),
  modify("features/host/api/host-session-recovery-api.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-dashboard-route.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["transport-write", "registered-route-owner"]),
  modify("features/host/storage/host-sensitive-storage.ts", ["features/host/route/ai-generate-controller.tsx", "features/host/route/host-dashboard-route.tsx", "features/host/route/host-meeting-workspace-route.tsx", "features/host/route/host-notification-composer-controller.tsx", "features/host/route/host-notifications-route.tsx", "features/host/route/host-session-editor-route.tsx", "features/host/route/new-host-meeting-route.tsx"], "L3", ["sensitive-local-write", "registered-route-owner"]),
  modify("features/host/queries/host-invitation-queries.ts", ["features/host/route/host-invitations-route.tsx", "features/host/route/host-members-route.tsx"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-members-queries.ts", ["features/host/route/host-members-route.tsx"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-club-settings-queries.ts", ["features/host/route/host-settings-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-invitation-link-queries.ts", ["features/host/route/host-settings-route.tsx"], "L2", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-notification-queries.ts", ["features/host/route/host-notifications-route.tsx", "features/host/route/host-notification-composer-controller.tsx", "features/host/route/host-meeting-workspace-route.tsx", "features/host/route/host-schedule-review-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-session-queries.ts", ["features/host/route/host-dashboard-route.tsx", "features/host/route/host-meeting-ledger-route.tsx", "features/host/route/host-meeting-workspace-actions.ts", "features/host/route/host-meeting-workspace-route.tsx", "features/host/route/host-session-ledger-route.tsx", "features/host/route/new-host-meeting-route.tsx"], "L2", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-session-record-queries.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-session-recovery-queries.ts", ["features/host/route/host-session-editor-route.tsx", "features/host/route/host-meeting-workspace-route.tsx", "features/host/route/host-dashboard-route.tsx"], "L2", ["useMutation", "explicit-publisher"]),
  modify("features/host/queries/host-workbox-queries.ts", ["features/host/route/host-dashboard-route.tsx"], "L2", ["useMutation", "explicit-publisher"]),
  register("features/platform-admin/route/admin-shell-controller.tsx", "L1", ["authenticated-logout", "accepted-publication"]),
  leaf("features/platform-admin/route/admin-clubs-route.tsx", ["features/platform-admin/route/admin-onboarding-controller.tsx"], ["mounts-onboarding-controller", "composition-only"]),
  register("features/platform-admin/route/admin-onboarding-controller.tsx", "L2", ["onboarding", "dirty-preview"]),
  register("features/platform-admin/route/use-admin-today-controller.ts", "L1", ["allowedActions", "case-history"]),
  register("features/platform-admin/route/admin-club-detail-route.tsx", "L3", ["preview-confirm", "receipt"]),
  register("features/platform-admin/route/admin-support-route.tsx", "L3", ["dirty-review", "receipt"]),
  register("features/platform-admin/route/admin-notifications-route.tsx", "L3", ["preview-confirm", "receipt"]),
  register("features/platform-admin/route/admin-ai-ops-route.tsx", "L3", ["preview-confirm", "receipt"]),
  register("features/platform-admin/route/admin-public-takedown-route.tsx", "L3", ["same-identity-replay", "authority-loss-zero-replay"]),
  modify("features/platform-admin/queries/platform-admin-ai-ops-queries.ts", ["features/platform-admin/route/admin-ai-ops-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-notifications-queries.ts", ["features/platform-admin/route/admin-notifications-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-operations-queries.ts", ["features/platform-admin/route/use-admin-today-controller.ts"], "L1", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-queries.ts", ["features/platform-admin/route/admin-onboarding-controller.tsx", "features/platform-admin/route/admin-club-detail-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-support-queries.ts", ["features/platform-admin/route/admin-support-route.tsx"], "L3", ["useMutation", "explicit-publisher"]),
  modify("features/platform-admin/queries/platform-admin-takedown-queries.ts", ["features/platform-admin/route/admin-public-takedown-route.tsx"], "L3", ["one-confirm-request", "explicit-publisher"]),
  modify("features/platform-admin/api/platform-admin-api.ts", ["features/platform-admin/route/admin-ai-ops-route.tsx", "features/platform-admin/route/admin-club-detail-route.tsx", "features/platform-admin/route/admin-onboarding-controller.tsx"], "L3", ["transport-writes", "registered-route-owners"]),
  modify("features/platform-admin/api/platform-admin-operations-api.ts", ["features/platform-admin/route/use-admin-today-controller.ts"], "L1", ["case-command-posts", "registered-route-owner"]),
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
  unreachable("features/auth/actions/password-auth.ts", "logout"),
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
  modifyEntriesWithMissingMountedOwners: string[];
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
      .filter((name) => new RegExp(`^${WRITE_VERB}(?:[A-Z]|$)`).test(name));
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

type ProductionSymbolGraph = {
  edges: Map<string, Set<string>>;
  writeEdges: Map<string, Set<string>>;
  exportsByPath: Map<string, Set<string>>;
  localsByPath: Map<string, Set<string>>;
  executableRootsByPath: Map<string, Set<string>>;
  baseWrites: Set<string>;
};

const localSymbol = (path: string, name: string) => `${path}::${name}`;
const exportedSymbol = (path: string, name: string) => `${path}#${name}`;
const MODULE_EXECUTION_SYMBOL = "<module-execution>";
const DEFAULT_EXPORT_LOCAL_SYMBOL = "<default-export>";

function addSymbolEdge(edges: Map<string, Set<string>>, from: string, to: string) {
  const targets = edges.get(from) ?? new Set<string>();
  targets.add(to);
  edges.set(from, targets);
}

function isTopLevelExecutionStatement(statement: ts.Statement): boolean {
  return ts.isExpressionStatement(statement)
    || ts.isIfStatement(statement)
    || ts.isDoStatement(statement)
    || ts.isWhileStatement(statement)
    || ts.isForStatement(statement)
    || ts.isForInStatement(statement)
    || ts.isForOfStatement(statement)
    || ts.isWithStatement(statement)
    || ts.isSwitchStatement(statement)
    || ts.isTryStatement(statement)
    || ts.isLabeledStatement(statement)
    || ts.isBlock(statement)
    || ts.isThrowStatement(statement)
    || ts.isReturnStatement(statement)
    || ts.isExportAssignment(statement);
}

function unwrapTransparentExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

type EagerRuntimeFunction = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration;

function isGeneratorRuntimeFunction(candidate: EagerRuntimeFunction): boolean {
  return !ts.isArrowFunction(candidate) && Boolean(candidate.asteriskToken);
}

function isDefinitelyNonUndefinedExpression(expression: ts.Expression): boolean {
  const candidate = unwrapTransparentExpression(expression);
  return ts.isStringLiteral(candidate)
    || ts.isNumericLiteral(candidate)
    || ts.isBigIntLiteral(candidate)
    || ts.isNoSubstitutionTemplateLiteral(candidate)
    || ts.isTemplateExpression(candidate)
    || ts.isRegularExpressionLiteral(candidate)
    || ts.isObjectLiteralExpression(candidate)
    || ts.isArrayLiteralExpression(candidate)
    || ts.isArrowFunction(candidate)
    || ts.isFunctionExpression(candidate)
    || ts.isClassExpression(candidate)
    || ts.isNewExpression(candidate)
    || ts.isJsxElement(candidate)
    || ts.isJsxSelfClosingElement(candidate)
    || ts.isJsxFragment(candidate)
    || candidate.kind === ts.SyntaxKind.TrueKeyword
    || candidate.kind === ts.SyntaxKind.FalseKeyword
    || candidate.kind === ts.SyntaxKind.NullKeyword;
}

function analyzeProductionSymbolGraph(sources: ReadonlyMap<string, string>): ProductionSymbolGraph {
  const edges = new Map<string, Set<string>>();
  const writeEdges = new Map<string, Set<string>>();
  const exportsByPath = new Map<string, Set<string>>();
  const localsByPath = new Map<string, Set<string>>();
  const executableRootsByPath = new Map<string, Set<string>>();
  const baseWrites = new Set<string>();
  const starExports: Array<{ path: string; providerPath: string }> = [];

  for (const [path, source] of sources) {
    if (/\.(?:test|ct|story)\.[jt]sx?$/.test(path)) continue;
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const declarations = new Map<string, ts.Node>();
    const eagerVariableDeclarations: ts.VariableDeclaration[] = [];
    const imports = new Map<string, { providerPath: string; importedName: string }>();
    const exportedModifier = (node: ts.Node) => ts.canHaveModifiers(node)
      && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
    const defaultModifier = (node: ts.Node) => ts.canHaveModifiers(node)
      && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword));

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)
        && statement.importClause
        && !statement.importClause.isTypeOnly
        && ts.isStringLiteral(statement.moduleSpecifier)) {
        const providerPath = resolveProductionImport(path, statement.moduleSpecifier.text, sources);
        if (providerPath) {
          if (statement.importClause.name) {
            imports.set(statement.importClause.name.text, { providerPath, importedName: "default" });
          }
          const bindings = statement.importClause.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            for (const element of bindings.elements) {
              if (element.isTypeOnly) continue;
              imports.set(element.name.text, {
                providerPath,
                importedName: element.propertyName?.text ?? element.name.text,
              });
            }
          } else if (bindings && ts.isNamespaceImport(bindings)) {
            imports.set(bindings.name.text, { providerPath, importedName: "*" });
          }
        }
      }
      if (ts.isFunctionDeclaration(statement) && statement.body) {
        if (statement.name) declarations.set(statement.name.text, statement);
        else if (exportedModifier(statement) && defaultModifier(statement)) {
          declarations.set(DEFAULT_EXPORT_LOCAL_SYMBOL, statement);
        }
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!declaration.initializer) continue;
          eagerVariableDeclarations.push(declaration);
          if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration);
        }
      }
    }

    const moduleExecutionStatements = sourceFile.statements.filter(isTopLevelExecutionStatement);
    const localNames = new Set(declarations.keys());
    if (moduleExecutionStatements.length > 0 || eagerVariableDeclarations.length > 0) {
      localNames.add(MODULE_EXECUTION_SYMBOL);
    }
    localsByPath.set(path, localNames);
    const pathExports = exportsByPath.get(path) ?? new Set<string>();
    exportsByPath.set(path, pathExports);
    const executableRoots = executableRootsByPath.get(path) ?? new Set<string>();
    executableRootsByPath.set(path, executableRoots);

    const addRuntimeReferences = (from: string, root: ts.Node, ownName?: string) => {
      const visit = (candidate: ts.Node) => {
        if (ts.isTypeNode(candidate)) return;
        if (ts.isPropertyAccessExpression(candidate) && ts.isIdentifier(candidate.expression)) {
          const binding = imports.get(candidate.expression.text);
          if (binding?.importedName === "*") {
            addSymbolEdge(edges, from, exportedSymbol(binding.providerPath, candidate.name.text));
          }
        } else if (ts.isIdentifier(candidate)) {
          const binding = imports.get(candidate.text);
          if (binding && binding.importedName !== "*") {
            addSymbolEdge(edges, from, exportedSymbol(binding.providerPath, binding.importedName));
          } else if (candidate.text !== ownName && declarations.has(candidate.text)) {
            addSymbolEdge(edges, from, localSymbol(path, candidate.text));
            addSymbolEdge(writeEdges, from, localSymbol(path, candidate.text));
          }
        }
        ts.forEachChild(candidate, visit);
      };
      visit(root);
    };

    const addEagerRuntimeReferences = (from: string, root: ts.Node) => {
      type CallableScope = Map<string, EagerRuntimeFunction | null>;
      type BindingValue = {
        expression?: ts.Expression;
        presence: "definitely-defined" | "definitely-undefined" | "unknown";
      };
      const executedBodies = new Set<EagerRuntimeFunction>();
      const activeCalls = new Set<EagerRuntimeFunction>();
      const definitelyUndefinedBindingValue: BindingValue = {
        presence: "definitely-undefined",
      };
      const unknownBindingValue: BindingValue = { presence: "unknown" };

      const addBindingNames = (
        scope: CallableScope,
        name: ts.BindingName,
        callable: EagerRuntimeFunction | null,
      ) => {
        if (ts.isIdentifier(name)) {
          scope.set(name.text, callable);
          return;
        }
        for (const element of name.elements) {
          if (ts.isBindingElement(element)) addBindingNames(scope, element.name, null);
        }
      };

      const collectCallableScope = (callable: EagerRuntimeFunction): CallableScope => {
        const scope: CallableScope = new Map();
        if (ts.isFunctionExpression(callable) && callable.name) {
          scope.set(callable.name.text, callable);
        }
        for (const parameter of callable.parameters) addBindingNames(scope, parameter.name, null);

        const collect = (candidate: ts.Node) => {
          if (ts.isFunctionDeclaration(candidate)) {
            if (candidate.name && candidate.body) scope.set(candidate.name.text, candidate);
            return;
          }
          if (ts.isVariableDeclaration(candidate)) {
            const initializer = candidate.initializer
              ? unwrapTransparentExpression(candidate.initializer)
              : null;
            const localCallable = initializer
              && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
              ? initializer
              : null;
            addBindingNames(scope, candidate.name, localCallable);
          }
          if (ts.isArrowFunction(candidate)
            || ts.isFunctionExpression(candidate)
            || ts.isClassDeclaration(candidate)
            || ts.isClassExpression(candidate)
            || ts.isMethodDeclaration(candidate)
            || ts.isGetAccessorDeclaration(candidate)
            || ts.isSetAccessorDeclaration(candidate)
            || ts.isConstructorDeclaration(candidate)) {
            return;
          }
          ts.forEachChild(candidate, collect);
        };

        if (callable.body) collect(callable.body);
        return scope;
      };

      const resolveLocalCallable = (name: string, scopes: readonly CallableScope[]) => {
        for (const scope of scopes) {
          if (scope.has(name)) return { found: true, callable: scope.get(name) ?? null };
        }
        return { found: false, callable: null };
      };

      const bindingValueFromExpression = (expression: ts.Expression): BindingValue => {
        const candidate = unwrapTransparentExpression(expression);
        const isDefinitelyUndefined = ts.isVoidExpression(candidate)
          || (ts.isIdentifier(candidate) && candidate.text === "undefined");
        return {
          expression,
          presence: isDefinitelyUndefined
            ? "definitely-undefined"
            : isDefinitelyNonUndefinedExpression(expression)
              ? "definitely-defined"
              : "unknown",
        };
      };

      const staticPropertyName = (name: ts.PropertyName): string | null => {
        if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
          return name.text;
        }
        if (!ts.isComputedPropertyName(name)) return null;
        const expression = unwrapTransparentExpression(name.expression);
        return ts.isStringLiteral(expression)
          || ts.isNumericLiteral(expression)
          || ts.isNoSubstitutionTemplateLiteral(expression)
          ? expression.text
          : null;
      };

      const objectBindingValue = (
        source: BindingValue,
        element: ts.BindingElement,
      ): BindingValue => {
        if (!source.expression) return unknownBindingValue;
        const expression = unwrapTransparentExpression(source.expression);
        if (!ts.isObjectLiteralExpression(expression)) return unknownBindingValue;
        const propertyName = element.propertyName
          ?? (ts.isIdentifier(element.name) ? element.name : null);
        if (!propertyName) return unknownBindingValue;
        const targetName = staticPropertyName(propertyName);
        if (targetName === null) return unknownBindingValue;

        let mayHaveLaterOverride = false;
        for (let index = expression.properties.length - 1; index >= 0; index -= 1) {
          const property = expression.properties[index];
          if (ts.isSpreadAssignment(property)) {
            mayHaveLaterOverride = true;
            continue;
          }
          const candidateName = staticPropertyName(property.name);
          if (candidateName === null) {
            mayHaveLaterOverride = true;
            continue;
          }
          if (candidateName !== targetName) continue;
          if (mayHaveLaterOverride) return unknownBindingValue;
          if (ts.isPropertyAssignment(property)) {
            return bindingValueFromExpression(property.initializer);
          }
          if (ts.isShorthandPropertyAssignment(property)) {
            return bindingValueFromExpression(property.name);
          }
          if (ts.isMethodDeclaration(property)) {
            return { presence: "definitely-defined" };
          }
          return unknownBindingValue;
        }
        return mayHaveLaterOverride
          ? unknownBindingValue
          : definitelyUndefinedBindingValue;
      };

      const arrayBindingValue = (source: BindingValue, index: number): BindingValue => {
        if (!source.expression) return unknownBindingValue;
        const expression = unwrapTransparentExpression(source.expression);
        if (!ts.isArrayLiteralExpression(expression)) return unknownBindingValue;
        for (let offset = 0; offset <= index && offset < expression.elements.length; offset += 1) {
          const element = expression.elements[offset];
          if (ts.isSpreadElement(element)) return unknownBindingValue;
          if (offset !== index) continue;
          return ts.isOmittedExpression(element)
            ? definitelyUndefinedBindingValue
            : bindingValueFromExpression(element);
        }
        return definitelyUndefinedBindingValue;
      };

      const isDefinitelyNonBindingSource = (source: BindingValue): boolean => {
        if (source.presence === "definitely-undefined") return true;
        if (!source.expression) return false;
        const expression = unwrapTransparentExpression(source.expression);
        return expression.kind === ts.SyntaxKind.NullKeyword
          || ts.isVoidExpression(expression)
          || (ts.isIdentifier(expression) && expression.text === "undefined");
      };

      const visitBindingDefaults = (
        name: ts.BindingName,
        source: BindingValue,
        scopes: readonly CallableScope[],
      ) => {
        if (ts.isIdentifier(name) || isDefinitelyNonBindingSource(source)) return;
        for (const [index, candidate] of name.elements.entries()) {
          if (!ts.isBindingElement(candidate) || candidate.dotDotDotToken) continue;
          const value = ts.isObjectBindingPattern(name)
            ? objectBindingValue(source, candidate)
            : arrayBindingValue(source, index);
          const defaultMayExecute = value.presence !== "definitely-defined";
          const suppliedValueMayBeSelected = value.presence !== "definitely-undefined";
          if (candidate.initializer && defaultMayExecute) {
            visit(candidate.initializer, scopes);
          }
          if (ts.isIdentifier(candidate.name)) continue;
          if (suppliedValueMayBeSelected) {
            visitBindingDefaults(candidate.name, value, scopes);
          }
          if (candidate.initializer && defaultMayExecute) {
            visitBindingDefaults(
              candidate.name,
              bindingValueFromExpression(candidate.initializer),
              scopes,
            );
          }
        }
      };

      function visit(candidate: ts.Node, scopes: readonly CallableScope[] = []) {
        if (ts.isCallExpression(candidate)) {
          const invoked = unwrapTransparentExpression(candidate.expression);
          if (ts.isArrowFunction(invoked) || ts.isFunctionExpression(invoked)) {
            for (const argument of candidate.arguments) visit(argument, scopes);
            execute(invoked, candidate.arguments, scopes);
            return;
          }
          if (ts.isIdentifier(invoked)) {
            const local = resolveLocalCallable(invoked.text, scopes);
            if (local.found) {
              for (const argument of candidate.arguments) visit(argument, scopes);
              if (local.callable) execute(local.callable, candidate.arguments, scopes);
              return;
            }
          }
          visit(candidate.expression, scopes);
          for (const argument of candidate.arguments) visit(argument, scopes);
          return;
        }
        if (ts.isTypeNode(candidate)
          || ts.isArrowFunction(candidate)
          || ts.isFunctionExpression(candidate)
          || ts.isFunctionDeclaration(candidate)
          || ts.isClassDeclaration(candidate)
          || ts.isClassExpression(candidate)
          || ts.isMethodDeclaration(candidate)
          || ts.isGetAccessorDeclaration(candidate)
          || ts.isSetAccessorDeclaration(candidate)
          || ts.isConstructorDeclaration(candidate)) {
          return;
        }
        if (ts.isVariableDeclaration(candidate)) {
          if (candidate.initializer) {
            visit(candidate.initializer, scopes);
            visitBindingDefaults(
              candidate.name,
              bindingValueFromExpression(candidate.initializer),
              scopes,
            );
          }
          return;
        }
        if (ts.isIdentifier(candidate)) {
          const local = resolveLocalCallable(candidate.text, scopes);
          if (local.found) return;
        }
        if (ts.isPropertyAccessExpression(candidate) && ts.isIdentifier(candidate.expression)) {
          const binding = imports.get(candidate.expression.text);
          if (binding?.importedName === "*") {
            addSymbolEdge(edges, from, exportedSymbol(binding.providerPath, candidate.name.text));
          }
        } else if (ts.isIdentifier(candidate)) {
          const binding = imports.get(candidate.text);
          if (binding && binding.importedName !== "*") {
            addSymbolEdge(edges, from, exportedSymbol(binding.providerPath, binding.importedName));
          } else if (declarations.has(candidate.text)) {
            addSymbolEdge(edges, from, localSymbol(path, candidate.text));
            addSymbolEdge(writeEdges, from, localSymbol(path, candidate.text));
          }
        }
        ts.forEachChild(candidate, (child) => visit(child, scopes));
      }

      const execute = (
        callable: EagerRuntimeFunction,
        arguments_: readonly ts.Expression[],
        outerScopes: readonly CallableScope[],
      ) => {
        if (!callable.body || isGeneratorRuntimeFunction(callable) || activeCalls.has(callable)) return;
        const localScope = collectCallableScope(callable);
        const scopes = [localScope, ...outerScopes];
        for (const [index, parameter] of callable.parameters.entries()) {
          const argument = arguments_[index];
          const defaultMayExecute = Boolean(parameter.initializer)
            && (!argument || !isDefinitelyNonUndefinedExpression(argument));
          if (parameter.initializer && defaultMayExecute) {
            visit(parameter.initializer, scopes);
          }
          if (ts.isIdentifier(parameter.name)) continue;
          if (argument) {
            visitBindingDefaults(parameter.name, bindingValueFromExpression(argument), scopes);
          }
          if (parameter.initializer && defaultMayExecute) {
            visitBindingDefaults(
              parameter.name,
              bindingValueFromExpression(parameter.initializer),
              scopes,
            );
          }
        }
        if (executedBodies.has(callable)) return;
        executedBodies.add(callable);
        activeCalls.add(callable);
        visit(callable.body, scopes);
        activeCalls.delete(callable);
      };

      visit(root);
    };

    for (const [name, declaration] of declarations) {
      const from = localSymbol(path, name);
      if (HTTP_WRITE_METHOD_PATTERN.test(declaration.getText(sourceFile))
        || (EXPORTED_WRITE_VERB_PATH.test(path) && new RegExp(`^${WRITE_VERB}(?:[A-Z]|$)`).test(name))) {
        baseWrites.add(from);
      }
      addRuntimeReferences(from, declaration, name);
    }

    if (moduleExecutionStatements.length > 0 || eagerVariableDeclarations.length > 0) {
      const moduleExecution = localSymbol(path, MODULE_EXECUTION_SYMBOL);
      executableRoots.add(moduleExecution);
      for (const statement of moduleExecutionStatements) {
        addEagerRuntimeReferences(moduleExecution, statement);
      }
      for (const declaration of eagerVariableDeclarations) {
        addEagerRuntimeReferences(moduleExecution, declaration);
      }
    }

    for (const statement of sourceFile.statements) {
      if ((ts.isFunctionDeclaration(statement) || ts.isVariableStatement(statement)) && exportedModifier(statement)) {
        if (ts.isFunctionDeclaration(statement)) {
          const localName = statement.name?.text ?? DEFAULT_EXPORT_LOCAL_SYMBOL;
          const exportedName = defaultModifier(statement) ? "default" : statement.name?.text;
          if (!exportedName) continue;
          pathExports.add(exportedName);
          const exported = exportedSymbol(path, exportedName);
          executableRoots.add(exported);
          addSymbolEdge(edges, exported, localSymbol(path, localName));
          addSymbolEdge(writeEdges, exported, localSymbol(path, localName));
        } else if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name)) continue;
            pathExports.add(declaration.name.text);
            const exported = exportedSymbol(path, declaration.name.text);
            executableRoots.add(exported);
            addSymbolEdge(edges, exported, localSymbol(path, declaration.name.text));
            addSymbolEdge(writeEdges, exported, localSymbol(path, declaration.name.text));
          }
        }
      }
      if (!ts.isExportDeclaration(statement)) continue;
      if (statement.isTypeOnly) continue;
      const providerPath = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? resolveProductionImport(path, statement.moduleSpecifier.text, sources)
        : null;
      if (!statement.exportClause) {
        if (providerPath) starExports.push({ path, providerPath });
        continue;
      }
      if (!ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        const exportedName = element.name.text;
        const sourceName = element.propertyName?.text ?? exportedName;
        pathExports.add(exportedName);
        const target = providerPath ? exportedSymbol(providerPath, sourceName) : localSymbol(path, sourceName);
        const exported = exportedSymbol(path, exportedName);
        if (!providerPath) executableRoots.add(exported);
        addSymbolEdge(edges, exported, target);
        addSymbolEdge(writeEdges, exported, target);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const { path, providerPath } of starExports) {
      const targetExports = exportsByPath.get(path) ?? new Set<string>();
      exportsByPath.set(path, targetExports);
      for (const name of exportsByPath.get(providerPath) ?? []) {
        if (!targetExports.has(name)) {
          targetExports.add(name);
          changed = true;
        }
        addSymbolEdge(edges, exportedSymbol(path, name), exportedSymbol(providerPath, name));
        addSymbolEdge(writeEdges, exportedSymbol(path, name), exportedSymbol(providerPath, name));
      }
    }
  }

  return { edges, writeEdges, exportsByPath, localsByPath, executableRootsByPath, baseWrites };
}

function symbolReaches(
  graph: ProductionSymbolGraph,
  starts: Iterable<string>,
  targets: ReadonlySet<string>,
  edges: ReadonlyMap<string, ReadonlySet<string>> = graph.edges,
  blockedPaths: ReadonlySet<string> = new Set(),
  rootPath?: string,
): boolean {
  const pending = [...starts];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (targets.has(current)) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const separator = current.includes("::") ? "::" : "#";
    const currentPath = current.slice(0, current.indexOf(separator));
    if (currentPath !== rootPath && blockedPaths.has(currentPath)) continue;
    for (const next of edges.get(current) ?? []) pending.push(next);
  }
  return false;
}

function symbolPath(symbol: string): string {
  const localSeparator = symbol.indexOf("::");
  const exportSeparator = symbol.indexOf("#");
  const separator = localSeparator >= 0 ? localSeparator : exportSeparator;
  return separator >= 0 ? symbol.slice(0, separator) : symbol;
}

function collectReachableSymbols(
  starts: Iterable<string>,
  edges: ReadonlyMap<string, ReadonlySet<string>>,
  blockedPaths: ReadonlySet<string>,
  rootPath: string,
): Set<string> {
  const pending = [...starts];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const currentPath = symbolPath(current);
    if (currentPath !== rootPath && blockedPaths.has(currentPath)) continue;
    for (const next of edges.get(current) ?? []) pending.push(next);
  }
  return seen;
}

export function detectExportedWriteSymbols(sources: ReadonlyMap<string, string>): string[] {
  const graph = analyzeProductionSymbolGraph(sources);
  const exportedWrites: string[] = [];
  for (const [path, names] of graph.exportsByPath) {
    for (const name of names) {
      const symbol = exportedSymbol(path, name);
      if (symbolReaches(graph, [symbol], graph.baseWrites, graph.writeEdges)) exportedWrites.push(symbol);
    }
  }
  return exportedWrites.sort();
}

function runtimeImportSpecifiers(path: string, source: string): string[] {
  const specifiers = new Set<string>();
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      const hasRuntimeBinding = !clause
        || (!clause.isTypeOnly && (Boolean(clause.name)
          || Boolean(clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
          || Boolean(clause.namedBindings
            && ts.isNamedImports(clause.namedBindings)
            && clause.namedBindings.elements.some((element) => !element.isTypeOnly))));
      if (hasRuntimeBinding) specifiers.add(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement)
      && !statement.isTypeOnly
      && statement.moduleSpecifier
      && ts.isStringLiteral(statement.moduleSpecifier)) {
      const hasRuntimeBinding = !statement.exportClause
        || !ts.isNamedExports(statement.exportClause)
        || statement.exportClause.elements.some((element) => !element.isTypeOnly);
      if (hasRuntimeBinding) specifiers.add(statement.moduleSpecifier.text);
    }
  }

  const visitDynamicImports = (node: ts.Node) => {
    if (ts.isImportTypeNode(node) || ts.isTypeNode(node)) return;
    if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visitDynamicImports);
  };
  visitDynamicImports(sourceFile);

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
    for (const specifier of runtimeImportSpecifiers(path, sources.get(path) ?? "")) {
      const resolved = resolveProductionImport(path, specifier, sources);
      if (resolved && !mounted.has(resolved)) pending.push(resolved);
    }
  }
  return new Set([...mounted].sort());
}

type MountedConsumerViolations = {
  unclassifiedPaths: string[];
  missingOwnerPairs: string[];
};

function classifiedWriteTargets(
  candidate: MutationProducerClassification,
  symbolGraph: ProductionSymbolGraph,
): string[] {
  const names = new Set([
    ...(candidate.exportName ? [candidate.exportName] : []),
    ...(candidate.exportNames ?? []),
  ]);
  if (names.size === 0) {
    for (const name of symbolGraph.exportsByPath.get(candidate.path) ?? []) names.add(name);
  }
  return [...names].map((name) => exportedSymbol(candidate.path, name));
}

function detectMountedConsumerViolations(
  symbolGraph: ProductionSymbolGraph,
  mountedPaths: ReadonlySet<string>,
  inventory: readonly MutationProducerClassification[],
  ownershipBoundaryPaths: ReadonlySet<string>,
): MountedConsumerViolations {
  const inventoryPaths = new Set(inventory.map((candidate) => candidate.path));
  const registeringPaths = new Set(inventory
    .filter((candidate) => candidate.classification === "register")
    .map((candidate) => candidate.path));
  const unclassifiedPaths = new Set<string>();
  const missingOwnerPairs = new Set<string>();

  for (const candidate of inventory) {
    if (candidate.classification !== "modify") continue;
    for (const target of classifiedWriteTargets(candidate, symbolGraph)) {
      const targetSet = new Set([target]);
      const ownerCoveredSymbols = new Set<string>();

      // A helper on a declared owner's chain is covered; a separate mounted
      // boundary reaching the same write symbol is an independent consumer.
      for (const ownerPath of candidate.ownerPaths) {
        if (!mountedPaths.has(ownerPath) || !registeringPaths.has(ownerPath)) continue;
        const ownerStarts = symbolGraph.executableRootsByPath.get(ownerPath) ?? [];
        if (!symbolReaches(
          symbolGraph,
          ownerStarts,
          targetSet,
          symbolGraph.edges,
          ownershipBoundaryPaths,
          ownerPath,
        )) continue;
        for (const symbol of collectReachableSymbols(
          ownerStarts,
          symbolGraph.edges,
          ownershipBoundaryPaths,
          ownerPath,
        )) {
          ownerCoveredSymbols.add(symbol);
        }
      }

      for (const [consumerPath, consumerStarts] of symbolGraph.executableRootsByPath) {
        if (!mountedPaths.has(consumerPath) || consumerPath === candidate.path) continue;
        const isRegisteringBoundary = registeringPaths.has(consumerPath);
        const isUnclassifiedBoundary = !inventoryPaths.has(consumerPath);
        if (!isRegisteringBoundary && !isUnclassifiedBoundary) continue;
        const hasUncoveredConsumer = [...consumerStarts]
          .some((symbol) => !ownerCoveredSymbols.has(symbol) && symbolReaches(
            symbolGraph,
            [symbol],
            targetSet,
            symbolGraph.edges,
            ownershipBoundaryPaths,
            consumerPath,
          ));
        if (!hasUncoveredConsumer) continue;

        if (!candidate.ownerPaths.includes(consumerPath)) {
          missingOwnerPairs.add(`${candidate.path}->${consumerPath}`);
        }
        if (isUnclassifiedBoundary) unclassifiedPaths.add(consumerPath);
      }
    }
  }

  return {
    unclassifiedPaths: [...unclassifiedPaths].sort(),
    missingOwnerPairs: [...missingOwnerPairs].sort(),
  };
}

export function auditMutationProducerInventory(
  sources: ReadonlyMap<string, string>,
  mountedPaths: ReadonlySet<string>,
  inventory: readonly MutationProducerClassification[] = SPACE_TRANSITION_PRODUCER_INVENTORY,
): ProducerInventoryAudit {
  const symbolGraph = analyzeProductionSymbolGraph(sources);
  const ownershipBoundaryPaths = new Set(inventory
    .filter((candidate) => candidate.classification === "register" || candidate.classification === "verified-no-change")
    .map((candidate) => candidate.path));
  const inventoryPaths = new Set(inventory.map((candidate) => candidate.path));
  const mountedConsumerViolations = detectMountedConsumerViolations(
    symbolGraph,
    mountedPaths,
    inventory,
    ownershipBoundaryPaths,
  );
  const inventoryExportedWrites = new Set(inventory.flatMap((candidate) => [
    ...(candidate.exportName ? [`${candidate.path}#${candidate.exportName}`] : []),
    ...(candidate.exportNames ?? []).map((exportName) => `${candidate.path}#${exportName}`),
  ]));
  return {
    unclassifiedPaths: [...new Set([
      ...detectMutationProducerPaths(sources).filter((path) => !inventoryPaths.has(path)),
      ...mountedConsumerViolations.unclassifiedPaths,
    ])].sort(),
    unclassifiedExportedWrites: detectExportedWriteSymbols(sources)
      .filter((symbol) => !inventoryExportedWrites.has(symbol)),
    unreachableExportsWithMountedImports: inventory.filter((candidate) => candidate.classification === "out-of-domain" && mountedPaths.has(candidate.path)).map((candidate) => `${candidate.path}#${candidate.exportName ?? "*"}`),
    modifyEntriesWithoutMountedOwner: inventory.filter((candidate) => candidate.classification === "modify" && !candidate.ownerPaths.some((owner) => mountedPaths.has(owner))).map((candidate) => candidate.path),
    modifyEntriesWithMissingMountedOwners: mountedConsumerViolations.missingOwnerPairs,
    verifiedLeavesWithForbiddenPublication: inventory.filter((candidate) => candidate.classification === "verified-no-change" && /^(?:features\/[^/]+\/.*\/ui\/|features\/[^/]+\/ui\/)/.test(candidate.path) && FORBIDDEN_LEAF_PATTERN.test(sources.get(candidate.path) ?? "")).map((candidate) => candidate.path),
  };
}
