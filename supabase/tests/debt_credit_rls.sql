begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-00000000dc01'), ('00000000-0000-4000-8000-00000000dc02');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000dc01', true);
insert into public.debt_credit_data(user_id,items) values ('00000000-0000-4000-8000-00000000dc01','[{"id":"test","person":"Synthetic","amount":-12.35,"reason":"RLS test"}]');
do $$ begin
  if (select count(*) from public.debt_credit_data) <> 1 then raise exception 'Owner cannot read'; end if;
end $$;
update public.debt_credit_data set items='[]' where user_id='00000000-0000-4000-8000-00000000dc01';
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000dc02', true);
do $$ declare affected integer; begin
  if (select count(*) from public.debt_credit_data) <> 0 then raise exception 'Other user can read'; end if;
  update public.debt_credit_data set items='[{}]' where user_id='00000000-0000-4000-8000-00000000dc01';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other user can update'; end if;
  begin
    insert into public.debt_credit_data(user_id) values ('00000000-0000-4000-8000-00000000dc01');
    raise exception 'Other user can insert';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin
    perform * from public.debt_credit_data;
    raise exception 'Anon can read';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: owner insert/read/update, cross-account denied, anon denied; all fixtures rolled back' as result;
rollback;
