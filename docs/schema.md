# Schema — D1 (SQLite)

## projects
| column | type | notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | stable project number (`P<id>`); never reused |
| name | TEXT | required, ≤200 |
| description | TEXT | optional |
| created_at / updated_at | TEXT | ISO-8601 UTC |

## tasks
| column | type | notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | stable task number (`T<id>`, or `P<proj>-T<id>`); never reused |
| title | TEXT | required, ≤500 |
| description | TEXT | optional |
| project_id | INTEGER NULL | FK projects ON DELETE SET NULL (project delete → inbox) |
| status | TEXT | `active` \| `completed` \| `deleted` (soft delete) |
| priority | TEXT | `high` \| `medium` \| `low` \| `none` |
| due_date | TEXT NULL | YYYY-MM-DD, date only |
| position | REAL | manual drag order; rebalanced by `POST /api/tasks/reorder` (i×100); default list sort |
| created_at / updated_at | TEXT | ISO-8601 UTC |
| completed_at | TEXT NULL | set on complete, cleared on reopen/restore |
| deleted_at | TEXT NULL | set on soft delete, cleared on reopen/restore |

## Invariants
- **No hard deletes of tasks** — `deleted` status keeps history complete and refs stable.
- **History** = every task with `status != 'active'` (completed + deleted), forever.
- **Ref display** is derived: task ref mutates when the task moves between project/inbox; the numeric id never changes.
- **Task ordering** is manual (`position ASC`); new tasks append at the bottom (max position + 1000). History lists sort by `updated_at DESC` instead.
- Indexes: status, project_id, due_date, position.
