(() => {
  const promptEl = document.getElementById("installPrompt");
  const installBtn = document.getElementById("installAppBtn");
  const laterBtn = document.getElementById("installLaterBtn");
  const help = document.getElementById("installHelp");
  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => console.error("SW register failed", err));
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });

  const openPrompt = () => {
    if (!promptEl || isStandalone()) return;
    promptEl.classList.remove("hidden");
  };

  const closePrompt = () => {
    promptEl?.classList.add("hidden");
    if (help) {
      help.classList.add("hidden");
      help.textContent = "";
    }
  };

  laterBtn?.addEventListener("click", closePrompt);
  promptEl?.querySelector(".install-prompt__backdrop")?.addEventListener("click", closePrompt);

  installBtn?.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === "accepted") closePrompt();
      } finally {
        deferredPrompt = null;
      }
      return;
    }

    if (help) {
      help.classList.remove("hidden");
      help.innerHTML = isIOS
        ? '<strong>באייפון:</strong> לחצו על כפתור השיתוף בדפדפן ואז על “הוסף למסך הבית”.'
        : '<strong>בדפדפן:</strong> פתחו את התפריט ובחרו “התקנת האפליקציה” או “הוספה למסך הבית”.';
    }
  });

  window.addEventListener("appinstalled", closePrompt);

  // Show our own clear prompt on every normal browser opening until the shortcut is installed.
  window.setTimeout(openPrompt, 650);
})();