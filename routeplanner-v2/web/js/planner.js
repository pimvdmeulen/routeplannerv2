/* Routeplanning met tankstops op basis van actieradius.
 *
 * Werkwijze
 *  1. Basisroute start → tussenstops → bestemming.
 *  2. Kandidaat-stations: binnen `corridorKm` van de route, met hun positie (km) langs de route.
 *  3. Optimale stopkeuze (kortste pad over alle kandidaten): zo min mogelijk stops, OG-stations
 *     sterk voorgetrokken (een ander CNG-station telt als 2,5 stop), weinig omrijden en geen
 *     onnodig bijtanken met een nog volle tank. Is de bestemming zo niet haalbaar, dan valt de
 *     planner terug op hebberig vooruit plannen en markeert hij het station na een 'gat'.
 *  4. Definitieve route via alle stops; tankniveau, aankomsttijden en kosten worden met de
 *     werkelijke afstanden per etappe doorgerekend.
 */
window.OG_PLANNER = (function () {
  var G = window.OG_GEO, S = window.OG_SERVICES, F = window.OG_FUEL;

  var FLAG_KEYS = { b: 'bio', u: 'unattended', k: 'card', d: 'depot', m: 'motorway' };
  var STATIONS = (window.OG_STATION_ROWS || []).map(function (r) {
    var flags = {};
    (r[5] || '').split('').forEach(function (ch) { if (FLAG_KEYS[ch]) flags[FLAG_KEYS[ch]] = true; });
    return { id: r[0], og: !!r[1], cc: r[2], brand: r[3], city: r[4], flags: flags, lat: r[6], lon: r[7] };
  });
  var BY_ID = {};
  STATIONS.forEach(function (s) { BY_ID[s.id] = s; });

  var DETOUR_FACTOR = 1.25;   // wegafstand ≈ 1,25 × hemelsbreed, heen en terug

  function nearestStation(lat, lon, maxKm, ogOnly) {
    var best = null, bd = maxKm || Infinity;
    STATIONS.forEach(function (s) {
      if (ogOnly && !s.og) return;
      var d = G.fastKm(lat, lon, s.lat, s.lon);
      if (d < bd) { bd = d; best = s; }
    });
    return best ? { station: best, km: bd } : null;
  }

  /* Stations binnen corridorKm van de route, met km-positie en geschatte omrijafstand. */
  function corridor(coords, cum, corridorKm) {
    var coarse = G.sample(coords, cum, 5);
    var fine = G.sample(coords, cum, 0.5);
    var b = G.bbox(coords);
    var midLat = (b[1] + b[3]) / 2;
    var dLat = corridorKm / 111, dLon = corridorKm / (111 * Math.cos(midLat * Math.PI / 180));
    var out = [];
    STATIONS.forEach(function (s) {
      if (s.lat < b[1] - dLat || s.lat > b[3] + dLat || s.lon < b[0] - dLon || s.lon > b[2] + dLon) return;
      var c = G.nearestOnLine(coarse, s.lat, s.lon);
      if (c.d > corridorKm + 4) return;
      // verfijn rond het grove punt
      var lo = Math.max(0, c.km - 6), hi = c.km + 6, best = { d: Infinity, km: 0 };
      for (var i = 0; i < fine.length; i++) {
        if (fine[i].km < lo) continue;
        if (fine[i].km > hi) break;
        var d = G.fastKm(s.lat, s.lon, fine[i].lat, fine[i].lon);
        if (d < best.d) best = { d: d, km: fine[i].km };
      }
      if (best.d <= corridorKm) {
        out.push({ station: s, km: best.km, off: best.d, detour: 2 * best.d * DETOUR_FACTOR });
      }
    });
    out.sort(function (a, b) { return a.km - b.km; });
    return out;
  }

  function score(c) { return c.km - c.detour * 0.8; }
  function best(list) {
    var b = null;
    list.forEach(function (c) { if (!b || score(c) > score(b)) b = c; });
    return b;
  }

  /* Kosten van een tankstop in de optimalisatie: elke stop telt, een niet-OG-stop telt zwaarder,
   * omrijden kost iets, en tanken met een nog vrij volle tank wordt ontmoedigd. */
  var COST = { stop: 1, other: 1.5, perDetourKm: 1 / 40, fullTank: 0.6 };

  /* Optimale keuze (kortste pad over de kandidaten). Geeft null als de bestemming
   * met deze instellingen niet haalbaar is; dan valt chooseStops terug op de hebberige methode. */
  function optimalStops(cands, total, fullRange, startRange, allowOther) {
    var nodes = cands.filter(function (c) { return c.station.og || allowOther; });
    var n = nodes.length;
    var cost = new Array(n), prev = new Array(n);
    var reach = function (fromKm, fromDetour, range, toKm, toDetour) {
      var need = (toKm - fromKm) + fromDetour / 2 + toDetour / 2;
      return toKm >= fromKm && need <= range ? range - need : -1;
    };
    for (var j = 0; j < n; j++) {
      var c = nodes[j];
      var stopCost = COST.stop + (c.station.og ? 0 : COST.other) + c.detour * COST.perDetourKm;
      cost[j] = Infinity; prev[j] = -2;
      var left = reach(0, 0, startRange, c.km, c.detour);
      if (left >= 0) { cost[j] = stopCost + COST.fullTank * left / Math.max(1, fullRange); prev[j] = -1; }
      for (var i = 0; i < j; i++) {
        if (cost[i] === Infinity || nodes[i].station.id === c.station.id) continue;
        left = reach(nodes[i].km, nodes[i].detour, fullRange, c.km, c.detour);
        if (left < 0) continue;
        var cc = cost[i] + stopCost + COST.fullTank * left / Math.max(1, fullRange);
        if (cc < cost[j] - 1e-9) { cost[j] = cc; prev[j] = i; }
      }
    }
    if (total <= startRange) return [];
    var best = Infinity, bi = -2;
    for (var k = 0; k < n; k++) {
      if (cost[k] === Infinity) continue;
      if (reach(nodes[k].km, nodes[k].detour, fullRange, total, 0) >= 0 && cost[k] < best) { best = cost[k]; bi = k; }
    }
    if (bi === -2) return null;
    var path = [];
    for (var p = bi; p >= 0; p = prev[p]) path.unshift({ cand: nodes[p], gap: false });
    return path;
  }

  /* Kiest de tankstops langs de basisroute. Afstanden in km actieradius. */
  function chooseStops(cands, total, st) {
    var reserveKg = st.cap * st.reservePct / 100;
    var fullRange = Math.max(0, (st.cap - reserveKg) / st.cons * 100);
    var range = (st.cap * st.startPct / 100 - reserveKg) / st.cons * 100;
    var startRange = range;
    var opt = optimalStops(cands, total, fullRange, startRange, st.allowOther);
    if (opt) return { stops: opt, gaps: [], gapToEnd: null, fullRange: fullRange, startRange: startRange };
    var pos = 0, stops = [], used = {}, gaps = [], gapToEnd = null;
    var allowed = function (c) { return c.station.og || st.allowOther; };

    for (var guard = 0; guard < 80 && pos + range < total - 0.5; guard++) {
      var first = stops.length === 0;
      var reach = cands.filter(function (c) {
        return !used[c.station.id] && (first ? c.km >= pos : c.km > pos + 0.5) &&
          (c.km - pos) + c.detour / 2 <= range;
      });
      var pick = best(reach.filter(function (c) { return c.station.og; })) ||
        (st.allowOther ? best(reach.filter(function (c) { return !c.station.og; })) : null);

      if (pick) {
        stops.push({ cand: pick, gap: false });
      } else {
        var ahead = cands.filter(function (c) { return !used[c.station.id] && c.km > pos + 0.5 && allowed(c); });
        var next = ahead.length ? ahead[0] : null;
        var otherWouldHelp = !st.allowOther && cands.some(function (c) {
          return !c.station.og && c.km > pos && (c.km - pos) + c.detour / 2 <= range;
        });
        if (!next) {
          gapToEnd = { fromKm: pos, reachKm: pos + Math.max(0, range), otherWouldHelp: otherWouldHelp };
          break;
        }
        gaps.push({ fromKm: pos, reachKm: pos + Math.max(0, range), nextKm: next.km, otherWouldHelp: otherWouldHelp });
        stops.push({ cand: next, gap: true });
        pick = next;
      }
      used[pick.station.id] = true;
      pos = pick.km;
      range = fullRange - pick.detour / 2;
    }
    return { stops: stops, gaps: gaps, gapToEnd: gapToEnd, fullRange: fullRange, startRange: startRange };
  }

  /* Positie (km) van de tussenstops op de basisroute, oplopend. */
  function viaPositions(coords, cum, vias) {
    var pts = G.sample(coords, cum, 0.5);
    var from = 0;
    return vias.map(function (v) {
      var n = G.nearestOnLine(pts, v.lat, v.lon, from);
      from = n.idx;
      return n.km;
    });
  }

  function cngPrice(cc, st) {
    var base = F.cng[cc], avg = false;
    if (base == null) { base = mean(F.cng); avg = true; }
    if (st.price && st.price.mode === 'fix' && st.price.fix > 0) base = st.price.fix;
    else if (st.price && st.price.mode === 'pct' && st.price.pct > 0) base = base * (1 - st.price.pct / 100);
    return { price: base, avg: avg && !(st.price && st.price.mode === 'fix') };
  }
  function dieselPrice(cc) {
    var p = F.diesel[cc];
    return p == null ? { price: mean(F.diesel), avg: true } : { price: p, avg: false };
  }
  function mean(o) {
    var v = Object.keys(o).map(function (k) { return o[k]; });
    return v.reduce(function (a, b) { return a + b; }, 0) / v.length;
  }

  /* Tankniveau, tijden en kosten langs de definitieve route. */
  function simulate(wps, legs, st) {
    var fuel = st.cap * st.startPct / 100;
    var t = st.departure ? st.departure.getTime() : Date.now();
    var km = 0;
    var chart = [{ km: 0, pct: fuel / st.cap }];
    var minArrival = Infinity;
    wps.forEach(function (w, j) {
      if (j > 0) {
        var leg = legs[j - 1] || { distance: 0, duration: 0 };
        fuel -= leg.distance * st.cons / 100;
        km += leg.distance;
        t += leg.duration * 1000;
        chart.push({ km: km, pct: fuel / st.cap });
      }
      w.km = km;
      w.arrive = new Date(t);
      w.arrivePct = fuel / st.cap;
      if (w.type === 'stop') {
        minArrival = Math.min(minArrival, w.arrivePct);
        w.buyKg = Math.max(0, st.cap - Math.max(0, fuel));
        fuel = st.cap;
        t += (st.refuelMin || 0) * 60000;
        w.depart = new Date(t);
        chart.push({ km: km, pct: 1, stop: w });
      }
    });
    var end = wps[wps.length - 1];
    return { chart: chart, arrival: end.arrive, arrivalPct: end.arrivePct, minStopArrival: minArrival };
  }

  function costs(wps, st, startCc) {
    var fuelPts = [{ km: 0, cc: startCc }].concat(
      wps.filter(function (w) { return w.type === 'stop'; }).map(function (w) { return { km: w.km, cc: w.station.cc }; })
    );
    var totalKm = wps[wps.length - 1].km;
    var rows = {}, order = [];
    fuelPts.forEach(function (f, i) {
      var seg = (i + 1 < fuelPts.length ? fuelPts[i + 1].km : totalKm) - f.km;
      if (seg <= 0) return;
      var key = f.cc || '—';
      var cp = cngPrice(f.cc, st), dp = dieselPrice(f.cc);
      if (!rows[key]) {
        rows[key] = { cc: f.cc, km: 0, cngKg: 0, cngEur: 0, dieselL: 0, dieselEur: 0, cngPrice: cp.price, dieselPrice: dp.price, avg: cp.avg || dp.avg };
        order.push(key);
      }
      var r = rows[key];
      var kg = seg * st.cons / 100, l = seg * st.dcons / 100;
      r.km += seg; r.cngKg += kg; r.cngEur += kg * cp.price; r.dieselL += l; r.dieselEur += l * dp.price;
    });
    var list = order.map(function (k) { return rows[k]; });
    var tot = list.reduce(function (a, r) {
      a.km += r.km; a.cngKg += r.cngKg; a.cngEur += r.cngEur; a.dieselL += r.dieselL; a.dieselEur += r.dieselEur;
      return a;
    }, { km: 0, cngKg: 0, cngEur: 0, dieselL: 0, dieselEur: 0 });
    tot.saving = tot.dieselEur - tot.cngEur;
    tot.savingPct = tot.dieselEur ? tot.saving / tot.dieselEur * 100 : 0;
    tot.co2Cng = tot.cngKg * F.co2PerKgCng;
    tot.co2Diesel = tot.dieselL * F.co2PerLDiesel;
    tot.co2Avoided = tot.co2Diesel - tot.co2Cng;
    return { rows: list, total: tot };
  }

  /* points: [{lat, lon, label, cc}] (start, tussenstops, bestemming); st: instellingen. */
  function plan(points, st, onStep) {
    var opts = { profile: st.profile, avoidTolls: st.avoidTolls, avoidFerries: st.avoidFerries, weight: st.weight, height: st.height };
    var step = onStep || function () {};
    step('stepBase');
    return S.route(points, opts).then(function (base) {
      var cum = G.cumulative(base.coords);
      var total = cum[cum.length - 1];
      step('stepStations');
      var cands = corridor(base.coords, cum, st.corridorKm);
      var choice = chooseStops(cands, total, st);
      var vias = points.slice(1, -1);
      var viaKm = viaPositions(base.coords, cum, vias);

      var middle = vias.map(function (v, i) { return { type: 'via', km: viaKm[i], point: v, n: i + 1 }; })
        .concat(choice.stops.map(function (s) {
          return { type: 'stop', km: s.cand.km, station: s.cand.station, gap: s.gap, detour: s.cand.detour, off: s.cand.off };
        }))
        .sort(function (a, b) { return a.km - b.km || (a.type === 'via' ? -1 : 1); });

      var wps = [{ type: 'start', point: points[0] }].concat(middle, [{ type: 'end', point: points[points.length - 1] }]);
      var stopNo = 0;
      wps.forEach(function (w) { if (w.type === 'stop') w.n = ++stopNo; });

      var finalP = choice.stops.length
        ? (step('stepFinal'), S.route(wps.map(function (w) { return w.point || w.station; }), opts))
        : Promise.resolve(base);

      return finalP.then(function (fin) {
        var sim = simulate(wps, fin.legs, st);
        var startCc = points[0].cc || (nearestStation(points[0].lat, points[0].lon, 120) || { station: {} }).station.cc || null;
        var cost = costs(wps, st, startCc);
        var nStops = choice.stops.length;
        var driveSec = fin.duration;
        return {
          points: points,
          settings: st,
          provider: base.provider,
          coords: fin.coords,
          baseCoords: base.coords,
          distance: fin.distance,
          driveSec: driveSec,
          totalSec: driveSec + nStops * (st.refuelMin || 0) * 60,
          waypoints: wps,
          stops: wps.filter(function (w) { return w.type === 'stop'; }),
          candidates: cands,
          gaps: choice.gaps,
          gapToEnd: choice.gapToEnd,
          fullRange: choice.fullRange,
          startRange: choice.startRange,
          chart: sim.chart,
          arrival: sim.arrival,
          arrivalPct: sim.arrivalPct,
          minStopArrival: sim.minStopArrival,
          costs: cost,
          startCc: startCc
        };
      });
    });
  }

  function rangeKm(st) {
    return Math.max(0, (st.cap * (1 - st.reservePct / 100)) / st.cons * 100);
  }

  return {
    stations: STATIONS,
    byId: BY_ID,
    plan: plan,
    rangeKm: rangeKm,
    nearestStation: nearestStation,
    cngPrice: cngPrice,
    dieselPrice: dieselPrice
  };
})();
