(() => {
  const cfg = window.LILACH_SITE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  $("year").textContent = new Date().getFullYear();

  // Count one anonymous visit per browser tab session. No personal identifier is sent.
  try {
    const visitKey = "lilach-anonymous-visit-v1";
    if (cfg.SITE_ANALYTICS_URL && !sessionStorage.getItem(visitKey)) {
      sessionStorage.setItem(visitKey, "1");
      fetch(cfg.SITE_ANALYTICS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "visit" }),
        keepalive: true
      }).catch(() => {});
    }
  } catch (_) {}

  const navigationPicker = $("navigationPicker");
  const openNavigationPicker = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    if(!navigationPicker) return;
    navigationPicker.classList.remove("hidden");
    document.documentElement.classList.add("nav-picker-open");
    navigationPicker.querySelector(".nav-picker__close")?.focus();
  };
  const closeNavigationPicker = () => {
    if(!navigationPicker) return;
    navigationPicker.classList.add("hidden");
    document.documentElement.classList.remove("nav-picker-open");
  };

  document.querySelectorAll("[data-nav-picker]").forEach((el) => {
    el.addEventListener("click", openNavigationPicker);
  });
  navigationPicker?.querySelectorAll("[data-nav-close]").forEach((el) => {
    el.addEventListener("click", closeNavigationPicker);
  });
  navigationPicker?.addEventListener("click", (event) => {
    if(event.target === navigationPicker) closeNavigationPicker();
  });
  document.addEventListener("keydown", (event) => {
    if(event.key === "Escape" && navigationPicker && !navigationPicker.classList.contains("hidden")){
      closeNavigationPicker();
    }
  });

  const bookingModal = $("bookingModal");
  let bookingReturnFocus = null;

  const openBookingModal = (event) => {
    event?.preventDefault?.();
    if(!bookingModal) return;
    bookingReturnFocus = event?.currentTarget || document.activeElement;
    bookingModal.classList.remove("hidden");
    document.documentElement.classList.add("booking-modal-open");
    requestAnimationFrame(() => {
      bookingModal.querySelector(".booking-modal__close")?.focus();
    });
  };

  const closeBookingModal = () => {
    if(!bookingModal) return;
    bookingModal.classList.add("hidden");
    document.documentElement.classList.remove("booking-modal-open");
    if(location.hash === "#booking"){
      history.replaceState(null, "", location.pathname + location.search);
    }
    if(bookingReturnFocus && typeof bookingReturnFocus.focus === "function"){
      bookingReturnFocus.focus();
    }
  };

  document.querySelectorAll('a[href="#booking"], [data-open-booking]').forEach((el) => {
    el.addEventListener("click", openBookingModal);
  });
  bookingModal?.querySelectorAll("[data-booking-close]").forEach((el) => {
    el.addEventListener("click", closeBookingModal);
  });
  document.addEventListener("keydown", (event) => {
    if(event.key === "Escape" && bookingModal && !bookingModal.classList.contains("hidden")){
      closeBookingModal();
    }
  });
  if(location.hash === "#booking"){
    openBookingModal();
  }


  const msg = (el, text, ok=false) => {
    el.textContent = text;
    el.className = `form-message ${ok ? "ok" : "err"}`;
  };
  const HE_DAYS=["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
  const RETURNING_CLIENT_VALUE="כבר נפגשתי בעבר עם לילך";
  let visibleDates=[];
  let dateCursor=new Date();
  dateCursor.setHours(12,0,0,0);
  let selectedDate=null;
  let selectedTime=null;
  let pendingBooking=null;

  function iso(d){return d.toISOString().slice(0,10)}
  function cloneDate(d){return new Date(d.getTime())}
  function isBookableWeekday(d){return d.getDay()!==5 && d.getDay()!==6}
  function formatBookingDate(dateStr){
    try{
      const d=new Date(dateStr+"T12:00:00");
      return new Intl.DateTimeFormat("he-IL",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d);
    }catch(_){
      return dateStr;
    }
  }

  function appointmentType(){
    return document.querySelector('input[name="appointmentType"]:checked')?.value||"intake";
  }

  function renderDates(){
    const strip=$("dateStrip");
    if(!strip) return;
    strip.innerHTML="";
    visibleDates.forEach((d)=>{
      const key=iso(d);
      const b=document.createElement("button");
      b.type="button";
      b.className="bk-day date-btn"+(selectedDate===key?" active is-selected":"");
      b.dataset.date=key;
      b.innerHTML="<b>"+d.getDate()+"."+(d.getMonth()+1)+"</b><small>"+HE_DAYS[d.getDay()]+"</small>";
      b.onclick=()=>selectDate(d);
      strip.appendChild(b);
    });
  }

  function appendMoreDates(count=5){
    let d=cloneDate(dateCursor);
    let added=0;
    while(added<count){
      d.setDate(d.getDate()+1);
      if(!isBookableWeekday(d)) continue;
      visibleDates.push(cloneDate(d));
      added++;
    }
    dateCursor=cloneDate(d);
    renderDates();
  }

  function resetDateWindow(){
    visibleDates=[];
    dateCursor=new Date();
    dateCursor.setHours(12,0,0,0);
    selectedDate=null;
    selectedTime=null;
    appendMoreDates(5);
    if($("slots")) $("slots").innerHTML='<p class="muted">בחרו יום להצגת השעות הפנויות.</p>';
    $("bookingFormWrap")?.classList.add("hidden");
    $("bookingFormWrap")?.classList.remove("is-open");
  }

  function syncAppointmentTypeFields(){
    const intake=appointmentType()==="intake";
    const group=$("firstVisitFields");
    const reason=$("bookReason");
    const referral=$("bookReferral");
    const note=$("bookingContextNote");
    const required=$("bookingRequiredNote");
    if(group) group.hidden=!intake;
    if(reason){
      reason.disabled=!intake;
      reason.required=intake;
      reason.setAttribute("aria-required",intake?"true":"false");
    }
    if(referral){
      referral.disabled=!intake;
      referral.required=intake;
      referral.setAttribute("aria-required",intake?"true":"false");
    }
    if(note){
      note.innerHTML=intake
        ? "<strong>פגישת אינטייק ראשונית — פנייה ראשונה.</strong> נוסיף גם כמה פרטים קצרים כדי שלילך תוכל להתכונן לפגישה."
        : "<strong>טיפול רגשי — למי שכבר נפגש/ה עם לילך.</strong> אין צורך למלא שוב סיבת פנייה או מאיפה הגעת ללילך.";
    }
    if(required){
      required.textContent=intake
        ? "* שם פרטי, שם משפחה, טלפון, אימייל, סיבת הפנייה, מקור ההגעה ושני האישורים הם חובה."
        : "* שם פרטי, שם משפחה, טלפון, אימייל ושני האישורים הם חובה.";
    }
  }

  function resetBookingFlow(){
    $("bookingPaymentStep").classList.add("hidden");
    $("bookingApprovalStep").classList.add("hidden");
    $("bookingSuccessStep").classList.add("hidden");
    $("bookingDetailsStep").classList.remove("hidden");
    $("bookingPending").innerHTML="";
    $("bookingFinalConfirmation").innerHTML="";
    $("bookingApprovalConfirmation").innerHTML="";
    $("bankDetails")?.classList.add("hidden");
    $("bookingMessage").textContent="";
    pendingBooking=null;
  }

  async function selectDate(d){
    selectedDate=iso(d);
    selectedTime=null;
    renderDates();
    resetBookingFlow();
    syncAppointmentTypeFields();
    $("bookingFormWrap")?.classList.add("hidden");
    $("bookingFormWrap")?.classList.remove("is-open");
    const slots=$("slots");
    slots.innerHTML='<p class="muted">טוען שעות פנויות...</p>';

    let times=[];
    try{
      if(cfg.BOOKING_AVAILABILITY_URL){
        const appointmentType=document.querySelector('input[name="appointmentType"]:checked')?.value||"intake";
        const r=await fetch(`${cfg.BOOKING_AVAILABILITY_URL}?date=${selectedDate}&appointmentType=${encodeURIComponent(appointmentType)}`);
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
      b.type="button";
      b.className="bk-slot slot-btn";
      b.textContent=t;
      b.onclick=()=>{
        selectedTime=t;
        document.querySelectorAll('#slots .slot-btn').forEach(x=>x.classList.remove('active','is-selected'));
        b.classList.add('active','is-selected');
        resetBookingFlow();
        syncAppointmentTypeFields();
        $("bookingFormWrap")?.classList.remove("hidden");
        $("bookingFormWrap")?.classList.add("is-open");
        $("bookingFormWrap")?.scrollIntoView({behavior:"smooth",block:"nearest"});
      };
      slots.appendChild(b);
    });
  }

  $("moreDatesBtn")?.addEventListener("click",()=>{
    appendMoreDates(5);
    const btn=$("moreDatesBtn");
    if(btn) btn.textContent="הצגת 5 מועדים נוספים";
  });
  appendMoreDates(5);

  document.querySelectorAll('input[name="appointmentType"]').forEach((input)=>{
    input.addEventListener("change",()=>{
      selectedTime=null;
      syncAppointmentTypeFields();
      $("bookingFormWrap")?.classList.add("hidden");
      $("bookingFormWrap")?.classList.remove("is-open");
      if(selectedDate){
        const selected=new Date(selectedDate+"T12:00:00");
        selectDate(selected);
      }else if($("slots")){
        $("slots").innerHTML='<p class="muted">בחרו יום להצגת השעות הפנויות.</p>';
      }
    });
  });

  document.querySelectorAll("[data-book-type]").forEach((a)=>{
    a.addEventListener("click",()=>{
      const type=a.dataset.bookType;
      const r=document.querySelector('input[name="appointmentType"][value="'+type+'"]');
      if(r){
        r.checked=true;
        r.dispatchEvent(new Event("change",{bubbles:true}));
      }
    });
  });
  syncAppointmentTypeFields();


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
    if(!a) return;
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
    $("bookingPending").innerHTML=`<b>${booking.name}, המועד נשמר זמנית לצורך תשלום.</b><span>${formatBookingDate(booking.date)} בשעה ${booking.time}.${expiry}<br>לתשלום כעת: <strong>150 ₪</strong>. רק לאחר בדיקת התשלום ב-PayBox תישלח ללילך בקשת אישור.</span>`;

    const cardUrl = booking.cardPaymentUrl || paymentLinkFromConfig(cfg.CARD_PAYMENT_URL, booking);
    const payboxUrl = booking.payboxUrl || paymentLinkFromConfig(cfg.PAYBOX_URL, booking);
    configurePaymentLink("cardPayBtn",cardUrl);
    configurePaymentLink("payboxBtn",payboxUrl);

    const demoPaidBtn=$("demoPaidBtn");
    if(demoPaidBtn) demoPaidBtn.classList.toggle("hidden",!cfg.DEMO_BOOKING);
    $("bookingPaymentStep").scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function showAwaitingApproval(booking){
    pendingBooking=booking;
    $("bookingDetailsStep").classList.add("hidden");
    $("bookingPaymentStep").classList.add("hidden");
    $("bookingSuccessStep").classList.add("hidden");
    $("bookingApprovalStep").classList.remove("hidden");
    $("bookingFormWrap").classList.remove("hidden");
    $("bookingApprovalConfirmation").innerHTML=`<b>${booking.name||"הפגישה"} — הדיווח על התשלום נשלח.</b><span>${formatBookingDate(booking.date)} בשעה ${booking.time}.<br>לילך קיבלה בקשה לבדוק את התשלום ב-PayBox. בקשת אישור הפגישה תישלח אליה רק לאחר שתאמת שהתקבלו 150 ₪.</span>`;
    const demoApproveBtn=$("demoApproveBtn");
    if(demoApproveBtn) demoApproveBtn.classList.toggle("hidden",!cfg.DEMO_BOOKING);
    $("bookingApprovalStep").scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function showConfirmedBooking(booking){
    pendingBooking=booking;
    $("bookingDetailsStep").classList.add("hidden");
    $("bookingPaymentStep").classList.add("hidden");
    $("bookingApprovalStep").classList.add("hidden");
    $("bookingSuccessStep").classList.remove("hidden");
    $("bookingFormWrap").classList.remove("hidden");
    $("bookingFinalConfirmation").innerHTML=`<b>${booking.name||"הפגישה"} — אושרה על ידי לילך.</b><span>${formatBookingDate(booking.date)} בשעה ${booking.time}.<br>נשלח לפונה מייל המאשר שהפגישה והתשלום אושרו.</span>`;
    $("bookingSuccessStep").scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function bookingPayload(){
    const firstName=$("bookFirstName").value.trim();
    const lastName=$("bookLastName").value.trim();
    const type=appointmentType();
    const returningClient=type==="therapy";
    return {
      date:selectedDate,
      time:selectedTime,
      firstName,
      lastName,
      name:`${firstName} ${lastName}`.trim(),
      phone:$("bookPhone").value.trim(),
      email:$("bookEmail").value.trim(),
      reason:returningClient ? RETURNING_CLIENT_VALUE : ($("bookReason")?.value.trim()||""),
      returningClient,
      referral:returningClient ? RETURNING_CLIENT_VALUE : ($("bookReferral")?.value.trim()||""),
      appointmentType:type,
      meetingMode:document.querySelector('input[name="meetingMode"]:checked')?.value||"clinic",
      privacyConsent:Boolean($("bookPrivacyConsent")?.checked),
      whatsappConsent:false,
      policyAccepted:Boolean($("bookPolicyAccepted")?.checked),
      policyText:"שריון המועד מותנה בתשלום מקדמה של 150 ₪ באמצעות PayBox ובאימות התשלום. המקדמה היא חלק ממחיר הפגישה וחלה עליה מדיניות הביטולים."
    };
  }

  $("confirmBooking").onclick=async()=>{
    const bm=$("bookingMessage");
    const payload=bookingPayload();

    if(!selectedDate||!selectedTime){
      msg(bm,"בחרו יום ושעה.");
      return;
    }
    if(!payload.firstName||!payload.lastName||!payload.phone||!payload.email){
      msg(bm,"נא למלא שם פרטי, שם משפחה, טלפון ואימייל.");
      return;
    }
    if(payload.appointmentType==="intake" && (!payload.reason||!payload.referral)){
      msg(bm,"בפגישת אינטייק יש למלא סיבת פנייה ומאיפה שמעת/הגעת ללילך.");
      return;
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)){
      msg(bm,"נא להזין כתובת אימייל תקינה. אישור הפגישה יישלח לכתובת זו.");
      return;
    }
    if(!payload.privacyConsent){
      msg(bm,"יש לאשר שמירת הפרטים לצורך תיאום וניהול הפגישה.");
      return;
    }
    if(!payload.policyAccepted){
      msg(bm,"כדי להמשיך יש לאשר את תנאי המקדמה בסך 150 ₪ ואת מדיניות הביטולים.");
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
          paymentClaimToken:j.paymentClaimToken||j.payment_claim_token||"",
          paymentAmount:Number(j.paymentAmount||j.payment_amount||150),
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
      btn.textContent="המשך לתשלום 150 ₪";
    }
  };

  const paymentClaimBtn=$("paymentClaimBtn");
  if(paymentClaimBtn){
    paymentClaimBtn.onclick=async()=>{
      if(!pendingBooking?.bookingId || !pendingBooking?.paymentClaimToken) return;
      const reviewMessage=$("paymentReviewMessage");
      paymentClaimBtn.disabled=true;
      paymentClaimBtn.textContent="שולח לבדיקה...";
      if(reviewMessage){
        reviewMessage.textContent="";
        reviewMessage.className="form-message";
      }
      try{
        if(!cfg.PAYMENT_REVIEW_URL) throw new Error("payment_review_not_configured");
        const r=await fetch(cfg.PAYMENT_REVIEW_URL,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            action:"request_review",
            bookingId:pendingBooking.bookingId,
            token:pendingBooking.paymentClaimToken
          })
        });
        const j=await r.json().catch(()=>({}));
        if(!r.ok || !j.ok) throw new Error(j.error||"review_request_failed");
        showAwaitingApproval({
          ...pendingBooking,
          status:j.status||"awaiting_approval",
          paymentStatus:j.paymentStatus||"reported"
        });
      }catch(e){
        console.error(e);
        if(reviewMessage){
          reviewMessage.textContent="לא הצלחנו לשלוח את התשלום לבדיקה. נסו שוב בעוד רגע.";
          reviewMessage.className="form-message err";
        }
        paymentClaimBtn.disabled=false;
        paymentClaimBtn.textContent="כבר שילמתי 150 ₪";
      }
    };
  }

  $("newBookingBtn").onclick=()=>{
    resetBookingFlow();
    resetDateWindow();
    ["bookFirstName","bookLastName","bookPhone","bookEmail","bookReason"].forEach((id)=>{
      if($(id)) $(id).value="";
    });
    if($("bookReferral")) $("bookReferral").value="";
    if($("bookPrivacyConsent")) $("bookPrivacyConsent").checked=false;
    if($("bookPolicyAccepted")) $("bookPolicyAccepted").checked=false;
    const intake=document.querySelector('input[name="appointmentType"][value="intake"]');
    if(intake) intake.checked=true;
    syncAppointmentTypeFields();
    openBookingModal();
  };

  async function resumeAfterPayment(){
    const params=new URLSearchParams(location.search);
    const payment=params.get("payment");
    const bookingId=params.get("booking_id");
    if(payment!=="success" || !bookingId) return;

    openBookingModal();
    $("bookingFormWrap").classList.remove("hidden");
    $("bookingDetailsStep").classList.add("hidden");
    $("bookingPaymentStep").classList.remove("hidden");
    $("bookingPending").innerHTML="<b>חזרת מתהליך התשלום.</b><span>אם התשלום הושלם, לחצו על „כבר שילמתי 150 ₪” כדי לשלוח ללילך את בקשת האישור.</span>";

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
      $("bookingPending").innerHTML="<b>עדיין ממתינים לעדכון.</b><span>הפגישה אינה סופית עד שלילך בודקת את התשלום ב-PayBox ומאשרת את התור.</span>";
    }catch(e){
      console.error(e);
      $("bookingPending").innerHTML="<b>לא הצלחנו לבדוק את סטטוס הבקשה כרגע.</b><span>הפגישה אינה מאושרת עד שלילך בודקת את התשלום ומאשרת את התור.</span>";
    }
  }

  resumeAfterPayment();

  const mobileNav = document.querySelector(".mobile-nav");
  if (mobileNav) {
    mobileNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => mobileNav.removeAttribute("open"));
    });
    document.addEventListener("click", (event) => {
      if (mobileNav.hasAttribute("open") && !mobileNav.contains(event.target)) {
        mobileNav.removeAttribute("open");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mobileNav.hasAttribute("open")) {
        mobileNav.removeAttribute("open");
        mobileNav.querySelector("summary")?.focus();
      }
    });
  }

})();