"""eCourts adapter behind LegalDataProvider.

Nothing about the external API is hard-coded here: the base URL, auth style, endpoint paths and the field
mapping all come from the admin's config (Settings > Legal data). This module only knows the *internal*
normalized shape it returns, which the sync service turns into Court / LegalCase / Party / Judgment rows.

Config shape (stored in LegalDataSource.config):
{
  "auth": {"header": "Authorization", "prefix": "Bearer "}    # or {"query_param": "api_key"}
  "endpoints": {                                              # any subset; missing ones raise NotConfigured
    "test":          {"method": "GET", "path": "/..."},
    "search_cases":  {"method": "GET", "path": "/...", "params": {"q": "{query}"}, "items_path": "data"},
    "get_case":      {"method": "GET", "path": "/.../{id}", "item_path": "data"},
    "get_orders":    {"method": "GET", "path": "/.../{id}/orders", "items_path": "data"},
    "get_judgments": {"method": "GET", "path": "/...", "params": {"from": "{from_date}"}, "items_path": "data"}
  },
  "mappings": {
    "case":     {"external_id": "...", "case_number": "...", "title": "...", "case_type": "...", "status": "...",
                 "filing_date": "...", "source_url": "...", "court_name": "...", "court_id": "...",
                 "court_state": "...", "court_level": "...", "parties": "...", "party_name": "...",
                 "party_role": "..."},
    "judgment": {"external_id": "...", "case_external_id": "...", "title": "...", "date": "...", "court_name": "...",
                 "court_id": "...", "court_state": "...", "summary": "...", "full_text": "...",
                 "provisions": "...", "bench": "...", "outcome": "...", "source_url": "..."}
  },
  "date_formats": ["%Y-%m-%d", "%d-%m-%Y"]                    # optional, tried in order
}
Mapping values are dot paths into one item of the response, e.g. "court.name" or "parties.0.name".
"""
import string
from datetime import date, datetime
from typing import Any
from urllib.parse import quote

import httpx

from app.providers.base import LegalDataProvider

PROVIDER = "ecourts"
DEFAULT_DATE_FORMATS = ["%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d-%m-%Y", "%d/%m/%Y"]


class NotConfigured(Exception):
    pass


def pick(obj: Any, path: str | None) -> Any:
    """Read a dot path ("a.b.0.c") from parsed JSON; None when any step is missing."""
    if not path:
        return None
    for part in path.split("."):
        if isinstance(obj, dict):
            obj = obj.get(part)
        elif isinstance(obj, list) and part.lstrip("-").isdigit() and -len(obj) <= int(part) < len(obj):
            obj = obj[int(part)]
        else:
            return None
        if obj is None:
            return None
    return obj


class _Vars(dict):
    """format_map helper: unknown placeholders render as empty instead of raising."""

    def __missing__(self, key: str) -> str:
        return ""


def _fill(template: str, values: dict, url_path: bool = False) -> str:
    safe = {k: quote(str(v), safe="") if url_path else str(v) for k, v in values.items() if v is not None}
    return string.Formatter().vformat(template, (), _Vars(safe))


class ECourtsProvider(LegalDataProvider):
    def __init__(self, base_url: str | None, api_key: str | None, config: dict, timeout: float = 30.0):
        if not base_url:
            raise NotConfigured("eCourts base URL is not set. An admin must set it in Settings > Legal data.")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.config = config or {}
        self.timeout = timeout

    # ---------- HTTP ----------

    def _endpoint(self, name: str) -> dict:
        ep = (self.config.get("endpoints") or {}).get(name)
        if not ep or not ep.get("path"):
            raise NotConfigured(f"eCourts endpoint '{name}' is not configured in Settings > Legal data.")
        return ep

    def _auth(self) -> tuple[dict, dict]:
        auth = self.config.get("auth") or {}
        if not self.api_key:
            return {}, {}
        if auth.get("query_param"):
            return {}, {auth["query_param"]: self.api_key}
        header = auth.get("header") or "Authorization"
        prefix = auth.get("prefix", "Bearer ")
        return {header: f"{prefix}{self.api_key}"}, {}

    async def _call(self, name: str, **values: Any) -> Any:
        ep = self._endpoint(name)
        path = _fill(ep["path"], values, url_path=True)
        params = {k: _fill(str(v), values) for k, v in (ep.get("params") or {}).items()}
        params = {k: v for k, v in params.items() if v != ""}
        headers, auth_params = self._auth()
        method = (ep.get("method") or "GET").upper()
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            if method == "GET":
                res = await client.get(f"{self.base_url}{path}", params={**params, **auth_params}, headers=headers)
            else:
                body = {k: _fill(str(v), values) for k, v in (ep.get("body") or {}).items()}
                res = await client.request(method, f"{self.base_url}{path}", params={**params, **auth_params},
                                           json=body or None, headers=headers)
        res.raise_for_status()
        return res.json()

    def _items(self, name: str, payload: Any) -> list:
        path = self._endpoint(name).get("items_path")
        items = pick(payload, path) if path else payload
        return items if isinstance(items, list) else []

    # ---------- mapping (external -> internal normalized dicts) ----------

    def _mapping(self, kind: str) -> dict:
        m = (self.config.get("mappings") or {}).get(kind)
        if not m or not m.get("external_id"):
            raise NotConfigured(f"eCourts '{kind}' field mapping (at least external_id) is not configured.")
        return m

    def _date(self, value: Any) -> date | None:
        if not value:
            return None
        text = str(value).strip()
        for fmt in self.config.get("date_formats") or DEFAULT_DATE_FORMATS:
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
        except ValueError:
            return None

    @staticmethod
    def _list(value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(v) for v in value if v is not None and str(v).strip()]
        return [p.strip() for p in str(value).replace(";", ",").split(",") if p.strip()]

    @staticmethod
    def _str(value: Any) -> str | None:
        return None if value is None or str(value).strip() == "" else str(value).strip()

    def map_case(self, item: dict) -> dict | None:
        m = self._mapping("case")
        ext = self._str(pick(item, m["external_id"]))
        if not ext:
            return None
        parties = []
        for p in pick(item, m.get("parties")) or []:
            name = self._str(pick(p, m.get("party_name")) if isinstance(p, dict) else p)
            if name:
                parties.append({"name": name, "role": self._str(pick(p, m.get("party_role"))) if isinstance(p, dict)
                                else None})
        return {
            "external_case_id": ext,
            "case_number": self._str(pick(item, m.get("case_number"))),
            "title": self._str(pick(item, m.get("title"))),
            "case_type": self._str(pick(item, m.get("case_type"))),
            "status": self._str(pick(item, m.get("status"))),
            "filing_date": self._date(pick(item, m.get("filing_date"))),
            "source_url": self._str(pick(item, m.get("source_url"))),
            "court": self._court(item, m),
            "parties": parties,
            "raw": item,
        }

    def map_judgment(self, item: dict, kind: str = "judgment") -> dict | None:
        m = self._mapping("judgment")
        ext = self._str(pick(item, m["external_id"]))
        if not ext:
            return None
        return {
            "external_judgment_id": ext,
            "kind": kind,
            "external_case_id": self._str(pick(item, m.get("case_external_id"))),
            "title": self._str(pick(item, m.get("title"))),
            "judgment_date": self._date(pick(item, m.get("date"))),
            "court": self._court(item, m),
            "summary": self._str(pick(item, m.get("summary"))),
            "full_text": self._str(pick(item, m.get("full_text"))),
            "provisions": self._list(pick(item, m.get("provisions"))),
            "bench": self._list(pick(item, m.get("bench"))),
            "outcome": self._str(pick(item, m.get("outcome"))),
            "source_url": self._str(pick(item, m.get("source_url"))),
        }

    def _court(self, item: dict, m: dict) -> dict | None:
        name = self._str(pick(item, m.get("court_name")))
        if not name:
            return None
        return {"name": name, "external_court_id": self._str(pick(item, m.get("court_id"))),
                "state": self._str(pick(item, m.get("court_state"))),
                "level": self._str(pick(item, m.get("court_level")))}

    # ---------- LegalDataProvider ----------

    async def search_cases(self, query: str, **filters: Any) -> list[dict]:
        payload = await self._call("search_cases", query=query, **filters)
        return [c for c in (self.map_case(i) for i in self._items("search_cases", payload) if isinstance(i, dict)) if c]

    async def get_case(self, external_case_id: str) -> dict:
        ep = self._endpoint("get_case")
        payload = await self._call("get_case", id=external_case_id)
        item = pick(payload, ep["item_path"]) if ep.get("item_path") else payload
        case = self.map_case(item) if isinstance(item, dict) else None
        if not case:
            raise ValueError("eCourts returned no case for that ID (check the get_case mapping).")
        return case

    async def get_orders(self, external_case_id: str) -> list[dict]:
        payload = await self._call("get_orders", id=external_case_id)
        out = []
        for i in self._items("get_orders", payload):
            if isinstance(i, dict) and (o := self.map_judgment(i, kind="order")):
                o["external_case_id"] = o["external_case_id"] or external_case_id
                out.append(o)
        return out

    async def get_judgments(self, **filters: Any) -> list[dict]:
        payload = await self._call("get_judgments", **filters)
        return [j for j in (self.map_judgment(i) for i in self._items("get_judgments", payload)
                            if isinstance(i, dict)) if j]

    async def test_connection(self) -> bool:
        await self._call("test")
        return True
