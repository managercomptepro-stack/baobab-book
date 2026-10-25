/* ============================================================
   BAOBAB BOOK — ESPACE DE GESTION (/gestion/)
   Chaque enregistrement écrit catalogue.json dans le dépôt GitHub :
   le site affiche la modification en ~1 minute.
   ============================================================ */
(function(){
  'use strict';

  var $ = function(id){ return document.getElementById(id); };
  var A = BB.admin, DB = null, tab = 'books', bq = '', bcat = '', bshow = 60;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function norm(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function no3(n){ return 'N°' + String(n).padStart(3, '0'); }
  function src(p){ return esc(BB.img(p)); }
  function fbAttr(p){ var f = BB.imgFallback(p); return f ? ' data-fb="' + esc(f) + '"' : ''; }
  /* Image pas encore sur l'hébergement : copie GitHub */
  document.addEventListener('error', function(e){
    var t = e.target;
    if (t.tagName === 'IMG' && t.dataset.fb){ var f = t.dataset.fb; t.removeAttribute('data-fb'); t.src = f; }
  }, true);
  var toastT;
  function toast(msg, bad){
    var t = $('toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(toastT); toastT = setTimeout(function(){ t.className = 'toast'; }, 3200);
  }
  function busy(on, label){
    var b = document.querySelector('.busy');
    if (on && !b){ b = document.createElement('div'); b.className = 'busy'; document.body.appendChild(b); }
    if (b) b.textContent = label || 'Enregistrement…';
    if (!on && b) b.remove();
  }
  /* Enregistre une modification dans GitHub puis rafraîchit l'écran */
  function save(mutate, message, okMsg){
    busy(true);
    return A.commit(mutate, message).then(function(r){
      DB = r.db; busy(false); toast(okMsg || 'Enregistré. En ligne dans ~1 minute.'); render(); $('sync').textContent = 'À jour'; return r.result;
    })['catch'](function(e){ busy(false); toast(e.message || 'Erreur', true); throw e; });
  }

  /* ---------------- connexion ---------------- */
  function showLogin(){ $('login').hidden = false; $('app').hidden = true; }
  function start(){
    $('login').hidden = true; $('app').hidden = false; $('sync').textContent = 'Chargement…';
    A.load().then(function(db){ DB = db; $('sync').textContent = 'À jour'; render(); })
      ['catch'](function(e){
        $('sync').textContent = '';
        if (e.status === 401 || e.status === 403){ A.logout(); showLogin(); $('loginErr').textContent = e.message; }
        else $('pane').innerHTML = '<p class="err">' + esc(e.message) + '</p><p class="meta">Si le dépôt est vide, importe d’abord catalogue.json dans GitHub.</p>';
      });
  }
  $('loginForm').addEventListener('submit', function(e){
    e.preventDefault();
    var btn = this.querySelector('button'); btn.disabled = true; $('loginErr').textContent = '';
    A.login($('key').value, $('keep').checked).then(function(){ $('key').value = ''; start(); })
      ['catch'](function(err){ $('loginErr').textContent = err.message; })
      .then(function(){ btn.disabled = false; });
  });
  $('logout').addEventListener('click', function(){ A.logout(); DB = null; showLogin(); });
  $('tabs').addEventListener('click', function(e){
    var b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab;
    document.querySelectorAll('#tabs button').forEach(function(x){ x.classList.toggle('on', x === b); });
    render(); window.scrollTo(0, 0);
  });

  function render(){
    if (!DB) return;
    ({books: renderBooks, packs: renderPacks, reviews: renderReviews, settings: renderSettings})[tab]();
  }
  function catLabel(id){ var c = DB.categories.filter(function(x){ return x.id === id; })[0]; return c ? c.label : '—'; }

  /* ---------------- fenêtre ---------------- */
  function modal(title, html){
    var m = document.createElement('div');
    m.className = 'mlayer';
    m.innerHTML = '<div class="msheet" role="dialog" aria-modal="true"><div class="mhead"><h2>' + esc(title) + '</h2><button class="x" data-x aria-label="Fermer">×</button></div>' + html + '</div>';
    m.addEventListener('click', function(e){ if (e.target === m || e.target.closest('[data-x]')) m.remove(); });
    $('modal').appendChild(m);
    return m;
  }
  function val(m, id){ var el = m.querySelector('#' + id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; }
  function field(id, label, value, opts){
    opts = opts || {};
    var input = opts.area ? '<textarea id="' + id + '" placeholder="' + esc(opts.ph || '') + '">' + esc(value) + '</textarea>'
      : opts.select ? '<select id="' + id + '">' + opts.select.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'
      : '<input id="' + id + '" type="' + (opts.type || 'text') + '" value="' + esc(value) + '" placeholder="' + esc(opts.ph || '') + '"' + (opts.type === 'number' ? ' inputmode="numeric"' : '') + '>';
    return '<div class="f"><label for="' + id + '">' + esc(label) + '</label>' + input + (opts.hint ? '<span class="hint">' + esc(opts.hint) + '</span>' : '') + '</div>';
  }
  function toggle(id, label, on){ return '<label class="toggle"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + esc(label) + '</label>'; }
  /* Zone d'images : affiche, ajoute (envoi GitHub), retire */
  function imgZone(m, id, list, max, size){
    var box = m.querySelector('#' + id);
    function draw(){
      box.innerHTML = list.map(function(p, i){ return '<figure><img src="' + src(p) + '"' + fbAttr(p) + ' alt=""><button type="button" data-rm="' + i + '" aria-label="Retirer">×</button></figure>'; }).join('')
        + (list.length < max ? '<label class="up">+ Ajouter<br>une image<input type="file" accept="image/*"></label>' : '');
    }
    box.addEventListener('click', function(e){ var r = e.target.closest('[data-rm]'); if (r){ list.splice(+r.dataset.rm, 1); draw(); } });
    box.addEventListener('change', function(e){
      var f = e.target.files && e.target.files[0]; if (!f) return;
      busy(true, 'Envoi de l’image…');
      A.upload(f, size).then(function(path){ list.push(path); draw(); busy(false); toast('Image envoyée.'); })
        ['catch'](function(err){ busy(false); toast(err.message, true); });
    });
    draw();
    return list;
  }

  /* ============================================================
     LIVRES
     ============================================================ */
  function renderBooks(){
    var q = norm(bq).trim();
    var l = DB.books.filter(function(b){
      if (bcat === '__off') { if (b.active) return false; }
      else if (bcat === '__top') { if (!(b.top > 0 || b.hero)) return false; }
      else if (bcat && b.cat !== bcat) return false;
      return !q || norm(b.title + ' ' + b.no + ' ' + b.hook).indexOf(q) >= 0;
    }).sort(function(a, b){ return a.no - b.no; });
    $('pane').innerHTML = '<div class="bar"><input id="bq" type="search" placeholder="Chercher (titre ou numéro)" value="' + esc(bq) + '">'
      + '<select id="bcat"><option value="">Toutes les catégories</option><option value="__top"' + (bcat === '__top' ? ' selected' : '') + '>Mis en avant</option><option value="__off"' + (bcat === '__off' ? ' selected' : '') + '>Masqués</option>'
      + DB.categories.map(function(c){ return '<option value="' + esc(c.id) + '"' + (bcat === c.id ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') + '</select>'
      + '<button class="btn btn-gold" id="bAdd" type="button">+ Ajouter un livre</button></div>'
      + '<p class="meta">' + l.length + ' livre(s) · ' + DB.books.filter(function(b){ return b.active; }).length + ' visibles sur le site</p>'
      + '<div class="rows">' + l.slice(0, bshow).map(function(b){
        return '<button class="row" data-book="' + esc(b.id) + '"><img src="' + src(b.cover) + '"' + fbAttr(b.cover) + ' alt="" loading="lazy"><span><b>' + no3(b.no) + ' · ' + esc(b.title) + '</b><small>' + esc(catLabel(b.cat)) + '</small></span><span class="tags">'
          + (!b.active ? '<i class="tag off">Masqué</i>' : '') + (b.hero ? '<i class="tag top">Haut de page</i>' : '') + (b.top > 0 ? '<i class="tag top">Priorité ' + b.top + '</i>' : '') + '</span></button>';
      }).join('') + '</div>' + (l.length > bshow ? '<div class="more"><button class="btn btn-line" id="bMore" type="button">Afficher plus</button></div>' : '');
    var t;
    $('bq').addEventListener('input', function(){ clearTimeout(t); var v = this.value; t = setTimeout(function(){ if (tab !== 'books') return; bq = v; bshow = 60; renderBooks(); var i = $('bq'); i.focus(); i.setSelectionRange(v.length, v.length); }, 250); });
    $('bcat').addEventListener('change', function(){ bcat = this.value; bshow = 60; renderBooks(); });
    $('bAdd').addEventListener('click', function(){ editBook(null); });
    if ($('bMore')) $('bMore').addEventListener('click', function(){ bshow += 60; renderBooks(); });
    $('pane').querySelector('.rows').addEventListener('click', function(e){ var r = e.target.closest('[data-book]'); if (r) editBook(r.dataset.book); });
  }

  function editBook(id){
    var b = id ? DB.books.filter(function(x){ return x.id === id; })[0] : null;
    var next = DB.books.reduce(function(m, x){ return Math.max(m, x.no); }, 0) + 1;
    var d = b || BB.normBook({no: next, cat: (DB.categories[0] || {}).id, format: 'Livre', active: true});
    var cover = d.cover ? [d.cover] : [], prev = d.previews.slice();
    var m = modal(b ? no3(d.no) + ' · Modifier' : 'Nouveau livre', '<form class="form" novalidate>'
      + field('fTitle', 'Titre *', d.title)
      + '<div class="two">' + field('fNo', 'Numéro', d.no, {type: 'number', hint: 'Sert dans le message WhatsApp'}) + field('fCat', 'Catégorie', d.cat, {select: DB.categories.map(function(c){ return [c.id, c.label]; })}) + '</div>'
      + field('fHook', 'Accroche (1 phrase)', d.hook, {ph: 'Ex. Ton anglais te fait perdre des contrats.'})
      + field('fDesc', 'Description', d.desc, {area: true})
      + field('fPoints', 'Points forts (un par ligne)', d.points.join('\n'), {area: true})
      + '<div class="two">' + field('fPages', 'Pages', d.pages || '', {type: 'number'}) + field('fFormat', 'Format', d.format, {select: [['Livre', 'Livre'], ['Kit complet', 'Kit complet'], ['Guide complet', 'Guide complet']]}) + '</div>'
      + '<div class="f"><label>Couverture</label><div class="imgs" id="fCover"></div></div>'
      + '<div class="f"><label>Aperçu : 2 ou 3 pages marquantes du PDF</label><div class="imgs" id="fPrev"></div></div>'
      + '<div class="two">' + field('fTop', 'Priorité', d.top || 0, {type: 'number', hint: 'Plus le nombre est grand, plus le livre apparaît tôt'}) + field('fHero', 'Phrase du haut de page', d.hero, {ph: 'Ex. partir au Canada', hint: 'Remplie = livre affiché dans le carrousel du haut'}) + '</div>'
      + toggle('fActive', 'Visible sur le site', d.active)
      + '<p class="err" id="fErr"></p>'
      + '<div class="actions"><button class="btn btn-gold" type="submit">Enregistrer</button>'
      + (b ? '<button class="btn btn-line" type="button" id="fLink">Copier le lien</button><button class="btn btn-bad" type="button" id="fDel">Supprimer</button>' : '') + '</div></form>');
    imgZone(m, 'fCover', cover, 1, 720);
    imgZone(m, 'fPrev', prev, 3, 1200);
    m.querySelector('form').addEventListener('submit', function(e){
      e.preventDefault();
      var title = val(m, 'fTitle');
      if (!title){ m.querySelector('#fErr').textContent = 'Le titre est obligatoire.'; return; }
      var nb = BB.normBook({
        id: b ? b.id : 'b' + Date.now().toString(36), no: val(m, 'fNo') || next, cat: val(m, 'fCat'), title: title, hook: val(m, 'fHook'),
        desc: val(m, 'fDesc'), points: val(m, 'fPoints'), pages: val(m, 'fPages'), format: val(m, 'fFormat'),
        cover: cover[0] || '', previews: prev, top: val(m, 'fTop'), hero: val(m, 'fHero'), active: val(m, 'fActive')
      });
      var dup = DB.books.filter(function(x){ return x.no === nb.no && x.id !== nb.id; })[0];
      if (dup){ m.querySelector('#fErr').textContent = 'Le numéro ' + nb.no + ' est déjà pris par « ' + dup.title + ' ».'; return; }
      save(function(db){
        var i = db.books.findIndex(function(x){ return x.id === nb.id; });
        if (i < 0) db.books.push(nb); else db.books[i] = nb;
      }, 'Livre ' + no3(nb.no) + ' : ' + nb.title).then(function(){ m.remove(); }, function(){});
    });
    if (b){
      m.querySelector('#fDel').addEventListener('click', function(){
        if (!confirm('Supprimer définitivement « ' + b.title + ' » ? (Pour le cacher seulement, décoche « Visible sur le site ».)')) return;
        save(function(db){
          db.books = db.books.filter(function(x){ return x.id !== b.id; });
          db.packs.forEach(function(p){ p.books = p.books.filter(function(x){ return x !== b.id; }); });
        }, 'Suppression ' + no3(b.no), 'Livre supprimé.').then(function(){ m.remove(); }, function(){});
      });
      m.querySelector('#fLink').addEventListener('click', function(){ copyLink('#livre-' + b.no); });
    }
  }
  function siteUrl(){ return new URL('../', location.href).href; }
  function copyLink(hash){
    var url = siteUrl() + hash;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function(){ toast('Lien copié : ' + url); }, function(){ prompt('Copie ce lien :', url); });
  }

  /* ============================================================
     PACKS
     ============================================================ */
  function byNo(){ var o = {}; DB.books.forEach(function(b){ o[b.no] = b; }); return o; }
  function byId(){ var o = {}; DB.books.forEach(function(b){ o[b.id] = b; }); return o; }
  function renderPacks(){
    var B = byId();
    $('pane').innerHTML = '<div class="bar"><button class="btn btn-gold" id="pAdd" type="button">+ Créer un pack</button></div>'
      + '<p class="meta">' + DB.packs.length + ' packs · l’ordre d’affichage suit la priorité, puis cette liste.</p><div class="rows">'
      + DB.packs.map(function(p){
        var first = B[p.books[0]];
        var price = BB.packPrice({price: p.price, books: p.books}, DB.settings);
        return '<button class="row" data-pack="' + esc(p.id) + '">' + (first ? '<img src="' + src(first.cover) + '"' + fbAttr(first.cover) + ' alt="" loading="lazy">' : '<span class="ph">P</span>')
          + '<span><b>' + esc(p.name) + '</b><small>' + p.books.length + ' livres · ' + BB.fmt(price) + (p.price ? '' : ' (auto)') + '</small></span><span class="tags">'
          + (!p.active ? '<i class="tag off">Masqué</i>' : '') + (p.top > 0 ? '<i class="tag top">Priorité ' + p.top + '</i>' : '') + '</span></button>';
      }).join('') + '</div>';
    $('pAdd').addEventListener('click', function(){ editPack(null); });
    $('pane').querySelector('.rows').addEventListener('click', function(e){ var r = e.target.closest('[data-pack]'); if (r) editPack(r.dataset.pack); });
  }
  function editPack(id){
    var p = id ? DB.packs.filter(function(x){ return x.id === id; })[0] : null;
    var B = byId(), N = byNo();
    var d = p || BB.normPack({active: true});
    var nos = d.books.map(function(x){ return B[x] ? B[x].no : null; }).filter(Boolean).join(', ');
    var m = modal(p ? 'Modifier le pack' : 'Nouveau pack', '<form class="form" novalidate>'
      + field('kName', 'Nom du pack *', d.name) + field('kSub', 'Sous-titre (1 phrase)', d.sub)
      + field('kBooks', 'Numéros des livres *', nos, {ph: 'Ex. 1, 15, 203, 204, 310', hint: 'Sépare les numéros par des virgules'})
      + '<div class="resolved" id="kRes"></div>'
      + '<div class="two">' + field('kPrice', 'Prix (F)', d.price || '', {type: 'number', hint: 'Vide = prix automatique (5 livres ' + BB.fmt(DB.settings.packPrices['5']) + ', 10 livres ' + BB.fmt(DB.settings.packPrices['10']) + ')'})
      + field('kTop', 'Priorité', d.top || 0, {type: 'number', hint: 'Plus grand = affiché plus tôt'}) + '</div>'
      + toggle('kActive', 'Visible sur le site', d.active)
      + '<p class="err" id="kErr"></p><div class="actions"><button class="btn btn-gold" type="submit">Enregistrer</button>'
      + (p ? '<button class="btn btn-line" type="button" id="kLink">Copier le lien</button><button class="btn btn-bad" type="button" id="kDel">Supprimer</button>' : '') + '</div></form>');
    function parse(){
      return val(m, 'kBooks').split(/[^\d]+/).filter(Boolean).map(Number).filter(function(n, i, a){ return a.indexOf(n) === i; });
    }
    function show(){
      m.querySelector('#kRes').innerHTML = parse().map(function(n){ var b = N[n]; return b ? '<span>' + no3(n) + ' · ' + esc(b.title) + (b.active ? '' : ' (masqué)') + '</span>' : '<span class="bad">' + no3(n) + ' : introuvable</span>'; }).join('');
    }
    m.querySelector('#kBooks').addEventListener('input', show); show();
    m.querySelector('form').addEventListener('submit', function(e){
      e.preventDefault();
      var name = val(m, 'kName'), list = parse(), bad = list.filter(function(n){ return !N[n]; });
      if (!name){ m.querySelector('#kErr').textContent = 'Le nom est obligatoire.'; return; }
      if (bad.length){ m.querySelector('#kErr').textContent = 'Numéro(s) introuvable(s) : ' + bad.join(', '); return; }
      if (list.length < 2){ m.querySelector('#kErr').textContent = 'Un pack contient au moins 2 livres.'; return; }
      var nid = p ? p.id : 'P' + String(DB.packs.reduce(function(mx, x){ var k = parseInt(String(x.id).replace(/\D/g, ''), 10) || 0; return Math.max(mx, k); }, 0) + 1).padStart(3, '0');
      var np = BB.normPack({id: nid, name: name, sub: val(m, 'kSub'), univers: d.univers, books: list.map(function(n){ return N[n].id; }),
        price: val(m, 'kPrice'), top: val(m, 'kTop'), active: val(m, 'kActive')});
      save(function(db){
        var i = db.packs.findIndex(function(x){ return x.id === np.id; });
        if (i < 0) db.packs.unshift(np); else db.packs[i] = np;
      }, 'Pack : ' + np.name).then(function(){ m.remove(); }, function(){});
    });
    if (p){
      m.querySelector('#kDel').addEventListener('click', function(){
        if (!confirm('Supprimer le pack « ' + p.name + ' » ?')) return;
        save(function(db){ db.packs = db.packs.filter(function(x){ return x.id !== p.id; }); }, 'Suppression du pack ' + p.id, 'Pack supprimé.').then(function(){ m.remove(); }, function(){});
      });
      m.querySelector('#kLink').addEventListener('click', function(){ copyLink('#pack-' + p.id); });
    }
  }

  /* ============================================================
     AVIS CLIENTS
     ============================================================ */
  function renderReviews(){
    $('pane').innerHTML = '<div class="bar"><button class="btn btn-gold" id="rAdd" type="button">+ Ajouter un avis</button></div>'
      + '<p class="meta">Les avis visibles défilent en bas du site. Une capture WhatsApp de livraison marche très bien comme photo.</p>'
      + (DB.reviews.length ? '<div class="rows">' + DB.reviews.map(function(r){
        return '<button class="row" data-rev="' + esc(r.id) + '">' + (r.photo ? '<img src="' + src(r.photo) + '"' + fbAttr(r.photo) + ' alt="" loading="lazy" style="aspect-ratio:1">' : '<span class="ph">' + esc((r.name || '?').charAt(0)) + '</span>')
          + '<span><b>' + esc(r.name) + (r.city ? ' · ' + esc(r.city) : '') + '</b><small>' + esc(r.text) + '</small></span><span class="tags">' + (!r.active ? '<i class="tag off">Masqué</i>' : '') + '</span></button>';
      }).join('') + '</div>' : '<p class="meta">Aucun avis pour l’instant. La section reste cachée sur le site tant qu’il n’y en a pas.</p>');
    $('rAdd').addEventListener('click', function(){ editReview(null); });
    var rows = $('pane').querySelector('.rows');
    if (rows) rows.addEventListener('click', function(e){ var r = e.target.closest('[data-rev]'); if (r) editReview(r.dataset.rev); });
  }
  function editReview(id){
    var r = id ? DB.reviews.filter(function(x){ return x.id === id; })[0] : null;
    var d = r || BB.normReview({active: true});
    var photo = d.photo ? [d.photo] : [];
    var m = modal(r ? 'Modifier l’avis' : 'Nouvel avis', '<form class="form" novalidate>'
      + '<div class="two">' + field('rName', 'Prénom *', d.name) + field('rCity', 'Ville / pays', d.city, {ph: 'Ex. Douala'}) + '</div>'
      + field('rText', 'Témoignage', d.text, {area: true, ph: 'Ex. J’ai reçu mon PDF en 5 minutes, merci !'})
      + '<div class="f"><label>Photo ou capture WhatsApp</label><div class="imgs" id="rPhoto"></div></div>'
      + toggle('rActive', 'Visible sur le site', d.active)
      + '<p class="err" id="rErr"></p><div class="actions"><button class="btn btn-gold" type="submit">Enregistrer</button>'
      + (r ? '<button class="btn btn-bad" type="button" id="rDel">Supprimer</button>' : '') + '</div></form>');
    imgZone(m, 'rPhoto', photo, 1, 900);
    m.querySelector('form').addEventListener('submit', function(e){
      e.preventDefault();
      var nr = BB.normReview({id: r ? r.id : 'r' + Date.now().toString(36), name: val(m, 'rName'), city: val(m, 'rCity'), text: val(m, 'rText'), photo: photo[0] || '', active: val(m, 'rActive')});
      if (!nr.name || (!nr.text && !nr.photo)){ m.querySelector('#rErr').textContent = 'Indique le prénom et un témoignage ou une photo.'; return; }
      save(function(db){
        var i = db.reviews.findIndex(function(x){ return x.id === nr.id; });
        if (i < 0) db.reviews.unshift(nr); else db.reviews[i] = nr;
      }, 'Avis : ' + nr.name).then(function(){ m.remove(); }, function(){});
    });
    if (r) m.querySelector('#rDel').addEventListener('click', function(){
      if (!confirm('Supprimer cet avis ?')) return;
      save(function(db){ db.reviews = db.reviews.filter(function(x){ return x.id !== r.id; }); }, 'Suppression avis', 'Avis supprimé.').then(function(){ m.remove(); }, function(){});
    });
  }

  /* ============================================================
     RÉGLAGES
     ============================================================ */
  function renderSettings(){
    var s = DB.settings, cats = DB.categories.map(function(c){ return {id: c.id, label: c.label, color: c.color}; });
    $('pane').innerHTML = '<form class="form card" id="sForm" novalidate>'
      + field('sWa', 'Numéro WhatsApp des commandes *', s.whatsapp, {type: 'tel', ph: '2376XXXXXXXX', hint: 'Format international, chiffres seulement (ex. 237699112233). Les numéros MoMo/Orange se donnent dans la discussion.'})
      + '<div class="two">' + field('sPrice', 'Prix d’un livre (F)', s.priceBook, {type: 'number'}) + field('sFb', 'Lien de la page Facebook', s.facebook, {ph: 'https://facebook.com/…'}) + '</div>'
      + '<div class="two">' + field('sP5', 'Prix pack de 5 (F)', s.packPrices['5'], {type: 'number'}) + field('sP10', 'Prix pack de 10 (F)', s.packPrices['10'], {type: 'number'}) + '</div>'
      + field('sHero', 'Début du titre du haut de page', s.heroPrefix, {hint: 'La fin change avec la « phrase du haut de page » de chaque livre mis en avant.'})
      + '<div class="two">' + field('sTag', 'Slogan', s.tagline) + field('sGar', 'Garantie', s.guarantee) + '</div>'
      + field('sCountries', 'Pays proposés à la commande (un par ligne)', s.countries.join('\n'), {area: true})
      + '<h3 class="sec-t">Catégories (univers)</h3><div class="cats" id="sCats"></div>'
      + '<p class="err" id="sErr"></p><div class="actions"><button class="btn btn-gold" type="submit">Enregistrer les réglages</button></div></form>';
    var box = $('sCats');
    function draw(){
      box.innerHTML = cats.map(function(c, i){
        return '<div class="cat-row"><i style="background:' + esc(c.color) + '"></i><input data-ci="' + i + '" value="' + esc(c.label) + '" aria-label="Nom de la catégorie">'
          + '<button type="button" data-up="' + i + '" aria-label="Monter">↑</button><button type="button" data-down="' + i + '" aria-label="Descendre">↓</button></div>';
      }).join('');
    }
    box.addEventListener('input', function(e){ var i = e.target.dataset.ci; if (i != null) cats[+i].label = e.target.value; });
    box.addEventListener('click', function(e){
      var u = e.target.closest('[data-up]'), d = e.target.closest('[data-down]'), i, j;
      if (u){ i = +u.dataset.up; j = i - 1; } else if (d){ i = +d.dataset.down; j = i + 1; } else return;
      if (j < 0 || j >= cats.length) return;
      var t = cats[i]; cats[i] = cats[j]; cats[j] = t; draw();
    });
    draw();
    $('sForm').addEventListener('submit', function(e){
      e.preventDefault();
      var m = $('sForm'), wa = val(m, 'sWa').replace(/\D/g, '');
      if (wa.length < 8){ $('sErr').textContent = 'Le numéro WhatsApp doit contenir l’indicatif pays, par exemple 237699112233.'; return; }
      var ns = {
        shopName: s.shopName, tagline: val(m, 'sTag'), whatsapp: wa, priceBook: +val(m, 'sPrice') || 1000,
        packPrices: {'5': +val(m, 'sP5') || 3500, '10': +val(m, 'sP10') || 6000},
        heroPrefix: val(m, 'sHero'), guarantee: val(m, 'sGar'), facebook: val(m, 'sFb'),
        countries: val(m, 'sCountries').split(/\n+/).map(function(x){ return x.trim(); }).filter(Boolean)
      };
      var nc = cats.map(function(c){ return {id: c.id, label: c.label.trim() || c.id, color: c.color}; });
      save(function(db){ db.settings = ns; db.categories = nc; }, 'Réglages mis à jour', 'Réglages enregistrés.');
    });
  }

  /* ---------------- démarrage ---------------- */
  if (A.isLogged()) start(); else showLogin();
})();
