// "Keep this keepsake" — the guest-to-account bridge.
//
// A guest taps Keep, picks a door (email+password today; magic link today;
// Apple/Google slots reserved until OAuth is configured), and the keepsake
// attaches to their new account via the same join-by-code membership the
// database already uses. Their list lives at /keepsake/mine/.
//
// Loaded by the guest view and the /add page. Depends on session.js (Nanafy).
window.NanafyKeep = (function () {
  'use strict';

  var SUPABASE_URL = Nanafy.SUPABASE_URL;
  var ANON_KEY = Nanafy.ANON_KEY;
  var SIGNED_IN_SLOT = 'sb-vigenqlwwoknxjzahvtv-auth-token';

  /* ---- session state ---------------------------------------------- */

  // True when the browser holds a REAL account session (not the invisible
  // anonymous one guests get for contributing).
  async function hasAccount() {
    var s = await Nanafy.session();
    return !!(s && !s.anon);
  }

  function storeSession(d) {
    var sess = d.session || d;
    var user = d.user || sess.user;
    if (!sess.access_token || !user) return false;
    localStorage.setItem(SIGNED_IN_SLOT, JSON.stringify({
      access_token: sess.access_token,
      refresh_token: sess.refresh_token,
      expires_at: sess.expires_at || Math.floor(Date.now() / 1000) + (sess.expires_in || 3600),
      token_type: 'bearer',
      user: user,
    }));
    return true;
  }

  // Magic links land back with tokens in the URL hash — catch and store them.
  function captureMagicLink() {
    if (!location.hash || location.hash.indexOf('access_token=') === -1) return false;
    var h = new URLSearchParams(location.hash.slice(1));
    var access = h.get('access_token'), refresh = h.get('refresh_token');
    if (!access) return false;
    try {
      var payload = JSON.parse(atob(access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      storeSession({
        access_token: access,
        refresh_token: refresh,
        expires_at: payload.exp,
        user: { id: payload.sub, email: payload.email },
      });
      history.replaceState(null, '', location.pathname + location.search);
      return true;
    } catch (e) { return false; }
  }

  /* ---- auth calls --------------------------------------------------- */

  async function signUp(email, password) {
    var r = await fetch(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.msg || d.error_description || 'signup');
    if (!storeSession(d)) throw new Error('signup');
  }

  async function signIn(email, password) {
    var r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.msg || d.error_description || 'signin');
    if (!storeSession(d)) throw new Error('signin');
  }

  async function magicLink(email, redirectTo) {
    var r = await fetch(SUPABASE_URL + '/auth/v1/otp', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, create_user: true, options: { email_redirect_to: redirectTo } }),
    });
    if (!r.ok) { var d = await r.json(); throw new Error(d.msg || 'magic'); }
  }

  // Re-join under the new account so the membership rides the REAL identity.
  async function attach(code) {
    if (!code) return;
    try { await Nanafy.join(code, 'id'); } catch (e) { /* attach is best-effort */ }
  }

  /* ---- the sheet ----------------------------------------------------- */

  var css = '\n' +
    '.keep-veil{position:fixed;inset:0;z-index:60;background:rgba(4,26,29,.6);backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center;}\n' +
    '@media(min-width:560px){.keep-veil{align-items:center;}}\n' +
    '.keep-sheet{width:100%;max-width:430px;background:#0E5259;border:1px solid rgba(255,255,255,.18);border-radius:20px 20px 0 0;padding:26px 22px calc(26px + env(safe-area-inset-bottom));animation:keepUp .28s cubic-bezier(.22,.9,.36,1);}\n' +
    '@media(min-width:560px){.keep-sheet{border-radius:20px;}}\n' +
    '@keyframes keepUp{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}\n' +
    '.keep-sheet h3{font-family:"Josefin Sans",sans-serif;font-weight:600;font-size:1.15rem;letter-spacing:.02em;margin:0 0 6px;color:#fff;}\n' +
    '.keep-sheet .k-sub{font-size:.88rem;color:rgba(255,255,255,.7);margin:0 0 18px;}\n' +
    '.keep-sheet input{width:100%;border:1px solid rgba(255,255,255,.34);border-radius:12px;background:#0C4A51;color:#fff;font:inherit;font-size:16px;padding:12px 14px;margin:0 0 10px;outline:none;box-sizing:border-box;}\n' +
    '.keep-sheet input:focus{border-color:#5FE0D2;}\n' +
    '.keep-go{width:100%;border:0;border-radius:12px;background:#5FE0D2;color:#04302C;font:inherit;font-weight:800;font-size:1rem;padding:14px;cursor:pointer;margin-top:4px;}\n' +
    '.keep-alt{width:100%;border:1px solid rgba(255,255,255,.34);border-radius:12px;background:none;color:#fff;font:inherit;font-weight:700;font-size:.92rem;padding:12px;cursor:pointer;margin-top:10px;}\n' +
    '.keep-x{position:absolute;top:14px;right:16px;border:0;background:none;color:rgba(255,255,255,.6);font-size:1.1rem;cursor:pointer;padding:6px;}\n' +
    '.keep-err{color:#FFB4A6;font-size:.84rem;margin:8px 0 0;}\n' +
    '.keep-ok{color:#5FE0D2;font-size:.9rem;margin:8px 0 0;}\n' +
    '.keep-fine{font-size:.76rem;color:rgba(255,255,255,.45);margin:14px 0 0;text-align:center;}\n' +
    '.keep-switch{background:none;border:0;color:#5FE0D2;font:inherit;font-size:.84rem;font-weight:700;cursor:pointer;padding:0;}\n';

  function ensureCss() {
    if (document.getElementById('keep-css')) return;
    var s = document.createElement('style');
    s.id = 'keep-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // openSheet(code, onKept) — the whole flow in one bottom sheet.
  function openSheet(code, onKept) {
    ensureCss();
    var veil = document.createElement('div');
    veil.className = 'keep-veil';
    var mode = 'signup'; // signup | signin | magic

    function render() {
      var title = mode === 'magic' ? 'Email me a sign-in link' : mode === 'signin' ? 'Welcome back' : 'Keep this keepsake';
      var sub = mode === 'magic'
        ? 'No password needed — we’ll email you a link that signs you in.'
        : mode === 'signin'
          ? 'Sign in and this keepsake joins your list.'
          : 'Make a free account and this keepsake stays in your list forever — plus any others you’re part of.';
      veil.innerHTML =
        '<div class="keep-sheet" style="position:relative">' +
        '<button class="keep-x" aria-label="Close">✕</button>' +
        '<h3>' + title + '</h3>' +
        '<p class="k-sub">' + sub + '</p>' +
        '<input type="email" id="keepEmail" placeholder="Your email" autocomplete="email">' +
        (mode !== 'magic' ? '<input type="password" id="keepPw" placeholder="' + (mode === 'signin' ? 'Your password' : 'Choose a password') + '" autocomplete="' + (mode === 'signin' ? 'current-password' : 'new-password') + '">' : '') +
        '<button class="keep-go" id="keepGo">' + (mode === 'magic' ? 'Send the link' : mode === 'signin' ? 'Sign in' : 'Keep it') + '</button>' +
        (mode === 'signup' ? '<button class="keep-alt" id="keepMagic">Email me a link instead — no password</button>' : '') +
        '<p class="keep-err" id="keepErr" hidden></p>' +
        '<p class="keep-ok" id="keepOk" hidden></p>' +
        '<p class="keep-fine">' +
        (mode === 'signup' ? 'Already have an account? <button class="keep-switch" id="keepToSignin">Sign in</button>' :
          '<button class="keep-switch" id="keepToSignup">Back</button>') +
        '<br>Apple &amp; Google sign-in are coming soon.</p>' +
        '</div>';

      veil.querySelector('.keep-x').addEventListener('click', close);
      var toIn = document.getElementById('keepToSignin');
      if (toIn) toIn.addEventListener('click', function () { mode = 'signin'; render(); });
      var toUp = document.getElementById('keepToSignup');
      if (toUp) toUp.addEventListener('click', function () { mode = 'signup'; render(); });
      var toMagic = document.getElementById('keepMagic');
      if (toMagic) toMagic.addEventListener('click', function () { mode = 'magic'; render(); });

      document.getElementById('keepGo').addEventListener('click', async function () {
        var err = document.getElementById('keepErr');
        var ok = document.getElementById('keepOk');
        err.hidden = true; ok.hidden = true;
        var email = document.getElementById('keepEmail').value.trim();
        var pwEl = document.getElementById('keepPw');
        var pw = pwEl ? pwEl.value : '';
        if (!email || email.indexOf('@') === -1) { err.textContent = 'Enter your email first.'; err.hidden = false; return; }
        if (mode !== 'magic' && pw.length < 6) { err.textContent = 'Password needs at least 6 characters.'; err.hidden = false; return; }
        this.disabled = true;
        try {
          if (mode === 'magic') {
            await magicLink(email, location.origin + location.pathname + location.search);
            ok.textContent = 'Sent — check your email and tap the link.';
            ok.hidden = false;
            return;
          }
          if (mode === 'signin') await signIn(email, pw);
          else await signUp(email, pw);
          await attach(code);
          close();
          if (onKept) onKept();
        } catch (e) {
          var m = String(e.message || '');
          err.textContent =
            m.indexOf('already') !== -1 ? 'That email already has an account — try Sign in.' :
            m.indexOf('Invalid login') !== -1 ? 'Wrong email or password.' :
            'That didn’t work — check the details and try again.';
          err.hidden = false;
          this.disabled = false;
        }
      });
    }

    veil.addEventListener('click', function (e) { if (e.target === veil) close(); });
    function close() { veil.remove(); }
    // Attach BEFORE render: render wires buttons via getElementById, which
    // only sees elements that are already in the document.
    document.body.appendChild(veil);
    render();
  }

  // On every page load: catch a returning magic link and attach the keepsake.
  var magicLanded = captureMagicLink();

  return {
    hasAccount: hasAccount,
    openSheet: openSheet,
    attach: attach,
    magicLanded: magicLanded,
  };
})();
