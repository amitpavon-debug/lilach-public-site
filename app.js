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


  const msg = (el, text, ok=false) => {
    el.textContent = text;
    el.className = `form-message ${ok ? "ok" : "err"}`;
  };
  const heDays=["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
  const RETURNING_CLIENT_VALUE="כבר נפגשתי בעבר עם לילך";
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

  document.querySelectorAll('input[name="appointmentType"]').forEach((input)=>{
    input.addEventListener("change",()=>{
      selectedTime=null;
      if(selectedDate){
        const selected=new Date(`${selectedDate}T12:00:00`);
        selectDate(selected);
      }
    });
  });

  function setupReturningClientOption(){
    const reasonField=$("bookReason");
    const referralField=$("bookReferral");
    if(!reasonField || !referralField || $("bookReturningClient")) return;
    const reasonWrapper=reasonField.closest(".booking-field");
    if(!reasonWrapper) return;

    let returningOption=Array.from(referralField.options).find(option=>option.value===RETURNING_CLIENT_VALUE);
    if(!returningOption){
      returningOption=document.createElement("option");
      returningOption.value=RETURNING_CLIENT_VALUE;
      returningOption.textContent=RETURNING_CLIENT_VALUE;
      returningOption.hidden=true;
      referralField.appendChild(returningOption);
    }

    const returningLabel=document.createElement("label");
    returningLabel.className="booking-consent";
    returningLabel.innerHTML='<input id="bookReturningClient" type="checkbox"><span><strong>כבר נפגשתי בעבר עם לילך</strong><br><small>אם כבר נפגשת בעבר עם לילך, יש לסמן כאן — אין צורך לציין שוב את סיבת הפנייה או מאיפה הגעת ללילך.</small></span>';
    reasonWrapper.insertAdjacentElement("afterend", returningLabel);

    const intro=document.querySelector("#bookingDetailsStep .booking-step-head p");
    if(intro){
      intro.innerHTML='בפנייה ראשונה יש למלא <strong>סיבת פנייה</strong> וגם <strong>מאיפה שמעת/הגעת ללילך</strong>. אם כבר נפגשת בעבר עם לילך, ניתן לסמן זאת ואין צורך למלא את שני השדות.';
    }
    const requiredNote=document.querySelector(".booking-required-note");
    if(requiredNote){
      requiredNote.textContent="* בפנייה ראשונה סיבת הפנייה ומקור ההגעה הם חובה. אם כבר נפגשת בעבר עם לילך, אין צורך למלא אותם.";
    }

    const returningCheckbox=$("bookReturningClient");
    const syncReturningState=()=>{
      const isReturning=Boolean(returningCheckbox?.checked);
      reasonField.disabled=isReturning;
      referralField.disabled=isReturning;
      reasonField.required=!isReturning;
      referralField.required=!isReturning;
      reasonField.setAttribute("aria-disabled", isReturning ? "true" : "false");
      referralField.setAttribute("aria-disabled", isReturning ? "true" : "false");
      reasonField.setAttribute("aria-required", isReturning ? "false" : "true");
      referralField.setAttribute("aria-required", isReturning ? "false" : "true");
      reasonField.placeholder=isReturning
        ? "אין צורך לציין סיבה מחדש"
        : "בכמה מילים, מה מביא אותך לפנות עכשיו?";
      if(isReturning){
        reasonField.value="";
        referralField.value=RETURNING_CLIENT_VALUE;
        const therapyRadio=document.querySelector('input[name="appointmentType"][value="therapy"]');
        if(therapyRadio && !therapyRadio.checked){
          therapyRadio.checked=true;
          therapyRadio.dispatchEvent(new Event("change",{bubbles:true}));
        }
      }else if(referralField.value===RETURNING_CLIENT_VALUE){
        referralField.value="";
      }
    };
    returningCheckbox.addEventListener("change", syncReturningState);
    syncReturningState();
  }
  setupReturningClientOption();

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
    $("bookingPending").innerHTML=`<b>${booking.name}, המועד נשמר זמנית לצורך תשלום.</b><span>${formatBookingDate(booking.date)} בשעה ${booking.time}.${expiry}<br>לתשלום כעת: <strong>150 ₪</strong>. רק לאחר בדיקת התשלום ב-PayBox תישלח ללילך בקשת אישור.</span>`;

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
    $("bookingApprovalConfirmation").innerHTML=`<b>${booking.name||"הפגישה"} — הדיווח על התשלום נשלח.</b><span>${formatBookingDate(booking.date)} בשעה ${booking.time}.<br>לילך קיבלה בקשת אישור במייל ותבדוק את התשלום ב-PayBox לפני אישור התור.</span>`;
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
    $("bookingFinalConfirmation").innerHTML=`<b>${booking.name||"הפגישה"} — אושרה על ידי לילך.</b><span>${formatBookingDate(booking.date)} בשעה ${booking.time}.<br>נשלח לפונה מייל המאשר שהפגישה והתשלום אושרו.</span>`;
    $("bookingSuccessStep").scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function bookingPayload(){
    const firstName=$("bookFirstName").value.trim();
    const lastName=$("bookLastName").value.trim();
    const returningClient=Boolean($("bookReturningClient")?.checked);
    return {
      date:selectedDate,
      time:selectedTime,
      firstName,
      lastName,
      name:`${firstName} ${lastName}`.trim(),
      phone:$("bookPhone").value.trim(),
      email:$("bookEmail").value.trim(),
      reason:returningClient ? RETURNING_CLIENT_VALUE : $("bookReason").value.trim(),
      returningClient,
      referral:returningClient ? RETURNING_CLIENT_VALUE : $("bookReferral").value.trim(),
      appointmentType:document.querySelector('input[name="appointmentType"]:checked')?.value||"intake",
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
    if(!payload.returningClient && (!payload.reason||!payload.referral)){
      msg(bm,"בפנייה ראשונה יש למלא סיבת פנייה ומאיפה שמעת/הגעת ללילך. אם כבר נפגשת בעבר עם לילך, יש לסמן את האפשרות המתאימה.");
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
      box.innerHTML="פרטי ההעברה עדיין לא הוגדרו. לאחר העברה בנקאית הפגישה תישאר בהמתנה עד לאימות התשלום. לאחר האימות תישלח ללילך בקשת אישור במייל.";
    }else{
      box.innerHTML=`<b>${d.beneficiary||"לילך פבון"}</b><br>בנק: ${d.bank||"—"}<br>סניף: ${d.branch||"—"}<br>חשבון: ${d.account||"—"}<br><small>לאחר אימות ההעברה לילך תקבל בקשת אישור במייל.</small>`;
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
    if($("bookWhatsappConsent")) $("bookWhatsappConsent").checked=false;
    if($("bookPolicyAccepted")) $("bookPolicyAccepted").checked=false;
    if($("bookReturningClient")) $("bookReturningClient").checked=false;
    if($("bookReason")){
      $("bookReason").disabled=false;
      $("bookReason").required=true;
      $("bookReason").setAttribute("aria-disabled","false");
      $("bookReason").setAttribute("aria-required","true");
      $("bookReason").placeholder="בכמה מילים, מה מביא אותך לפנות עכשיו?";
      $("bookReason").value="";
    }
    if($("bookReferral")){
      $("bookReferral").disabled=false;
      $("bookReferral").required=true;
      $("bookReferral").setAttribute("aria-disabled","false");
      $("bookReferral").setAttribute("aria-required","true");
      if($("bookReferral").value===RETURNING_CLIENT_VALUE) $("bookReferral").value="";
    }
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