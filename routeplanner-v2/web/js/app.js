/* OG Routeplanner — UI */
(function () {
  'use strict';
  var CFG = window.OG_CONFIG, S = window.OG_SERVICES, P = window.OG_PLANNER, X = window.OG_EXPORT,
    M = window.OG_MAP, F = window.OG_FUEL, VEH = window.OG_VEHICLES, CTRY = window.OG_COUNTRIES, I18N = window.OG_I18N;

  var LOCALES = { nl: 'nl-NL', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', sv: 'sv-SE' };
  var VEH_ORDER = ['tractor', 'rigid', 'van', 'car', 'custom'];
  var MAX_VIAS = 5;
  var SPARK = 'assets/spark.png', LOGO = 'assets/logo.svg';

  var params = X.readParams();
  var state = {
    lang: 'nl',
    view: 'plan',
    internal: !!CFG.internal || (CFG.allowInternalParam && (params.intern === '1' || params.intern === 'true')),
    points: [newPoint('start'), newPoint('end')],
    veh: 'tractor',
    price: 'std',
    result: null,
    busy: false,
    st: { countries: null, other: false, q: '', limit: 60, active: null }
  };

  /* ---------------- hulpfuncties ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('ogrp.' + k)); localStorage.setItem('ogrp.' + k, JSON.stringify(v)); } catch (e) { return null; } }
  function fold(s) { return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function newPoint(kind) { return { kind: kind, text: '', sel: null }; }

  function t(key, vars) {
    var d = I18N[state.lang] || I18N.nl;
    var s = d[key] != null ? d[key] : (I18N.nl[key] != null ? I18N.nl[key] : key);
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  function loc() { return LOCALES[state.lang] || 'nl-NL'; }
  function nf(v, d) { return new Intl.NumberFormat(loc(), { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }).format(v); }
  function eur(v, d) { return new Intl.NumberFormat(loc(), { style: 'currency', currency: 'EUR', maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }).format(v); }
  function km(v) { return nf(v) + ' km'; }
  function pct(v) { return nf(Math.round(v * 100)) + '%'; }
  function dur(sec) {
    var m = Math.round(sec / 60), h = Math.floor(m / 60);
    return h ? h + ' ' + t('hUnit') + ' ' + String(m % 60).padStart(2, '0') + ' ' + t('minUnit') : m + ' ' + t('minUnit');
  }
  function clock(d, ref) {
    var s = new Intl.DateTimeFormat(loc(), { hour: '2-digit', minute: '2-digit' }).format(d);
    if (ref && d.toDateString() !== ref.toDateString()) s = new Intl.DateTimeFormat(loc(), { weekday: 'short' }).format(d) + ' ' + s;
    return s;
  }
  function country(cc) { var c = CTRY[cc]; return c ? (c[state.lang] || c.en) : (cc || '—'); }
  function flag(cc) { return (CTRY[cc] && CTRY[cc].flag) || ''; }
  function toast(msg, ms) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, ms || 2600);
  }
  var ICON = {
    nav: '<svg viewBox="0 0 24 24"><path d="m3 11 19-9-9 19-2-8-8-2Z"/></svg>',
    map: '<svg viewBox="0 0 24 24"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    loc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    pump: '<svg viewBox="0 0 24 24"><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M15 10h2a2 2 0 0 1 2 2v5a1 1 0 0 0 2 0V8l-3-3M8 8h4"/></svg>',
    gmaps: '<svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14"/></svg>',
    gpx: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    csv: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>',
    pdf: '<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M4 22V4M4 4h13l-2 4 2 4H4"/></svg>'
  };

  /* ---------------- taal ---------------- */
  function pickLang() {
    var want = (params.lang || store('lang') || CFG.defaultLang || (navigator.language || 'nl')).slice(0, 2).toLowerCase();
    return I18N[want] ? want : 'nl';
  }
  function applyI18n() {
    document.documentElement.lang = state.lang;
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-title]').forEach(function (el) { el.title = t(el.getAttribute('data-i18n-title')); el.setAttribute('aria-label', el.title); });
    $$('[data-i18n-ph]').forEach(function (el) { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    document.title = t('pageTitle');
    $('#lang').value = state.lang;
    renderVehSeg();
    renderPoints();
    updateRangeChip();
    renderFoot();
    if (state.result) renderResults(state.result); else renderEmpty();
    if (state.view === 'stations') renderStations();
  }

  /* ---------------- thema ---------------- */
  function isDark() {
    var th = document.documentElement.getAttribute('data-theme');
    if (th) return th === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function setTheme(th, save) {
    if (th) document.documentElement.setAttribute('data-theme', th);
    else document.documentElement.removeAttribute('data-theme');
    if (save) store('theme', th);
    $$('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === (isDark() ? 'dark' : 'light'))); });
    M.setTheme(isDark());
  }

  /* ---------------- routepunten & autocomplete ---------------- */
  function pointLabel(i) {
    var p = state.points[i];
    if (p.kind === 'start') return t('start');
    if (p.kind === 'end') return t('destination');
    return t('via') + ' ' + i;
  }
  function renderPoints() {
    var ol = $('#pts');
    ol.innerHTML = '';
    state.points.forEach(function (p, i) {
      var li = document.createElement('li');
      li.className = 'pt';
      li.setAttribute('data-kind', p.kind);
      var dot = p.kind === 'start' ? 'A' : p.kind === 'end' ? 'B' : String(i);
      var ph = p.kind === 'start' ? t('phStart') : p.kind === 'end' ? t('phEnd') : t('phVia');
      li.innerHTML = '<span class="pt-dot" aria-hidden="true">' + dot + '</span>' +
        '<div class="ac"><label class="sr" for="pt' + i + '">' + esc(pointLabel(i)) + '</label>' +
        '<input type="text" id="pt' + i + '" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ac' + i + '" placeholder="' + esc(ph) + '" value="' + esc(p.text) + '" class="' + (p.sel ? 'ok' : '') + '">' +
        '<ul class="ac-list" id="ac' + i + '" role="listbox" hidden></ul></div>' +
        (p.kind === 'start'
          ? '<button type="button" class="ib sm" data-act="locate" title="' + esc(t('myLocation')) + '" aria-label="' + esc(t('myLocation')) + '">' + ICON.loc + '</button>'
          : p.kind === 'via'
            ? '<button type="button" class="ib sm" data-act="remove" title="' + esc(t('remove')) + '" aria-label="' + esc(t('remove')) + '">' + ICON.x + '</button>'
            : '<span class="ib sm" aria-hidden="true"></span>');
      ol.appendChild(li);
      bindAutocomplete(li, i);
    });
    $('#addVia').disabled = state.points.length - 2 >= MAX_VIAS;
  }

  function stationMatches(q) {
    var f = fold(q);
    if (f.length < 2) return [];
    var res = [];
    P.stations.forEach(function (s) {
      if (!s.og) return;
      var hay = fold(s.city + ' ' + s.brand + ' og');
      if (hay.indexOf(f) !== -1 || f.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; })) res.push(s);
    });
    return res.slice(0, 3).map(stationSel);
  }
  function stationSel(s) {
    return { main: s.city + (s.brand && s.brand !== 'OG Clean Fuels' ? ' · ' + s.brand : ''), detail: 'OG Clean Fuels · ' + country(s.cc), lat: s.lat, lon: s.lon, cc: s.cc, stationId: s.id, og: s.og };
  }
  function selText(sel) {
    if (sel.stationId != null) return sel.main;
    var first = (sel.detail || '').split(',')[0].trim();
    return sel.main + (first && first !== sel.main && !/^\d/.test(first) ? ', ' + first : '');
  }

  function bindAutocomplete(li, i) {
    var input = $('input', li), list = $('.ac-list', li), items = [], active = -1, timer = null, seq = 0;
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }
    function draw(loading) {
      if (!items.length) {
        list.innerHTML = '<li class="ac-empty">' + esc(loading ? t('searching') : t('noResults')) + '</li>';
      } else {
        list.innerHTML = items.map(function (it, k) {
          var ic = it.stationId != null ? '<span class="ac-ic"><img src="' + SPARK + '" alt=""></span>' : '<span class="ac-ic">' + ICON.pin + '</span>';
          return '<li role="option" id="ac' + i + '-' + k + '" aria-selected="' + (k === active) + '" data-k="' + k + '">' + ic +
            '<div><b>' + esc(it.main) + '</b><small>' + esc(it.detail) + '</small></div></li>';
        }).join('');
      }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function choose(k) {
      var it = items[k];
      if (!it) return;
      state.points[i].sel = it;
      state.points[i].text = selText(it);
      input.value = state.points[i].text;
      input.classList.add('ok');
      input.classList.remove('bad');
      close();
      var next = $('#pt' + (i + 1));
      if (next && !state.points[i + 1].sel) next.focus();
    }
    input.addEventListener('input', function () {
      state.points[i].text = input.value;
      state.points[i].sel = null;
      input.classList.remove('ok', 'bad');
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { close(); return; }
      var local = stationMatches(q);
      items = local;
      active = -1;
      draw(true);
      var my = ++seq;
      timer = setTimeout(function () {
        S.search(q, state.lang, M.map ? M.center() : null).then(function (res) {
          if (my !== seq) return;
          items = local.concat(res).slice(0, 8);
          draw(false);
        }, function () { if (my === seq) { items = local; draw(false); } });
      }, 260);
    });
    input.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); draw(false); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); draw(false); e.preventDefault(); }
      else if (e.key === 'Enter') { if (items.length) { choose(active < 0 ? 0 : active); e.preventDefault(); } }
      else if (e.key === 'Escape') close();
      if (active >= 0) input.setAttribute('aria-activedescendant', 'ac' + i + '-' + active);
    });
    input.addEventListener('blur', function () { setTimeout(close, 160); });
    list.addEventListener('mousedown', function (e) {
      var li2 = e.target.closest('[data-k]');
      if (li2) { e.preventDefault(); choose(+li2.getAttribute('data-k')); }
    });
    var btn = $('[data-act]', li);
    if (btn) btn.addEventListener('click', function () {
      if (btn.getAttribute('data-act') === 'remove') { state.points.splice(i, 1); renderPoints(); }
      else locate(input);
    });
  }

  function locate(input) {
    if (!navigator.geolocation) { toast(t('errLocate')); return; }
    input.value = t('locating');
    navigator.geolocation.getCurrentPosition(function (pos) {
      S.reverse(pos.coords.latitude, pos.coords.longitude, state.lang).then(function (sel) {
        state.points[0].sel = sel;
        state.points[0].text = selText(sel);
        renderPoints();
      });
    }, function () {
      input.value = state.points[0].text;
      toast(t('errLocate'));
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  function setPoint(idx, sel) {
    state.points[idx].sel = sel;
    state.points[idx].text = selText(sel);
    renderPoints();
  }

  /* ---------------- voertuig & instellingen ---------------- */
  function renderVehSeg() {
    $('#vehSeg').innerHTML = VEH_ORDER.map(function (k) {
      return '<button type="button" data-v="' + k + '" aria-pressed="' + (state.veh === k) + '">' + esc(t('veh_' + k)) + '</button>';
    }).join('');
    var hgv = state.veh === 'custom' ? (+$('#wt').value || 0) > 3.5 : VEH[state.veh].ors === 'driving-hgv';
    $$('.hgv-only').forEach(function (el) { el.hidden = !hgv; });
  }
  function applyVehicle(k) {
    state.veh = k;
    var v = VEH[k];
    if (v) {
      $('#cap').value = v.cap;
      $('#cons').value = v.cons;
      $('#dcons').value = v.diesel;
      $('#wt').value = v.weight || 3.5;
      $('#ht').value = v.height || 2.5;
    }
    renderVehSeg();
    updateRangeChip();
  }
  function settings() {
    var num = function (id, d) { var v = parseFloat(String($('#' + id).value).replace(',', '.')); return isFinite(v) ? v : d; };
    var wt = num('wt', 3.5);
    var profile = state.veh === 'custom' ? (wt > 3.5 ? 'driving-hgv' : 'driving-car') : VEH[state.veh].ors;
    var dep = $('#dep').value ? new Date($('#dep').value) : new Date();
    return {
      vehicle: state.veh,
      cap: num('cap', 180), cons: num('cons', 30), dcons: num('dcons', 33),
      weight: profile === 'driving-hgv' ? wt : null, height: profile === 'driving-hgv' ? num('ht', 4) : null,
      startPct: num('sp', 100), reservePct: num('rs', 15), corridorKm: num('cor', 10),
      allowOther: $('#oth').checked, avoidTolls: $('#tol').checked, avoidFerries: $('#fer').checked,
      refuelMin: num('ref', 15), departure: isNaN(dep) ? new Date() : dep, profile: profile,
      price: state.internal ? { mode: state.price, fix: num('fix', 0), pct: num('pct', 0) } : { mode: 'std' },
      customer: state.internal ? $('#cust').value.trim() : '',
      routeName: state.internal ? $('#rname').value.trim() : ''
    };
  }
  function updateRangeChip() {
    var st = settings();
    $('#spOut').textContent = st.startPct + '%';
    $('#rsOut').textContent = st.reservePct + '%';
    $('#corOut').textContent = st.corridorKm + ' km';
    $('#rangeChip').textContent = t('rangeChip', { km: nf(P.rangeKm(st)) });
    ['sp', 'rs', 'cor'].forEach(function (id) {
      var el = $('#' + id);
      el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
    });
  }
  function saveSettings() {
    store('settings', { veh: state.veh, cap: $('#cap').value, cons: $('#cons').value, dcons: $('#dcons').value, wt: $('#wt').value, ht: $('#ht').value,
      sp: $('#sp').value, rs: $('#rs').value, cor: $('#cor').value, oth: $('#oth').checked, tol: $('#tol').checked, fer: $('#fer').checked, ref: $('#ref').value });
  }
  function loadSettings(s) {
    if (!s) return;
    if (s.veh && (VEH[s.veh] || s.veh === 'custom')) applyVehicle(s.veh);
    ['cap', 'cons', 'dcons', 'wt', 'ht', 'sp', 'rs', 'cor', 'ref'].forEach(function (k) { if (s[k] != null && s[k] !== '') $('#' + k).value = s[k]; });
    ['oth', 'tol', 'fer'].forEach(function (k) { if (s[k] != null) $('#' + k).checked = !!s[k]; });
    renderVehSeg();
    updateRangeChip();
  }
  function defaultDeparture() {
    var d = new Date(Date.now() + 15 * 60000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------------- plannen ---------------- */
  function formError(msg) {
    var el = $('#formMsg');
    el.textContent = msg || '';
    el.hidden = !msg;
  }
  function setBusy(on, key) {
    state.busy = on;
    $('#go').disabled = on;
    $('#busy').hidden = !on;
    if (key) $('#busyTxt').textContent = t(key);
  }

  function resolvePoints() {
    var jobs = state.points.map(function (p, i) {
      if (p.sel) return Promise.resolve(p.sel);
      var q = (p.text || '').trim();
      if (!q) return Promise.resolve(p.kind === 'via' ? 'skip' : null);
      return S.search(q, state.lang, M.map ? M.center() : null).then(function (r) {
        if (!r.length) return null;
        p.sel = r[0];
        p.text = selText(r[0]);
        return r[0];
      }, function () { return null; });
    });
    return Promise.all(jobs).then(function (sels) {
      var missing = [];
      sels.forEach(function (s, i) { if (s === null) missing.push(i); });
      return { sels: sels, missing: missing };
    });
  }

  function submit(e) {
    if (e) e.preventDefault();
    if (state.busy) return;
    formError('');
    var st = settings();
    if (!(st.cap > 0) || !(st.cons > 0)) { formError(t('errVehicle')); return; }
    if (st.startPct <= st.reservePct) { formError(t('errStartReserve')); return; }
    setBusy(true, 'stepGeocode');
    resolvePoints().then(function (r) {
      renderPoints();
      if (r.missing.length) {
        r.missing.forEach(function (i) { var el = $('#pt' + i); if (el) el.classList.add('bad'); });
        var first = r.missing[0];
        throw { code: state.points[first].text ? 'errNotFound' : 'errMissing', vars: { what: pointLabel(first) } };
      }
      var pts = [];
      r.sels.forEach(function (s, i) {
        if (s === 'skip') return;
        pts.push({ lat: s.lat, lon: s.lon, label: s.main, detail: s.detail, cc: s.cc, stationId: s.stationId });
      });
      saveSettings();
      return P.plan(pts, st, function (k) { setBusy(true, k); });
    }).then(function (res) {
      state.result = res;
      renderResults(res);
      M.showRoute(res, { start: t('start'), end: t('destination') }, focusWaypoint);
      if (window.matchMedia('(max-width: 860px)').matches) $('#mapCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (err) {
      var code = (err && err.code) || 'errRouting';
      formError(t(code, err && err.vars));
      if (err && err.message && code !== 'errMissing' && code !== 'errNotFound' && window.console) console.warn('[routeplanner]', err.message);
    }).then(function () { setBusy(false); });
  }

  /* ---------------- resultaten ---------------- */
  function routeTitle(res) {
    return res.points[0].label + ' → ' + res.points[res.points.length - 1].label;
  }
  function stopTitle(w) {
    if (w.type === 'stop') return w.station.city + (w.station.brand && w.station.brand !== 'OG Clean Fuels' ? ' · ' + w.station.brand : '');
    return w.point.label;
  }
  function tankBar(p) {
    var cls = p < 0.1 ? 'crit' : p < 0.25 ? 'low' : '';
    var w = Math.max(0, Math.min(1, p)) * 100;
    return '<div class="tank"><div class="tank-bar"><i class="' + cls + '" style="width:' + w.toFixed(1) + '%"></i></div><span>' + esc(t('tankLevel', { p: pct(Math.max(0, p)) })) + '</span></div>';
  }
  function stationTags(s, extra) {
    var tags = [];
    tags.push(s.og ? '<span class="tag t-green">OG Clean Fuels</span>' : '<span class="tag t-grey">' + esc(t('otherStation')) + '</span>');
    if (s.flags.unattended) tags.push('<span class="tag t-grey">' + esc(t('fUnattended')) + '</span>');
    if (s.flags.card) tags.push('<span class="tag t-amber">' + esc(t('fCard')) + '</span>');
    if (s.flags.depot) tags.push('<span class="tag t-amber">' + esc(t('fDepot')) + '</span>');
    if (s.flags.motorway) tags.push('<span class="tag t-blue">' + esc(t('fMotorway')) + '</span>');
    return tags.concat(extra || []).join('');
  }

  function renderEmpty() {
    var ex = [
      ['Groningen', 53.2194, 6.5665, 'NL', 'Göteborg', 57.7089, 11.9746, 'SE'],
      ['Rotterdam', 51.9244, 4.4777, 'NL', 'München', 48.1374, 11.5755, 'DE'],
      ['Amsterdam', 52.3728, 4.8936, 'NL', 'Lyon', 45.764, 4.8357, 'FR']
    ];
    $('#results').innerHTML = '<div class="card empty-card"><div class="sec-h"><h3>' + esc(t('howTitle')) + '</h3></div>' +
      '<ol class="steps">' +
      '<li><span>1</span><div><b>' + esc(t('how1')) + '</b>' + esc(t('how1d')) + '</div></li>' +
      '<li><span>2</span><div><b>' + esc(t('how2')) + '</b>' + esc(t('how2d')) + '</div></li>' +
      '<li><span>3</span><div><b>' + esc(t('how3')) + '</b>' + esc(t('how3d')) + '</div></li></ol>' +
      '<div class="quick">' + ex.map(function (e, k) {
        return '<button type="button" class="btn ghost sm" data-ex="' + k + '">' + esc(e[0] + ' → ' + e[4]) + '</button>';
      }).join('') + '</div></div>';
    $$('[data-ex]').forEach(function (b) {
      b.addEventListener('click', function () {
        var e = ex[+b.getAttribute('data-ex')];
        state.points = [newPoint('start'), newPoint('end')];
        state.points[0].sel = { main: e[0], detail: country(e[3]), lat: e[1], lon: e[2], cc: e[3] };
        state.points[1].sel = { main: e[4], detail: country(e[7]), lat: e[5], lon: e[6], cc: e[7] };
        state.points[0].text = e[0];
        state.points[1].text = e[4];
        renderPoints();
        submit();
      });
    });
  }

  function renderResults(res) {
    var st = res.settings, c = res.costs.total;
    var nOg = res.stops.filter(function (w) { return w.station.og && !w.gap; }).length;
    var nOther = res.stops.length - nOg;
    var vias = res.points.slice(1, -1).map(function (p) { return p.label; });
    var html = [];

    /* samenvatting */
    var alerts = [];
    if (res.gapToEnd) {
      alerts.push(alert('bad', t('alertGapEnd', { km: nf(res.gapToEnd.reachKm) }) + (res.gapToEnd.otherWouldHelp ? ' ' + t('alertTryOther') : '')));
    }
    res.gaps.forEach(function (g) {
      alerts.push(alert('bad', t('alertGap', { from: nf(g.reachKm), to: nf(g.nextKm) }) + (g.otherWouldHelp ? ' ' + t('alertTryOther') : ' ' + t('alertTryCorridor'))));
    });
    if (!res.gaps.length && !res.gapToEnd && isFinite(res.minStopArrival) && res.minStopArrival < st.reservePct / 100 - 0.02) {
      alerts.push(alert('warn', t('alertLow', { p: pct(Math.max(0, res.minStopArrival)) })));
    }
    if (!res.stops.length && !res.gapToEnd) alerts.push(alert('info', t('alertNoStops', { p: pct(res.arrivalPct) })));
    if (res.provider === 'osrm') alerts.push(alert('warn', t('alertDemo')));
    var priceTag = '';
    if (st.price.mode === 'fix' && st.price.fix > 0) priceTag = '<span class="tag t-or">' + esc(t('priceTagFix', { p: eur(st.price.fix, 3) })) + '</span>';
    else if (st.price.mode === 'pct' && st.price.pct > 0) priceTag = '<span class="tag t-or">' + esc(t('priceTagPct', { p: nf(st.price.pct, 1) })) + '</span>';

    var saveLbl = c.saving >= 0 ? t('kpiSaving') : t('kpiExtra');
    html.push('<div class="card">' +
      '<div class="r-title"><div><h2>' + esc(st.routeName || routeTitle(res)) + '</h2><p class="sub">' +
      esc((st.routeName ? routeTitle(res) + ' · ' : '') + (vias.length ? t('viaList', { list: vias.join(', ') }) + ' · ' : '') + t('veh_' + st.vehicle)) +
      (st.customer ? ' · <b>' + esc(st.customer) + '</b>' : '') + '</p></div>' + priceTag + '</div>' +
      '<div class="kpis">' +
      '<div class="kpi hero"><div><div class="lab">' + esc(saveLbl) + '</div><div class="val">' + eur(Math.abs(c.saving)) + '</div><div class="dl">' +
      esc(t('kpiSavingDl', { p: nf(Math.abs(c.savingPct)), d: eur(c.dieselEur) })) + '</div></div>' +
      '<div class="side-v"><div class="lab">' + esc(t('kpiCo2')) + '</div><div class="val">' + nf(c.co2Avoided / 1000, 1) + '<small>t</small></div><div class="dl">' + esc(t('kpiCo2Dl')) + '</div></div></div>' +
      kpi(t('kpiDistance'), nf(res.distance), 'km', '') +
      kpi(t('kpiTime'), dur(res.totalSec), '', t('kpiTimeDl', { d: dur(res.driveSec) })) +
      kpi(t('kpiStops'), String(res.stops.length), '', res.stops.length ? t('kpiStopsDl', { og: nOg, other: nOther }) : t('kpiStopsNone')) +
      kpi(t('kpiArrival'), clock(res.arrival, st.departure), '', t('tankLevel', { p: pct(Math.max(0, res.arrivalPct)) })) +
      '</div>' + alerts.join('') + '</div>');

    /* ritverloop */
    html.push('<div class="card"><div class="sec-h"><h3>' + esc(t('timelineTitle')) + '</h3><small>' + esc(t('rangeChip', { km: nf(res.fullRange) })) + '</small></div><ol class="tl">' +
      res.waypoints.map(function (w, j) { return tlItem(w, j, res); }).join('') + '</ol></div>');

    /* tankgrafiek */
    html.push('<div class="card"><div class="sec-h"><h3>' + esc(t('chartTitle')) + '</h3><small>' + esc(t('chartSub', { r: st.reservePct })) + '</small></div>' +
      '<div class="chart-wrap" id="chartWrap">' + chartSvg(res) + '<div class="chart-tip" id="chartTip" hidden></div></div></div>');

    /* kosten */
    var maxEur = Math.max(c.dieselEur, c.cngEur, 1);
    var anyAvg = res.costs.rows.some(function (r) { return r.avg; });
    html.push('<div class="card"><div class="sec-h"><h3>' + esc(t('costTitle')) + '</h3><small>' + esc(t('costSub')) + '</small></div>' +
      '<div class="cmp">' +
      '<div class="cmp-row"><b>Diesel</b><div class="cmp-bar"><i style="width:' + (c.dieselEur / maxEur * 100).toFixed(1) + '%;background:var(--diesel)"></i></div><span class="v">' + eur(c.dieselEur) + '</span></div>' +
      '<div class="cmp-row"><b>Bio-CNG</b><div class="cmp-bar"><i style="width:' + (c.cngEur / maxEur * 100).toFixed(1) + '%;background:var(--og)"></i></div><span class="v">' + eur(c.cngEur) + '</span></div>' +
      '</div>' +
      '<table class="tbl"><thead><tr><th>' + esc(t('thCountry')) + '</th><th>km</th><th>Bio-CNG</th><th>Diesel</th><th>' + esc(t('thDiff')) + '</th></tr></thead><tbody>' +
      res.costs.rows.map(function (r) {
        return '<tr><td>' + flag(r.cc) + ' ' + esc(r.cc ? country(r.cc) : t('unknown')) + (r.avg ? ' <small class="tag t-grey">' + esc(t('avg')) + '</small>' : '') + '</td><td>' + nf(r.km) + '</td>' +
          '<td title="' + nf(r.cngKg) + ' kg × ' + eur(r.cngPrice, 3) + '">' + eur(r.cngEur) + '</td><td title="' + nf(r.dieselL) + ' L × ' + eur(r.dieselPrice, 3) + '">' + eur(r.dieselEur) + '</td>' +
          '<td class="' + (r.dieselEur - r.cngEur >= 0 ? 'sav' : 'neg') + '">' + eur(r.dieselEur - r.cngEur) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td>' + esc(t('total')) + '</td><td>' + nf(c.km) + '</td><td>' + eur(c.cngEur) + '</td><td>' + eur(c.dieselEur) + '</td><td class="' + (c.saving >= 0 ? 'sav' : 'neg') + '">' + eur(c.saving) + '</td></tr></tfoot></table>' +
      '<p class="note">' + esc(t('costNote', { date: priceDate(), cons: nf(st.cons, 1), dcons: nf(st.dcons, 1) })) + (anyAvg ? ' ' + esc(t('costNoteAvg')) : '') + '</p></div>');

    /* export */
    var gm = X.googleMaps(navPoints(res));
    html.push('<div class="card"><div class="sec-h"><h3>' + esc(t('exportTitle')) + '</h3></div><div class="ex-grid">' +
      '<button type="button" class="ex wide" data-x="share">' + ICON.link + '<span><b>' + esc(t('exShare')) + '</b><small>' + esc(t('exShareD')) + '</small></span></button>' +
      '<a class="ex" href="' + esc(gm.url) + '" target="_blank" rel="noopener">' + ICON.gmaps + '<span><b>Google Maps</b><small>' + esc(gm.truncated ? t('exGmapsTrunc') : t('exGmapsD')) + '</small></span></a>' +
      '<button type="button" class="ex" data-x="gpx">' + ICON.gpx + '<span><b>GPX</b><small>' + esc(t('exGpxD')) + '</small></span></button>' +
      '<button type="button" class="ex" data-x="pdf">' + ICON.pdf + '<span><b>PDF</b><small>' + esc(t('exPdfD')) + '</small></span></button>' +
      '<button type="button" class="ex" data-x="csv">' + ICON.csv + '<span><b>CSV</b><small>' + esc(t('exCsvD')) + '</small></span></button>' +
      '</div></div>');

    $('#results').innerHTML = html.join('');
    bindResultEvents(res);
  }

  function priceDate() {
    var p = F.priceDate.split('-');
    return new Intl.DateTimeFormat(loc(), { month: 'long', year: 'numeric' }).format(new Date(+p[0], (+p[1] || 1) - 1, 1));
  }
  function alert(kind, msg) {
    return '<div class="alert ' + kind + '">' + (kind === 'info' ? ICON.info : ICON.warn) + '<span>' + esc(msg) + '</span></div>';
  }
  function kpi(lab, val, unit, dl) {
    return '<div class="kpi"><div class="lab">' + esc(lab) + '</div><div class="val">' + esc(val) + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</div>' +
      (dl ? '<div class="dl">' + esc(dl) + '</div>' : '') + '</div>';
  }
  function navPoints(res) {
    return res.waypoints.map(function (w) { return w.point || w.station; });
  }

  function tlItem(w, j, res) {
    var st = res.settings, dep = st.departure;
    var nextGap = res.waypoints[j + 1] && res.waypoints[j + 1].gap;
    var node, title, meta = [], extra = '', time = '';
    if (w.type === 'start') {
      node = '<div class="node start" data-fly="' + j + '">A</div>';
      title = w.point.label;
      if (w.point.detail) meta.push(w.point.detail);
      time = clock(w.arrive);
      extra = tankBar(st.startPct / 100);
    } else if (w.type === 'end') {
      node = '<div class="node end" data-fly="' + j + '">B</div>';
      title = w.point.label;
      meta.push(km(w.km));
      if (w.point.detail) meta.push(w.point.detail);
      time = clock(w.arrive, dep);
      extra = tankBar(w.arrivePct);
    } else if (w.type === 'via') {
      node = '<div class="node" data-fly="' + j + '">' + w.n + '</div>';
      title = w.point.label;
      meta.push(t('via') + ' · ' + km(w.km));
      time = clock(w.arrive, dep);
    } else {
      var s = w.station;
      node = '<div class="node ' + (w.gap ? 'gap' : s.og ? 'og' : 'cng') + '" data-fly="' + j + '">' +
        (w.gap ? ICON.warn : s.og ? '<img src="' + SPARK + '" alt="OG">' : ICON.pump) + '</div>';
      title = t('stopN', { n: w.n }) + ' · ' + stopTitle(w);
      meta.push(km(w.km));
      meta.push(flag(s.cc) + ' ' + country(s.cc));
      if (st.refuelMin) meta.push(t('departs', { t: clock(w.depart, dep) }));
      time = clock(w.arrive, dep);
      var tags = [];
      if (w.gap) tags.push('<span class="tag t-red">' + esc(t('gapTag')) + '</span>');
      if (w.off > 0.6) tags.push('<span class="tag t-grey">' + esc(t('detourTag', { km: nf(w.detour) })) + '</span>');
      extra = '<div class="tl-tags">' + stationTags(s, tags) + '</div>' + tankBar(w.arrivePct) +
        '<div class="tank" style="margin-top:2px"><span>' + esc(t('refuelKg', { kg: nf(w.buyKg) })) + '</span></div>';
    }
    var p = w.point || w.station;
    var actions = w.type === 'start' ? '' : '<div class="tl-act">' +
      '<a class="pill-a" href="' + esc(X.googleTo(p)) + '" target="_blank" rel="noopener">' + ICON.nav + 'Google Maps</a>' +
      '<a class="pill-a" href="' + esc(X.waze(p)) + '" target="_blank" rel="noopener">' + ICON.nav + 'Waze</a>' +
      '<button type="button" class="pill-a" data-fly="' + j + '">' + ICON.map + esc(t('showOnMap')) + '</button></div>';
    return '<li class="' + (nextGap ? 'leg-gap' : '') + '">' + node + '<div class="tl-b"><div class="tl-t"><b>' + esc(title) + '</b><time>' + esc(time) + '</time></div>' +
      '<div class="tl-m">' + esc(meta.join(' · ')) + '</div>' + extra + actions + '</div></li>';
  }

  /* SVG-grafiek van het tankniveau over de route. */
  function chartSvg(res) {
    var W = 420, H = 170, L = 34, R = 10, T = 12, B = 26;
    var total = Math.max(1, res.distance);
    var x = function (k) { return L + (k / total) * (W - L - R); };
    var y = function (p) { return T + (1 - Math.max(-0.05, Math.min(1, p))) * (H - T - B); };
    var pts = res.chart;
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.km).toFixed(1) + ' ' + y(p.pct).toFixed(1); }).join(' ');
    var area = d + ' L' + x(pts[pts.length - 1].km).toFixed(1) + ' ' + y(0) + ' L' + x(0) + ' ' + y(0) + ' Z';
    var step = niceStep(total / 5);
    var ticks = [];
    for (var k = 0; k <= total + 1e-6; k += step) ticks.push(k);
    var rsY = y(res.settings.reservePct / 100);
    var g = '<g class="grid">' + [0, 0.5, 1].map(function (p) { return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(p) + '" y2="' + y(p) + '"/>'; }).join('') + '</g>';
    var ax = '<g class="ax">' + [0, 0.5, 1].map(function (p) { return '<text x="' + (L - 6) + '" y="' + (y(p) + 3.5) + '" text-anchor="end">' + Math.round(p * 100) + '%</text>'; }).join('') +
      ticks.map(function (k) { return '<text x="' + x(k).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + nf(k) + '</text>'; }).join('') +
      '<text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end" style="display:none">km</text></g>';
    var stops = res.waypoints.filter(function (w) { return w.type === 'stop'; }).map(function (w) {
      var cls = w.gap ? 'gap' : w.station.og ? '' : 'cng';
      return '<circle class="stop-dot ' + cls + '" cx="' + x(w.km).toFixed(1) + '" cy="' + y(Math.max(0, w.arrivePct)).toFixed(1) + '" r="5"/>' +
        '<text class="stop-n" x="' + x(w.km).toFixed(1) + '" y="' + (y(1) - 3) + '" text-anchor="middle">' + w.n + '</text>';
    }).join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t('chartTitle')) + '">' + g +
      '<path class="area" d="' + area + '"/>' +
      '<line class="res" x1="' + L + '" x2="' + (W - R) + '" y1="' + rsY + '" y2="' + rsY + '"/>' +
      '<text class="res-t" x="' + (W - R) + '" y="' + (rsY - 4) + '" text-anchor="end">' + esc(t('reserveShort')) + '</text>' +
      '<path class="lvl" d="' + d + '"/>' + stops + ax +
      '<rect id="chartHit" x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" fill="transparent"/></svg>';
  }
  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
    var n = raw / p;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
  }
  function levelAt(res, k) {
    var pts = res.chart;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].km >= k && pts[i].km !== pts[i - 1].km) {
        var a = pts[i - 1], b = pts[i];
        return a.pct + (b.pct - a.pct) * (k - a.km) / (b.km - a.km);
      }
    }
    return pts[pts.length - 1].pct;
  }

  function bindResultEvents(res) {
    $$('#results [data-fly]').forEach(function (el) {
      el.addEventListener('click', function () { focusWaypoint(res.waypoints[+el.getAttribute('data-fly')]); });
    });
    $$('#results [data-x]').forEach(function (el) {
      el.addEventListener('click', function () { doExport(el.getAttribute('data-x'), res); });
    });
    var hit = $('#chartHit'), tip = $('#chartTip'), wrap = $('#chartWrap');
    if (hit) {
      var move = function (ev) {
        var svg = hit.ownerSVGElement, r = svg.getBoundingClientRect();
        var vx = (ev.clientX - r.left) / r.width * 420;
        var k = Math.max(0, Math.min(1, (vx - 34) / (420 - 44))) * res.distance;
        var lvl = levelAt(res, k);
        tip.hidden = false;
        tip.textContent = km(k) + ' · ' + pct(Math.max(0, lvl));
        tip.style.left = (ev.clientX - wrap.getBoundingClientRect().left) + 'px';
        tip.style.top = ((12 + (1 - Math.max(0, Math.min(1, lvl))) * 132) / 170 * r.height) + 'px';
      };
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerleave', function () { tip.hidden = true; });
    }
  }

  function focusWaypoint(w) {
    if (!w) return;
    if (state.view !== 'plan') switchView('plan');
    var p = w.point || w.station;
    M.flyTo(p.lon, p.lat, 12.5);
    if (w.type === 'stop') M.showStationPopup(w.station, '<div class="tl-m">' + esc(t('stopN', { n: w.n }) + ' · ' + km(w.km) + ' · ' + clock(w.arrive)) + '</div>');
    if (window.matchMedia('(max-width: 860px)').matches) $('#mapCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------------- export ---------------- */
  function doExport(kind, res) {
    var name = res.settings.routeName || routeTitle(res);
    var file = X.safeName(name);
    if (kind === 'gpx') {
      var wps = res.waypoints.map(function (w) {
        var p = w.point || w.station;
        var nm = w.type === 'start' ? t('start') + ': ' + p.label : w.type === 'end' ? t('destination') + ': ' + p.label :
          w.type === 'via' ? t('via') + ' ' + w.n + ': ' + p.label : t('stopN', { n: w.n }) + ': ' + stopTitle(w) + (w.station.og ? ' (OG)' : '');
        return { lat: p.lat, lon: p.lon, name: nm, desc: w.type === 'stop' ? km(w.km) : '', sym: w.type === 'stop' ? 'Gas Station' : 'Flag' };
      });
      X.download(file + '.gpx', X.gpx(name, wps, res.coords), 'application/gpx+xml');
      toast(t('toastDownloaded', { f: file + '.gpx' }));
    } else if (kind === 'csv') {
      var rows = [[t('thNr'), t('thType'), t('thLocation'), t('thCountry'), 'km', t('thArrival'), t('thTank'), t('thRefuel'), 'lat', 'lon']];
      res.waypoints.forEach(function (w) {
        var p = w.point || w.station;
        var type = w.type === 'start' ? t('start') : w.type === 'end' ? t('destination') : w.type === 'via' ? t('via') : (w.station.og ? 'OG Clean Fuels' : t('otherStation'));
        rows.push([w.type === 'stop' ? w.n : w.type === 'via' ? 'V' + w.n : w.type === 'start' ? 'A' : 'B', type,
          w.type === 'stop' ? stopTitle(w) : p.label, w.type === 'stop' ? w.station.cc : (p.cc || ''), nf(w.km, 1),
          clock(w.arrive, res.settings.departure), Math.round(Math.max(0, w.type === 'start' ? res.settings.startPct / 100 : w.arrivePct) * 100) + '%',
          w.type === 'stop' ? nf(w.buyKg, 1) : '', p.lat.toFixed(6), p.lon.toFixed(6)]);
      });
      X.download(file + '.csv', X.csv(rows), 'text/csv;charset=utf-8');
      toast(t('toastDownloaded', { f: file + '.csv' }));
    } else if (kind === 'pdf') {
      toast(t('toastPdf'));
      M.snapshot(res.coords).then(function (img) {
        buildPrint(res, img);
        setTimeout(function () { window.print(); }, 200);
      });
    } else if (kind === 'share') {
      var url = shareUrl(res);
      if (!url) { toast(t('toastNoShare')); return; }
      X.copy(url).then(function (ok) {
        if (ok) toast(t('toastCopied'));
        else window.prompt(t('exShare'), url);
      });
    }
  }

  function shareState(res) {
    var st = res.settings;
    var o = {
      v: 1,
      p: res.points.map(function (p) { return [+p.lat.toFixed(5), +p.lon.toFixed(5), p.label, p.detail || '', p.cc || '', p.stationId == null ? null : p.stationId]; }),
      k: st.vehicle, c: st.cap, u: st.cons, d: st.dcons, w: st.weight, h: st.height,
      s: st.startPct, r: st.reservePct, o: st.corridorKm, x: st.allowOther ? 1 : 0, t: st.avoidTolls ? 1 : 0, f: st.avoidFerries ? 1 : 0, m: st.refuelMin
    };
    if (state.internal) o.i = { pm: st.price.mode, fx: st.price.fix, pc: st.price.pct, cu: st.customer, rn: st.routeName };
    return o;
  }
  function shareUrl(res) {
    var base = X.pageUrl();
    if (!base) return '';
    var q = new URLSearchParams();
    q.set('r', X.encodeState(shareState(res)));
    if (state.internal && !CFG.internal) q.set('intern', '1');
    if (state.lang !== 'nl') q.set('lang', state.lang);
    return base + '?' + q.toString();
  }
  function applyShared(o) {
    if (!o || !o.p || o.p.length < 2) return false;
    state.points = o.p.map(function (a, i) {
      var p = newPoint(i === 0 ? 'start' : i === o.p.length - 1 ? 'end' : 'via');
      p.sel = { lat: a[0], lon: a[1], main: a[2], detail: a[3], cc: a[4], stationId: a[5] == null ? undefined : a[5] };
      p.text = a[2];
      return p;
    });
    if (o.k && (VEH[o.k] || o.k === 'custom')) applyVehicle(o.k);
    var set = function (id, v) { if (v != null) $('#' + id).value = v; };
    set('cap', o.c); set('cons', o.u); set('dcons', o.d); set('wt', o.w); set('ht', o.h);
    set('sp', o.s); set('rs', o.r); set('cor', o.o); set('ref', o.m);
    if (o.x != null) $('#oth').checked = !!o.x;
    if (o.t != null) $('#tol').checked = !!o.t;
    if (o.f != null) $('#fer').checked = !!o.f;
    if (o.i && state.internal) {
      setPriceMode(o.i.pm || 'std');
      set('fix', o.i.fx); set('pct', o.i.pc);
      $('#cust').value = o.i.cu || '';
      $('#rname').value = o.i.rn || '';
    }
    renderPoints();
    renderVehSeg();
    updateRangeChip();
    return true;
  }

  function buildPrint(res, img) {
    var st = res.settings, c = res.costs.total;
    var rows = res.waypoints.map(function (w) {
      var p = w.point || w.station;
      var label = w.type === 'start' ? 'A' : w.type === 'end' ? 'B' : w.type === 'via' ? 'V' + w.n : String(w.n);
      var name = w.type === 'stop' ? stopTitle(w) : p.label;
      var kind = w.type === 'stop' ? (w.station.og ? '<span class="pr-og">OG Clean Fuels</span>' : esc(t('otherStation'))) + (w.gap ? ' · ' + esc(t('gapTag')) : '') :
        w.type === 'start' ? esc(t('start')) : w.type === 'end' ? esc(t('destination')) : esc(t('via'));
      var cc = w.type === 'stop' ? w.station.cc : p.cc;
      return '<tr><td>' + label + '</td><td><b>' + esc(name) + '</b><br>' + kind + '</td><td>' + esc(cc ? country(cc) : '') + '</td><td class="r">' + nf(w.km) + '</td>' +
        '<td class="r">' + esc(clock(w.arrive, st.departure)) + '</td><td class="r">' + (w.type === 'start' ? st.startPct + '%' : pct(Math.max(0, w.arrivePct))) + '</td>' +
        '<td class="r">' + (w.type === 'stop' ? nf(w.buyKg) + ' kg' : '') + '</td></tr>';
    }).join('');
    var costRows = res.costs.rows.map(function (r) {
      return '<tr><td>' + esc(r.cc ? country(r.cc) : t('unknown')) + (r.avg ? ' (' + esc(t('avg')) + ')' : '') + '</td><td class="r">' + nf(r.km) + '</td><td class="r">' + eur(r.cngPrice, 3) + '</td><td class="r">' + eur(r.cngEur) +
        '</td><td class="r">' + eur(r.dieselPrice, 3) + '</td><td class="r">' + eur(r.dieselEur) + '</td><td class="r">' + eur(r.dieselEur - r.cngEur) + '</td></tr>';
    }).join('');
    var today = new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    $('#print').innerHTML =
      '<div class="pr-head"><img src="' + LOGO + '" alt="OG Clean Fuels"><div><h1>' + esc(t('printTitle')) + '</h1><p>' + esc(st.routeName || routeTitle(res)) + '</p></div>' +
      '<div class="pr-meta">' + (st.customer ? '<b>' + esc(st.customer) + '</b><br>' : '') + esc(today) + '<br>' + esc(t('veh_' + st.vehicle)) + '</div></div>' +
      '<div class="pr-kpis">' +
      '<div><small>' + esc(t('kpiDistance')) + '</small><b>' + nf(res.distance) + ' km</b></div>' +
      '<div><small>' + esc(t('kpiTime')) + '</small><b>' + esc(dur(res.totalSec)) + '</b></div>' +
      '<div><small>' + esc(t('kpiStops')) + '</small><b>' + res.stops.length + '</b></div>' +
      '<div><small>' + esc(c.saving >= 0 ? t('kpiSaving') : t('kpiExtra')) + '</small><b>' + eur(Math.abs(c.saving)) + '</b></div>' +
      '<div><small>' + esc(t('kpiCo2')) + '</small><b>' + nf(c.co2Avoided / 1000, 1) + ' t</b></div></div>' +
      (img ? '<img class="pr-map" src="' + img + '" alt="">' : '') +
      '<div class="pr-h">' + esc(t('timelineTitle')) + '</div>' +
      '<table><thead><tr><th>#</th><th>' + esc(t('thLocation')) + '</th><th>' + esc(t('thCountry')) + '</th><th class="r">km</th><th class="r">' + esc(t('thArrival')) + '</th><th class="r">' + esc(t('thTank')) + '</th><th class="r">' + esc(t('thRefuel')) + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="pr-h">' + esc(t('costTitle')) + '</div>' +
      '<table><thead><tr><th>' + esc(t('thCountry')) + '</th><th class="r">km</th><th class="r">€/kg</th><th class="r">Bio-CNG</th><th class="r">€/L</th><th class="r">Diesel</th><th class="r">' + esc(t('thDiff')) + '</th></tr></thead><tbody>' + costRows +
      '<tr><td><b>' + esc(t('total')) + '</b></td><td class="r"><b>' + nf(c.km) + '</b></td><td></td><td class="r"><b>' + eur(c.cngEur) + '</b></td><td></td><td class="r"><b>' + eur(c.dieselEur) + '</b></td><td class="r"><b>' + eur(c.saving) + '</b></td></tr></tbody></table>' +
      '<p class="pr-foot">' + esc(t('costNote', { date: priceDate(), cons: nf(st.cons, 1), dcons: nf(st.dcons, 1) })) + ' ' + esc(t('disclaimer')) + '</p>';
  }

  /* ---------------- stations ---------------- */
  function stationPopup(s, extraHtml) {
    var inPlan = state.view === 'plan';
    return '<div class="pop"><b>' + esc(s.city) + '</b><small>' + esc((s.brand || '') + ' · ' + flag(s.cc) + ' ' + country(s.cc)) + '</small>' +
      (extraHtml || '') + '<div class="tl-tags">' + stationTags(s) + '</div><div class="tl-act">' +
      '<button type="button" class="pill-a" data-act="dest">' + ICON.flag + esc(t('asDestination')) + '</button>' +
      (inPlan ? '<button type="button" class="pill-a" data-act="via">' + ICON.pin + esc(t('asVia')) + '</button>' : '<button type="button" class="pill-a" data-act="start">' + ICON.pin + esc(t('asStart')) + '</button>') +
      '<a class="pill-a" href="' + esc(X.googleTo(s)) + '" target="_blank" rel="noopener">' + ICON.nav + 'Google Maps</a></div></div>';
  }
  function onStationAction(act, s) {
    var sel = stationSel(s);
    if (!s.og) sel.detail = s.brand + ' · ' + country(s.cc);
    if (act === 'dest') setPoint(state.points.length - 1, sel);
    else if (act === 'start') setPoint(0, sel);
    else if (act === 'via') {
      if (state.points.length - 2 >= MAX_VIAS) { toast(t('toastMaxVias')); return; }
      state.points.splice(state.points.length - 1, 0, newPoint('via'));
      setPoint(state.points.length - 2, sel);
    }
    if (state.view !== 'plan') switchView('plan');
    toast(t('toastPointSet', { name: sel.main }));
  }

  function stationFilter() {
    var f = state.st, q = fold(f.q);
    return P.stations.filter(function (s) {
      if (!s.og && !f.other) return false;
      if (f.countries && !f.countries[s.cc]) return false;
      if (q && fold(s.city + ' ' + s.brand + ' ' + country(s.cc)).indexOf(q) === -1) return false;
      return true;
    });
  }
  function renderStations() {
    var f = state.st;
    var pool = P.stations.filter(function (s) { return s.og || f.other; });
    var byCc = {};
    pool.forEach(function (s) { byCc[s.cc] = (byCc[s.cc] || 0) + 1; });
    var ccs = Object.keys(byCc).sort(function (a, b) { return byCc[b] - byCc[a]; });
    var nOg = P.stations.filter(function (s) { return s.og; });
    var ogCc = {};
    nOg.forEach(function (s) { ogCc[s.cc] = 1; });
    $('#stSub').textContent = t('stationsSub', { n: nOg.length, c: Object.keys(ogCc).length });
    $('#stCountries').innerHTML = '<button type="button" data-cc="" aria-pressed="' + !f.countries + '">' + esc(t('all')) + ' <small>' + pool.length + '</small></button>' +
      ccs.map(function (cc) {
        return '<button type="button" data-cc="' + cc + '" aria-pressed="' + !!(f.countries && f.countries[cc]) + '">' + flag(cc) + ' ' + esc(country(cc)) + ' <small>' + byCc[cc] + '</small></button>';
      }).join('');
    var list = stationFilter().sort(function (a, b) { return (b.og - a.og) || a.cc.localeCompare(b.cc) || a.city.localeCompare(b.city); });
    $('#stList').innerHTML = list.slice(0, f.limit).map(function (s) {
      return '<li data-id="' + s.id + '" aria-current="' + (f.active === s.id) + '"><span class="st-ic ' + (s.og ? '' : 'cng') + '">' + (s.og ? '<img src="' + SPARK + '" alt="">' : '<i></i>') + '</span>' +
        '<div><b>' + esc(s.city) + '</b><small>' + esc(s.brand) + (s.flags.unattended ? ' · ' + esc(t('fUnattended')) : '') + (s.flags.motorway ? ' · ' + esc(t('fMotorway')) : '') + '</small></div><span class="cc">' + flag(s.cc) + ' ' + s.cc + '</span></li>';
    }).join('') || '<li class="ac-empty">' + esc(t('noResults')) + '</li>';
    $('#stMore').hidden = list.length <= f.limit;
    M.setStations(list);
  }

  /* ---------------- weergaven ---------------- */
  function switchView(v) {
    state.view = v;
    $$('.nav [data-view]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-view') === v)); });
    $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== v; });
    $('#view-' + v).appendChild($('#mapCard'));
    M.closePopup();
    M.setMode(v);
    if (v === 'stations') {
      renderStations();
      M.fitTo(stationFilter().map(function (s) { return [s.lon, s.lat]; }));
    } else if (state.result) {
      M.fitTo(state.result.coords);
    }
    requestAnimationFrame(M.resize);
  }

  function renderFoot() {
    var prov = S.provider();
    var routing = prov === 'osrm' ? 'OSRM (demo)' : 'openrouteservice';
    $('#foot').innerHTML = '© ' + new Date().getFullYear() + ' OG Clean Fuels · ' + esc(t('footMap')) + ' © <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · ' +
      esc(t('footRouting')) + ' ' + routing + ' · ' + esc(t('disclaimer'));
  }

  function setPriceMode(m) {
    state.price = m;
    $$('#priceSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === m)); });
    $('#fixFld').hidden = m !== 'fix';
    $('#pctFld').hidden = m !== 'pct';
  }

  /* ---------------- opstarten ---------------- */
  function init() {
    state.lang = pickLang();
    if (params.embed === '1') document.body.classList.add('embed');
    var th = store('theme');
    if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th);

    $('#internBadge').hidden = !state.internal;
    $('#intFold').hidden = !state.internal;
    $('#demoBadge').hidden = S.provider() !== 'osrm';
    $$('.ors-only').forEach(function (el) { el.hidden = !S.isTruckRouting(); });

    applyVehicle('tractor');
    $('#sp').value = 100; $('#rs').value = 15; $('#cor').value = 10; $('#ref').value = 15;
    $('#oth').checked = true;
    $('#fix').value = F.cng.NL.toFixed(3); $('#pct').value = 5;
    $('#dep').value = defaultDeparture();
    loadSettings(store('settings'));

    /* events */
    $('#planForm').addEventListener('submit', submit);
    $('#reset').addEventListener('click', function () {
      state.points = [newPoint('start'), newPoint('end')];
      state.result = null;
      formError('');
      renderPoints();
      renderEmpty();
      M.clearRoute();
    });
    $('#addVia').addEventListener('click', function () {
      if (state.points.length - 2 >= MAX_VIAS) return;
      state.points.splice(state.points.length - 1, 0, newPoint('via'));
      renderPoints();
      $('#pt' + (state.points.length - 2)).focus();
    });
    $('#swap').addEventListener('click', function () {
      state.points.reverse();
      state.points.forEach(function (p, i) { p.kind = i === 0 ? 'start' : i === state.points.length - 1 ? 'end' : 'via'; });
      renderPoints();
    });
    $('#vehSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (b) applyVehicle(b.getAttribute('data-v'));
    });
    ['cap', 'cons', 'dcons', 'wt', 'ht'].forEach(function (id) {
      $('#' + id).addEventListener('input', function () {
        if (state.veh !== 'custom') { state.veh = 'custom'; renderVehSeg(); }
        if (id === 'wt') renderVehSeg();
        updateRangeChip();
      });
    });
    ['sp', 'rs', 'cor'].forEach(function (id) { $('#' + id).addEventListener('input', updateRangeChip); });
    $('#priceSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (b) setPriceMode(b.getAttribute('data-v'));
    });
    $('#lang').addEventListener('change', function () {
      state.lang = this.value;
      store('lang', state.lang);
      applyI18n();
    });
    $$('[data-theme-set]').forEach(function (b) {
      b.addEventListener('click', function () { setTheme(b.getAttribute('data-theme-set'), true); });
    });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { setTheme(document.documentElement.getAttribute('data-theme'), false); });
    $$('.nav [data-view]').forEach(function (b) { b.addEventListener('click', function () { switchView(b.getAttribute('data-view')); }); });

    $('#stQ').addEventListener('input', function () { state.st.q = this.value; state.st.limit = 60; renderStations(); });
    $('#stOther').addEventListener('change', function () { state.st.other = this.checked; state.st.countries = null; renderStations(); });
    $('#stCountries').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cc]');
      if (!b) return;
      var cc = b.getAttribute('data-cc');
      if (!cc) state.st.countries = null;
      else {
        state.st.countries = state.st.countries || {};
        if (state.st.countries[cc]) delete state.st.countries[cc]; else state.st.countries[cc] = true;
        if (!Object.keys(state.st.countries).length) state.st.countries = null;
      }
      state.st.limit = 60;
      renderStations();
      M.fitTo(stationFilter().map(function (s) { return [s.lon, s.lat]; }));
    });
    $('#stList').addEventListener('click', function (e) {
      var li = e.target.closest('[data-id]');
      if (!li) return;
      var s = P.byId[+li.getAttribute('data-id')];
      state.st.active = s.id;
      $$('#stList [data-id]').forEach(function (x) { x.setAttribute('aria-current', String(x === li)); });
      M.flyTo(s.lon, s.lat, 12);
      M.showStationPopup(s);
      if (window.matchMedia('(max-width: 860px)').matches) $('#mapCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('#stMore').addEventListener('click', function () { state.st.limit += 120; renderStations(); });

    applyI18n();

    M.init($('#map'), {
      dark: isDark(),
      sparkUrl: SPARK,
      cooperative: window.matchMedia('(max-width: 860px)').matches,
      popupHtml: stationPopup,
      onAction: onStationAction,
      onStationClick: function (id) { M.showStationPopup(P.byId[id]); }
    }).then(function () {
      setTheme(document.documentElement.getAttribute('data-theme'), false);
      M.setStations(P.stations.filter(function (s) { return s.og; }));
      if (params.r) {
        var o = X.decodeState(params.r);
        if (applyShared(o)) submit();
        else toast(t('toastBadLink'));
      } else if (params.view === 'stations') {
        switchView('stations');
      }
    });
    setTheme(document.documentElement.getAttribute('data-theme'), false);
  }

  window.OG_APP = { state: state, submit: submit, shareUrl: function () { return state.result ? shareUrl(state.result) : ''; } };
  SPARK = (window.OG_ASSETS && window.OG_ASSETS.spark) || SPARK;
  LOGO = (window.OG_ASSETS && window.OG_ASSETS.logo) || LOGO;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
