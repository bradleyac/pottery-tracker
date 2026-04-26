-- Trim job_run_details to 100 rows (was 7-day window → ~10,000 rows)

-- Trim existing rows immediately
delete from cron.job_run_details
where runid not in (
  select runid from cron.job_run_details
  order by end_time desc nulls last
  limit 100
);

-- Replace the daily cleanup job with a row-count-based limit
select cron.unschedule('delete-job-run-details')
where exists (select 1 from cron.job where jobname = 'delete-job-run-details');

select cron.schedule(
  'delete-job-run-details',
  '0 12 * * *',
  $$delete from cron.job_run_details where runid not in (select runid from cron.job_run_details order by end_time desc nulls last limit 100)$$
);
