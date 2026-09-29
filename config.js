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
// This adds client-side validation without exposing any secrets in the browser.
(() => {
  const emailInput = document.getElementById("bookEmail");
  const confirmButton = document.getElementById("confirmBooking");
  const message = document.getElementById("bookingMessage");

  if (!emailInput || !confirmButton) return;

  emailInput.required = true;

  const emailLabel = emailInput.closest("label");
  if (emailLabel && emailLabel.firstChild?.nodeType === Node.TEXT_NODE) {
    emailLabel.firstChild.textContent = "אימייל *";
  }

  const requiredNote = document.querySelector(".booking-required-note");
  if (requiredNote) {
    requiredNote.textContent = "* שם פרטי, שם משפחה, טלפון, אימייל, סיבת הפנייה, מקור ההגעה ושלושת האישורים הם חובה.";
  }

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
