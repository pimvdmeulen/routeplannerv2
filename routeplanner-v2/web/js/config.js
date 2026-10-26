/* Configuratie van de routeplanner.
 *
 * Standaardwaarden staan hieronder. Een host kan ze overschrijven door vóór dit
 * bestand een script te zetten met  window.OG_CONFIG = { ... }  (Streamlit doet
 * dat automatisch met de waarden uit .streamlit/secrets.toml).
 *
 * Routering (routing.provider):
 *   'auto'  → proxy als proxyUrl gezet is, anders OpenRouteService als orsKey gezet is,
 *             anders de publieke OSRM-demoserver (alleen voor testen, rekent met een auto).
 *   'proxy' → POST {proxyUrl}/route  (Azure Function in azure-proxy/, sleutel blijft geheim)
 *   'ors'   → rechtstreeks naar OpenRouteService met orsKey (sleutel is zichtbaar in de browser)
 *   'osrm'  → OSRM-demo
 */
(function () {
  var defaults = {
    routing: {
      provider: 'auto',
      orsKey: '',
      proxyUrl: '',
      orsBase: 'https://api.openrouteservice.org',
      osrmBase: 'https://router.project-osrm.org'
    },
    geocoder: {
      photonBase: 'https://photon.komoot.io'
    },
    map: {
      styleLight: 'https://tiles.openfreemap.org/styles/positron',
      styleDark: 'https://tiles.openfreemap.org/styles/dark',
      center: [8.2, 50.6],
      zoom: 4.4
    },
    defaultLang: '',            // leeg = taal van de browser (valt terug op nl)
    internal: false,            // true = interne modus altijd aan (prijsafspraak, klantnaam)
    allowInternalParam: true,   // ?intern=1 in de URL zet de interne modus aan; zet op false voor de publieke website
    publicUrl: '',              // basis-URL voor deellinks; leeg = de huidige pagina
    contactUrl: 'https://www.ogcleanfuels.com/contact'
  };

  function merge(a, b) {
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    Object.keys(b || {}).forEach(function (k) {
      var v = b[k];
      out[k] = (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object')
        ? merge(a[k], v) : v;
    });
    return out;
  }

  window.OG_CONFIG = merge(defaults, window.OG_CONFIG || {});
})();
