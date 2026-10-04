(() => {
  const API = "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/payment-review";
  const params = new URLSearchParams(location.search);
  const bookingId = params.get("bookingId") || "";
  const token = params.get("token") || "";
  const loading = document.getElementById("loading");
  const content = document.getElementById("content");
  const error = document.getElementById("error");
  const message = document.getElementById("message");
  const verifyButton = document.getElementById("verifyButton");

  function showError(text){
    loading.classList.add("hidden");
    content.classList.add("hidden");
    error.textContent=text;
    error.classList.remove("hidden");
  }

  async function load(){
    if(!bookingId || !token){ showError("קישור האימות אינו תקין."); return; }
    try{
      const r=await fetch(`${API}?bookingId=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`);
      const d=await r.json();
      if(!r.ok || !d.ok) throw new Error(d.error||"load_failed");
      document.getElementById("name").textContent=d.name||"";
      document.getElementById("date").textContent=d.date||"";
      document.getElementById("time").textContent=d.time||"";
      document.getElementById("type").textContent=`${d.appointmentTypeLabel||"פגישה"} — ${d.durationMinutes||""} דקות`;
      document.getElementById("mode").textContent=d.meetingModeLabel||"";
      document.getElementById("phone").textContent=d.phone||"";
      if(d.paymentStatus==="paid"){
        verifyButton.disabled=true;
        verifyButton.textContent="התשלום כבר אומת";
        message.textContent="התשלום כבר מסומן כמאומת במערכת.";
        message.className="msg ok";
      }
      loading.classList.add("hidden");
      content.classList.remove("hidden");
    }catch(e){
      console.error(e);
      showError("לא הצלחנו לטעון את פרטי התשלום.");
    }
  }

  verifyButton.addEventListener("click", async()=>{
    if(!confirm("אישרת שבדקת ב-PayBox והתקבלו בפועל בדיוק 150 ₪?")) return;
    verifyButton.disabled=true;
    verifyButton.textContent="מאמת ושולח לאישור...";
    try{
      const r=await fetch(API,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"verify",bookingId,token})
      });
      const d=await r.json();
      if(!r.ok || !d.ok) throw new Error(d.error||"verify_failed");
      message.textContent=d.alreadyVerified
        ? "התשלום כבר אומת קודם."
        : "התשלום סומן כמאומת. נשלח ללילך מייל אישור תור שמציין במפורש שהתקבלו ואומתו 150 ₪.";
      message.className="msg ok";
      verifyButton.textContent="התשלום אומת";
    }catch(e){
      console.error(e);
      verifyButton.disabled=false;
      verifyButton.textContent="אימתתי שהתקבלו 150 ₪";
      message.textContent="לא הצלחנו לאמת את התשלום. נסי שוב.";
      message.className="msg err";
    }
  });

  load();
})();