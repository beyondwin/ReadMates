import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import type { ClubWorkspace } from "@/shared/model/app-club-shell";
import {
  consumePreparedWorkspaceTransition,
  prepareWorkspaceRoute,
  type WorkspaceRouteTransitionStore,
} from "@/src/app/app-route-security-transition";
import { hostAuthorityLossMessage, type HostSecurityPurgeCode } from "@/features/host/model/host-authority-loss";
import { HostAuthorityLossController } from "./host-authority-loss-controller";

const workspaceLabels: Record<ClubWorkspace, string> = {
  member: "멤버 공간",
  host: "호스트 공간",
};

function clubScope(pathname: string) {
  return /^(\/clubs\/[^/]+\/app)(?:\/|$)/.exec(pathname)?.[1] ?? "/app";
}

function workspaceTitle(workspace: ClubWorkspace, currentTitle: string) {
  const baseTitle = currentTitle
    .replace(/^(?:(?:멤버|호스트) 공간 · )+/u, "")
    .trim();
  return `${workspaceLabels[workspace]} · ${baseTitle || "읽는사이"}`;
}

const defaultTransitionStore: WorkspaceRouteTransitionStore = {
  prepare: prepareWorkspaceRoute,
  consume: consumePreparedWorkspaceTransition,
};

export function AppRouteSecurityController({
  workspace,
  transitionStore = defaultTransitionStore,
}: {
  workspace: ClubWorkspace;
  transitionStore?: WorkspaceRouteTransitionStore;
}) {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState("");
  const authorityAnnouncementRef = useRef<string | null>(null);
  const handleAuthorityLoss = useCallback((code: HostSecurityPurgeCode) => {
    const message = hostAuthorityLossMessage(code);
    authorityAnnouncementRef.current = message;
    setAnnouncement(message);
  }, []);

  useEffect(() => {
    const href = `${location.pathname}${location.search}${location.hash}`;
    const currentRoute = {
      workspace,
      clubScope: clubScope(location.pathname),
      href,
      locationKey: location.key,
    };
    const changedWorkspace = transitionStore.prepare(currentRoute);
    const label = workspaceLabels[workspace];
    document.title = workspaceTitle(workspace, document.title);

    const finishRouteTransition = () => {
      const shouldAnnounce = changedWorkspace
        && transitionStore.consume(currentRoute);
      const authorityAnnouncement = authorityAnnouncementRef.current;
      authorityAnnouncementRef.current = null;
      setAnnouncement(authorityAnnouncement ?? (shouldAnnounce ? `${label}으로 전환했습니다` : ""));
      const heading = document.querySelector<HTMLElement>("main h1, h1");
      if (!heading) {
        return;
      }
      if (!heading.hasAttribute("tabindex")) {
        heading.setAttribute("tabindex", "-1");
      }
      heading.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(finishRouteTransition);
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, location.key, location.pathname, location.search, transitionStore, workspace]);

  return (
    <div data-app-route-security-controller>
      <HostAuthorityLossController onHandled={handleAuthorityLoss} />
      {announcement ? (
        <span className="rm-sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>
      ) : null}
    </div>
  );
}
