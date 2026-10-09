"""AI provider setup: catalog, saving per provider, secrets never returned, live model list and the connection test,
against a throwaway OpenAI-compatible server."""
import base64
import json
import struct
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from conftest import headers


class FakeAI(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, body: dict, status: int = 200):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.endswith("/models"):
            return self._send({"object": "list", "data": [{"id": "fake-chat"}, {"id": "fake-embed"}]})
        self._send({}, 404)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])) or b"{}")
        if self.path.endswith("/chat/completions"):
            return self._send({"id": "c1", "object": "chat.completion", "created": 0, "model": body["model"],
                               "choices": [{"index": 0, "finish_reason": "stop",
                                            "message": {"role": "assistant", "content": "ok"}}],
                               "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}})
        if self.path.endswith("/embeddings"):
            size = 1024 if "1024" in body["model"] else 768
            inputs = body["input"] if isinstance(body["input"], list) else [body["input"]]
            vec = [0.01] * size
            emb = (base64.b64encode(struct.pack(f"{size}f", *vec)).decode()
                   if body.get("encoding_format") == "base64" else vec)
            return self._send({"object": "list", "model": body["model"],
                               "data": [{"object": "embedding", "index": i, "embedding": emb} for i in range(len(inputs))],
                               "usage": {"prompt_tokens": 1, "total_tokens": 1}})
        self._send({}, 404)


@pytest.fixture(scope="module")
def fake_ai():
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeAI)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}/v1"
    server.shutdown()


def config(url, chat_kind="openai_compatible", embed=None, key="sk-local-secret", chat_model="fake-chat",
           embed_model="fake-embed"):
    chat_fields = {"base_url": url, "api_key": key} if chat_kind == "openai_compatible" else {"api_key": key}
    return {"chat": {"kind": chat_kind, "fields": chat_fields, "model": chat_model},
            "embedding": embed or {"same_as_chat": True, "model": embed_model}}


def test_catalog_lists_providers_without_internals(client, admin):
    rows = client.get("/api/settings/ai/providers", headers=headers(admin)).json()
    ids = {p["id"] for p in rows}
    assert {"openai", "anthropic", "google", "azure_openai", "bedrock", "mistral", "groq", "ollama",
            "openai_compatible"} <= ids
    assert all("adapter" not in p for p in rows)
    anthropic = next(p for p in rows if p["id"] == "anthropic")
    assert anthropic["chat"] and not anthropic["embeddings"]


def test_save_test_and_never_return_secrets(client, admin, fake_ai):
    A = headers(admin)
    r = client.put("/api/settings/ai", headers=A, json=config(fake_ai))
    assert r.status_code == 200, r.text
    cfg = r.json()
    assert cfg["configured"] and cfg["chat"]["model"] == "fake-chat" and cfg["embedding"]["same_as_chat"]
    assert cfg["chat"]["saved_secrets"] == ["api_key"] and "sk-local-secret" not in r.text
    assert cfg["chat"]["fields"]["base_url"] == fake_ai

    t = client.post("/api/settings/ai/test", headers=A).json()
    assert t["chat_ok"] and t["embedding_ok"] and t["embedding_dim"] == 768, t

    # saving again with an empty key keeps the stored one
    again = config(fake_ai, key="")
    assert client.put("/api/settings/ai", headers=A, json=again).json()["chat"]["saved_secrets"] == ["api_key"]

    models = client.post("/api/settings/ai/models", headers=A,
                         json={"kind": "openai_compatible", "fields": {"base_url": fake_ai}, "use_saved": "chat"}).json()
    assert models["models"] == ["fake-chat", "fake-embed"]


def test_test_before_saving_flags_wrong_vector_size(client, admin, fake_ai):
    t = client.post("/api/settings/ai/test", headers=headers(admin),
                    json=config(fake_ai, embed_model="fake-embed-1024")).json()
    assert t["chat_ok"] and not t["embedding_ok"] and t["embedding_dim"] == 1024
    assert "768" in t["embedding_error"]


def test_chat_only_provider_needs_separate_embeddings(client, admin, fake_ai):
    A = headers(admin)
    r = client.put("/api/settings/ai", headers=A, json=config(fake_ai, chat_kind="anthropic"))
    assert r.status_code == 400 and "embedding" in r.json()["detail"]

    split = config(fake_ai, chat_kind="anthropic", key="sk-ant-secret", chat_model="claude-sonnet-5-5",
                   embed={"same_as_chat": False, "kind": "openai_compatible", "model": "fake-embed",
                          "fields": {"base_url": fake_ai}})
    r = client.put("/api/settings/ai", headers=A, json=split)
    assert r.status_code == 200, r.text
    cfg = r.json()
    assert cfg["chat"]["kind"] == "anthropic" and cfg["chat"]["saved_secrets"] == ["api_key"]
    assert not cfg["embedding"]["same_as_chat"] and cfg["embedding"]["kind"] == "openai_compatible"
    assert "sk-ant-secret" not in r.text
    t = client.post("/api/settings/ai/test", headers=A).json()
    assert t["embedding_ok"] and not t["chat_ok"]  # embeddings reach the fake server; the Anthropic key is fake


def test_required_fields_are_checked(client, admin):
    A = headers(admin)
    r = client.put("/api/settings/ai", headers=A, json={
        "chat": {"kind": "azure_openai", "fields": {"api_key": "k"}, "model": "gpt-4o"},
        "embedding": {"same_as_chat": True, "model": "emb"}})
    assert r.status_code == 400 and "Endpoint" in r.json()["detail"]
    r = client.put("/api/settings/ai", headers=A, json={
        "chat": {"kind": "nope", "fields": {}, "model": "x"}, "embedding": {"same_as_chat": True, "model": "y"}})
    assert r.status_code == 400
