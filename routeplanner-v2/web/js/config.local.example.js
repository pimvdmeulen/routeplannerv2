/* Voorbeeld voor een eigen hosting (Azure Static Web Apps, website).
 * Hernoem naar config.local.js en voeg in index.html VÓÓR js/config.js toe:
 *   <script src="js/config.local.js"></script>
 */
window.OG_CONFIG = {
  routing: { proxyUrl: 'https://<functie-app>.azurewebsites.net/api' },
  allowInternalParam: false,                         // publieke website: geen interne modus via de URL
  publicUrl: 'https://www.ogcleanfuels.com/routeplanner'
};
