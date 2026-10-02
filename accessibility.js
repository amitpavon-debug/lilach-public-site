(() => {
  const byId = (id) => document.getElementById(id);

  const setupHomeScreenInstall = () => {
    const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
    const isAndroid = /android/i.test(navigator.userAgent || "");

    const ensureHeadLink = (rel, href, extra = {}) => {
      let link = document.querySelector(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = href;
      Object.entries(extra).forEach(([key, value]) => link.setAttribute(key, value));
      return link;
    };

    const ensureMeta = (name, content) => {
      let meta = document.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = name;
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    ensureHeadLink("manifest", "/manifest.json");
    ensureHeadLink("apple-touch-icon", "https://lilach-assistant.vercel.app/icons/lilach-logo-192.png", { sizes: "192x192" });
    ensureMeta("apple-mobile-web-app-capable", "yes");
    ensureMeta("apple-mobile-web-app-status-bar-style", "default");
    ensureMeta("apple-mobile-web-app-title", "לילך פבון");

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
          console.error("PUBLIC SITE SERVICE WORKER ERROR:", error);
        });
      });
    }

    if (isStandalone || (!isIos && !isAndroid)) return;

    let deferredInstallPrompt = null;
    let installButton = null;

    const ensureInstallButton = () => {
      if (installButton || isStandalone) return installButton;
      const footerLinks = document.querySelector(".footer-links");
      if (!footerLinks) return null;

      installButton = document.createElement("button");
      installButton.type = "button";
      installButton.textContent = "הוספה למסך הבית";
      installButton.setAttribute("aria-label", "הוספת האתר של לילך פבון למסך הבית");
      Object.assign(installButton.style, {
        appearance: "none",
        border: "0",
        background: "transparent",
        padding: "0",
        margin: "0",
        color: "inherit",
        font: "inherit",
        cursor: "pointer",
        textDecoration: "underline",
        textUnderlineOffset: "3px"
      });

      installButton.addEventListener("click", async () => {
        if (deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          await deferredInstallPrompt.userChoice.catch(() => null);
          deferredInstallPrompt = null;
          return;
        }

        if (isIos) {
          alert("באייפון: יש לפתוח את האתר ב-Safari, ללחוץ על כפתור השיתוף ואז לבחור ‘הוספה למסך הבית’. האייקון שיופיע יהיה של לילך פבון.");
          return;
        }

        alert("בתפריט הדפדפן בחרו ‘התקנת אפליקציה’ או ‘הוספה למסך הבית’.");
      });

      footerLinks.appendChild(installButton);
      return installButton;
    };

    if (isIos) ensureInstallButton();

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      ensureInstallButton();
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      installButton?.remove();
      installButton = null;
    });
  };

  setupHomeScreenInstall();

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
    ageNote.innerHTML = "<strong>לתשומת לב:</strong> קביעת הפגישה באתר מיועדת למי שמלאו לו 18 שנים.";
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
  const setupAccessibilityWidget = () => {
    const STORAGE_KEY = "lilach-accessibility-preferences-v1";
    const defaults = {
      textScale: 100,
      highContrast: false,
      highlightLinks: false,
      readableFont: false,
      pauseAnimations: false,
    };

    const readPreferences = () => {
      try {
        return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
      } catch (_) {
        return { ...defaults };
      }
    };

    let preferences = readPreferences();
    const textTargets = "h1,h2,h3,h4,p,li,a,button,label,input,textarea,select,span,small,strong,b,em";

    const widget = document.createElement("div");
    widget.className = "a11y-widget";
    widget.innerHTML = `
      <button class="a11y-trigger" type="button" aria-label="פתיחת תפריט נגישות" aria-haspopup="dialog" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8.5 0C17.9 6.7 14.83 7 12 7S6.1 6.7 3.5 6L3 8c1.86.5 4 .83 6 1v13h2v-6h2v6h2V9c2-.17 4.14-.5 6-1l-.5-2Z"></path>
        </svg>
      </button>
      <section class="a11y-panel" role="dialog" aria-labelledby="a11y-panel-title" hidden>
        <div class="a11y-panel-head">
          <div class="a11y-title-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8.5 0C17.9 6.7 14.83 7 12 7S6.1 6.7 3.5 6L3 8c1.86.5 4 .83 6 1v13h2v-6h2v6h2V9c2-.17 4.14-.5 6-1l-.5-2Z"></path>
            </svg>
            <strong id="a11y-panel-title">נגישות</strong>
          </div>
          <button class="a11y-close" type="button" aria-label="סגירת תפריט נגישות">×</button>
        </div>

        <div class="a11y-panel-body">
          <div class="a11y-text-control">
            <span class="a11y-label">גודל טקסט</span>
            <div class="a11y-text-row">
              <button type="button" data-a11y-action="decrease-text" aria-label="הקטנת טקסט">−</button>
              <strong class="a11y-scale-value" aria-live="polite">100%</strong>
              <button type="button" data-a11y-action="increase-text" aria-label="הגדלת טקסט">+</button>
            </div>
          </div>

          <span class="a11y-label">התאמות תצוגה</span>
          <div class="a11y-options">
            <button type="button" data-a11y-toggle="highContrast" aria-pressed="false">
              <span class="a11y-option-icon" aria-hidden="true">◐</span>
              <span>ניגודיות גבוהה</span>
            </button>
            <button type="button" data-a11y-toggle="highlightLinks" aria-pressed="false">
              <span class="a11y-option-icon" aria-hidden="true">🔗</span>
              <span>הדגשת קישורים</span>
            </button>
            <button type="button" data-a11y-toggle="pauseAnimations" aria-pressed="false">
              <span class="a11y-option-icon" aria-hidden="true">Ⅱ</span>
              <span>עצירת אנימציות</span>
            </button>
            <button type="button" data-a11y-toggle="readableFont" aria-pressed="false">
              <span class="a11y-option-icon a11y-letter-icon" aria-hidden="true">A</span>
              <span>גופן קריא</span>
            </button>
          </div>

          <button class="a11y-reset" type="button" data-a11y-action="reset">
            <span aria-hidden="true">↻</span>
            <span>איפוס הכל</span>
          </button>

          <a class="a11y-statement-link" href="/accessibility">להצהרת הנגישות המלאה</a>
        </div>
      </section>
    `;
    document.body.appendChild(widget);

    const trigger = widget.querySelector(".a11y-trigger");
    const panel = widget.querySelector(".a11y-panel");
    const closeButton = widget.querySelector(".a11y-close");
    const scaleValue = widget.querySelector(".a11y-scale-value");

    const savePreferences = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      } catch (_) {}
    };

    const restoreTextSizes = () => {
      document.querySelectorAll("[data-a11y-base-font-size]").forEach((element) => {
        const original = element.getAttribute("data-a11y-original-inline-font-size") || "";
        if (original) element.style.fontSize = original;
        else element.style.removeProperty("font-size");
        element.removeAttribute("data-a11y-base-font-size");
        element.removeAttribute("data-a11y-original-inline-font-size");
      });
    };

    const applyTextScale = () => {
      const scale = Math.max(80, Math.min(140, Number(preferences.textScale) || 100));
      preferences.textScale = scale;
      if (scale === 100) {
        restoreTextSizes();
      } else {
        document.querySelectorAll(textTargets).forEach((element) => {
          if (element.closest(".a11y-widget")) return;
          if (!element.hasAttribute("data-a11y-base-font-size")) {
            element.setAttribute("data-a11y-base-font-size", String(parseFloat(getComputedStyle(element).fontSize) || 16));
            element.setAttribute("data-a11y-original-inline-font-size", element.style.fontSize || "");
          }
          const base = Number(element.getAttribute("data-a11y-base-font-size")) || 16;
          element.style.fontSize = String(Math.round(base * scale) / 100) + "px";
        });
      }
      scaleValue.textContent = String(scale) + "%";
    };

    const applyPreferences = () => {
      const root = document.documentElement;
      root.classList.toggle("a11y-high-contrast", Boolean(preferences.highContrast));
      root.classList.toggle("a11y-highlight-links", Boolean(preferences.highlightLinks));
      root.classList.toggle("a11y-readable-font", Boolean(preferences.readableFont));
      root.classList.toggle("a11y-pause-animations", Boolean(preferences.pauseAnimations));

      widget.querySelectorAll("[data-a11y-toggle]").forEach((button) => {
        const key = button.getAttribute("data-a11y-toggle");
        const active = Boolean(preferences[key]);
        button.setAttribute("aria-pressed", String(active));
        button.classList.toggle("is-active", active);
      });

      applyTextScale();
      savePreferences();
    };

    const openPanel = () => {
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => closeButton.focus());
    };

    const closePanel = () => {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    };

    trigger.addEventListener("click", () => {
      if (panel.hidden) openPanel();
      else closePanel();
    });
    closeButton.addEventListener("click", closePanel);

    widget.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-a11y-toggle]");
      if (toggle) {
        const key = toggle.getAttribute("data-a11y-toggle");
        preferences[key] = !preferences[key];
        applyPreferences();
        return;
      }

      const actionButton = event.target.closest("[data-a11y-action]");
      const action = actionButton ? actionButton.getAttribute("data-a11y-action") : "";
      if (!action) return;

      if (action === "increase-text") {
        preferences.textScale = Math.min(140, preferences.textScale + 10);
        applyPreferences();
      } else if (action === "decrease-text") {
        preferences.textScale = Math.max(80, preferences.textScale - 10);
        applyPreferences();
      } else if (action === "reset") {
        restoreTextSizes();
        preferences = { ...defaults };
        applyPreferences();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) closePanel();
    });

    document.addEventListener("click", (event) => {
      if (!panel.hidden && !widget.contains(event.target)) {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
    });

    const dynamicContentObserver = new MutationObserver((mutations) => {
      if (preferences.textScale === 100) return;
      if (!mutations.some((mutation) => mutation.addedNodes.length)) return;
      requestAnimationFrame(applyTextScale);
    });
    dynamicContentObserver.observe(document.body, { childList: true, subtree: true });

    applyPreferences();
  };

  setupAccessibilityWidget();

})();