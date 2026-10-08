"""user ui prefs (dashboard layout)

Revision ID: f6c3d9e2a1b5
Revises: e5b2c8d1f3a4
"""
from alembic import op
import sqlalchemy as sa


revision = 'f6c3d9e2a1b5'
down_revision = 'e5b2c8d1f3a4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('ui_prefs', sa.JSON(), nullable=False, server_default='{}'))


def downgrade() -> None:
    op.drop_column('users', 'ui_prefs')
