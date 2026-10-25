/* ============================================================
   BAOBAB BOOK — SITE CLIENT
   Données : catalogue.json (via store.js). Commande : WhatsApp.
   ============================================================ */
(function(){
  'use strict';

  var $ = function(id){ return document.getElementById(id); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DB = null, S = null, BOOKS = [], BY = {}, CATS = {}, PACKS = [], PBY = {};
  var catFilter = '', query = '', bookShown = 0, packShown = 0, packSize = '';
  var BOOK_STEP = window.innerWidth >= 1000 ? 15 : 12, PACK_STEP = 6;   /* lignes complètes : 2, 3 ou 5 colonnes */

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function norm(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function no3(n){ return 'N°' + String(n).padStart(3, '0'); }
  function ic(name){ return '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function fmt(n){ return BB.fmt(n); }

  var toastT;
  function toast(msg){
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('on'); }, 2800);
  }

  /* ---------- couvertures : apparition douce + secours GitHub ---------- */
  function cover(src, eager, cls){
    var fb = BB.imgFallback(src);
    return '<div class="cv' + (cls ? ' ' + cls : '') + '"><img src="' + esc(BB.img(src)) + '" alt="" width="360" height="509" decoding="async"'
      + (eager ? ' fetchpriority="high"' : ' loading="lazy"') + (fb ? ' data-fb="' + esc(fb) + '"' : '') + '></div>';
  }
  document.addEventListener('load', function(e){
    var t = e.target;
    if (t.tagName === 'IMG' && t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('cv')){ t.classList.add('ok'); t.parentNode.classList.add('done'); }
  }, true);
  document.addEventListener('error', function(e){
    var t = e.target;
    if (t.tagName !== 'IMG') return;
    if (t.dataset.fb){ var f = t.dataset.fb; t.removeAttribute('data-fb'); t.src = f; return; }
    if (t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('cv')) t.parentNode.classList.add('done');
  }, true);

  /* ---------- WhatsApp ---------- */
  function waUrl(text){ return 'https://wa.me/' + S.whatsapp + '?text=' + encodeURIComponent(text); }
  function openWa(text){
    if (!S.whatsapp){ toast('Le numéro WhatsApp n’est pas encore configuré.'); return; }
    window.open(waUrl(text), '_blank', 'noopener');
  }
  function bindWa(){
    document.querySelectorAll('[data-wa]').forEach(function(a){
      a.href = S.whatsapp ? waUrl('Bonjour Baobab Book, j’ai une question.') : '#';
    });
  }
  document.addEventListener('click', function(e){
    var a = e.target.closest('[data-wa]');
    if (a && (!S || !S.whatsapp)){ e.preventDefault(); toast('Le numéro WhatsApp n’est pas encore configuré.'); }
  });

  /* ============================================================
     DONNÉES
     ============================================================ */
  function sortTop(a, b){ return (b.top - a.top) || (a.no - b.no); }
  function setData(db){
    DB = db; S = db.settings;
    CATS = {}; db.categories.forEach(function(c){ CATS[c.id] = c; });
    BOOKS = db.books.filter(function(b){ return b.active; }).sort(sortTop);
    BY = {}; db.books.forEach(function(b){ BY[b.id] = b; });
    PACKS = db.packs.filter(function(p){
      return p.active && p.books.filter(function(id){ return BY[id] && BY[id].active; }).length >= 2;
    }).map(function(p, i){ p._i = i; return p; }).sort(function(a, b){ return (b.top - a.top) || (a._i - b._i); });
    PBY = {}; PACKS.forEach(function(p){ PBY[p.id] = p; });
    renderAll();
  }
  function packBooks(p){ return p.books.map(function(id){ return BY[id]; }).filter(function(b){ return b && b.active; }); }
  function packInfo(p){
    var n = packBooks(p).length, price = BB.packPrice({price: p.price, books: packBooks(p)}, S), full = n * S.priceBook;
    return {n: n, price: price, full: full, save: Math.max(0, full - price), pct: full > price ? Math.round((1 - price / full) * 100) : 0};
  }

  function renderAll(){
    var n = BOOKS.length;
    $('heroCount').textContent = n >= 200 ? 'Des centaines d’e-books · ' + n + ' titres' : n + ' e-books';
    $('heroPrefix').textContent = S.heroPrefix;
    $('heroPrice').textContent = fmt(S.priceBook);
    $('guaranteeT').textContent = S.guarantee;
    $('faqGuarantee').textContent = S.guarantee + '. Écris-nous sur WhatsApp avec la capture de ton paiement.';
    var fb = $('fbLink'); if (/^https?:\/\//i.test(S.facebook)){ fb.href = S.facebook; fb.hidden = false; } else fb.hidden = true;
    var best = 0; PACKS.forEach(function(p){ best = Math.max(best, packInfo(p).pct); });
    $('packs-t').innerHTML = 'Les packs' + (best ? ', <em class="gold-text">jusqu’à −' + best + ' %</em>' : '');
    bindWa();
    renderHero(); renderUnivers(); renderPackTabs(); renderPacks(true); renderCatSel(); renderBooks(true); renderReviews();
    route();
  }

  /* ============================================================
     HERO — carrousel 3D synchronisé avec la phrase
     ============================================================ */
  var flow = {items: [], idx: 0, timer: 0, paused: false, visible: true};
  function renderHero(){
    var list = BOOKS.filter(function(b){ return b.hero; });
    if (list.length < 3) list = list.concat(BOOKS.filter(function(b){ return !b.hero; }).slice(0, 7 - list.length));
    while (list.length && list.length < 5) list = list.concat(list);
    flow.items = list; flow.idx = 0;
    $('flowStage').innerHTML = list.map(function(b, i){
      return '<div class="fl" data-i="' + i + '" role="button" tabindex="-1" aria-label="' + esc(b.title) + '">' + cover(b.cover, i < 3 || i > list.length - 3) + '</div>';
    }).join('');
    place(true); startFlow();
  }
  function place(first){
    var n = flow.items.length;
    $('flowStage').querySelectorAll('.fl').forEach(function(el){
      var d = (+el.dataset.i - flow.idx + n) % n; if (d > n / 2) d -= n;
      el.dataset.p = Math.abs(d) <= 2 ? String(d) : 'h';
    });
    var b = flow.items[flow.idx];
    if (b) setLine(b.hero || b.title, first);
  }
  function setLine(text, now){
    var el = $('heroLine');
    if (now || reduce){ el.textContent = text; fitLine(); return; }
    el.classList.add('out');
    setTimeout(function(){
      el.textContent = text; el.classList.remove('out'); el.classList.add('in'); fitLine();
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ el.classList.remove('in'); }); });
    }, 260);
  }
  /* La phrase tient toujours sur une ligne */
  function fitLine(){
    var box = document.querySelector('.hero-l2'), el = $('heroLine');
    el.style.fontSize = '';
    var max = box.clientWidth, w = el.scrollWidth, k = 1;
    if (w > max) { k = Math.max(.55, max / w * .98); el.style.fontSize = k + 'em'; }
  }
  function go(step){ var n = flow.items.length; if (!n) return; flow.idx = (flow.idx + step + n) % n; place(); }
  function startFlow(){
    clearInterval(flow.timer);
    flow.timer = setInterval(function(){ if (!flow.paused && flow.visible && !document.hidden && !document.querySelector('.layer')) go(1); }, 2800);
  }
  (function(){
    var f = $('flow'), x0 = null, moved = false, resumeT;
    function pause(){ flow.paused = true; clearTimeout(resumeT); }
    function resume(){ clearTimeout(resumeT); resumeT = setTimeout(function(){ flow.paused = false; }, 1500); }
    f.addEventListener('pointerdown', function(e){ x0 = e.clientX; moved = false; pause(); });
    f.addEventListener('pointermove', function(e){ if (x0 !== null && Math.abs(e.clientX - x0) > 8) moved = true; });
    function end(e){
      if (x0 === null) return;
      var dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      resume();
    }
    f.addEventListener('pointerup', end); f.addEventListener('pointercancel', function(){ x0 = null; resume(); });
    f.addEventListener('pointerleave', function(e){ if (x0 !== null) end(e); });
    f.addEventListener('click', function(e){
      if (moved) return;
      var el = e.target.closest('.fl'); if (!el) return;
      var p = el.dataset.p;
      if (p === '0') openBook(flow.items[+el.dataset.i].id);
      else if (p !== 'h') go(+p);
    });
    if ('IntersectionObserver' in window) new IntersectionObserver(function(en){ flow.visible = en[0].isIntersecting; }).observe(f);
    window.addEventListener('resize', function(){ fitLine(); });
  })();

  /* ============================================================
     UNIVERS
     ============================================================ */
  function catBooks(id){ return BOOKS.filter(function(b){ return b.cat === id; }); }
  function renderUnivers(){
    $('univRail').innerHTML = DB.categories.map(function(c){
      var l = catBooks(c.id); if (!l.length) return '';
      return '<button class="ut" data-cat="' + esc(c.id) + '" style="--c:' + esc(c.color) + '"><span class="ut-pics" aria-hidden="true">'
        + '<img src="' + esc(BB.img(l[0].cover)) + '" alt="" loading="lazy" width="360" height="509">'
        + '</span><i></i><b>' + esc(c.label) + '</b><span>' + l.length + ' livres</span></button>';
    }).join('');
  }
  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-cat]'); if (!t || t.tagName === 'OPTION') return;
    e.preventDefault();
    catFilter = t.dataset.cat; query = ''; $('q').value = ''; $('catSel').value = catFilter;
    renderBooks(true);
    $('livres').scrollIntoView({behavior: reduce ? 'auto' : 'smooth'});
  });

  /* ============================================================
     PACKS
     ============================================================ */
  function renderPackTabs(){
    var sizes = {};
    PACKS.forEach(function(p){ var i = packInfo(p); if (!sizes[i.n]) sizes[i.n] = i.price; });
    var keys = Object.keys(sizes).map(Number).sort(function(a, b){ return a - b; });
    if (packSize && !sizes[packSize]) packSize = '';
    $('packTabs').innerHTML = '<button class="tab" role="tab" data-size="" aria-selected="' + (!packSize) + '">Tous</button>'
      + keys.map(function(k){ return '<button class="tab" role="tab" data-size="' + k + '" aria-selected="' + (packSize === String(k)) + '">' + k + ' livres · ' + fmt(sizes[k]) + '</button>'; }).join('');
  }
  $('packTabs').addEventListener('click', function(e){
    var t = e.target.closest('[data-size]'); if (!t) return;
    packSize = t.dataset.size; renderPackTabs(); renderPacks(true);
  });
  function fan(list, eager){ return list.slice(0, 3).map(function(b){ return cover(b.cover, eager); }).join(''); }
  function packCard(p){
    var i = packInfo(p), l = packBooks(p);
    return '<article class="pack">'
      + '<button class="fan" data-open-pack="' + esc(p.id) + '" aria-label="Voir le pack ' + esc(p.name) + '">' + fan(l) + '</button>'
      + (i.pct ? '<span class="badge">−' + i.pct + ' %</span>' : '') + '<span class="count">' + i.n + ' livres</span>'
      + '<div class="pack-b"><h3><button data-open-pack="' + esc(p.id) + '" style="text-align:left">' + esc(p.name) + '</button></h3>'
      + (p.sub ? '<p>' + esc(p.sub) + '</p>' : '')
      + '<div class="prow"><b>' + fmt(i.price) + '</b>' + (i.save ? '<s>' + fmt(i.full) + '</s><small>Économie ' + fmt(i.save) + '</small>' : '') + '</div>'
      + '<button class="btn btn-gold" data-buy-pack="' + esc(p.id) + '">Acheter le pack</button></div></article>';
  }
  function packList(){ return PACKS.filter(function(p){ return !packSize || String(packInfo(p).n) === packSize; }); }
  function renderPacks(reset){
    var l = packList();
    if (reset){ packShown = 0; $('packGrid').innerHTML = ''; }
    var nx = l.slice(packShown, packShown + PACK_STEP);
    $('packGrid').insertAdjacentHTML('beforeend', nx.map(packCard).join(''));
    packShown += nx.length;
    $('packMore').hidden = packShown >= l.length;
    $('packMoreBtn').textContent = 'Voir plus de packs (' + (l.length - packShown) + ')';
  }
  $('packMoreBtn').addEventListener('click', function(){ renderPacks(false); });

  /* ============================================================
     LIVRES
     ============================================================ */
  function renderCatSel(){
    $('catSel').innerHTML = '<option value="">Tous les univers</option>' + DB.categories.map(function(c){
      var n = catBooks(c.id).length; return n ? '<option value="' + esc(c.id) + '">' + esc(c.label) + ' (' + n + ')</option>' : '';
    }).join('');
    $('catSel').value = catFilter;
  }
  function bookList(){
    var q = norm(query).trim(), words = q ? q.split(/\s+/) : [];
    return BOOKS.filter(function(b){
      if (catFilter && b.cat !== catFilter) return false;
      if (!words.length) return true;
      var h = norm(b.title + ' ' + b.hook + ' ' + b.desc + ' ' + (CATS[b.cat] ? CATS[b.cat].label : '') + ' ' + b.no);
      return words.every(function(w){ return h.indexOf(w) >= 0; });
    });
  }
  function bookCard(b){
    return '<button class="book" data-open-book="' + esc(b.id) + '">' + cover(b.cover) + '<h3>' + esc(b.title) + '</h3><span class="bp">' + fmt(S.priceBook) + '</span></button>';
  }
  function renderBooks(reset){
    var l = bookList();
    if (reset){ bookShown = 0; $('bookGrid').innerHTML = ''; }
    var nx = l.slice(bookShown, bookShown + BOOK_STEP);
    if (!l.length) $('bookGrid').innerHTML = '<p class="empty">Aucun livre ne correspond. Essaie un autre mot, ou écris-nous sur WhatsApp.</p>';
    $('bookGrid').insertAdjacentHTML('beforeend', nx.map(bookCard).join(''));
    bookShown += nx.length;
    $('bookMore').hidden = bookShown >= l.length;
    $('bookMoreBtn').textContent = 'Voir plus de livres (' + (l.length - bookShown) + ')';
    $('bookSub').textContent = catFilter && CATS[catFilter] ? CATS[catFilter].label + ' · ' + l.length + ' livres'
      : query ? l.length + ' résultat' + (l.length > 1 ? 's' : '') : BOOKS.length + ' livres. Cherche un sujet, un métier, un pays.';
  }
  $('bookMoreBtn').addEventListener('click', function(){ renderBooks(false); });
  var qT;
  $('q').addEventListener('input', function(){ clearTimeout(qT); qT = setTimeout(function(){ query = $('q').value; renderBooks(true); }, 180); });
  $('catSel').addEventListener('change', function(){ catFilter = this.value; renderBooks(true); });

  /* ============================================================
     AVIS — défilement continu, glissable, pause 2 s au toucher
     ============================================================ */
  var rev = {raf: 0, paused: false, visible: false, t: 0};
  function renderReviews(){
    var l = DB.reviews.filter(function(r){ return r.active; });
    $('avis').hidden = !l.length;
    cancelAnimationFrame(rev.raf);
    if (!l.length) return;
    var card = function(r){
      return '<figure class="rev">' + (r.photo ? '<img src="' + esc(BB.img(r.photo)) + '" alt="Avis de ' + esc(r.name) + '" loading="lazy">' : '')
        + '<div>' + (r.text ? '<p>« ' + esc(r.text) + ' »</p>' : '') + '<b>' + esc(r.name) + (r.city ? ' · ' + esc(r.city) : '') + '</b></div></figure>';
    };
    var html = l.map(card).join('');
    $('revRail').innerHTML = html + (l.length > 1 ? html : '');
    if (l.length > 1 && !reduce) loopReviews();
  }
  function loopReviews(){
    var r = $('revRail'), last = 0;
    function step(ts){
      var dt = last ? Math.min(50, ts - last) : 16; last = ts;
      if (!rev.paused && rev.visible){
        r.scrollLeft += dt * 0.09;
        var half = r.scrollWidth / 2;
        if (r.scrollLeft >= half) r.scrollLeft -= half;
      }
      rev.raf = requestAnimationFrame(step);
    }
    rev.raf = requestAnimationFrame(step);
  }
  (function(){
    var r = $('revRail'), dragX = null, startL = 0;
    function hold(){ rev.paused = true; clearTimeout(rev.t); }
    function release(){ clearTimeout(rev.t); rev.t = setTimeout(function(){ rev.paused = false; }, 2000); }
    r.addEventListener('touchstart', hold, {passive: true});
    r.addEventListener('touchend', release);
    r.addEventListener('pointerdown', function(e){ hold(); if (e.pointerType === 'mouse'){ dragX = e.clientX; startL = r.scrollLeft; } });
    window.addEventListener('pointermove', function(e){ if (dragX !== null) r.scrollLeft = startL - (e.clientX - dragX); });
    window.addEventListener('pointerup', function(){ if (dragX !== null){ dragX = null; release(); } else if (rev.paused) release(); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function(en){ rev.visible = en[0].isIntersecting; }).observe(r);
  })();

  /* ============================================================
     FENÊTRES (fiche livre, fiche pack, commande)
     ============================================================ */
  function openLayer(html){
    var layer = document.createElement('div');
    layer.className = 'layer';
    layer.innerHTML = '<div class="layer-bg" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><button class="x" data-close aria-label="Fermer">' + ic('x') + '</button>' + html + '</div>';
    $('layers').appendChild(layer);
    document.body.classList.add('locked');
    history.pushState({sheet: $('layers').children.length}, '');
    var f = layer.querySelector('.sheet'); f.setAttribute('tabindex', '-1'); f.focus({preventScroll: true});
    return layer;
  }
  function removeTop(){
    var l = $('layers').lastElementChild; if (!l || l.classList.contains('closing')) return;
    l.classList.add('closing');
    setTimeout(function(){ l.remove(); if (!$('layers').children.length) document.body.classList.remove('locked'); }, reduce ? 0 : 260);
  }
  function closeTop(){ if (history.state && history.state.sheet) history.back(); else removeTop(); }
  window.addEventListener('popstate', function(){
    var want = (history.state && history.state.sheet) || 0;
    while ($('layers').querySelectorAll('.layer:not(.closing)').length > want) removeTop();
  });
  document.addEventListener('click', function(e){
    if (e.target.closest('[data-close]')){ closeTop(); return; }
    var b = e.target.closest('[data-open-book]'); if (b){ openBook(b.dataset.openBook); return; }
    var p = e.target.closest('[data-open-pack]'); if (p){ openPack(p.dataset.openPack); return; }
    var bp = e.target.closest('[data-buy-pack]'); if (bp){ openPay({pack: bp.dataset.buyPack}); return; }
    var bb = e.target.closest('[data-buy-book]'); if (bb){ openPay({book: bb.dataset.buyBook}); return; }
    var pv = e.target.closest('[data-pv]'); if (pv){ openLayer('<img src="' + esc(pv.dataset.pv) + '" alt="Aperçu" style="width:100%;border-radius:8px;margin-top:30px;background:#fff">'); }
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && $('layers').children.length) closeTop(); });

  function openBook(id){
    var b = BY[id]; if (!b || !b.active) return;
    var c = CATS[b.cat];
    var packsWith = PACKS.filter(function(p){ return p.books.indexOf(b.id) >= 0; })
      .sort(function(x, y){ return packInfo(x).n - packInfo(y).n; });
    var up = packsWith[0], upI = up && packInfo(up);
    var same = BOOKS.filter(function(x){ return x.cat === b.cat && x.id !== b.id; }).slice(0, 10);
    var html = '<div class="bk">'
      + '<div class="bk-top">' + cover(b.cover, true) + '<div><p class="bk-meta"><b>' + no3(b.no) + '</b>' + (c ? ' · ' + esc(c.label) : '') + '</p>'
      + '<h2>' + esc(b.title) + '</h2>' + (b.hook ? '<p class="bk-hook">' + esc(b.hook) + '</p>' : '') + '</div></div>'
      + '<div class="buybar"><div><small>PRIX DE LANCEMENT</small><b>' + fmt(S.priceBook) + '</b></div><button class="btn btn-gold" data-buy-book="' + esc(b.id) + '">Acheter</button></div>'
      + (b.desc ? '<p class="bk-desc">' + esc(b.desc) + '</p>' : '')
      + (b.points.length ? '<ul class="ticks">' + b.points.map(function(t){ return '<li>' + ic('check') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul>' : '')
      + '<div class="chips"><span>PDF' + (b.pages ? ' · ' + b.pages + ' pages' : '') + '</span><span>' + esc(b.format) + '</span><span>Livré sur WhatsApp</span></div>'
      + (b.previews.length ? '<h3 class="sub-h">Aperçu</h3><div class="pv">' + b.previews.map(function(s){ return '<button data-pv="' + esc(BB.img(s)) + '"><img src="' + esc(BB.img(s)) + '" alt="Page du livre" loading="lazy"></button>'; }).join('') + '</div>' : '')
      + (up ? '<button class="upsell" data-open-pack="' + esc(up.id) + '"><span class="mini-fan">' + fan(packBooks(up)) + '</span><span><small>ÉCONOMISE ' + fmt(upI.save) + '</small><b>' + esc(up.name) + '</b><em>Ce livre + ' + (upI.n - 1) + ' autres</em></span><strong>' + fmt(upI.price) + '</strong></button>' : '')
      + (same.length ? '<h3 class="sub-h">Dans le même univers</h3><div class="strip">' + same.map(function(x){ return '<button data-open-book="' + esc(x.id) + '">' + cover(x.cover) + '<small>' + esc(x.title) + '</small></button>'; }).join('') + '</div>' : '')
      + '</div>';
    openLayer(html);
  }

  function openPack(id){
    var p = PBY[id]; if (!p) return;
    var i = packInfo(p), l = packBooks(p);
    var html = '<div class="fan pk-fan">' + fan(l, true) + '</div>'
      + '<div class="pk-h"><h2>' + esc(p.name) + '</h2>' + (p.sub ? '<p>' + esc(p.sub) + '</p>' : '') + '</div>'
      + '<div class="buybar"><div><small>' + i.n + ' LIVRES' + (i.pct ? ' · −' + i.pct + ' %' : '') + '</small><b>' + fmt(i.price) + '</b>' + (i.save ? '<s>' + fmt(i.full) + '</s>' : '') + '</div><button class="btn btn-gold" data-buy-pack="' + esc(p.id) + '">Acheter le pack</button></div>'
      + '<h3 class="sub-h">Les ' + i.n + ' livres du pack</h3><div class="pk-list">'
      + l.map(function(b){ return '<button class="pk-it" data-open-book="' + esc(b.id) + '">' + cover(b.cover) + '<span><b>' + esc(b.title) + '</b><span>' + esc(b.hook || (CATS[b.cat] ? CATS[b.cat].label : '')) + '</span></span></button>'; }).join('')
      + '</div>';
    openLayer(html);
  }

  /* ---------- commande ---------- */
  var KEY_ME = 'bb-me';
  function openPay(o){
    var b = o.book && BY[o.book] && BY[o.book].active ? BY[o.book] : null, p = o.pack && PBY[o.pack];
    if (!b && !p) return;
    var me = BB.store(KEY_ME) || {};
    var i = p && packInfo(p), l = p && packBooks(p);
    var title = b ? b.title : 'Pack « ' + p.name + ' »';
    var price = b ? S.priceBook : i.price;
    var meth = me.meth || 'mtn';
    var html = '<div class="pay">'
      + '<div class="pay-top">' + (b ? cover(b.cover, true) : '<div class="fan">' + fan(l, true) + '</div>')
      + '<h2>' + esc(title) + '</h2><p class="ref">' + (b ? no3(b.no) : i.n + ' livres · ' + l.map(function(x){ return no3(x.no); }).join(', ')) + '</p>'
      + '<p class="pay-price">' + fmt(price) + '</p></div>'
      + '<div class="fields"><div class="fld" id="fName"><label for="pName">Ton prénom</label><input id="pName" autocomplete="given-name" placeholder="Ex. Aïcha" value="' + esc(me.name || '') + '"></div>'
      + '<div class="fld"><label for="pCountry">Ton pays</label><select id="pCountry">' + S.countries.map(function(c){ return '<option' + (c === (me.country || S.countries[0]) ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div></div>'
      + '<div class="meths" role="group" aria-label="Moyen de paiement">'
      + '<button class="meth" data-meth="mtn" style="--mc:#FFCC00" aria-pressed="' + (meth === 'mtn') + '"><img src="assets/img/mtn.svg" alt="" width="38" height="38"><span><b>MTN MoMo</b><small>Mobile Money</small></span></button>'
      + '<button class="meth" data-meth="orange" style="--mc:#FF7900" aria-pressed="' + (meth === 'orange') + '"><img src="assets/img/orange.svg" alt="" width="38" height="38"><span><b>Orange Money</b><small>Mobile Money</small></span></button></div>'
      + '<button class="btn btn-wa btn-block" id="payGo">' + ic('wa') + '<span>Commander sur WhatsApp</span></button>'
      + '<p class="pay-safe">' + ic('shield') + '<span>' + esc(S.guarantee) + '</span></p></div>';
    var layer = openLayer(html);
    layer.querySelector('.meths').addEventListener('click', function(e){
      var m = e.target.closest('[data-meth]'); if (!m) return;
      meth = m.dataset.meth;
      layer.querySelectorAll('[data-meth]').forEach(function(x){ x.setAttribute('aria-pressed', String(x === m)); });
    });
    layer.querySelector('#payGo').addEventListener('click', function(){
      var name = layer.querySelector('#pName').value.trim(), country = layer.querySelector('#pCountry').value;
      var f = layer.querySelector('#fName');
      if (!name){ f.classList.remove('err'); void f.offsetWidth; f.classList.add('err'); layer.querySelector('#pName').focus(); return; }
      BB.store(KEY_ME, {name: name, country: country, meth: meth});
      var lines = ['Bonjour Baobab Book, je veux commander :', ''];
      if (b) lines.push(no3(b.no) + ' — ' + b.title, 'Prix : ' + fmt(price));
      else {
        lines.push('Pack « ' + p.name + ' » (' + i.n + ' livres)', 'Prix : ' + fmt(price), '');
        l.forEach(function(x){ lines.push('• ' + no3(x.no) + ' — ' + x.title); });
      }
      lines.push('', 'Prénom : ' + name, 'Pays : ' + country, 'Paiement : ' + (meth === 'mtn' ? 'MTN MoMo' : 'Orange Money'), '', 'Merci de m’envoyer le numéro de paiement.');
      openWa(lines.join('\n'));
    });
  }

  /* ============================================================
     NAVIGATION, EN-TÊTE, LIENS DIRECTS
     ============================================================ */
  /* Liens à partager (Facebook) : #livre-12 ou #pack-P001 */
  function route(){
    var h = location.hash, m;
    if ((m = /^#livre-(\d+)$/.exec(h))){
      var n = +m[1], b = DB.books.filter(function(x){ return x.no === n; })[0];
      if (b){ history.replaceState(null, '', location.pathname + location.search); openBook(b.id); }
    } else if ((m = /^#pack-([\w-]+)$/.exec(h)) && PBY[m[1]]){
      history.replaceState(null, '', location.pathname + location.search); openPack(m[1]);
    }
  }
  var routed = false;

  (function(){
    var hdr = $('hdr'), lastY = 0, tick = false;
    window.addEventListener('scroll', function(){
      if (tick) return; tick = true;
      requestAnimationFrame(function(){
        var y = window.scrollY;
        hdr.classList.toggle('hide', y > 320 && y > lastY + 4);
        if (y < lastY - 4 || y < 320) hdr.classList.remove('hide');
        lastY = y; tick = false;
      });
    }, {passive: true});
    if ('IntersectionObserver' in window){
      var bn = document.querySelectorAll('.bnav [data-bn]');
      new IntersectionObserver(function(en){
        var k = en[0].isIntersecting ? 'livres' : 'top';
        bn.forEach(function(a){ a.classList.toggle('on', a.dataset.bn === k); });
      }, {rootMargin: '-40% 0px -55% 0px'}).observe($('livres'));
      /* Apparition douce, seulement pour ce qui est sous l'écran au chargement (jamais de bloc vide) */
      var io = new IntersectionObserver(function(en){ en.forEach(function(x){ if (x.isIntersecting){ x.target.classList.add('on'); io.unobserve(x.target); } }); }, {rootMargin: '0px 0px 10% 0px'});
      document.querySelectorAll('.steps, .guarantee').forEach(function(el){
        if (el.getBoundingClientRect().top > innerHeight){ el.classList.add('reveal'); io.observe(el); }
      });
    }
    $('year').textContent = new Date().getFullYear();
  })();

  /* ---------- démarrage ---------- */
  BB.load(function(db){
    var first = !DB;
    setData(db);
    if (first && !routed) routed = true;
  })['catch'](function(){
    $('bookGrid').innerHTML = '<p class="empty">Le catalogue n’a pas pu se charger. Vérifie ta connexion puis recharge la page.</p>';
  });
})();
