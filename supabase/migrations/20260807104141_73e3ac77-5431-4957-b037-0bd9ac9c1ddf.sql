REVOKE ALL ON FUNCTION public.claim_queued_sends(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_queued_sends(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_queued_sends(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_queued_sends(UUID, INTEGER) TO service_role;