# Uitrol

De app (`web/`) is één statische frontend. Hij draait ongewijzigd op drie plekken; alleen de configuratie verschilt.

```
                ┌──────────────── browser ────────────────┐
                │  web/ (HTML/CSS/JS)                     │
                │   ├─ kaart: OpenFreeMap                 │
                │   ├─ adressen: Photon                   │
                │   └─ routes ──┬─ fase 1: ORS direct (sleutel in de pagina)
                │               └─ fase 2: Azure Function → ORS (sleutel op de server)
                └─────────────────────────────────────────┘
```

## 0. OpenRouteService-sleutel aanvragen

1. Maak een account op https://openrouteservice.org/dev/#/signup (bijv. met een algemeen OG-mailadres).
2. Kies **Dashboard → Request a token**, type *Standard* (gratis).
3. Bewaar de sleutel in een wachtwoordkluis. Hij hoort niet in git of e-mail.

Gratis limieten (per dag): 2.000 routes en 1.000 geocode-aanvragen. Eén routeberekening gebruikt 1 aanvraag zonder
tankstops en 2 met tankstops. Bij meer gebruik: een betaald ORS-abonnement, of ORS/Valhalla zelf hosten.
Omdat alle routering via `services.js` loopt, is overstappen beperkt tot één bestand.

## Fase 1: Streamlit Community Cloud

1. Zet deze map in een (private) GitHub-repository. `.gitignore` houdt `secrets.toml` en `dist/` buiten git.
2. Ga naar https://share.streamlit.io → **New app** → kies de repo, branch `main`, bestand `streamlit_app.py`.
3. **Advanced settings → Secrets**, en plak:
   ```toml
   ORS_API_KEY = "…"
   INTERNAL = false
   ALLOW_INTERNAL_PARAM = true
   PUBLIC_URL = "https://<jouw-app>.streamlit.app"
   ```
4. Deploy. Collega's in de interne modus gebruiken `https://<jouw-app>.streamlit.app/?intern=1`.

Let op: in fase 1 staat de ORS-sleutel in de pagina en is hij in de broncode van de browser te zien. Het ergste
dat iemand ermee kan doen, is je daglimiet opmaken. Voor de publieke website is daarom fase 2 bedoeld.

Wil je de app alleen voor OG-medewerkers openstellen? Zet de Streamlit-app dan op *private* en nodig mensen uit
via hun e-mailadres (Streamlit-instelling *Sharing*).

## Fase 2a: Azure (Static Web App + Function-proxy)

**Proxy (Azure Function, Python):**

```bash
cd azure-proxy
cp local.settings.json.example local.settings.json   # ORS_API_KEY invullen
func start                                           # lokaal testen op http://localhost:7071/api
func azure functionapp publish <naam-functie-app>
```

App settings in Azure (Configuration):

| Setting | Waarde |
|---|---|
| `ORS_API_KEY` | de sleutel |
| `ALLOWED_ORIGINS` | `https://routeplanner.ogcleanfuels.com,https://www.ogcleanfuels.com` |

**Frontend (Azure Static Web Apps):**

1. Kopieer `web/js/config.local.example.js` naar `web/js/config.local.js` en zet `routing.proxyUrl` op
   `https://<naam-functie-app>.azurewebsites.net/api`.
2. Voeg in `web/index.html` vóór `js/config.js` toe: `<script src="js/config.local.js"></script>`.
3. Maak een Static Web App aan met *app location* `web`, zonder *api location* en zonder build.
   `web/staticwebapp.config.json` regelt de headers en caching.
4. Koppel eventueel een eigen domein, bijv. `routeplanner.ogcleanfuels.com`.

## Fase 2b: Op de OG-website (externe websitebeheerder)

Er zijn twee manieren. Kies in overleg met de websitebeheerder.

**A. Iframe (aanbevolen, minste werk voor de bouwer)**

De app blijft op Azure (2a) staan en de website sluit hem in:

```html
<iframe src="https://routeplanner.ogcleanfuels.com/?embed=1&lang=nl"
        title="OG Routeplanner" style="width:100%;height:860px;border:0;border-radius:24px"
        allow="geolocation; clipboard-write" loading="lazy"></iframe>
```

- `embed=1` maakt de kop compacter, `lang=` kiest de taal.
- Updates (prijzen, stations) doe je zelf op Azure, zonder tussenkomst van de bouwer.
- Zet `publicUrl` in `config.local.js` op de websitepagina, zodat deellinks naar de website wijzen.

**B. Bestanden overdragen**

Geef de bouwer `dist/og-routeplanner.html`. Dat is één bestand met alles erin; maak het met
`python3 tools/build_bundle.py --config '{"routing":{"proxyUrl":"https://…/api"},"allowInternalParam":false}'`.
Of geef de hele map `web/` met een `config.local.js`. Vraag de bouwer om:

- de pagina met een eigen URL te hosten (geen `srcdoc`: dan werkt de kaart niet);
- de domeinen hieronder in de Content-Security-Policy toe te staan;
- de licentie van het lettertype KOMU B voor webgebruik te controleren (het staat ingesloten in `web/assets/fonts/`).
  Zonder KOMU B valt de app netjes terug op een smalle sans-serif.

**Domeinen voor CSP of firewall**

| Doel | Domein |
|---|---|
| Scripts / CSS | `cdnjs.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com` |
| Kaart | `tiles.openfreemap.org` |
| Adressen | `photon.komoot.io` |
| Routes | `<functie-app>.azurewebsites.net` (of `api.openrouteservice.org` in fase 1) |
| Workers | `blob:` (worker-src, voor de kaart) |

## Checklist vóór publieke livegang

- [ ] Routering via de proxy (fase 2), niet met de sleutel in de pagina
- [ ] `allowInternalParam: false` op de publieke website (interne modus alleen via de interne URL)
- [ ] Prijzen en peildatum in `web/js/fuel.js` actueel
- [ ] Stationslijst actueel (`data/stations.csv`)
- [ ] KOMU B-licentie voor web gecontroleerd
- [ ] Vermelding in privacyverklaring: zoekopdrachten gaan naar Photon/ORS (geen persoonsgegevens, wel IP-adres)
