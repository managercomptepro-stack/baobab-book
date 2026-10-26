/* ============================================================================
   BAOBAB BOOK — ACCÈS AUX DONNÉES (partagé par le site et la gestion)

   Le catalogue est le fichier catalogue.json du dépôt GitHub (GITHUB_REPO).
   - Le site le lit sur raw.githubusercontent.com (à jour en ~1 min) et sur la
     copie hébergée avec le site : la première réponse valide est affichée,
     puis remplacée si l'autre est plus récente. Un service lent ne bloque rien.
   - La gestion l'écrit directement dans le dépôt (API GitHub) avec une clé
     d'accès personnelle. Aucun serveur, ni Google, ni Netlify.
   ============================================================================ */
(function(){
  'use strict';

  var REPO = (typeof GITHUB_REPO === 'string' ? GITHUB_REPO : '').trim();
  var BRANCH = (typeof GITHUB_BRANCH === 'string' && GITHUB_BRANCH) || 'main';
  var GH = /^[\w.-]+\/[\w.-]+$/.test(REPO);
  var RAW = GH ? 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/' : '';
  var KEY_CACHE = 'bb-cache-v1';

  /* Racine du site (là où se trouve assets/) */
  var ROOT = (function(){
    var sc = document.currentScript && document.currentScript.src;
    return sc ? sc.replace(/assets\/js\/store\.js.*$/, '') : '';
  })();

  function ls(key, val){
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key));
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch(e){ return null; }
    return true;
  }

  /* ---------------- Normalisation ---------------- */
  function num(v, d){ var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : (d || 0); }
  function bool(v, d){ if (v === undefined || v === '') return !!d; return v === true || v === 1 || /^(true|1|oui|yes)$/i.test(String(v)); }
  function str(v){ return v == null ? '' : String(v); }
  function list(v){ return (Array.isArray(v) ? v : str(v).split(/\s*\n\s*/)).map(str).map(function(s){ return s.trim(); }).filter(Boolean); }

  function normBook(b){
    return {
      id: str(b.id), no: Math.max(0, Math.round(num(b.no))), cat: str(b.cat), title: str(b.title), hook: str(b.hook),
      desc: str(b.desc), points: list(b.points).slice(0, 5), pages: Math.max(0, Math.round(num(b.pages))),
      format: str(b.format) || 'Livre', cover: str(b.cover), previews: list(b.previews).slice(0, 3),
      active: bool(b.active, true), top: Math.round(num(b.top)), hero: str(b.hero)
    };
  }
  function normPack(p){
    return {
      id: str(p.id), name: str(p.name), sub: str(p.sub), univers: str(p.univers), books: list(p.books),
      price: Math.max(0, Math.round(num(p.price))), active: bool(p.active, true), top: Math.round(num(p.top))
    };
  }
  function normReview(r){
    return { id: str(r.id), name: str(r.name), city: str(r.city), text: str(r.text), photo: str(r.photo), active: bool(r.active, true) };
  }
  function normDb(db){
    db = db || {};
    var s = db.settings || {};
    var pp = s.packPrices || {};
    return {
      updated: str(db.updated),
      settings: {
        shopName: str(s.shopName) || 'Baobab Book',
        tagline: str(s.tagline) || 'Librairie en ligne africaine',
        whatsapp: str(s.whatsapp).replace(/\D/g, ''),
        priceBook: Math.round(num(s.priceBook, 1000)) || 1000,
        packPrices: { '5': Math.round(num(pp['5'], 3500)), '10': Math.round(num(pp['10'], 6000)) },
        heroPrefix: str(s.heroPrefix) || "Le livre qui va t'aider à",
        guarantee: str(s.guarantee) || 'Pas reçu = remboursé',
        facebook: str(s.facebook),
        countries: list(s.countries).length ? list(s.countries) : ['Cameroun', 'Autre pays']
      },
      categories: (db.categories || []).filter(function(c){ return c && c.id; })
        .map(function(c){ return {id: str(c.id), label: str(c.label) || str(c.id), color: str(c.color) || '#E8B54A'}; }),
      books: (db.books || []).map(normBook).filter(function(b){ return b.id && b.title; }),
      packs: (db.packs || []).map(normPack).filter(function(p){ return p.id && p.name; }),
      univers: db.univers || {},
      reviews: (db.reviews || []).map(normReview).filter(function(r){ return r.id && (r.text || r.photo); })
    };
  }

  /* ---------------- Règles de prix ---------------- */
  function packPrice(p, s){
    if (p.price > 0) return p.price;
    var n = p.books.length;
    if (s.packPrices[String(n)]) return s.packPrices[String(n)];
    return Math.round(n * s.priceBook * 0.7 / 100) * 100;   /* autre taille : −30 % */
  }
  function fmt(n){ return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F'; }
  /* Adresse d'une image : chemin du dépôt (assets/…) servi par le site, sinon tel quel */
  function img(src){
    src = str(src);
    if (!src) return '';
    if (/^assets\//.test(src)) return ROOT + src;
    return src;
  }
  /* Secours si l'image n'est pas (encore) sur l'hébergement : copie GitHub */
  function imgFallback(src){ return GH && /^assets\//.test(str(src)) ? RAW + src : ''; }

  /* ---------------- Réseau ---------------- */
  function timed(url, opts, ms){
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctrl) opts.signal = ctrl.signal;
    return new Promise(function(resolve, reject){
      var t = setTimeout(function(){ if (ctrl) ctrl.abort(); reject(new Error('Délai dépassé : la connexion ne répond pas.')); }, ms);
      fetch(url, opts).then(function(r){ clearTimeout(t); resolve(r); }, function(){ clearTimeout(t); reject(new Error('Pas de connexion internet.')); });
    });
  }
  function getJSON(url, ms){
    return timed(url, {method: 'GET', cache: 'no-store'}, ms || 8000).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(d){
      var db = normDb(d);
      if (!db.books.length) throw new Error('catalogue vide');
      return db;
    });
  }

  /* ---------------- Chargement du catalogue (site) ----------------
     onData(db) est appelé une première fois avec la réponse la plus rapide,
     puis une seconde fois si une version plus récente arrive. */
  function load(onData){
    var best = null, pending = 0, done = false;
    function offer(db){
      if (best && db.updated <= best.updated) return;
      best = db; ls(KEY_CACHE, db);
      try { onData(db); } catch(e){ if (window.console) console.error(e); }
    }
    var sources = [ROOT + 'catalogue.json?v=' + Math.floor(Date.now() / 60000)];
    if (GH) sources.unshift(RAW + 'catalogue.json?t=' + Math.floor(Date.now() / 60000));
    return new Promise(function(resolve, reject){
      sources.forEach(function(u){
        pending++;
        getJSON(u, 9000).then(offer, function(){}).then(function(){
          if (--pending === 0 && !done){ done = true; best ? resolve(best) : fail(); }
          else if (best && !done){ done = true; resolve(best); }
        });
      });
      function fail(){
        var c = ls(KEY_CACHE);
        if (c){ best = normDb(c); onData(best); resolve(best); }
        else reject(new Error('Catalogue introuvable'));
      }
    });
  }

  /* ============================================================
     GESTION (administration) — écriture dans le dépôt GitHub
     ============================================================ */
  var KEY_TOKEN = 'bb-gh-key';
  function token(){ try { return localStorage.getItem(KEY_TOKEN) || sessionStorage.getItem(KEY_TOKEN) || ''; } catch(e){ return ''; } }
  function setToken(t, keep){
    try {
      localStorage.removeItem(KEY_TOKEN); sessionStorage.removeItem(KEY_TOKEN);
      if (t) (keep ? localStorage : sessionStorage).setItem(KEY_TOKEN, t);
    } catch(e){}
  }
  function gh(method, path, body, tok){
    var headers = {'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + (tok || token())};
    if (body) headers['Content-Type'] = 'application/json';
    return timed('https://api.github.com/repos/' + REPO + path, {
      method: method, headers: headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined
    }, 90000).then(function(r){
      return r.text().then(function(t){
        var j = null; try { j = t ? JSON.parse(t) : null; } catch(e){}
        if (!r.ok){
          var msg = r.status === 401 ? 'Clé d’accès invalide ou expirée.'
            : (r.status === 403 || r.status === 404) ? 'Cette clé n’a pas le droit de modifier le dépôt ' + REPO + (j && j.message ? ' (' + j.message + ')' : '') + '.'
            : (j && j.message) || ('Erreur GitHub ' + r.status);
          var e = new Error(msg); e.status = r.status; throw e;
        }
        return j;
      });
    });
  }
  function b64enc(s){
    var bytes = new TextEncoder().encode(s), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64dec(b64){
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function ghRead(){
    return gh('GET', '/contents/catalogue.json?ref=' + encodeURIComponent(BRANCH)).then(function(f){
      /* Au-delà de 1 Mo, l'API ne renvoie pas le contenu : on passe par le blob */
      var content = f.content ? Promise.resolve(f.content) : gh('GET', '/git/blobs/' + f.sha).then(function(b){ return b.content; });
      return content.then(function(c){ return {db: normDb(JSON.parse(b64dec(c))), sha: f.sha}; });
    });
  }
  function ghWrite(db, sha, message){
    db.updated = new Date().toISOString();
    var text = JSON.stringify({updated: db.updated, settings: db.settings, categories: db.categories,
      books: db.books, packs: db.packs, univers: db.univers, reviews: db.reviews}) + '\n';
    return gh('PUT', '/contents/catalogue.json', {message: message, content: b64enc(text), sha: sha, branch: BRANCH})
      .then(function(){ ls(KEY_CACHE, db); return db; });
  }
  /* Lit la dernière version, applique la modification, enregistre.
     En cas de conflit (deux modifications en même temps), recommence une fois. */
  function commit(mutate, message){
    function attempt(retry){
      return ghRead().then(function(cur){
        var result = mutate(cur.db);
        return ghWrite(cur.db, cur.sha, message).then(function(db){ return {db: db, result: result}; });
      })['catch'](function(e){
        if (retry && (e.status === 409 || e.status === 422)) return attempt(false);
        throw e;
      });
    }
    return attempt(true);
  }

  /* Réduit une photo avant l'envoi */
  function shrink(file, max, quality){
    return new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function(){
        var k = Math.min(1, max / Math.max(im.width, im.height));
        var c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      im.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
      im.src = url;
    });
  }
  function slug(s){
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
  }

  var admin = {
    repo: REPO,
    login: function(secret, keep){
      secret = String(secret || '').trim();
      if (!GH) return Promise.reject(new Error('GITHUB_REPO n’est pas réglé dans assets/js/config.js.'));
      if (secret.length < 20) return Promise.reject(new Error('Colle la clé GitHub complète (elle commence par github_pat_ ou ghp_).'));
      /* Test d'écriture sans rien modifier : on envoie une mise à jour avec une
         empreinte (sha) volontairement fausse. Si la clé a le droit d'écrire,
         GitHub répond 409/422 (conflit) ; sinon 403/404. Le fichier n'est jamais touché. */
      function probe(){
        var headers = {'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'};
        return timed('https://api.github.com/repos/' + REPO + '/contents/catalogue.json', {
          method: 'PUT', headers: headers, cache: 'no-store',
          body: JSON.stringify({message: 'test', content: b64enc('test'), sha: '0000000000000000000000000000000000000000', branch: BRANCH})
        }, 30000).then(function(r){
          if (r.status === 409 || r.status === 422 || r.ok) return true;
          return r.text().then(function(t){
            var m = ''; try { m = JSON.parse(t).message || ''; } catch(e){}
            var e = new Error(r.status === 401 ? 'Clé d’accès invalide ou expirée.'
              : 'GitHub refuse l’écriture (' + r.status + (m ? ' : ' + m : '') + '). Dans la clé : « Repository access » = « Only select repositories » → ' + REPO + ', puis « Repository permissions » → « Contents » = « Read and write ».');
            e.status = r.status; throw e;
          });
        });
      }
      return gh('GET', '', null, secret).then(function(){ return probe(); }).then(function(){
        setToken(secret, keep !== false);
        return true;
      });
    },
    logout: function(){ setToken(''); },
    isLogged: function(){ return !!token(); },
    load: function(){ return ghRead().then(function(cur){ ls(KEY_CACHE, cur.db); return cur.db; }); },
    commit: commit,
    /* Envoie une image dans assets/uploads/ et renvoie son chemin */
    upload: function(file, max){
      return shrink(file, max || 1200, 0.84).then(function(dataUrl){
        var name = slug((file.name || 'image').replace(/\.[^.]+$/, '')) + '-' + Date.now().toString(36) + '.jpg';
        var path = 'assets/uploads/' + name;
        return gh('PUT', '/contents/' + path, {message: 'Image ' + name, content: dataUrl.split(',')[1], branch: BRANCH})
          .then(function(){ return path; });
      });
    }
  };

  window.BB = {
    repo: REPO, raw: RAW, root: ROOT, load: load, normDb: normDb, normBook: normBook, normPack: normPack, normReview: normReview,
    packPrice: packPrice, fmt: fmt, img: img, imgFallback: imgFallback, store: ls, admin: admin
  };
})();
