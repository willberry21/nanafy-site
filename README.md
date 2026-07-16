# nanafy-site

The public website **and** the working web product for **Nanafy** — served at **https://nanafy.ai** via GitHub Pages. Separate from the private app repo (`willberry21/nanafy`, the mobile app).

Every page is a single self-contained HTML file (inline CSS + JS). To change anything: edit the file, commit, push — GitHub Pages redeploys in about a minute.

## Pages
- **`index.html`** → `nanafy.ai` — the public marketing landing page. Hero currently leads with the "Get early access" waitlist (kept as a waitlist on purpose while the product is in testing). Top menu links to Create / My keepsakes.
- **`create/index.html`** → `nanafy.ai/create` — host makes a keepsake (pick occasion → name → optional title). Saves the event + 5 seeded prompts to Supabase, then shows the **Key** (QR code + share link + code). Remembers each keepsake in the browser (`localStorage['nanafy_keepsakes']`).
- **`add/index.html`** → `nanafy.ai/add/?c=CODE` — the guest page. No app, no login: read the event's questions, write a memory, add a photo, sign a name → saved to Supabase. This is what the QR / share link points to.
- **`keepsake/index.html`** → `nanafy.ai/keepsake/?c=CODE` — the host's "watch it gather" view: all collected memories, a share bar, refresh.
- **`mine/index.html`** → `nanafy.ai/mine` — the host's home: lists their keepsakes. Two layers of "get back to them": (1) device memory via localStorage; (2) email **magic-link sign-in** (Supabase Auth `signInWithOtp`) that syncs keepsakes across devices via the `event_members` table. Remembers the email for one-tap "Welcome back".

## Backend
- Supabase project `vigenqlwwoknxjzahvtv` (shared with the mobile app). Pages talk to it directly via the REST API + public anon key (protected by row-level security; anonymous create/insert is allowed by design). `mine` also loads `supabase-js` from the jsDelivr CDN for auth.
- Tables used: `events`, `prompts`, `memories`, `event_members` (+ `memory-photos` storage bucket).

## Known follow-ups (as of 2026-07-15)
- Magic-link email uses Supabase's free-tier mailer (slow / spam-prone) — set up custom SMTP sending from nanafy.ai before launch.
- QR is generated via `api.qrserver.com` (3rd-party) — self-host later.
- Guest page is text + photo only; **voice memories** (marketed on the landing page) not built yet.
- `create` / `add` / `keepsake` / `mine` are all `noindex` — the product is a private test lab; the public homepage is still the waitlist.
- Anon key is public → anyone with it can read all events/memories (accepted pre-launch; tighten before real user data).
