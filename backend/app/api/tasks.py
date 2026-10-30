import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.matters import get_matter_or_404
from app.core.db import get_db
from app.models import Task, User
from app.schemas import TaskIn, TaskOut, TaskUpdate
from app.services.tasks import (
    create_task as create_task_svc, get_task_or_404, to_out, update_task as update_task_svc, visible_tasks,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


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
    task = create_task_svc(db, user, body)
    db.commit()
    return to_out(db, [task])[0]


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: uuid.UUID, body: TaskUpdate, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    task = update_task_svc(db, user, get_task_or_404(db, task_id, user), body.model_dump(exclude_unset=True))
    db.commit()
    return to_out(db, [task])[0]
