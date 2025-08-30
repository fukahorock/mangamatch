// functions/auth/index.mjs
// Discord OAuth2 認証（最小実装）: /api/auth/login, /api/auth/callback, /api/auth/me, /api/auth/logout
// - セッションは HMAC 署名トークンを HttpOnly Cookie に保存（JWTライブラリ不要）
// - まずは login-test.html での検証用に、成功後は /frontend/login-test.html へ 302 で戻す

import crypto from "crypto";

// ====== 環境変数 ======
const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  ALLOWLIST_IDS = "",
  SESSION_SECRET,
  BASE_URL, // 例: https://mm.rock54.net
} = process.env;

// ====== Discord エンドポイント ======
const OAUTH_AUTHORIZE = "https://discord.com/oauth2/authorize";
const OAUTH_TOKEN = "https://discord.com/api/oauth2/token";
const API_ME = "https://discord.com/api/users/@me";

// ====== Allowlist ======
const allow = new Set(
  ALLOWLIST_IDS.split(",").map((s) => s.trim()).filter(Boolean)
);

// ====== 共通ユーティリティ ======
const ORIGIN = BASE_URL || "*";

const json = (status, data, extraHeaders = {}) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    ...extraHeaders,
  },
  body: JSON.stringify(data),
});

const redirect = (location, cookies = []) => ({
  statusCode: 302,
  headers: {
    Location: location,
    "Set-Cookie": cookies,
  },
  body: "",
});

const setCookie = (
  key,
  val,
  { maxAge = 0, httpOnly = true, secure = true, path = "/", sameSite = "Lax" } = {}
) => {
  let c = `${key}=${val}; Path=${path}; SameSite=${sameSite};`;
  if (httpOnly) c += " HttpOnly;";
  if (secure) c += " Secure;";
  if (maxAge) c += ` Max-Age=${maxAge};`;
  return c;
};

const clearCookie = (key) => setCookie(key, "", { maxAge: 0 });

// HMAC 署名（セッション & state用）
const hmac = (s) => crypto.createHmac("sha256", SESSION_SECRET).update(s).digest("hex");

// 署名付きセッション：{sub, name, av, exp} を base64url + HMAC
const makeSession = (payload, ttlSec = 7 * 24 * 3600) => {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  const sig = hmac(body);
  return `${body}.${sig}`;
};

const readSession = (token) => {
  const [body, sig] = (token || "").split(".");
  if (!body || hmac(body) !== sig) throw new Error("bad_sig");
  const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (data.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
  return data;
};

// ====== Discord API ======
async function tokenByCode(code) {
  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: DISCORD_REDIRECT_URI,
    scope: "identify",
  });
  const r = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`token_failed_${r.status}:${txt}`);
  }
  return r.json();
}

async function discordMe(accessToken, tokenType = "Bearer") {
  const r = await fetch(API_ME, { headers: { Authorization: `${tokenType} ${accessToken}` } });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`me_failed_${r.status}:${txt}`);
  }
  return r.json();
}

// ====== Lambda Handler ======
export const handler = async (event) => {
  const path = event.rawPath || event.requestContext?.http?.path || "";
  const method = event.requestContext?.http?.method || "GET";
  const q = event.queryStringParameters || {};
  const cookies = Object.fromEntries(
    (event.cookies || []).map((c) => {
      const [k, ...v] = c.split("=");
      return [k, v.join("=")];
    })
  );

  try {
    // --- /api/auth/login ---
    if (path.endsWith("/api/auth/login")) {
      const state = crypto.randomBytes(8).toString("hex");
      const signedState = `${state}.${hmac(state)}`;
      const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        response_type: "code",
        redirect_uri: DISCORD_REDIRECT_URI,
        scope: "identify",
        state,
      });
      // 5分だけ有効な state Cookie
      return redirect(`${OAUTH_AUTHORIZE}?${params}`, [
        setCookie("mm_state", signedState, { maxAge: 300 }),
      ]);
    }

    // --- /api/auth/callback ---
    if (path.endsWith("/api/auth/callback")) {
      const { code, state } = q;
      if (!code || !state) return json(400, { error: "missing_code_or_state" });

      // state 検証（CSRF対策）
      const saved = cookies["mm_state"];
      if (!saved) return json(400, { error: "state_missing" });
      const [raw, sig] = saved.split(".");
      if (hmac(raw) !== sig || raw !== state) return json(400, { error: "bad_state" });

      // トークン & ユーザー情報
      const t = await tokenByCode(code);
      const me = await discordMe(t.access_token, t.token_type);

      // Allowlist 判定
      if (!allow.has(me.id)) {
        console.log("DENY", me.id, me.username, me.global_name);
        // 許可外: セッションは発行せず、テストページに戻す
        return redirect(`${BASE_URL || "/"}/`, [
          clearCookie("mm_state"),
        ]);
      }

      // セッション発行（7日）
      const sess = makeSession({
        sub: me.id,
        name: me.global_name || me.username,
        av: me.avatar || "",
      });
      console.log("LOGIN", me.id, me.username, me.global_name);

      // テストがしやすいよう、成功後は login-test.html に戻す
      return redirect(`${BASE_URL || "/"}/`, [
        setCookie("mm_session", sess, { maxAge: 7 * 24 * 3600 }),
        clearCookie("mm_state"),
      ]);
      
    }

    // --- /api/auth/me ---
    if (path.endsWith("/api/auth/me")) {
      try {
        const s = readSession(cookies["mm_session"]);
        const avatar = s.av
          ? `https://cdn.discordapp.com/avatars/${s.sub}/${s.av}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/0.png`;
        return json(200, {
          authenticated: true,
          user: { id: s.sub, name: s.name, avatar },
        });
      } catch {
        return json(401, { authenticated: false });
      }
    }

    // --- /api/auth/logout ---
    if (path.endsWith("/api/auth/logout") && method === "POST") {
      return json(200, { ok: true }, { "Set-Cookie": clearCookie("mm_session") });
    }

    // Not Found
    return json(404, { error: "not_found" });
  } catch (e) {
    console.log("auth_err", e?.message || e);
    return json(500, { error: "server_error" });
  }
};
