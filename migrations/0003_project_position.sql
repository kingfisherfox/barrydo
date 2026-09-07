-- v3: manual drag-and-drop ordering for projects (mirrors tasks v2)
-- position = ordering key; rebalanced by POST /api/projects/reorder (visible ids → i*100).
-- Backfill: creation order (oldest first), deterministic and stable.
-- Project-name uniqueness (case-insensitive) is enforced in src/db.ts, NOT by a DB index —
-- existing deployments may already hold duplicate names and migrations must never fail on them.

ALTER TABLE projects ADD COLUMN position REAL NOT NULL DEFAULT 0;
UPDATE projects SET position = id * 1000;
CREATE INDEX IF NOT EXISTS idx_projects_position ON projects(position);
