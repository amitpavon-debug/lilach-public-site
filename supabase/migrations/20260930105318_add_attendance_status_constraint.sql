alter table public.intake_bookings drop constraint if exists intake_bookings_attendance_status_check;
alter table public.intake_bookings add constraint intake_bookings_attendance_status_check check (attendance_status is null or attendance_status in ('pending','confirmed')) not valid;
alter table public.intake_bookings validate constraint intake_bookings_attendance_status_check;