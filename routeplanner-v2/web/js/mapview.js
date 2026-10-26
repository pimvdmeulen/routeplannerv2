/* Kaart (MapLibre GL + OpenFreeMap). */
window.OG_MAP = (function () {
  var CFG = window.OG_CONFIG;
  var map = null, ready = null, dark = false, mode = 'plan';
  var markers = [], popup = null, sparkUrl = 'assets/spark.png';
  var data = { route: empty(), corridor: empty(), stations: empty() };
  var hooks = { popupHtml: null, onAction: null, onStationClick: null };

  function empty() { return { type: 'FeatureCollection', features: [] }; }
  var C = { og: '#13A538', ogDeep: '#0B4F22', cng: '#8E968F', acc: '#F18700' };

  function init(el, opts) {
    dark = !!opts.dark;
    sparkUrl = opts.sparkUrl || sparkUrl;
    hooks.popupHtml = opts.popupHtml;
    hooks.onAction = opts.onAction;
    hooks.onStationClick = opts.onStationClick;
    map = new maplibregl.Map({
      container: el,
      style: dark ? CFG.map.styleDark : CFG.map.styleLight,
      center: CFG.map.center,
      zoom: CFG.map.zoom,
      attributionControl: false,
      preserveDrawingBuffer: true,   // nodig voor de kaartafbeelding in de PDF
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: !!opts.cooperative
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('style.load', addLayers);
    ready = new Promise(function (res) { map.once('load', res); });
    if (window.ResizeObserver) new ResizeObserver(function () { map.resize(); }).observe(el);
    bindEvents();
    return ready;
  }

  function loadSpark() {
    if (map.hasImage('spark')) return Promise.resolve();
    return map.loadImage(sparkUrl).then(function (img) {
      if (!map.hasImage('spark')) map.addImage('spark', img.data);
    }).catch(function () { /* icoon is optioneel */ });
  }

  function addLayers() {
    if (map.getSource('route')) return;
    map.addSource('route', { type: 'geojson', data: data.route });
    map.addSource('corridor', { type: 'geojson', data: data.corridor });
    map.addSource('stations', {
      type: 'geojson', data: data.stations, cluster: true, clusterRadius: 44, clusterMaxZoom: 9,
      clusterProperties: { og: ['+', ['case', ['get', 'og'], 1, 0]] }
    });

    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': dark ? '#04150a' : C.ogDeep, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 6, 10, 11], 'line-opacity': .85 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': dark ? '#3CC45E' : C.og, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 10, 7] } });

    map.addLayer({ id: 'corridor-pts', type: 'circle', source: 'corridor',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 6],
        'circle-color': ['case', ['get', 'og'], C.og, C.cng],
        'circle-stroke-color': dark ? '#111' : '#fff', 'circle-stroke-width': 1.5,
        'circle-opacity': ['case', ['get', 'og'], 0.95, 0.75]
      } });

    map.addLayer({ id: 'st-clusters', type: 'circle', source: 'stations', filter: ['has', 'point_count'],
      paint: {
        'circle-color': ['case', ['>', ['get', 'og'], 0], C.og, C.cng],
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24, 150, 30],
        'circle-stroke-color': dark ? 'rgba(60,196,94,.35)' : 'rgba(19,165,56,.25)',
        'circle-stroke-width': 6
      } });
    map.addLayer({ id: 'st-count', type: 'symbol', source: 'stations', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true },
      paint: { 'text-color': '#fff' } });
    map.addLayer({ id: 'st-pts', type: 'circle', source: 'stations', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['case', ['get', 'og'], 6, 4], 12, ['case', ['get', 'og'], 11, 7]],
        'circle-color': ['case', ['get', 'og'], '#ffffff', C.cng],
        'circle-stroke-color': ['case', ['get', 'og'], C.og, dark ? '#111' : '#fff'],
        'circle-stroke-width': ['case', ['get', 'og'], 2.5, 1.5]
      } });
    loadSpark().then(function () {
      if (map.getLayer('st-spark')) return;
      map.addLayer({ id: 'st-spark', type: 'symbol', source: 'stations', filter: ['all', ['!', ['has', 'point_count']], ['get', 'og']],
        layout: { 'icon-image': 'spark', 'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.04, 12, 0.07], 'icon-allow-overlap': true } });
      setMode(mode);
    });
    setMode(mode);
  }

  function bindEvents() {
    ['corridor-pts', 'st-pts', 'st-clusters'].forEach(function (id) {
      map.on('mouseenter', id, function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, function () { map.getCanvas().style.cursor = ''; });
    });
    map.on('click', 'st-clusters', function (e) {
      var f = e.features[0];
      map.getSource('stations').getClusterExpansionZoom(f.properties.cluster_id).then(function (z) {
        map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.3 });
      });
    });
    var clickStation = function (e) {
      var id = e.features[0].properties.id;
      if (hooks.onStationClick) hooks.onStationClick(id);
    };
    map.on('click', 'st-pts', clickStation);
    map.on('click', 'corridor-pts', clickStation);
  }

  function setMode(m) {
    mode = m;
    if (!map || !map.getLayer('route-line')) return;
    var plan = m === 'plan';
    ['route-casing', 'route-line', 'corridor-pts'].forEach(function (id) { map.setLayoutProperty(id, 'visibility', plan ? 'visible' : 'none'); });
    ['st-clusters', 'st-count', 'st-pts', 'st-spark'].forEach(function (id) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', plan ? 'none' : 'visible');
    });
    markers.forEach(function (mk) { mk.getElement().style.display = plan ? '' : 'none'; });
  }

  function setTheme(isDark) {
    if (!map || isDark === dark) return;
    dark = isDark;
    map.setStyle(dark ? CFG.map.styleDark : CFG.map.styleLight, { diff: false });
  }

  function setSource(name, fc) {
    data[name] = fc;
    var src = map && map.getSource(name);
    if (src) src.setData(fc);
  }

  function stationsFC(list) {
    return {
      type: 'FeatureCollection',
      features: list.map(function (s) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { id: s.id, og: s.og } };
      })
    };
  }

  function clearMarkers() { markers.forEach(function (m) { m.remove(); }); markers = []; }

  function addMarker(el, lngLat, onClick, anchor, meta) {
    var mk = new maplibregl.Marker({ element: el, anchor: anchor || 'center' }).setLngLat(lngLat).addTo(map);
    mk._og = meta || null;
    if (onClick) el.addEventListener('click', function (ev) { ev.stopPropagation(); onClick(); });
    if (mode !== 'plan') el.style.display = 'none';
    markers.push(mk);
    return mk;
  }

  function div(cls, html) { var d = document.createElement('div'); d.className = cls; d.innerHTML = html || ''; return d; }

  /* Toont een geplande route. stopClick(w) wordt aangeroepen bij klikken op een stop. */
  function showRoute(res, labels, stopClick) {
    setSource('route', { type: 'Feature', geometry: { type: 'LineString', coordinates: res.coords }, properties: {} });
    var used = {};
    res.stops.forEach(function (w) { used[w.station.id] = true; });
    setSource('corridor', stationsFC(res.candidates.map(function (c) { return c.station; }).filter(function (s) { return !used[s.id]; })));
    clearMarkers();
    res.waypoints.forEach(function (w) {
      if (w.type === 'start') addMarker(div('mk start', 'A'), [w.point.lon, w.point.lat], function () { stopClick && stopClick(w); }, null, { fill: '#13A538', ink: '#fff', label: 'A' }).getElement().title = labels.start;
      else if (w.type === 'end') addMarker(div('mk end', 'B'), [w.point.lon, w.point.lat], function () { stopClick && stopClick(w); }, null, { fill: '#1A1A1A', ink: '#fff', label: 'B' }).getElement().title = labels.end;
      else if (w.type === 'via') addMarker(div('mk via', String(w.n)), [w.point.lon, w.point.lat], function () { stopClick && stopClick(w); }, null, { fill: '#fff', ink: '#1A1A1A', label: String(w.n) });
      else {
        var cls = 'mk-stop ' + (w.gap ? 'gap' : (w.station.og ? 'og' : 'cng'));
        var inner = w.gap
          ? '<div class="pin"></div><svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>'
          : w.station.og
            ? '<div class="pin"></div><img src="' + sparkUrl + '" alt="">'
            : '<div class="pin"></div><svg viewBox="0 0 24 24"><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M15 10h2a2 2 0 0 1 2 2v5a1 1 0 0 0 2 0V8l-3-3"/></svg>';
        var el = div(cls, inner + '<b>' + w.n + '</b>');
        addMarker(el, [w.station.lon, w.station.lat], function () { stopClick && stopClick(w); }, 'bottom',
          { fill: w.gap ? '#C9372C' : w.station.og ? '#F18700' : '#7A817B', ink: w.gap || !w.station.og ? '#fff' : '#1a1200', label: String(w.n) });
      }
    });
    fitTo(res.coords);
  }

  function clearRoute() {
    setSource('route', empty());
    setSource('corridor', empty());
    clearMarkers();
  }

  function fitTo(coords, pad) {
    if (!coords || !coords.length) return;
    var b = new maplibregl.LngLatBounds(coords[0], coords[0]);
    coords.forEach(function (c) { b.extend(c); });
    var narrow = map.getContainer().clientWidth < 500;
    map.fitBounds(b, { padding: pad || (narrow ? 36 : 70), duration: 700, maxZoom: 13 });
  }

  function showStationPopup(s, extraHtml) {
    if (popup) popup.remove();
    var html = hooks.popupHtml ? hooks.popupHtml(s, extraHtml) : s.city;
    popup = new maplibregl.Popup({ offset: 18, maxWidth: '300px', focusAfterOpen: false })
      .setLngLat([s.lon, s.lat]).setHTML(html).addTo(map);
    var el = popup.getElement();
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-act]');
      if (b && hooks.onAction) { hooks.onAction(b.getAttribute('data-act'), s); popup.remove(); }
    });
  }

  function flyTo(lon, lat, zoom) { map.flyTo({ center: [lon, lat], zoom: zoom || Math.max(map.getZoom(), 11), speed: 1.6 }); }
  /* Kaartafbeelding voor de PDF: past de route in beeld, wacht tot de tegels geladen zijn
   * en tekent de (HTML-)markers op het canvas. */
  function snapshot(coords) {
    return new Promise(function (resolve) {
      var done = function () {
        try {
          var src = map.getCanvas(), ratio = src.width / src.clientWidth;
          var c = document.createElement('canvas');
          c.width = src.width; c.height = src.height;
          var g = c.getContext('2d');
          g.drawImage(src, 0, 0);
          markers.forEach(function (mk) {
            var m = mk._og;
            if (!m) return;
            var p = map.project(mk.getLngLat()), r = 11 * ratio;
            g.beginPath(); g.arc(p.x * ratio, p.y * ratio, r, 0, Math.PI * 2);
            g.fillStyle = m.fill; g.fill();
            g.lineWidth = 2.5 * ratio; g.strokeStyle = m.fill === '#fff' ? '#1A1A1A' : '#fff'; g.stroke();
            g.fillStyle = m.ink; g.font = 'bold ' + Math.round(11 * ratio) + 'px "Open Sans", sans-serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(m.label, p.x * ratio, p.y * ratio + 0.5);
          });
          resolve(c.toDataURL('image/jpeg', 0.88));
        } catch (e) { resolve(''); }
      };
      if (coords && coords.length) {
        var b = new maplibregl.LngLatBounds(coords[0], coords[0]);
        coords.forEach(function (x) { b.extend(x); });
        map.fitBounds(b, { padding: 40, duration: 0, maxZoom: 13 });
      }
      var timer = setTimeout(done, 4000);
      map.once('idle', function () { clearTimeout(timer); done(); });
      map.triggerRepaint();
    });
  }
  function resize() { if (map) map.resize(); }
  function center() { var c = map.getCenter(); return [c.lng, c.lat]; }
  function closePopup() { if (popup) popup.remove(); }

  return {
    init: init, setTheme: setTheme, setMode: setMode, showRoute: showRoute, clearRoute: clearRoute,
    setStations: function (list) { setSource('stations', stationsFC(list)); },
    fitTo: fitTo, fitPoints: function (pts) { fitTo(pts.map(function (p) { return [p.lon, p.lat]; }), 90); },
    showStationPopup: showStationPopup, closePopup: closePopup, flyTo: flyTo, snapshot: snapshot, resize: resize, center: center,
    get map() { return map; }
  };
})();
