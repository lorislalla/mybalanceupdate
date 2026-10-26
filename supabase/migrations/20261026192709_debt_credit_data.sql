create table public.debt_credit_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array')
);
alter table public.debt_credit_data enable row level security;
revoke all on public.debt_credit_data from public, anon, authenticated;
grant select, insert, update on public.debt_credit_data to authenticated;
create policy debt_credit_select on public.debt_credit_data for select to authenticated using ((select auth.uid()) = user_id);
create policy debt_credit_insert on public.debt_credit_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy debt_credit_update on public.debt_credit_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter publication supabase_realtime add table public.debt_credit_data;
