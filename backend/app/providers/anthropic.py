"""Anthropic (Claude) chat models. Anthropic has no embedding models, so embeddings come from another provider."""
import httpx
from langchain_anthropic import ChatAnthropic

from app.providers.openai_compatible import RETRIES, TIMEOUT, LangChainLLM

API = "https://api.anthropic.com"


class AnthropicLLM(LangChainLLM):
    def __init__(self, api_key: str | None, model: str, base_url: str | None = None):
        super().__init__(ChatAnthropic(model=model, api_key=api_key, base_url=base_url or None, temperature=0.1,
                                       max_tokens=4096, default_request_timeout=TIMEOUT, max_retries=RETRIES), model)


async def list_models(api_key: str, base_url: str | None = None) -> list[str]:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{(base_url or API).rstrip('/')}/v1/models", params={"limit": 100},
                             headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"})
        r.raise_for_status()
    return [m["id"] for m in r.json().get("data", [])]
