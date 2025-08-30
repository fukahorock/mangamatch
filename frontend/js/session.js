export async function getSession() {
  try {
    const r = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
    if (!r.ok) return { authenticated: false };
    return await r.json();
  } catch { return { authenticated: false }; }
}
export async function requireAuth() {
  const s = await getSession();
  if (!s.authenticated) { location.replace("/login"); throw new Error("unauthenticated"); }
  return s;
}
export async function redirectIfAuthenticated() {
  const s = await getSession();
  if (s.authenticated) location.replace("/app");
}
export function gotoLogin()  { location.href = "/api/auth/login"; }
export function gotoLogout() { location.href = "/api/auth/logout"; }
