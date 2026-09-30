create or replace function public.booking_slot_is_allowed(
  p_date date,
  p_time time,
  p_duration_minutes integer default 50
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weekday integer := extract(dow from p_date)::integer;
  v_has_exceptions boolean;
  v_has_weekly boolean;
  v_fallback boolean := false;
begin
  select exists(
    select 1 from public.booking_availability_exceptions
    where exception_date = p_date
  ) into v_has_exceptions;

  if v_has_exceptions then
    if exists(
      select 1 from public.booking_availability_exceptions
      where exception_date = p_date and mode = 'closed'
    ) then
      return false;
    end if;

    return exists(
      select 1
      from public.booking_availability_exceptions
      where exception_date = p_date
        and mode = 'custom'
        and p_time >= start_time
        and (p_time + make_interval(mins => p_duration_minutes)) <= end_time
        and mod(round(extract(epoch from (p_time - start_time)) / 60)::integer, 60) = 0
    );
  end if;

  select exists(
    select 1 from public.booking_availability_weekly
    where weekday = v_weekday
  ) into v_has_weekly;

  if v_has_weekly then
    return exists(
      select 1
      from public.booking_availability_weekly
      where weekday = v_weekday
        and enabled = true
        and p_time >= start_time
        and (p_time + make_interval(mins => p_duration_minutes)) <= end_time
        and mod(round(extract(epoch from (p_time - start_time)) / 60)::integer, 60) = 0
    );
  end if;

  if v_weekday in (0,1,3) then
    v_fallback := p_time >= time '09:00'
      and (p_time + make_interval(mins => p_duration_minutes)) <= time '16:00'
      and mod(round(extract(epoch from (p_time - time '09:00')) / 60)::integer, 60) = 0;
  elsif v_weekday = 2 then
    v_fallback := (
      p_time >= time '09:00'
      and (p_time + make_interval(mins => p_duration_minutes)) <= time '13:00'
      and mod(round(extract(epoch from (p_time - time '09:00')) / 60)::integer, 60) = 0
    ) or (
      p_time >= time '17:00'
      and (p_time + make_interval(mins => p_duration_minutes)) <= time '21:00'
      and mod(round(extract(epoch from (p_time - time '17:00')) / 60)::integer, 60) = 0
    );
  elsif v_weekday = 4 then
    v_fallback := p_time >= time '09:00'
      and (p_time + make_interval(mins => p_duration_minutes)) <= time '15:00'
      and mod(round(extract(epoch from (p_time - time '09:00')) / 60)::integer, 60) = 0;
  end if;

  return v_fallback;
end;
$$;

revoke all on function public.booking_slot_is_allowed(date,time,integer) from public;
grant execute on function public.booking_slot_is_allowed(date,time,integer) to service_role;

create or replace function public.enforce_intake_booking_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.booking_slot_is_allowed(new.booking_date, new.booking_time, 50) then
    raise exception 'slot_outside_availability';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_intake_booking_availability on public.intake_bookings;
create trigger trg_enforce_intake_booking_availability
before insert or update of booking_date, booking_time on public.intake_bookings
for each row execute function public.enforce_intake_booking_availability();
