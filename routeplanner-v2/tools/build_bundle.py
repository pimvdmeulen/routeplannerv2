"""
Voegt de web-app (web/) samen tot één zelfstandig HTML-bestand.

    python tools/build_bundle.py              → dist/og-routeplanner.html
    python tools/build_bundle.py --config '{"routing":{"proxyUrl":"https://.../api"}}'

Alle CSS, JavaScript, stationsdata, het logo, de spark en het KOMU B-lettertype
worden ingesloten. Alleen MapLibre (cdnjs), Open Sans (Google Fonts), de
kaarttegels (OpenFreeMap) en de API's worden nog extern geladen.

Wordt ook door streamlit_app.py gebruikt (via build_html()).
"""

from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DIST = ROOT / "dist"

JS_ORDER = ["config", "stations", "fuel", "i18n", "geo", "services", "planner", "exporters", "mapview", "app"]


def _data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def build_html(config: dict | None = None) -> str:
    """Geeft de volledige app als één HTML-string. `config` wordt als window.OG_CONFIG ingevoegd."""
    html = (WEB / "index.html").read_text(encoding="utf-8")
    logo = _data_uri(WEB / "assets" / "logo.svg", "image/svg+xml")
    spark = _data_uri(WEB / "assets" / "spark.png", "image/png")
    font = _data_uri(WEB / "assets" / "fonts" / "komu-b.otf", "font/otf")

    css = (WEB / "css" / "app.css").read_text(encoding="utf-8")
    css = css.replace('url("../assets/fonts/komu-b.otf")', f'url("{font}")')
    html = html.replace('<link rel="stylesheet" href="css/app.css">', f"<style>\n{css}\n</style>")

    # losse scripts vervangen door één inline blok
    for name in JS_ORDER:
        html = html.replace(f'<script src="js/{name}.js"></script>\n', "")
    scripts = []
    for name in JS_ORDER:
        src = (WEB / "js" / f"{name}.js").read_text(encoding="utf-8")
        scripts.append(f"/* ---- {name}.js ---- */\n{src}")
    assets = f"window.OG_ASSETS = {json.dumps({'logo': logo, 'spark': spark})};"
    bundle = "\n".join([assets] + scripts).replace("</script", "<\\/script")
    cfg = ""
    if config:
        cfg = "<script>window.OG_CONFIG = " + json.dumps(config).replace("</", "<\\/") + ";</script>\n"
    html = html.replace("<!--bundle:config-->", cfg + "<script>\n" + bundle + "\n</script>")

    html = html.replace('src="assets/logo.svg"', f'src="{logo}"')
    html = html.replace('href="assets/spark.png"', f'href="{spark}"')
    html = html.replace("<!--bundle:fonts-->", "")
    assert not re.search(r'src="js/', html), "niet alle scripts zijn ingesloten"
    return html


if __name__ == "__main__":
    cfg = None
    if "--config" in sys.argv:
        cfg = json.loads(sys.argv[sys.argv.index("--config") + 1])
    DIST.mkdir(exist_ok=True)
    out = DIST / "og-routeplanner.html"
    out.write_text(build_html(cfg), encoding="utf-8")
    print(f"{out.relative_to(ROOT)} ({out.stat().st_size / 1024:.0f} kB)")
