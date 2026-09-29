(() => {
  const byId = (id) => document.getElementById(id);

  const liveIds = [
    "bookingState",
    "bookingMessage",
    "bookingPending",
    "bookingApprovalConfirmation",
    "bookingFinalConfirmation"
  ];

  for (const id of liveIds) {
    const el = byId(id);
    if (!el) continue;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
  }

  const syncChoiceState = () => {
    document.querySelectorAll(".date-btn").forEach((button) => {
      const active = button.classList.contains("active");
      button.setAttribute("aria-pressed", String(active));
      const text = button.textContent?.replace(/\s+/g, " ").trim();
      if (text) button.setAttribute("aria-label", `תאריך ${text}${active ? ", נבחר" : ""}`);
    });

    document.querySelectorAll(".slot-btn").forEach((button) => {
      const active = button.classList.contains("active");
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
    new MutationObserver(syncChoiceState).observe(slots, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
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
