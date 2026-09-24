create extension if not exists pgcrypto;

create table if not exists public.intake_bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  booking_date date not null,
  booking_time time not null,
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text,
  reason text not null,
  referral_source text not null,
  privacy_consent boolean not null default false,
  policy_accepted boolean not null default false,
  policy_text text not null,
  hold_expires_at timestamptz,
  payment_status text not null default 'pending',
  payment_reference text,
  status text not null default 'pending_payment',
  approval_token_hash text,
  approved_at timestamptz,
  google_event_id text
);

create index if not exists intake_bookings_slot_idx
  on public.intake_bookings (booking_date, booking_time, status);

alter table public.intake_bookings enable row level security;
-- No public policies are intentionally created. Edge Functions use the service-role key.
