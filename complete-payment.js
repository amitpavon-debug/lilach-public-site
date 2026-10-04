(() => {
  const SUPABASE_BASE = "https://taafqwplvzcceoynhvve.supabase.co/functions/v1";
  const STATUS_URL = `${SUPABASE_BASE}/booking-status`;
  const PAYMENT_REVIEW_URL = `${SUPABASE_BASE}/payment-review`;
  const params = new URLSearchParams(location.search);
  const bookingId = params.get("bookingId") || "";
  const token = params.get("token") || "";

  const loading = document.getElementById("loading");
  const content = document.getElementById("content");
  const errorBox = document.getElementById("error");
  const message = document.getElementById("message");
  const paidButton = document.getElementById("paidButton");

  function fail(text) {
    loading.classList.add("hidden");
    content.classList.add("hidden");
    errorBox.textContent = text;
    errorBox.classList.remove("hidden");
  }

  async function load() {
    if (!bookingId || !token) {
      fail("קישור השלמת התשלום אינו תקין.");
      return;
    }
    try {
      const response = await fetch(`${STATUS_URL}?booking_id=${encodeURIComponent(bookingId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "status_failed");

      if (["expired","rejected","cancelled","cancelled_by_lilach"].includes(data.status)) {
        fail("שריון המועד כבר אינו פעיל. יש לבחור מועד חדש באתר.");
        return;
      }
      if (data.status === "confirmed") {
        loading.classList.add("hidden");
        content.classList.remove("hidden");
        document.getElementById("name").textContent = data.name || "";
        document.getElementById("date").textContent = data.date || "";
        document.getElementById("time").textContent = data.time || "";
        paidButton.disabled = true;
        paidButton.textContent = "הפגישה כבר אושרה";
        message.textContent = "הפגישה כבר אושרה.";
        message.className = "msg ok";
        return;
      }

      document.getElementById("name").textContent = data.name || "";
      document.getElementById("date").textContent = data.date || "";
      document.getElementById("time").textContent = data.time || "";
      loading.classList.add("hidden");
      content.classList.remove("hidden");
    } catch (error) {
      console.error(error);
      fail("לא הצלחנו לטעון את פרטי הבקשה.");
    }
  }

  paidButton.addEventListener("click", async () => {
    paidButton.disabled = true;
    paidButton.textContent = "שולח ללילך...";
    message.classList.add("hidden");

    try {
      const response = await fetch(PAYMENT_REVIEW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_review",
          bookingId,
          token
        })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        if (data.error === "payment_window_expired") throw new Error("payment_window_expired");
        throw new Error(data.error || "request_failed");
      }

      paidButton.textContent = "הבקשה נשלחה ללילך";
      message.textContent = data.emailSent === false
        ? "הדיווח נשמר, אך שליחת המייל ללילך נכשלה. אפשר ללחוץ שוב בעוד רגע."
        : "הבקשה נשלחה ללילך מחדש לאישור. הפגישה תאושר רק לאחר בדיקת התשלום ואישורה.";
      message.className = data.emailSent === false ? "msg warning" : "msg ok";
      if (data.emailSent === false) {
        paidButton.disabled = false;
        paidButton.textContent = "שליחה חוזרת ללילך";
      }
    } catch (error) {
      console.error(error);
      if (error.message === "payment_window_expired") {
        fail("זמן שמירת המועד הסתיים. יש לבחור מועד חדש באתר.");
        return;
      }
      paidButton.disabled = false;
      paidButton.textContent = "כבר שילמתי 150 ₪";
      message.textContent = "לא הצלחנו לשלוח את הבקשה ללילך. נסו שוב.";
      message.className = "msg err";
    }
  });

  load();
})();
