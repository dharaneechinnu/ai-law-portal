"""task created by

Revision ID: f3a9c2e7b1d5
Revises: e5f2b8d1c3a4
"""
from alembic import op
import sqlalchemy as sa


revision = 'f3a9c2e7b1d5'
down_revision = 'e5f2b8d1c3a4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('created_by_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_tasks_created_by_id_users', 'tasks', 'users', ['created_by_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_tasks_created_by_id_users', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'created_by_id')
