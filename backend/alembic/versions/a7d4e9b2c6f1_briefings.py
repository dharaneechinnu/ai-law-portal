"""briefings

Revision ID: a7d4e9b2c6f1
Revises: f3a9c2e7b1d5
"""
from alembic import op
import sqlalchemy as sa


revision = 'a7d4e9b2c6f1'
down_revision = 'f3a9c2e7b1d5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'briefings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('for_date', sa.Date(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('facts', sa.JSON(), nullable=False),
        sa.Column('source', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'for_date'),
    )
    op.create_index('ix_briefings_user_id', 'briefings', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_briefings_user_id', table_name='briefings')
    op.drop_table('briefings')
