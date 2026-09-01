import type { ClubPerspective } from "@/shared/model/global-space";

function lastSafeWorkspaceTargetKey(workspace: ClubPerspective) {
  return `readmates:last-safe-workspace-target:${workspace}`;
}

export function readLastSafeWorkspaceTarget(workspace: ClubPerspective) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage.getItem(lastSafeWorkspaceTargetKey(workspace));
  } catch {
    return null;
  }
}

export function rememberLastSafeWorkspaceTarget(workspace: ClubPerspective, pathname: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(lastSafeWorkspaceTargetKey(workspace), pathname);
  } catch {
    // Storage is optional navigation continuity only; pathname remains render authority.
  }
}
