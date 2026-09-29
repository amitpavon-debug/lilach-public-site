(() => {
  const CANCEL_URL = "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/cancel-booking";
  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get("bookingId") || "";
  const cancelToken = params.get("token") || "";

  const loading = document.getElementById("loading");
  const errorBox = document.getElementById("errorBox");
  const content = document.getElementById("content");
  const cancelButton = document.getElementById("cancelButton");
  const resultMessage = document.getElementById("resultMessage");
  const lateWarning = document.getElementById("lateWarning");

  function formatDateHe(dateValue) {
    const [year, month, day] = String(dateValue || "").split("-");
    return year && month && day ? `${day}/${month}/${year}` : String(dateValue || "");
  }

  function showError(text) {
    loading.classList.add("hidden");
    content.classList.add("hidden");
    errorBox.textContent = text;
    errorBox.classList.remove("hidden");
  }

  function showResult(text, ok) {
    resultMessage.textContent = text;
    resultMessage.className = `message ${ok ? "success" : "error"}`;
    resultMessage.classList.remove("hidden");
  }

  async function callCancellation(action) {
    const response = await fetch(CANCEL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, cancelToken, action })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const error = new Error(data.error || "request_failed");
      error.data = data;
      throw error;
    }
    return data;
  }

  async function loadBooking() {
    if (!bookingId || !cancelToken) {
      showError("קישור הביטול אינו תקין.");
      return;
    }

    try {
      const data = await callCancellation("details");
      document.getElementById("name").textContent = data.name || "";
      document.getElementById("date").textContent = formatDateHe(data.date);
      document.getElementById("time").textContent = data.time || "";

      if (data.lateCancellation) lateWarning.classList.remove("hidden");

      loading.classList.add("hidden");
      content.classList.remove("hidden");

      if (data.status === "cancelled") {
        cancelButton.disabled = true;
        cancelButton.textContent = "הפגישה כבר בוטלה";
        showResult("הפגישה כבר בוטלה.", true);
      } else if (data.status !== "confirmed") {
        cancelButton.disabled = true;
        cancelButton.textContent = "לא ניתן לבטל את הפגישה";
        showResult("הפגישה אינה במצב שמאפשר ביטול דרך הקישור הזה.", false);
      }
    } catch (error) {
      console.error(error);
      showError("לא הצלחנו לטעון את פרטי הפגישה. ייתכן שהקישור אינו תקין.");
    }
  }

  cancelButton.addEventListener("click", async () => {
    cancelButton.disabled = true;
    cancelButton.textContent = "מבטל את הפגישה...";
    resultMessage.classList.add("hidden");

    try {
      const data = await callCancellation("cancel");
      cancelButton.textContent = "הפגישה בוטלה";
      const text = data.lateCancellation
        ? "הפגישה בוטלה בהצלחה. בהתאם למדיניות הביטולים, ביטול בתוך 24 שעות כרוך בתשלום של 150 ₪. נשלח אליך גם מייל אישור."
        : "הפגישה בוטלה בהצלחה ונשלח אליך מייל אישור.";
      showResult(text, true);
    } catch (error) {
      console.error(error);
      cancelButton.disabled = false;
      cancelButton.textContent = "אישור ביטול הפגישה";
      if (error.message === "booking_already_started") {
        showResult("מועד הפגישה כבר התחיל ולכן לא ניתן לבטל אותו דרך האתר.", false);
      } else {
        showResult("לא הצלחנו לבטל את הפגישה כרגע. נסו שוב בעוד רגע.", false);
      }
    }
  });

  loadBooking();
})();
