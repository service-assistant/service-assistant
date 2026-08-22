"""add multi-tenant organization support and data isolation

Revision ID: 1a2b3c4d5e6f
Revises: 9c2f1a7b4d31
Create Date: 2026-08-19 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "1a2b3c4d5e6f"
down_revision: Union[str, None] = "9c2f1a7b4d31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TIMESTAMP_DEFAULT_TABLES = ["devices", "attachments", "chat_threads", "chunks", "messages"]


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE organizations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL
                CONSTRAINT fk_users_organization_id
                REFERENCES organizations (id) ON DELETE CASCADE,
            username VARCHAR(255) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            app_role VARCHAR(16) NOT NULL DEFAULT 'user',
            org_role VARCHAR(16) NOT NULL DEFAULT 'member',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_users_organization_id_username UNIQUE (organization_id, username)
        );
        CREATE INDEX ix_users_organization_id ON users (organization_id);

        CREATE TABLE user_sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            token_hash VARCHAR(64) NOT NULL UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL
        );
        CREATE INDEX ix_user_sessions_user_id ON user_sessions (user_id);

        INSERT INTO organizations (name, slug, created_at, updated_at)
        VALUES
            ('System', 'system', now(), now()),
            ('Default Tenant', 'default', now(), now());

        ALTER TABLE categories ADD COLUMN organization_id INTEGER;
        ALTER TABLE attachments ADD COLUMN organization_id INTEGER;

        UPDATE categories
        SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
        WHERE organization_id IS NULL;

        UPDATE attachments
        SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
        WHERE organization_id IS NULL;

        ALTER TABLE categories
            ALTER COLUMN organization_id SET NOT NULL,
            ADD CONSTRAINT fk_categories_organization_id
                FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE;
        CREATE INDEX ix_categories_organization_id ON categories (organization_id);

        ALTER TABLE attachments
            ALTER COLUMN organization_id SET NOT NULL,
            ADD CONSTRAINT fk_attachments_organization_id
                FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE;
        CREATE INDEX ix_attachments_organization_id ON attachments (organization_id);
        """
    )

    for table in TIMESTAMP_DEFAULT_TABLES:
        op.execute(f"""
            ALTER TABLE {table}
                ALTER COLUMN created_at SET DEFAULT NOW(),
                ALTER COLUMN updated_at SET DEFAULT NOW();
        """)

    op.execute(
        """
        -- Backfill any devices without a category into an "Uncategorized"
        -- root category under the default organization (devices have no
        -- direct organization_id; they inherit org via category_id).
        INSERT INTO categories (organization_id, name, image_url, parent_id)
        SELECT (SELECT id FROM organizations WHERE slug = 'default'),
               'Uncategorized', NULL::VARCHAR, NULL::INT
        WHERE EXISTS (SELECT 1 FROM devices WHERE category_id IS NULL)
          AND NOT EXISTS (
              SELECT 1 FROM categories c
              WHERE c.organization_id = (SELECT id FROM organizations WHERE slug = 'default')
                AND c.name = 'Uncategorized'
                AND c.parent_id IS NULL
          );

        UPDATE devices d
        SET category_id = c.id
        FROM categories c
        WHERE d.category_id IS NULL
          AND c.organization_id = (SELECT id FROM organizations WHERE slug = 'default')
          AND c.name = 'Uncategorized'
          AND c.parent_id IS NULL;

        ALTER TABLE devices
            ALTER COLUMN category_id SET NOT NULL,
            DROP CONSTRAINT devices_category_id_fkey,
            ADD CONSTRAINT devices_category_id_fkey
                FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT;

        ALTER TABLE categories
            DROP CONSTRAINT categories_parent_id_fkey,
            ADD CONSTRAINT fk_categories_parent_id
                FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE CASCADE;
        CREATE INDEX ix_categories_parent_id ON categories (parent_id);

        CREATE INDEX ix_chat_threads_device_id ON chat_threads (device_id);
        CREATE INDEX ix_messages_thread_id ON messages (thread_id);
        CREATE INDEX ix_chunks_attachment_id ON chunks (attachment_id);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX ix_chunks_attachment_id;
        DROP INDEX ix_messages_thread_id;
        DROP INDEX ix_chat_threads_device_id;

        DROP INDEX ix_categories_parent_id;
        ALTER TABLE categories
            DROP CONSTRAINT fk_categories_parent_id,
            ADD CONSTRAINT categories_parent_id_fkey
                FOREIGN KEY (parent_id) REFERENCES categories (id);

        ALTER TABLE devices
            DROP CONSTRAINT devices_category_id_fkey,
            ADD CONSTRAINT devices_category_id_fkey
                FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
            ALTER COLUMN category_id DROP NOT NULL;
        """
    )

    for table in TIMESTAMP_DEFAULT_TABLES:
        op.execute(f"""
            ALTER TABLE {table}
                ALTER COLUMN created_at DROP DEFAULT,
                ALTER COLUMN updated_at DROP DEFAULT;
        """)

    op.execute(
        """
        DROP INDEX ix_attachments_organization_id;
        ALTER TABLE attachments
            DROP CONSTRAINT fk_attachments_organization_id,
            DROP COLUMN organization_id;

        DROP INDEX ix_categories_organization_id;
        ALTER TABLE categories
            DROP CONSTRAINT fk_categories_organization_id,
            DROP COLUMN organization_id;

        DROP TABLE user_sessions;
        DROP TABLE users;
        DROP TABLE organizations;
        """
    )
