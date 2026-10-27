-- Prepared for publication after local review; not applied to the online database.
alter table public.monthly_reports
  add column balance_recorded boolean,
  add column investment_value numeric,
  add column investment_net_flow numeric;
