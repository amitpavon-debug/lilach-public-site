create or replace function public.sync_intake_booking_to_meeting()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event_id text;
  v_meeting_id bigint;
  v_meeting_status text;
  v_title text;
begin
  if TG_OP = 'UPDATE' then
    v_event_id := coalesce(nullif(new.google_event_id, ''), nullif(old.google_event_id, ''));
  else
    v_event_id := nullif(new.google_event_id, '');
  end if;

  if new.status = 'confirmed' and nullif(new.google_event_id, '') is not null then
    v_title := case
      when trim(coalesce(new.reason, '')) = 'כבר נפגשתי בעבר עם לילך' then 'טיפול - '
      else 'פגישת היכרות - '
    end || coalesce(nullif(trim(concat_ws(' ', new.first_name, new.last_name)), ''), 'מטופל/ת');

    select m.id
      into v_meeting_id
      from public.meetings m
     where m.website_booking_id = new.id
     order by m.id
     limit 1;

    if v_meeting_id is null then
      select m.id
        into v_meeting_id
        from public.meetings m
       where m.google_event_id = new.google_event_id
       order by
         (m.status <> 'cancelled_from_google') desc,
         (m.client_id is not null) desc,
         m.id asc
       limit 1;
    end if;

    if v_meeting_id is not null then
      update public.meetings
         set website_booking_id = new.id,
             title = v_title,
             meeting_date = new.booking_date,
             meeting_time = left(new.booking_time::text, 5),
             status = 'scheduled',
             google_event_id = new.google_event_id,
             duration_minutes = coalesce(duration_minutes, 50)
       where id = v_meeting_id;
    else
      insert into public.meetings (
        website_booking_id,
        client_id,
        title,
        meeting_date,
        meeting_time,
        status,
        google_event_id,
        duration_minutes,
        summary,
        notes
      ) values (
        new.id,
        null,
        v_title,
        new.booking_date,
        left(new.booking_time::text, 5),
        'scheduled',
        new.google_event_id,
        50,
        'נקבע דרך אתר לילך פבון',
        null
      );
    end if;

  elsif new.status in ('cancelled', 'cancelled_by_lilach') then
    v_meeting_status := case
      when new.status = 'cancelled_by_lilach' then 'cancelled_by_lilach'
      else 'cancelled_by_client'
    end;

    update public.meetings
       set status = v_meeting_status
     where website_booking_id = new.id
        or (v_event_id is not null and google_event_id = v_event_id);
  end if;

  return new;
end;
$function$;
