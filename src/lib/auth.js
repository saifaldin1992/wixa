// Dashboard sign-in: checks the person's Supabase session and team role on every dashboard request.

import { json } from "./core.js";

// Admin-only endpoints: the caller's own Supabase session must belong to an admin.
// Roles: owner (everything) · editor (content and look) · support (messages and appointments).
// `roles` lists who may use an endpoint; omitted = any dashboard user.
export async function adminSession(request, env, roles) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return { error: json({ error: "unauthorized" }, 401) };
  const asUser = (path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: auth, "content-type": "application/json", ...(init.headers || {}) } });
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
