### `stall_status_history` table (design)

This table records changes to a stall's **business status** (e.g. active / inactive / under maintenance)
so that the admin reports can show an **Activity History** per stall and per day.

Suggested schema:

```sql
create table stall_status_history (
  id uuid primary key default gen_random_uuid(),
  stall_id integer not null references stalls(stall_id) on delete cascade,
  status text not null check (status in ('active', 'inactive', 'under maintenance')),
  change_source text not null default 'admin_inventory',
  changed_at timestamptz not null default timezone('utc', now()),
  -- Optionally materialize the date for simpler reporting filters
  date date generated always as (changed_at::date) stored
);

create index stall_status_history_stall_date_changed_at_idx
  on stall_status_history (stall_id, date desc, changed_at desc);
```

The application uses this table in two ways:

- **Write path**: whenever an admin updates a stall's status from the Manage Inventory screen, the
  app appends a row with the new status and `change_source = 'admin_inventory'`.
- **Read path (Activity History card)**: the reports page queries this table and, for each
  `(stall_id, date)` pair, keeps the **latest** row by `changed_at` as the summary status for that
  day.


