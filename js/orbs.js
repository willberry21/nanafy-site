/* Living orbs ---------------------------------------------------------------
   Spheres whose colour is generated live inside them and keeps folding
   through itself, so it never loops and never repeats. The trick is that the
   colour is computed on an 80px canvas and blown up with smoothing — that
   upscale is what makes it silk instead of five visible blobs. Then a soft
   overlay highlight, a rim that falls away so it reads as a ball, and film
   grain over the top.

   No libraries, no WebGL, no video. ~40fps, and it stops entirely when it
   scrolls out of view.

   Markup:  <div class="orb" data-orb data-pal="2"><canvas></canvas></div>
            CSS owns the size; this reads it back.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var nodes = document.querySelectorAll('[data-orb]');
  if (!nodes.length) return;

  /* Half & half: their purple / orange / mauve, mixed with our turquoise.
     Each entry is [base, [blob colours]] as plain rgb triples. */
  var PALETTES = [
    [[198,178,246], [[240,232,255],[150,116,244],[86,58,186],[255,226,240],[186,150,252]]],
    [[128,224,212], [[230,253,249],[46,206,192],[11,138,131],[255,244,224],[170,242,232]]],
    [[250,166,110], [[255,236,208],[252,138,66],[206,70,30],[255,214,178],[255,178,116]]],
    [[142,228,218], [[236,253,250],[52,208,195],[12,146,138],[254,240,218],[176,244,234]]],
    [[214,186,238], [[246,236,255],[168,132,236],[102,68,176],[255,232,244],[196,164,244]]]
  ];

  var FIELD = 80;
  var STEP = 1000 / 40;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* one grain tile, shared */
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

  function Orb(el) {
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

    this.pattern = this.ctx.createPattern(grain, 'repeat');
    this.measure();
  }

  Orb.prototype.measure = function () {
    var w = this.el.clientWidth;
    if (!w || w === this.size) return;
    this.size = w;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(w * dpr);
  };

  Orb.prototype.field = function (t) {
    var x = this.lowCtx, s = FIELD;
    var base = this.pal[0], blobs = this.pal[1];
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = 'rgb(' + base + ')';
    x.fillRect(0, 0, s, s);

    for (var i = 0; i < blobs.length; i++) {
      var c = blobs[i];
      var ph = this.seed + i * 2.4;
      var sp = 0.00019 + i * 0.000075;
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

  Orb.prototype.draw = function (t) {
    if (!this.size) return;
    this.field(t);

    var c = this.ctx, S = this.cv.width;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    c.clip();

    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.low, 0, 0, S, S);

    /* light from the upper left — gentle, or it turns to plastic */
    c.globalCompositeOperation = 'overlay';
    var g = c.createRadialGradient(S * .34, S * .28, S * .04, S * .34, S * .28, S * .86);
    g.addColorStop(0, 'rgba(255,255,255,.26)');
    g.addColorStop(.42, 'rgba(255,255,255,.05)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);

    /* only the rim falls away: keeps the colour, still reads as a ball */
    c.globalCompositeOperation = 'source-over';
    g = c.createRadialGradient(S * .44, S * .40, S * .30, S * .5, S * .5, S * .54);
    g.addColorStop(0, 'rgba(24,20,28,0)');
    g.addColorStop(.72, 'rgba(24,20,28,.05)');
    g.addColorStop(.92, 'rgba(24,20,28,.16)');
    g.addColorStop(1, 'rgba(24,20,28,.30)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);

    /* specular pin */
    c.globalCompositeOperation = 'screen';
    g = c.createRadialGradient(S * .30, S * .24, 0, S * .30, S * .24, S * .17);
    g.addColorStop(0, 'rgba(255,255,255,.34)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);

    /* the grain is the difference between a plastic ball and something filmic */
    if (this.pattern) {
      c.globalCompositeOperation = 'overlay';
      c.globalAlpha = .34;
      c.fillStyle = this.pattern;
      c.fillRect(0, 0, S, S);
      c.globalAlpha = 1;
    }

    c.globalCompositeOperation = 'source-over';
    c.restore();
  };

  var orbs = [];
  for (var i = 0; i < nodes.length; i++) orbs.push(new Orb(nodes[i]));

  /* don't burn cycles on spheres nobody is looking at */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        for (var j = 0; j < orbs.length; j++) {
          if (orbs[j].el === e.target) { orbs[j].visible = e.isIntersecting; break; }
        }
      });
    }, { rootMargin: '120px' });
    orbs.forEach(function (o) { io.observe(o.el); });
  }

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      orbs.forEach(function (o) { o.measure(); if (still) o.draw(4200); });
    }, 180);
  });

  if (still) {
    /* one frame, held: the colour is still lovely, it just doesn't move */
    orbs.forEach(function (o) { o.draw(4200); });
    return;
  }

  var clock = 0, last = performance.now(), acc = 0;
  function tick(now) {
    var dt = Math.min(now - last, 60);
    last = now;
    clock += dt;
    acc += dt;
    if (acc >= STEP) {
      acc = 0;
      for (var k = 0; k < orbs.length; k++) if (orbs[k].visible) orbs[k].draw(clock);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
