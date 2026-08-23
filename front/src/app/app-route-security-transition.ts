import type { ClubWorkspace } from "@/shared/model/app-club-shell";

const pendingWorkspaceTransitionKey = "readmates:pending-workspace-transition";

export function requestWorkspaceTransition(workspace: ClubWorkspace) {
  try {
    window.sessionStorage.setItem(pendingWorkspaceTransitionKey, workspace);
  } catch {
    // The route remains usable when storage is unavailable; same-layout transitions still announce.
  }
}

export function consumeWorkspaceTransition(workspace: ClubWorkspace) {
  try {
    if (window.sessionStorage.getItem(pendingWorkspaceTransitionKey) !== workspace) {
      return false;
    }
    window.sessionStorage.removeItem(pendingWorkspaceTransitionKey);
    return true;
  } catch {
    return false;
  }
}
