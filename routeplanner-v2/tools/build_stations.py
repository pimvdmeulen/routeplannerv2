"""
Bouwt web/js/stations.js uit data/stations.csv.

De CSV is de bron van waarheid: open hem in Excel, pas stations aan en draai
daarna dit script opnieuw:

    python tools/build_stations.py

Eenmalig is de CSV gegenereerd uit de oude Python-lijsten met:

    python tools/build_stations.py --from-legacy

Kolommen in de CSV
------------------
type        og  = OG Clean Fuels-station, cng = ander (concurrent) CNG-station
country     ISO-landcode (NL, DE, FR, ...)
brand       merk/exploitant van de locatie (Shell, TAMOIL, OG Clean Fuels, ...)
city        plaatsnaam
bio         1 = Bio-CNG beschikbaar
unattended  1 = onbemand / automaat
card_only   1 = alleen met tankpas
depot       1 = bedrijfsterrein (beperkte toegang)
motorway    1 = langs de snelweg
lat, lon    WGS84-coördinaten
"""

from __future__ import annotations

import ast
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "stations.csv"
JS_PATH = ROOT / "web" / "js" / "stations.js"
LEGACY = ROOT / "_archief"

FIELDS = ["type", "country", "brand", "city", "bio", "unattended", "card_only",
          "depot", "motorway", "lat", "lon"]

SECTION_TO_CC = {
    "Nederland": "NL", "Duitsland": "DE", "België": "BE", "Frankrijk": "FR",
    "Spanje": "ES", "Zweden": "SE", "Denemarken": "DK", "Noorwegen": "NO",
    "Finland": "FI", "Oostenrijk": "AT", "Zwitserland": "CH", "Italië": "IT",
    "Tsjechië": "CZ", "Portugal": "PT", "Polen": "PL",
}


def _parse_legacy(path: Path, kind: str) -> list[dict]:
    """Leest een oude *_stations.py en gebruikt de '# Land'-commentaren als landcode."""
    rows, section = [], None
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("# ") and not s.startswith("# --") and "Bron" not in s and "Totaal" not in s:
            section = s[2:].strip()
            continue
        if not s.startswith("{"):
            continue
        d = ast.literal_eval(s.rstrip(","))
        cc = SECTION_TO_CC.get(section)
        if cc is None:  # sectie 'UNKNOWN' = Verenigd Koninkrijk en Ierland
            cc = "IE" if d["lon"] < -5.5 and d["lat"] < 54 else "GB"
        rows.append(_split_name(d["name"]) | {"type": kind, "country": cc,
                                               "lat": d["lat"], "lon": d["lon"]})
    return rows


def _split_name(name: str) -> dict:
    """'Shell BioCNG Tankstelle (Automat) OG Clean Fuels – Almere' → merk, plaats, kenmerken."""
    left, _, city = name.partition(" – ")
    m = re.match(r"^(.*?)\s+(Bio)?CNG\b", left)
    brand = (m.group(1) if m else left).strip() or "Onbekend"
    flags = " ".join(re.findall(r"\(([^)]*)\)", left))
    return {
        "brand": brand,
        "city": city.strip() or brand,
        "bio": int("BioCNG" in left),
        "unattended": int("Automat" in flags),
        "card_only": int("Tankkarte" in flags),
        "depot": int("Betriebshof" in left),
        "motorway": int("Autobahn" in left),
    }


def from_legacy() -> None:
    rows = _parse_legacy(LEGACY / "og_stations.py", "og") + _parse_legacy(LEGACY / "cng_stations.py", "cng")
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, delimiter=";")
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} stations geschreven naar {CSV_PATH.relative_to(ROOT)}")


def build() -> None:
    with CSV_PATH.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        rows = list(reader)

    out = []
    for i, r in enumerate(rows):
        flags = "".join(k for k, col in (("b", "bio"), ("u", "unattended"), ("k", "card_only"),
                                         ("d", "depot"), ("m", "motorway"))
                        if str(r.get(col, "0")).strip() in ("1", "true", "ja", "yes"))
        out.append([
            i,
            1 if r["type"].strip().lower() == "og" else 0,
            r["country"].strip().upper(),
            r["brand"].strip(),
            r["city"].strip(),
            flags,
            round(float(str(r["lat"]).replace(",", ".")), 6),
            round(float(str(r["lon"]).replace(",", ".")), 6),
        ])

    n_og = sum(1 for o in out if o[1])
    js = (
        "/* Automatisch gegenereerd door tools/build_stations.py uit data/stations.csv.\n"
        "   Niet met de hand bewerken: pas de CSV aan en draai het script opnieuw. */\n"
        "window.OG_STATION_ROWS = "
        + json.dumps(out, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    JS_PATH.write_text(js, encoding="utf-8")
    print(f"{len(out)} stations ({n_og} OG, {len(out) - n_og} overig) → {JS_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    if "--from-legacy" in sys.argv:
        from_legacy()
    build()
