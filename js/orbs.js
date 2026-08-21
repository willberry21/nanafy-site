/* Living shapes -------------------------------------------------------------
   Colour that is generated live and keeps folding through itself, cut to a
   shape. The colour engine is unchanged from the first version; the shape is
   a swappable alpha mask, which is the whole point.

   A hard circular edge plus a specular highlight plus a drop shadow adds up to
   an object sitting on a surface — which is why the original read as gym
   equipment. Every shape here except 'ball' drops all three.

     bloom  no edge at all; the colour stops being. Light, not a thing.
     ink    flat, unshaded, heavy grain. Printed ink.
     voice  the outline is a waveform wrapped into a circle.
     petal  the sunflower, turning.
     ball   the original, kept only for comparison.

   Markup:  <div class="orb" data-orb data-pal="2"><canvas></canvas></div>
            CSS owns the laid-out size; the canvas is drawn larger than that so
            a soft edge has somewhere to fade into.

   Shape, pace and grain come from localStorage so a choice survives moving
   around the site. window.NanafyShapes.set() changes it live.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var SHAPES = ['bloom', 'ink', 'voice', 'petal', 'ball'];
  var DEFAULT = 'voice';
  var STORE = 'nanafy_shape';

  function readPrefs() {
    var p = { shape: DEFAULT, pace: 1, grain: true };
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        var v = JSON.parse(raw);
        if (SHAPES.indexOf(v.shape) !== -1) p.shape = v.shape;
        if (+v.pace > 0) p.pace = +v.pace;
        if (typeof v.grain === 'boolean') p.grain = v.grain;
      }
    } catch (e) {}
    return p;
  }

  var prefs = readPrefs();
  document.documentElement.setAttribute('data-shape', prefs.shape);

  /* Half & half: their purple / orange / mauve mixed with our turquoise */
  var PALETTES = [
    [[198,178,246], [[240,232,255],[150,116,244],[86,58,186],[255,226,240],[186,150,252]]],
    [[128,224,212], [[230,253,249],[46,206,192],[11,138,131],[255,244,224],[170,242,232]]],
    [[250,166,110], [[255,236,208],[252,138,66],[206,70,30],[255,214,178],[255,178,116]]],
    [[142,228,218], [[236,253,250],[52,208,195],[12,146,138],[254,240,218],[176,244,234]]],
    [[214,186,238], [[246,236,255],[168,132,236],[102,68,176],[255,232,244],[196,164,244]]]
  ];

  var FIELD = 80;
  var STEP = 1000 / 40;
  var PAD = 0.28;            /* extra canvas around the shape, for soft edges */
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var grain = document.createElement('canvas');
  grain.width = grain.height = 220;
  (function () {
    var g = grain.getContext('2d');
    var d = g.createImageData(grain.width, grain.height);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = 118 + Math.random() * 74;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
  })();

  function Fig(el) {
    this.el = el;
    this.cv = el.querySelector('canvas');
    if (!this.cv) { this.cv = document.createElement('canvas'); el.appendChild(this.cv); }
    this.ctx = this.cv.getContext('2d');
    this.pal = PALETTES[(+el.dataset.pal || 0) % PALETTES.length];
    this.seed = Math.random() * 9000;
    this.visible = true;
    this.size = 0;

    this.low = document.createElement('canvas');
    this.low.width = this.low.height = FIELD;
    this.lowCtx = this.low.getContext('2d');
    this.mask = document.createElement('canvas');
    this.maskCtx = this.mask.getContext('2d');
    this.pattern = this.ctx.createPattern(grain, 'repeat');
    this.measure();
  }

  Fig.prototype.measure = function () {
    var w = this.el.clientWidth;
    if (!w || w === this.size) return;
    this.size = w;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    var box = Math.round(w * (1 + PAD * 2));
    this.box = box;
    this.cv.width = this.mask.width = Math.round(box * this.dpr);
    this.cv.height = this.mask.height = Math.round(box * this.dpr);
    /* the canvas spills past the element; the element keeps its layout size */
    this.cv.style.width = this.cv.style.height = box + 'px';
    this.cv.style.position = 'absolute';
    this.cv.style.left = '50%';
    this.cv.style.top = '50%';
    this.cv.style.transform = 'translate(-50%,-50%)';
    this.cv.style.pointerEvents = 'none';
  };

  Fig.prototype.field = function (t) {
    var x = this.lowCtx, s = FIELD;
    var base = this.pal[0], blobs = this.pal[1];
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = 'rgb(' + base + ')';
    x.fillRect(0, 0, s, s);
    for (var i = 0; i < blobs.length; i++) {
      var c = blobs[i], ph = this.seed + i * 2.4, sp = 0.00019 + i * 0.000075;
      var cx = s * (0.5 + 0.40 * Math.sin(t * sp + ph));
      var cy = s * (0.5 + 0.40 * Math.cos(t * sp * 1.27 + ph * 1.6));
      var r = s * (0.40 + 0.20 * Math.sin(t * sp * 0.83 + ph * 0.7));
      var g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(r, 1));
      g.addColorStop(0, 'rgba(' + c + ',0.92)');
      g.addColorStop(0.55, 'rgba(' + c + ',0.42)');
      g.addColorStop(1, 'rgba(' + c + ',0)');
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
    }
  };

  /* Every shape is only an alpha mask. That is the entire difference. */
  Fig.prototype.buildMask = function (t) {
    var m = this.maskCtx, S = this.mask.width, c = S / 2;
    var R = (this.size / 2) * this.dpr;
    var shape = prefs.shape;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, S, S);
    m.globalCompositeOperation = 'source-over';
    m.fillStyle = '#000';

    if (shape === 'bloom') {
      var g = m.createRadialGradient(c, c, 0, c, c, R * 1.34);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(.42, 'rgba(0,0,0,.85)');
      g.addColorStop(.72, 'rgba(0,0,0,.32)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = g;
      m.fillRect(0, 0, S, S);

    } else if (shape === 'ink') {
      m.beginPath(); m.arc(c, c, R * 0.9, 0, Math.PI * 2); m.fill();
      var g2 = m.createRadialGradient(c, c, R * 0.9, c, c, R * 1.02);
      g2.addColorStop(0, 'rgba(0,0,0,1)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = g2; m.fillRect(0, 0, S, S);

    } else if (shape === 'voice') {
      var N = 240;
      m.beginPath();
      for (var i = 0; i <= N; i++) {
        var a = i / N * Math.PI * 2, amp = 0;
        for (var k = 1; k <= 5; k++) amp += Math.sin(a * (k * 3 + 1) + t * 0.00042 * k + this.seed) / k;
        var rr = R * (0.80 + 0.16 * (amp / 2.2));
        var px = c + Math.cos(a) * rr, py = c + Math.sin(a) * rr;
        i ? m.lineTo(px, py) : m.moveTo(px, py);
      }
      m.closePath(); m.fill();
      var g3 = m.createRadialGradient(c, c, R * 0.55, c, c, R);
      g3.addColorStop(0, 'rgba(0,0,0,1)');
      g3.addColorStop(1, 'rgba(0,0,0,.55)');
      m.globalCompositeOperation = 'destination-in';
      m.fillStyle = g3; m.fillRect(0, 0, S, S);
      m.globalCompositeOperation = 'source-over';

    } else if (shape === 'petal') {
      m.save(); m.translate(c, c); m.rotate(t * 0.000035 + this.seed);
      for (var p = 0; p < 12; p++) {
        m.save(); m.rotate(p / 12 * Math.PI * 2);
        m.beginPath();
        m.moveTo(0, -R * 0.96);
        m.bezierCurveTo(R * 0.20, -R * 0.66, R * 0.20, -R * 0.30, 0, -R * 0.12);
        m.bezierCurveTo(-R * 0.20, -R * 0.30, -R * 0.20, -R * 0.66, 0, -R * 0.96);
        m.fill(); m.restore();
      }
      m.beginPath(); m.arc(0, 0, R * 0.40, 0, Math.PI * 2); m.fill();
      m.restore();

    } else {
      m.beginPath(); m.arc(c, c, R, 0, Math.PI * 2); m.fill();
    }
  };

  Fig.prototype.draw = function (t) {
    if (!this.size) return;
    this.field(t);
    var c = this.ctx, S = this.cv.width, mid = S / 2;
    var R = (this.size / 2) * this.dpr;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S, S);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.low, 0, 0, S, S);

    /* the gloss belongs to the ball, and only to the ball */
    if (prefs.shape === 'ball') {
      c.globalCompositeOperation = 'overlay';
      var g = c.createRadialGradient(mid - R * .32, mid - R * .44, R * .04,
                                     mid - R * .32, mid - R * .44, R * 1.7);
      g.addColorStop(0, 'rgba(255,255,255,.26)');
      g.addColorStop(.42, 'rgba(255,255,255,.05)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
      c.globalCompositeOperation = 'source-over';
      g = c.createRadialGradient(mid, mid, R * .6, mid, mid, R * 1.08);
      g.addColorStop(0, 'rgba(24,20,28,0)');
      g.addColorStop(.92, 'rgba(24,20,28,.16)');
      g.addColorStop(1, 'rgba(24,20,28,.30)');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
    }

    if (prefs.grain && this.pattern) {
      c.globalCompositeOperation = 'overlay';
      c.globalAlpha = prefs.shape === 'ink' ? .5 : .34;
      c.fillStyle = this.pattern; c.fillRect(0, 0, S, S);
      c.globalAlpha = 1;
    }

    this.buildMask(t);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(this.mask, 0, 0);
    c.globalCompositeOperation = 'source-over';
  };

  var figs = [];
  function collect() {
    document.querySelectorAll('[data-orb]').forEach(function (el) {
      for (var i = 0; i < figs.length; i++) if (figs[i].el === el) return;
      figs.push(new Fig(el));
    });
  }
  collect();
  if (!figs.length) return;

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        for (var j = 0; j < figs.length; j++) {
          if (figs[j].el === e.target) { figs[j].visible = e.isIntersecting; break; }
        }
      });
    }, { rootMargin: '120px' });
    figs.forEach(function (f) { io.observe(f.el); });
  }

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      figs.forEach(function (f) { f.measure(); if (still) f.draw(4200); });
    }, 180);
  });

  var clock = 0;
  function drawAll() { figs.forEach(function (f) { f.draw(clock); }); }

  window.NanafyShapes = {
    shapes: SHAPES,
    get: function () { return { shape: prefs.shape, pace: prefs.pace, grain: prefs.grain }; },
    set: function (next) {
      if (next.shape && SHAPES.indexOf(next.shape) !== -1) prefs.shape = next.shape;
      if (next.pace) prefs.pace = +next.pace;
      if (typeof next.grain === 'boolean') prefs.grain = next.grain;
      document.documentElement.setAttribute('data-shape', prefs.shape);
      try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (e) {}
      figs.forEach(function (f) { f.measure(); });
      drawAll();
    }
  };

  if (still) { drawAll(); return; }

  var last = performance.now(), acc = 0;
  function tick(now) {
    var dt = Math.min(now - last, 60);
    last = now;
    clock += dt * prefs.pace;
    acc += dt;
    if (acc >= STEP) {
      acc = 0;
      for (var k = 0; k < figs.length; k++) if (figs[k].visible) figs[k].draw(clock);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
