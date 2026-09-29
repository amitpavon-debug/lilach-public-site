// Public browser configuration for Lilach's website.
// Do NOT place service-role keys, payment secrets, Resend secrets or WhatsApp tokens here.
window.LILACH_SITE_CONFIG = {
  // Supabase Edge Function URLs.
  // Real availability is safe to expose publicly and can be used while the booking flow remains in demo mode.
  BOOKING_AVAILABILITY_URL: "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/calendar-availability",
  BOOKING_HOLD_URL: "",
  BOOKING_STATUS_URL: "",

  // Temporary fallback while the new booking flow is not connected in production.
  VCITA_FALLBACK_URL: "https://live.vcita.com/site/oup23kigxjq62htf?o=cHJvZmlsZV9wYWdl&s=aHR0cHM6Ly9saXZlLnZjaXRhLmNvbS9zaXRlL291cDIza2lneGpxNjJodGY%3D&utm_source=ig&utm_medium=social&utm_content=link_in_bio",

  // Prefer booking-specific payment URLs returned by BOOKING_HOLD_URL.
  // These are optional fallback templates and may contain {booking_id} and {return_url}.
  CARD_PAYMENT_URL: "",
  PAYBOX_URL: "",
  BANK_TRANSFER: {
    bank: "",
    branch: "",
    account: "",
    beneficiary: ""
  },

  // true = preview mode with fake payment verification and fake Lilach approval.
  // Availability above is real even while demo mode is enabled.
  DEMO_BOOKING: true
};

// Email is mandatory because the final booking confirmation is sent by email.
// WhatsApp is intentionally paused for now.
(() => {
  const emailInput = document.getElementById("bookEmail");
  const confirmButton = document.getElementById("confirmBooking");
  const message = document.getElementById("bookingMessage");
  const whatsappInput = document.getElementById("bookWhatsappConsent");

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

  const requiredNote = document.querySelector(".booking-required-note");
  if (requiredNote) {
    requiredNote.textContent = "* שם פרטי, שם משפחה, טלפון, אימייל, סיבת הפנייה, מקור ההגעה ושני האישורים הם חובה.";
  }

  const processArticles = document.querySelectorAll("#process .steps article");
  if (processArticles.length >= 3) {
    const paymentText = processArticles[1].querySelector("p");
    if (paymentText) paymentText.textContent = "המועד נשמר זמנית בזמן התשלום. לאחר שהתשלום מאומת, לילך מקבלת מייל עם בקשה לאשר את הפגישה.";

    const confirmTitle = processArticles[2].querySelector("h3");
    const confirmText = processArticles[2].querySelector("p");
    if (confirmTitle) confirmTitle.textContent = "לילך מאשרת והפונה מקבל/ת מייל";
    if (confirmText) confirmText.textContent = "רק לאחר אישור לילך הפגישה מאושרת סופית, ונשלח לפונה מייל שהפגישה והתשלום אושרו.";
  }

  const bookingIntro = document.querySelector("#booking .booking-layout > div:first-child > p");
  if (bookingIntro) {
    bookingIntro.textContent = "בוחרים מועד, ממלאים פרטים וסיבת פנייה, מאשרים את מדיניות שינוי התור ומשלימים תשלום. לאחר אימות התשלום לילך מקבלת בקשת אישור במייל. רק לאחר אישורה נשלח לפונה מייל שהפגישה והתשלום אושרו.";
  }

  const paymentStepText = document.querySelector("#bookingPaymentStep .booking-step-head p");
  if (paymentStepText) {
    paymentStepText.textContent = "המועד נשמר עבורך זמנית. לאחר אימות התשלום תישלח ללילך בקשת אישור במייל.";
  }

  const approvalParagraph = document.querySelector("#bookingApprovalStep > p");
  if (approvalParagraph) {
    approvalParagraph.textContent = "נשלח ללילך מייל עם פרטי הפגישה ובקשה לאישור. רק לאחר אישורה הפגישה תהיה סופית.";
  }

  const successParagraph = document.querySelector("#bookingSuccessStep > p");
  if (successParagraph) {
    successParagraph.textContent = "הפגישה אושרה על ידי לילך ונשלח לפונה מייל שהפגישה והתשלום אושרו.";
  }

  if (!emailInput || !confirmButton) return;

  confirmButton.addEventListener("click", (event) => {
    const email = emailInput.value.trim();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!email || !validEmail) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (message) {
        message.textContent = "נא להזין כתובת אימייל תקינה. אישור הפגישה יישלח לכתובת זו.";
        message.className = "form-message err";
      }
      emailInput.focus();
    }
  }, true);
})();
