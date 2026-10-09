"""Supported AI providers: what each needs from the admin and what it can do. The Settings page is built from this,
so adding a provider is one entry here (plus an adapter if it is not OpenAI-compatible).

Model names are suggestions only; the admin can type any name or load the live list from the provider."""

API_KEY = {"key": "api_key", "label": "API key", "type": "secret", "required": True}
API_KEY_OPTIONAL = {"key": "api_key", "label": "API key", "type": "secret", "required": False,
                    "help": "Only if your server asks for one."}


def _server(default: str, required: bool = False) -> dict:
    return {"key": "base_url", "label": "Server address", "type": "url", "required": required,
            "default": default, "placeholder": default}


def _cloud(id, name, base_url, blurb, key_url, chat, embed=(), tools=True, dims=False, group="Cloud"):
    return dict(id=id, name=name, group=group, adapter="openai", base_url=base_url, blurb=blurb, key_url=key_url,
                fields=[API_KEY], chat=bool(chat), embeddings=bool(embed), tools=tools, dimensions=dims,
                list_models=True, chat_models=list(chat), embedding_models=list(embed))


PROVIDERS: list[dict] = [
    _cloud("openai", "OpenAI", "https://api.openai.com/v1", "GPT models. Chat and embeddings.",
           "https://platform.openai.com/api-keys", ["gpt-4.1", "gpt-4.1-mini", "gpt-4o-mini"],
           ["text-embedding-3-small", "text-embedding-3-large"], dims=True),
    dict(id="anthropic", name="Anthropic", group="Cloud", adapter="anthropic", base_url=None,
         blurb="Claude models. Chat only; pair with another provider for embeddings.",
         key_url="https://console.anthropic.com/settings/keys", fields=[API_KEY], chat=True, embeddings=False,
         tools=True, dimensions=False, list_models=True,
         chat_models=["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"], embedding_models=[]),
    _cloud("google", "Google Gemini", "https://generativelanguage.googleapis.com/v1beta/openai/",
           "Gemini models. Chat and embeddings.", "https://aistudio.google.com/apikey",
           ["gemini-2.5-flash", "gemini-2.5-pro"], ["gemini-embedding-001"], dims=True),
    dict(id="azure_openai", name="Azure OpenAI", group="Cloud", adapter="azure", base_url=None,
         blurb="OpenAI models in your Azure subscription. Use your deployment names as model names.",
         key_url="https://portal.azure.com/", chat=True, embeddings=True, tools=True, dimensions=True,
         list_models=False, chat_models=[], embedding_models=[],
         fields=[{"key": "endpoint", "label": "Endpoint", "type": "url", "required": True,
                  "placeholder": "https://your-resource.openai.azure.com"},
                 API_KEY,
                 {"key": "api_version", "label": "API version", "type": "text", "required": True,
                  "default": "2024-10-21"}]),
    dict(id="bedrock", name="AWS Bedrock", group="Cloud", adapter="bedrock", base_url=None,
         blurb="Claude, Llama, Mistral and Nova on AWS. Chat only.", key_url="https://console.aws.amazon.com/iam/",
         chat=True, embeddings=False, tools=True, dimensions=False, list_models=True,
         chat_models=["amazon.nova-pro-v1:0", "meta.llama3-1-70b-instruct-v1:0"], embedding_models=[],
         fields=[{"key": "region", "label": "Region", "type": "text", "required": True, "default": "us-east-1"},
                 {"key": "access_key_id", "label": "Access key ID", "type": "text", "required": True},
                 {"key": "secret_access_key", "label": "Secret access key", "type": "secret", "required": True}]),
    _cloud("mistral", "Mistral AI", "https://api.mistral.ai/v1", "Mistral models. Chat and embeddings.",
           "https://console.mistral.ai/api-keys", ["mistral-large-latest", "mistral-small-latest"], ["mistral-embed"]),
    _cloud("groq", "Groq", "https://api.groq.com/openai/v1", "Very fast open models. Chat only.",
           "https://console.groq.com/keys", ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]),
    _cloud("deepseek", "DeepSeek", "https://api.deepseek.com/v1", "DeepSeek models. Chat only.",
           "https://platform.deepseek.com/api_keys", ["deepseek-chat", "deepseek-reasoner"]),
    _cloud("xai", "xAI Grok", "https://api.x.ai/v1", "Grok models. Chat only.", "https://console.x.ai/",
           ["grok-3", "grok-3-mini"]),
    _cloud("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "Hundreds of models behind one key. Chat only.",
           "https://openrouter.ai/keys", ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4"]),
    _cloud("together", "Together AI", "https://api.together.xyz/v1", "Open models. Chat and embeddings.",
           "https://api.together.ai/settings/api-keys", ["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
           ["togethercomputer/m2-bert-80M-8k-retrieval"]),
    _cloud("fireworks", "Fireworks AI", "https://api.fireworks.ai/inference/v1", "Open models. Chat and embeddings.",
           "https://fireworks.ai/account/api-keys", ["accounts/fireworks/models/llama-v3p3-70b-instruct"],
           ["nomic-ai/nomic-embed-text-v1.5"]),
    _cloud("cohere", "Cohere", "https://api.cohere.ai/compatibility/v1", "Command models. Chat only.",
           "https://dashboard.cohere.com/api-keys", ["command-a-03-2025", "command-r-plus"]),
    _cloud("perplexity", "Perplexity", "https://api.perplexity.ai", "Sonar models with web search. Chat only; no agents.",
           "https://www.perplexity.ai/settings/api", ["sonar", "sonar-pro"], tools=False),
    _cloud("nvidia", "NVIDIA", "https://integrate.api.nvidia.com/v1",
           "Llama, Nemotron, DeepSeek and more on NVIDIA NIM. Chat only.", "https://build.nvidia.com/",
           ["meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct", "deepseek-ai/deepseek-r1"]),
    _cloud("huggingface", "Hugging Face", "https://router.huggingface.co/v1", "Open models via Inference Providers. Chat only.",
           "https://huggingface.co/settings/tokens", ["meta-llama/Llama-3.3-70B-Instruct"]),
    dict(id="ollama", name="Ollama", group="On your computer", adapter="openai", base_url="http://localhost:11434/v1",
         blurb="Free models running on your own machine. Nothing leaves the firm.", key_url="https://ollama.com/download",
         fields=[_server("http://localhost:11434/v1")], chat=True, embeddings=True, tools=True, dimensions=False,
         list_models=True, chat_models=["llama3.1", "qwen2.5"], embedding_models=["nomic-embed-text"]),
    dict(id="lmstudio", name="LM Studio", group="On your computer", adapter="openai", base_url="http://localhost:1234/v1",
         blurb="Desktop app that serves local models.", key_url="https://lmstudio.ai/",
         fields=[_server("http://localhost:1234/v1")], chat=True, embeddings=True, tools=True, dimensions=False,
         list_models=True, chat_models=[], embedding_models=["text-embedding-nomic-embed-text-v1.5"]),
    dict(id="vllm", name="vLLM", group="On your computer", adapter="openai", base_url=None,
         blurb="Your own GPU server running vLLM.", key_url="https://docs.vllm.ai/",
         fields=[_server("http://localhost:8001/v1", required=True), API_KEY_OPTIONAL], chat=True, embeddings=True,
         tools=True, dimensions=False, list_models=True, chat_models=[], embedding_models=[]),
    dict(id="openai_compatible", name="Other (OpenAI-compatible)", group="Other", adapter="openai", base_url=None,
         blurb="Any server that speaks the OpenAI API.", key_url=None,
         fields=[_server("https://your-server/v1", required=True), API_KEY_OPTIONAL], chat=True, embeddings=True,
         tools=True, dimensions=False, list_models=True, chat_models=[], embedding_models=[]),
]

# Cost: "free" (runs on your own machine), "free_tier" (free with limits, paid beyond), "paid" (pay per use).
PRICING = {
    "openai": ("paid", "Pay per use. Business API data is not used for training by default."),
    "anthropic": ("paid", "Pay per use. Business API data is not used for training by default."),
    "google": ("free_tier", "Free tier with rate limits. On the free tier Google may use prompts to improve its "
                            "products, so use a paid key for client data."),
    "azure_openai": ("paid", "Billed through your Azure subscription. Data stays in your Azure tenant."),
    "bedrock": ("paid", "Billed through your AWS account. Data stays in your AWS account."),
    "mistral": ("free_tier", "Free experiment plan with low limits; paid plans for real use."),
    "groq": ("free_tier", "Free tier with rate limits; pay as you go for more."),
    "deepseek": ("paid", "Low-cost pay per use."),
    "xai": ("paid", "Pay per use."),
    "openrouter": ("free_tier", "Some models are free (names ending in :free); the rest are pay per use."),
    "together": ("paid", "Pay per use."),
    "fireworks": ("paid", "Pay per use."),
    "cohere": ("free_tier", "Free trial key for testing only; a paid key for real use."),
    "perplexity": ("paid", "Pay per use."),
    "nvidia": ("free_tier", "Free developer access for testing, with rate limits. Production use needs an "
                            "NVIDIA AI Enterprise licence."),
    "huggingface": ("free_tier", "Small free monthly credit; pay as you go after that."),
    "ollama": ("free", "Free. Runs on your computer; nothing leaves the firm."),
    "lmstudio": ("free", "Free. Runs on your computer; nothing leaves the firm."),
    "vllm": ("free", "Free software on your own server; you pay only for the hardware."),
    "openai_compatible": ("free", "Depends on the server you connect."),
}

# Short setup steps shown next to the form. Cloud providers share the API-key steps.
GUIDES = {
    "ollama": ["Install Ollama from ollama.com and open it.",
               "In a terminal run: ollama pull llama3.1  and  ollama pull nomic-embed-text",
               "Keep Ollama running, then Load models here."],
    "lmstudio": ["Install LM Studio from lmstudio.ai and download a chat model and an embedding model.",
                 "Open the Developer tab and start the server.",
                 "Load models here and pick them."],
    "vllm": ["Start vLLM with the OpenAI server (vllm serve <model>).",
             "Enter its address, for example http://your-server:8000/v1.",
             "Load models here and pick one."],
    "openai_compatible": ["Enter the server's address ending in /v1.",
                          "Add an API key if the server needs one.",
                          "Load models here and pick one."],
    "azure_openai": ["In the Azure portal, create an Azure OpenAI resource.",
                     "Deploy a chat model and an embedding model; note the deployment names.",
                     "Copy the endpoint and a key from Keys and Endpoint, and type the deployment names as models."],
    "bedrock": ["In the AWS console, enable the models you want under Bedrock > Model access.",
                "Create an IAM user with Bedrock access and an access key.",
                "Enter the region and both keys, then Load models."],
}


def _finish(p: dict) -> None:
    p["pricing"], p["pricing_note"] = PRICING.get(p["id"], ("paid", None))
    p["guide"] = GUIDES.get(p["id"]) or [
        f"Sign up at {p['name']}" + (" and add a payment method." if p["pricing"] == "paid" else "."),
        "Open the API keys page (Get a key) and create a key.",
        "Paste the key here, then Load models and pick one.",
    ]


for _p in PROVIDERS:
    _finish(_p)

BY_ID = {p["id"]: p for p in PROVIDERS}
# Older saved configs used these kinds.
ALIASES = {"azure": "azure_openai"}


def get(kind: str | None) -> dict:
    p = BY_ID.get(ALIASES.get(kind or "", kind or ""))
    if not p:
        raise KeyError(f"Unknown AI provider '{kind}'")
    return p


def secret_keys(p: dict) -> list[str]:
    return [f["key"] for f in p["fields"] if f["type"] == "secret"]


def public(p: dict) -> dict:
    """What the browser needs (no adapter internals)."""
    return {k: v for k, v in p.items() if k != "adapter"}
