create or replace function public.invoke_tick() returns void
language plpgsql security definer as $$
declare
  app_url     text;
  service_key text;
  vercel_bypass text;
begin
  select value into app_url     from public.app_config where key = 'app_url';
  select value into service_key from public.app_config where key = 'service_role_key';
  select value into vercel_bypass from public.app_config where key = 'vercel_protection_bypass';

  if app_url is null or service_key is null then
    raise notice 'invoke_tick: app_url or service_role_key not set in app_config, skipping';
    return;
  end if;

  perform net.http_post(
    url     := app_url || '/api/internal/tick',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key,
      'x-vercel-protection-bypass', vercel_bypass
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
end;
$$;