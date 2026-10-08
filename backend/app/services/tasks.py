"""Tasks: visibility, dependencies and output. Archived instead of deleted; matter tasks write to the timeline."""
import uuid

from fastapi import HTTPException
from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.orm import Session

from app.models import Matter, Task, TaskDependency, User
from app.schemas import TaskOut
from app.services.access import visible_matter_ids


def visible_tasks(user: User) -> ColumnElement[bool]:
    """Matter tasks follow the matter's access rule; tasks without a matter are seen by their assignee and creator."""
    return or_(
        and_(Task.matter_id.is_not(None), Task.matter_id.in_(visible_matter_ids(user))),
        and_(Task.matter_id.is_(None), or_(Task.assignee_id == user.id, Task.created_by_id == user.id)),
    )


def get_task_or_404(db: Session, task_id: uuid.UUID, user: User) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id, visible_tasks(user)))
    if not task:
        raise HTTPException(404, "Task not found")
    return task


def check_assignee(db: Session, assignee_id: uuid.UUID | None) -> None:
    if assignee_id is None:
        return
    assignee = db.get(User, assignee_id)
    if not assignee or not assignee.is_active:
        raise HTTPException(400, "Assignee not found")


def _edges(db: Session) -> dict[uuid.UUID, set[uuid.UUID]]:
    out: dict[uuid.UUID, set[uuid.UUID]] = {}
    for d in db.scalars(select(TaskDependency)).all():
        out.setdefault(d.task_id, set()).add(d.depends_on_id)
    return out


def set_dependencies(db: Session, task: Task, depends_on: list[uuid.UUID], user: User) -> None:
    ids = list(dict.fromkeys(depends_on))
    if task.id in ids:
        raise HTTPException(400, "A task cannot depend on itself")
    found = set(db.scalars(select(Task.id).where(Task.id.in_(ids), visible_tasks(user))).all()) if ids else set()
    if len(found) != len(ids):
        raise HTTPException(400, "Dependency not found")
    edges = _edges(db)
    edges[task.id] = set(ids)
    # Reject cycles: walking from the new dependencies must never reach this task.
    stack, seen = list(ids), set()
    while stack:
        cur = stack.pop()
        if cur == task.id:
            raise HTTPException(400, "That would create a loop between tasks")
        if cur not in seen:
            seen.add(cur)
            stack.extend(edges.get(cur, ()))
    for d in db.scalars(select(TaskDependency).where(TaskDependency.task_id == task.id)).all():
        db.delete(d)
    for dep in ids:
        db.add(TaskDependency(task_id=task.id, depends_on_id=dep))


def open_dependencies(db: Session, task_id: uuid.UUID) -> int:
    return len(db.scalars(
        select(Task.id).join(TaskDependency, TaskDependency.depends_on_id == Task.id)
        .where(TaskDependency.task_id == task_id, Task.status == "open")
    ).all())


def to_out(db: Session, tasks: list[Task]) -> list[TaskOut]:
    if not tasks:
        return []
    ids = [t.id for t in tasks]
    deps: dict[uuid.UUID, list[uuid.UUID]] = {}
    blocked: set[uuid.UUID] = set()
    for d, status in db.execute(
        select(TaskDependency, Task.status).join(Task, Task.id == TaskDependency.depends_on_id)
        .where(TaskDependency.task_id.in_(ids))
    ).all():
        deps.setdefault(d.task_id, []).append(d.depends_on_id)
        if status == "open":
            blocked.add(d.task_id)
    matter_ids = {t.matter_id for t in tasks if t.matter_id}
    user_ids = {t.assignee_id for t in tasks if t.assignee_id}
    matters = {m.id: m.title for m in db.scalars(select(Matter).where(Matter.id.in_(matter_ids))).all()} if matter_ids else {}
    users = {u.id: u.name for u in db.scalars(select(User).where(User.id.in_(user_ids))).all()} if user_ids else {}
    return [
        TaskOut(id=t.id, title=t.title, description=t.description, matter_id=t.matter_id,
                matter_title=matters.get(t.matter_id), assignee_id=t.assignee_id, assignee_name=users.get(t.assignee_id),
                due_at=t.due_at, priority=t.priority, status=t.status, kind=t.kind, depends_on=deps.get(t.id, []),
                blocked=t.id in blocked, created_at=t.created_at)
        for t in tasks
    ]
