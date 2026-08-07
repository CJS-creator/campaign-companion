-- Function to claim queued sends atomically using FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_queued_sends(
  p_campaign_id UUID,
  p_batch_size INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  campaign_id UUID,
  lead_id UUID,
  attempt_count INT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH target_sends AS (
    SELECT s.id
    FROM public.sends s
    WHERE s.campaign_id = p_campaign_id
      AND s.status IN ('queued', 'failed')
      AND s.attempt_count < 3
    ORDER BY s.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sends s
  SET 
    status = 'sending',
    attempt_count = s.attempt_count + 1,
    last_attempt_at = now(),
    failure_reason = NULL
  FROM target_sends t
  WHERE s.id = t.id
  RETURNING s.id, s.campaign_id, s.lead_id, s.attempt_count, s.status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_queued_sends TO anon, authenticated, service_role;
