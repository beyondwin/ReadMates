export function logout() {
  return fetch("/api/bff/api/auth/logout", { method: "POST" });
}
