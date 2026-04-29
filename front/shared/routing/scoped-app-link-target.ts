function appBasePath(pathname: string) {
  const match = /^\/clubs\/([^/]+)\/app(?:\/|$)/.exec(pathname);
  return match ? `/clubs/${encodeURIComponent(match[1])}/app` : "";
}

export function scopedAppLinkTarget(pathname: string, to: string) {
  const basePath = appBasePath(pathname);

  if (!basePath || (to !== "/app" && !to.startsWith("/app/") && !to.startsWith("/app?") && !to.startsWith("/app#"))) {
    return to;
  }

  return `${basePath}${to === "/app" ? "" : to.replace(/^\/app/, "")}`;
}
