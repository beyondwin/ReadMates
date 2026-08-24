import type { ClubWorkspace } from "./workspace-route-model";

function lastSafeWorkspaceTargetKey(workspace: ClubWorkspace) {
  return `readmates:last-safe-workspace-target:${workspace}`;
}

export function readLastSafeWorkspaceTarget(workspace: ClubWorkspace) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage.getItem(lastSafeWorkspaceTargetKey(workspace));
  } catch {
    return null;
  }
}

export function rememberLastSafeWorkspaceTarget(workspace: ClubWorkspace, pathname: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(lastSafeWorkspaceTargetKey(workspace), pathname);
  } catch {
    // Storage is optional navigation continuity only; pathname remains render authority.
  }
}
