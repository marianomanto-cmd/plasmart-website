/* ============================================================
   PLASMART v3 — motion (Lenis + GSAP + SplitType, with fallbacks)
   ============================================================ */
(function () {
  'use strict';
  var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GS = window.gsap, ST = window.ScrollTrigger, ST_OK = !!(GS && ST);
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (ST_OK) GS.registerPlugin(ST);

  /* ---------- Loader (always clears) ---------- */
  var loader = document.querySelector('.loader');
  var loaderGone = false;
  function killLoader() {
    if (loaderGone) return; loaderGone = true;
    document.documentElement.classList.add('loaded');
    if (!loader) { heroIn(); return; }
    if (GS && !REDUCE) {
      GS.to(loader, { yPercent: -100, duration: 1, ease: 'expo.inOut', onComplete: function () { loader.remove(); } });
    } else {
      loader.style.transition = 'opacity .5s, transform .7s';
      loader.style.opacity = '0'; loader.style.transform = 'translateY(-100%)';
      setTimeout(function () { if (loader) loader.remove(); }, 700);
    }
    heroIn();
  }
  setTimeout(killLoader, 2600); // hard fallback
  // count animation
  (function () {
    var num = document.querySelector('.loader .lnum'), bar = document.querySelector('.loader-bar');
    if (!num) return;
    if (REDUCE) { num.textContent = '100'; return; }
    var start = null, dur = 1700;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      num.textContent = Math.round(e * 100);
      if (bar) bar.style.width = (e * 100) + '%';
      if (p < 1) requestAnimationFrame(step); else setTimeout(killLoader, 220);
    }
    requestAnimationFrame(step);
  })();

  /* ---------- Lenis smooth scroll ---------- */
  var lenis = null;
  if (window.Lenis && !REDUCE) {
    lenis = new Lenis({ lerp: 0.1, duration: 1.2, smoothWheel: true });
    if (ST_OK) {
      lenis.on('scroll', ST.update);
      GS.ticker.add(function (t) { lenis.raf(t * 1000); });
      GS.ticker.lagSmoothing(0);
    } else {
      function raf(t) { lenis.raf(t); requestAnimationFrame(raf); } requestAnimationFrame(raf);
    }
    // anchor links
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var t = document.querySelector(a.getAttribute('href'));
        if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: 0, duration: 1.4 }); }
      });
    });
  }

  /* ---------- Scroll progress + nav backdrop ---------- */
  var prog = document.querySelector('.progress');
  var navEl = document.querySelector('.nav');
  function updateProg() {
    var y = window.scrollY || document.documentElement.scrollTop;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var p = h > 0 ? y / h : 0;
    if (prog) prog.style.width = (p * 100) + '%';
    if (navEl) navEl.classList.toggle('scrolled', y > 40); // solid bar once scrolled past hero top
  }
  window.addEventListener('scroll', updateProg, { passive: true });
  if (lenis) lenis.on('scroll', updateProg);
  updateProg();

  /* ---------- Custom cursor ---------- */
  if (FINE && !REDUCE) {
    var ring = document.createElement('div'); ring.className = 'cursor';
    var dot = document.createElement('div'); dot.className = 'cursor-dot';
    document.body.appendChild(ring); document.body.appendChild(dot);
    document.documentElement.classList.add('cursor-on');
    var rx, ry;
    if (GS) { rx = GS.quickTo(ring, 'x', { duration: .4, ease: 'power3' }); ry = GS.quickTo(ring, 'y', { duration: .4, ease: 'power3' }); }
    document.addEventListener('mousemove', function (e) {
      dot.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
      if (GS) { rx(e.clientX); ry(e.clientY); }
      else ring.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
    });
    var HOT = 'a, button, .btn, .cap-row, .wcard, .arrow-link';
    document.addEventListener('mouseover', function (e) { if (e.target.closest(HOT)) ring.classList.add('hot'); });
    document.addEventListener('mouseout', function (e) { if (e.target.closest(HOT)) ring.classList.remove('hot'); });
  }

  /* ---------- Hero entrance ---------- */
  var heroDone = false;
  function heroIn() {
    if (heroDone) return; heroDone = true;
    if (!GS || REDUCE) return;
    var tl = GS.timeline();
    var lines = document.querySelectorAll('.hero h1 .ln-in');
    if (lines.length) tl.from(lines, { yPercent: 115, duration: 1.1, ease: 'power4.out', stagger: .1 });
    else tl.from('.hero h1', { y: 60, opacity: 0, duration: 1, ease: 'power3.out' });
    tl.from('.hero-top > *', { opacity: 0, y: 18, stagger: .08, duration: .7, ease: 'power2.out' }, '-=.7')
      .from('.hero-cta', { opacity: 0, y: 18, duration: .7, ease: 'power2.out' }, '-=.55')
      .from('.hero-foot > *', { opacity: 0, y: 18, stagger: .08, duration: .7, ease: 'power2.out' }, '-=.5');
  }

  /* ---------- Scroll reveals ---------- */
  if (ST_OK && !REDUCE) {
    GS.utils.toArray('[data-rv]').forEach(function (el) {
      if (el.closest('.work-grid')) return; // project cards live in the moving marquee
      GS.to(el, { opacity: 1, y: 0, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 86%' } });
    });
    GS.utils.toArray('[data-clip]').forEach(function (el) {
      GS.to(el, { clipPath: 'inset(0% 0 0 0)', duration: 1.2, ease: 'power3.inOut',
        scrollTrigger: { trigger: el, start: 'top 84%' } });
    });

    /* manifesto word scrub */
    var mani = document.querySelector('.mani p');
    if (mani) {
      GS.to('.mani .w:not(.accent)', { color: '#eef0f3', stagger: .5, ease: 'none',
        scrollTrigger: { trigger: mani, start: 'top 80%', end: 'bottom 60%', scrub: .6 } });
      GS.to('.mani .accent', { color: '#6e7bff', ease: 'none',
        scrollTrigger: { trigger: mani, start: 'top 70%', end: 'bottom 60%', scrub: .6 } });
    }

    /* applications image parallax */
    GS.utils.toArray('.app3-row .ap-pic img').forEach(function (img) {
      GS.fromTo(img, { yPercent: -10 }, { yPercent: 10, ease: 'none',
        scrollTrigger: { trigger: img.closest('.app3-row'), start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    /* projects grid uses an infinite vertical marquee instead of scroll parallax (see module below) */
  }

  /* ---------- Hover-card (text) on capability list ---------- */
  var rows0 = Array.prototype.slice.call(document.querySelectorAll('.cap-row'));
  (function () {
    var mqM = window.matchMedia('(max-width: 760px)');
    rows0.forEach(function (row) {
      if (!row.querySelector('.cap-plus')) {
        var plus = document.createElement('span'); plus.className = 'cap-plus'; plus.textContent = '+';
        row.appendChild(plus);
      }
      var d = row.querySelector('.cdesc');
      row.addEventListener('mouseenter', function () { if (!mqM.matches && d) d.classList.add('seen'); });
      row.addEventListener('click', function () {
        if (!mqM.matches) return;
        var wasOpen = row.classList.contains('open');
        rows0.forEach(function (r) { r.classList.remove('open'); });
        if (!wasOpen) row.classList.add('open');
      });
    });
  })();

  /* ---------- Magnetic buttons ---------- */
  if (FINE && !REDUCE && GS) {
    document.querySelectorAll('[data-magnet]').forEach(function (el) {
      var mx = GS.quickTo(el, 'x', { duration: .5, ease: 'power3' });
      var my = GS.quickTo(el, 'y', { duration: .5, ease: 'power3' });
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        mx((e.clientX - (r.left + r.width / 2)) * .4);
        my((e.clientY - (r.top + r.height / 2)) * .4);
      });
      el.addEventListener('mouseleave', function () { mx(0); my(0); });
    });
  }

  /* ---------- Counters (independent of GSAP) ---------- */
  function fmtCount(el, v) {
    var raw = el.dataset.count, decs = el.dataset.dec === '1' ? ((raw.split('.')[1] || '').length || 1) : 0;
    var es = (document.documentElement.lang || 'es').toLowerCase().indexOf('en') !== 0; // EN page uses '.'
    return decs > 0 ? v.toFixed(decs).replace('.', es ? ',' : '.') : Math.round(v).toLocaleString(es ? 'es-AR' : 'en-US');
  }
  function animateCount(el) {
    var target = parseFloat(el.dataset.count), start = null, dur = 1400;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtCount(el, target * e);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = fmtCount(el, target);
    }
    requestAnimationFrame(step);
  }
  function checkCounters() {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      if (el._c) return; var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9 && r.bottom > 0) { el._c = true; animateCount(el); }
    });
  }
  window.addEventListener('scroll', checkCounters, { passive: true });
  if (lenis) lenis.on('scroll', checkCounters);
  checkCounters();
  setTimeout(function () {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      if (!el._c) { el._c = true; el.textContent = fmtCount(el, parseFloat(el.dataset.count)); }
    });
  }, 2200);

  /* ---------- Hero video: crossfade loop (no hard cut) ---------- */
  (function () {
    var va = document.getElementById('heroVideo3'), vb = document.getElementById('heroVideo3b');
    if (!va) return;
    var MAXO = 0.4, FADE = 1.1;
    function play(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    if (!vb) { va.style.opacity = MAXO; play(va); document.addEventListener('pointerdown', function () { play(va); }, { once: true }); return; }
    va.style.opacity = MAXO; vb.style.opacity = 0;
    var cur = va, nxt = vb, swapping = false;
    play(va);
    function tick() {
      var d = cur.duration;
      if (d && cur.currentTime > d - FADE && !swapping) {
        swapping = true;
        try { nxt.currentTime = 0; } catch (e) {}
        play(nxt);
        nxt.style.opacity = MAXO; cur.style.opacity = 0;
        var t = cur; cur = nxt; nxt = t;
        setTimeout(function () { swapping = false; }, FADE * 1000);
      }
    }
    va.addEventListener('timeupdate', tick); vb.addEventListener('timeupdate', tick);
    document.addEventListener('pointerdown', function () { play(cur); }, { once: true });
    window.addEventListener('scroll', function () { play(cur); }, { once: true, passive: true });
  })();

  /* ---------- Aplicaciones: accordion auto-rotate ---------- */
  (function () {
    var acc = document.getElementById('appsAcc3');
    if (!acc) return;
    var panels = Array.prototype.slice.call(acc.querySelectorAll('.acc3-panel'));
    var idx = 0, timer = null, paused = false, DWELL = 5200;
    function prog() {
      panels.forEach(function (p) { var b = p.querySelector('.acc3-prog'); b.style.transition = 'none'; b.style.width = '0%'; });
      if (paused) return;
      var bar = panels[idx].querySelector('.acc3-prog');
      void bar.offsetWidth;
      bar.style.transition = 'width ' + DWELL + 'ms linear'; bar.style.width = '100%';
    }
    function set(i) { idx = (i + panels.length) % panels.length; panels.forEach(function (p, k) { p.classList.toggle('is-active', k === idx); }); prog(); }
    function start() { stop(); timer = setInterval(function () { if (!paused) set(idx + 1); }, DWELL); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    panels.forEach(function (p, k) {
      p.addEventListener('mouseenter', function () { paused = true; set(k); });
      p.addEventListener('click', function () { set(k); });
    });
    acc.addEventListener('mouseleave', function () { paused = false; prog(); start(); });
    set(0); start();
  })();

  /* ---------- Mail modal ---------- */
  (function () {
    var modal = document.getElementById('mailModal');
    if (!modal) return;
    var form = document.getElementById('mailForm'), ok = document.getElementById('mailOk');
    function open() {
      modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
      if (lenis) lenis.stop(); document.body.style.overflow = 'hidden';
      var f = modal.querySelector('input'); if (f) setTimeout(function () { f.focus(); }, 320);
    }
    function close() {
      modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
      if (lenis) lenis.start(); document.body.style.overflow = '';
    }
    document.querySelectorAll('[data-modal="mail"]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); open(); });
    });
    modal.querySelector('.modal-x').addEventListener('click', close);
    modal.querySelector('.modal-bg').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = new FormData(form);
      var en = (document.documentElement.lang || 'es').toLowerCase().indexOf('en') === 0;
      var t = en ? { subj: 'Web inquiry — ', name: 'Name: ', email: 'Email: ', tel: 'Phone: ' }
                 : { subj: 'Consulta web — ', name: 'Nombre: ', email: 'Email: ', tel: 'Teléfono: ' };
      var subj = encodeURIComponent(t.subj + (d.get('nombre') || ''));
      var body = encodeURIComponent(t.name + (d.get('nombre') || '') + '\n' + t.email + (d.get('email') || '') + '\n' + t.tel + (d.get('tel') || '') + '\n\n' + (d.get('msg') || ''));
      if (ok) ok.style.display = 'block';
      window.location.href = 'mailto:ventasplasmart@transfil.com.ar?subject=' + subj + '&body=' + body;
      setTimeout(close, 1200);
    });
  })();

  /* ---------- Proyectos: mobile gallery \u2014 slow auto-marquee + free swipe + tap to pause ---------- */
  (function () {
    var mount = document.getElementById('workMobile'), grid = document.querySelector('.work-grid');
    if (!mount || !grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.wcard:not([data-clone])'));
    var items = cards.map(function (c) {
      var img = c.querySelector('img'), nm = (c.querySelector('.nm') || {}).textContent || '';
      var parts = nm.split('\u00b7');
      return { src: img ? img.getAttribute('src') : '', num: (parts[0] || '').trim(), name: (parts[1] || parts[0] || '').trim() };
    });
    items.sort(function (a, b) { return parseInt(a.num, 10) - parseInt(b.num, 10); });
    if (!items.length) return;
    var total = String(items.length).padStart(2, '0');
    var en = (document.documentElement.lang || 'es').toLowerCase().indexOf('en') === 0;
    function card(it, i, clone) {
      return '<article class="wm-card"' + (clone ? ' aria-hidden="true"' : '') + '>' +
        '<div class="wm-pic"><img ' + ((i > 1 || clone) ? 'loading="lazy" ' : '') + 'decoding="async" src="' + it.src + '" alt="' + (clone ? '' : it.name) + '"></div>' +
        '<div class="wm-cap"><span class="wm-nm">' + it.name + '</span><span class="wm-ix">' + it.num + ' / ' + total + '</span></div>' +
        '</article>';
    }
    // render the set twice for a seamless loop
    var twice = items.map(function (it, i) { return card(it, i, false); }).join('') +
                items.map(function (it, i) { return card(it, i, true); }).join('');
    var baseHint = REDUCE ? (en ? 'swipe to browse \u2192' : 'desliz\u00e1 para recorrer \u2192')
                          : (en ? 'swipe \u00b7 tap to pause' : 'desliz\u00e1 \u00b7 toc\u00e1 para pausar');
    mount.innerHTML = '<div class="wm-track">' + twice + '</div>' +
      '<div class="wm-foot"><span class="wm-hint mono">' + baseHint + '</span></div>';
    var trackEl = mount.querySelector('.wm-track'), hintEl = mount.querySelector('.wm-hint');

    var oneSet = 0;
    function measure() {
      var a = mount.querySelectorAll('.wm-card');
      oneSet = a.length > items.length ? (a[items.length].offsetLeft - a[0].offsetLeft) : 0;
    }
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    measure();

    if (REDUCE) return; // no auto-marquee under reduced motion; gallery stays free-swipe

    var SPEED = 32, paused = false, hold = false, resumeT = null, last = 0;
    function holdOn() { hold = true; clearTimeout(resumeT); }
    function holdOff() { clearTimeout(resumeT); resumeT = setTimeout(function () { hold = false; }, 1400); }
    trackEl.addEventListener('touchstart', holdOn, { passive: true });
    trackEl.addEventListener('touchend', holdOff, { passive: true });
    trackEl.addEventListener('pointerdown', holdOn, { passive: true });
    trackEl.addEventListener('pointerup', holdOff, { passive: true });
    trackEl.addEventListener('wheel', function () { holdOn(); holdOff(); }, { passive: true });
    trackEl.addEventListener('click', function () {
      paused = !paused; mount.classList.toggle('wm-paused', paused);
      hintEl.textContent = paused ? (en ? 'paused \u00b7 tap to resume' : 'en pausa \u00b7 toc\u00e1 para reanudar') : baseHint;
    });
    function frame(ts) {
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0; last = ts;
      if (!paused && !hold && oneSet > 0) {
        trackEl.scrollLeft += SPEED * dt;
        if (trackEl.scrollLeft >= oneSet) trackEl.scrollLeft -= oneSet; // seamless wrap
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })();

  /* ---------- Proyectos: infinite vertical marquee (desktop) ----------
     Each column scrolls on its own (slot-machine), at a different speed,
     and couples its velocity to the page scroll velocity. The cards are
     wrapped in a .wg-track that is translated and looped seamlessly; the
     .wg-col is clipped to one set's height so the page flow stays normal. */
  (function () {
    var grid = document.querySelector('.work-grid');
    if (!grid) return;
    var cols = Array.prototype.slice.call(grid.querySelectorAll('.wg-col'));
    if (!cols.length) return;

    // cards live in a continuously moving track → always visible (no scroll-reveal)
    grid.querySelectorAll('.wcard').forEach(function (c) {
      c.removeAttribute('data-rv'); c.style.opacity = '1'; c.style.transform = 'none';
    });

    if (!GS || REDUCE) return; // static grid; cards already visible

    var deskMQ = window.matchMedia('(min-width: 761px)');
    var lanes = [], built = false, running = false, lastScroll = 0, vel = 0;
    var MULS = [0.85, 1.1, 0.7], FRAC = [0, 0.4, 0.7]; // per-column scroll coupling + start offset

    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    function build() {
      lanes = cols.map(function (col, i) {
        var trk = col.querySelector('.wg-track');
        if (!trk) {
          trk = document.createElement('div'); trk.className = 'wg-track';
          while (col.firstChild) trk.appendChild(col.firstChild);
          col.appendChild(trk);
        }
        Array.prototype.slice.call(trk.querySelectorAll('[data-clone]')).forEach(function (n) { n.remove(); });
        trk.style.transform = 'translate3d(0,0,0)';
        col.classList.add('is-marquee'); col.style.height = 'auto';
        var cs = getComputedStyle(trk);
        var gap = parseFloat(cs.rowGap); if (isNaN(gap)) gap = parseFloat(cs.gap) || 0;
        var setH = trk.scrollHeight;            // one set (clones removed)
        var loop = setH + gap;                   // seamless wrap distance
        col.style.height = setH + 'px';          // clip to one set
        Array.prototype.slice.call(trk.children).forEach(function (card) {
          var cl = card.cloneNode(true);
          cl.setAttribute('data-clone', ''); cl.setAttribute('aria-hidden', 'true');
          trk.appendChild(cl);
        });
        // marquee is desktop-only & continuously animated → load images eagerly so clones never blank
        Array.prototype.slice.call(trk.querySelectorAll('img')).forEach(function (im) { im.loading = 'eager'; });
        var sp = parseFloat(col.getAttribute('data-speed')) || 0.05;
        return { trk: trk, loop: loop, pos: loop * (FRAC[i] || 0), auto: 26 + sp * 260, mul: (MULS[i] != null ? MULS[i] : 1) };
      });
      built = true;
    }

    function frame(time, dt) {
      if (!running || !built) return;
      var s = window.scrollY || document.documentElement.scrollTop || 0;
      var dts = Math.min((dt || 16) / 1000, 0.05);
      var raw = dts > 0 ? (s - lastScroll) / dts : 0;   // scroll velocity (px/s)
      lastScroll = s;
      vel = clamp(lerp(vel, raw, 0.12), -3000, 3000);   // smoothed + clamped
      for (var k = 0; k < lanes.length; k++) {
        var L = lanes[k];
        if (!L.loop) continue;
        L.pos += (L.auto + vel * L.mul) * dts;
        var y = L.pos % L.loop; if (y < 0) y += L.loop;
        L.trk.style.transform = 'translate3d(0,' + (-y) + 'px,0)';
      }
    }
    GS.ticker.add(frame);

    function startEngine() { if (!built) build(); lastScroll = window.scrollY || 0; running = true; }
    function stopEngine() {
      running = false;
      cols.forEach(function (col) {
        var t = col.querySelector('.wg-track'); if (t) t.style.transform = 'translate3d(0,0,0)';
        col.classList.remove('is-marquee'); col.style.height = '';
      });
      built = false;
    }
    function sync() { if (deskMQ.matches) startEngine(); else stopEngine(); }

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (deskMQ.matches) { stopEngine(); startEngine(); } else { stopEngine(); } }, 200);
    });
    if (deskMQ.addEventListener) deskMQ.addEventListener('change', sync); else if (deskMQ.addListener) deskMQ.addListener(sync);
    window.addEventListener('load', function () { if (deskMQ.matches) { stopEngine(); startEngine(); } }); // re-measure after fonts/images
    sync();
  })();

  /* ---------- Analytics: dataLayer listeners (GTM) ----------
     Direct wa.me clicks (those that bypass the /whatsapp intermediate) and outbound
     social clicks are pushed to the dataLayer; GTM (configured outside the code) maps
     them to GA4 / Google Ads. The hero/nav/contact/floating CTAs route through
     /whatsapp/?src=... which fires `whatsapp_click` on that page instead. */
  (function () {
    window.dataLayer = window.dataLayer || [];
    var SOCIAL = { 'instagram.com': 'instagram', 'facebook.com': 'facebook', 'fb.com': 'facebook', 'linkedin.com': 'linkedin', 'twitter.com': 'twitter', 'x.com': 'twitter', 'youtube.com': 'youtube', 'tiktok.com': 'tiktok' };
    document.addEventListener('click', function (e) {
      var link = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!link || !link.href) return;
      var href = link.href.toLowerCase();
      var waDirect = (href.indexOf('wa.me/') !== -1 || href.indexOf('api.whatsapp.com/send') !== -1) && href.indexOf('/whatsapp') === -1;
      if (waDirect) {
        window.dataLayer.push({ event: 'whatsapp_direct_click', lead_type: 'whatsapp_direct', lead_value: 50000, value: 50000, currency: 'ARS' });
        return;
      }
      for (var d in SOCIAL) {
        if (href.indexOf(d) !== -1) {
          window.dataLayer.push({ event: 'social_click', lead_type: SOCIAL[d], social_url: link.href });
          return;
        }
      }
    }, false);
  })();

  /* ---------- Nav active section (scrollspy) ---------- */
  (function () {
    if (!('IntersectionObserver' in window)) return;
    var links = {};
    document.querySelectorAll('.nav-mid a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute('href').slice(1); if (id) links[id] = a;
    });
    var ids = Object.keys(links); if (!ids.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) ids.forEach(function (id) { links[id].classList.toggle('active', id === e.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    ids.forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  })();

  /* refresh ST after load (fonts/images) */
  if (ST_OK) window.addEventListener('load', function () { ST.refresh(); });
})();
