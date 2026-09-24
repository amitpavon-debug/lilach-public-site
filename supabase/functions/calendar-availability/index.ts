import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, googleToken, localIso } from "../_shared_google.ts";
serve(async (req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  try{
    const url=new URL(req.url), date=url.searchParams.get("date");
    if(!date) return Response.json({error:"date required"},{status:400,headers:corsHeaders});
    const workdays=(Deno.env.get("INTAKE_WORKDAYS")||"0,1,2,3,4").split(",").map(Number);
    const day=new Date(`${date}T12:00:00+03:00`).getDay();
    if(!workdays.includes(day)) return Response.json({slots:[]},{headers:corsHeaders});
    const startH=Number(Deno.env.get("INTAKE_START_HOUR")||9), endH=Number(Deno.env.get("INTAKE_END_HOUR")||19), duration=Number(Deno.env.get("INTAKE_DURATION_MINUTES")||50);
    const token=await googleToken(), calendarId=Deno.env.get("GOOGLE_CALENDAR_ID")||"primary";
    const timeMin=localIso(date,String(startH).padStart(2,"0")+":00"), timeMax=localIso(date,String(endH).padStart(2,"0")+":00");
    const fb=await fetch("https://www.googleapis.com/calendar/v3/freeBusy",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({timeMin,timeMax,timeZone:"Asia/Jerusalem",items:[{id:calendarId}]})});
    if(!fb.ok) throw new Error("freebusy failed");
    const j=await fb.json(), busy=j.calendars?.[calendarId]?.busy||[];
    const slots=[];
    for(let mins=startH*60; mins+duration<=endH*60; mins+=60){
      const hh=String(Math.floor(mins/60)).padStart(2,"0"), mm=String(mins%60).padStart(2,"0"), start=new Date(localIso(date,`${hh}:${mm}`)), end=new Date(start.getTime()+duration*60000);
      const overlap=busy.some((b:any)=>new Date(b.start)<end && new Date(b.end)>start); if(!overlap) slots.push(`${hh}:${mm}`);
    }
    return Response.json({slots},{headers:{...corsHeaders,"Content-Type":"application/json"}});
  }catch(e){return Response.json({error:String(e)},{status:500,headers:corsHeaders})}
});
