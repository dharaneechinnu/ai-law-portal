"""Provider interfaces. Business logic depends on these, never on a vendor."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


class LLMProvider(ABC):
    @abstractmethod
    async def complete(self, messages: list[dict], **kwargs: Any) -> str: ...

    @abstractmethod
    async def test_connection(self) -> bool: ...


class EmbeddingProvider(ABC):
    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class RerankerProvider(ABC):
    @abstractmethod
    async def rerank(self, query: str, documents: list[str], top_k: int) -> list[int]: ...


class LegalDataProvider(ABC):
    """Responses must be mapped to internal models inside the adapter."""

    @abstractmethod
    async def search_cases(self, query: str, **filters: Any) -> list[dict]: ...

    @abstractmethod
    async def get_case(self, external_case_id: str) -> dict: ...

    @abstractmethod
    async def get_orders(self, external_case_id: str) -> list[dict]: ...

    @abstractmethod
    async def get_judgments(self, **filters: Any) -> list[dict]: ...

    @abstractmethod
    async def test_connection(self) -> bool: ...


@dataclass
class CalendarSlot:
    start: datetime
    end: datetime
    meta: dict = field(default_factory=dict)


class CalendarProvider(ABC):
    @abstractmethod
    async def free_busy(self, user_id: str, start: datetime, end: datetime) -> list[CalendarSlot]: ...

    @abstractmethod
    async def create_event(self, user_id: str, title: str, start: datetime, end: datetime, **kw: Any) -> str: ...

    @abstractmethod
    async def cancel_event(self, event_id: str) -> None: ...


class EmailProvider(ABC):
    @abstractmethod
    async def send(self, to: list[str], subject: str, body: str) -> str: ...
