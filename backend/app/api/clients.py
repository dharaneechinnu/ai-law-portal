import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Client, User
from app.schemas import ClientIn, ClientOut
from app.services.matters import create_client as create_client_svc, update_client as update_client_svc

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=list[ClientOut])
def list_clients(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.scalars(select(Client).order_by(Client.name)).all()


@router.post("", response_model=ClientOut, status_code=201)
def create_client(body: ClientIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    client = create_client_svc(db, user, body)
    db.commit()
    return client


@router.put("/{client_id}", response_model=ClientOut)
def update_client(client_id: uuid.UUID, body: ClientIn, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    client = update_client_svc(db, client_id, body.model_dump())
    db.commit()
    return client
