// A stand-in for supabase-js used by the smoke tests: a signed-in admin with empty tables,
// so every dashboard view can be opened without touching a real database.
(() => {
  const user = { id: "00000000-0000-0000-0000-000000000001", email: "owner@example.com" };
  const session = { user, access_token: "test" };
  const ok = (data, extra = {}) => Promise.resolve({ data, error: null, ...extra });
  const rows = { site_settings: { data: {} } };
  const query = (table) => {
    let single = false;
    const q = {
      then: (res, rej) => ok(single ? (rows[table] ?? null) : [], { count: 0 }).then(res, rej),
    };
    for (const m of ["select", "eq", "neq", "in", "order", "limit", "range", "update", "insert", "upsert", "delete", "match", "is", "gte", "lte"]) q[m] = () => q;
    q.single = q.maybeSingle = () => { single = true; return q; };
    return q;
  };
  const stats = { visitors: 3, views: 5, today_views: 1, today_visitors: 1, all_time_views: 5, messages_new: 0, by_day: [], top_pages: [], countries: [], devices: [], referrers: [] };
  window.supabase = {
    createClient: () => ({
      auth: {
        getSession: () => ok({ session }),
        getUser: () => ok({ user }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: () => ok(null),
        updateUser: () => ok({ user }),
        refreshSession: () => ok({ session }),
        mfa: {
          getAuthenticatorAssuranceLevel: () => ok({ currentLevel: "aal1", nextLevel: "aal1" }),
          listFactors: () => ok({ totp: [], all: [] }),
        },
      },
      rpc: (name) => ok(name === "is_admin" ? true : name === "admin_stats" ? stats : null),
      from: query,
      storage: { from: () => ({ upload: () => ok({ path: "x" }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    }),
  };
})();
