// Change log («سجل التعديلات»): dashboard actions that go through the server (team, integrations, campaigns…) are
// recorded here with the signed-in person's email and role. Changes made straight to the database from the dashboard
// are recorded by database triggers (supabase/migrations/20261118000000_audit_log.sql).
// Never fails a request: if the log is not set up yet (404) or the database is busy, the action still goes through.

import { rpcToken } from "../lib/core.js";

// s: the adminSession result · p: { area, action, target?, summary?, changes? }
export async function audit(env, s, p) {
  try {
    await rpcToken(env, "audit_add", { p: { actor: s?.user?.id || "", email: s?.user?.email || "", role: s?.role || "", ...p } });
  } catch (err) { console.error("audit", err.message); }
}
