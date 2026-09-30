(() => {
  const RETURNING_VALUE = "כבר נפגשתי בעבר עם לילך";
  const REFERRAL_VALUE = "אחר";

  const returningClient = document.getElementById("bookReturningClient");
  const reasonField = document.getElementById("bookReason");
  const referralField = document.getElementById("bookReferral");
  const confirmBooking = document.getElementById("confirmBooking");

  if (!returningClient || !reasonField || !referralField) return;

  const applyReturningState = () => {
    const isReturning = Boolean(returningClient.checked);

    if (isReturning) {
      reasonField.value = RETURNING_VALUE;
      reasonField.disabled = true;
      reasonField.required = false;
      reasonField.setAttribute("aria-required", "false");
      reasonField.setAttribute("aria-disabled", "true");
      reasonField.placeholder = "אין צורך לציין סיבה מחדש";

      // Keep the referral field active and select the existing "אחר" option.
      referralField.disabled = false;
      referralField.required = false;
      referralField.value = REFERRAL_VALUE;
      referralField.setAttribute("aria-required", "false");
      referralField.setAttribute("aria-disabled", "false");
    } else {
      reasonField.disabled = false;
      reasonField.required = true;
      reasonField.setAttribute("aria-required", "true");
      reasonField.setAttribute("aria-disabled", "false");
      if (reasonField.value === RETURNING_VALUE) reasonField.value = "";
      reasonField.placeholder = "בכמה מילים, מה מביא אותך לפנות עכשיו?";

      referralField.disabled = false;
      referralField.required = true;
      referralField.setAttribute("aria-required", "true");
      referralField.setAttribute("aria-disabled", "false");
      if (referralField.value === REFERRAL_VALUE) referralField.value = "";
    }
  };

  returningClient.addEventListener("change", () => {
    // Run after the older listeners so this state is final.
    queueMicrotask(applyReturningState);
  });

  if (confirmBooking) {
    // This listener is registered after the older compatibility listener,
    // so the values below are the final values read by the legacy app.js.
    confirmBooking.addEventListener("click", () => {
      if (!returningClient.checked) return;
      reasonField.value = RETURNING_VALUE;
      referralField.disabled = false;
      referralField.value = REFERRAL_VALUE;
    }, true);
  }

  applyReturningState();
})();
