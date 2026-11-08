// Dashboard sign-in: checks the person's Supabase session and team role on every dashboard request.

import { json } from "./core.js";

// Admin-only endpoints: the caller's own Supabase session must belong to an admin.
// Roles: owner (everything) · editor (content and look) · support (messages and appointments).
// `roles` lists who may use an endpoint; omitted = any dashboard user.
//
// The answer is remembered for one minute per sign-in (in this server's memory, by a fingerprint of the token, never
// past the token's own expiry), so the dashboard's several requests on one page do not each ask the database again.
// A role change or a removal from the team takes effect within that minute.
const ROLE_TTL = 60e3;
const roleMemo = new Map(); // fingerprint → { role, until }
const fingerprint = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const tokenExpiry = (auth) => { try { return JSON.parse(atob(auth.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000 || 0; } catch { return 0; } };

export async function adminSession(request, env, roles) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return { error: json({ error: "unauthorized" }, 401) };
  const asUser = (path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: auth, "content-type": "application/json", ...(init.headers || {}) } });
  const fp = await fingerprint(auth), now = Date.now();
  const known = roleMemo.get(fp);
  if (known && known.until > now) {
    if (roles && !roles.includes(known.role)) return { error: json({ error: "role_forbidden", role: known.role }, 403) };
    return { asUser, role: known.role };
  }
  let role = null;
  try {
    const r = await asUser("rpc/admin_role", { method: "POST", body: "{}" });
    if (r.ok) role = await r.json();
    else if (r.status === 404) { // before the team update is applied: every dashboard user is the owner
      const adm = await asUser("rpc/is_admin", { method: "POST", body: "{}" });
      role = adm.ok && (await adm.json()) === true ? "owner" : null;
    }
  } catch { return { error: json({ error: "auth_unavailable" }, 503) }; }
  if (!role) return { error: json({ error: "forbidden" }, 403) };
  const exp = tokenExpiry(auth.slice(7));
  if (exp > now) {
    if (roleMemo.size > 200) roleMemo.clear(); // a handful of team members: never grows
    roleMemo.set(fp, { role, until: Math.min(now + ROLE_TTL, exp) });
  }
  if (roles && !roles.includes(role)) return { error: json({ error: "role_forbidden", role }, 403) };
  return { asUser, role };
}
export async function sessionUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: auth } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
