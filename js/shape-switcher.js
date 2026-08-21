/* Shape switcher — a temporary control, not part of the site ----------------
   Lets William walk the real site and flip the shape as he goes, instead of
   judging it in a sandbox. The choice is stored, so it survives navigating
   between pages.

   It shows up only when asked for:  ?shapes=1  turns it on and remembers,
                                    ?shapes=0  turns it off again.
   No visitor sees it, and the whole file can be deleted once the shape is
   settled — nothing else refers to it.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var FLAG = 'nanafy_shape_switcher';
  var qs = new URLSearchParams(location.search);

  if (qs.has('shapes')) {
    try {
      if (qs.get('shapes') === '0') localStorage.removeItem(FLAG);
      else localStorage.setItem(FLAG, '1');
    } catch (e) {}
  }
  var on = false;
  try { on = localStorage.getItem(FLAG) === '1'; } catch (e) {}
  if (!on || !window.NanafyShapes) return;

  var S = window.NanafyShapes;
  var LABEL = { bloom: 'Bloom', ink: 'Ink', voice: 'Voice', petal: 'Petal', ball: 'Old ball' };

  var css = '\
  #shapeBar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;\
    display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;\
    padding:10px 14px;background:rgba(253,252,252,.92);-webkit-backdrop-filter:blur(14px);\
    backdrop-filter:blur(14px);border:1px solid #e8e3da;border-radius:999px;\
    box-shadow:0 18px 40px -22px rgba(18,24,28,.45);\
    font-family:"Josefin Sans",-apple-system,system-ui,sans-serif;max-width:calc(100vw - 24px)}\
  #shapeBar .lb{font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;\
    font-weight:600;color:#636f6b}\
  #shapeBar .grp{display:flex;border:1.5px solid #e8e3da;border-radius:999px;overflow:hidden;background:#fff}\
  #shapeBar button{appearance:none;border:0;background:transparent;cursor:pointer;font:inherit;\
    font-size:.8rem;font-weight:600;padding:8px 12px;color:#636f6b;min-height:38px}\
  #shapeBar button:hover{background:#f5f2ed;color:#12181c}\
  #shapeBar button[aria-pressed="true"]{background:#0a7a72;color:#fff}\
  #shapeBar label{display:flex;align-items:center;gap:6px;font-size:.8rem;font-weight:600;color:#636f6b;cursor:pointer}\
  #shapeBar input{width:15px;height:15px;accent-color:#0a7a72;cursor:pointer}\
  #shapeBar .x{color:#636f6b;text-decoration:none;font-size:1rem;padding:0 4px}\
  @media(max-width:820px){#shapeBar{gap:6px;padding:6px 8px;flex-wrap:nowrap;\
    overflow-x:auto;justify-content:flex-start;border-radius:14px;\
    left:8px;right:8px;transform:none;max-width:none}\
    #shapeBar .lb{display:none}\
    #shapeBar button{padding:6px 9px;font-size:.72rem;min-height:34px;white-space:nowrap}\
    #shapeBar .grp{flex:none}#shapeBar label{flex:none;white-space:nowrap}}';

  function el(tag, attrs, txt) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (txt != null) n.textContent = txt;
    return n;
  }

  function build() {
    var style = el('style'); style.textContent = css; document.head.appendChild(style);
    var cur = S.get();
    var bar = el('div', { id: 'shapeBar', role: 'group', 'aria-label': 'Shape preview' });

    bar.appendChild(el('span', { class: 'lb' }, 'Shape'));
    var g1 = el('div', { class: 'grp' });
    S.shapes.forEach(function (name) {
      var b = el('button', { type: 'button', 'data-shape': name,
        'aria-pressed': String(name === cur.shape) }, LABEL[name] || name);
      g1.appendChild(b);
    });
    bar.appendChild(g1);

    bar.appendChild(el('span', { class: 'lb' }, 'Pace'));
    var g2 = el('div', { class: 'grp' });
    [['0.5', 'Barely'], ['1', 'Alive'], ['1.8', 'Restless']].forEach(function (p) {
      g2.appendChild(el('button', { type: 'button', 'data-pace': p[0],
        'aria-pressed': String(Math.abs(cur.pace - +p[0]) < 0.01) }, p[1]));
    });
    bar.appendChild(g2);

    var lab = el('label');
    var cb = el('input', { type: 'checkbox' });
    cb.checked = cur.grain;
    lab.appendChild(cb); lab.appendChild(el('span', null, 'Grain'));
    bar.appendChild(lab);

    var close = el('a', { class: 'x', href: '?shapes=0', title: 'Hide this bar' }, '✕');
    bar.appendChild(close);

    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.shape) {
        S.set({ shape: b.dataset.shape });
        g1.querySelectorAll('button').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
      } else if (b.dataset.pace) {
        S.set({ pace: +b.dataset.pace });
        g2.querySelectorAll('button').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
      }
    });
    cb.addEventListener('change', function () { S.set({ grain: cb.checked }); });

    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
