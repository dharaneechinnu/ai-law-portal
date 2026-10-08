from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    admin, ai_settings, auth, briefing, calendar, clients, dashboard, documents, health, legal, matters, notifications, people,
    tasks,
)
from app.core import scheduler
from app.core.config import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.scheduler_enabled:
        scheduler.start()
    yield
    scheduler.stop()


app = FastAPI(title="AI Law Firm Portal", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Remaining domain routers are added per sprint: users, tasks, calendar, agents,
# analytics, notifications, audit.
for r in (health.router, auth.router, clients.router, matters.router, documents.router, ai_settings.router,
          admin.router, legal.settings_router, legal.router, dashboard.router, tasks.router,
          calendar.router, calendar.hearings_router, people.router, briefing.router,
          notifications.router):
    app.include_router(r, prefix="/api")
