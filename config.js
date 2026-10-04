// Public browser configuration for Lilach's website.
// Do NOT place service-role keys, payment secrets, Resend secrets or WhatsApp tokens here.
window.LILACH_SITE_CONFIG = {
  BOOKING_AVAILABILITY_URL: "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/calendar-availability",
  BOOKING_HOLD_URL: "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/booking-hold",
  BOOKING_STATUS_URL: "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/booking-status",
  PAYMENT_REVIEW_URL: "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/payment-review",
  SITE_ANALYTICS_URL: "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/site-analytics",
  VCITA_FALLBACK_URL: "",
  CARD_PAYMENT_URL: "",
  PAYBOX_URL: "https://links.payboxapp.com/7rvI3BpGZUb",
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

// app.js still contains optional legacy payment controls. Create hidden placeholders
// only for controls that are not part of the current PayBox checkout UI.
(() => {
  const ids = [
    ["bankDetails", "div"],
    ["cardPayBtn", "a"],
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

// Email is mandatory because confirmations and booking updates are sent by email.
(() => {
  const emailInput = document.getElementById("bookEmail");
  if (emailInput) {
    emailInput.required = true;
    const emailLabel = emailInput.closest("label");
    if (emailLabel && emailLabel.firstChild?.nodeType === Node.TEXT_NODE) {
      emailLabel.firstChild.textContent = "אימייל *";
    }
  }

  // Price/hero CTA links preselect the correct appointment type.
  document.querySelectorAll("[data-booking-type]").forEach((link) => {
    link.addEventListener("click", () => {
      const type = link.getAttribute("data-booking-type");
      if (!["intake", "therapy"].includes(type || "")) return;
      const radio = document.querySelector(`input[name="appointmentType"][value="${type}"]`);
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  });
})();
