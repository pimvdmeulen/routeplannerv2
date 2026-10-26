import re
import io
import math
import base64
import os

import streamlit as st
import requests
import pandas as pd
import folium
from streamlit_folium import st_folium
from geopy.geocoders import Nominatim, Photon
from geopy.extra.rate_limiter import RateLimiter
from geopy.exc import GeocoderUnavailable, GeocoderTimedOut, GeocoderServiceError

from og_stations import OG_STATIONS
from cng_stations import CNG_STATIONS

# ---------------------------------------------------------------------------
# Vertalingen / Translations
# ---------------------------------------------------------------------------
TRANSLATIONS: dict[str, dict[str, str]] = {
    "nl": {
        "page_title": "OG Routeplanner",
        "sidebar_title": "OG Routeplanner",
        "sidebar_sub": "Plan een rijroute met OG-tankstops",
        "route_section": "Route",
        "start_label": "Startadres",
        "start_placeholder": "bijv. Amsterdam",
        "end_label": "Eindadres",
        "end_placeholder": "bijv. Berlijn",
        "intermediate_section": "Tussenstops (optioneel)",
        "intermediate_1": "Tussenstop 1",
        "intermediate_2": "Tussenstop 2",
        "intermediate_3": "Tussenstop 3",
        "settings_section": "Instellingen",
        "interval_label": "Km tussen stops",
        "corridor_label": "Corridorbreedte (km)",
        "route_name_label": "Routenaam",
        "route_name_default": "Mijn Route",
        "discount_section": "Brandstofprijs",
        "discount_none": "Standaardprijs",
        "discount_fixed": "Vaste prijs (€/kg)",
        "discount_pct": "Korting (%)",
        "discount_fixed_label": "Prijs per kg (€)",
        "discount_pct_label": "Kortingspercentage (%)",
        "generate_btn": "⛽  Genereer route",
        "hero_title": "OG Routeplanner",
        "hero_sub": "Optimale rijroutes met biogastankstops in NL · DE · FR · IT · SE",
        "welcome_text": "Vul een start- en eindadres in en klik op",
        "welcome_btn": "Genereer route",
        "geocoding_spinner": "Adressen opzoeken...",
        "routing_spinner": "Route berekenen...",
        "country_spinner": "Landen opzoeken voor brandstofprijzen...",
        "err_start": "Startadres **\"{addr}\"** niet gevonden.",
        "err_end": "Eindadres **\"{addr}\"** niet gevonden.",
        "err_intermediate": "Tussenstop {i} **\"{addr}\"** niet gevonden — overgeslagen.",
        "err_route": "Kon geen route berekenen. Controleer de adressen of probeer het opnieuw.",
        "metric_distance": "Totale afstand",
        "metric_time": "Reistijd",
        "metric_stops": "Tankstops",
        "metric_interval": "Gem. interval",
        "cost_section_title": "Bio-CNG vs Diesel — brandstofkosten &amp; CO₂",
        "cost_section_sub": "per land berekend",
        "metric_savings": "Kostenbesparing CNG vs Diesel",
        "metric_cheaper": "Goedkoper dan diesel",
        "metric_co2": "CO₂-voordeel t.o.v. diesel",
        "metric_co2_pct": "CO₂-reductie (Bio-CNG is CO₂-negatief)",
        "table_expander": "📊 Brandstofkosten per tankstop uitsplitsen",
        "table_location": "Locatie",
        "table_country": "Land",
        "table_segment": "Segment",
        "table_diesel": "Diesel",
        "table_biocng": "Bio-CNG",
        "table_savings": "Besparing",
        "table_total": "Totaal",
        "stops_header": "⛽ Tankstops ({n})",
        "stop_km_from_start": "km van start",
        "no_stops": "Geen tankstops nodig voor dit interval.",
        "download_btn": "⬇️  Download route als CSV",
        "start_map": "Start",
        "dest_map": "Bestemming",
        "direct_route": "Directe route",
        "route_with_stops": "Route met tankstops",
        "intermediate_map": "Tussenstop {i}",
        "no_station": "Geen CNG-station beschikbaar",
        "discount_applied": "Korting toegepast: {val}",
        "lang_label": "Taal",
    },
    "en": {
        "page_title": "OG Route Planner",
        "sidebar_title": "OG Route Planner",
        "sidebar_sub": "Plan a route with OG fueling stops",
        "route_section": "Route",
        "start_label": "Start address",
        "start_placeholder": "e.g. Amsterdam",
        "end_label": "End address",
        "end_placeholder": "e.g. Berlin",
        "intermediate_section": "Intermediate stops (optional)",
        "intermediate_1": "Stop 1",
        "intermediate_2": "Stop 2",
        "intermediate_3": "Stop 3",
        "settings_section": "Settings",
        "interval_label": "Km between stops",
        "corridor_label": "Corridor width (km)",
        "route_name_label": "Route name",
        "route_name_default": "My Route",
        "discount_section": "Fuel price",
        "discount_none": "Standard price",
        "discount_fixed": "Fixed price (€/kg)",
        "discount_pct": "Discount (%)",
        "discount_fixed_label": "Price per kg (€)",
        "discount_pct_label": "Discount percentage (%)",
        "generate_btn": "⛽  Generate route",
        "hero_title": "OG Route Planner",
        "hero_sub": "Optimal routes with biogas fueling stops in NL · DE · FR · IT · SE",
        "welcome_text": "Enter a start and end address and click",
        "welcome_btn": "Generate route",
        "geocoding_spinner": "Looking up addresses...",
        "routing_spinner": "Calculating route...",
        "country_spinner": "Looking up countries for fuel prices...",
        "err_start": "Start address **\"{addr}\"** not found.",
        "err_end": "End address **\"{addr}\"** not found.",
        "err_intermediate": "Stop {i} **\"{addr}\"** not found — skipped.",
        "err_route": "Could not calculate route. Check the addresses or try again.",
        "metric_distance": "Total distance",
        "metric_time": "Travel time",
        "metric_stops": "Fuel stops",
        "metric_interval": "Avg. interval",
        "cost_section_title": "Bio-CNG vs Diesel — fuel costs &amp; CO₂",
        "cost_section_sub": "calculated per country",
        "metric_savings": "Cost savings CNG vs Diesel",
        "metric_cheaper": "Cheaper than diesel",
        "metric_co2": "CO₂ advantage vs diesel",
        "metric_co2_pct": "CO₂ reduction (Bio-CNG is CO₂-negative)",
        "table_expander": "📊 Break down fuel costs per stop",
        "table_location": "Location",
        "table_country": "Country",
        "table_segment": "Segment",
        "table_diesel": "Diesel",
        "table_biocng": "Bio-CNG",
        "table_savings": "Savings",
        "table_total": "Total",
        "stops_header": "⛽ Fuel stops ({n})",
        "stop_km_from_start": "km from start",
        "no_stops": "No fuel stops needed for this interval.",
        "download_btn": "⬇️  Download route as CSV",
        "start_map": "Start",
        "dest_map": "Destination",
        "direct_route": "Direct route",
        "route_with_stops": "Route with fuel stops",
        "intermediate_map": "Stop {i}",
        "no_station": "No CNG station available",
        "discount_applied": "Discount applied: {val}",
        "lang_label": "Language",
    },
    "de": {
        "page_title": "OG Routenplaner",
        "sidebar_title": "OG Routenplaner",
        "sidebar_sub": "Route mit OG-Tankstopps planen",
        "route_section": "Route",
        "start_label": "Startadresse",
        "start_placeholder": "z.B. Amsterdam",
        "end_label": "Zieladresse",
        "end_placeholder": "z.B. Berlin",
        "intermediate_section": "Zwischenstopps (optional)",
        "intermediate_1": "Zwischenstopp 1",
        "intermediate_2": "Zwischenstopp 2",
        "intermediate_3": "Zwischenstopp 3",
        "settings_section": "Einstellungen",
        "interval_label": "Km zwischen Stopps",
        "corridor_label": "Korridorbreite (km)",
        "route_name_label": "Routenname",
        "route_name_default": "Meine Route",
        "discount_section": "Kraftstoffpreis",
        "discount_none": "Standardpreis",
        "discount_fixed": "Festpreis (€/kg)",
        "discount_pct": "Rabatt (%)",
        "discount_fixed_label": "Preis pro kg (€)",
        "discount_pct_label": "Rabattprozentsatz (%)",
        "generate_btn": "⛽  Route erstellen",
        "hero_title": "OG Routenplaner",
        "hero_sub": "Optimale Routen mit Biogas-Tankstopps in NL · DE · FR · IT · SE",
        "welcome_text": "Geben Sie Start- und Zieladresse ein und klicken Sie auf",
        "welcome_btn": "Route erstellen",
        "geocoding_spinner": "Adressen suchen...",
        "routing_spinner": "Route berechnen...",
        "country_spinner": "Länder für Kraftstoffpreise suchen...",
        "err_start": "Startadresse **\"{addr}\"** nicht gefunden.",
        "err_end": "Zieladresse **\"{addr}\"** nicht gefunden.",
        "err_intermediate": "Zwischenstopp {i} **\"{addr}\"** nicht gefunden — übersprungen.",
        "err_route": "Route konnte nicht berechnet werden. Bitte Adressen prüfen.",
        "metric_distance": "Gesamtdistanz",
        "metric_time": "Reisezeit",
        "metric_stops": "Tankstopps",
        "metric_interval": "Ø Abstand",
        "cost_section_title": "Bio-CNG vs Diesel — Kosten &amp; CO₂",
        "cost_section_sub": "pro Land berechnet",
        "metric_savings": "Kostenersparnis CNG vs Diesel",
        "metric_cheaper": "Günstiger als Diesel",
        "metric_co2": "CO₂-Vorteil gegenüber Diesel",
        "metric_co2_pct": "CO₂-Reduktion (Bio-CNG ist CO₂-negativ)",
        "table_expander": "📊 Kraftstoffkosten pro Stopp aufschlüsseln",
        "table_location": "Standort",
        "table_country": "Land",
        "table_segment": "Abschnitt",
        "table_diesel": "Diesel",
        "table_biocng": "Bio-CNG",
        "table_savings": "Ersparnis",
        "table_total": "Gesamt",
        "stops_header": "⛽ Tankstopps ({n})",
        "stop_km_from_start": "km vom Start",
        "no_stops": "Für dieses Intervall werden keine Tankstopps benötigt.",
        "download_btn": "⬇️  Route als CSV herunterladen",
        "start_map": "Start",
        "dest_map": "Ziel",
        "direct_route": "Direkte Route",
        "route_with_stops": "Route mit Tankstopps",
        "intermediate_map": "Zwischenstopp {i}",
        "no_station": "Kein CNG-Tankstelle verfügbar",
        "discount_applied": "Rabatt angewendet: {val}",
        "lang_label": "Sprache",
    },
    "fr": {
        "page_title": "OG Planificateur d'itinéraire",
        "sidebar_title": "OG Planificateur",
        "sidebar_sub": "Planifiez un itinéraire avec des arrêts OG",
        "route_section": "Itinéraire",
        "start_label": "Adresse de départ",
        "start_placeholder": "ex. Amsterdam",
        "end_label": "Adresse d'arrivée",
        "end_placeholder": "ex. Berlin",
        "intermediate_section": "Arrêts intermédiaires (optionnel)",
        "intermediate_1": "Arrêt 1",
        "intermediate_2": "Arrêt 2",
        "intermediate_3": "Arrêt 3",
        "settings_section": "Paramètres",
        "interval_label": "Km entre les arrêts",
        "corridor_label": "Largeur du couloir (km)",
        "route_name_label": "Nom de l'itinéraire",
        "route_name_default": "Mon itinéraire",
        "discount_section": "Prix du carburant",
        "discount_none": "Prix standard",
        "discount_fixed": "Prix fixe (€/kg)",
        "discount_pct": "Remise (%)",
        "discount_fixed_label": "Prix par kg (€)",
        "discount_pct_label": "Pourcentage de remise (%)",
        "generate_btn": "⛽  Générer l'itinéraire",
        "hero_title": "OG Planificateur d'itinéraire",
        "hero_sub": "Itinéraires optimaux avec arrêts biogaz dans NL · DE · FR · IT · SE",
        "welcome_text": "Entrez une adresse de départ et d'arrivée et cliquez sur",
        "welcome_btn": "Générer l'itinéraire",
        "geocoding_spinner": "Recherche des adresses...",
        "routing_spinner": "Calcul de l'itinéraire...",
        "country_spinner": "Recherche des pays pour les prix du carburant...",
        "err_start": "Adresse de départ **\"{addr}\"** introuvable.",
        "err_end": "Adresse d'arrivée **\"{addr}\"** introuvable.",
        "err_intermediate": "Arrêt {i} **\"{addr}\"** introuvable — ignoré.",
        "err_route": "Impossible de calculer l'itinéraire. Vérifiez les adresses.",
        "metric_distance": "Distance totale",
        "metric_time": "Durée du trajet",
        "metric_stops": "Arrêts carburant",
        "metric_interval": "Intervalle moy.",
        "cost_section_title": "Bio-GNC vs Diesel — coûts &amp; CO₂",
        "cost_section_sub": "calculé par pays",
        "metric_savings": "Économies GNC vs Diesel",
        "metric_cheaper": "Moins cher que le diesel",
        "metric_co2": "Avantage CO₂ vs diesel",
        "metric_co2_pct": "Réduction CO₂ (Bio-GNC est CO₂-négatif)",
        "table_expander": "📊 Détail des coûts par arrêt",
        "table_location": "Lieu",
        "table_country": "Pays",
        "table_segment": "Segment",
        "table_diesel": "Diesel",
        "table_biocng": "Bio-GNC",
        "table_savings": "Économies",
        "table_total": "Total",
        "stops_header": "⛽ Arrêts carburant ({n})",
        "stop_km_from_start": "km depuis le départ",
        "no_stops": "Aucun arrêt carburant nécessaire pour cet intervalle.",
        "download_btn": "⬇️  Télécharger l'itinéraire en CSV",
        "start_map": "Départ",
        "dest_map": "Destination",
        "direct_route": "Itinéraire direct",
        "route_with_stops": "Itinéraire avec arrêts",
        "intermediate_map": "Arrêt {i}",
        "no_station": "Aucune station GNC disponible",
        "discount_applied": "Remise appliquée : {val}",
        "lang_label": "Langue",
    },
    "it": {
        "page_title": "OG Pianificatore di percorso",
        "sidebar_title": "OG Pianificatore",
        "sidebar_sub": "Pianifica un percorso con soste OG",
        "route_section": "Percorso",
        "start_label": "Indirizzo di partenza",
        "start_placeholder": "es. Amsterdam",
        "end_label": "Indirizzo di arrivo",
        "end_placeholder": "es. Berlino",
        "intermediate_section": "Soste intermedie (facoltativo)",
        "intermediate_1": "Sosta 1",
        "intermediate_2": "Sosta 2",
        "intermediate_3": "Sosta 3",
        "settings_section": "Impostazioni",
        "interval_label": "Km tra le soste",
        "corridor_label": "Larghezza corridoio (km)",
        "route_name_label": "Nome percorso",
        "route_name_default": "Il mio percorso",
        "discount_section": "Prezzo carburante",
        "discount_none": "Prezzo standard",
        "discount_fixed": "Prezzo fisso (€/kg)",
        "discount_pct": "Sconto (%)",
        "discount_fixed_label": "Prezzo per kg (€)",
        "discount_pct_label": "Percentuale di sconto (%)",
        "generate_btn": "⛽  Genera percorso",
        "hero_title": "OG Pianificatore di percorso",
        "hero_sub": "Percorsi ottimali con soste biogas in NL · DE · FR · IT · SE",
        "welcome_text": "Inserisci indirizzo di partenza e arrivo e clicca su",
        "welcome_btn": "Genera percorso",
        "geocoding_spinner": "Ricerca indirizzi...",
        "routing_spinner": "Calcolo percorso...",
        "country_spinner": "Ricerca paesi per i prezzi del carburante...",
        "err_start": "Indirizzo di partenza **\"{addr}\"** non trovato.",
        "err_end": "Indirizzo di arrivo **\"{addr}\"** non trovato.",
        "err_intermediate": "Sosta {i} **\"{addr}\"** non trovata — ignorata.",
        "err_route": "Impossibile calcolare il percorso. Verifica gli indirizzi.",
        "metric_distance": "Distanza totale",
        "metric_time": "Tempo di viaggio",
        "metric_stops": "Soste carburante",
        "metric_interval": "Intervallo medio",
        "cost_section_title": "Bio-CNG vs Diesel — costi &amp; CO₂",
        "cost_section_sub": "calcolato per paese",
        "metric_savings": "Risparmio CNG vs Diesel",
        "metric_cheaper": "Più economico del diesel",
        "metric_co2": "Vantaggio CO₂ vs diesel",
        "metric_co2_pct": "Riduzione CO₂ (Bio-CNG è CO₂-negativo)",
        "table_expander": "📊 Dettaglio costi per sosta",
        "table_location": "Località",
        "table_country": "Paese",
        "table_segment": "Tratto",
        "table_diesel": "Diesel",
        "table_biocng": "Bio-CNG",
        "table_savings": "Risparmio",
        "table_total": "Totale",
        "stops_header": "⛽ Soste carburante ({n})",
        "stop_km_from_start": "km dall'inizio",
        "no_stops": "Nessuna sosta carburante necessaria per questo intervallo.",
        "download_btn": "⬇️  Scarica percorso come CSV",
        "start_map": "Partenza",
        "dest_map": "Destinazione",
        "direct_route": "Percorso diretto",
        "route_with_stops": "Percorso con soste",
        "intermediate_map": "Sosta {i}",
        "no_station": "Nessuna stazione CNG disponibile",
        "discount_applied": "Sconto applicato: {val}",
        "lang_label": "Lingua",
    },
    "sv": {
        "page_title": "OG Ruttplanerare",
        "sidebar_title": "OG Ruttplanerare",
        "sidebar_sub": "Planera en rutt med OG-tankningsstopp",
        "route_section": "Rutt",
        "start_label": "Startadress",
        "start_placeholder": "t.ex. Amsterdam",
        "end_label": "Slutadress",
        "end_placeholder": "t.ex. Berlin",
        "intermediate_section": "Mellanstopp (valfritt)",
        "intermediate_1": "Mellanstopp 1",
        "intermediate_2": "Mellanstopp 2",
        "intermediate_3": "Mellanstopp 3",
        "settings_section": "Inställningar",
        "interval_label": "Km mellan stopp",
        "corridor_label": "Korridorbredd (km)",
        "route_name_label": "Ruttnamn",
        "route_name_default": "Min rutt",
        "discount_section": "Bränslepris",
        "discount_none": "Standardpris",
        "discount_fixed": "Fast pris (€/kg)",
        "discount_pct": "Rabatt (%)",
        "discount_fixed_label": "Pris per kg (€)",
        "discount_pct_label": "Rabattprocent (%)",
        "generate_btn": "⛽  Generera rutt",
        "hero_title": "OG Ruttplanerare",
        "hero_sub": "Optimala rutter med biogastankstopp i NL · DE · FR · IT · SE",
        "welcome_text": "Ange start- och slutadress och klicka på",
        "welcome_btn": "Generera rutt",
        "geocoding_spinner": "Söker adresser...",
        "routing_spinner": "Beräknar rutt...",
        "country_spinner": "Söker länder för bränslepriser...",
        "err_start": "Startadressen **\"{addr}\"** hittades inte.",
        "err_end": "Slutadressen **\"{addr}\"** hittades inte.",
        "err_intermediate": "Mellanstopp {i} **\"{addr}\"** hittades inte — ignoreras.",
        "err_route": "Kunde inte beräkna rutten. Kontrollera adresserna.",
        "metric_distance": "Total distans",
        "metric_time": "Restid",
        "metric_stops": "Tankstopp",
        "metric_interval": "Medelintervall",
        "cost_section_title": "Bio-CNG vs Diesel — kostnader &amp; CO₂",
        "cost_section_sub": "beräknat per land",
        "metric_savings": "Kostnadsbesparingar CNG vs Diesel",
        "metric_cheaper": "Billigare än diesel",
        "metric_co2": "CO₂-fördel vs diesel",
        "metric_co2_pct": "CO₂-minskning (Bio-CNG är CO₂-negativt)",
        "table_expander": "📊 Detaljera bränslekostnader per stopp",
        "table_location": "Plats",
        "table_country": "Land",
        "table_segment": "Segment",
        "table_diesel": "Diesel",
        "table_biocng": "Bio-CNG",
        "table_savings": "Besparing",
        "table_total": "Totalt",
        "stops_header": "⛽ Tankstopp ({n})",
        "stop_km_from_start": "km från start",
        "no_stops": "Inga tankstopp behövs för detta intervall.",
        "download_btn": "⬇️  Ladda ner rutt som CSV",
        "start_map": "Start",
        "dest_map": "Destination",
        "direct_route": "Direktrutt",
        "route_with_stops": "Rutt med tankstopp",
        "intermediate_map": "Mellanstopp {i}",
        "no_station": "Ingen CNG-station tillgänglig",
        "discount_applied": "Rabatt tillämpad: {val}",
        "lang_label": "Språk",
    },
}

LANG_OPTIONS = {
    "🇳🇱": "nl",
    "🇬🇧": "en",
    "🇩🇪": "de",
    "🇫🇷": "fr",
    "🇮🇹": "it",
    "🇸🇪": "sv",
}


def T(key: str, **kwargs) -> str:
    """Geeft de vertaling terug voor de geselecteerde taal."""
    lang = st.session_state.get("lang", "nl")
    text = TRANSLATIONS.get(lang, TRANSLATIONS["nl"]).get(
        key, TRANSLATIONS["nl"].get(key, key)
    )
    return text.format(**kwargs) if kwargs else text


# ---------------------------------------------------------------------------
# Pagina-configuratie
# ---------------------------------------------------------------------------
# Station data — bewaard voor backwards-compatibiliteit (niet meer direct gebruikt)
# ---------------------------------------------------------------------------
tankstations = [
    {"name": "GNV station Aalst", "lat": 50.9369, "lon": 4.6648},
    {"name": "Aral Tankstelle Oberhausen", "lat": 51.4691, "lon": 6.8786},
    {"name": "Westfalen Tankstelle Hamm", "lat": 51.6804, "lon": 7.8228},
    {"name": "Esso Tankstelle Dortmund", "lat": 51.5253, "lon": 7.4654},
    {"name": "AVIA Tankstelle Bielefeld", "lat": 52.0254, "lon": 8.5317},
    {"name": "Shell Tankstelle Hannover", "lat": 52.3727, "lon": 9.7404},
    {"name": "Aral Tankstelle Hamburg-Nord", "lat": 53.6122, "lon": 10.0195},
    {"name": "OMV Tankstelle München-Ost", "lat": 48.1421, "lon": 11.5966},
    {"name": "BP Tankstelle Stuttgart-Vaihingen", "lat": 48.7227, "lon": 9.1041},
    {"name": "Total Tankstelle Frankfurt Sachsenhausen", "lat": 50.0927, "lon": 8.6866},
    {"name": "Aral Tankstelle Köln-Ehrenfeld", "lat": 50.9483, "lon": 6.8943},
    {"name": "Shell Tankstelle Düsseldorf-Flingern", "lat": 51.2324, "lon": 6.8171},
    {"name": "Jet Tankstelle Leipzig-Mitte", "lat": 51.3350, "lon": 12.3925},
    {"name": "Esso Tankstelle Dresden-Neustadt", "lat": 51.0665, "lon": 13.7516},
    {"name": "Aral Tankstelle Nürnberg-Ost", "lat": 49.4556, "lon": 11.1024},
    {"name": "Total Tankstelle Bremen-Mitte", "lat": 53.0806, "lon": 8.8085},
    {"name": "OMV Tankstelle Augsburg-Lechhausen", "lat": 48.3849, "lon": 10.9139},
    {"name": "Shell Tankstelle Mannheim-Neckarau", "lat": 49.4612, "lon": 8.5129},
    {"name": "BP Tankstelle Karlsruhe-Mühlburg", "lat": 49.0061, "lon": 8.3643},
    {"name": "Aral Tankstelle Bonn-Beuel", "lat": 50.7355, "lon": 7.1208},
    {"name": "Esso Tankstelle Wiesbaden-Kastel", "lat": 50.0182, "lon": 8.2803},
    {"name": "Total Tankstelle Münster-Hafen", "lat": 51.9728, "lon": 7.6236},
    {"name": "Jet Tankstelle Bochum-Riemke", "lat": 51.5020, "lon": 7.2188},
    {"name": "Shell Tankstelle Gelsenkirchen-Buer", "lat": 51.5771, "lon": 7.0721},
    {"name": "Aral Tankstelle Essen-Frillendorf", "lat": 51.4685, "lon": 7.0586},
    {"name": "OMV Tankstelle Regensburg-Steinweg", "lat": 48.9996, "lon": 12.0904},
    {"name": "BP Tankstelle Freiburg-Haslach", "lat": 47.9851, "lon": 7.8283},
    {"name": "Total Tankstelle Kiel-Gaarden", "lat": 54.3201, "lon": 10.1526},
    {"name": "Esso Tankstelle Lübeck-Moisling", "lat": 53.8649, "lon": 10.6481},
    {"name": "Shell Tankstelle Rostock-Lütten Klein", "lat": 54.1066, "lon": 12.0612},
    {"name": "Aral Tankstelle Erfurt-Ilversgehofen", "lat": 50.9988, "lon": 11.0207},
    {"name": "Jet Tankstelle Magdeburg-Stadtfeld", "lat": 52.1324, "lon": 11.6051},
    {"name": "Total Tankstelle Halle-Silberhöhe", "lat": 51.4594, "lon": 11.9829},
    {"name": "BP Tankstelle Chemnitz-Gablenz", "lat": 50.8350, "lon": 12.8946},
    {"name": "OMV Tankstelle Ingolstadt-Mitte", "lat": 48.7657, "lon": 11.4266},
    {"name": "Shell Tankstelle Ulm-Böfingen", "lat": 48.4011, "lon": 9.9893},
    {"name": "Aral Tankstelle Würzburg-Frauenland", "lat": 49.7793, "lon": 9.9398},
    {"name": "Esso Tankstelle Mainz-Hartenberg", "lat": 50.0003, "lon": 8.2381},
    {"name": "Total Tankstelle Kassel-Wehlheiden", "lat": 51.3114, "lon": 9.4638},
    {"name": "Jet Tankstelle Braunschweig-Weststadt", "lat": 52.2676, "lon": 10.4895},
    {"name": "Shell Tankstelle Osnabrück-Schölerberg", "lat": 52.2949, "lon": 8.0678},
    {"name": "BP Tankstelle Duisburg-Rheinhausen", "lat": 51.4012, "lon": 6.7069},
    {"name": "Aral Tankstelle Krefeld-Fischeln", "lat": 51.3171, "lon": 6.5897},
    {"name": "OMV Tankstelle Mönchengladbach-Rheydt", "lat": 51.1655, "lon": 6.4495},
    {"name": "Total Tankstelle Aachen-Laurensberg", "lat": 50.7921, "lon": 6.1276},
    {"name": "Esso Tankstelle Trier-West", "lat": 49.7538, "lon": 6.6108},
    {"name": "Shell Tankstelle Saarbrücken-Malstatt", "lat": 49.2397, "lon": 7.0015},
    {"name": "Jet Tankstelle Heilbronn-Böckingen", "lat": 49.1362, "lon": 9.2095},
    {"name": "Aral Tankstelle Ludwigshafen-Friesenheim", "lat": 49.4988, "lon": 8.4214},
    {"name": "BP Tankstelle Heidelberg-Rohrbach", "lat": 49.3775, "lon": 8.6936},
    {"name": "Total Tankstelle Pforzheim-Büchenbronn", "lat": 48.8732, "lon": 8.6833},
    {"name": "Shell Tankstelle Reutlingen-Orschel-Hagen", "lat": 48.4739, "lon": 9.2155},
    {"name": "Aral Tankstelle Göttingen-Grone", "lat": 51.5207, "lon": 9.9081},
    {"name": "OMV Tankstelle Wolfsburg-Detmerode", "lat": 52.4463, "lon": 10.7892},
    {"name": "Esso Tankstelle Hildesheim-Ost", "lat": 52.1538, "lon": 9.9848},
    {"name": "Jet Tankstelle Oldenburg-Donnerschwee", "lat": 53.1518, "lon": 8.2218},
    {"name": "Shell Tankstelle Wilhelmshaven-Fedderwardergroden", "lat": 53.5671, "lon": 8.1213},
    {"name": "BP Tankstelle Flensburg-Mürwik", "lat": 54.8065, "lon": 9.4575},
    {"name": "Total Tankstelle Lübeck-St. Lorenz", "lat": 53.8852, "lon": 10.6982},
    {"name": "Aral Tankstelle Stralsund-Grünhufe", "lat": 54.3052, "lon": 13.1153},
    {"name": "Esso Tankstelle Greifswald-Schönwalde", "lat": 54.0820, "lon": 13.4203},
    {"name": "Shell Tankstelle Neubrandenburg-Ost", "lat": 53.5596, "lon": 13.2898},
    {"name": "Jet Tankstelle Schwerin-Weststadt", "lat": 53.6312, "lon": 11.3921},
    {"name": "OMV Tankstelle Passau-Innstadt", "lat": 48.5678, "lon": 13.4812},
    {"name": "Aral Tankstelle Landshut-Achdorf", "lat": 48.5261, "lon": 12.1744},
    {"name": "Total Tankstelle Rosenheim-Aising", "lat": 47.8473, "lon": 12.1453},
    {"name": "BP Tankstelle Kempten-Sankt Mang", "lat": 47.7321, "lon": 10.3168},
    {"name": "Shell Tankstelle Lindau-Aeschach", "lat": 47.5612, "lon": 9.6934},
    {"name": "Esso Tankstelle Ravensburg-Weststadt", "lat": 47.7842, "lon": 9.5982},
    {"name": "Aral Tankstelle Konstanz-Petershausen", "lat": 47.6783, "lon": 9.1672},
    {"name": "Total Tankstelle Tuttlingen-Mitte", "lat": 47.9845, "lon": 8.8194},
    {"name": "Jet Tankstelle Villingen-Schwenningen", "lat": 48.0593, "lon": 8.4588},
    {"name": "OMV Tankstelle Offenburg-Oststadt", "lat": 48.4721, "lon": 7.9501},
    {"name": "Shell Tankstelle Lahr-Hugsweier", "lat": 48.3487, "lon": 7.8678},
    {"name": "BP Tankstelle Lörrach-Haagen", "lat": 47.6122, "lon": 7.6741},
    {"name": "Aral Tankstelle Waldshut-Tiengen", "lat": 47.6234, "lon": 8.2174},
    {"name": "Total Tankstelle Singen-Hegau", "lat": 47.7578, "lon": 8.8315},
    {"name": "Esso Tankstelle Friedrichshafen-Fischbach", "lat": 47.6789, "lon": 9.5139},
    {"name": "Shell Tankstelle Biberach-Mitte", "lat": 48.1014, "lon": 9.7864},
    {"name": "Jet Tankstelle Heidenheim-Schnaitheim", "lat": 48.6938, "lon": 10.1548},
    {"name": "Aral Tankstelle Schwäbisch Gmünd-Bargau", "lat": 48.8033, "lon": 9.8079},
    {"name": "OMV Tankstelle Göppingen-Jebenhausen", "lat": 48.7031, "lon": 9.6793},
    {"name": "BP Tankstelle Aalen-Wasseralfingen", "lat": 48.8643, "lon": 10.1134},
    {"name": "Total Tankstelle Schwäbisch Hall-Hessental", "lat": 49.1103, "lon": 9.7349},
    {"name": "Shell Tankstelle Crailsheim-Mitte", "lat": 49.1371, "lon": 10.0742},
    {"name": "Aral Tankstelle Ansbach-Innenstadt", "lat": 49.3011, "lon": 10.5725},
    {"name": "Esso Tankstelle Fürth-Poppenreuth", "lat": 49.4937, "lon": 10.9871},
    {"name": "Jet Tankstelle Erlangen-Bruck", "lat": 49.5926, "lon": 11.0382},
    {"name": "Total Tankstelle Bayreuth-Meyernberg", "lat": 49.9408, "lon": 11.5814},
    {"name": "OMV Tankstelle Hof-Mitte", "lat": 50.3119, "lon": 11.9155},
    {"name": "BP Tankstelle Bamberg-Bug", "lat": 49.9143, "lon": 10.9211},
    {"name": "Shell Tankstelle Schweinfurt-Bergl", "lat": 50.0563, "lon": 10.2287},
    {"name": "Aral Tankstelle Aschaffenburg-Damm", "lat": 49.9671, "lon": 9.1462},
    {"name": "Total Tankstelle Darmstadt-Kranichstein", "lat": 49.8941, "lon": 8.6793},
    {"name": "Esso Tankstelle Offenbach-Bürgel", "lat": 50.1001, "lon": 8.7871},
    {"name": "Jet Tankstelle Hanau-Großauheim", "lat": 50.1281, "lon": 8.9651},
    {"name": "Shell Tankstelle Fulda-Galerie", "lat": 50.5556, "lon": 9.6793},
    {"name": "BP Tankstelle Marburg-Wehrda", "lat": 50.8248, "lon": 8.7694},
    {"name": "Aral Tankstelle Gießen-Wieseck", "lat": 50.5992, "lon": 8.6881},
    {"name": "OMV Tankstelle Siegen-Geisweid", "lat": 50.9201, "lon": 8.0234},
    {"name": "Total Tankstelle Hagen-Haspe", "lat": 51.3578, "lon": 7.4089},
    {"name": "Shell Tankstelle Witten-Annen", "lat": 51.4312, "lon": 7.3415},
    {"name": "Esso Tankstelle Herne-Eickel", "lat": 51.5430, "lon": 7.2041},
    {"name": "Jet Tankstelle Recklinghausen-Süd", "lat": 51.5872, "lon": 7.1866},
    {"name": "Aral Tankstelle Bottrop-Eigen", "lat": 51.5241, "lon": 6.9613},
    {"name": "BP Tankstelle Wesel-Stadtlohn", "lat": 51.6578, "lon": 6.5781},
    {"name": "Total Tankstelle Cleves-Materborn", "lat": 51.7723, "lon": 6.1278},
    {"name": "Shell Tankstelle Neuss-Norf", "lat": 51.1543, "lon": 6.7389},
    {"name": "Aral Tankstelle Solingen-Wald", "lat": 51.1831, "lon": 7.1035},
    {"name": "Esso Tankstelle Remscheid-Hasten", "lat": 51.1982, "lon": 7.2284},
    {"name": "Jet Tankstelle Wuppertal-Vohwinkel", "lat": 51.2446, "lon": 7.0839},
    {"name": "OMV Tankstelle Leverkusen-Schlebusch", "lat": 51.0287, "lon": 7.0492},
    {"name": "BP Tankstelle Bergisch Gladbach-Sand", "lat": 50.9843, "lon": 7.1519},
    {"name": "Shell Tankstelle Troisdorf-Sieglar", "lat": 50.8021, "lon": 7.1783},
    {"name": "Total Tankstelle Cologne-Porz", "lat": 50.8776, "lon": 7.0512},
    {"name": "Aral Tankstelle Cologne-Mülheim", "lat": 50.9607, "lon": 7.0065},
    {"name": "Esso Tankstelle Cologne-Pesch", "lat": 51.0232, "lon": 6.8924},
    {"name": "Jet Tankstelle Dormagen-Nievenheim", "lat": 51.1089, "lon": 6.7785},
    {"name": "Shell Tankstelle Grevenbroich-Kapellen", "lat": 51.1025, "lon": 6.5543},
    {"name": "BP Tankstelle Erkelenz-Lövenich", "lat": 51.1026, "lon": 6.2890},
    {"name": "Aral Tankstelle Heinsberg-Oberbruch", "lat": 51.0513, "lon": 6.1152},
    {"name": "Total Tankstelle Maastricht station", "lat": 50.8512, "lon": 5.7053},
    {"name": "Shell Tankstelle Roermond-Oost", "lat": 51.1956, "lon": 5.9981},
    {"name": "Esso Tankstelle Venlo-Blerick", "lat": 51.3680, "lon": 6.1542},
    {"name": "Jet Tankstelle Nijmegen-Neerbosch", "lat": 51.8346, "lon": 5.8258},
    {"name": "OMV Tankstelle Arnhem-Presikhaaf", "lat": 51.9889, "lon": 5.9543},
    {"name": "BP Tankstelle Apeldoorn-Zevenhuizen", "lat": 52.2076, "lon": 5.9713},
    {"name": "Aral Tankstelle Deventer-Colmschate", "lat": 52.2629, "lon": 6.2108},
    {"name": "Shell Tankstelle Zwolle-Holtenbroek", "lat": 52.5194, "lon": 6.0812},
    {"name": "Total Tankstelle Groningen-Hoogkerk", "lat": 53.2167, "lon": 6.5003},
    {"name": "Esso Tankstelle Leeuwarden-Camminghaburen", "lat": 53.1834, "lon": 5.8492},
    {"name": "Jet Tankstelle Emmen-Bargeres", "lat": 52.7824, "lon": 6.9208},
    {"name": "Shell Tankstelle Enschede-Glanerbrug", "lat": 52.1972, "lon": 6.9792},
    {"name": "BP Tankstelle Almelo-Ossenkoppelen", "lat": 52.3590, "lon": 6.6542},
    {"name": "Aral Tankstelle Hengelo-Beckum", "lat": 52.2549, "lon": 6.7989},
    {"name": "Total Tankstelle Utrecht-Overvecht", "lat": 52.1184, "lon": 5.1337},
    {"name": "OMV Tankstelle Amersfoort-Vathorst", "lat": 52.1981, "lon": 5.4230},
    {"name": "Shell Tankstelle Hilversum-Larenseweg", "lat": 52.2274, "lon": 5.1863},
    {"name": "Esso Tankstelle Amsterdam-Osdorp", "lat": 52.3669, "lon": 4.8165},
    {"name": "Jet Tankstelle Haarlem-Schalkwijk", "lat": 52.3700, "lon": 4.6757},
    {"name": "Aral Tankstelle Leiden-Noord", "lat": 52.1768, "lon": 4.4932},
    {"name": "BP Tankstelle Den Haag-Mariahoeve", "lat": 52.0785, "lon": 4.3500},
    {"name": "Shell Tankstelle Rotterdam-Overschie", "lat": 51.9495, "lon": 4.4565},
    {"name": "Total Tankstelle Dordrecht-Dubbeldam", "lat": 51.8090, "lon": 4.7072},
    {"name": "Esso Tankstelle Breda-Princenhage", "lat": 51.5734, "lon": 4.7341},
    {"name": "Jet Tankstelle Tilburg-Reeshof", "lat": 51.5618, "lon": 5.0027},
    {"name": "OMV Tankstelle 's-Hertogenbosch-Rosmalen", "lat": 51.7251, "lon": 5.3842},
    {"name": "Shell Tankstelle Eindhoven-Tongelre", "lat": 51.4363, "lon": 5.5016},
    {"name": "BP Tankstelle Helmond-Brandevoort", "lat": 51.4785, "lon": 5.7131},
    {"name": "Aral Tankstelle Venray-Smakt", "lat": 51.5372, "lon": 5.9866},
    {"name": "Total Tankstelle Weert-Moesel", "lat": 51.2371, "lon": 5.7282},
    {"name": "Esso Tankstelle Sittard-Oost", "lat": 51.0013, "lon": 5.8843},
    {"name": "Shell Tankstelle Heerlen-Meezenbroek", "lat": 50.8831, "lon": 5.9923},
    {"name": "Jet Tankstelle Assen-Peelo", "lat": 52.9994, "lon": 6.5591},
    {"name": "Aral Tankstelle Drachten-Drachtstercompagnie", "lat": 53.1117, "lon": 6.1498},
    {"name": "BP Tankstelle Hoogeveen-Wolfsbos", "lat": 52.7147, "lon": 6.4866},
    {"name": "Shell Tankstelle Meppel-Koedijk", "lat": 52.6892, "lon": 6.1979},
    {"name": "Total Tankstelle Harderwijk-Drielanden", "lat": 52.3485, "lon": 5.6415},
    {"name": "Esso Tankstelle Almere-Muziekwijk", "lat": 52.3753, "lon": 5.1881},
    {"name": "Jet Tankstelle Lelystad-Zuiderzeewijk", "lat": 52.5050, "lon": 5.4742},
    {"name": "OMV Tankstelle Alkmaar-Oudorp", "lat": 52.6492, "lon": 4.7583},
    {"name": "Shell Tankstelle Hoorn-Blokker", "lat": 52.6624, "lon": 5.0779},
    {"name": "BP Tankstelle Zaandam-Westerwatering", "lat": 52.4540, "lon": 4.8025},
    {"name": "Aral Tankstelle Schiphol-Hoofddorp", "lat": 52.3054, "lon": 4.6800},
    {"name": "Total Tankstelle Alphen aan den Rijn-Ridderveld", "lat": 52.1298, "lon": 4.6593},
    {"name": "Esso Tankstelle Gouda-Goverwelle", "lat": 52.0218, "lon": 4.7418},
    {"name": "Jet Tankstelle Delft-Buitenhof", "lat": 52.0119, "lon": 4.3534},
    {"name": "Shell Tankstelle Schiedam-Groenoord", "lat": 51.9282, "lon": 4.3891},
    {"name": "OMV Tankstelle Spijkenisse-Vriesland", "lat": 51.8432, "lon": 4.3234},
    {"name": "Aral Tankstelle Middelburg-Dauwendaele", "lat": 51.5038, "lon": 3.5955},
    {"name": "BP Tankstelle Vlissingen-Oost", "lat": 51.4521, "lon": 3.6302},
    {"name": "Total Tankstelle Bergen op Zoom-Oud Gastel", "lat": 51.5021, "lon": 4.2982},
    {"name": "Shell Tankstelle Roosendaal-Tolberg", "lat": 51.5263, "lon": 4.4773},
    {"name": "Esso Tankstelle Oosterhout-Oosterheide", "lat": 51.6343, "lon": 4.8710},
    {"name": "Jet Tankstelle Gorinchem-Haarwijk", "lat": 51.8346, "lon": 4.9760},
    {"name": "Aral Tankstelle Tiel-Drumpt", "lat": 51.8945, "lon": 5.4484},
    {"name": "OMV Tankstelle Wageningen-Nude", "lat": 51.9687, "lon": 5.6539},
    {"name": "Shell Tankstelle Veenendaal-Dragonder", "lat": 52.0327, "lon": 5.5722},
    {"name": "BP Tankstelle Barneveld-Voorthuizen", "lat": 52.1901, "lon": 5.6071},
    {"name": "Total Tankstelle Ede-Kernhem", "lat": 52.0560, "lon": 5.6622},
    {"name": "Esso Tankstelle Doetinchem-Gaanderen", "lat": 51.9494, "lon": 6.3233},
    {"name": "Jet Tankstelle Zutphen-Warnsveld", "lat": 52.1553, "lon": 6.2234},
    {"name": "Shell Tankstelle Winterswijk-Miste", "lat": 51.9727, "lon": 6.7191},
    {"name": "Aral Tankstelle Lingen-Bramsche", "lat": 52.5178, "lon": 7.3521},
    {"name": "BP Tankstelle Nordhorn-Blanke", "lat": 52.4273, "lon": 7.0831},
    {"name": "Total Tankstelle Rheine-Mesum", "lat": 52.2856, "lon": 7.4438},
    {"name": "Shell Tankstelle Gronau-Epe", "lat": 52.2281, "lon": 7.0558},
    {"name": "Esso Tankstelle Stockholm-Liljeholmen", "lat": 59.3082, "lon": 18.0191},
    {"name": "Jet Tankstelle Stockholm-Kungsholmen", "lat": 59.3338, "lon": 18.0286},
    {"name": "OMV Tankstelle Stockholm-Södermalm", "lat": 59.3158, "lon": 18.0704},
    {"name": "Aral Tankstelle Göteborg-Hisingen", "lat": 57.7268, "lon": 11.9396},
    {"name": "Shell Tankstelle Göteborg-Frölunda", "lat": 57.6678, "lon": 11.9266},
    {"name": "BP Tankstelle Göteborg-Angered", "lat": 57.7942, "lon": 12.0423},
    {"name": "Total Tankstelle Malmö-Rosengård", "lat": 55.5847, "lon": 13.0341},
    {"name": "Esso Tankstelle Malmö-Limhamn", "lat": 55.5639, "lon": 12.9355},
    {"name": "Jet Tankstelle Malmö-Husie", "lat": 55.5878, "lon": 13.0884},
    {"name": "Shell Tankstelle Helsingborg-Dalhem", "lat": 56.0524, "lon": 12.7133},
    {"name": "OMV Tankstelle Uppsala-Gottsunda", "lat": 59.8239, "lon": 17.6076},
    {"name": "BP Tankstelle Västerås-Råby", "lat": 59.6105, "lon": 16.5285},
    {"name": "Aral Tankstelle Örebro-Brickeberg", "lat": 59.2728, "lon": 15.2108},
    {"name": "Total Tankstelle Linköping-Ryd", "lat": 58.4135, "lon": 15.6211},
    {"name": "Esso Tankstelle Norrköping-Marielund", "lat": 58.6057, "lon": 16.1987},
    {"name": "Jet Tankstelle Jönköping-Råslätt", "lat": 57.7540, "lon": 14.1614},
    {"name": "Shell Tankstelle Växjö-Araby", "lat": 56.8742, "lon": 14.7994},
    {"name": "BP Tankstelle Kalmar-Norrliden", "lat": 56.6769, "lon": 16.3614},
    {"name": "OMV Tankstelle Sundsvall-Skönsberg", "lat": 62.3859, "lon": 17.2953},
    {"name": "Aral Tankstelle Umeå-Ålidhem", "lat": 63.8332, "lon": 20.2855},
    {"name": "Total Tankstelle Luleå-Björkskatan", "lat": 65.5912, "lon": 22.1693},
    {"name": "Esso Tankstelle Gävle-Sätra", "lat": 60.6608, "lon": 17.1288},
    {"name": "Shell Tankstelle Borås-Hulta", "lat": 57.7182, "lon": 13.0015},
    {"name": "Jet Tankstelle Eskilstuna-Skiftinge", "lat": 59.3609, "lon": 16.5097},
    {"name": "OMV Tankstelle Södertälje-Brunnsäng", "lat": 59.1862, "lon": 17.6412},
    {"name": "BP Tankstelle Halmstad-Vallås", "lat": 56.6876, "lon": 12.8831},
    {"name": "Aral Tankstelle Karlstad-Kronoparken", "lat": 59.4119, "lon": 13.5154},
    {"name": "Total Tankstelle Trollhättan-Lextorp", "lat": 58.2886, "lon": 12.2963},
    {"name": "Shell Tankstelle Skövde-Norrmalm", "lat": 58.3993, "lon": 13.8627},
    {"name": "Esso Tankstelle Falun-Hälsinggård", "lat": 60.6108, "lon": 15.6503},
    {"name": "Jet Tankstelle Borlänge-Jakobsgårdarna", "lat": 60.4738, "lon": 15.4209},
    {"name": "Total Tankstelle Paris-Belleville", "lat": 48.8694, "lon": 2.3736},
    {"name": "BP Tankstelle Paris-Montparnasse", "lat": 48.8424, "lon": 2.3177},
    {"name": "Shell Tankstelle Lyon-Villeurbanne", "lat": 45.7769, "lon": 4.8902},
    {"name": "Aral Tankstelle Lyon-Vaise", "lat": 45.7741, "lon": 4.8044},
    {"name": "Esso Tankstelle Marseille-Saint-Barthélemy", "lat": 43.3303, "lon": 5.3965},
    {"name": "Jet Tankstelle Toulouse-Minimes", "lat": 43.6208, "lon": 1.4582},
    {"name": "OMV Tankstelle Bordeaux-Mériadeck", "lat": 44.8355, "lon": -0.5866},
    {"name": "Total Tankstelle Nantes-Doulon", "lat": 47.2228, "lon": -1.5157},
    {"name": "Shell Tankstelle Strasbourg-Neuhof", "lat": 48.5513, "lon": 7.7752},
    {"name": "BP Tankstelle Lille-Fives", "lat": 50.6467, "lon": 3.0908},
    {"name": "Aral Tankstelle Nice-Fabron", "lat": 43.7054, "lon": 7.2354},
    {"name": "Esso Tankstelle Rennes-Villejean", "lat": 48.1261, "lon": -1.7016},
    {"name": "Jet Tankstelle Reims-Croix-Rouge", "lat": 49.2644, "lon": 4.0433},
    {"name": "OMV Tankstelle Le Havre-Graville", "lat": 49.5058, "lon": 0.1401},
    {"name": "Total Tankstelle Montpellier-Mosson", "lat": 43.6163, "lon": 3.8168},
    {"name": "Shell Tankstelle Grenoble-Mistral", "lat": 45.1711, "lon": 5.7180},
    {"name": "BP Tankstelle Dijon-Fontaine d'Ouche", "lat": 47.3098, "lon": 5.0024},
    {"name": "Aral Tankstelle Nîmes-Pissevin", "lat": 43.8387, "lon": 4.3419},
    {"name": "Esso Tankstelle Clermont-Ferrand-La Gauthière", "lat": 45.7840, "lon": 3.1264},
    {"name": "Jet Tankstelle Le Mans-Bellevue", "lat": 48.0043, "lon": 0.1978},
    {"name": "OMV Tankstelle Amiens-Etouvie", "lat": 49.9089, "lon": 2.2750},
    {"name": "Shell Tankstelle Caen-La Folie Couvrechef", "lat": 49.2013, "lon": -0.3854},
    {"name": "BP Tankstelle Orléans-La Source", "lat": 47.8672, "lon": 1.9275},
    {"name": "Aral Tankstelle Tours-Fontaines", "lat": 47.3881, "lon": 0.7198},
    {"name": "Total Tankstelle Metz-Bellecroix", "lat": 49.0989, "lon": 6.1937},
    {"name": "Esso Tankstelle Nancy-Haussonville", "lat": 48.6989, "lon": 6.1618},
    {"name": "Jet Tankstelle Mulhouse-Dornach", "lat": 47.7352, "lon": 7.3577},
    {"name": "OMV Tankstelle Besançon-Planoise", "lat": 47.2303, "lon": 5.9827},
    {"name": "Shell Tankstelle Rouen-Sotteville", "lat": 49.4107, "lon": 1.0867},
    {"name": "BP Tankstelle Toulon-La Beaucaire", "lat": 43.1277, "lon": 5.9361},
    {"name": "Aral Tankstelle Angers-Belle-Beille", "lat": 47.4801, "lon": -0.5847},
    {"name": "Total Tankstelle Limoges-Beaubreuil", "lat": 45.8681, "lon": 1.2808},
    {"name": "Esso Tankstelle Saint-Étienne-Montreynaud", "lat": 45.4540, "lon": 4.3980},
    {"name": "Jet Tankstelle Villeurbanne-Gratte-Ciel", "lat": 45.7700, "lon": 4.8880},
    {"name": "Shell Tankstelle Aix-en-Provence-Les Milles", "lat": 43.4994, "lon": 5.3633},
    {"name": "BP Tankstelle Perpignan-Saint-Martin", "lat": 42.7024, "lon": 2.9169},
    {"name": "Aral Tankstelle Brest-Lambézellec", "lat": 48.4181, "lon": -4.4814},
    {"name": "Total Tankstelle Poitiers-Les Couronneries", "lat": 46.5793, "lon": 0.3434},
    {"name": "Esso Tankstelle Champagne-Marne", "lat": 49.0440, "lon": 4.0242},
    {"name": "Jet Tankstelle Valenciennes-Acacias", "lat": 50.3565, "lon": 3.5302},
    {"name": "Shell Tankstelle Dunkerque-Petite Synthe", "lat": 51.0345, "lon": 2.3278},
    {"name": "BP Tankstelle Calais-Beau Marais", "lat": 50.9561, "lon": 1.8692},
    {"name": "Aral Tankstelle Boulogne-sur-Mer-Saint-Martin", "lat": 50.7255, "lon": 1.6059},
    {"name": "OMV Tankstelle Pau-Ousse-Suzan", "lat": 43.2957, "lon": -0.3791},
    {"name": "Total Tankstelle Bayonne-Saint-Pierre d'Irube", "lat": 43.4813, "lon": -1.4819},
    {"name": "Shell Tankstelle Avignon-Monclar", "lat": 43.9446, "lon": 4.8220},
    {"name": "Esso Tankstelle Montauban-Sapiac", "lat": 44.0268, "lon": 1.3667},
    {"name": "Jet Tankstelle Béziers-La Devèze", "lat": 43.3427, "lon": 3.2150},
    {"name": "OMV Tankstelle Arles-Barriol", "lat": 43.6786, "lon": 4.6381},
    {"name": "BP Tankstelle Fréjus-Saint-Aygulf", "lat": 43.4056, "lon": 6.7456},
    {"name": "Aral Tankstelle Cannes-Le Cannet", "lat": 43.5841, "lon": 7.0220},
    {"name": "Total Tankstelle Antibes-Les Combes", "lat": 43.5838, "lon": 7.1190},
    {"name": "Esso Tankstelle Ajaccio-Jardins de l'Empereur", "lat": 41.9139, "lon": 8.7327},
    {"name": "Jet Tankstelle Bastia-Toga", "lat": 42.7100, "lon": 9.4611},
    {"name": "Shell Tankstelle Chartres-Rechèvres", "lat": 48.4548, "lon": 1.5169},
    {"name": "BP Tankstelle Bourges-Asnières", "lat": 47.0768, "lon": 2.3787},
    {"name": "Aral Tankstelle Auxerre-La Chaîne", "lat": 47.8063, "lon": 3.5751},
    {"name": "OMV Tankstelle Troyes-Champfleury", "lat": 48.2845, "lon": 4.0824},
    {"name": "Total Tankstelle Chalons-en-Champagne-Comtes", "lat": 48.9576, "lon": 4.3571},
    {"name": "Shell Tankstelle Évreux-Nétreville", "lat": 49.0223, "lon": 1.1473},
    {"name": "Esso Tankstelle Laval-Saint-Nicolas", "lat": 48.0818, "lon": -0.7557},
    {"name": "Jet Tankstelle Saint-Brieuc-Plérin", "lat": 48.5299, "lon": -2.7313},
    {"name": "BP Tankstelle Lorient-Kerfichant", "lat": 47.7472, "lon": -3.3710},
    {"name": "Aral Tankstelle Quimper-Penhars", "lat": 47.9810, "lon": -4.1041},
    {"name": "Total Tankstelle Vannes-Tohannic", "lat": 47.6564, "lon": -2.7601},
    {"name": "OMV Tankstelle Saint-Nazaire-Trignac", "lat": 47.3023, "lon": -2.1580},
    {"name": "Shell Tankstelle La Rochelle-Mireuil", "lat": 46.1659, "lon": -1.1698},
    {"name": "Esso Tankstelle Angoulême-Ma Campagne", "lat": 45.6471, "lon": 0.1438},
    {"name": "Jet Tankstelle Périgueux-La Chapelle-Gonaguet", "lat": 45.1939, "lon": 0.6839},
    {"name": "BP Tankstelle Brive-la-Gaillarde-Tujac", "lat": 45.1509, "lon": 1.5310},
    {"name": "Aral Tankstelle Aurillac-La Jordanne", "lat": 44.9261, "lon": 2.4432},
    {"name": "Total Tankstelle Moulins-Yzeure", "lat": 46.5571, "lon": 3.3581},
    {"name": "Shell Tankstelle Vichy-Abrest", "lat": 46.1042, "lon": 3.4413},
    {"name": "Esso Tankstelle Chalon-sur-Saône-Saint-Jean-des-Vignes", "lat": 46.7832, "lon": 4.8538},
    {"name": "Jet Tankstelle Mâcon-Sancé", "lat": 46.3071, "lon": 4.8319},
    {"name": "OMV Tankstelle Bourg-en-Bresse-Viriat", "lat": 46.2213, "lon": 5.2373},
    {"name": "BP Tankstelle Valence-Fontbarlettes", "lat": 44.9469, "lon": 4.8994},
    {"name": "Aral Tankstelle Montélimar-Meysse", "lat": 44.6134, "lon": 4.8112},
    {"name": "Shell Tankstelle Orange-Codolet", "lat": 44.1357, "lon": 4.8012},
    {"name": "Total Tankstelle Salon-de-Provence-Lançon", "lat": 43.6391, "lon": 5.1108},
    {"name": "Esso Tankstelle Draguignan-La Foux", "lat": 43.5408, "lon": 6.4655},
    {"name": "Jet Tankstelle Grasse-Saint-Jacques", "lat": 43.6655, "lon": 6.9297},
    {"name": "Shell Tankstelle Mandelieu-la-Napoule-Centre", "lat": 43.5487, "lon": 6.9396},
    {"name": "BP Tankstelle Saint-Raphaël-Boulouris", "lat": 43.4255, "lon": 6.8012},
    {"name": "Aral Tankstelle Hyères-Costebelle", "lat": 43.1170, "lon": 6.1509},
    {"name": "Total Tankstelle Bandol-Sanary", "lat": 43.1371, "lon": 5.7561},
    {"name": "Esso Tankstelle Aubagne-Les Passons", "lat": 43.2921, "lon": 5.5931},
    {"name": "Jet Tankstelle Martigues-Croix-Sainte", "lat": 43.4051, "lon": 5.0672},
    {"name": "OMV Tankstelle Istres-Le Tubé", "lat": 43.5139, "lon": 4.9896},
    {"name": "Shell Tankstelle Vitrolles-Les Estroublans", "lat": 43.4602, "lon": 5.2481},
    {"name": "BP Tankstelle Miramas-Entressen", "lat": 43.5838, "lon": 5.0073},
    {"name": "Aral Tankstelle Apt-Gargas", "lat": 43.8768, "lon": 5.3951},
    {"name": "Total Tankstelle Carpentras-Serres", "lat": 44.0545, "lon": 5.0605},
    {"name": "Esso Tankstelle Cavaillon-Plan de Cavaillon", "lat": 43.8472, "lon": 5.0424},
    {"name": "Jet Tankstelle L'Isle-sur-la-Sorgue-Saumane", "lat": 43.9214, "lon": 5.0507},
    {"name": "Shell Tankstelle Pertuis-Peyrolles", "lat": 43.7051, "lon": 5.5088},
    {"name": "BP Tankstelle Manosque-Les Iscles", "lat": 43.8321, "lon": 5.7936},
    {"name": "Aral Tankstelle Digne-les-Bains-Les Thuiles", "lat": 44.0986, "lon": 6.2289},
    {"name": "Total Tankstelle Gap-La Pépinière", "lat": 44.5654, "lon": 6.0847},
    {"name": "Esso Tankstelle Embrun-Saint-Marcellin", "lat": 44.5633, "lon": 6.4951},
    {"name": "Jet Tankstelle Briançon-Sainte-Catherine", "lat": 44.9033, "lon": 6.6403},
    {"name": "OMV Tankstelle Moûtiers-Salins-les-Thermes", "lat": 45.4867, "lon": 6.5271},
    {"name": "Shell Tankstelle Bourg-Saint-Maurice-Les Arcs", "lat": 45.6153, "lon": 6.7713},
    {"name": "BP Tankstelle Albertville-Conflans", "lat": 45.6718, "lon": 6.3912},
    {"name": "Aral Tankstelle Chambéry-Bissy", "lat": 45.5723, "lon": 5.9341},
    {"name": "Total Tankstelle Aix-les-Bains-Centre", "lat": 45.6903, "lon": 5.9124},
    {"name": "Esso Tankstelle Annecy-Novel", "lat": 45.9163, "lon": 6.1341},
    {"name": "Jet Tankstelle Thonon-les-Bains-Vongy", "lat": 46.3604, "lon": 6.4935},
    {"name": "Shell Tankstelle Evian-les-Bains-Centre", "lat": 46.4020, "lon": 6.5893},
    {"name": "OMV Tankstelle Cluses-Scionzier", "lat": 46.0600, "lon": 6.5741},
    {"name": "BP Tankstelle Sallanches-Domancy", "lat": 45.9335, "lon": 6.6330},
    {"name": "Aral Tankstelle Chamonix-Les Bossons", "lat": 45.9202, "lon": 6.8776},
    {"name": "Total Tankstelle Megève-Giettaz", "lat": 45.8570, "lon": 6.6197},
    {"name": "Esso Tankstelle Saint-Gervais-les-Bains-Le Fayet", "lat": 45.9087, "lon": 6.7098},
    {"name": "Jet Tankstelle Morzine-Avoriaz", "lat": 46.1785, "lon": 6.7097},
    {"name": "Shell Tankstelle Les Gets-Centre", "lat": 46.1574, "lon": 6.6659},
    {"name": "BP Tankstelle Samoëns-Centre", "lat": 46.0835, "lon": 6.7192},
    {"name": "Aral Tankstelle Taninges-Mieussy", "lat": 46.1098, "lon": 6.5916},
]

# ---------------------------------------------------------------------------
# Brandstofdata — Bio-CNG (OG Clean Fuels) vs Diesel
# Bron verbruik/CO₂: "Kopie van Kopieci.xlsx" — Visualisation (EN)
# Bron prijzen diesel: EC Weekly Oil Bulletin (feb 2026)
# Bron prijzen CNG: OG Clean Fuels tarieven 2026
# ---------------------------------------------------------------------------

# Verbruik per 100 km (vrachtwagen)
CNG_VERBRUIK_KG_PER_100KM    = 30.0   # kg/100km
DIESEL_VERBRUIK_L_PER_100KM  = 33.0   # liter/100km

# CO₂-emissie per 100 km
# Bio-CNG OG Clean Fuels is CO₂-negatief (CI-score: -102 gCO₂e/MJ)
CO2_CNG_KG_PER_100KM         = -153.0   # kgCO₂e/100km (negatief = CO₂-positief)
CO2_DIESEL_KG_PER_100KM      =  111.79  # kgCO₂/100km

# CNG-prijzen OG Clean Fuels (€/kg)
# Zweden: 30.29 SEK/kg ÷ koers 11.3 SEK/€ ≈ €2.68/kg
CNG_PRIJS = {
    "🇳🇱 Nederland": 1.620,
    "🇩🇪 Duitsland":  1.499,
    "🇫🇷 Frankrijk":  1.754,
    "🇮🇹 Italië":     1.429,
    "🇸🇪 Zweden":     round(30.29 / 11.3, 3),  # ≈ €2.68/kg
}

# Dieselprijzen feb 2026 incl. BTW + accijns (€/liter)
DIESEL_PRIJS = {
    "🇳🇱 Nederland": 1.873,
    "🇩🇪 Duitsland":  1.720,
    "🇫🇷 Frankrijk":  1.640,
    "🇮🇹 Italië":     1.640,
    "🇸🇪 Zweden":     1.740,
}

LANDEN = list(CNG_PRIJS.keys())


# Landcodes (Nominatim) → sleutel in CNG_PRIJS / DIESEL_PRIJS
COUNTRY_CODE_MAP = {
    "nl": "🇳🇱 Nederland",
    "de": "🇩🇪 Duitsland",
    "fr": "🇫🇷 Frankrijk",
    "it": "🇮🇹 Italië",
    "se": "🇸🇪 Zweden",
}


def bereken_brandstof_per_route(
    tankevents: list,
    cng_prijs_override: dict | None = None,
) -> dict:
    """
    tankevents: list van {"label": str, "land": str|None, "segment_km": float}
    Elk event = één tankbeurt op een locatie die een bepaald segment dekt.
    land=None → gemiddelde van alle landen als fallback.
    cng_prijs_override: optioneel dict met aangepaste CNG-prijzen (vaste prijs of korting).
    """
    _cng = cng_prijs_override if cng_prijs_override is not None else CNG_PRIJS
    gem_cng_p    = sum(_cng.values())         / len(_cng)
    gem_diesel_p = sum(DIESEL_PRIJS.values()) / len(DIESEL_PRIJS)

    totaal_cng    = 0.0
    totaal_diesel = 0.0
    totaal_co2_cng    = 0.0
    totaal_co2_diesel = 0.0
    details = []

    for ev in tankevents:
        land = ev["land"]
        km   = ev["segment_km"]
        cng_p    = _cng.get(land,    gem_cng_p)    if land else gem_cng_p
        diesel_p = DIESEL_PRIJS.get(land, gem_diesel_p) if land else gem_diesel_p

        cng_kg   = km / 100 * CNG_VERBRUIK_KG_PER_100KM
        diesel_l = km / 100 * DIESEL_VERBRUIK_L_PER_100KM
        cng_k    = cng_kg   * cng_p
        diesel_k = diesel_l * diesel_p
        co2_c    = km / 100 * CO2_CNG_KG_PER_100KM
        co2_d    = km / 100 * CO2_DIESEL_KG_PER_100KM

        totaal_cng        += cng_k
        totaal_diesel     += diesel_k
        totaal_co2_cng    += co2_c
        totaal_co2_diesel += co2_d

        details.append({
            "label":         ev["label"],
            "land":          land or "Onbekend (gem.)",
            "segment_km":    km,
            "cng_kg":        cng_kg,
            "diesel_l":      diesel_l,
            "cng_kosten":    cng_k,
            "diesel_kosten": diesel_k,
            "cng_prijs":     cng_p,
            "diesel_prijs":  diesel_p,
            "co2_cng":       co2_c,
            "co2_diesel":    co2_d,
        })

    besparing    = totaal_diesel - totaal_cng
    co2_voordeel = totaal_co2_diesel - totaal_co2_cng

    return {
        "details":           details,
        "totaal_cng":        totaal_cng,
        "totaal_diesel":     totaal_diesel,
        "besparing":         besparing,
        "besparing_pct":     (besparing    / totaal_diesel     * 100) if totaal_diesel     else 0,
        "co2_cng":           totaal_co2_cng,
        "co2_diesel":        totaal_co2_diesel,
        "co2_voordeel":      co2_voordeel,
        "co2_voordeel_pct":  (co2_voordeel / totaal_co2_diesel * 100) if totaal_co2_diesel else 0,
    }


# ---------------------------------------------------------------------------
# Logo / Spark helpers
# ---------------------------------------------------------------------------
def _logo_b64() -> str:
    """Leest het officiële OG Clean Fuels logo (wit SVG) en geeft base64-string terug."""
    # Probeer eerst het logo uit de huisstijl-skill, dan de werkmap-versie
    for fname in ("logo_skill.svg", "logo.svg"):
        logo_path = os.path.join(os.path.dirname(__file__), fname)
        if os.path.exists(logo_path):
            try:
                with open(logo_path, "rb") as f:
                    return base64.b64encode(f.read()).decode()
            except Exception:
                pass
    return ""


def _spark_b64() -> str:
    """Leest spark.svg (PNG-data) en geeft base64-string terug voor kaartmarkers."""
    # spark.svg bevat PNG-binaire data
    for fname in ("spark.svg", "Alleen spark.png"):
        spark_path = os.path.join(os.path.dirname(__file__), fname)
        if os.path.exists(spark_path):
            try:
                with open(spark_path, "rb") as f:
                    return base64.b64encode(f.read()).decode()
            except Exception:
                pass
    return ""


# ---------------------------------------------------------------------------
# Snelle haversine (vervangt geopy.geodesic voor interne berekeningen)
# ---------------------------------------------------------------------------
def _station_route_km(s: dict, coords: list, cum: list) -> float:
    """Geeft de cumulatieve km op het dichtstbijzijnde routepunt voor station s."""
    best_i = min(range(len(coords)), key=lambda i: _hav(s["lat"], s["lon"], coords[i][1], coords[i][0]))
    return cum[best_i]


def _hav(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine afstand in km — ~10× sneller dan geopy.geodesic."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# OSRM
# ---------------------------------------------------------------------------
OSRM_SERVER = "https://router.project-osrm.org"
OSRM_TIMEOUT = 25


@st.cache_data(ttl=3600, show_spinner=False)
def _osrm_route(waypoints: tuple) -> dict | None:
    coord_str = ";".join(f"{lon},{lat}" for lat, lon in waypoints)
    url = f"{OSRM_SERVER}/route/v1/driving/{coord_str}?overview=full&geometries=geojson"
    try:
        r = requests.get(url, timeout=OSRM_TIMEOUT)
        r.raise_for_status()
        data = r.json()
        if data.get("code") == "Ok" and data.get("routes"):
            return data["routes"][0]
    except requests.RequestException:
        pass
    return None


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------
NOMINATIM_UA = "og-routeplanner/2.0"
_geo_osm = RateLimiter(Nominatim(user_agent=NOMINATIM_UA, timeout=10).geocode,
                       min_delay_seconds=1, max_retries=2, error_wait_seconds=1.5)
_geo_photon = RateLimiter(Photon(user_agent=NOMINATIM_UA, timeout=10).geocode,
                          min_delay_seconds=0.5, max_retries=2, error_wait_seconds=1.0)
_geo_osm_rev = RateLimiter(Nominatim(user_agent=NOMINATIM_UA + "-rev", timeout=10).reverse,
                            min_delay_seconds=1, max_retries=2, error_wait_seconds=1.5)


@st.cache_data(ttl=24 * 3600, show_spinner=False)
def get_country(lat: float, lon: float) -> str | None:
    """Geeft de landnaam terug (zoals in CNG_PRIJS) via reverse geocoding."""
    try:
        loc = _geo_osm_rev((lat, lon), exactly_one=True, language="en")
        if loc:
            cc = loc.raw.get("address", {}).get("country_code", "").lower()
            return COUNTRY_CODE_MAP.get(cc)
    except Exception:
        pass
    return None


@st.cache_data(ttl=24 * 3600, show_spinner=False)
def geocode_address(address: str):
    addr = (address or "").strip()
    if not addr:
        return None
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$", addr)
    if m:
        return (float(m.group(1)), float(m.group(2)))
    for fn in (_geo_osm, _geo_photon):
        try:
            loc = fn(addr)
            if loc:
                return (loc.latitude, loc.longitude)
        except (GeocoderUnavailable, GeocoderTimedOut, GeocoderServiceError):
            pass
    return None


# ---------------------------------------------------------------------------
# Routelogica
# ---------------------------------------------------------------------------
def _corridor_stations(base_coords: list, corridor_km: float, station_list: list) -> list:
    lats = [c[1] for c in base_coords]
    lons = [c[0] for c in base_coords]
    margin = corridor_km / 100.0
    min_lat, max_lat = min(lats) - margin, max(lats) + margin
    min_lon, max_lon = min(lons) - margin, max(lons) + margin
    sampled = base_coords[::15]  # ~evenly sampled for polyline check

    result = []
    for s in station_list:
        if not (min_lat <= s["lat"] <= max_lat and min_lon <= s["lon"] <= max_lon):
            continue
        if min(_hav(s["lat"], s["lon"], c[1], c[0]) for c in sampled) <= corridor_km:
            result.append(s)
    return result


@st.cache_data(ttl=3600, show_spinner=False)
def plan_route(start: tuple, end: tuple, intermediate: tuple,
               interval_km: int, corridor_km: int) -> dict | None:
    base_wps = (start,) + intermediate + (end,)
    base = _osrm_route(base_wps)
    if base is None:
        return None

    coords = base["geometry"]["coordinates"]  # [[lon, lat], ...]

    # Cumulatieve afstand langs route (haversine, snel)
    cum = [0.0]
    for i in range(1, len(coords)):
        a, b = coords[i - 1], coords[i]
        cum.append(cum[-1] + _hav(a[1], a[0], b[1], b[0]))
    total_base = cum[-1]

    # Corridorstations — OG primair, concurrent als fallback
    # Annoteer elk station met zijn positie (km) langs de route
    og_stations_corridor = [
        {**s, "route_km": _station_route_km(s, coords, cum)}
        for s in _corridor_stations(coords, corridor_km, OG_STATIONS)
    ]
    cng_stations_corridor = [
        {**s, "route_km": _station_route_km(s, coords, cum)}
        for s in _corridor_stations(coords, corridor_km, CNG_STATIONS)
    ]

    # Selecteer stops op vaste intervallen — altijd voorwaarts langs de route
    stops: list[dict] = []
    used: set[str] = set()
    last_km = 0.0  # route_km van de laatste gekozen stop
    trigger = interval_km
    while trigger < total_base - 10:
        idx = min(range(len(cum)), key=lambda i: abs(cum[i] - trigger))
        pt = coords[idx]

        # Alleen stations die VOORUIT liggen ten opzichte van de vorige stop
        og_available = [
            s for s in og_stations_corridor
            if s["name"] not in used and s["route_km"] > last_km
        ]
        if og_available:
            best = min(og_available, key=lambda s: _hav(pt[1], pt[0], s["lat"], s["lon"]))
            stops.append({**best, "source": "og"})
            used.add(best["name"])
            last_km = best["route_km"]
        else:
            # Val terug op concurrent CNG-station (ook voorwaarts)
            cng_available = [
                s for s in cng_stations_corridor
                if s["name"] not in used and s["route_km"] > last_km
            ]
            if cng_available:
                best = min(cng_available, key=lambda s: _hav(pt[1], pt[0], s["lat"], s["lon"]))
                stops.append({**best, "source": "cng_concurrent"})
                used.add(best["name"])
                last_km = best["route_km"]
            else:
                stops.append({"name": "Geen CNG-station beschikbaar", "lat": pt[1], "lon": pt[0], "source": "missing"})
        trigger += interval_km

    # Definitieve route (alleen extra OSRM-call als er stops zijn)
    if stops:
        stop_coords = [(s["lat"], s["lon"]) for s in stops]
        interior = list(intermediate) + stop_coords
        interior.sort(key=lambda wp: _hav(start[0], start[1], wp[0], wp[1]))
        final_wps = tuple([start] + interior + [end])
        final = _osrm_route(final_wps) or base
    else:
        final = base

    final_coords = final["geometry"]["coordinates"]
    total_km = final.get("distance", 0) / 1000
    total_min = final.get("duration", 0) / 60

    return {
        "base_coords": coords,
        "final_coords": final_coords,
        "selected_stops": stops,
        "total_km": total_km,
        "total_min": total_min,
        "start": start,
        "end": end,
        "intermediate": list(intermediate),
        "cum_dists": cum,
    }


# ---------------------------------------------------------------------------
# Kaart
# ---------------------------------------------------------------------------
def build_map(result: dict) -> folium.Map:
    base_coords = result["base_coords"]
    final_coords = result["final_coords"]
    stops = result["selected_stops"]
    start = result["start"]
    end = result["end"]

    mid = final_coords[len(final_coords) // 2]
    m = folium.Map(location=[mid[1], mid[0]], zoom_start=6,
                   tiles="CartoDB positron", prefer_canvas=True)

    base_ll = [[c[1], c[0]] for c in base_coords]
    folium.PolyLine(base_ll, color="#555555", weight=2, dash_array="6 5",
                    tooltip=T("direct_route"), opacity=0.6).add_to(m)

    final_ll = [[c[1], c[0]] for c in final_coords]
    folium.PolyLine(final_ll, color="#F18700", weight=5,
                    tooltip=T("route_with_stops"), opacity=0.95).add_to(m)

    # Start / eind
    for loc, label, color, icon in [
        (start, T("start_map"), "darkgreen", "circle"),
        (end,   T("dest_map"),  "darkred",   "flag"),
    ]:
        folium.Marker([loc[0], loc[1]], tooltip=f"<b>{label}</b>",
                      icon=folium.Icon(color=color, icon=icon, prefix="fa")).add_to(m)

    # Tussenstops
    for i, wp in enumerate(result["intermediate"], 1):
        folium.Marker([wp[0], wp[1]], tooltip=f"<b>{T('intermediate_map', i=i)}</b>",
                      icon=folium.Icon(color="blue", icon="circle", prefix="fa")).add_to(m)

    # OG Spark icon (PNG ingebed als CustomIcon)
    spark_data = _spark_b64()
    _spark_icon_kwargs = (
        {"icon": folium.CustomIcon(
            f"data:image/png;base64,{spark_data}",
            icon_size=(38, 38), icon_anchor=(19, 19),
        )}
        if spark_data else {}
    )

    # Tankstations
    for i, s in enumerate(stops, 1):
        source = s.get("source", "og")
        if source == "og":
            # OG-station: gebruik Spark PNG als marker
            if spark_data:
                icon_obj = folium.CustomIcon(
                    f"data:image/png;base64,{spark_data}",
                    icon_size=(38, 38), icon_anchor=(19, 38),
                )
            else:
                icon_obj = folium.Icon(color="orange", icon="tint", prefix="fa")
            label_prefix = "OG"
        elif source == "cng_concurrent":
            icon_obj = folium.Icon(color="blue", icon="tint", prefix="fa")
            label_prefix = "CNG"
        else:
            icon_obj = folium.Icon(color="gray", icon="exclamation", prefix="fa")
            label_prefix = "⚠"

        folium.Marker(
            [s["lat"], s["lon"]],
            tooltip=f"<b>⛽ {label_prefix} Stop {i}</b><br>{s['name']}",
            popup=folium.Popup(
                f"<b>Stop {i}</b><br>{s['name']}<br>{s['lat']:.4f}, {s['lon']:.4f}",
                max_width=220),
            icon=icon_obj,
        ).add_to(m)

    all_ll = base_ll + [[s["lat"], s["lon"]] for s in stops]
    lats_all = [p[0] for p in all_ll]
    lons_all = [p[1] for p in all_ll]
    m.fit_bounds([[min(lats_all), min(lons_all)], [max(lats_all), max(lons_all)]])
    return m


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------
def build_csv(result: dict, route_name: str) -> bytes:
    start = result["start"]
    rows = [{"Naam": f"Start — {route_name}", "Lat": start[0], "Lon": start[1],
             "Afstand_km": 0.0}]
    for i, wp in enumerate(result["intermediate"], 1):
        rows.append({"Naam": f"Tussenstop {i}", "Lat": wp[0], "Lon": wp[1],
                     "Afstand_km": round(_hav(start[0], start[1], wp[0], wp[1]), 1)})
    for i, s in enumerate(result["selected_stops"], 1):
        rows.append({"Naam": f"Tankstop {i}: {s['name']}", "Lat": s["lat"], "Lon": s["lon"],
                     "Afstand_km": round(_hav(start[0], start[1], s["lat"], s["lon"]), 1)})
    end = result["end"]
    rows.append({"Naam": f"Bestemming — {route_name}", "Lat": end[0], "Lon": end[1],
                 "Afstand_km": round(result["total_km"], 1)})
    buf = io.StringIO()
    pd.DataFrame(rows).to_csv(buf, index=False)
    return buf.getvalue().encode("utf-8")


# ===========================================================================
# UI
# ===========================================================================

# ── Taalinitialisatie (moet vóór set_page_config staan) ─────────────────────
if "lang" not in st.session_state:
    st.session_state["lang"] = "nl"

st.set_page_config(
    page_title="OG Routeplanner",
    page_icon="⛽",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Global CSS — OG Clean Fuels huisstijl ───────────────────────────────────
# Kleuren per huisstijl.skill: Groen #13A538 · Oranje #F18700 · Tekst #1A1A1A
# Lettertype: Open Sans (Google Fonts fallback voor KOMU B)
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap');

/* ── Hoofdachtergrond: licht en clean ── */
[data-testid="stAppViewContainer"] {
    background: #f4f6f4;
    font-family: 'Open Sans', sans-serif;
}
[data-testid="stHeader"] { background: transparent; }
[data-testid="stMain"] { background: #f4f6f4; }

/* ── Sidebar: OG groen met witte tekst ── */
[data-testid="stSidebar"] {
    background: #13A538;
}
[data-testid="stSidebar"] * { color: #ffffff !important; }
[data-testid="stSidebar"] h1, [data-testid="stSidebar"] h2,
[data-testid="stSidebar"] h3 { color: #ffffff !important; font-weight: 700 !important; }

/* Inputs in sidebar — witte achtergrond, zwarte tekst */
[data-testid="stSidebar"] .stTextInput input,
[data-testid="stSidebar"] .stNumberInput input {
    background: #ffffff !important;
    border: 1px solid rgba(255,255,255,0.6) !important;
    border-radius: 6px !important;
    color: #1A1A1A !important;
}
[data-testid="stSidebar"] .stTextInput input::placeholder,
[data-testid="stSidebar"] .stNumberInput input::placeholder {
    color: #999999 !important;
}
[data-testid="stSidebar"] .stSelectbox > div > div {
    background: #ffffff !important;
    border: 1px solid rgba(255,255,255,0.6) !important;
    border-radius: 6px !important;
    color: #1A1A1A !important;
}
/* Taal-selectbox smal houden (alleen vlag) */
[data-testid="stSidebar"] .stSelectbox {
    max-width: 80px !important;
}

/* Sliders — oranje */
[data-testid="stSidebar"] .stSlider [data-baseweb="slider"] { margin-top: 4px; }
[data-testid="stSidebar"] [data-baseweb="slider"] [role="slider"] {
    background: #F18700 !important;
    border-color: #F18700 !important;
}
[data-testid="stSidebar"] [data-baseweb="slider"] div[data-testid="stSliderThumb"] {
    background: #F18700 !important;
}
[data-testid="stSidebar"] [data-baseweb="slider"] > div > div:nth-child(2) {
    background: #F18700 !important;
}
[data-testid="stSidebar"] .stRadio label { color: #ffffff !important; }
[data-testid="stSidebar"] hr { border-color: rgba(255,255,255,0.3) !important; }

/* ── Oranje primaire knop ── */
button[kind="primary"] {
    background: #F18700 !important;
    border: none !important;
    border-radius: 6px !important;
    font-weight: 700 !important;
    font-family: 'Open Sans', sans-serif !important;
    letter-spacing: 0.5px !important;
    color: #fff !important;
    box-shadow: 0 3px 10px rgba(241,135,0,.35) !important;
    transition: transform .15s, box-shadow .15s !important;
}
button[kind="primary"]:hover {
    background: #d97a00 !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 5px 16px rgba(241,135,0,.5) !important;
}

/* ── Metriekkaarten: wit met groene/oranje accenten ── */
.metric-row { display: flex; gap: 16px; margin: 20px 0 24px; flex-wrap: wrap; }
.metric-card {
    flex: 1; min-width: 140px;
    background: #ffffff;
    border: 1px solid #e0e8e0;
    border-radius: 10px;
    padding: 18px 20px;
    text-align: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.metric-card .icon { font-size: 1.6rem; margin-bottom: 6px; }
.metric-card .val  { font-size: 1.75rem; font-weight: 800; color: #13A538; line-height:1; }
.metric-card .lbl  { font-size: 0.72rem; color: #666666; margin-top: 5px; text-transform: uppercase; letter-spacing: .8px; }

/* ── Hero banner: groen vlak met wit logo en tekst ── */
.hero {
    background: #13A538;
    border-radius: 10px;
    padding: 28px 36px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 20px;
    box-shadow: 0 4px 16px rgba(19,165,56,.25);
}
.hero-title {
    font-size: 1.9rem;
    font-weight: 800;
    color: #ffffff;
    margin: 0;
    letter-spacing: 0.5px;
}
.hero-sub { font-size: 0.88rem; color: rgba(255,255,255,0.85); margin: 5px 0 0; }

/* ── Stop-kaartjes: wit met oranje accent ── */
.stop-card {
    background: #ffffff;
    border: 1px solid #e0e8e0;
    border-left: 4px solid #F18700;
    border-radius: 6px;
    padding: 14px 18px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.stop-badge {
    background: #F18700;
    color: #fff;
    font-weight: 700;
    font-size: .85rem;
    border-radius: 50%;
    width: 34px; height: 34px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
}
.stop-name  { color: #1A1A1A; font-weight: 600; font-size: .95rem; }
.stop-coord { color: #666666; font-size: .78rem; margin-top: 2px; }

/* ── Korting badge ── */
.discount-badge {
    display: inline-block;
    background: #13A538;
    color: #ffffff;
    font-size: .75rem;
    font-weight: 700;
    padding: 3px 12px;
    border-radius: 20px;
    margin-bottom: 10px;
    letter-spacing: .4px;
}

/* ── Divider ── */
hr { border-color: #d8e8d8 !important; }

/* ── Info/fout ── */
[data-testid="stAlert"] { border-radius: 6px !important; }

/* ── Algemene tekst: donker op lichte achtergrond ── */
p, li, label { color: #1A1A1A !important; }
h1, h2, h3 { color: #1A1A1A !important; font-weight: 700 !important; }
</style>
""", unsafe_allow_html=True)

# ── Sidebar ─────────────────────────────────────────────────────────────────
with st.sidebar:
    # ── Taalknop ────────────────────────────────────────────────────────────
    _cur_lang = st.session_state.get("lang", "nl")
    _lang_display = {v: k for k, v in LANG_OPTIONS.items()}
    _selected_lang = st.selectbox(
        "🌐",
        options=list(LANG_OPTIONS.values()),
        format_func=lambda x: _lang_display[x],
        index=list(LANG_OPTIONS.values()).index(_cur_lang),
        label_visibility="collapsed",
        key="lang_selector",
    )
    if _selected_lang != _cur_lang:
        st.session_state["lang"] = _selected_lang
        st.rerun()

    # ── Logo + titel ─────────────────────────────────────────────────────────
    _logo = _logo_b64()
    if _logo:
        st.markdown(
            f'<img src="data:image/svg+xml;base64,{_logo}" width="72" '
            f'style="margin:8px 0 4px;display:block">',
            unsafe_allow_html=True,
        )
    else:
        st.markdown("### ⛽")

    st.markdown(f"## {T('sidebar_title')}")
    st.markdown(f"<small>{T('sidebar_sub')}</small>", unsafe_allow_html=True)
    st.divider()

    # ── Route ────────────────────────────────────────────────────────────────
    st.markdown(f"**{T('route_section')}**")
    start_address = st.text_input(T("start_label"), placeholder=T("start_placeholder"))
    end_address   = st.text_input(T("end_label"),   placeholder=T("end_placeholder"))

    with st.expander(T("intermediate_section")):
        mid1 = st.text_input(T("intermediate_1"), placeholder="")
        mid2 = st.text_input(T("intermediate_2"), placeholder="")
        mid3 = st.text_input(T("intermediate_3"), placeholder="")

    # ── Instellingen ─────────────────────────────────────────────────────────
    st.markdown(f"**{T('settings_section')}**")
    interval_km = st.slider(T("interval_label"), 100, 500, 250, 25)
    corridor_km = st.slider(T("corridor_label"), 5, 200, 50, 5)
    route_name  = st.text_input(T("route_name_label"), value=T("route_name_default"))

    # ── Brandstofprijs / korting ──────────────────────────────────────────────
    st.divider()
    st.markdown(f"**{T('discount_section')}**")
    _discount_opts = [T("discount_none"), T("discount_fixed"), T("discount_pct")]
    _discount_choice = st.radio(
        "price_type",
        _discount_opts,
        index=0,
        label_visibility="collapsed",
        key="discount_radio",
    )
    _fixed_price: float | None = None
    _discount_pct_val: float | None = None

    if _discount_choice == T("discount_fixed"):
        _fixed_price = st.number_input(
            T("discount_fixed_label"),
            min_value=0.50, max_value=5.00, value=1.50,
            step=0.01, format="%.3f",
            key="fixed_price_input",
        )
    elif _discount_choice == T("discount_pct"):
        _discount_pct_val = st.number_input(
            T("discount_pct_label"),
            min_value=0.0, max_value=50.0, value=5.0,
            step=0.5, format="%.1f",
            key="discount_pct_input",
        )

    st.divider()
    generate_btn = st.button(T("generate_btn"), type="primary", use_container_width=True)

# ── Effectieve CNG-prijzen (na korting) ──────────────────────────────────────
effective_cng_prijs = dict(CNG_PRIJS)
_discount_label: str | None = None
if _fixed_price is not None:
    for _k in effective_cng_prijs:
        effective_cng_prijs[_k] = _fixed_price
    _discount_label = f"€ {_fixed_price:.3f}/kg"
elif _discount_pct_val is not None and _discount_pct_val > 0:
    for _k in effective_cng_prijs:
        effective_cng_prijs[_k] = round(effective_cng_prijs[_k] * (1 - _discount_pct_val / 100), 4)
    _discount_label = f"-{_discount_pct_val:.1f}%"

# ── Hero ────────────────────────────────────────────────────────────────────
_logo_hero = _logo_b64()
_logo_img = (
    f'<img src="data:image/svg+xml;base64,{_logo_hero}" width="60" style="flex-shrink:0">'
    if _logo_hero else '<span style="font-size:3rem">⛽</span>'
)
st.markdown(f"""
<div class="hero">
  {_logo_img}
  <div>
    <p class="hero-title">{T('hero_title')}</p>
    <p class="hero-sub">{T('hero_sub')}</p>
  </div>
</div>
""", unsafe_allow_html=True)

if not generate_btn:
    st.markdown(f"""
    <div style="background:#ffffff;border:1px solid #d8e8d8;border-radius:10px;
         padding:48px 32px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="font-size:2.5rem;margin-bottom:14px">👈</div>
      <div style="font-size:1.1rem;color:#444444;font-weight:600;">
        {T('welcome_text')} <b style="color:#F18700">{T('welcome_btn')}</b>
      </div>
    </div>
    """, unsafe_allow_html=True)
    st.stop()

# ── Geocoding & routing ──────────────────────────────────────────────────────
errors: list[str] = []

with st.spinner(T("geocoding_spinner")):
    start_coord = geocode_address(start_address) if start_address.strip() else None
    end_coord   = geocode_address(end_address)   if end_address.strip()   else None

if not start_coord:
    errors.append(T("err_start", addr=start_address))
if not end_coord:
    errors.append(T("err_end", addr=end_address))

intermediate_coords: list[tuple] = []
for i, addr in enumerate([mid1, mid2, mid3], 1):
    if addr and addr.strip():
        with st.spinner(f"{T('geocoding_spinner')} ({i})"):
            c = geocode_address(addr)
        if c:
            intermediate_coords.append(c)
        else:
            errors.append(T("err_intermediate", i=i, addr=addr))

for e in errors:
    st.error(e)
if not start_coord or not end_coord:
    st.stop()

with st.spinner(T("routing_spinner")):
    result = plan_route(
        start_coord, end_coord,
        tuple(intermediate_coords),
        interval_km, corridor_km,
    )

if result is None:
    st.error(T("err_route"))
    st.stop()

# ── Samenvattingskaarten ─────────────────────────────────────────────────────
stops    = result["selected_stops"]
n_stops  = len(stops)
total_km = result["total_km"]
total_min= result["total_min"]
hours    = int(total_min // 60)
mins     = int(total_min % 60)
avg_km   = round(total_km / (n_stops + 1)) if n_stops else round(total_km)

# Korting badge
if _discount_label:
    st.markdown(
        f'<div class="discount-badge">✓ {T("discount_applied", val=_discount_label)}</div>',
        unsafe_allow_html=True,
    )

st.markdown(f"""
<div class="metric-row">
  <div class="metric-card">
    <div class="icon">📏</div>
    <div class="val">{total_km:.0f} km</div>
    <div class="lbl">{T('metric_distance')}</div>
  </div>
  <div class="metric-card">
    <div class="icon">⏱️</div>
    <div class="val">{hours}u {mins}m</div>
    <div class="lbl">{T('metric_time')}</div>
  </div>
  <div class="metric-card">
    <div class="icon">⛽</div>
    <div class="val">{n_stops}</div>
    <div class="lbl">{T('metric_stops')}</div>
  </div>
  <div class="metric-card">
    <div class="icon">📍</div>
    <div class="val">{avg_km} km</div>
    <div class="lbl">{T('metric_interval')}</div>
  </div>
</div>
""", unsafe_allow_html=True)

# ── CO₂ & Kostenvergelijking (per land) ──────────────────────────────────────
fueling_locs = [{"label": "Vertrek", "lat": start_coord[0], "lon": start_coord[1], "route_km": 0.0}]
for i, s in enumerate(stops, 1):
    fueling_locs.append({
        "label": f"Stop {i} — {s['name']}",
        "lat": s["lat"], "lon": s["lon"],
        "route_km": s.get("route_km", i * interval_km),
    })

n_events = len(fueling_locs)
route_km_points = [loc["route_km"] for loc in fueling_locs] + [total_km]
segment_kms = [round(route_km_points[i + 1] - route_km_points[i], 1) for i in range(n_events)]

with st.spinner(T("country_spinner")):
    tankevents = []
    for i, loc in enumerate(fueling_locs):
        land = get_country(loc["lat"], loc["lon"])
        tankevents.append({"label": loc["label"], "land": land, "segment_km": segment_kms[i]})

bf = bereken_brandstof_per_route(tankevents, cng_prijs_override=effective_cng_prijs)

# ── Totaaloverzicht ────────────────────────────────────────────────────────────
besparing_str  = f"€ {bf['besparing']:,.0f}".replace(",", ".")
diesel_tot_str = f"€ {bf['totaal_diesel']:,.0f}".replace(",", ".")
cng_tot_str    = f"€ {bf['totaal_cng']:,.0f}".replace(",", ".")
co2_saved_ton  = bf["co2_voordeel"] / 1000
_OG_GREEN = "#13A538"

st.markdown(f"""
<hr style="border-color:#d8e8d8;margin:8px 0 20px"/>
<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
  <div style="font-size:1.5rem">🌿</div>
  <div style="font-size:1.1rem;font-weight:700;color:#1A1A1A;font-family:'Open Sans',sans-serif;">
    {T('cost_section_title')}
    <span style="font-size:.8rem;font-weight:400;color:#666666;margin-left:8px">
      {T('cost_section_sub')} · {total_km:.0f} km
    </span>
  </div>
</div>
<div class="metric-row">
  <div class="metric-card" style="border-top:3px solid {_OG_GREEN}">
    <div class="icon">💶</div>
    <div class="val" style="color:{_OG_GREEN}">{besparing_str}</div>
    <div class="lbl">{T('metric_savings')}</div>
  </div>
  <div class="metric-card" style="border-top:3px solid {_OG_GREEN}">
    <div class="icon">📉</div>
    <div class="val" style="color:{_OG_GREEN}">{bf['besparing_pct']:.0f}%</div>
    <div class="lbl">{T('metric_cheaper')}</div>
  </div>
  <div class="metric-card" style="border-top:3px solid {_OG_GREEN}">
    <div class="icon">🌍</div>
    <div class="val" style="color:{_OG_GREEN}">{co2_saved_ton:.1f} ton</div>
    <div class="lbl">{T('metric_co2')}</div>
  </div>
  <div class="metric-card" style="border-top:3px solid {_OG_GREEN}">
    <div class="icon">♻️</div>
    <div class="val" style="color:{_OG_GREEN}">{bf['co2_voordeel_pct']:.0f}%+</div>
    <div class="lbl">{T('metric_co2_pct')}</div>
  </div>
</div>
""", unsafe_allow_html=True)

# ── Per-stop uitsplitsing ──────────────────────────────────────────────────────
with st.expander(T("table_expander"), expanded=True):
    header = (
        f"<div style='display:grid;grid-template-columns:2fr 1.2fr .8fr 1fr 1fr 1fr;"
        f"gap:6px;padding:8px 12px;background:#F18700;border-radius:8px 8px 0 0;"
        f"font-size:.72rem;color:#ffffff;text-transform:uppercase;letter-spacing:.7px;"
        f"font-family:\"Barlow Condensed\",sans-serif;font-weight:700;'>"
        f"<div>{T('table_location')}</div><div>{T('table_country')}</div><div>{T('table_segment')}</div>"
        f"<div>{T('table_diesel')}</div><div>{T('table_biocng')}</div><div>{T('table_savings')}</div></div>"
    )
    rows_html = ""
    for ev in bf["details"]:
        bes = ev["diesel_kosten"] - ev["cng_kosten"]
        rows_html += (
            f"<div style='display:grid;grid-template-columns:2fr 1.2fr .8fr 1fr 1fr 1fr;"
            f"gap:6px;padding:8px 12px;border-bottom:1px solid #e8f0e8;"
            f"font-size:.82rem;color:#333333;background:#ffffff;'>"
            f"<div style='color:#1A1A1A;font-weight:600'>{ev['label']}</div>"
            f"<div style='color:#444444'>{ev['land']}</div>"
            f"<div style='color:#444444'>{ev['segment_km']:.0f} km</div>"
            f"<div style='color:#c0392b'>€ {ev['diesel_kosten']:.0f}<br>"
            f"<span style='font-size:.68rem;color:#999'>{ev['diesel_l']:.0f}L @ €{ev['diesel_prijs']:.3f}</span></div>"
            f"<div style='color:#F18700'>€ {ev['cng_kosten']:.0f}<br>"
            f"<span style='font-size:.68rem;color:#999'>{ev['cng_kg']:.0f}kg @ €{ev['cng_prijs']:.3f}</span></div>"
            f"<div style='color:{_OG_GREEN};font-weight:700'>€ {bes:.0f}</div>"
            f"</div>"
        )
    rows_html += (
        f"<div style='display:grid;grid-template-columns:2fr 1.2fr .8fr 1fr 1fr 1fr;"
        f"gap:6px;padding:10px 12px;background:#f0f8f2;border-radius:0 0 8px 8px;"
        f"font-size:.85rem;font-weight:700;color:#1A1A1A;'>"
        f"<div>{T('table_total')}</div><div></div><div>{total_km:.0f} km</div>"
        f"<div style='color:#c0392b'>{diesel_tot_str}</div>"
        f"<div style='color:#F18700'>{cng_tot_str}</div>"
        f"<div style='color:{_OG_GREEN}'>{besparing_str}</div>"
        f"</div>"
    )
    st.markdown(
        f"<div style='border:1px solid #d8e8d8;border-radius:9px;overflow:hidden;"
        f"margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06);'>{header}{rows_html}</div>",
        unsafe_allow_html=True,
    )

# ── Kaart ────────────────────────────────────────────────────────────────────
folium_map = build_map(result)
st_folium(folium_map, use_container_width=True, height=540, returned_objects=[])

# ── Stoplijst ────────────────────────────────────────────────────────────────
if stops:
    st.markdown(f"### {T('stops_header', n=n_stops)}")
    stop_html = ""
    for i, s in enumerate(stops, 1):
        source = s.get("source", "og")
        if source == "og":
            badge_color = "#F18700"
            name_prefix = ""
        elif source == "cng_concurrent":
            badge_color = "#4a90d9"
            name_prefix = "🔵 CNG — "
        else:
            badge_color = "#e57373"
            name_prefix = "⚠️ "
        dist = round(_hav(start_coord[0], start_coord[1], s["lat"], s["lon"]))
        stop_html += f"""
        <div class="stop-card" style="border-left-color:{badge_color}">
          <div class="stop-badge" style="background:{badge_color}">{i}</div>
          <div>
            <div class="stop-name">{name_prefix}{s['name']}</div>
            <div class="stop-coord">
              {s['lat']:.4f}, {s['lon']:.4f} &nbsp;·&nbsp; ca. {dist} {T('stop_km_from_start')}
            </div>
          </div>
        </div>"""
    st.markdown(stop_html, unsafe_allow_html=True)
else:
    st.info(T("no_stops"))

# ── CSV-download ─────────────────────────────────────────────────────────────
st.divider()
st.download_button(
    label=T("download_btn"),
    data=build_csv(result, route_name),
    file_name=f"{route_name.replace(' ', '_')}_route.csv",
    mime="text/csv",
)
