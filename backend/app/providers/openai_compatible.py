"""LangChain-backed provider for any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, OpenAI, custom)."""
from typing import Any

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from app.providers.base import EmbeddingProvider, LLMProvider


class OpenAICompatibleLLM(LLMProvider):
    def __init__(self, base_url: str | None, api_key: str | None, model: str):
        self.model = model
        self.client = ChatOpenAI(
            base_url=base_url or None, api_key=api_key or "not-needed", model=model, temperature=0.1
        )

    async def complete(self, messages: list[dict], **kwargs: Any) -> str:
        res = await self.client.ainvoke([(m["role"], m["content"]) for m in messages])
        return str(res.content)

    async def test_connection(self) -> bool:
        await self.complete([{"role": "user", "content": "ping"}])
        return True


class OpenAICompatibleEmbeddings(EmbeddingProvider):
    def __init__(self, base_url: str | None, api_key: str | None, model: str):
        self.client = OpenAIEmbeddings(
            base_url=base_url or None,
            api_key=api_key or "not-needed",
            model=model,
            check_embedding_ctx_length=False,  # local servers don't use OpenAI's tokenizer
        )

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await self.client.aembed_documents(texts)
