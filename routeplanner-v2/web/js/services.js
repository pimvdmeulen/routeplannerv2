/* Externe diensten: adres zoeken (Photon, met ORS als terugval) en routering (ORS / proxy / OSRM). */
window.OG_SERVICES = (function () {
  var CFG = window.OG_CONFIG;

  function provider() {
    var p = CFG.routing.provider;
    if (p && p !== 'auto') return p;
    if (CFG.routing.proxyUrl) return 'proxy';
    if (CFG.routing.orsKey) return 'ors';
    return 'osrm';
  }

  function RoutingError(code, detail) {
    this.name = 'RoutingError';
    this.code = code;          // i18n-sleutel, zie i18n.js (err*)
    this.message = detail || code;
  }
  RoutingError.prototype = Object.create(Error.prototype);

  function fetchJson(url, opts, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 30000) : null;
    opts = opts || {};
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (res) {
      if (t) clearTimeout(t);
      return res.text().then(function (txt) {
        var body = null;
        try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = { raw: txt }; }
        return { ok: res.ok, status: res.status, body: body };
      });
    }, function (err) {
      if (t) clearTimeout(t);
      throw new RoutingError('errNetwork', String(err && err.message || err));
    });
  }

  /* ---------------- adres zoeken ---------------- */

  var PHOTON_LANGS = { en: 1, de: 1, fr: 1 };

  function photonLabel(p) {
    var main = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || p.country || '';
    var place = [p.postcode, p.city || p.town || p.village || p.county].filter(Boolean).join(' ');
    var parts = [];
    if (p.name && p.street) parts.push([p.street, p.housenumber].filter(Boolean).join(' '));
    if (place && place.indexOf(main) === -1) parts.push(place);
    else if (p.state && p.type !== 'state') parts.push(p.state);
    if (p.country) parts.push(p.country);
    return { main: main, detail: parts.join(', ') };
  }

  function searchPhoton(q, lang, bias) {
    var u = CFG.geocoder.photonBase.replace(/\/$/, '') + '/api/?q=' + encodeURIComponent(q) + '&limit=7';
    if (PHOTON_LANGS[lang]) u += '&lang=' + lang;
    if (bias) u += '&lat=' + bias[1].toFixed(3) + '&lon=' + bias[0].toFixed(3) + '&location_bias_scale=0.3';
    return fetchJson(u, {}, 8000).then(function (r) {
      if (!r.ok || !r.body || !r.body.features) throw new RoutingError('errGeocode');
      var seen = {};
      return r.body.features.map(function (f) {
        var l = photonLabel(f.properties);
        return {
          main: l.main, detail: l.detail,
          lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
          cc: (f.properties.countrycode || '').toUpperCase()
        };
      }).filter(function (x) {
        var k = x.main + '|' + x.detail;
        if (seen[k]) return false;
        seen[k] = 1;
        return true;
      });
    });
  }

  function searchOrs(q) {
    var url;
    if (CFG.routing.proxyUrl) url = CFG.routing.proxyUrl.replace(/\/$/, '') + '/geocode?text=' + encodeURIComponent(q);
    else if (CFG.routing.orsKey) url = CFG.routing.orsBase + '/geocode/search?size=7&api_key=' + encodeURIComponent(CFG.routing.orsKey) + '&text=' + encodeURIComponent(q);
    else return Promise.reject(new RoutingError('errGeocode'));
    return fetchJson(url, {}, 10000).then(function (r) {
      if (!r.ok || !r.body || !r.body.features) throw new RoutingError('errGeocode');
      return r.body.features.map(function (f) {
        var p = f.properties;
        return {
          main: p.name, detail: [p.locality, p.country].filter(Boolean).filter(function (x) { return x !== p.name; }).join(', '),
          lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
          cc: (p.country_code || '').toUpperCase()
        };
      });
    });
  }

  function search(q, lang, bias) {
    var m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(q);
    if (m) {
      var lat = parseFloat(m[1]), lon = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        return Promise.resolve([{ main: lat.toFixed(5) + ', ' + lon.toFixed(5), detail: '', lat: lat, lon: lon, cc: '' }]);
      }
    }
    return searchPhoton(q, lang, bias).catch(function () { return searchOrs(q); });
  }

  function reverse(lat, lon, lang) {
    var u = CFG.geocoder.photonBase.replace(/\/$/, '') + '/reverse?lat=' + lat + '&lon=' + lon + '&limit=1';
    if (PHOTON_LANGS[lang]) u += '&lang=' + lang;
    return fetchJson(u, {}, 8000).then(function (r) {
      var f = r.body && r.body.features && r.body.features[0];
      if (!f) return { main: lat.toFixed(5) + ', ' + lon.toFixed(5), detail: '', lat: lat, lon: lon, cc: '' };
      var l = photonLabel(f.properties);
      return { main: l.main, detail: l.detail, lat: lat, lon: lon, cc: (f.properties.countrycode || '').toUpperCase() };
    });
  }

  /* ---------------- routering ---------------- */

  function orsBody(points, opts) {
    var body = {
      coordinates: points.map(function (p) { return [+p.lon.toFixed(6), +p.lat.toFixed(6)]; }),
      radiuses: points.map(function () { return 3000; }),
      instructions: false,
      preference: 'recommended'
    };
    var o = {};
    var avoid = [];
    if (opts.avoidTolls) avoid.push('tollways');
    if (opts.avoidFerries) avoid.push('ferries');
    if (avoid.length) o.avoid_features = avoid;
    if (opts.profile === 'driving-hgv') {
      o.vehicle_type = 'hgv';
      var r = {};
      if (opts.weight) r.weight = +opts.weight;
      if (opts.height) r.height = +opts.height;
      if (Object.keys(r).length) o.profile_params = { restrictions: r };
    }
    if (Object.keys(o).length) body.options = o;
    return body;
  }

  function orsError(r) {
    var e = r.body && r.body.error;
    var code = e && (e.code || e);
    var msg = (e && e.message) || (r.body && r.body.raw) || ('HTTP ' + r.status);
    if (r.status === 401 || r.status === 403) return new RoutingError('errKey', msg);
    if (r.status === 429) return new RoutingError('errQuota', msg);
    if (code === 2010) return new RoutingError('errSnap', msg);
    if (code === 2004) return new RoutingError('errTooLong', msg);
    if (code === 2009) return new RoutingError('errNoRoute', msg);
    return new RoutingError('errRouting', msg);
  }

  function parseOrs(json) {
    var f = json && json.features && json.features[0];
    if (!f) throw new RoutingError('errNoRoute');
    var segs = (f.properties.segments || []).map(function (s) { return { distance: s.distance / 1000, duration: s.duration }; });
    return {
      coords: f.geometry.coordinates.map(function (c) { return [c[0], c[1]]; }),
      distance: f.properties.summary.distance / 1000,
      duration: f.properties.summary.duration,
      legs: segs
    };
  }

  function routeOrs(points, opts) {
    var profile = opts.profile || 'driving-hgv';
    var url = CFG.routing.orsBase.replace(/\/$/, '') + '/v2/directions/' + profile + '/geojson';
    return fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/geo+json, application/json', 'Authorization': CFG.routing.orsKey },
      body: JSON.stringify(orsBody(points, opts))
    }, 45000).then(function (r) {
      if (!r.ok) throw orsError(r);
      return parseOrs(r.body);
    });
  }

  function routeProxy(points, opts) {
    var url = CFG.routing.proxyUrl.replace(/\/$/, '') + '/route';
    return fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: opts.profile || 'driving-hgv', body: orsBody(points, opts) })
    }, 45000).then(function (r) {
      if (!r.ok) throw orsError(r);
      return parseOrs(r.body);
    });
  }

  function routeOsrm(points) {
    var path = points.map(function (p) { return p.lon.toFixed(6) + ',' + p.lat.toFixed(6); }).join(';');
    var url = CFG.routing.osrmBase.replace(/\/$/, '') + '/route/v1/driving/' + path + '?overview=full&geometries=geojson&steps=false';
    var attempt = function () {
      return fetchJson(url, {}, 30000).then(function (r) {
        if (!r.ok || !r.body || r.body.code !== 'Ok') {
          if (r.status === 429) throw new RoutingError('errQuota');
          throw new RoutingError(r.body && r.body.code === 'NoRoute' ? 'errNoRoute' : 'errRouting', r.body && r.body.message);
        }
        var rt = r.body.routes[0];
        return {
          coords: rt.geometry.coordinates,
          distance: rt.distance / 1000,
          duration: rt.duration,
          legs: rt.legs.map(function (l) { return { distance: l.distance / 1000, duration: l.duration }; })
        };
      });
    };
    return attempt().catch(function (e) {
      if (e.code === 'errNetwork' || e.code === 'errRouting') return attempt();
      throw e;
    });
  }

  function route(points, opts) {
    var p = provider();
    var fn = p === 'proxy' ? routeProxy : p === 'ors' ? routeOrs : routeOsrm;
    return fn(points, opts || {}).then(function (res) { res.provider = p; return res; });
  }

  return {
    provider: provider,
    isTruckRouting: function () { return provider() !== 'osrm'; },
    search: search,
    reverse: reverse,
    route: route,
    RoutingError: RoutingError
  };
})();
