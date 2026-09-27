(() => {
  const SUPABASE_BASE = "https://taafqwplvzcceoynhvve.supabase.co/functions/v1";
  const DETAILS_URL = `${SUPABASE_BASE}/booking-approval`;
  const APPROVE_URL = `${SUPABASE_BASE}/approve-booking`;

  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get("bookingId") || "";
  const token = params.get("token") || "";

  const loading = document.getElementById("loading");
  const errorBox = document.getElementById("errorBox");
  const content = document.getElementById("content");
  const approveButton = document.getElementById("approveButton");
  const resultMessage = document.getElementById("resultMessage");

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

  async function loadBooking() {
    if (!bookingId || !token) {
      showError("קישור האישור אינו תקין.");
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
      document.getElementById("phone").textContent = data.phone || "";

      loading.classList.add("hidden");
      content.classList.remove("hidden");

      if (data.status === "confirmed") {
        approveButton.disabled = true;
        approveButton.textContent = "התור כבר אושר";
        showResult("התור כבר אושר ונוסף ליומן Google.", true);
      }
    } catch (error) {
      console.error(error);
      showError("לא הצלחנו לטעון את פרטי התור. ייתכן שהקישור אינו תקין או שפג תוקפו.");
    }
  }

  approveButton.addEventListener("click", async () => {
    approveButton.disabled = true;
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
        if (data.error === "slot_taken_before_approval") {
          throw new Error("slot_taken_before_approval");
        }
        throw new Error(data.error || "approval_failed");
      }

      approveButton.textContent = "התור אושר";
      showResult("התור אושר בהצלחה ונוסף ליומן Google.", true);
    } catch (error) {
      console.error(error);
      approveButton.disabled = false;
      approveButton.textContent = "אישור התור";
      if (error.message === "slot_taken_before_approval") {
        showResult("השעה כבר אינה פנויה ביומן. התור לא אושר.", false);
      } else {
        showResult("לא הצלחנו לאשר את התור. נסי שוב.", false);
      }
    }
  });

  loadBooking();
})();
