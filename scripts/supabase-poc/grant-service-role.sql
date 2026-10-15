-- Required when "Automatically expose new tables" is off.
-- Run as postgres (SQL Editor or pooler) after 001_core_schema.sql.

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, service_role;
grant select on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, service_role;
alter default privileges in schema public grant select on tables to anon, authenticated;
