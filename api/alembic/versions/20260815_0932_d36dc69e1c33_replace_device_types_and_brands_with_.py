"""replace device_types and brands with categories

Revision ID: d36dc69e1c33
Revises: 5e8c4b1d7a90
Create Date: 2026-08-15 09:32:05.707417

"""

from typing import Sequence, Union

from alembic import op


revision: str = "d36dc69e1c33"
down_revision: Union[str, None] = "5e8c4b1d7a90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE categories (
            id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            image_url VARCHAR(255),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            parent_id INT REFERENCES categories(id),
            temp_brand_id INT REFERENCES brands(id),
            temp_device_type_id INT REFERENCES device_types(id)
            );

        -- Level 1) Insert brands
        INSERT INTO categories(temp_brand_id, name, image_url, created_at, updated_at) 
        SELECT id, name, logo_url, created_at, updated_at FROM brands;

        -- Level 2) Insert device types under brands
        INSERT INTO categories(temp_device_type_id, temp_brand_id, parent_id, name, created_at, updated_at)
        SELECT dt.id, c.temp_brand_id, c.id, dt.name, dt.created_at, dt.updated_at from categories AS c
        LEFT JOIN devices AS d
        ON d.brand_id = c.temp_brand_id
        INNER JOIN device_types AS dt
        ON d.device_type_id = dt.id;

        -- Add references from devices to categories
        ALTER TABLE devices ADD COLUMN category_id INT;
        ALTER TABLE devices ADD CONSTRAINT devices_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;

        UPDATE devices AS d
        SET category_id = c.id
        FROM categories AS c
        WHERE c.temp_device_type_id = d.device_type_id AND c.temp_brand_id = d.brand_id;

        -- Remove temporary columns needed for this migration
        ALTER TABLE categories
        DROP COLUMN temp_brand_id,
        DROP COLUMN temp_device_type_id;

        -- Remove from now unused columns and tables
        ALTER TABLE devices 
        DROP CONSTRAINT devices_device_type_id_fkey,
        DROP COLUMN device_type_id,
        DROP CONSTRAINT devices_brand_id_fkey,
        DROP COLUMN brand_id;

        DROP TABLE brands;
        DROP TABLE device_types;
    """)


def downgrade() -> None:
    op.execute(""""
        CREATE TABLE device_types (
            id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name VARCHAR NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE brands (
            id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name VARCHAR NOT NULL,
            logo_url VARCHAR,
            created_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ
        );

        DROP TABLE categories;
               """)
