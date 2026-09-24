// Public browser configuration for Lilach's website.
// Do NOT place service-role keys, payment secrets, Resend secrets or WhatsApp tokens here.
window.LILACH_SITE_CONFIG = {
  // Supabase Edge Function URLs, for example:
  // https://YOUR_PROJECT.supabase.co/functions/v1/calendar-availability
  BOOKING_AVAILABILITY_URL: "",
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

  // true = preview mode with fake availability, fake payment verification and fake Lilach approval.
  DEMO_BOOKING: true
};
