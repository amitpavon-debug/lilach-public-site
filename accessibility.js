(() => {
  const byId = (id) => document.getElementById(id);

  const syncBookingStaticContent = () => {
    const booking = byId("booking");
    if (!booking) return;

    const bookingIntro = booking.querySelector(".booking-layout > div:first-child > p");
    if (bookingIntro) {
      bookingIntro.textContent = "בוחרים מועד, ממלאים פרטים וסיבת פנייה ומאשרים את מדיניות שינוי התור וממתינים לאישור.";
    }

    booking.querySelectorAll(".privacy-box").forEach((box) => {
      const title = box.querySelector("b")?.textContent?.trim() || "";
      if (title === "לפני קביעת הפגישה") box.remove();
    });

    let ageNote = booking.querySelector(".booking-age-note") ||
      booking.querySelector(".booking-layout > div:first-child > .booking-required-note");

    if (ageNote) {
      ageNote.classList.add("booking-age-note");
    } else {
      ageNote = document.createElement("p");
      ageNote.className = "booking-required-note booking-age-note";
      const privacyBox = Array.from(booking.querySelectorAll(".privacy-box"))
        .find((box) => (box.querySelector("b")?.textContent || "").includes("שמירה על פרטיות"));
      if (privacyBox) {
        privacyBox.insertAdjacentElement("afterend", ageNote);
      } else {
        booking.querySelector(".booking-layout > div:first-child")?.appendChild(ageNote);
      }
    }
    ageNote.innerHTML = "<strong>לתשומת לב:</strong> קביעת הפגישה באתר מיועדת למי שמלאו להם 18 שנים.";
  };

  syncBookingStaticContent();

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
      returningText.innerHTML = '<strong>כבר נפגשתי בעבר עם לילך</strong><br><small>אם כבר נפגשת בעבר עם לילך, יש לסמן כאן — אין צורך לציין שוב את סיבת הפנייה. מקור ההגעה יסומן אוטומטית כ״אחר״.</small>';
    }

    const intro = document.querySelector("#bookingDetailsStep .booking-step-head p");
    if (intro) {
      intro.innerHTML = 'בפנייה ראשונה יש למלא <strong>סיבת פנייה</strong> וגם <strong>מאיפה שמעת/הגעת ללילך</strong>. אם כבר נפגשת בעבר עם לילך, ניתן לסמן זאת — אין צורך למלא סיבת פנייה ומקור ההגעה יסומן אוטומטית כ״אחר״.';
    }

    const requiredNote = document.querySelector("#bookingDetailsStep .booking-required-note");
    if (requiredNote) {
      requiredNote.textContent = "* בפנייה ראשונה סיבת הפנייה ומקור ההגעה הם חובה. אם כבר נפגשת בעבר עם לילך, אין צורך למלא סיבת פנייה ומקור ההגעה יסומן אוטומטית כאחר.";
    }

    const syncReturningFields = () => {
      const isReturning = returningClient.checked;

      if (isReturning) {
        reasonField.value = returningValue;
        reasonField.disabled = true;
        reasonField.required = false;
        reasonField.setAttribute("aria-required", "false");
        reasonField.setAttribute("aria-disabled", "true");
        reasonField.placeholder = "אין צורך לציין סיבה מחדש";

        referralField.disabled = false;
        referralField.required = false;
        referralField.value = "אחר";
        referralField.setAttribute("aria-required", "false");
        referralField.setAttribute("aria-disabled", "false");
      } else {
        reasonField.disabled = false;
        reasonField.required = true;
        reasonField.setAttribute("aria-required", "true");
        reasonField.setAttribute("aria-disabled", "false");
        if (reasonField.value === returningValue) reasonField.value = "";
        reasonField.placeholder = "בכמה מילים, מה מביא אותך לפנות עכשיו?";

        referralField.disabled = false;
        referralField.required = true;
        referralField.setAttribute("aria-required", "true");
        referralField.setAttribute("aria-disabled", "false");
        if (referralField.value === "אחר") referralField.value = "";
      }
    };

    returningClient.addEventListener("change", () => {
      queueMicrotask(syncReturningFields);
    });

    const confirmBooking = byId("confirmBooking");
    if (confirmBooking) {
      confirmBooking.addEventListener("click", () => {
        if (!returningClient.checked) return;
        reasonField.value = returningValue;
        referralField.disabled = false;
        referralField.value = "אחר";
      }, true);
    }

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