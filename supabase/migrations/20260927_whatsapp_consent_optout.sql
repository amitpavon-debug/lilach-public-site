alter table public.intake_bookings
  add column if not exists whatsapp_consent boolean not null default false,
  add column if not exists whatsapp_opted_out_at timestamptz;

comment on column public.intake_bookings.whatsapp_consent is
  'Whether the client consented to WhatsApp messages related to booking, approval and reminders.';

comment on column public.intake_bookings.whatsapp_opted_out_at is
  'Timestamp when the client withdrew WhatsApp consent; null while consent remains active.';
