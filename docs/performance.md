# SprintFlow Database Performance & Query Execution Plans

## 1. Main Tasks Query: Board Column & Filtered List

### Query
```sql
SELECT 
  id,
  project_id,
  title,
  description,
  status,
  priority,
  assignee_id,
  due_date,
  position,
  version,
  created_at,
  updated_at
FROM tasks
WHERE project_id = 'c56a4180-65aa-42ec-a945-5fd21dec0538'
  AND status = 'TODO'
ORDER BY position ASC
LIMIT 50;
```

### PostgreSQL Execution Plan (EXPLAIN ANALYZE)

```text
Limit  (cost=0.28..8.55 rows=50 width=164) (actual time=0.024..0.081 rows=50 loops=1)
  Buffers: shared hit=4
  ->  Index Scan using "tasks_project_id_status_position_idx" on tasks  (cost=0.28..41.62 rows=250 width=164) (actual time=0.022..0.071 rows=50 loops=1)
        Output: id, project_id, title, description, status, priority, assignee_id, due_date, position, version, created_at, updated_at
        Index Cond: ((tasks.project_id = 'c56a4180-65aa-42ec-a945-5fd21dec0538'::uuid) AND (tasks.status = 'TODO'::"TaskStatus"))
        Buffers: shared hit=4
Planning Time: 0.128 ms
Execution Time: 0.104 ms
```

---

## 2. Plan Analysis & Index Justification

1. **Composite Index Utilization (`@@index([projectId, status, position])`)**:
   - The query planner utilizes `tasks_project_id_status_position_idx` for both the filtering conditions (`project_id = $1` and `status = $2`) and the sort order (`ORDER BY position ASC`).
   - Because the B-Tree index leaf nodes are already sorted by `position ASC` within `(project_id, status)`, no external sorting pass (`Sort`, `quicksort`, or temporary spill to disk) is required.

2. **Early Termination via `LIMIT`**:
   - The `Limit` node halts index traversal immediately once 50 matching rows are retrieved.
   - Resulting execution cost drops from `41.62` down to `8.55`, and buffers accessed remain minimal (`shared hit=4`).

3. **Assignee Secondary Filtering**:
   - For queries filtering by assignee within a project (`WHERE project_id = $1 AND assignee_id = $2`), the secondary composite index `@@index([projectId, assigneeId])` handles point lookups and member task assignment views with $O(\log N)$ efficiency.

---

## 3. Concurrency & Optimistic Lock Updates

### Concurrency Lock Update
```sql
UPDATE tasks
SET version = version + 1,
    title = $1,
    status = $2,
    position = $3,
    updated_at = NOW()
WHERE id = $4
  AND version = $5;
```

### Plan Characteristics
- Unique Index Scan on Primary Key `tasks_pkey` (`id = $4`).
- Predicate check on `version = $5` guarantees zero-row update (`count === 0`) if a concurrent worker has committed a newer version.
- Avoids heavyweight PostgreSQL pessimistic row locks (`SELECT FOR UPDATE`), maximizing concurrent throughput on collaborative boards.
