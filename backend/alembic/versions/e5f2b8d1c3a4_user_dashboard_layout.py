"""user dashboard layout

Revision ID: e5f2b8d1c3a4
Revises: e5b2c8d1f3a4
"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f2b8d1c3a4'
down_revision = 'e5b2c8d1f3a4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('dashboard_layout', sa.JSON(), nullable=False, server_default='{}'))


def downgrade() -> None:
    op.drop_column('users', 'dashboard_layout')
