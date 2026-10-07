from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
from app.core.config import settings

app = FastAPI(title="AI Law Firm Portal")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Domain routers are added per sprint: auth, users, clients, matters, tasks, calendar,
# documents, legal, ai, agents, settings, analytics, notifications, audit.
app.include_router(health.router, prefix="/api")
