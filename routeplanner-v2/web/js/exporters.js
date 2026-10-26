/* Export en delen: Google Maps, Waze, GPX, CSV en deellinks. */
window.OG_EXPORT = (function () {
  var CFG = window.OG_CONFIG;

  function ll(p) { return p.lat.toFixed(6) + ',' + p.lon.toFixed(6); }

  /* Google Maps staat in een browser maximaal 9 tussenpunten toe. */
  function googleMaps(points) {
    var MAX = 9;
    var mid = points.slice(1, -1);
    var url = 'https://www.google.com/maps/dir/?api=1&travelmode=driving' +
      '&origin=' + encodeURIComponent(ll(points[0])) +
      '&destination=' + encodeURIComponent(ll(points[points.length - 1]));
    if (mid.length) url += '&waypoints=' + encodeURIComponent(mid.slice(0, MAX).map(ll).join('|'));
    return { url: url, truncated: mid.length > MAX };
  }

  function googleTo(p) {
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(ll(p));
  }

  function waze(p) {
    return 'https://waze.com/ul?ll=' + encodeURIComponent(ll(p)) + '&navigate=yes';
  }

  function xml(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c];
    });
  }

  /* GPX 1.1 met de tankstops als waypoints, de route als rtept (voor navigatiesystemen) en het spoor als trk. */
  function gpx(name, wps, coords) {
    var out = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="OG Clean Fuels Routeplanner" xmlns="http://www.topografix.com/GPX/1/1">',
      '<metadata><name>' + xml(name) + '</name><time>' + new Date().toISOString() + '</time></metadata>'];
    wps.forEach(function (w) {
      out.push('<wpt lat="' + w.lat.toFixed(6) + '" lon="' + w.lon.toFixed(6) + '"><name>' + xml(w.name) + '</name>' +
        (w.desc ? '<desc>' + xml(w.desc) + '</desc>' : '') + (w.sym ? '<sym>' + xml(w.sym) + '</sym>' : '') + '</wpt>');
    });
    out.push('<rte><name>' + xml(name) + '</name>');
    wps.forEach(function (w) {
      out.push('<rtept lat="' + w.lat.toFixed(6) + '" lon="' + w.lon.toFixed(6) + '"><name>' + xml(w.name) + '</name></rtept>');
    });
    out.push('</rte>');
    out.push('<trk><name>' + xml(name) + '</name><trkseg>');
    var step = Math.max(1, Math.floor(coords.length / 5000));
    for (var i = 0; i < coords.length; i += step) {
      out.push('<trkpt lat="' + coords[i][1].toFixed(5) + '" lon="' + coords[i][0].toFixed(5) + '"/>');
    }
    var last = coords[coords.length - 1];
    out.push('<trkpt lat="' + last[1].toFixed(5) + '" lon="' + last[0].toFixed(5) + '"/>');
    out.push('</trkseg></trk></gpx>');
    return out.join('\n');
  }

  /* CSV met ; als scheidingsteken en BOM, zodat Excel (NL-instellingen) hem direct goed opent. */
  function csv(rows) {
    var esc = function (v) {
      var s = v == null ? '' : String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '\ufeff' + rows.map(function (r) { return r.map(esc).join(';'); }).join('\r\n');
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function safeName(s) {
    return (s || 'route').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'route';
  }

  /* ---------- deellinks ---------- */

  function b64urlEncode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function encodeState(obj) { return b64urlEncode(JSON.stringify(obj)); }
  function decodeState(s) {
    try { return JSON.parse(b64urlDecode(s)); } catch (e) { return null; }
  }

  /* De pagina kan in een iframe draaien (Streamlit, website). Probeer dan de URL van het hoofdvenster. */
  function pageUrl() {
    if (CFG.publicUrl) return CFG.publicUrl;
    try {
      var top = window.top.location;
      if (top.href && top.protocol.indexOf('http') === 0) return top.origin + top.pathname;
    } catch (e) { /* ander domein */ }
    var here = window.location;
    if (here.protocol.indexOf('http') === 0) return here.origin + here.pathname;
    return '';
  }

  function readParams() {
    var out = {};
    var add = function (search) {
      if (!search) return;
      new URLSearchParams(search).forEach(function (v, k) { if (!(k in out)) out[k] = v; });
    };
    add(window.location.search);
    if (window.location.hash.length > 1) add(window.location.hash.slice(1));
    try { if (window.top !== window) add(window.top.location.search); } catch (e) { /* ander domein */ }
    return out;
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  return {
    googleMaps: googleMaps, googleTo: googleTo, waze: waze,
    gpx: gpx, csv: csv, download: download, safeName: safeName,
    encodeState: encodeState, decodeState: decodeState, pageUrl: pageUrl, readParams: readParams, copy: copy
  };
})();
