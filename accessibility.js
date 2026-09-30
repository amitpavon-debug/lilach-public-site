(() => {
  const byId = (id) => document.getElementById(id);

  const liveIds = [
    "bookingState",
    "bookingMessage",
    "bookingPending",
    "bookingApprovalConfirmation",
    "bookingFinalConfirmation"
  ];

  const syncLiveRegion = (el) => {
    if (!el) return;
    const isError = el.classList.contains("err") || el.classList.contains("error");
    el.setAttribute("role", isError ? "alert" : "status");
    el.setAttribute("aria-live", isError ? "assertive" : "polite");
    el.setAttribute("aria-atomic", "true");
  };

  for (const id of liveIds) {
    const el = byId(id);
    if (!el) continue;
    syncLiveRegion(el);
    new MutationObserver(() => syncLiveRegion(el)).observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  const requiredIds = [
    "bookFirstName",
    "bookLastName",
    "bookPhone",
    "bookEmail",
    "bookReason",
    "bookReferral",
    "bookPrivacyConsent",
    "bookPolicyAccepted"
  ];

  for (const id of requiredIds) {
    const field = byId(id);
    if (!field) continue;
    field.required = true;
    field.setAttribute("aria-required", "true");
  }

  const returningClient = byId("bookReturningClient");
  const reasonField = byId("bookReason");
  const referralField = byId("bookReferral");
  const returningValue = "כבר נפגשתי בעבר עם לילך";

  if (returningClient && reasonField && referralField) {
    const returningText = returningClient.closest("label")?.querySelector("span");
    if (returningText) {
      returningText.innerHTML = '<strong>כבר נפגשתי בעבר עם לילך</strong><br><small>אם כבר נפגשת בעבר עם לילך, יש לסמן כאן — אין צורך לציין שוב את סיבת הפנייה או מאיפה הגעת ללילך.</small>';
    }

    let returningOption = Array.from(referralField.options).find((option) => option.value === returningValue);
    if (!returningOption) {
      returningOption = document.createElement("option");
      returningOption.value = returningValue;
      returningOption.textContent = returningValue;
      returningOption.hidden = true;
      referralField.appendChild(returningOption);
    }

    const intro = document.querySelector("#bookingDetailsStep .booking-step-head p");
    if (intro) {
      intro.innerHTML = 'בפנייה ראשונה יש למלא <strong>סיבת פנייה</strong> וגם <strong>מאיפה שמעת/הגעת ללילך</strong>. אם כבר נפגשת בעבר עם לילך, ניתן לסמן זאת ואין צורך למלא את שני השדות.';
    }

    const requiredNote = document.querySelector(".booking-required-note");
    if (requiredNote) {
      requiredNote.textContent = "* בפנייה ראשונה סיבת הפנייה ומקור ההגעה הם חובה. אם כבר נפגשת בעבר עם לילך, אין צורך למלא אותם.";
    }

    const syncReturningFields = () => {
      const isReturning = returningClient.checked;

      reasonField.disabled = isReturning;
      referralField.disabled = isReturning;
      reasonField.required = !isReturning;
      referralField.required = !isReturning;
      reasonField.setAttribute("aria-required", String(!isReturning));
      referralField.setAttribute("aria-required", String(!isReturning));
      reasonField.setAttribute("aria-disabled", String(isReturning));
      referralField.setAttribute("aria-disabled", String(isReturning));

      if (isReturning) {
        reasonField.value = "";
        referralField.value = returningValue;
        reasonField.placeholder = "אין צורך לציין סיבה מחדש";
      } else {
        if (referralField.value === returningValue) referralField.value = "";
        reasonField.placeholder = "בכמה מילים, מה מביא אותך לפנות עכשיו?";
      }
    };

    returningClient.addEventListener("change", syncReturningFields);

    const newBookingButton = byId("newBookingBtn");
    if (newBookingButton) {
      newBookingButton.addEventListener("click", () => {
        returningClient.checked = false;
        requestAnimationFrame(syncReturningFields);
      });
    }

    syncReturningFields();
  }

  const bookingForm = byId("bookingFormWrap");
  if (bookingForm) {
    bookingForm.setAttribute("role", "region");
    bookingForm.setAttribute("aria-label", "פרטי בקשת הפגישה");
  }

  const syncChoiceState = () => {
    document.querySelectorAll(".date-btn").forEach((button) => {
      const active = button.classList.contains("active");
      button.type = "button";
      button.setAttribute("aria-pressed", String(active));
      const text = button.textContent?.replace(/\s+/g, " ").trim();
      if (text) button.setAttribute("aria-label", `תאריך ${text}${active ? ", נבחר" : ""}`);
    });

    document.querySelectorAll(".slot-btn").forEach((button) => {
      const active = button.classList.contains("active");
      button.type = "button";
      button.setAttribute("aria-pressed", String(active));
      const text = button.textContent?.trim();
      if (text) button.setAttribute("aria-label", `שעה ${text}${active ? ", נבחרה" : ""}`);
    });
  };

  const dateStrip = byId("dateStrip");
  const slots = byId("slots");

  if (dateStrip) {
    dateStrip.setAttribute("role", "group");
    dateStrip.setAttribute("aria-label", "בחירת תאריך");
    new MutationObserver(syncChoiceState).observe(dateStrip, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  if (slots) {
    slots.setAttribute("role", "group");
    slots.setAttribute("aria-label", "בחירת שעה");
    slots.setAttribute("aria-live", "polite");
    slots.setAttribute("aria-atomic", "true");

    const syncSlotsBusy = () => {
      const loading = /טוען/.test(slots.textContent || "");
      slots.setAttribute("aria-busy", String(loading));
      syncChoiceState();
    };

    new MutationObserver(syncSlotsBusy).observe(slots, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    syncSlotsBusy();
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest(".date-btn, .slot-btn")) {
      requestAnimationFrame(syncChoiceState);
    }
  }, true);

  const focusStepWhenShown = (stepId) => {
    const step = byId(stepId);
    if (!step) return;
    const observer = new MutationObserver(() => {
      if (!step.classList.contains("hidden")) {
        const heading = step.querySelector("h3");
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          requestAnimationFrame(() => heading.focus({ preventScroll: true }));
        }
      }
    });
    observer.observe(step, { attributes: true, attributeFilter: ["class"] });
  };

  focusStepWhenShown("bookingApprovalStep");
  focusStepWhenShown("bookingSuccessStep");

  syncChoiceState();
})();
