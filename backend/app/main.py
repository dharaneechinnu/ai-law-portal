from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, ai_settings, auth, calendar, clients, dashboard, documents, health, legal, matters, tasks
from app.core.config import settings

app = FastAPI(title="AI Law Firm Portal")
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
          calendar.router, calendar.hearings_router):
    app.include_router(r, prefix="/api")
