"""
OG Routeplanner — Streamlit-host (fase 1).

De eigenlijke app staat in web/ (HTML/CSS/JS). Dit script voegt die samen tot één
pagina en toont hem schermvullend als Streamlit-component. Instellingen komen uit
.streamlit/secrets.toml (lokaal) of uit de Secrets van Streamlit Community Cloud:

    ORS_API_KEY = "..."           # OpenRouteService-sleutel (vrachtwagenroutes)
    INTERNAL = false              # true = interne modus altijd aan
    PUBLIC_URL = "https://og-routeplanner.streamlit.app"   # basis voor deellinks

Starten:
    pip install -r requirements.txt
    streamlit run streamlit_app.py

Waarom een component en geen components.html()?
    components.html() zet de pagina in een srcdoc-iframe met origin "null". MapLibre
    (de kaart) weigert dan stil alle berichten van zijn web workers en tekent niets.
    Een gedeclareerde component krijgt een echte URL op hetzelfde domein; daar werkt
    alles, en de app leest deellinks (?r=...) rechtstreeks uit de adresbalk.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

from tools.build_bundle import build_html

ROOT = Path(__file__).resolve().parent
BUILD_DIR = Path(tempfile.gettempdir()) / "og-routeplanner-component"

st.set_page_config(
    page_title="OG Routeplanner",
    page_icon=str(ROOT / "web" / "assets" / "spark.png"),
    layout="wide",
    initial_sidebar_state="collapsed",
)


def _secret(name: str, default=None):
    try:
        return st.secrets.get(name, default)
    except Exception:  # geen secrets.toml aanwezig
        return default


# Laat Streamlit weten dat het iframe klaar is en schermvullend mag zijn.
FRAME_SCRIPT = """
<script>
(function () {
  function send(type, extra) {
    var msg = Object.assign({ isStreamlitMessage: true, type: type }, extra || {});
    try { window.parent.postMessage(msg, '*'); } catch (e) {}
  }
  send('streamlit:componentReady', { apiVersion: 1 });
  function size() { send('streamlit:setFrameHeight', { height: Math.max(600, window.parent.innerHeight || 900) }); }
  size();
  window.addEventListener('resize', size);
  try { window.parent.addEventListener('resize', size); } catch (e) {}
})();
</script>
"""


def _write_component(config: dict) -> Path:
    """Schrijft de gebundelde app naar een tijdelijke map (alleen als er iets veranderd is)."""
    html = build_html(config).replace("</body>", FRAME_SCRIPT + "</body>")
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    target = BUILD_DIR / "index.html"
    if not target.exists() or hashlib.sha1(target.read_bytes()).hexdigest() != hashlib.sha1(html.encode()).hexdigest():
        target.write_text(html, encoding="utf-8")
    return BUILD_DIR


config = {
    "routing": {"orsKey": _secret("ORS_API_KEY", "") or ""},
    "internal": bool(_secret("INTERNAL", False)),
    "allowInternalParam": bool(_secret("ALLOW_INTERNAL_PARAM", True)),
    "publicUrl": _secret("PUBLIC_URL", "") or "",
}
og_routeplanner = components.declare_component("og_routeplanner", path=str(_write_component(config)))

# Streamlit-chrome verbergen en het component schermvullend maken.
st.markdown(
    """
    <style>
      header[data-testid="stHeader"], footer, #MainMenu, [data-testid="stToolbar"],
      [data-testid="stDecoration"], [data-testid="stStatusWidget"] { display: none !important; }
      .stApp, [data-testid="stAppViewContainer"], [data-testid="stMain"] { background: #EDEFEC; }
      @media (prefers-color-scheme: dark) { .stApp, [data-testid="stAppViewContainer"], [data-testid="stMain"] { background: #0E100F; } }
      .block-container, [data-testid="stMainBlockContainer"] { padding: 0 !important; max-width: 100% !important; }
      [data-testid="stVerticalBlock"] { gap: 0 !important; }
      .stApp iframe { height: 100vh !important; height: 100dvh !important; width: 100% !important; border: 0; display: block; }
    </style>
    """,
    unsafe_allow_html=True,
)

og_routeplanner(key="app", default=None)
