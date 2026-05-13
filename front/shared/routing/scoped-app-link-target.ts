function appBasePath(pathname: string) {
  const match = /^\/clubs\/([^/]+)\/app(?:\/|$)/.exec(pathname);
  return match ? `/clubs/${encodeURIComponent(match[1])}/app` : "";
}

function clubBasePath(pathname: string) {
  const match = /^\/clubs\/([^/]+)(?:\/|$)/.exec(pathname);
  return match ? `/clubs/${encodeURIComponent(match[1])}` : "";
}

export function scopedAppLinkTarget(pathname: string, to: string) {
  const basePath = appBasePath(pathname);

  if (!basePath || (to !== "/app" && !to.startsWith("/app/") && !to.startsWith("/app?") && !to.startsWith("/app#"))) {
    return to;
  }

  return `${basePath}${to === "/app" ? "" : to.replace(/^\/app/, "")}`;
}

export function scopedPublicLinkTarget(pathname: string, to: string) {
  const basePath = clubBasePath(pathname);

  if (
    !basePath ||
    (to !== "/" && to !== "/about" && to !== "/records" && !to.startsWith("/sessions/"))
  ) {
    return to;
  }

  return `${basePath}${to === "/" ? "" : to}`;
}
