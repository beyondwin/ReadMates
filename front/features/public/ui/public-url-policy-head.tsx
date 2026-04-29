import { useEffect } from "react";
import { buildCanonicalUrl, publicClubSlugFromPath, shouldNoIndex } from "@/features/public/model/public-url-policy";

type PublicUrlPolicyHeadProps = {
  clubSlug?: string;
  primaryDomain?: string;
  host?: string;
  path?: string;
};

function readPrimaryDomain(primaryDomain?: string) {
  const configured =
    primaryDomain ??
    import.meta.env.VITE_PUBLIC_PRIMARY_DOMAIN ??
    import.meta.env.NEXT_PUBLIC_PRIMARY_DOMAIN;

  return typeof configured === "string" && configured.trim() ? configured.trim() : null;
}

function inferPrimaryDomain(host: string, clubSlug?: string) {
  if (!clubSlug) {
    return null;
  }

  const hostname = host.toLowerCase();
  const prefix = `${clubSlug.toLowerCase()}.`;

  return hostname.startsWith(prefix) ? hostname.slice(prefix.length) : null;
}

function upsertCanonical(href: string) {
  const link = document.createElement("link");
  link.rel = "canonical";
  link.href = href;
  link.dataset.readmatesPublicHead = "canonical";
  document.head.append(link);

  return link;
}

function upsertNoIndex() {
  const meta = document.createElement("meta");
  meta.name = "robots";
  meta.content = "noindex";
  meta.dataset.readmatesPublicHead = "robots";
  document.head.append(meta);

  return meta;
}

function removeManagedPublicHeadNodes() {
  document.querySelectorAll("[data-readmates-public-head]").forEach((node) => node.remove());
}

export function PublicUrlPolicyHead({ clubSlug, primaryDomain, host, path }: PublicUrlPolicyHeadProps) {
  useEffect(() => {
    const currentHost = host ?? window.location.host;
    const currentPath = path ?? window.location.pathname;
    const resolvedClubSlug = clubSlug ?? publicClubSlugFromPath(currentPath);
    const domain = readPrimaryDomain(primaryDomain) ?? inferPrimaryDomain(window.location.hostname, resolvedClubSlug ?? undefined);
    const nodes: HTMLElement[] = [];

    removeManagedPublicHeadNodes();

    if (resolvedClubSlug && domain) {
      nodes.push(
        upsertCanonical(
          buildCanonicalUrl({
            host: currentHost,
            clubSlug: resolvedClubSlug,
            path: currentPath,
            primaryDomain: domain,
          }),
        ),
      );
    }

    if (shouldNoIndex(currentHost)) {
      nodes.push(upsertNoIndex());
    }

    return () => {
      for (const node of nodes) {
        node.remove();
      }
    };
  }, [clubSlug, host, path, primaryDomain]);

  return null;
}
