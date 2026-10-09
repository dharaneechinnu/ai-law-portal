"""LangChain-backed provider for any OpenAI-compatible endpoint (OpenAI, Gemini, Mistral, Groq, Ollama, LM Studio,
vLLM, OpenRouter, Together, custom...). Also holds the small wrappers every LangChain chat/embedding model shares."""
from typing import Any

import httpx
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from app.providers.base import EmbeddingProvider, LLMProvider


class LangChainLLM(LLMProvider):
    """Wraps any LangChain chat model."""

    def __init__(self, client: Any, model: str):
        self.client, self.model = client, model

    async def complete(self, messages: list[dict], **kwargs: Any) -> str:
        res = await self.client.ainvoke([(m["role"], m["content"]) for m in messages])
        content = res.content
        if isinstance(content, list):  # some providers return content blocks
            content = "".join(b.get("text", "") if isinstance(b, dict) else str(b) for b in content)
        return str(content)

    async def test_connection(self) -> bool:
        await self.complete([{"role": "user", "content": "Reply with the word ok."}])
        return True

    def chat_model(self) -> Any:
        return self.client


class LangChainEmbeddings(EmbeddingProvider):
    def __init__(self, client: Any):
        self.client = client

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await self.client.aembed_documents(texts)


class OpenAICompatibleLLM(LangChainLLM):
    def __init__(self, base_url: str | None, api_key: str | None, model: str):
        super().__init__(ChatOpenAI(base_url=base_url or None, api_key=api_key or "not-needed", model=model,
                                    temperature=0.1), model)


class OpenAICompatibleEmbeddings(LangChainEmbeddings):
    def __init__(self, base_url: str | None, api_key: str | None, model: str, dimensions: int | None = None):
        super().__init__(OpenAIEmbeddings(
            base_url=base_url or None,
            api_key=api_key or "not-needed",
            model=model,
            dimensions=dimensions,  # only sent for models that can shorten their vectors (OpenAI 3-series, Gemini)
            check_embedding_ctx_length=False,  # non-OpenAI servers don't use OpenAI's tokenizer
        ))


async def list_models(base_url: str, api_key: str | None) -> list[str]:
    """GET {base_url}/models, the OpenAI-style model list most servers expose."""
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(base_url.rstrip("/") + "/models", headers=headers)
        r.raise_for_status()
        data = r.json()
    rows = data.get("data", data.get("models", [])) if isinstance(data, dict) else data
    names = [(m.get("id") or m.get("name") or "") if isinstance(m, dict) else str(m) for m in rows]
    return sorted({n.removeprefix("models/") for n in names if n})
