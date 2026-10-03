// Public browser configuration for Lilach's website.
// Do NOT place service-role keys, payment secrets, Resend secrets or WhatsApp tokens here.
window.LILACH_SITE_CONFIG = {
  BOOKING_AVAILABILITY_URL: "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/calendar-availability",
  BOOKING_HOLD_URL: "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/booking-hold",
  BOOKING_STATUS_URL: "",
  VCITA_FALLBACK_URL: "",
  CARD_PAYMENT_URL: "",
  PAYBOX_URL: "",
  BANK_TRANSFER: {
    bank: "",
    branch: "",
    account: "",
    beneficiary: ""
  },
  DEMO_BOOKING: false
};

// Keep the displayed years of experience current automatically.
(() => {
  const experienceText = document.querySelector(".experience-badge strong");
  if (!experienceText) return;
  const START_YEAR = 2013;
  const years = Math.max(0, new Date().getFullYear() - START_YEAR);
  experienceText.textContent = `${years} שנות ניסיון בתחום הטיפול.`;
})();

// Compatibility shim for the legacy booking script: the payment UI is intentionally
// removed from the live page, but app.js still references these elements internally.
// Hidden placeholders prevent those legacy references from interrupting date/slot loading.
(() => {
  const ids = [
    ["bookingPaymentStep", "div"],
    ["bookingPending", "div"],
    ["bankDetails", "div"],
    ["cardPayBtn", "a"],
    ["payboxBtn", "a"],
    ["bankBtn", "button"],
    ["demoPaidBtn", "button"],
    ["demoApproveBtn", "button"]
  ];
  const host = document.createElement("div");
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  for (const [id, tag] of ids) {
    if (document.getElementById(id)) continue;
    const el = document.createElement(tag);
    el.id = id;
    host.appendChild(el);
  }
  document.body.appendChild(host);
})();

// Temporary live flow: booking requests are sent for Lilach's approval without payment.
// Email is mandatory; WhatsApp confirmations are intentionally paused.
(() => {
  const cfg = window.LILACH_SITE_CONFIG;
  const emailInput = document.getElementById("bookEmail");
  const confirmButton = document.getElementById("confirmBooking");
  const message = document.getElementById("bookingMessage");
  const whatsappInput = document.getElementById("bookWhatsappConsent");
  const paymentStep = document.getElementById("bookingPaymentStep");

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.content = "לילך פבון – טיפול רגשי בשילוב CBT ו-NLP. מידע וקביעת פגישת איינטק.";
  }

  if (emailInput) {
    emailInput.required = true;
    const emailLabel = emailInput.closest("label");
    if (emailLabel && emailLabel.firstChild?.nodeType === Node.TEXT_NODE) {
      emailLabel.firstChild.textContent = "אימייל *";
    }
  }

  if (whatsappInput) {
    whatsappInput.checked = false;
    const whatsappLabel = whatsappInput.closest("label");
    if (whatsappLabel) whatsappLabel.style.display = "none";
  }

  if (paymentStep) paymentStep.classList.add("hidden");

  const requiredNote = document.querySelector(".booking-required-note");
  if (requiredNote) {
    requiredNote.textContent = "* שם פרטי, שם משפחה, טלפון, אימייל, סיבת הפנייה, מקור ההגעה ושני האישורים הם חובה.";
  }

  const processArticles = document.querySelectorAll("#process .steps article");
  if (processArticles.length >= 3) {
    const step2Title = processArticles[1].querySelector("h3");
    const step2Text = processArticles[1].querySelector("p");
    const step3Title = processArticles[2].querySelector("h3");
    const step3Text = processArticles[2].querySelector("p");

    if (step2Title) step2Title.textContent = "שולחים בקשה לאישור";
    if (step2Text) step2Text.textContent = "לאחר מילוי הפרטים ושליחת הבקשה, לילך מקבלת מייל עם פרטי הפגישה ובקשה לאישור.";
    if (step3Title) step3Title.textContent = "לילך מאשרת והפונה מקבל/ת מייל";
    if (step3Text) step3Text.textContent = "רק לאחר אישור לילך הפגישה מאושרת סופית, ונשלח לפונה מייל אישור עם פרטי הפגישה.";
  }

  const bookingIntro = document.querySelector("#booking .booking-layout > div:first-child > p");
  if (bookingIntro) {
    bookingIntro.textContent = "בוחרים מועד, ממלאים פרטים וסיבת פנייה ומאשרים את מדיניות שינוי התור. לאחר שליחת הבקשה לילך מקבלת מייל לאישור. רק לאחר אישורה נשלח לפונה מייל המאשר את הפגישה.";
  }

  const approvalParagraph = document.querySelector("#bookingApprovalStep > p");
  if (approvalParagraph) {
    approvalParagraph.textContent = "הבקשה נשלחה ללילך במייל. רק לאחר אישורה הפגישה תהיה סופית.";
  }

  const successParagraph = document.querySelector("#bookingSuccessStep > p");
  if (successParagraph) {
    successParagraph.textContent = "הפגישה אושרה על ידי לילך ונשלח לפונה מייל אישור עם פרטי הפגישה.";
  }

  if (confirmButton) confirmButton.textContent = "שליחת בקשה לאישור";
  if (!emailInput || !confirmButton) return;

  function showMessage(text, ok = false) {
    if (!message) return;
    message.textContent = text;
    message.className = `form-message ${ok ? "ok" : "err"}`;
  }

  function selectedDateIso() {
    const activeDate = document.querySelector(".date-btn.active b")?.textContent?.trim() || "";
    const match = /^(\d{1,2})\.(\d{1,2})$/.exec(activeDate);
    if (!match) return "";

    const day = Number(match[1]);
    const month = Number(match[2]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let year = today.getFullYear();
    let candidate = new Date(year, month - 1, day);
    candidate.setHours(0, 0, 0, 0);
    if (candidate < today) {
      year += 1;
      candidate = new Date(year, month - 1, day);
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function formatDateHe(dateValue) {
    const [year, month, day] = String(dateValue).split("-");
    if (!year || !month || !day) return String(dateValue || "");
    return `${day}/${month}/${year}`;
  }

  confirmButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const date = selectedDateIso();
    const time = document.querySelector(".slot-btn.active")?.textContent?.trim() || "";
    const firstName = document.getElementById("bookFirstName")?.value.trim() || "";
    const lastName = document.getElementById("bookLastName")?.value.trim() || "";
    const phone = document.getElementById("bookPhone")?.value.trim() || "";
    const email = emailInput.value.trim();
    const reason = document.getElementById("bookReason")?.value.trim() || "";
    const referral = document.getElementById("bookReferral")?.value.trim() || "";
    const privacyConsent = Boolean(document.getElementById("bookPrivacyConsent")?.checked);
    const policyAccepted = Boolean(document.getElementById("bookPolicyAccepted")?.checked);
    const meetingMode = document.querySelector('input[name="meetingMode"]:checked')?.value || "clinic";
    const meetingModeLabel = meetingMode === "zoom" ? "אונליין (Zoom)" : "בקליניקה";

    if (!date || !time) {
      showMessage("בחרו יום ושעה.");
      return;
    }
    if (!firstName || !lastName || !phone || !email || !reason || !referral) {
      showMessage("נא למלא שם פרטי, שם משפחה, טלפון, אימייל, סיבת פנייה ומאיפה שמעת/הגעת ללילך.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage("נא להזין כתובת אימייל תקינה. אישור הפגישה יישלח לכתובת זו.");
      emailInput.focus();
      return;
    }
    if (!privacyConsent) {
      showMessage("יש לאשר שמירת הפרטים לצורך תיאום וניהול הפגישה.");
      return;
    }
    if (!policyAccepted) {
      showMessage("כדי להמשיך יש לאשר את מדיניות שינוי התור בטווח 24 שעות.");
      return;
    }

    confirmButton.disabled = true;
    confirmButton.textContent = "שולח בקשה...";

    try {
      const response = await fetch(cfg.BOOKING_HOLD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          time,
          firstName,
          lastName,
          phone,
          email,
          reason,
          referral,
          privacyConsent: true,
          whatsappConsent: false,
          policyAccepted: true,
          meetingMode
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (["slot_taken", "slot_held"].includes(data.error)) {
          throw new Error("slot_taken");
        }
        throw new Error(data.error || "booking_failed");
      }

      document.getElementById("bookingDetailsStep")?.classList.add("hidden");
      document.getElementById("bookingPaymentStep")?.classList.add("hidden");
      document.getElementById("bookingSuccessStep")?.classList.add("hidden");
      document.getElementById("bookingApprovalStep")?.classList.remove("hidden");
      document.getElementById("bookingFormWrap")?.classList.remove("hidden");

      const confirmation = document.getElementById("bookingApprovalConfirmation");
      if (confirmation) {
        confirmation.innerHTML = `<b>${firstName} ${lastName} — בקשת הפגישה נשלחה.</b><span>${formatDateHe(date)} בשעה ${time} · ${meetingModeLabel}.<br>${meetingMode === "zoom" ? "קישור ל-Zoom יישלח סמוך למועד הפגישה.<br>" : ""}לילך קיבלה מייל עם בקשת האישור. לאחר אישורה יישלח אליך מייל אישור.</span>`;
      }

      showMessage("בקשת הפגישה נשלחה ללילך לאישור.", true);
      document.getElementById("bookingApprovalStep")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      console.error(error);
      if (error instanceof Error && error.message === "slot_taken") {
        showMessage("השעה כבר אינה פנויה. בחרו שעה אחרת.");
      } else {
        showMessage("לא הצלחנו לשלוח את בקשת הפגישה. נסו שוב בעוד רגע.");
      }
      confirmButton.disabled = false;
      confirmButton.textContent = "שליחת בקשה לאישור";
      return;
    }

    confirmButton.disabled = true;
    confirmButton.textContent = "הבקשה נשלחה";
  }, true);
})();
