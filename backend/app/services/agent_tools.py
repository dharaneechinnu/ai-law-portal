"""Controlled tools agents may request. Each tool calls application services only, as the requesting user, so the
normal access rules apply. Tools never run directly: agent_runtime sends every call through the policy engine first."""
import asyncio
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime
from typing import Any, Awaitable, Callable

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import AssistantUpload, Client, Document, Matter, Task, User
from app.schemas import EventIn, TaskIn
from app.services import documents as docs_svc
from app.services import people as people_svc
from app.services import rag
from app.services.access import can_view, matter_or_404, visible_matters
from app.services.calendar import create_event
from app.services.ingest import process_document
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


class MatterRef(BaseModel):
    matter_id: uuid.UUID


class AttachFileArgs(BaseModel):
    upload_id: uuid.UUID
    matter_id: uuid.UUID


class SendEmailArgs(BaseModel):
    to: list[str]
    subject: str
    body: str
    document_ids: list[uuid.UUID] = []  # matter documents to attach
    upload_ids: list[uuid.UUID] = []  # files attached in the chat


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


def _can_use_upload(db: Session, user: User, a: AttachFileArgs) -> None:
    if docs_svc.upload_or_404(db, user, a.upload_id).document_id:
        raise HTTPException(409, "That file is already filed to a matter")


def _email_files(db: Session, user: User, a: SendEmailArgs) -> list[tuple[str, str, str]]:
    """(filename, mime, path) for every attachment, after checking the user may see each one."""
    files = []
    for doc_id in a.document_ids:
        d = db.get(Document, doc_id)
        if not d or not can_view(db, user, d.matter_id):
            raise HTTPException(404, "Document not found")
        files.append((d.filename, d.mime_type, d.storage_path))
    for up_id in a.upload_ids:
        up = docs_svc.upload_or_404(db, user, up_id)
        d = db.get(Document, up.document_id) if up.document_id else None
        files.append((up.filename, up.mime_type, d.storage_path if d else up.storage_path))
    return files


def _can_send(db: Session, user: User, a: SendEmailArgs) -> None:
    files = _email_files(db, user, a)
    if sum(Path(f[2]).stat().st_size for f in files if Path(f[2]).exists()) > docs_svc.MAX_EMAIL_BYTES:
        raise HTTPException(413, "Attachments are over 20 MB in total")


def _upload_name(db: Session, upload_id) -> str:
    up = db.get(AssistantUpload, upload_id)
    return f"“{up.filename}”" if up else "a file"


def _matter_name(db: Session, matter_id) -> str:
    m = db.get(Matter, matter_id)
    return f"{m.matter_number} {m.title}" if m else "a matter"


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


async def _get_matter(db, user, a: MatterRef) -> dict:
    m = matter_or_404(db, a.matter_id, user)
    client = db.get(Client, m.client_id)
    lawyer = db.get(User, m.assigned_lawyer_id) if m.assigned_lawyer_id else None
    return {"matter": {
        "id": str(m.id), "title": m.title, "number": m.matter_number, "case_number": m.case_number, "court": m.court,
        "status": m.status, "next_hearing": m.next_hearing.isoformat() if m.next_hearing else None,
        "client": {"name": client.name, "email": client.email} if client else None,
        "assigned_lawyer": {"name": lawyer.name, "email": lawyer.email} if lawyer else None,
    }}


async def _list_documents(db, user, a: MatterRef) -> dict:
    matter_or_404(db, a.matter_id, user)
    rows = db.scalars(select(Document).where(Document.matter_id == a.matter_id)
                      .order_by(Document.created_at.desc()).limit(50)).all()
    return {"documents": [{"id": str(d.id), "filename": d.filename, "status": d.status,
                           "uploaded": d.created_at.isoformat() if d.created_at else None} for d in rows]}


async def _attach_file(db, user, a: AttachFileArgs) -> dict:
    m = matter_or_404(db, a.matter_id, user)
    up = docs_svc.upload_or_404(db, user, a.upload_id)
    if up.document_id:
        raise HTTPException(409, "That file is already filed to a matter")
    doc = docs_svc.add_document(db, user, m.id, up.filename, up.mime_type, docs_svc.read_bytes(up.storage_path))
    up.document_id = doc.id
    db.commit()  # the document must exist before the indexing thread looks for it
    asyncio.get_running_loop().run_in_executor(None, process_document, doc.id)
    return {"document_id": str(doc.id), "filename": doc.filename, "matter_id": str(m.id), "matter": m.title}


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
    from app.services import email
    files = [(name, mime, docs_svc.read_bytes(path)) for name, mime, path in _email_files(db, user, a)]
    try:
        message_id = await email.send(db, a.to, a.subject, a.body, actor=user, reason="agent", attachments=files)
    except email.NotConfigured as e:
        raise HTTPException(409, str(e))
    return {"sent_to": a.to, "message_id": message_id, "attachments": [f[0] for f in files]}


def _email_summary(db: Session, a: SendEmailArgs) -> str:
    n = len(a.document_ids) + len(a.upload_ids)
    return f"Email {', '.join(a.to)}: {a.subject}" + (f" ({n} attachment{'s' if n > 1 else ''})" if n else "")


TOOLS: dict[str, Tool] = {t.action: t for t in [
    Tool("SEARCH_MATTERS", "Search matters", "Find matters you can open", SearchMattersArgs, _search_matters,
         lambda db, a: f"Search matters for “{a.query}”"),
    Tool("ASK_MATTER", "Ask matter documents", "Cited answer from a matter's documents", AskMatterArgs, _ask_matter,
         lambda db, a: f"Ask: {a.question}"),
    Tool("GET_MATTER", "Read matter details", "Matter facts, client contact and assigned lawyer", MatterRef, _get_matter,
         lambda db, a: f"Read {_matter_name(db, a.matter_id)}"),
    Tool("LIST_DOCUMENTS", "List matter documents", "Documents filed to a matter", MatterRef, _list_documents,
         lambda db, a: f"List documents of {_matter_name(db, a.matter_id)}"),
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
    Tool("ATTACH_FILE", "File document to matter", "Save a file attached in the chat to a matter's documents",
         AttachFileArgs, _attach_file,
         lambda db, a: f"File {_upload_name(db, a.upload_id)} to {_matter_name(db, a.matter_id)}", is_mutation=True,
         precheck=_can_use_upload),
    Tool("SEND_EMAIL", "Send email", "Email someone outside the portal, optionally with documents attached",
         SendEmailArgs, _send_email, _email_summary, is_mutation=True, is_external=True,
         roles={"admin", "partner", "lawyer", "associate"}, precheck=_can_send),
]}

AGENTS = {
    "assistant": "Ask AI", "briefing": "Daily Briefing", "matter_intel": "Matter Intelligence", "legal_research": "Legal Research",
    "scheduling": "Scheduling", "task": "Task",
}
