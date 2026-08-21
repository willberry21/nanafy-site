/* The scatter ---------------------------------------------------------------
   Next to "a room fills with people who each hold a piece of someone. Then
   everyone goes home, and the pieces scatter."

   One mark per person, in three beats as you scroll:

     a room       clustered, overlapping, unordered
     scattered    everyone goes home and the pieces spread
     gathered     they come back, one at a time, into ordered rows

   The first two beats are the sentence beside it. The third is the product:
   the pieces do not stay scattered, because something gathered them. Order is
   what carries it — a random spread reads as loss, ordered rows read as kept.

   The gathered form was a ring first, and a ring with a hole in the middle
   reads as a wreath or a loading spinner. Rows read as entries on a page,
   which is what a keepsake actually is, and they keep every mark separate —
   'every voice' matters more here than 'one blob'. It is driven by scroll
   position rather than by a clock, for two reasons: the sentence is about
   time passing, and scrolling IS the reader's time passing; and it means the
   page's one quiet moment is not permanently in motion. Stop scrolling and it
   stops.

   Markup:  <canvas data-scatter></canvas>
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var cv = document.querySelector('[data-scatter]');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Half & half, muted: these are people, not confetti */
  var INKS = [
    [15,176,164], [10,122,114], [150,116,244], [224,137,168],
    [250,166,110], [46,206,192], [102,68,176]
  ];
  var COUNT = 38;
  var marks = [];
  var W = 0, H = 0, dpr = 1;

  /* A deterministic shuffle, so the arrangement is the same on every visit —
     a composition, not a new throw of dice each reload. */
  var seed = 20260821;
  function rnd() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  function build() {
    marks = [];
    for (var i = 0; i < COUNT; i++) {
      var a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
      /* Each mark leaves along the line it was already standing on, give or
         take. Independent random directions made some of them cross back
         through the middle, so the spread actually DIPPED halfway through —
         which reads as churn rather than as a room emptying. */
      var aw = a + (rnd() - 0.5) * 0.85, rw = 0.58 + rnd() * 0.45;
      marks.push({
        /* Held as angles, not as fractions of the box. The canvas is wide and
           short on a phone and tall on a desktop; storing fractions stretched
           the cluster into an ellipse on one and a circle on the other. The
           room is sized off the SHORT side so it is always round, while the
           scatter uses both so it fills whatever shape it is given. */
        a: a, r: r, aw: aw, rw: rw,
        /* where it ends up: a slot in the grid, with a little jitter so it
           reads as gathered by someone rather than as a machine part */
        gi: i,
        gjx: (rnd() - 0.5) * 0.30,
        gjy: (rnd() - 0.5) * 0.30,
        size: 4.4 + rnd() * 7.6,
        ink: INKS[Math.floor(rnd() * INKS.length)],
        /* they do not all move at once — but at 0.42 most marks had not
           started until the scroll was nearly half done, so the first third
           of the band looked frozen */
        lag: rnd() * 0.16
      });
    }
  }

  function measure() {
    var rect = cv.getBoundingClientRect();
    if (!rect.width) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(rect.width);
    H = Math.round(rect.height);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    layout();
    return true;
  }

  /* Leaving starts at once — an ease-in-out spent the first fifth of the
     journey barely moving, which is what made the top of the band look frozen.
     Arriving is eased at both ends, because settling should look like settling. */
  function easeOut(t) { return 1 - Math.pow(1 - t, 2.4); }
  function easeInOut(t) { return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }

  /* the ordered rows they end up in */
  var GRID = { cols: 8, rows: 5, cell: 0, x: 0, y: 0 };
  function layout() {
    GRID.cols = W > H * 1.6 ? 10 : 8;
    GRID.rows = Math.ceil(COUNT / GRID.cols);
    GRID.cell = Math.min(W * 0.70 / GRID.cols, H * 0.74 / GRID.rows);
    GRID.x = (W - GRID.cell * GRID.cols) / 2;
    GRID.y = (H - GRID.cell * GRID.rows) / 2;
  }

  function draw(p) {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      /* each mark's own share of the journey, so the room empties unevenly */
      var t = (p - m.lag) / (1 - m.lag);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var base = W < H ? W : H;
      var hx = W / 2 + Math.cos(m.a) * m.r * 0.19 * base;
      var hy = H / 2 + Math.sin(m.a) * m.r * 0.19 * base;
      var ax = W / 2 + Math.cos(m.aw) * m.rw * 0.43 * W;
      var ay = H / 2 + Math.sin(m.aw) * m.rw * 0.36 * H;
      var gx = GRID.x + (m.gi % GRID.cols + 0.5 + m.gjx) * GRID.cell;
      var gy = GRID.y + (Math.floor(m.gi / GRID.cols) + 0.5 + m.gjy) * GRID.cell;

      /* Never fades out — it has to be present the whole time the band is on
         screen — so every beat changes the arrangement, not the presence. */
      var x, y, alpha;
      if (t < 0.5) {                      /* the room comes apart */
        var e1 = easeOut(t / 0.5);
        x = hx + (ax - hx) * e1;
        y = hy + (ay - hy) * e1;
        alpha = 0.95 - 0.33 * e1;
      } else {                            /* and is gathered back */
        var e2 = easeInOut((t - 0.5) / 0.5);
        x = ax + (gx - ax) * e2;
        y = ay + (gy - ay) * e2;
        alpha = 0.62 + 0.33 * e2;
      }
      /* smaller once gathered, or the rows blur into one smear */
      var rad = m.size * (1 - 0.46 * (t < 0.5 ? 0 : easeInOut((t - 0.5) / 0.5)));
      /* A mark cut off by the canvas edge reads as a bug rather than as
         leaving, and how much room the travel above needs depends on the
         canvas shape — which is wide and short on a phone. So clamp, and let
         the geometry be approximate rather than the rendering be wrong. */
      var edge = rad * 2.4;
      if (x < edge) x = edge; else if (x > W - edge) x = W - edge;
      if (y < edge) y = edge; else if (y > H - edge) y = H - edge;

      var g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.4);
      g.addColorStop(0, 'rgba(' + m.ink + ',' + alpha.toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(' + m.ink + ',' + (alpha * 0.34).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + m.ink + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* 0 while the band is low on the screen, 1 once it has risen past */
  function progress() {
    var r = cv.getBoundingClientRect();
    var start = window.innerHeight * 0.95;
    var end = window.innerHeight * 0.08;
    var p = (start - r.top) / (start - end);
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  build();
  if (!measure()) return;

  if (still) { draw(1); return; }   /* held gathered: the beat that matters */   /* held mid-scatter: the idea, unmoving */

  /* Scroll sets where we are going; the loop decides how fast we get there. */
  var MAX_RATE = 1.45;   /* progress units per second — a 0→1 sweep floors at ~690ms */
  var SMOOTH = 7;        /* how eagerly it chases the target */
  var EPS = 0.0015;

  var cur = progress(), tgt = cur, raf = 0, lastT = 0, inView = true;
  draw(cur);

  function loop(now) {
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.05) dt = 0.05;      /* a backgrounded tab must not teleport it */
    if (dt <= 0) dt = 0.016;

    var d = tgt - cur;
    var step = d * (1 - Math.exp(-SMOOTH * dt));
    var cap = MAX_RATE * dt;
    if (step > cap) step = cap; else if (step < -cap) step = -cap;
    cur += step;
    draw(cur);

    if (inView && Math.abs(tgt - cur) > EPS) raf = requestAnimationFrame(loop);
    else raf = 0;
  }

  function start() {
    if (raf || !inView) return;
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function onScroll() {
    tgt = progress();
    start();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    if (measure()) { cur = tgt = progress(); draw(cur); }
  });
})();
