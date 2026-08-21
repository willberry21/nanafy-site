/* The voice player ----------------------------------------------------------
   One player, used by the homepage and by the sample keepsake. A memory is
   marked up as:

     <div class="kv-row kv-voice" data-voice="/audio/paul.m4a" data-seconds="14">
       <button class="kv-play"></button>
       <div class="kv-body"><div class="kv-bars"></div>…</div>
       <span class="kv-time">0:14</span>
     </div>

   The waveform is drawn from a seed rather than decoded from the file: the
   real shape needs the whole clip downloaded before anything can be painted,
   and on a memorial page nobody should wait to see that a voice exists. It is
   stable per URL, so a memory always looks like itself.

   One voice at a time — a room of them talking over each other is the opposite
   of the point.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var rows = document.querySelectorAll('[data-voice]');
  if (!rows.length) return;

  var BARS = 44;
  var PLAY = '<svg width="15" height="17" viewBox="0 0 15 17" aria-hidden="true">' +
             '<path d="M2 1.4v14.2L13.6 8.5z" fill="currentColor"/></svg>';
  var PAUSE = '<svg width="13" height="15" viewBox="0 0 13 15" aria-hidden="true">' +
              '<rect x="1" y="1" width="4" height="13" rx="1.2" fill="currentColor"/>' +
              '<rect x="8" y="1" width="4" height="13" rx="1.2" fill="currentColor"/></svg>';

  function seedOf(s) {           /* same url -> same waveform, every visit */
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }

  function fmt(t) {
    if (!isFinite(t) || t < 0) return '0:00';
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  var current = null;

  function makeBars(box, url) {
    var s = seedOf(url);
    for (var i = 0; i < BARS; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      var n = s / 0x7fffffff;
      /* tapered, so it reads as speech rather than as noise */
      var env = Math.sin((i + 0.5) / BARS * Math.PI);
      var bar = document.createElement('i');
      bar.style.height = (4 + Math.round((3 + n * 20) * (0.45 + 0.55 * env))) + 'px';
      box.appendChild(bar);
    }
  }

  function wire(row) {
    var url = row.getAttribute('data-voice');
    var btn = row.querySelector('.kv-play');
    var barBox = row.querySelector('.kv-bars');
    var time = row.querySelector('.kv-time');
    if (!btn || !barBox) return;

    makeBars(barBox, url);
    var bars = Array.prototype.slice.call(barBox.children);
    btn.innerHTML = PLAY;
    btn.setAttribute('aria-pressed', 'false');

    var audio = new Audio();
    audio.preload = 'metadata';
    var loaded = false;
    var total = row.getAttribute('data-seconds')
      ? fmt(+row.getAttribute('data-seconds')) : '0:00';
    if (time) time.textContent = total;

    var card = {
      stop: function () {
        audio.pause();
        btn.innerHTML = PLAY;
        btn.setAttribute('aria-pressed', 'false');
        bars.forEach(function (b) { b.classList.remove('on', 'now'); });
        if (time) time.textContent = total;
      }
    };

    audio.addEventListener('loadedmetadata', function () {
      total = fmt(audio.duration);
      if (btn.getAttribute('aria-pressed') !== 'true' && time) time.textContent = total;
    });

    audio.addEventListener('timeupdate', function () {
      if (!audio.duration) return;
      var upto = Math.floor(audio.currentTime / audio.duration * bars.length);
      for (var i = 0; i < bars.length; i++) {
        bars[i].classList.toggle('on', i < upto);
        bars[i].classList.toggle('now', i === upto);
      }
      if (time) time.textContent = fmt(audio.duration - audio.currentTime);
    });

    audio.addEventListener('ended', function () { card.stop(); current = null; });
    audio.addEventListener('error', function () {
      card.stop(); current = null;
      if (time) time.textContent = '—';
      btn.disabled = true;
      btn.title = 'This recording could not be loaded';
    });

    btn.addEventListener('click', function () {
      if (btn.getAttribute('aria-pressed') === 'true') { card.stop(); current = null; return; }
      if (current && current !== card) current.stop();
      current = card;
      /* the src is set on first press, so nothing downloads until asked */
      if (!loaded) { audio.src = url; loaded = true; }
      btn.innerHTML = PAUSE;
      btn.setAttribute('aria-pressed', 'true');
      var p = audio.play();
      if (p && p.catch) p.catch(function () { card.stop(); current = null; });
    });

    barBox.addEventListener('click', function (e) {
      if (!audio.duration) return;
      var r = barBox.getBoundingClientRect();
      audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
    });
  }

  rows.forEach(wire);
})();
