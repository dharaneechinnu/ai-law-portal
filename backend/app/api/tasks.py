import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.matters import get_matter_or_404
from app.core.db import get_db
from app.models import Task, User
from app.schemas import TaskIn, TaskOut, TaskUpdate
from app.services.matters import add_timeline
from app.services.tasks import (
    check_assignee, get_task_or_404, open_dependencies, set_dependencies, to_out, visible_tasks,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])

STATUS_EVENTS = {"done": ("task_done", "Task done"), "archived": ("task_archived", "Task archived"),
                 "open": ("task_reopened", "Task reopened")}


@router.get("", response_model=list[TaskOut])
def list_tasks(status: str = "open", scope: str = "mine", matter_id: uuid.UUID | None = None,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """`scope=mine` is tasks assigned to me; `scope=all` is every task I can see. `status=any` skips the status filter."""
    q = select(Task).where(visible_tasks(user))
    if status != "any":
        q = q.where(Task.status == status)
    if scope == "mine":
        q = q.where(Task.assignee_id == user.id)
    if matter_id:
        get_matter_or_404(db, matter_id, user)
        q = q.where(Task.matter_id == matter_id)
    q = q.order_by(Task.due_at.asc().nulls_last(), Task.created_at.desc()).limit(500)
    return to_out(db, list(db.scalars(q).all()))


@router.post("", response_model=TaskOut, status_code=201)
def create_task(body: TaskIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if body.matter_id:
        get_matter_or_404(db, body.matter_id, user)
    check_assignee(db, body.assignee_id)
    task = Task(**body.model_dump(exclude={"depends_on"}), created_by_id=user.id)
    db.add(task)
    db.flush()
    set_dependencies(db, task, body.depends_on, user)
    if task.matter_id:
        add_timeline(db, task.matter_id, "task_created", f"Task added: {task.title}", user.id, {"task_id": str(task.id)})
    db.commit()
    return to_out(db, [task])[0]


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: uuid.UUID, body: TaskUpdate, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    task = get_task_or_404(db, task_id, user)
    data = body.model_dump(exclude_unset=True)
    if "assignee_id" in data:
        check_assignee(db, data["assignee_id"])
    if "depends_on" in data:
        set_dependencies(db, task, data.pop("depends_on") or [], user)
        db.flush()
    new_status = data.pop("status", None)
    for k, v in data.items():
        setattr(task, k, v)
    if new_status and new_status != task.status:
        if new_status == "done" and open_dependencies(db, task.id):
            raise HTTPException(409, "Finish the tasks this depends on first")
        task.status = new_status
        if task.matter_id:
            event, label = STATUS_EVENTS[new_status]
            add_timeline(db, task.matter_id, event, f"{label}: {task.title}", user.id, {"task_id": str(task.id)})
    db.commit()
    return to_out(db, [task])[0]
