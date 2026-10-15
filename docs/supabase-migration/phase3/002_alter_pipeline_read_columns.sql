-- Phase 3: columns used by Pipeline list projection / sync
alter table platform_outputs add column if not exists platform_output_type text;
alter table platform_outputs add column if not exists publish_method text;
