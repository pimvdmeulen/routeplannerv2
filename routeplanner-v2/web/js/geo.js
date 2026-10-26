/* Geometrie-hulpfuncties. Coördinaten in GeoJSON-volgorde: [lon, lat]. */
window.OG_GEO = (function () {
  var R = 6371.0088;
  var rad = Math.PI / 180;

  function hav(lat1, lon1, lat2, lon2) {
    var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /* Cumulatieve afstand (km) langs een lijn. */
  function cumulative(coords) {
    var cum = new Float64Array(coords.length);
    for (var i = 1; i < coords.length; i++) {
      cum[i] = cum[i - 1] + hav(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
    }
    return cum;
  }

  /* Dunt een lijn uit tot ongeveer één punt per stepKm, met hun km-positie. */
  function sample(coords, cum, stepKm) {
    var pts = [{ lon: coords[0][0], lat: coords[0][1], km: 0, i: 0 }];
    var last = 0;
    for (var i = 1; i < coords.length; i++) {
      if (cum[i] - last >= stepKm || i === coords.length - 1) {
        pts.push({ lon: coords[i][0], lat: coords[i][1], km: cum[i], i: i });
        last = cum[i];
      }
    }
    return pts;
  }

  /* Snelle benadering van de afstand in km (equirectangulair), goed genoeg op korte afstand. */
  function fastKm(lat1, lon1, lat2, lon2) {
    var x = (lon2 - lon1) * Math.cos((lat1 + lat2) / 2 * rad);
    var y = lat2 - lat1;
    return Math.sqrt(x * x + y * y) * rad * R;
  }

  /* Dichtstbijzijnde punt op een gesamplede lijn: {km, d, idx}. */
  function nearestOnLine(pts, lat, lon, fromIdx) {
    var best = { d: Infinity, km: 0, idx: 0 };
    for (var i = fromIdx || 0; i < pts.length; i++) {
      var d = fastKm(lat, lon, pts[i].lat, pts[i].lon);
      if (d < best.d) best = { d: d, km: pts[i].km, idx: i };
    }
    return best;
  }

  function bbox(coords) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    coords.forEach(function (c) {
      if (c[0] < b[0]) b[0] = c[0];
      if (c[1] < b[1]) b[1] = c[1];
      if (c[0] > b[2]) b[2] = c[0];
      if (c[1] > b[3]) b[3] = c[1];
    });
    return b;
  }

  return { hav: hav, cumulative: cumulative, sample: sample, fastKm: fastKm, nearestOnLine: nearestOnLine, bbox: bbox };
})();
