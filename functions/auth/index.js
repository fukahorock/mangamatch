// Node.js 18, ESM
import crypto from "crypto";

const {
  DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI,
  ALLOWLIST_IDS = "", SESSION_SECRET, BASE_URL
} = process.env;

const OAUTH_AUTHORIZE = "https://discord.com/oauth2/authorize";
const OAUTH_TOKEN = "https://discord.com/api/oauth2/token";
const API_ME = "https://discord.com/api/users/@me";
const allow = new Set(ALLOWLIST_IDS.split(",").map(s => s.trim()).filter(Boolean));

const json = (code, data) => ({
  statusCode: code,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": BASE_URL || "*",
    "Access-Control-Allow-Credentials": "true"
  },
  body: JSON.stringify(data)
});
const redirect = (loc, cookies=[]) => ({ statusCode:302, headers:{ Location: loc, "Set-Cookie": cookies }, body:"" });

const setCookie=(k,v,{maxAge=0,httpOnly=true,secure=true,path="/",sameSite="Lax"}={}) =>
  `${k}=${v}; Path=${path}; SameSite=${sameSite};${httpOnly?" HttpOnly;":""}${secure?" Secure;":""}${maxAge?` Max-Age=${maxAge};`:""}`;
const clearCookie=(k)=>setCookie(k,"",{maxAge:0});
const hmac=(s)=>crypto.createHmac("sha256",SESSION_SECRET).update(s).digest("hex");
const mkSess=(payload,ttl=7*24*3600)=>{
  const exp=Math.floor(Date.now()/1000)+ttl;
  const body=Buffer.from(JSON.stringify({...payload,exp})).toString("base64url");
  const sig=hmac(body); return `${body}.${sig}`;
};
const readSess=(tok)=>{
  const [b,s]=(tok||"").split(".");
  if(!b || hmac(b)!==s) throw new Error("bad");
  const data=JSON.parse(Buffer.from(b,"base64url").toString("utf8"));
  if(data.exp < Math.floor(Date.now()/1000)) throw new Error("exp");
  return data;
};
async function tokenByCode(code){
  const body=new URLSearchParams({
    client_id:DISCORD_CLIENT_ID, client_secret:DISCORD_CLIENT_SECRET,
    grant_type:"authorization_code", code, redirect_uri:DISCORD_REDIRECT_URI, scope:"identify"
  });
  const r=await fetch(OAUTH_TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  if(!r.ok) throw new Error("token_failed");
  return r.json();
}
async function discordMe(at,type="Bearer"){
  const r=await fetch(API_ME,{headers:{Authorization:`${type} ${at}`}});
  if(!r.ok) throw new Error("me_failed");
  return r.json();
}

export const handler = async (event)=>{
  const path = event.rawPath || event.requestContext?.http?.path || "";
  const method = event.requestContext?.http?.method || "GET";
  const q = event.queryStringParameters || {};
  const cookies = Object.fromEntries((event.cookies||[]).map(c=>{const [k,...v]=c.split("=");return[k,v.join("=")]}));

  try{
    if (path.endsWith("/api/auth/login")) {
      const state = crypto.randomBytes(8).toString("hex");
      const signed = `${state}.${hmac(state)}`;
      const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        response_type: "code",
        redirect_uri: DISCORD_REDIRECT_URI,
        scope: "identify",
        state
      });
      return redirect(`${OAUTH_AUTHORIZE}?${params}`, [ setCookie("mm_state", signed, { maxAge:300 }) ]);
    }

    if (path.endsWith("/api/auth/callback")) {
      const { code, state } = q; if(!code||!state) return json(400,{error:"missing"});
      const saved = cookies["mm_state"]; if(!saved) return json(400,{error:"state_missing"});
      const [raw,sig] = saved.split("."); if(hmac(raw)!==sig || raw!==state) return json(400,{error:"bad_state"});

      const t = await tokenByCode(code);
      const me = await discordMe(t.access_token, t.token_type);

      if (!allow.has(me.id)) {
        console.log("DENY", me.id, me.username, me.global_name);
        return redirect(`${BASE_URL||"/"}/frontend/login-test.html`, [ clearCookie("mm_state") ]);
      }

      const sess = mkSess({ sub: me.id, name: me.global_name || me.username, av: me.avatar || "" });
      console.log("LOGIN", me.id, me.username, me.global_name);

      // テストしやすいよう callback後は login-test に戻す
      return redirect(`${BASE_URL||"/"}/frontend/login-test.html`, [
        setCookie("mm_session", sess, { maxAge: 7*24*3600 }),
        clearCookie("mm_state")
      ]);
    }

    if (path.endsWith("/api/auth/me")) {
      try{
        const s = readSess(cookies["mm_session"]);
        const avatar = s.av ? `https://cdn.discordapp.com/avatars/${s.sub}/${s.av}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/0.png`;
        return json(200,{ authenticated:true, user:{ id:s.sub, name:s.name, avatar }});
      }catch{ return json(401,{ authenticated:false }); }
    }

    if (path.endsWith("/api/auth/logout") && method==="POST") {
      return json(200,{ok:true}, { "Set-Cookie": clearCookie("mm_session") });
    }

    return json(404,{error:"not_found"});
  }catch(e){
    console.log("auth_err", e?.message||e);
    return json(500,{error:"server_error"});
  }
};
