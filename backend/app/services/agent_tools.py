"""Controlled tools agents may request. Each tool calls application services only, as the requesting user, so the
normal access rules apply. Tools never run directly: agent_runtime sends every call through the policy engine first."""
import asyncio
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime
from typing import Any, Awaitable, Callable, Literal

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import AssistantUpload, CalendarEvent, Client, Document, Hearing, Matter, Task, TimelineEvent, User
from app.schemas import ClientIn, EventIn, HearingIn, HearingUpdate, MatchStatusIn, MatterIn, MatterUpdate, TaskIn, TaskUpdate
from app.services import briefing as briefing_svc
from app.services import calendar as cal_svc
from app.services import documents as docs_svc
from app.services import legal_alerts
from app.services import matters as matters_svc
from app.services import people as people_svc
from app.services import rag
from app.services.access import can_view, matter_or_404, visible_matters
from app.services.ingest import process_document
from app.services.tasks import change_status, create_task, get_task_or_404, to_out, update_task


# ---- argument schemas (validated server-side; the LLM's arguments are untrusted) ----
class SearchMattersArgs(BaseModel):
    query: str = ""
    include_closed: bool = False


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


class SearchClientsArgs(BaseModel):
    query: str = ""


class ClientUpdateArgs(BaseModel):
    client_id: uuid.UUID
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None


class MatterUpdateArgs(MatterUpdate):
    matter_id: uuid.UUID


class AddMemberArgs(BaseModel):
    matter_id: uuid.UUID
    user_id: uuid.UUID
    role: str = "member"


class TaskUpdateArgs(TaskUpdate):
    task_id: uuid.UUID
    # Done and delete have their own tools (and their own permission rules), so this one may only reopen.
    status: Literal["open"] | None = None


class CalendarArgs(BaseModel):
    start: datetime
    end: datetime


class EventRef(BaseModel):
    event_id: uuid.UUID


class EventUpdateArgs(EventRef):
    title: str | None = None
    start: datetime | None = None
    end: datetime | None = None
    location: str | None = None
    matter_id: uuid.UUID | None = None
    attendee_ids: list[uuid.UUID] | None = None


class HearingUpdateArgs(HearingUpdate):
    hearing_id: uuid.UUID


class LegalAlertsArgs(BaseModel):
    matter_id: uuid.UUID | None = None
    status: Literal["new", "reviewed", "dismissed", "all"] = "new"


class ReviewAlertArgs(MatchStatusIn):
    match_id: uuid.UUID


class NoArgs(BaseModel):
    pass


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


def _can_see_event(db: Session, user: User, a: EventRef) -> None:
    cal_svc.own_event_or_404(db, a.event_id, user)


def _can_see_hearing(db: Session, user: User, a: HearingUpdateArgs) -> None:
    cal_svc.hearing_or_404(db, a.hearing_id, user)


def _can_see_match(db: Session, user: User, a: ReviewAlertArgs) -> None:
    legal_alerts.match_or_404(db, a.match_id, user)


def _client_exists(db: Session, user: User, a: ClientUpdateArgs) -> None:
    if not db.get(Client, a.client_id):
        raise HTTPException(404, "Client not found")


def _can_manage_members(db: Session, user: User, a: AddMemberArgs) -> None:
    matters_svc.manageable_matter_or_403(db, a.matter_id, user)


def _changes(a: BaseModel, ref: str) -> dict:
    """Fields the model asked to change. Nulls are dropped: models often send every field, and a null must never
    silently clear a due date, assignee or client detail."""
    return a.model_dump(exclude_none=True, exclude={ref})


def _person(db: Session, user_id) -> str:
    u = db.get(User, user_id)
    return u.name if u else "someone"


def _change_text(db: Session, changes: dict) -> str:
    """Readable list of changes for the approval card, e.g. "due 05 Nov 17:00, assignee Priya Nair"."""
    out = []
    for k, v in changes.items():
        if k in {"assignee_id", "assigned_lawyer_id", "user_id"}:
            v = _person(db, v)
        elif k == "matter_id":
            v = _matter_name(db, v)
        elif k == "attendee_ids":
            v = ", ".join(_person(db, i) for i in v) or "nobody"
        elif isinstance(v, datetime):
            v = f"{v:%d %b %H:%M}"
        elif isinstance(v, list):
            v = ", ".join(str(i) for i in v)
        label = {"due_at": "due", "start": "start", "end": "end", "assignee_id": "assignee",
                 "assigned_lawyer_id": "lawyer", "attendee_ids": "attendees", "scheduled_at": "date"}.get(k, k)
        out.append(f"{label.replace('_', ' ')} {v}")
    return ", ".join(out) or "no changes"


def _event_title(db: Session, event_id) -> str:
    e = db.get(CalendarEvent, event_id)
    return f"“{e.title}” ({e.starts_at:%d %b %H:%M})" if e else "a meeting"


def _hearing_title(db: Session, hearing_id) -> str:
    h = db.get(Hearing, hearing_id)
    return f"hearing of {h.scheduled_at:%d %b %Y} in {_matter_name(db, h.matter_id)}" if h else "a hearing"


def _client_name(db: Session, client_id) -> str:
    c = db.get(Client, client_id)
    return f"“{c.name}”" if c else "a client"


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
    q = select(Matter).where(visible_matters(user))
    if not a.include_closed:
        q = q.where(Matter.status == "active")
    if a.query:
        like = f"%{a.query}%"
        q = q.where(or_(Matter.title.ilike(like), Matter.matter_number.ilike(like), Matter.case_number.ilike(like)))
    rows = db.scalars(q.limit(20)).all()
    return {"matters": [{"id": str(m.id), "title": m.title, "number": m.matter_number, "status": m.status} for m in rows]}


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


async def _get_timeline(db, user, a: MatterRef) -> dict:
    matter_or_404(db, a.matter_id, user)
    rows = db.scalars(select(TimelineEvent).where(TimelineEvent.matter_id == a.matter_id)
                      .order_by(TimelineEvent.occurred_at.desc()).limit(30)).all()
    return {"timeline": [{"at": e.occurred_at.isoformat(), "type": e.event_type, "title": e.title} for e in rows]}


async def _search_clients(db, user, a: SearchClientsArgs) -> dict:
    q = select(Client).order_by(Client.name)
    if a.query:
        like = f"%{a.query}%"
        q = q.where(or_(Client.name.ilike(like), Client.email.ilike(like)))
    return {"clients": [{"id": str(c.id), "name": c.name, "email": c.email, "phone": c.phone}
                        for c in db.scalars(q.limit(20)).all()]}


async def _create_client(db, user, a: ClientIn) -> dict:
    c = matters_svc.create_client(db, user, a)
    return {"client": {"id": str(c.id), "name": c.name, "email": c.email}}


async def _update_client(db, user, a: ClientUpdateArgs) -> dict:
    c = matters_svc.update_client(db, a.client_id, _changes(a, "client_id"))
    return {"client": {"id": str(c.id), "name": c.name, "email": c.email, "phone": c.phone}}


def _matter_out(m: Matter) -> dict:
    return {"id": str(m.id), "number": m.matter_number, "title": m.title, "status": m.status,
            "next_hearing": m.next_hearing.isoformat() if m.next_hearing else None}


async def _create_matter(db, user, a: MatterIn) -> dict:
    return {"matter": _matter_out(matters_svc.create_matter(db, user, a))}


async def _update_matter(db, user, a: MatterUpdateArgs) -> dict:
    m = matter_or_404(db, a.matter_id, user)
    return {"matter": _matter_out(matters_svc.update_matter(db, user, m, _changes(a, "matter_id")))}


async def _add_member(db, user, a: AddMemberArgs) -> dict:
    member, target = matters_svc.add_member(db, user, a.matter_id, a.user_id, a.role)
    return {"matter_id": str(a.matter_id), "added": target.name, "role": member.role}


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


async def _update_task(db, user, a: TaskUpdateArgs) -> dict:
    t = update_task(db, user, get_task_or_404(db, a.task_id, user), _changes(a, "task_id"))
    db.flush()
    return {"task": to_out(db, [t])[0].model_dump(mode="json")}


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


async def _list_calendar(db, user, a: CalendarArgs) -> dict:
    cal_svc.check_times(a.start, a.end)
    if (a.end - a.start).days > 62:
        raise HTTPException(400, "Range is limited to about two months")
    return {"items": [i.model_dump(mode="json") for i in cal_svc.items_between(db, user, a.start, a.end)]}


async def _create_event(db, user, a: EventIn) -> dict:
    return {"event": (await cal_svc.create_event(db, user, a)).model_dump(mode="json")}


async def _update_event(db, user, a: EventUpdateArgs) -> dict:
    event = cal_svc.own_event_or_404(db, a.event_id, user)
    return {"event": (await cal_svc.update_event(db, user, event, _changes(a, "event_id"))).model_dump(mode="json")}


async def _cancel_event(db, user, a: EventRef) -> dict:
    # Cancelled, not erased: the event stays on record with status "cancelled".
    event = cal_svc.own_event_or_404(db, a.event_id, user)
    return {"event": (await cal_svc.update_event(db, user, event, {"status": "cancelled"})).model_dump(mode="json")}


async def _list_hearings(db, user, a: MatterRef) -> dict:
    matter_or_404(db, a.matter_id, user)
    rows = db.scalars(select(Hearing).where(Hearing.matter_id == a.matter_id).order_by(Hearing.scheduled_at.desc())
                      .limit(30)).all()
    return {"hearings": [cal_svc.hearing_out(db, h).model_dump(mode="json") for h in rows]}


async def _create_hearing(db, user, a: HearingIn) -> dict:
    return {"hearing": cal_svc.hearing_out(db, cal_svc.create_hearing(db, user, a)).model_dump(mode="json")}


async def _update_hearing(db, user, a: HearingUpdateArgs) -> dict:
    h = cal_svc.update_hearing(db, user, cal_svc.hearing_or_404(db, a.hearing_id, user), _changes(a, "hearing_id"))
    return {"hearing": cal_svc.hearing_out(db, h).model_dump(mode="json")}


async def _list_legal_alerts(db, user, a: LegalAlertsArgs) -> dict:
    if a.matter_id:
        matter_or_404(db, a.matter_id, user)
    rows = [m for m in legal_alerts.alerts(db, user, a.status) if not a.matter_id or m.matter_id == a.matter_id]
    return {"alerts": [{"match_id": str(m.id), "matter": m.matter_title, "matter_id": str(m.matter_id),
                        "relevance": m.relevance, "status": m.status, "judgment": m.judgment.title,
                        "court": m.judgment.court_name, "signals": m.signals} for m in rows[:20]]}


async def _review_alert(db, user, a: ReviewAlertArgs) -> dict:
    match = legal_alerts.match_or_404(db, a.match_id, user)
    legal_alerts.set_status(db, user, match, a.status)
    return {"match_id": str(match.id), "status": match.status}


async def _today(db, user, a: NoArgs) -> dict:
    return {"today": briefing_svc.collect_facts(db, user), "timezone": user.timezone}


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
    # ---- read-only (allowed by default) ----
    Tool("SEARCH_MATTERS", "Search matters", "Find matters you can open (active ones unless include_closed)",
         SearchMattersArgs, _search_matters, lambda db, a: f"Search matters for “{a.query}”"),
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
    Tool("GET_TIMELINE", "Read matter timeline", "Recent events on a matter's timeline", MatterRef, _get_timeline,
         lambda db, a: f"Read the timeline of {_matter_name(db, a.matter_id)}"),
    Tool("SEARCH_CLIENTS", "Search clients", "Find clients by name or email", SearchClientsArgs, _search_clients,
         lambda db, a: f"Search clients for “{a.query}”"),
    Tool("LIST_CALENDAR", "Read calendar", "Your meetings and hearings between two times", CalendarArgs,
         _list_calendar, lambda db, a: f"Read calendar {a.start:%d %b} to {a.end:%d %b}"),
    Tool("LIST_HEARINGS", "List hearings", "Court hearings of a matter", MatterRef, _list_hearings,
         lambda db, a: f"List hearings of {_matter_name(db, a.matter_id)}"),
    Tool("LIST_LEGAL_ALERTS", "List legal alerts", "Judgments flagged as relevant to your matters", LegalAlertsArgs,
         _list_legal_alerts, lambda db, a: "List legal alerts"),
    Tool("GET_TODAY", "Read today's agenda", "Hearings, meetings, due and overdue tasks and alerts for today", NoArgs,
         _today, lambda db, a: "Read today's agenda"),
    # ---- changes (ask first by default) ----
    Tool("CREATE_TASK", "Create task", "Add a task with assignee and due date", TaskIn, _create_task,
         lambda db, a: f"Create task “{a.title}”", is_mutation=True),
    Tool("UPDATE_TASK", "Update task", "Change a task's title, notes, assignee, due date or priority, or reopen it",
         TaskUpdateArgs, _update_task,
         lambda db, a: f"Update {_task_title(db, a.task_id)}: {_change_text(db, _changes(a, 'task_id'))}",
         is_mutation=True, precheck=_can_see_task),
    Tool("COMPLETE_TASK", "Complete task", "Mark a task done", TaskRef, _complete_task,
         lambda db, a: f"Mark {_task_title(db, a.task_id)} done", is_mutation=True, precheck=_can_see_task),
    Tool("DELETE_TASK", "Delete task", "Remove a task (it is archived, never erased)", TaskRef, _delete_task,
         lambda db, a: f"Delete {_task_title(db, a.task_id)}", is_mutation=True, is_destructive=True,
         roles={"admin", "partner", "lawyer", "associate"}, default="DISABLED", precheck=_can_see_task),
    Tool("CREATE_EVENT", "Schedule meeting", "Book a calendar event and invite people", EventIn, _create_event,
         lambda db, a: f"Schedule “{a.title}” on {a.start:%d %b, %H:%M}", is_mutation=True),
    Tool("UPDATE_EVENT", "Reschedule meeting", "Move, rename or re-invite people to a meeting you organise",
         EventUpdateArgs, _update_event,
         lambda db, a: f"Change {_event_title(db, a.event_id)}: {_change_text(db, _changes(a, 'event_id'))}",
         is_mutation=True, precheck=_can_see_event),
    Tool("CANCEL_EVENT", "Cancel meeting", "Cancel a meeting you organise (kept on record as cancelled)", EventRef,
         _cancel_event, lambda db, a: f"Cancel {_event_title(db, a.event_id)}", is_mutation=True, is_destructive=True,
         precheck=_can_see_event),
    Tool("CREATE_HEARING", "Add hearing", "Add a court hearing to a matter", HearingIn, _create_hearing,
         lambda db, a: f"Add hearing on {a.scheduled_at:%d %b %Y, %H:%M} to {_matter_name(db, a.matter_id)}",
         is_mutation=True),
    Tool("UPDATE_HEARING", "Update hearing", "Move a hearing or record its status and outcome", HearingUpdateArgs,
         _update_hearing,
         lambda db, a: f"Update {_hearing_title(db, a.hearing_id)}: {_change_text(db, _changes(a, 'hearing_id'))}",
         is_mutation=True, precheck=_can_see_hearing),
    Tool("CREATE_CLIENT", "Add client", "Add a new client", ClientIn, _create_client,
         lambda db, a: f"Add client “{a.name}”", is_mutation=True),
    Tool("UPDATE_CLIENT", "Update client", "Change a client's name or contact details", ClientUpdateArgs,
         _update_client,
         lambda db, a: f"Update {_client_name(db, a.client_id)}: {_change_text(db, _changes(a, 'client_id'))}",
         is_mutation=True, precheck=_client_exists),
    Tool("CREATE_MATTER", "Open matter", "Open a new matter for a client", MatterIn, _create_matter,
         lambda db, a: f"Open matter “{a.title}” for {_client_name(db, a.client_id)}", is_mutation=True),
    Tool("UPDATE_MATTER", "Update matter", "Change a matter's details or status (e.g. close it)", MatterUpdateArgs,
         _update_matter,
         lambda db, a: f"Update {_matter_name(db, a.matter_id)}: {_change_text(db, _changes(a, 'matter_id'))}",
         is_mutation=True),
    Tool("ADD_MATTER_MEMBER", "Add person to matter", "Give a colleague access to a matter", AddMemberArgs,
         _add_member, lambda db, a: f"Add {_person(db, a.user_id)} to {_matter_name(db, a.matter_id)}",
         is_mutation=True, precheck=_can_manage_members),
    Tool("REVIEW_LEGAL_ALERT", "Review legal alert", "Mark a legal alert reviewed or dismissed", ReviewAlertArgs,
         _review_alert, lambda db, a: f"Mark legal alert {a.status}", is_mutation=True, precheck=_can_see_match),
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
