"""
OG Routeplanner — API-proxy voor OpenRouteService (fase 2, Azure Functions, Python v2-model).

Houdt de ORS-sleutel op de server, zodat hij niet in de browser zichtbaar is.

Endpoints (onder /api):
    POST /api/route      body: {"profile": "driving-hgv", "body": {...ORS directions body...}}
    GET  /api/geocode    ?text=Leeuwarden

App settings:
    ORS_API_KEY       OpenRouteService-sleutel (verplicht)
    ALLOWED_ORIGINS   kommagescheiden lijst, bijv. "https://www.ogcleanfuels.com,https://routeplanner.ogcleanfuels.com"
                      (leeg = alles toestaan; alleen voor testen)
    MAX_WAYPOINTS     standaard 50

In de web-app: zet in config  routing.proxyUrl = "https://<functie-app>.azurewebsites.net/api"
"""

import json
import logging
import os

import azure.functions as func
import requests

ORS_BASE = "https://api.openrouteservice.org"
PROFILES = {"driving-hgv", "driving-car"}
TIMEOUT = 45

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


def _cors_headers(req: func.HttpRequest) -> dict:
    allowed = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    origin = req.headers.get("Origin", "")
    if not allowed:
        allow = "*"
    elif origin in allowed:
        allow = origin
    else:
        allow = allowed[0]
    return {
        "Access-Control-Allow-Origin": allow,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
    }


def _origin_ok(req: func.HttpRequest) -> bool:
    allowed = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    return not allowed or req.headers.get("Origin", "") in allowed


def _json(req: func.HttpRequest, data, status: int = 200) -> func.HttpResponse:
    return func.HttpResponse(json.dumps(data), status_code=status, mimetype="application/json", headers=_cors_headers(req))


def _key() -> str:
    key = os.getenv("ORS_API_KEY", "")
    if not key:
        raise RuntimeError("ORS_API_KEY ontbreekt in de app settings")
    return key


@app.route(route="route", methods=["POST", "OPTIONS"])
def route(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers(req))
    if not _origin_ok(req):
        return _json(req, {"error": {"message": "origin not allowed"}}, 403)
    try:
        payload = req.get_json()
        profile = payload.get("profile", "driving-hgv")
        body = payload["body"]
        coords = body["coordinates"]
    except (ValueError, KeyError, TypeError):
        return _json(req, {"error": {"message": "invalid request"}}, 400)
    if profile not in PROFILES:
        return _json(req, {"error": {"message": "unknown profile"}}, 400)
    if not (2 <= len(coords) <= int(os.getenv("MAX_WAYPOINTS", "50"))):
        return _json(req, {"error": {"message": "invalid number of waypoints"}}, 400)

    try:
        r = requests.post(
            f"{ORS_BASE}/v2/directions/{profile}/geojson",
            json=body,
            headers={"Authorization": _key(), "Accept": "application/geo+json, application/json"},
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        logging.warning("ORS niet bereikbaar: %s", exc)
        return _json(req, {"error": {"message": "routing service unavailable"}}, 502)
    return func.HttpResponse(r.content, status_code=r.status_code, mimetype="application/json", headers=_cors_headers(req))


@app.route(route="geocode", methods=["GET", "OPTIONS"])
def geocode(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers(req))
    if not _origin_ok(req):
        return _json(req, {"error": {"message": "origin not allowed"}}, 403)
    text = (req.params.get("text") or "").strip()
    if not 2 <= len(text) <= 200:
        return _json(req, {"error": {"message": "invalid text"}}, 400)
    try:
        r = requests.get(
            f"{ORS_BASE}/geocode/search",
            params={"api_key": _key(), "text": text, "size": 7},
            timeout=15,
        )
    except requests.RequestException as exc:
        logging.warning("ORS geocode niet bereikbaar: %s", exc)
        return _json(req, {"error": {"message": "geocoding unavailable"}}, 502)
    return func.HttpResponse(r.content, status_code=r.status_code, mimetype="application/json", headers=_cors_headers(req))
