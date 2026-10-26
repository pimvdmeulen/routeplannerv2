# OG Routeplanner

Routeplanner voor Bio-CNG-voertuigen: plant tankstops langs OG Clean Fuels-stations op basis van
de actieradius van het voertuig, en laat de besparing en CO₂-winst ten opzichte van diesel zien.

Opvolger van de Streamlit-app in `_archief/` (het origineel staat ongewijzigd in `../routeplanner`).

## Wat het doet

- **Route plannen**: start, bestemming en tot 5 tussenstops, met adres-autocomplete en OG-stations als suggestie.
- **Tankstops op actieradius**: tankinhoud, verbruik, tank bij vertrek, minimale reserve en maximale afstand van de route.
  De planner kiest zo min mogelijk stops, met sterke voorkeur voor OG-stations. Andere CNG-stations zijn optioneel als vangnet.
- **Voertuigprofielen**: trekker, bakwagen, bestelbus, auto of eigen waarden. Met OpenRouteService rijden vrachtwagens
  een echte vrachtwagenroute (gewicht, hoogte, tol en veerboten vermijden).
- **Resultaat**: afstand, reistijd inclusief tankstops, aankomsttijden, tankniveau per stop, een grafiek van het tankniveau,
  en kosten en CO₂ per land waarin je tankt.
- **Meenemen**: Google Maps (alle stops), Waze per stop, GPX (TomTom/Garmin/truck-navigatie), CSV, PDF-ritplanning in huisstijl
  en een deellink die precies dezelfde planning opent.
- **Stations**: alle 292 OG-stations (en optioneel 1.607 andere CNG-stations) op de kaart, met zoeken en filteren per land.
- **Interne modus** (`?intern=1`): prijsafspraak (vaste prijs of korting), klantnaam en routenaam, die ook op de PDF komen.
- Zes talen (NL, EN, DE, FR, IT, SV), licht en donker thema, werkt op telefoon en desktop.

## Mappen

| Map / bestand | Inhoud |
|---|---|
| `web/` | **De app zelf**: statische HTML/CSS/JS, geen build-stap nodig |
| `web/js/fuel.js` | Prijzen, verbruik, CO₂-factoren en voertuigprofielen (hier prijzen bijwerken) |
| `web/js/config.js` | Configuratie (routering, kaart, interne modus) |
| `data/stations.csv` | Stationslijst (bron van waarheid, te bewerken in Excel) |
| `tools/build_stations.py` | Zet `stations.csv` om naar `web/js/stations.js` |
| `tools/build_bundle.py` | Maakt één los HTML-bestand: `dist/og-routeplanner.html` |
| `streamlit_app.py` | Fase 1: host de app in Streamlit |
| `azure-proxy/` | Fase 2: Azure Function die de OpenRouteService-sleutel geheim houdt |
| `docs/DEPLOY.md` | Uitrol: Streamlit, Azure en website |
| `_archief/` | Oude Streamlit-app, oude stationslijsten en huisstijl (het brandbook staat in de originele map) |

## Lokaal draaien

Alleen de web-app (zonder Python-afhankelijkheden):

```bash
python3 -m http.server 8765 --directory web
```

Open daarna http://localhost:8765. Zonder OpenRouteService-sleutel draait hij in **demo-modus**: routes via de
publieke OSRM-server, berekend voor een personenauto. Een oranje label "Demo-routering" laat dat zien.

Via Streamlit:

```bash
pip install -r requirements.txt
cp .streamlit/secrets.toml.example .streamlit/secrets.toml   # en vul ORS_API_KEY in
streamlit run streamlit_app.py
```

## Onderhoud

- **Prijzen bijwerken**: pas `web/js/fuel.js` aan (`cng`, `diesel` en `priceDate`).
- **Stations bijwerken**: bewerk `data/stations.csv` (scheidingsteken `;`) en draai `python3 tools/build_stations.py`.
- **Teksten**: alle teksten staan in `web/js/i18n.js`. Ontbrekende vertalingen vallen terug op Nederlands.

## Externe diensten

| Dienst | Waarvoor | Sleutel | Opmerking |
|---|---|---|---|
| OpenRouteService | Vrachtwagenroutes | ja (gratis) | ca. 2.000 routes per dag; elke berekening kost 1–2 aanvragen |
| Photon (komoot) | Adres-autocomplete | nee | publieke dienst met fair use; ORS-geocoding als terugval |
| OpenFreeMap | Kaarttegels | nee | gratis, ook commercieel |
| OSRM-demo | Alleen demo-modus | nee | niet voor productie, rekent met een auto |
| cdnjs / Google Fonts | MapLibre en Open Sans | nee | |
