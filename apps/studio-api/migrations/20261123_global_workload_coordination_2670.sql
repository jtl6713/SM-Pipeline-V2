-- Incident #2670: transactional, cross-host workload admission and DB circuit.
-- STAGED AND INERT: consumers must explicitly enable a separate flag AFTER
-- migration and two-host tests. This does not restore retired Airtable/Make.
-- A claimant makes one RPC per heavy job admission plus bounded heartbeats;
-- never an RPC for every row/REST read or media queue mutation.
CREATE TABLE IF NOT EXISTS public.studio_global_workload_scopes (
  scope text PRIMARY KEY CHECK (scope IN
    ('database', 'producer', 'idea_generation', 'native_gallery', 'rendering_review')),
  max_active integer NOT NULL CHECK (max_active BETWEEN 1 AND 8),
  circuit_until timestamptz,
  recovery_probe_required boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.studio_global_workload_scopes(scope,max_active)
VALUES ('database',1),('producer',1),('idea_generation',1),
       ('native_gallery',1),('rendering_review',1)
ON CONFLICT (scope) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.studio_global_workload_leases (
  scope text NOT NULL REFERENCES public.studio_global_workload_scopes(scope),
  claim_key text NOT NULL CHECK (claim_key ~ '^[a-f0-9]{64}$'),
  owner_fence uuid NOT NULL,
  lease_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (scope,claim_key)
);
CREATE INDEX IF NOT EXISTS studio_global_workload_active_idx
  ON public.studio_global_workload_leases(scope,lease_until);

ALTER TABLE public.studio_global_workload_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_global_workload_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_global_workload_scopes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.studio_global_workload_leases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_global_workload_scopes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_global_workload_leases TO service_role;

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
  IF v_root.recovery_probe_required THEN
    SELECT count(*) INTO v_root_active FROM public.studio_global_workload_leases
      WHERE lease_until>v_now;
    IF v_root_active > 0 THEN
      RETURN jsonb_build_object('accepted',false,'reason','database_half_open');
    END IF;
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

CREATE OR REPLACE FUNCTION public.studio_global_workload_renew(
  p_scope text, p_claim_key text, p_fence uuid, p_ttl_seconds integer
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE v_now timestamptz := clock_timestamp(); v_circuit timestamptz;
BEGIN
  IF p_ttl_seconds NOT BETWEEN 60 AND 1800 OR p_fence IS NULL THEN RETURN false; END IF;
  SELECT circuit_until INTO v_circuit FROM public.studio_global_workload_scopes
    WHERE scope='database';
  IF v_circuit IS NULL AND NOT FOUND THEN RETURN false; END IF;
  IF v_circuit > v_now THEN RETURN false; END IF;
  UPDATE public.studio_global_workload_leases
    SET lease_until=v_now+make_interval(secs=>p_ttl_seconds),updated_at=v_now
    WHERE scope=p_scope AND claim_key=p_claim_key AND owner_fence=p_fence
      AND lease_until>v_now;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.studio_global_workload_release(
  p_scope text, p_claim_key text, p_fence uuid, p_verified_progress boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE v_now timestamptz := clock_timestamp(); v_removed integer;
BEGIN
  -- Release/half-open completion cannot be performed by a stale owner.
  PERFORM 1 FROM public.studio_global_workload_scopes
    WHERE scope='database' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.studio_global_workload_leases
    WHERE scope=p_scope AND claim_key=p_claim_key AND owner_fence=p_fence
      AND lease_until>v_now;
  GET DIAGNOSTICS v_removed=ROW_COUNT;
  IF v_removed=1 AND p_verified_progress THEN
    UPDATE public.studio_global_workload_scopes
      SET recovery_probe_required=false,updated_at=v_now
      WHERE scope='database'
        AND (circuit_until IS NULL OR circuit_until<=v_now);
    UPDATE public.studio_global_workload_scopes
      SET recovery_probe_required=false,updated_at=v_now
      WHERE scope=p_scope
        AND (circuit_until IS NULL OR circuit_until<=v_now);
  END IF;
  RETURN v_removed=1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.studio_global_workload_trip(
  p_reason text, p_cooldown_seconds integer DEFAULT 90
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  IF p_reason NOT IN ('overload','timeout','http_429','http_5xx')
     OR p_cooldown_seconds NOT BETWEEN 60 AND 600 THEN RETURN false; END IF;
  UPDATE public.studio_global_workload_scopes
    SET circuit_until=GREATEST(COALESCE(circuit_until,clock_timestamp()),
          clock_timestamp()+make_interval(secs=>p_cooldown_seconds)),
        recovery_probe_required=true,updated_at=clock_timestamp()
    WHERE scope='database';
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.studio_global_workload_acquire(text,text,uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.studio_global_workload_renew(text,text,uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.studio_global_workload_release(text,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.studio_global_workload_trip(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_global_workload_acquire(text,text,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_global_workload_renew(text,text,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_global_workload_release(text,text,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_global_workload_trip(text,integer) TO service_role;
