INSERT INTO organizations (name, slug)
VALUES ('System', 'system')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (organization_id, username, password_hash, app_role, org_role)
VALUES (
    (SELECT id FROM organizations WHERE slug = 'system'),
    'andrzej',
    '$argon2id$v=19$m=65536,t=3,p=4$m1Kuisb7ooWLP47pCWix5Q$I08hs9o1GwE0VxRblvQnA8peyiWcmQaG8X3r2p2anQU',
    'admin',
    'admin'
)
ON CONFLICT (organization_id, username) DO NOTHING;
