(() => {
  const SUPABASE_BASE = "https://taafqwplvzcceoynhvve.supabase.co/functions/v1";
  const DETAILS_URL = `${SUPABASE_BASE}/booking-approval`;
  const APPROVE_URL = `${SUPABASE_BASE}/approve-booking`;
  const ADMIN_ACTION_URL = `${SUPABASE_BASE}/booking-admin-action`;
  const PAYMENT_REVIEW_URL = `${SUPABASE_BASE}/payment-review`;

  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get("bookingId") || "";
  const token = params.get("token") || "";
  const requestedAction = params.get("action") || "";

  const loading = document.getElementById("loading");
  const errorBox = document.getElementById("errorBox");
  const content = document.getElementById("content");
  const pendingActions = document.getElementById("pendingActions");
  const paymentVerifyButton = document.getElementById("paymentVerifyButton");
  const approveButton = document.getElementById("approveButton");
  const paymentMissingButton = document.getElementById("paymentMissingButton");
  const rejectButton = document.getElementById("rejectButton");
  const cancelButton = document.getElementById("cancelButton");
  const resultMessage = document.getElementById("resultMessage");
  let loadedPaymentStatus = "";

  function showError(text) {
    loading.classList.add("hidden");
    content.classList.add("hidden");
    errorBox.textContent = text;
    errorBox.classList.remove("hidden");
  }

  function showResult(text, type = "success") {
    resultMessage.textContent = text;
    resultMessage.className = `message ${type}`;
    resultMessage.classList.remove("hidden");
  }

  function setBusy(busy) {
    paymentVerifyButton.disabled = busy;
    approveButton.disabled = busy;
    paymentMissingButton.disabled = busy;
    rejectButton.disabled = busy;
    cancelButton.disabled = busy;
  }

  function applyStatus(status) {
    pendingActions.classList.add("hidden");
    paymentMissingButton.classList.add("hidden");
    cancelButton.classList.add("hidden");

    if (status === "awaiting_approval") {
      pendingActions.classList.remove("hidden");
      paymentVerifyButton.classList.add("hidden");
      approveButton.classList.add("hidden");

      if (loadedPaymentStatus === "reported") {
        paymentVerifyButton.classList.remove("hidden");
        paymentMissingButton.classList.remove("hidden");
        showResult("לפני אישור הפגישה יש לבדוק ב-PayBox שהתקבלו בפועל 150 ₪. לאחר האימות יישלח אלייך מייל נפרד לאישור הפגישה.", "warning");
      } else if (loadedPaymentStatus === "paid") {
        approveButton.classList.remove("hidden");
      }

      if (requestedAction === "reject") {
        showResult("הבקשה עדיין ממתינה. לחצי על „דחיית הבקשה” כדי לאשר את הדחייה.", "warning");
        rejectButton.focus();
      }
      return;
    }

    if (status === "pending_payment") {
      showResult("המועד שמור זמנית וממתין לתשלום של הלקוח/ה.", "warning");
      return;
    }

    if (status === "confirmed") {
      cancelButton.classList.remove("hidden");
      showResult("התור מאושר ונמצא ביומן Google. ניתן לבטל אותו מכאן במידת הצורך.", "success");
      return;
    }

    if (status === "rejected") {
      showResult("הבקשה כבר נדחתה והמועד שוחרר.", "success");
      return;
    }

    if (status === "cancelled_by_lilach") {
      showResult("הפגישה כבר בוטלה על ידי לילך והלקוח קיבל הודעת ביטול.", "success");
      return;
    }

    if (status === "cancelled") {
      showResult("הפגישה כבר בוטלה על ידי הלקוח.", "warning");
      return;
    }

    showResult(`מצב התור: ${status || "לא ידוע"}`, "warning");
  }

  async function loadBooking() {
    if (!bookingId || !token) {
      showError("קישור ניהול התור אינו תקין.");
      return;
    }

    try {
      const response = await fetch(DETAILS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, approvalToken: token })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "load_failed");

      document.getElementById("name").textContent = data.name || "";
      document.getElementById("date").textContent = data.date || "";
      document.getElementById("time").textContent = data.time || "";
      const appointmentTypeLabel = data.appointmentType === "intake"
        ? "פגישת אינטייק ראשונית"
        : data.appointmentType === "therapy"
          ? "טיפול רגשי"
          : "פגישה";
      const durationMinutes = Number(data.durationMinutes || (data.appointmentType === "intake" ? 60 : 50));
      document.getElementById("appointmentType").textContent = `${appointmentTypeLabel} — ${durationMinutes} דקות`;
      document.getElementById("meetingMode").textContent = data.meetingMode === "zoom" ? "אונליין (Zoom)" : "בקליניקה";
      loadedPaymentStatus = data.paymentStatus || "";
      document.getElementById("paymentStatus").textContent = data.paymentStatus === "paid"
        ? "150 ₪ — אומת על ידי לילך"
        : data.paymentStatus === "reported"
          ? "150 ₪ — הלקוח/ה דיווח/ה ששילם/ה; יש לבדוק ב-PayBox לפני אישור"
          : "טרם התקבל / ממתין לתשלום";
      document.getElementById("phone").textContent = data.phone || "";

      loading.classList.add("hidden");
      content.classList.remove("hidden");
      applyStatus(data.status);
    } catch (error) {
      console.error(error);
      showError("לא הצלחנו לטעון את פרטי התור. ייתכן שהקישור אינו תקין.");
    }
  }

  paymentVerifyButton.addEventListener("click", async () => {
    if (!window.confirm("האם בדקת ב-PayBox והתקבלו בפועל בדיוק 150 ₪ מהלקוח/ה המתאים/ה?")) return;

    setBusy(true);
    paymentVerifyButton.textContent = "מאמתת תשלום...";
    resultMessage.classList.add("hidden");

    try {
      const verifyResponse = await fetch(PAYMENT_REVIEW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_from_approval",
          bookingId,
          approvalToken: token
        })
      });
      const verifyData = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyData.ok) {
        throw new Error(verifyData.error || "payment_verification_failed");
      }

      loadedPaymentStatus = "paid";
      document.getElementById("paymentStatus").textContent = "150 ₪ — אומת על ידי לילך";
      paymentVerifyButton.classList.add("hidden");
      paymentMissingButton.classList.add("hidden");
      approveButton.classList.remove("hidden");
      setBusy(false);
      paymentVerifyButton.textContent = "התשלום אומת";
      showResult(
        verifyData.approvalEmailSent === false
          ? "התשלום סומן כמאומת, אך שליחת מייל האישור ללילך נכשלה. אפשר לאשר את הפגישה מהמסך הזה."
          : "התשלום אומת. נשלח ללילך מייל חדש שמציין שהתקבלו 150 ₪ ובו קישור לאישור הפגישה.",
        verifyData.approvalEmailSent === false ? "warning" : "success"
      );
      approveButton.focus();
    } catch (error) {
      console.error(error);
      paymentVerifyButton.textContent = "בדקתי ב-PayBox — התקבלו 150 ₪";
      setBusy(false);
      showResult("לא הצלחנו לשמור את אימות התשלום. נסי שוב.", "error");
    }
  });

  approveButton.addEventListener("click", async () => {
    if (loadedPaymentStatus !== "paid") {
      showResult("לא ניתן לאשר את הפגישה לפני שאומת תשלום של 150 ₪ ב-PayBox.", "warning");
      return;
    }

    setBusy(true);
    approveButton.textContent = "מאשרת...";
    resultMessage.classList.add("hidden");

    try {
      const response = await fetch(APPROVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, approvalToken: token })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        if (data.error === "slot_taken_before_approval") throw new Error("slot_taken_before_approval");
        throw new Error(data.error || "approval_failed");
      }

      approveButton.textContent = "התור אושר";
      setBusy(false);
      pendingActions.classList.add("hidden");
      cancelButton.classList.remove("hidden");
      showResult("התור אושר בהצלחה, נוסף ליומן Google ונשלח ללקוח מייל אישור.", "success");
    } catch (error) {
      console.error(error);
      approveButton.textContent = "אישור התור";
      setBusy(false);
      if (error.message === "slot_taken_before_approval") {
        showResult("השעה כבר אינה פנויה ביומן. התור לא אושר.", "error");
      } else {
        showResult("לא הצלחנו לאשר את התור. נסי שוב.", "error");
      }
    }
  });

  paymentMissingButton.addEventListener("click", async () => {
    if (!window.confirm("לא נמצא תשלום ב-PayBox? המועד יישמר ללקוח/ה לשעתיים נוספות ויישלח מייל תזכורת לתשלום.")) return;

    setBusy(true);
    paymentMissingButton.textContent = "שולחת תזכורת...";
    resultMessage.classList.add("hidden");

    try {
      const response = await fetch(ADMIN_ACTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, approvalToken: token, action: "payment_missing" })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "payment_missing_failed");

      pendingActions.classList.add("hidden");
      paymentVerifyButton.classList.add("hidden");
      loadedPaymentStatus = "pending";
      document.getElementById("paymentStatus").textContent = "ממתין לתשלום — נשלחה תזכורת";
      const emailNote = data.clientEmailSent === false
        ? " המועד נשמר, אך שליחת המייל ללקוח נכשלה."
        : " נשלח ללקוח מייל עם קישור לתשלום ולהמשך התהליך.";
      showResult(`לא נמצא תשלום. המועד נשמר ללקוח/ה לשעתיים נוספות.${emailNote} לאחר התשלום תישלח אלייך בקשת אישור חדשה.`, data.clientEmailSent === false ? "warning" : "success");
    } catch (error) {
      console.error(error);
      paymentMissingButton.textContent = "לא התקבל תשלום — שליחת תזכורת";
      setBusy(false);
      showResult("לא הצלחנו לשלוח את תזכורת התשלום. נסי שוב.", "error");
    }
  });

  rejectButton.addEventListener("click", async () => {
    if (!window.confirm("לדחות את בקשת הפגישה? המועד ישתחרר והלקוח יקבל מייל שמאפשר לבחור מועד חדש.")) return;

    setBusy(true);
    rejectButton.textContent = "דוחה...";
    resultMessage.classList.add("hidden");

    try {
      const response = await fetch(ADMIN_ACTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, approvalToken: token, action: "reject" })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "reject_failed");

      pendingActions.classList.add("hidden");
      rejectButton.textContent = "הבקשה נדחתה";
      const refundNote = data.refundNeedsPaymentCheck
        ? " יש לבדוק ב-PayBox אם התקבלו 150 ₪, ואם כן לבצע החזר מלא."
        : data.refundRequired ? " יש לבצע החזר מלא של 150 ₪ דרך PayBox." : "";
      showResult(data.clientEmailSent === false
        ? `הבקשה נדחתה והמועד שוחרר, אך שליחת המייל ללקוח נכשלה.${refundNote}`
        : `הבקשה נדחתה, המועד שוחרר ונשלח ללקוח מייל עם אפשרות לבחור מועד חדש.${refundNote}`,
        data.clientEmailSent === false ? "warning" : "success");
    } catch (error) {
      console.error(error);
      rejectButton.textContent = "דחיית הבקשה";
      setBusy(false);
      showResult("לא הצלחנו לדחות את הבקשה. נסי שוב.", "error");
    }
  });

  cancelButton.addEventListener("click", async () => {
    if (!window.confirm("לבטל את הפגישה המאושרת? האירוע יימחק מהיומן והלקוח יקבל מייל ביטול.")) return;

    setBusy(true);
    cancelButton.textContent = "מבטלת...";
    resultMessage.classList.add("hidden");

    try {
      const response = await fetch(ADMIN_ACTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, approvalToken: token, action: "cancel" })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "cancel_failed");

      cancelButton.classList.add("hidden");
      const refundNote = data.refundRequired ? " יש לבצע החזר מלא של 150 ₪ דרך PayBox." : "";
      showResult(data.clientEmailSent === false
        ? `הפגישה בוטלה ונמחקה מהיומן, אך שליחת מייל הביטול ללקוח נכשלה.${refundNote}`
        : `הפגישה בוטלה, נמחקה מיומן Google ונשלח ללקוח מייל ביטול.${refundNote}`,
        data.clientEmailSent === false ? "warning" : "success");
    } catch (error) {
      console.error(error);
      cancelButton.textContent = "ביטול פגישה מאושרת";
      setBusy(false);
      showResult("לא הצלחנו לבטל את הפגישה. נסי שוב.", "error");
    }
  });

  loadBooking();
})();
