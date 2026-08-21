/* Signed media URLs ---------------------------------------------------------
   Recordings and photos used to be fetched from public storage URLs, which
   open for anyone holding the address whether or not they belong to the
   keepsake. Everything now goes through here instead: the stored URL is
   turned into a short-lived signed one, scoped by the same membership rule
   that guards the memory row itself.

   Nanafy.mediaUrl(stored)   -> Promise<string>
   Nanafy.mediaUrls([...])   -> Promise<string[]>   (one round trip per URL,
                                                     but the cache means a
                                                     re-render is free)

   Rows in the database still hold absolute /object/public/ URLs, so this
   parses the bucket and path back out of whatever it is handed. Anything it
   does not recognise — a data: URI, an external image — is passed straight
   through untouched.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var N = window.Nanafy = window.Nanafy || {};
  if (N.mediaUrl) return;

  var TTL = 60 * 60;        /* seconds a signed URL is valid: one hour */
  var REFRESH_AT = 0.8;     /* re-sign once 80% of the window has gone */
  var BUCKETS = ['memory-photos', 'memory-audio'];

  var cache = Object.create(null);   /* "bucket/path" -> { url, expires } */

  /* Pull the bucket and object path out of a stored URL. Handles both the
     public form and the signed form, in case one gets stored by mistake. */
  function parse(stored) {
    if (!stored || typeof stored !== 'string') return null;
    for (var i = 0; i < BUCKETS.length; i++) {
      var b = BUCKETS[i];
      var marks = ['/storage/v1/object/public/' + b + '/',
                   '/storage/v1/object/sign/' + b + '/',
                   '/storage/v1/object/' + b + '/'];
      for (var j = 0; j < marks.length; j++) {
        var at = stored.indexOf(marks[j]);
        if (at !== -1) {
          var path = stored.slice(at + marks[j].length).split('?')[0];
          if (path) return { bucket: b, path: decodeURI(path) };
        }
      }
    }
    return null;
  }

  async function sign(bucket, path) {
    var key = bucket + '/' + path;
    var hit = cache[key];
    var now = Date.now();
    if (hit && hit.expires > now) return hit.url;

    var headers = await N.headers();      /* session token, or the anon key */
    var res = await fetch(N.SUPABASE_URL + '/storage/v1/object/sign/' + bucket + '/' +
                          path.split('/').map(encodeURIComponent).join('/'), {
      method: 'POST',
      headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: TTL })
    });
    if (!res.ok) throw new Error('sign ' + res.status);

    var data = await res.json();
    /* the API returns a root-relative path like /object/sign/bucket/key?token=… */
    var signed = data.signedURL || data.signedUrl;
    if (!signed) throw new Error('sign: no url');
    var url = signed.indexOf('http') === 0
      ? signed
      : N.SUPABASE_URL + '/storage/v1' + (signed.charAt(0) === '/' ? '' : '/') + signed;

    cache[key] = { url: url, expires: now + TTL * REFRESH_AT * 1000 };
    return url;
  }

  N.mediaUrl = async function (stored) {
    var bits = parse(stored);
    if (!bits) return stored;               /* not ours — leave it alone */
    try {
      return await sign(bits.bucket, bits.path);
    } catch (e) {
      /* While the buckets are still public the stored URL keeps working, so
         falling back means a signing hiccup never costs someone their
         grandmother's voice. Once the buckets are private this becomes a
         genuinely broken file, which is why it is noisy. */
      if (window.console) console.warn('[nanafy] could not sign media, using stored URL:', e.message);
      return stored;
    }
  };

  N.mediaUrls = function (list) {
    return Promise.all((list || []).map(function (u) { return N.mediaUrl(u); }));
  };

  /* Swap the media on an element once its signed URL arrives.

     Renderers across the site build their HTML as strings and drop it in with
     innerHTML, in a couple of dozen places. Rather than find and await every
     one of them — and silently break any that got missed — an observer picks
     up [data-media] wherever it appears, however it got there. */
  N.applyMedia = function (root) {
    var scope = root || document;
    var list = Array.prototype.slice.call(scope.querySelectorAll('[data-media]'));
    if (scope.nodeType === 1 && scope.hasAttribute('data-media')) list.push(scope);
    list.forEach(async function (el) {
      var stored = el.getAttribute('data-media');
      if (!stored || el.dataset.mediaDone === '1') return;
      el.dataset.mediaDone = '1';
      var url = await N.mediaUrl(stored);
      if (el.tagName === 'IMG' || el.tagName === 'AUDIO' || el.tagName === 'VIDEO'
          || el.tagName === 'SOURCE') {
        el.src = url;
      } else if (el.dataset.mediaAs === 'background') {
        var pre = el.dataset.mediaGradient ? el.dataset.mediaGradient + ', ' : '';
        el.style.backgroundImage = pre + 'url(' + JSON.stringify(url) + ')';
      } else {
        el.setAttribute('href', url);
      }
    });
  };

  /* Anything with data-media, whenever it shows up. */
  function watch() {
    N.applyMedia(document);
    if (!window.MutationObserver) return;
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.hasAttribute && n.hasAttribute('data-media')) N.applyMedia(n.parentNode || document);
          else if (n.querySelector && n.querySelector('[data-media]')) N.applyMedia(n);
        }
        if (records[i].type === 'attributes') N.applyMedia(document);
      }
    }).observe(document.documentElement, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['data-media']
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();
