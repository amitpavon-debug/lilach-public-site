(() => {
  const SUPABASE_BASE = "https://taafqwplvzcceoynhvve.supabase.co/functions/v1";
  const DETAILS_URL = `${SUPABASE_BASE}/booking-approval`;
  const APPROVE_URL = `${SUPABASE_BASE}/approve-booking`;
  const ADMIN_ACTION_URL = `${SUPABASE_BASE}/booking-admin-action`;\n  const PAYMENT_REVIEW_URL = `${SUPABASE_BASE}/payment-review`;

  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get("bookingId") || "";
  const token = params.get("token") || "";
  const requestedAction = params.get("action") || "";

  const loading = document.getElementById("loading");
  const errorBox = document.getElementById("errorBox");
  const content = document.getElementById("content");
  const pendingActions = document.getElementById("pendingActions");
  const approveButton = document.getElementById("approveButton");
  const rejectButton = document.getElementById("rejectButton");
  const cancelButton = document.getElementById("cancelButton");
  const resultMessage = document.getElementById("resultMessage");\n  let loadedPaymentStatus = "";

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
    approveButton.disabled = busy;
    rejectButton.disabled = busy;
    cancelButton.disabled = busy;
  }

  function applyStatus(status) {
    pendingActions.classList.add("hidden");
    cancelButton.classList.add("hidden");

    if (status === "awaiting_approval") {
      pendingActions.classList.remove("hidden");
      if (requestedAction === "reject") {
        showResult("הבקשה עדיין ממתינה. לחצי על „דחיית הבקשה” כדי לאשר את הדחייה.", "warning");
        rejectButton.focus();
      }
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
      const appointmentTypeLabel = data.appointmentType === "intake" ? "פגישת אינטייק ראשונית" : data.appointmentType === "therapy" ? "טיפול רגשי" : "פגישה";
      const durationMinutes = Number(data.durationMinutes || (data.appointmentType === "intake" ? 60 : 50));
      document.getElementById("appointmentType").textContent = `${appointmentTypeLabel} — ${durationMinutes} דקות`;
      document.getElementById("meetingMode").textContent = data.meetingMode === "zoom" ? "אונליין (Zoom)" : "בקליניקה";
      loadedPaymentStatus = data.paymentStatus || "";\n      document.getElementById("paymentStatus").textContent = data.paymentStatus === "paid"\n        ? "150 ₪ — אומת על ידי לילך"\n        : data.paymentStatus === "reported"\n          ? "150 ₪ — הלקוח/ה דיווח/ה ששילם/ה; יש לבדוק ב-PayBox לפני אישור"\n          : "טרם דווח";
      document.getElementById("phone").textContent = data.phone || "";

      loading.classList.add("hidden");
      content.classList.remove("hidden");
      applyStatus(data.status);
    } catch (error) {
      console.error(error);
      showError("לא הצלחנו לטעון את פרטי התור. ייתכן שהקישור אינו תקין.");
    }
  }

  approveButton.addEventListener("click", async () => {
    if (loadedPaymentStatus === "reported") {
      const checked = window.confirm("לפני אישור התור: האם בדקת ב-PayBox שהתקבלו בפועל בדיוק 150 ₪ מהלקוח/ה המתאים/ה?");
      if (!checked) return;
    }

    setBusy(true);
    approveButton.textContent = "מאמתת ומאשרת...";
    resultMessage.classList.add("hidden");

    try {
      if (loadedPaymentStatus === "reported") {
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
      }

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
      const refundNote = data.refundNeedsPaymentCheck\n        ? " יש לבדוק ב-PayBox אם התקבלו 150 ₪, ואם כן לבצע החזר מלא."\n        : data.refundRequired ? " יש לבצע החזר מלא של 150 ₪ דרך PayBox." : "";
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
