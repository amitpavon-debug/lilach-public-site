alter table public.intake_bookings
  add column if not exists attendance_status text,
  add column if not exists attendance_responded_at timestamptz,
  add column if not exists reminder_24h_sent_at timestamptz;

create index if not exists intake_bookings_attendance_followup_idx
  on public.intake_bookings (status, attendance_status, reminder_24h_sent_at, booking_date, booking_time);