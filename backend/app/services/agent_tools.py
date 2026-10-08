"""Controlled tools agents may request. Each tool calls application services only, as the requesting user, so the
normal access rules apply. Tools never run directly: agent_runtime sends every call through the policy engine first."""
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Matter, Task, User
from app.schemas import EventIn, TaskIn
from app.services import people as people_svc
from app.services import rag
from app.services.access import matter_or_404, visible_matters
from app.services.calendar import create_event
from app.services.tasks import change_status, create_task, get_task_or_404, to_out


# ---- argument schemas (validated server-side; the LLM's arguments are untrusted) ----
class SearchMattersArgs(BaseModel):
    query: str = ""


class AskMatterArgs(BaseModel):
    matter_id: uuid.UUID
    question: str


class ListTasksArgs(BaseModel):
    matter_id: uuid.UUID | None = None


class TaskRef(BaseModel):
    task_id: uuid.UUID


class FindPeopleArgs(BaseModel):
    query: str = ""


class AvailabilityArgs(BaseModel):
    person_id: uuid.UUID
    start: datetime
    end: datetime


class SendEmailArgs(BaseModel):
    to: list[str]
    subject: str
    body: str


@dataclass
class Tool:
    action: str
    label: str
    description: str
    args: type[BaseModel]
    run: Callable[[Session, User, Any], Awaitable[dict]]
    summary: Callable[[Session, Any], str]
    is_mutation: bool = False
    is_external: bool = False
    is_destructive: bool = False
    roles: set[str] | None = None  # roles allowed to request it (None = any role)
    precheck: Callable[[Session, User, Any], None] | None = None  # access check before anything is shown or stored
    default: str = field(default="")  # default policy when no rule is stored

    def __post_init__(self):
        if not self.default:
            self.default = "APPROVAL_REQUIRED" if (self.is_mutation or self.is_external) else "ALLOWED"


def _can_see_task(db: Session, user: User, a: TaskRef) -> None:
    get_task_or_404(db, a.task_id, user)


def _task_title(db: Session, task_id) -> str:
    t = db.get(Task, task_id)
    return f"“{t.title}”" if t else "a task"


async def _search_matters(db, user, a: SearchMattersArgs) -> dict:
    q = select(Matter).where(visible_matters(user), Matter.status == "active")
    if a.query:
        like = f"%{a.query}%"
        q = q.where(or_(Matter.title.ilike(like), Matter.matter_number.ilike(like), Matter.case_number.ilike(like)))
    rows = db.scalars(q.limit(20)).all()
    return {"matters": [{"id": str(m.id), "title": m.title, "number": m.matter_number} for m in rows]}


async def _ask_matter(db, user, a: AskMatterArgs) -> dict:
    matter_or_404(db, a.matter_id, user)
    return (await rag.ask_matter(db, a.matter_id, a.question)).model_dump(mode="json")


async def _list_tasks(db, user, a: ListTasksArgs) -> dict:
    from app.services.tasks import visible_tasks
    q = select(Task).where(visible_tasks(user), Task.status == "open")
    q = q.where(Task.matter_id == a.matter_id) if a.matter_id else q.where(Task.assignee_id == user.id)
    return {"tasks": [t.model_dump(mode="json") for t in to_out(db, list(db.scalars(q.limit(50)).all()))]}


async def _create_task(db, user, a: TaskIn) -> dict:
    return {"task": to_out(db, [create_task(db, user, a)])[0].model_dump(mode="json")}


async def _complete_task(db, user, a: TaskRef) -> dict:
    t = get_task_or_404(db, a.task_id, user)
    change_status(db, user, t, "done")
    return {"task_id": str(t.id), "status": t.status}


async def _delete_task(db, user, a: TaskRef) -> dict:
    # Project rule: nothing is hard-deleted. "Delete" archives the task.
    t = get_task_or_404(db, a.task_id, user)
    change_status(db, user, t, "archived")
    return {"task_id": str(t.id), "status": t.status}


async def _find_people(db, user, a: FindPeopleArgs) -> dict:
    q = select(User).where(User.is_active.is_(True))
    if a.query:
        q = q.where(User.name.ilike(f"%{a.query}%"))
    out = []
    for p in db.scalars(q.limit(10)).all():
        status, until = await people_svc.status_now(db, p)
        out.append({"id": str(p.id), "name": p.name, "role": p.role.name, "status": status,
                    "busy_until": until.isoformat() if until else None, "timezone": p.timezone})
    return {"people": out}


async def _availability(db, user, a: AvailabilityArgs) -> dict:
    p = db.get(User, a.person_id)
    if not p or not p.is_active:
        raise HTTPException(404, "Person not found")
    return {"person_id": str(p.id), "free": await people_svc.is_free(db, p, a.start, a.end),
            "within_hours": people_svc.within_hours(p, a.start)}


async def _create_event(db, user, a: EventIn) -> dict:
    return {"event": (await create_event(db, user, a)).model_dump(mode="json")}


async def _send_email(db, user, a: SendEmailArgs) -> dict:
    raise HTTPException(409, "Email is not set up yet. An admin must add an email provider in Settings.")


TOOLS: dict[str, Tool] = {t.action: t for t in [
    Tool("SEARCH_MATTERS", "Search matters", "Find matters you can open", SearchMattersArgs, _search_matters,
         lambda db, a: f"Search matters for “{a.query}”"),
    Tool("ASK_MATTER", "Ask matter documents", "Cited answer from a matter's documents", AskMatterArgs, _ask_matter,
         lambda db, a: f"Ask: {a.question}"),
    Tool("LIST_TASKS", "List tasks", "Open tasks for you or a matter", ListTasksArgs, _list_tasks,
         lambda db, a: "List open tasks"),
    Tool("FIND_PEOPLE", "Find people", "Look up colleagues and who is free", FindPeopleArgs, _find_people,
         lambda db, a: f"Find “{a.query}”"),
    Tool("CHECK_AVAILABILITY", "Check availability", "Is a person free for a time slot", AvailabilityArgs,
         _availability, lambda db, a: "Check availability"),
    Tool("CREATE_TASK", "Create task", "Add a task with assignee and due date", TaskIn, _create_task,
         lambda db, a: f"Create task “{a.title}”", is_mutation=True),
    Tool("COMPLETE_TASK", "Complete task", "Mark a task done", TaskRef, _complete_task,
         lambda db, a: f"Mark {_task_title(db, a.task_id)} done", is_mutation=True, precheck=_can_see_task),
    Tool("DELETE_TASK", "Delete task", "Remove a task (it is archived, never erased)", TaskRef, _delete_task,
         lambda db, a: f"Delete {_task_title(db, a.task_id)}", is_mutation=True, is_destructive=True,
         roles={"admin", "partner", "lawyer", "associate"}, default="DISABLED", precheck=_can_see_task),
    Tool("CREATE_EVENT", "Schedule meeting", "Book a calendar event and invite people", EventIn, _create_event,
         lambda db, a: f"Schedule “{a.title}” on {a.start:%d %b, %H:%M}", is_mutation=True),
    Tool("SEND_EMAIL", "Send email", "Email someone outside the portal", SendEmailArgs, _send_email,
         lambda db, a: f"Email {', '.join(a.to)}: {a.subject}", is_mutation=True, is_external=True,
         roles={"admin", "partner", "lawyer", "associate"}),
]}

AGENTS = {
    "briefing": "Daily Briefing", "matter_intel": "Matter Intelligence", "legal_research": "Legal Research",
    "scheduling": "Scheduling", "task": "Task",
}
