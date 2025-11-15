INSERT OR IGNORE INTO folders (id, user_id, folder_path, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'demo-user',
  'demo-folder',
  '2024-01-01T00:00:00.000Z',
  '2024-01-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO documents (id, user_id, title, document_path, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  'demo-user',
  'Welcome to the Markdown Editor',
  'demo-folder/welcome-to-text-editor.md',
  '2024-01-01T00:00:00.000Z',
  '2024-01-01T00:00:00.000Z'
);
