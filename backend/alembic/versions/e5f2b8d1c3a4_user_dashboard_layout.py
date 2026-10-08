"""user dashboard layout

Revision ID: e5f2b8d1c3a4
Revises: d4e1a7c9b2f0
"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f2b8d1c3a4'
down_revision = 'd4e1a7c9b2f0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('dashboard_layout', sa.JSON(), nullable=False, server_default='{}'))


def downgrade() -> None:
    op.drop_column('users', 'dashboard_layout')
