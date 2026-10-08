"""legal data sources and matching

Revision ID: d4e1a7c9b2f0
Revises: c0dfb03e770a
"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e1a7c9b2f0'
down_revision = 'c0dfb03e770a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'legal_data_sources',
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('base_url', sa.String(length=500), nullable=True),
        sa.Column('api_key_encrypted', sa.Text(), nullable=True),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('provider'),
    )
    op.add_column('judgments', sa.Column('kind', sa.String(length=20), nullable=False, server_default='judgment'))
    op.add_column('matter_legal_matches', sa.Column('reviewed_by', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_matter_legal_matches_reviewed_by_users', 'matter_legal_matches', 'users',
                          ['reviewed_by'], ['id'])
    op.create_unique_constraint('uq_matter_legal_matches_matter_development', 'matter_legal_matches',
                                ['matter_id', 'development_id'])


def downgrade() -> None:
    op.drop_constraint('uq_matter_legal_matches_matter_development', 'matter_legal_matches', type_='unique')
    op.drop_constraint('fk_matter_legal_matches_reviewed_by_users', 'matter_legal_matches', type_='foreignkey')
    op.drop_column('matter_legal_matches', 'reviewed_by')
    op.drop_column('judgments', 'kind')
    op.drop_table('legal_data_sources')
