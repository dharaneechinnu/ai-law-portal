"""assistant uploads

Revision ID: c9d3e6a1f4b7
Revises: b8e3f1a5d9c2
"""
from alembic import op
import sqlalchemy as sa


revision = 'c9d3e6a1f4b7'
down_revision = 'b8e3f1a5d9c2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'assistant_uploads',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('filename', sa.String(length=300), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('storage_path', sa.String(length=500), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_assistant_uploads_user_id', 'assistant_uploads', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_assistant_uploads_user_id', table_name='assistant_uploads')
    op.drop_table('assistant_uploads')
