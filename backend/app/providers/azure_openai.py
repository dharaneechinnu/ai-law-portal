"""Azure OpenAI. Models are addressed by the deployment names created in the Azure portal."""
from langchain_openai import AzureChatOpenAI, AzureOpenAIEmbeddings

from app.providers.openai_compatible import RETRIES, TIMEOUT, LangChainEmbeddings, LangChainLLM


class AzureOpenAILLM(LangChainLLM):
    def __init__(self, endpoint: str, api_key: str | None, api_version: str, deployment: str):
        super().__init__(AzureChatOpenAI(azure_endpoint=endpoint, api_key=api_key, api_version=api_version,
                                         azure_deployment=deployment, temperature=0.1, timeout=TIMEOUT,
                                         max_retries=RETRIES), deployment)


class AzureOpenAIEmbeddingsProvider(LangChainEmbeddings):
    def __init__(self, endpoint: str, api_key: str | None, api_version: str, deployment: str, dimensions: int | None):
        super().__init__(AzureOpenAIEmbeddings(azure_endpoint=endpoint, api_key=api_key, api_version=api_version,
                                               azure_deployment=deployment, dimensions=dimensions,
                                               request_timeout=TIMEOUT, max_retries=RETRIES))
