// Node.js 18/20 で動作。Discord OAuth → Cookie セッション発行まで。
// /api/auth/login へ遷移 → Discord同意画面 → /api/auth/callback → "/"へ302

import crypto from "node:crypto";

const BASE_URL = process.env.BASE_URL || "https://mm.rock54.net";
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI || `${BASE_URL}/api/auth/callback`;

type Resp = {
  statusCode: number;
  headers?: Record<string, string>;
  cookies?: string[]; // Amplify Functions で複数 Set-Cookie を返す
  body?: string;
};

const TEXT = { "content-type": "text/plain; charset=utf-8" };

const respond = (
  statusCode: number,
  headers: Record<string, string> = {},
  body = "",
  cookies: string[] = []
): Resp => ({ statusCode, headers, body, cookies });

const redirect = (location: string, cookies: string[] = []): Resp =>
  respond(302, { Location: location }, "", cookies);

function parseCookies(event: any): Record<string, string> {
  const arr: string[] = event.cookies || [];
  const map: Record<string, string> = {};
  for (const c of arr) {
    const [k, ...rest] = c.split("=");
    map[k.trim()] = (rest.join("=") || "").split(";")[0];
  }
  return map;
}

function buildAuthorizeURL(state: string) {
  const p = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify email",
    prompt: "consent",
    state,
  });
  return `https://discord.com/oauth2/authorize?${p.toString()}`;
}

export const handler = async (event: any): Promise<Resp> => {
  const path = event.rawPath || event.path || "";
  const qs = new URLSearchParams(event.rawQueryString || "");
  const cookies = parseCookies(event);

  try {
    // 1) ログイン開始: Discordへ302 + CSRF対策stateをCookieへ
    if (path.endsWith("/api/auth/login")) {
      const state = crypto.randomUUID();
      const stateCookie = [
        `mm_oauth_state=${state}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Max-Age=600", // 10分
      ].join("; ");
      return redirect(buildAuthorizeURL(state), [stateCookie]);
    }

    // 2) コールバック: code交換→ユーザー取得→セッションCookie→"/"へ302
    if (path.endsWith("/api/auth/callback")) {
      const code = qs.get("code");
      const state = qs.get("state");
      if (!code) return respond(400, TEXT, "Missing ?code");
      if (!state || cookies.mm_oauth_state !== state) {
        return respond(400, TEXT, "Invalid state");
      }

      const body = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      });

      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        return respond(502, TEXT, `Token exchange failed: ${text}`);
      }
      const token = await tokenRes.json();

      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!userRes.ok) {
        const t = await userRes.text();
        return respond(502, TEXT, `Userinfo failed: ${t}`);
      }
      const user = await userRes.json();

      const sess = encodeURIComponent(
        JSON.stringify({ id: user.id, username: user.username })
      );
      const sessionCookie = [
        `mm_session=${sess}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Max-Age=86400", // 1日
      ].join("; ");
      const clearState =
        "mm_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

      return redirect("/", [sessionCookie, clearState]);
    }

    // 3) ログアウト: セッションクリア
    if (path.endsWith("/api/auth/logout")) {
      const del =
        "mm_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
      return redirect("/", [del]);
    }

    return respond(404, TEXT, "Not Found");
  } catch (e) {
    console.error(e);
    return respond(500, TEXT, "Internal Error");
  }
};
