-- v2: manual drag-and-drop ordering
-- position = global ordering key; rebalanced by POST /api/tasks/reorder (visible ids → i*100).
-- Backfill: creation order (oldest first), deterministic and stable.

ALTER TABLE tasks ADD COLUMN position REAL NOT NULL DEFAULT 0;
UPDATE tasks SET position = id * 1000;
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(position);
