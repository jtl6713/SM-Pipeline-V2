-- #2670: fix cross-host global root capacity arbitration, OFF by default.
-- Previously per-scope caps were enforced but database.max_active was
-- ignored unless the circuit was half-open. That allowed one producer,
-- one gallery, one review and one I1 job to overlap at root cap 1.
-- No feature flag, producer limit or publication hold is altered.
CREATE OR REPLACE FUNCTION public.studio_global_workload_acquire(
  p_scope text, p_claim_key text, p_fence uuid, p_ttl_seconds integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_root public.studio_global_workload_scopes%ROWTYPE;
  v_config public.studio_global_workload_scopes%ROWTYPE;
  v_owner uuid;
  v_until timestamptz;
  v_active integer;
  v_root_active integer;
  v_saved integer;
  v_limit integer;
BEGIN
  IF p_scope IS NULL OR p_scope = 'database'
     OR p_claim_key !~ '^[a-f0-9]{64}$'
     OR p_fence IS NULL OR p_ttl_seconds NOT BETWEEN 60 AND 1800 THEN
    RETURN jsonb_build_object('accepted',false,'reason','invalid_parameters');
  END IF;
  -- Root first, then scope: all participating clients serialize capacity and
  -- half-open probes using the SAME transaction order across Worker/Runner.
  SELECT * INTO v_root FROM public.studio_global_workload_scopes
    WHERE scope='database' FOR UPDATE;
  SELECT * INTO v_config FROM public.studio_global_workload_scopes
    WHERE scope=p_scope FOR UPDATE;
  IF NOT FOUND OR v_root.scope IS NULL OR v_config.scope IS NULL THEN
    RETURN jsonb_build_object('accepted',false,'reason','unconfigured');
  END IF;
  IF (v_root.circuit_until IS NOT NULL AND v_root.circuit_until > v_now)
     OR (v_config.circuit_until IS NOT NULL AND v_config.circuit_until > v_now) THEN
    RETURN jsonb_build_object('accepted',false,'reason','circuit_open');
  END IF;
  SELECT owner_fence,lease_until INTO v_owner,v_until
    FROM public.studio_global_workload_leases
    WHERE scope=p_scope AND claim_key=p_claim_key;
  IF v_until > v_now THEN
    IF v_owner = p_fence THEN
      RETURN jsonb_build_object('accepted',true,'replay',true,
        'reason','already_owned');
    END IF;
    RETURN jsonb_build_object('accepted',false,'replay',false,
      'reason','other_owner');
  END IF;
  DELETE FROM public.studio_global_workload_leases WHERE lease_until <= v_now;
  SELECT count(*) INTO v_active FROM public.studio_global_workload_leases
    WHERE scope=p_scope AND lease_until>v_now;
  IF v_config.recovery_probe_required THEN
    v_limit := 1;
  ELSE
    v_limit := v_config.max_active;
  END IF;
  IF v_active >= v_limit THEN
    RETURN jsonb_build_object('accepted',false,'reason','scope_capacity');
  END IF;
  -- The database root limit bounds *all* scopes across Cloudflare
  -- isolates and independently running Windows hosts. Previous logic
  -- counted root leases ONLY during half-open recovery and ignored
  -- v_root.max_active in normal mode, permitting one job PER scope.
  SELECT count(*) INTO v_root_active FROM public.studio_global_workload_leases
    WHERE lease_until>v_now;
  IF v_root.recovery_probe_required THEN
    v_limit := 1;
  ELSE
    v_limit := v_root.max_active;
  END IF;
  IF v_root_active >= v_limit THEN
    IF v_root.recovery_probe_required THEN
      RETURN jsonb_build_object('accepted',false,'reason','database_half_open');
    END IF;
    RETURN jsonb_build_object('accepted',false,'reason','database_capacity');
  END IF;
  INSERT INTO public.studio_global_workload_leases(scope,claim_key,owner_fence,lease_until)
    VALUES (p_scope,p_claim_key,p_fence,v_now + make_interval(secs=>p_ttl_seconds))
    ON CONFLICT (scope,claim_key) DO UPDATE
      SET owner_fence=excluded.owner_fence,lease_until=excluded.lease_until,
          updated_at=v_now
      WHERE public.studio_global_workload_leases.lease_until<=v_now;
  GET DIAGNOSTICS v_saved = ROW_COUNT;
  IF v_saved = 1 THEN
    RETURN jsonb_build_object('accepted',true,'replay',false,'reason','admitted');
  END IF;
  RETURN jsonb_build_object('accepted',false,'replay',false,'reason','lease_conflict');
END;
$function$;
REVOKE ALL ON FUNCTION public.studio_global_workload_acquire(text,text,uuid,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_global_workload_acquire(text,text,uuid,integer)
  TO service_role;
