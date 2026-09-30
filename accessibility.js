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
