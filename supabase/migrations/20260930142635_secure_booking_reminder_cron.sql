create table if not exists public.automation_secrets (
  name text primary key,
  secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.automation_secrets enable row level security;
revoke all on table public.automation_secrets from anon, authenticated;
grant select on table public.automation_secrets to service_role;

insert into public.automation_secrets (name, secret)
values ('booking_reminders', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

select cron.unschedule('send-booking-reminders-every-5-minutes');

select cron.schedule(
  'send-booking-reminders-every-5-minutes',
  '*/5 * * * *',
  $$select net.http_get(
    url := 'https://taafqwplvzcceoynhvve.supabase.co/functions/v1/send-booking-reminders',
    headers := jsonb_build_object(
      'x-reminder-secret',
      (select secret from public.automation_secrets where name = 'booking_reminders')
    )
  );$$
);