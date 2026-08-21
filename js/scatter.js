/* The scatter ---------------------------------------------------------------
   Next to "a room fills with people who each hold a piece of someone. Then
   everyone goes home, and the pieces scatter."

   One mark per person, in three beats as you scroll:

     a room       clustered, overlapping, unordered
     scattered    everyone goes home and the pieces spread
     gathered     they come back into a loose ring — kept, and still moving

   HOW, because the how is what went wrong three times. Scroll does not move
   the marks. Scroll moves a TARGET, and each mark is pulled toward its own
   target by a spring, with its own stiffness and its own damping:

     ax = (target - x) * k  -  vx * damping  +  wander

   Two consequences, both of them the point:

   · A spring cannot snap. Marks with softer springs arrive later than stiff
     ones and overshoot slightly before settling, so the formation assembles
     instead of appearing. Lerping every mark along a fixed path at the same
     rate is what made the earlier versions "snap into a grid".

   · The wander never stops. Two summed sines per axis, at frequencies that do
     not divide into each other, so the resting state keeps breathing. This is
     the part that matters most: ANY frozen arrangement of uniform dots reads
     as a diagram, which is why a ring read as a wreath and a lattice read as
     a loading skeleton. Kept things are still alive.

   The paced target from the previous version stays, so a violent flick still
   cannot drag the whole sequence through in four frames.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var cv = document.querySelector('[data-scatter]');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Three speeds, because "slightly faster" pulls on three different things:
       k      how quickly each mark reaches its own target
       chase  how closely the target follows the scroll (lower = more lag)
       rate   the floor on how fast the whole sequence can play, in units/sec
     ?scatter=calm | quick | quicker overrides the default, so the choice can
     be made by feel rather than by me guessing. Temporary — delete the lookup
     once it is settled. */
  var SPEEDS = {
    calm:    { k: 10, chase: 5,  rate: 1.15 },
    quick:   { k: 15, chase: 11, rate: 1.75 },
    quicker: { k: 22, chase: 17, rate: 2.60 }
  };
  var SPEED = SPEEDS.quick;
  try {
    var want = new URLSearchParams(location.search).get('scatter');
    if (want && SPEEDS[want]) SPEED = SPEEDS[want];
  } catch (e) {}

  /* Half & half, muted: these are people, not confetti */
  var WRITTEN = [38, 52, 56];   /* the ink they are gathered into */
  var INKS = [
    [15,176,164], [10,122,114], [150,116,244], [224,137,168],
    [250,166,110], [46,206,192], [102,68,176]
  ];
  var COUNT = 38;
  var marks = [];
  var W = 0, H = 0, dpr = 1, clock = 0;

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
        /* where it ends up: a place in a loose ring. Uneven radius, and a
           few standing inside it, so it reads as a gathering and not as a
           compass rose. The angle is assigned after the fact — see below. */
        ga: 0,
        gjitter: (rnd() - 0.5) * 0.55,
        gr: (rnd() < 0.16 ? 0.42 : 0.80 + rnd() * 0.34),
        /* its own spring, so no two marks arrive together. Damping is derived
           from k rather than rolled separately: critical damping is 2*sqrt(k),
           and holding a constant fraction of it keeps the same slight
           overshoot whatever the stiffness — so changing speed changes speed,
           and not bounciness. */
        kBase: 1.0 + rnd() * 1.15,
        /* its own wander, at frequencies that do not line up */
        w1: rnd() * 6.283, w2: rnd() * 6.283,
        wf1: 0.21 + rnd() * 0.17, wf2: 0.09 + rnd() * 0.08,
        wamp: 0.55 + rnd() * 0.85,
        x: 0, y: 0, vx: 0, vy: 0, placed: false,
        size: 4.4 + rnd() * 7.6,
        ink: INKS[Math.floor(rnd() * INKS.length)],
        lag: rnd() * 0.07
      });
    }
  }

  /* Each mark gathers to the ring slot nearest where it scattered to, rather
     than to one picked by its index. Otherwise a mark on the left flies to a
     slot on the right, half of them cross through the middle at once, and the
     gather reads as a swirl — mean spread actually dipped BELOW the final ring
     while everything was in transit. Sorting by the scatter angle makes the
     mapping monotonic, so gathering is a contraction and nothing crosses. */
  function assignRing() {
    var order = marks.slice().sort(function (p, q) { return p.aw - q.aw; });
    for (var i = 0; i < order.length; i++) {
      order[i].ga = (i / order.length) * Math.PI * 2 + order[i].gjitter;
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
    return true;
  }

  /* Where a mark WANTS to be at this point in the sequence.

     The timeline has HOLDS in it, and that is the whole point. Blending the
     two halves straight into each other meant the target reversed direction at
     the exact instant it arrived — so the marks, which lag their target by
     design, were still travelling outward when they got pulled back. The
     scattered beat never actually landed. A three-beat story needs each beat
     to be reached and then held for a moment before the next one starts.

       0.00 – 0.10   held as a room          you register that it is a room
       0.10 – 0.42   coming apart
       0.42 – 0.62   held scattered          the beat lands, and is seen
       0.62 – 0.94   being gathered
       0.94 – 1.00   held gathered           it rests, still breathing            */
  var BEATS = [0.10, 0.42, 0.62, 0.94];

  function span(t, a, b) {            /* 0 before a, 1 after b, linear between */
    if (t <= a) return 0;
    if (t >= b) return 1;
    return (t - a) / (b - a);
  }

  function targetOf(m, p) {
    var t = (p - m.lag) / (1 - m.lag);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var base = W < H ? W : H;

    var hx = W / 2 + Math.cos(m.a) * m.r * 0.19 * base;
    var hy = H / 2 + Math.sin(m.a) * m.r * 0.19 * base;
    var ax = W / 2 + Math.cos(m.aw) * m.rw * 0.43 * W;
    var ay = H / 2 + Math.sin(m.aw) * m.rw * 0.36 * H;
    var gx = W / 2 + Math.cos(m.ga) * m.gr * 0.31 * base;
    var gy = H / 2 + Math.sin(m.ga) * m.gr * 0.31 * base;

    /* out, then in — each on its own window, with the hold between them */
    var out = span(t, BEATS[0], BEATS[1]);
    var back = span(t, BEATS[2], BEATS[3]);

    var sx = hx + (ax - hx) * out;     /* where it is on the way out */
    var sy = hy + (ay - hy) * out;

    return {
      x: sx + (gx - sx) * back,
      y: sy + (gy - sy) * back,
      alpha: 0.95 - 0.33 * out + 0.33 * back,
      rad: 1 - 0.12 * back,
      mix: back
    };
  }

  function step(p, dt) {
    if (!W) return;
    if (dt > 0.05) dt = 0.05;
    clock += dt;

    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var tg = targetOf(m, p);

      /* the wander: two sines per axis that never come back into phase, so it
         breathes at rest instead of freezing */
      var wx = (Math.sin(clock * m.wf1 * 6.283 + m.w1) +
                Math.sin(clock * m.wf2 * 6.283 + m.w2) * 0.6) * m.wamp * 3.4;
      var wy = (Math.cos(clock * m.wf2 * 6.283 + m.w1 * 1.7) +
                Math.cos(clock * m.wf1 * 6.283 + m.w2 * 0.8) * 0.6) * m.wamp * 3.4;

      if (!m.placed) { m.x = tg.x; m.y = tg.y; m.placed = true; }

      /* spring toward the target, damped. Its own k and damping mean its own
         arrival time and its own small overshoot. */
      var k = m.kBase * SPEED.k;
      var damp = 2 * Math.sqrt(k) * 0.80;      /* just under critical */
      m.vx += ((tg.x + wx - m.x) * k - m.vx * damp) * dt;
      m.vy += ((tg.y + wy - m.y) * k - m.vy * damp) * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      m.alpha = tg.alpha;
      m.radMul = tg.rad;
      m.mix = tg.mix;
    }
  }

  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var rad = m.size * (m.radMul === undefined ? 1 : m.radMul);

      /* many voices while scattered, a little more of one hand once gathered */
      var ink = m.ink;
      if (m.mix) {
        var w = m.mix * 0.34;
        ink = [Math.round(m.ink[0] + (WRITTEN[0] - m.ink[0]) * w),
               Math.round(m.ink[1] + (WRITTEN[1] - m.ink[1]) * w),
               Math.round(m.ink[2] + (WRITTEN[2] - m.ink[2]) * w)];
      }

      /* a mark cut off by the canvas edge reads as a bug rather than as
         leaving, and how much room the travel needs depends on the shape of
         the canvas — so clamp, and let the geometry be approximate */
      var edge = rad * 2.4;
      var x = m.x, y = m.y;
      if (x < edge) x = edge; else if (x > W - edge) x = W - edge;
      if (y < edge) y = edge; else if (y > H - edge) y = H - edge;

      var a = m.alpha === undefined ? 0.95 : m.alpha;
      var g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.4);
      g.addColorStop(0, 'rgba(' + ink + ',' + a.toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(' + ink + ',' + (a * 0.34).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + ink + ',0)');
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
  assignRing();
  if (!measure()) return;

  if (still) { step(1, 0.4); draw(); return; }   /* held gathered, unmoving */

  /* Scroll sets where we are going; the loop decides how fast we get there,
     and the springs decide what that looks like. */
  var MAX_RATE = SPEED.rate;
  var SMOOTH = SPEED.chase;

  var cur = progress(), tgt = cur, raf = 0, lastT = 0, inView = true;
  step(cur, 0.4);        /* settle onto the opening arrangement */
  draw();

  function loop(now) {
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.05) dt = 0.05;     /* a backgrounded tab must not teleport it */
    if (dt <= 0) dt = 0.016;

    var d = tgt - cur;
    var move = d * (1 - Math.exp(-SMOOTH * dt));
    var cap = MAX_RATE * dt;
    if (move > cap) move = cap; else if (move < -cap) move = -cap;
    cur += move;

    step(cur, dt);
    draw();

    /* Unlike the old version this does NOT stop when the target is reached:
       the wander is the whole reason the resting state does not read as a
       diagram, so it runs for as long as the band is on screen. */
    if (inView) raf = requestAnimationFrame(loop);
    else raf = 0;
  }

  function start() {
    if (raf || !inView) return;
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function onScroll() { tgt = progress(); start(); }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      inView = es[0].isIntersecting;
      if (inView) start();
    }, { rootMargin: '80px' }).observe(cv);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    if (measure()) {
      for (var i = 0; i < marks.length; i++) marks[i].placed = false;
      cur = tgt = progress();
      step(cur, 0.4);
      draw();
    }
  });
  start();
})();
