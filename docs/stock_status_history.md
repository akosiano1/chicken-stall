### `stock_status_history` table (design)

This table tracks daily stock status per stall for future Stock History features.

Suggested schema:

```sql
create table stock_status_history (
  id uuid primary key default gen_random_uuid(),
  stall_id integer not null references stalls(stall_id) on delete cascade,
  stock_level numeric,
  stock_status text not null check (stock_status in ('sold_out', 'not_sold_out')),
  date date not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index stock_status_history_stall_date_key
  on stock_status_history (stall_id, date);
```

The application uses `(stall_id, date)` as the logical unique key when upserting
today's stock status for a staff member's stall. The helpers in
`src/utils/staffReportsToday.js` (`fetchTodayStockStatus` and
`saveTodayStockStatus`) encapsulate the Supabase queries so components can read
and toggle the status without duplicating logic.



