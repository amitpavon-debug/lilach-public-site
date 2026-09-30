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

  /* Accessibility toolbar */
  const STORAGE_KEY = "lilach_accessibility_preferences_v1";
  const defaults = { fontLevel: 0, contrast: false, reduceMotion: false, underlineLinks: false };
  let preferences = { ...defaults };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") preferences = { ...defaults, ...saved };
  } catch (_) {}

  const tools = document.createElement("div");
  tools.className = "a11y-tools";
  tools.innerHTML = `
    <button class="a11y-toggle" id="a11yToggle" type="button" aria-expanded="false" aria-controls="a11yPanel" aria-label="פתיחת תפריט נגישות" title="נגישות">
      <span class="a11y-toggle-icon" aria-hidden="true">♿</span>
      <span class="a11y-toggle-label">נגישות</span>
    </button>
    <div class="a11y-panel" id="a11yPanel" hidden role="region" aria-labelledby="a11yPanelTitle">
      <div class="a11y-panel-head">
        <strong class="a11y-panel-title" id="a11yPanelTitle">כלי נגישות</strong>
        <button class="a11y-close" id="a11yClose" type="button" aria-label="סגירת תפריט נגישות">×</button>
      </div>
      <div class="a11y-actions">
        <button class="a11y-action" id="a11yFont" type="button">הגדלת טקסט</button>
        <button class="a11y-action" id="a11yContrast" type="button" aria-pressed="false">ניגודיות גבוהה</button>
        <button class="a11y-action" id="a11yMotion" type="button" aria-pressed="false">הפחתת אנימציות</button>
        <button class="a11y-action" id="a11yLinks" type="button" aria-pressed="false">הדגשת קישורים</button>
        <button class="a11y-action" id="a11yMain" type="button">מעבר לתוכן הראשי</button>
        <button class="a11y-reset" id="a11yReset" type="button">איפוס הגדרות נגישות</button>
      </div>
      <a class="a11y-statement" href="/accessibility">הצהרת נגישות</a>
      <p class="a11y-note">הכלים כאן הם תוספת להתאמות הנגישות המובנות באתר.</p>
    </div>
    <div class="a11y-sr-status" id="a11yStatus" role="status" aria-live="polite" aria-atomic="true"></div>
  `;
  document.body.appendChild(tools);

  const toggle = byId("a11yToggle");
  const panel = byId("a11yPanel");
  const close = byId("a11yClose");
  const fontButton = byId("a11yFont");
  const contrastButton = byId("a11yContrast");
  const motionButton = byId("a11yMotion");
  const linksButton = byId("a11yLinks");
  const mainButton = byId("a11yMain");
  const resetButton = byId("a11yReset");
  const status = byId("a11yStatus");
  const root = document.documentElement;

  const announce = (text) => {
    if (!status) return;
    status.textContent = "";
    requestAnimationFrame(() => { status.textContent = text; });
  };

  const savePreferences = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch (_) {}
  };

  const applyPreferences = () => {
    root.classList.toggle("a11y-text-large", preferences.fontLevel === 1);
    root.classList.toggle("a11y-text-larger", preferences.fontLevel === 2);
    root.classList.toggle("a11y-high-contrast", Boolean(preferences.contrast));
    root.classList.toggle("a11y-reduce-motion", Boolean(preferences.reduceMotion));
    root.classList.toggle("a11y-underline-links", Boolean(preferences.underlineLinks));

    if (fontButton) {
      fontButton.textContent = preferences.fontLevel === 0
        ? "הגדלת טקסט"
        : preferences.fontLevel === 1
          ? "הגדלת טקסט נוספת"
          : "החזרת גודל טקסט";
      fontButton.setAttribute("aria-label", fontButton.textContent);
    }
    contrastButton?.setAttribute("aria-pressed", String(Boolean(preferences.contrast)));
    motionButton?.setAttribute("aria-pressed", String(Boolean(preferences.reduceMotion)));
    linksButton?.setAttribute("aria-pressed", String(Boolean(preferences.underlineLinks)));
  };

  const setPanelOpen = (open, returnFocus = false) => {
    if (!panel || !toggle) return;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "סגירת תפריט נגישות" : "פתיחת תפריט נגישות");
    if (open) requestAnimationFrame(() => close?.focus());
    else if (returnFocus) requestAnimationFrame(() => toggle.focus());
  };

  toggle?.addEventListener("click", () => setPanelOpen(Boolean(panel?.hidden)));
  close?.addEventListener("click", () => setPanelOpen(false, true));

  fontButton?.addEventListener("click", () => {
    preferences.fontLevel = (Number(preferences.fontLevel) + 1) % 3;
    applyPreferences();
    savePreferences();
    announce(preferences.fontLevel === 0 ? "גודל הטקסט הוחזר לברירת המחדל" : `גודל הטקסט הוגדל, רמה ${preferences.fontLevel}`);
  });

  contrastButton?.addEventListener("click", () => {
    preferences.contrast = !preferences.contrast;
    applyPreferences();
    savePreferences();
    announce(preferences.contrast ? "ניגודיות גבוהה הופעלה" : "ניגודיות גבוהה בוטלה");
  });

  motionButton?.addEventListener("click", () => {
    preferences.reduceMotion = !preferences.reduceMotion;
    applyPreferences();
    savePreferences();
    announce(preferences.reduceMotion ? "הפחתת אנימציות הופעלה" : "הפחתת אנימציות בוטלה");
  });

  linksButton?.addEventListener("click", () => {
    preferences.underlineLinks = !preferences.underlineLinks;
    applyPreferences();
    savePreferences();
    announce(preferences.underlineLinks ? "הדגשת קישורים הופעלה" : "הדגשת קישורים בוטלה");
  });

  mainButton?.addEventListener("click", () => {
    const main = byId("main-content") || document.querySelector("main");
    if (!main) return;
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    setPanelOpen(false, false);
    main.focus({ preventScroll: false });
    main.scrollIntoView({ block: "start" });
    announce("הועברת לתוכן הראשי");
  });

  resetButton?.addEventListener("click", () => {
    preferences = { ...defaults };
    applyPreferences();
    savePreferences();
    announce("הגדרות הנגישות אופסו");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel && !panel.hidden) {
      event.preventDefault();
      setPanelOpen(false, true);
    }
  });

  document.addEventListener("click", (event) => {
    if (!panel || panel.hidden || tools.contains(event.target)) return;
    setPanelOpen(false, false);
  });

  applyPreferences();
  syncChoiceState();
})();
