// Nanafy session + membership helper.
//
// Since 20260802220000_scope_reads_to_membership.sql, the database no longer
// answers the bare anon key: every read follows the event_members table, and
// the share code is exchanged for membership through the join_event_by_code
// RPC — the one anonymous entry point. Guests still have no account; each
// browser gets a Supabase *anonymous* session (a stable identity the database
// can reason about) the first time it needs one, kept in localStorage and
// refreshed when it expires.
//
// Prefers a real signed-in session when one exists (same localStorage slot the
// profile chip reads), so owners keep their editing and moderation powers.
window.Nanafy = (function () {
  var SUPABASE_URL = 'https://vigenqlwwoknxjzahvtv.supabase.co';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpZ2VucWx3d29rbnhqemFodnR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NDI0MjksImV4cCI6MjA5OTIxODQyOX0.qjggNEyEwVfrHP8neWPlTPcKOp92wiFwUgv4aEiswaE';
  var STORE = 'nanafy_anon_session';

  function now() { return Math.floor(Date.now() / 1000); }

  // The signed-in session supabase-js stores; null when absent or expired.
  function signedIn() {
    try {
      var raw = localStorage.getItem('sb-vigenqlwwoknxjzahvtv-auth-token');
      if (!raw) return null;
      var s = JSON.parse(raw);
      var sess = s.currentSession || s;
      if (!sess.access_token || !sess.user) return null;
      if (sess.expires_at && sess.expires_at - 60 < now()) return null; // stale — let pages say so themselves
      return { token: sess.access_token, userId: sess.user.id, anon: false };
    } catch (e) { return null; }
  }

  function readAnon() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
  }
  function saveAnon(s) {
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {}
  }
  function pack(d) {
    var sess = d.session || d; // GoTrue returns the session at the top level or under .session
    var user = d.user || sess.user;
    if (!sess.access_token || !user) return null;
    return {
      access_token: sess.access_token,
      refresh_token: sess.refresh_token,
      expires_at: sess.expires_at || (now() + (sess.expires_in || 3600)),
      userId: user.id,
    };
  }

  async function createAnon() {
    var r = await fetch(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) return null;
    var s = pack(await r.json());
    if (s) saveAnon(s);
    return s;
  }

  async function refreshAnon(a) {
    var r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: a.refresh_token }),
    });
    if (!r.ok) return null;
    var s = pack(await r.json());
    if (s) saveAnon(s);
    return s;
  }

  // Resolve to { token, userId, anon } — signed-in first, else the device's
  // anonymous session (refreshed or created as needed). Null only when the
  // auth server is unreachable.
  var inflight = null;
  function session() {
    var si = signedIn();
    if (si) return Promise.resolve(si);
    if (inflight) return inflight;
    inflight = (async function () {
      var a = readAnon();
      if (a && a.expires_at - 60 > now()) return { token: a.access_token, userId: a.userId, anon: true };
      if (a && a.refresh_token) {
        var r = await refreshAnon(a);
        if (r) return { token: r.access_token, userId: r.userId, anon: true };
      }
      var c = await createAnon();
      return c ? { token: c.access_token, userId: c.userId, anon: true } : null;
    })().finally(function () { inflight = null; });
    return inflight;
  }

  async function headers() {
    var s = await session();
    return { apikey: ANON_KEY, Authorization: 'Bearer ' + (s ? s.token : ANON_KEY) };
  }

  // Exchange a share code for the event (and membership, as a side effect).
  // `select` may embed relations, e.g. 'id,title,prompts(text,position)'.
  // (Embedded filters like memories.status=eq… are not accepted on RPC calls —
  // select the column and filter in the page instead.)
  // Returns the event row, or null when the code matches nothing.
  async function join(code, select) {
    var h = await headers();
    var url = SUPABASE_URL + '/rest/v1/rpc/join_event_by_code' + (select ? '?select=' + select : '');
    var r = await fetch(url, {
      method: 'POST',
      headers: Object.assign({}, h, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_code: (code || '').toUpperCase() }),
    });
    if (!r.ok) throw new Error('server');
    var rows = await r.json();
    return (rows && rows[0]) || null;
  }

  return { SUPABASE_URL: SUPABASE_URL, ANON_KEY: ANON_KEY, session: session, headers: headers, join: join };
})();
