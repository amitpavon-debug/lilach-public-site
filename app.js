(() => {
  const cfg = window.LILACH_SITE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  $("year").textContent = new Date().getFullYear();

  const msg = (el, text, ok=false) => {
    el.textContent = text;
    el.className = `form-message ${ok ? "ok" : "err"}`;
  };
  const heDays=["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
  let startOffset=1;
  let selectedDate=null;
  let selectedTime=null;
  let pendingBooking=null;

  function iso(d){return d.toISOString().slice(0,10)}
  function dateAt(offset){
    const d=new Date();
    d.setHours(12,0,0,0);
    d.setDate(d.getDate()+offset);
    return d;
  }
  function formatBookingDate(dateStr){
    try{
      const d=new Date(`${dateStr}T12:00:00`);
      return new Intl.DateTimeFormat("he-IL",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d);
    }catch(_){
      return dateStr;
    }
  }

  function renderDates(){
    const strip=$("dateStrip");
    strip.innerHTML="";
    for(let i=0;i<5;i++){
      const d=dateAt(startOffset+i);
      const b=document.createElement("button");
      b.className="date-btn"+(selectedDate===iso(d)?" active":"");
      b.innerHTML=`<small>${heDays[d.getDay()]}</small><b>${d.getDate()}.${d.getMonth()+1}</b>`;
      b.onclick=()=>selectDate(d);
      strip.appendChild(b);
    }
    const first=dateAt(startOffset),last=dateAt(startOffset+4);
    $("bookingRange").textContent=`${first.getDate()}.${first.getMonth()+1}–${last.getDate()}.${last.getMonth()+1}`;
  }

  function resetBookingFlow(){
    $("bookingPaymentStep").classList.add("hidden");
    $("bookingApprovalStep").classList.add("hidden");
    $("bookingSuccessStep").classList.add("hidden");
    $("bookingDetailsStep").classList.remove("hidden");
    $("bookingPending").innerHTML="";
    $("bookingFinalConfirmation").innerHTML="";
    $("bookingApprovalConfirmation").innerHTML="";
    $("bankDetails").classList.add("hidden");
    $("bookingMessage").textContent="";
    pendingBooking=null;
  }

  async function selectDate(d){
    selectedDate=iso(d);
    selectedTime=null;
    renderDates();
    resetBookingFlow();
    $("bookingFormWrap").classList.add("hidden");
    const slots=$("slots");
    slots.innerHTML='<p class="muted">טוען שעות פנויות...</p>';

    let times=[];
    try{
      if(cfg.BOOKING_AVAILABILITY_URL){
        const r=await fetch(`${cfg.BOOKING_AVAILABILITY_URL}?date=${selectedDate}`);
        if(!r.ok)throw new Error();
        const j=await r.json();
        times=j.slots||[];
      }else if(cfg.DEMO_BOOKING){
        times=["09:00","10:15","11:30","16:00","17:15","18:30"];
      }else throw new Error();
    }catch(_){
      times=[];
    }

    slots.innerHTML="";
    if(!times.length){
      slots.innerHTML='<p class="muted">לא נמצאו שעות פנויות ביום הזה.</p>';
      return;
    }
    times.forEach(t=>{
      const b=document.createElement("button");
      b.className="slot-btn";
      b.textContent=t;
      b.onclick=()=>{
        selectedTime=t;
        document.querySelectorAll('.slot-btn').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        resetBookingFlow();
        $("bookingFormWrap").classList.remove("hidden");
      };
      slots.appendChild(b);
    });
  }

  $("prevDays").onclick=()=>{
    startOffset=Math.max(1,startOffset-5);
    selectedDate=null;
    renderDates();
  };
  $("nextDays").onclick=()=>{
    startOffset+=5;
    selectedDate=null;
    renderDates();
  };
  renderDates();

  if(cfg.VCITA_FALLBACK_URL && !cfg.BOOKING_HOLD_URL && !cfg.DEMO_BOOKING){
    const a=$("vcitaFallback");
    a.href=cfg.VCITA_FALLBACK_URL;
    a.classList.remove("hidden");
  }

  function paymentLinkFromConfig(baseUrl, booking){
    if(!baseUrl) return "";
    return String(baseUrl)
      .replaceAll("{booking_id}", encodeURIComponent(booking.bookingId||""))
      .replaceAll("{return_url}", encodeURIComponent(booking.returnUrl||""));
  }

  function configurePaymentLink(id, url){
    const a=$(id);
    if(url){
      a.href=url;
      a.target="_blank";
      a.rel="noopener";
      a.classList.remove("disabled");
    }else{
      a.href="#";
      a.classList.add("disabled");
      a.removeAttribute("target");
    }
  }

  function showPaymentStep(booking){
    pendingBooking=booking;
    $("bookingDetailsStep").classList.add("hidden");
    $("bookingApprovalStep").classList.add("hidden");
    $("bookingSuccessStep").classList.add("hidden");
    $("bookingPaymentStep").classList.remove("hidden");

    const expiry = booking.expiresAt
      ? ` המועד נשמר עד ${new Intl.DateTimeFormat("he-IL",{hour:"2-digit",minute:"2-digit"}).format(new Date(booking.expiresAt))}.`
      : " המועד נשמר זמנית בזמן השלמת התשלום.";
    $("bookingPending").innerHTML=`<b>${booking.name}, המועד עדיין לא אושר.</b><span>${formatBookingDate(booking.date)} בשעה ${booking.time}.${expiry}<br>לאחר אימות התשלום תישלח ללילך בקשת אישור במייל וב-WhatsApp.</span>`;

    const cardUrl = booking.cardPaymentUrl || paymentLinkFromConfig(cfg.CARD_PAYMENT_URL, booking);
    const payboxUrl = booking.payboxUrl || paymentLinkFromConfig(cfg.PAYBOX_URL, booking);
    configurePaymentLink("cardPayBtn",cardUrl);
    configurePaymentLink("payboxBtn",payboxUrl);

    if(cfg.DEMO_BOOKING){
      $("demoPaidBtn").classList.remove("hidden");
    }else{
      $("demoPaidBtn").classList.add("hidden");
    }
    $("bookingPaymentStep").scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function showAwaitingApproval(booking){
    pendingBooking=booking;
    $("bookingDetailsStep").classList.add("hidden");
    $("bookingPaymentStep").classList.add("hidden");
    $("bookingSuccessStep").classList.add("hidden");
    $("bookingApprovalStep").classList.remove("hidden");
    $("bookingFormWrap").classList.remove("hidden");
    $("bookingApprovalConfirmation").innerHTML=`<b>${booking.name||"הפגישה"} — התשלום אומת.</b><span>${formatBookingDate(booking.date)} בשעה ${booking.time}.<br>לילך קיבלה בקשת אישור במייל וב-WhatsApp.</span>`;
    if(cfg.DEMO_BOOKING){
      $("demoApproveBtn").classList.remove("hidden");
    }else{
      $("demoApproveBtn").classList.add("hidden");
    }
    $("bookingApprovalStep").scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function showConfirmedBooking(booking){
    pendingBooking=booking;
    $("bookingDetailsStep").classList.add("hidden");
    $("bookingPaymentStep").classList.add("hidden");
    $("bookingApprovalStep").classList.add("hidden");
    $("bookingSuccessStep").classList.remove("hidden");
    $("bookingFormWrap").classList.remove("hidden");
    $("bookingFinalConfirmation").innerHTML=`<b>${booking.name||"הפגישה"} — אושרה על ידי לילך.</b><span>${formatBookingDate(booking.date)} בשעה ${booking.time}.<br>נשלחה לפונה הודעת WhatsApp המאשרת שהפגישה והתשלום אושרו.</span>`;
    $("bookingSuccessStep").scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function bookingPayload(){
    const firstName=$("bookFirstName").value.trim();
    const lastName=$("bookLastName").value.trim();
    return {
      date:selectedDate,
      time:selectedTime,
      firstName,
      lastName,
      name:`${firstName} ${lastName}`.trim(),
      phone:$("bookPhone").value.trim(),
      email:$("bookEmail").value.trim(),
      reason:$("bookReason").value.trim(),
      referral:$("bookReferral").value.trim(),
      privacyConsent:Boolean($("bookPrivacyConsent")?.checked),
      policyAccepted:Boolean($("bookPolicyAccepted")?.checked),
      policyText:'הנני מבינ/ה שלא ניתן לשנות תור בטווח 24 שעות מהמועד, כל שינוי בטווח זה יגרור תשלום של 150 ש"ח.'
    };
  }

  $("confirmBooking").onclick=async()=>{
    const bm=$("bookingMessage");
    const payload=bookingPayload();

    if(!selectedDate||!selectedTime){
      msg(bm,"בחרו יום ושעה.");
      return;
    }
    if(!payload.firstName||!payload.lastName||!payload.phone||!payload.reason||!payload.referral){
      msg(bm,"נא למלא שם פרטי, שם משפחה, טלפון, סיבת פנייה ומאיפה שמעת/הגעת ללילך.");
      return;
    }
    if(!payload.privacyConsent){
      msg(bm,"יש לאשר שמירת הפרטים לצורך תיאום וניהול הפגישה.");
      return;
    }
    if(!payload.policyAccepted){
      msg(bm,'כדי להמשיך יש לאשר את מדיניות שינוי התור בטווח 24 שעות.');
      return;
    }

    const btn=$("confirmBooking");
    btn.disabled=true;
    btn.textContent="שומר את המועד...";

    try{
      let booking;
      if(cfg.BOOKING_HOLD_URL){
        const returnUrl=`${location.origin}${location.pathname}?payment=success&booking_id={booking_id}#booking`;
        const r=await fetch(cfg.BOOKING_HOLD_URL,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({...payload,returnUrl})
        });
        const j=await r.json();
        if(!r.ok)throw new Error(j.error||"hold failed");
        booking={
          ...payload,
          bookingId:j.bookingId||j.booking_id,
          expiresAt:j.expiresAt||j.expires_at||null,
          cardPaymentUrl:j.cardPaymentUrl||j.card_payment_url||"",
          payboxUrl:j.payboxUrl||j.paybox_url||"",
          returnUrl
        };
        if(!booking.bookingId) throw new Error("missing booking id");
      }else if(cfg.DEMO_BOOKING){
        await new Promise(resolve=>setTimeout(resolve,450));
        booking={
          ...payload,
          bookingId:`demo-${Date.now()}`,
          expiresAt:new Date(Date.now()+15*60*1000).toISOString(),
          returnUrl:`${location.href.split("?")[0]}?payment=success#booking`
        };
      }else{
        msg(bm,"מנגנון שמירת המועד והתשלום עדיין לא חובר. הפגישה לא נקבעה.");
        return;
      }

      msg(bm,"המועד נשמר זמנית. כדי לאשר את הפגישה יש להשלים תשלום.",true);
      showPaymentStep(booking);
    }catch(e){
      console.error(e);
      msg(bm,"לא הצלחנו לשמור את המועד. ייתכן שנתפס בינתיים — נסו שעה אחרת.");
    }finally{
      btn.disabled=false;
      btn.textContent="המשך לתשלום";
    }
  };

  $("demoPaidBtn").onclick=async()=>{
    if(!pendingBooking) return;
    const btn=$("demoPaidBtn");
    btn.disabled=true;
    btn.textContent="מאמת תשלום...";
    await new Promise(resolve=>setTimeout(resolve,700));
    showAwaitingApproval({...pendingBooking,status:"awaiting_approval",paymentStatus:"paid"});
    btn.disabled=false;
    btn.textContent="הדמיית תשלום מוצלח";
  };

  $("demoApproveBtn").onclick=async()=>{
    if(!pendingBooking) return;
    const btn=$("demoApproveBtn");
    btn.disabled=true;
    btn.textContent="מאשר את הפגישה...";
    await new Promise(resolve=>setTimeout(resolve,650));
    showConfirmedBooking({...pendingBooking,status:"confirmed",approvedByLilach:true});
    btn.disabled=false;
    btn.textContent="הדמיית אישור לילך";
  };

  $("bankBtn").onclick=()=>{
    const d=cfg.BANK_TRANSFER||{};
    const box=$("bankDetails");
    if(!d.bank&&!d.branch&&!d.account&&!d.beneficiary){
      box.innerHTML="פרטי ההעברה עדיין לא הוגדרו. לאחר העברה בנקאית הפגישה תישאר בהמתנה עד לאימות התשלום. לאחר האימות תישלח ללילך בקשת אישור במייל וב-WhatsApp.";
    }else{
      box.innerHTML=`<b>${d.beneficiary||"לילך פבון"}</b><br>בנק: ${d.bank||"—"}<br>סניף: ${d.branch||"—"}<br>חשבון: ${d.account||"—"}<br><small>לאחר אימות ההעברה לילך תקבל בקשת אישור במייל וב-WhatsApp.</small>`;
    }
    box.classList.toggle("hidden");
  };

  $("newBookingBtn").onclick=()=>{
    selectedDate=null;
    selectedTime=null;
    resetBookingFlow();
    $("bookingFormWrap").classList.add("hidden");
    $("slots").innerHTML='<p class="muted">בחרו יום להצגת השעות הפנויות.</p>';
    document.querySelectorAll('.date-btn,.slot-btn').forEach(x=>x.classList.remove('active'));
    if($("bookPrivacyConsent")) $("bookPrivacyConsent").checked=false;
    if($("bookPolicyAccepted")) $("bookPolicyAccepted").checked=false;
    location.hash="#booking";
  };

  async function resumeAfterPayment(){
    const params=new URLSearchParams(location.search);
    const payment=params.get("payment");
    const bookingId=params.get("booking_id");
    if(payment!=="success" || !bookingId) return;

    location.hash="#booking";
    $("bookingFormWrap").classList.remove("hidden");
    $("bookingDetailsStep").classList.add("hidden");
    $("bookingPaymentStep").classList.remove("hidden");
    $("bookingPending").innerHTML="<b>התשלום חזר בהצלחה.</b><span>מאמתים את התשלום. לאחר אימות תישלח ללילך בקשת אישור…</span>";

    if(!cfg.BOOKING_STATUS_URL){
      $("bookingPending").innerHTML="<b>התשלום התקבל, אבל עדיין לא ניתן לאמת אותו אוטומטית.</b><span>יש לחבר BOOKING_STATUS_URL כדי להציג אישור קביעה רק אחרי אימות אמיתי מהשרת.</span>";
      return;
    }

    try{
      for(let i=0;i<6;i++){
        const r=await fetch(`${cfg.BOOKING_STATUS_URL}?booking_id=${encodeURIComponent(bookingId)}`);
        if(!r.ok) throw new Error("status failed");
        const j=await r.json();
        if(j.status==="confirmed"){
          showConfirmedBooking({
            bookingId,
            name:j.name||"הפגישה",
            email:j.email||"",
            date:j.date,
            time:j.time,
            status:"confirmed"
          });
          return;
        }
        if(j.status==="paid" || j.status==="awaiting_approval" || j.status==="payment_verified"){
          showAwaitingApproval({
            bookingId,
            name:j.name||"הפגישה",
            email:j.email||"",
            date:j.date,
            time:j.time,
            status:"awaiting_approval"
          });
          return;
        }
        if(j.status==="failed" || j.status==="cancelled"){
          $("bookingPending").innerHTML="<b>התשלום לא אושר.</b><span>הפגישה עדיין לא נקבעה. אפשר לנסות שוב או לבחור אמצעי תשלום אחר.</span>";
          return;
        }
        await new Promise(resolve=>setTimeout(resolve,1800));
      }
      $("bookingPending").innerHTML="<b>התשלום עדיין באימות.</b><span>לאחר האימות תישלח ללילך בקשת אישור. הפגישה אינה סופית עד לאישורה.</span>";
    }catch(e){
      console.error(e);
      $("bookingPending").innerHTML="<b>לא הצלחנו לבדוק את סטטוס התשלום כרגע.</b><span>לא מוצג אישור פגישה עד לקבלת אימות מהשרת.</span>";
    }
  }

  resumeAfterPayment();
})();
