/* Brandstofgegevens: prijzen, verbruik, CO₂ en voertuigprofielen.
 *
 * Bronnen (overgenomen uit de oorspronkelijke routeplanner):
 *  - Verbruik en CO₂: "Kopie van Kopieci.xlsx" — Visualisation (EN)
 *  - Dieselprijzen:   EC Weekly Oil Bulletin, feb 2026, incl. btw en accijns
 *  - Bio-CNG-prijzen: OG Clean Fuels tarieven 2026
 *
 * Werk de prijzen hier bij; de peildatum verschijnt onder de kostenvergelijking.
 */
window.OG_FUEL = {
  priceDate: '2026-02',

  // Bio-CNG OG Clean Fuels, €/kg
  cng: {
    NL: 1.620,
    DE: 1.499,
    FR: 1.754,
    IT: 1.429,
    SE: +(30.29 / 11.3).toFixed(3)   // 30,29 SEK/kg ÷ 11,3 SEK/€
  },

  // Diesel, €/liter
  diesel: {
    NL: 1.873,
    DE: 1.720,
    FR: 1.640,
    IT: 1.640,
    SE: 1.740
  },

  // CO₂ per eenheid brandstof (well-to-wheel)
  // Bio-CNG van OG Clean Fuels is CO₂-negatief (CI-score −102 gCO₂e/MJ):
  // −153 kgCO₂e per 100 km bij 30 kg/100 km → −5,1 kg per kg Bio-CNG.
  co2PerKgCng: -153.0 / 30.0,
  // Diesel: 111,79 kgCO₂ per 100 km bij 33 L/100 km → 3,39 kg per liter.
  co2PerLDiesel: 111.79 / 33.0
};

/* Voertuigprofielen. cap = tankinhoud (kg CNG), cons = verbruik (kg/100 km),
 * diesel = vergelijkbaar dieselverbruik (L/100 km), ors = OpenRouteService-profiel. */
window.OG_VEHICLES = {
  tractor: { cap: 180, cons: 30, diesel: 33, ors: 'driving-hgv', weight: 40, height: 4.0 },
  rigid:   { cap: 100, cons: 20, diesel: 22, ors: 'driving-hgv', weight: 18, height: 3.6 },
  van:     { cap: 36,  cons: 8.5, diesel: 9.5, ors: 'driving-car' },
  car:     { cap: 15,  cons: 4.2, diesel: 5.5, ors: 'driving-car' }
};

window.OG_COUNTRIES = {
  NL: { nl: 'Nederland', en: 'Netherlands', de: 'Niederlande', fr: 'Pays-Bas', it: 'Paesi Bassi', sv: 'Nederländerna', flag: '🇳🇱' },
  DE: { nl: 'Duitsland', en: 'Germany', de: 'Deutschland', fr: 'Allemagne', it: 'Germania', sv: 'Tyskland', flag: '🇩🇪' },
  BE: { nl: 'België', en: 'Belgium', de: 'Belgien', fr: 'Belgique', it: 'Belgio', sv: 'Belgien', flag: '🇧🇪' },
  FR: { nl: 'Frankrijk', en: 'France', de: 'Frankreich', fr: 'France', it: 'Francia', sv: 'Frankrike', flag: '🇫🇷' },
  SE: { nl: 'Zweden', en: 'Sweden', de: 'Schweden', fr: 'Suède', it: 'Svezia', sv: 'Sverige', flag: '🇸🇪' },
  IT: { nl: 'Italië', en: 'Italy', de: 'Italien', fr: 'Italie', it: 'Italia', sv: 'Italien', flag: '🇮🇹' },
  ES: { nl: 'Spanje', en: 'Spain', de: 'Spanien', fr: 'Espagne', it: 'Spagna', sv: 'Spanien', flag: '🇪🇸' },
  DK: { nl: 'Denemarken', en: 'Denmark', de: 'Dänemark', fr: 'Danemark', it: 'Danimarca', sv: 'Danmark', flag: '🇩🇰' },
  NO: { nl: 'Noorwegen', en: 'Norway', de: 'Norwegen', fr: 'Norvège', it: 'Norvegia', sv: 'Norge', flag: '🇳🇴' },
  FI: { nl: 'Finland', en: 'Finland', de: 'Finnland', fr: 'Finlande', it: 'Finlandia', sv: 'Finland', flag: '🇫🇮' },
  AT: { nl: 'Oostenrijk', en: 'Austria', de: 'Österreich', fr: 'Autriche', it: 'Austria', sv: 'Österrike', flag: '🇦🇹' },
  CH: { nl: 'Zwitserland', en: 'Switzerland', de: 'Schweiz', fr: 'Suisse', it: 'Svizzera', sv: 'Schweiz', flag: '🇨🇭' },
  CZ: { nl: 'Tsjechië', en: 'Czechia', de: 'Tschechien', fr: 'Tchéquie', it: 'Cechia', sv: 'Tjeckien', flag: '🇨🇿' },
  PT: { nl: 'Portugal', en: 'Portugal', de: 'Portugal', fr: 'Portugal', it: 'Portogallo', sv: 'Portugal', flag: '🇵🇹' },
  PL: { nl: 'Polen', en: 'Poland', de: 'Polen', fr: 'Pologne', it: 'Polonia', sv: 'Polen', flag: '🇵🇱' },
  GB: { nl: 'Verenigd Koninkrijk', en: 'United Kingdom', de: 'Vereinigtes Königreich', fr: 'Royaume-Uni', it: 'Regno Unito', sv: 'Storbritannien', flag: '🇬🇧' },
  IE: { nl: 'Ierland', en: 'Ireland', de: 'Irland', fr: 'Irlande', it: 'Irlanda', sv: 'Irland', flag: '🇮🇪' },
  LU: { nl: 'Luxemburg', en: 'Luxembourg', de: 'Luxemburg', fr: 'Luxembourg', it: 'Lussemburgo', sv: 'Luxemburg', flag: '🇱🇺' }
};
