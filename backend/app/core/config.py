from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:password@localhost:5432/ai_law"
    secret_key: str = "dev-only-change-me"
    cors_origins: str = "http://localhost:5173"
    storage_dir: str = "./storage"
    embedding_dim: int = 768
    access_token_minutes: int = 60 * 8


settings = Settings()
