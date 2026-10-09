"""AWS Bedrock chat models through the Converse API (Claude, Llama, Mistral, Nova... on AWS)."""
from langchain_aws import ChatBedrockConverse

from app.providers.openai_compatible import LangChainLLM


class BedrockLLM(LangChainLLM):
    def __init__(self, region: str, access_key_id: str | None, secret_access_key: str | None, model: str):
        super().__init__(ChatBedrockConverse(model=model, region_name=region, aws_access_key_id=access_key_id or None,
                                             aws_secret_access_key=secret_access_key or None, temperature=0.1), model)


async def list_models(region: str, access_key_id: str | None, secret_access_key: str | None) -> list[str]:
    import asyncio

    import boto3

    def _list() -> list[str]:
        client = boto3.client("bedrock", region_name=region, aws_access_key_id=access_key_id or None,
                              aws_secret_access_key=secret_access_key or None)
        rows = client.list_foundation_models(byOutputModality="TEXT")["modelSummaries"]
        return sorted(m["modelId"] for m in rows)
    return await asyncio.to_thread(_list)
