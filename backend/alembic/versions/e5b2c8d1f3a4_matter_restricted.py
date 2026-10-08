"""matter restricted flag for case access control

Revision ID: e5b2c8d1f3a4
Revises: d4e1a7c9b2f0
"""
from alembic import op
import sqlalchemy as sa


revision = 'e5b2c8d1f3a4'
down_revision = 'd4e1a7c9b2f0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('matters', sa.Column('restricted', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('matters', 'restricted')
