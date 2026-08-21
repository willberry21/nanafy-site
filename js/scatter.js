/* The scatter ---------------------------------------------------------------
   Next to "a room fills with people who each hold a piece of someone. Then
   everyone goes home, and the pieces scatter."

   One mark per person. They start as a room — clustered, overlapping — and
   come apart as you scroll past, fading as they go. It is driven by scroll
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
  var COUNT = 34;
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
      var aw = rnd() * Math.PI * 2, rw = 0.55 + rnd() * 0.48;
      marks.push({
        /* the room: tight, overlapping, slightly off centre */
        hx: 0.5 + Math.cos(a) * r * 0.17,
        hy: 0.5 + Math.sin(a) * r * 0.20,
        /* gone: outward, uneven, some barely leaving. Held inside the frame —
           a mark clipped by the canvas edge reads as a bug, not as leaving. */
        ax: 0.5 + Math.cos(aw) * rw * 0.44,
        ay: 0.5 + Math.sin(aw) * rw * 0.38,
        size: 2.6 + rnd() * 5.2,
        ink: INKS[Math.floor(rnd() * INKS.length)],
        lag: rnd() * 0.42            /* they do not all leave at once */
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
    return true;
  }

  function ease(t) { return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }

  function draw(p) {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      /* each mark's own share of the journey, so the room empties unevenly */
      var t = (p - m.lag) / (1 - m.lag);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var e = ease(t);
      var x = (m.hx + (m.ax - m.hx) * e) * W;
      var y = (m.hy + (m.ay - m.hy) * e) * H;
      var alpha = 0.86 - 0.82 * e;
      var rad = m.size * (1 - 0.18 * e);
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
    var start = window.innerHeight * 0.86;
    var end = window.innerHeight * 0.18;
    var p = (start - r.top) / (start - end);
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  build();
  if (!measure()) return;

  if (still) { draw(0.42); return; }   /* held mid-scatter: the idea, unmoving */

  var last = -1, queued = false, inView = true;
  function frame() {
    queued = false;
    var p = progress();
    if (Math.abs(p - last) > 0.002) { last = p; draw(p); }
  }
  function onScroll() {
    if (queued || !inView) return;
    queued = true;
    requestAnimationFrame(frame);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      inView = es[0].isIntersecting;
      if (inView) onScroll();
    }, { rootMargin: '80px' }).observe(cv);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    if (measure()) { last = -1; onScroll(); }
  });
  frame();
})();
