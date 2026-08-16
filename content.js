(function () {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    intervalMinutes: 15,
    headline: "GET BACK TO WORK!",
    volume: 1.0,
    audioMode: "default", // 'default' | 'url' | 'upload'
    audioUrl: "",
    audioData: "", // base64
    visualMode: "default", // 'default' (text only) | 'url' | 'upload'
    visualUrl: "",
    visualData: "", // base64
    visualKind: "video", // 'video' | 'gif'
  };

  const SECOND = 1000;
  const CHECK_INTERVAL = 1000;

  let settings = { ...DEFAULTS };
  let watchingSeconds = 0;
  let isWatching = false;
  let overlay = null;
  let alarmAudio = null;
  let visualElement = null;
  let timerId = null;
  let snoozeUntil = 0;

  // --- error reporting helper ---

  function captureError(context, err) {
    try {
      const payload = {
        lastError: {
          context,
          message: err && err.message ? err.message : String(err),
          stack: err && err.stack ? err.stack : '',
          url: typeof location !== 'undefined' ? location.href : '',
          time: Date.now(),
        },
      };
      chrome.storage.local.set(payload).catch(() => {});
    } catch (_) {
      // ignore
    }
  }

  // --- storage helpers ---

  async function loadSettings() {
    try {
      const res = await chrome.storage.local.get(DEFAULTS);
      settings = { ...DEFAULTS, ...res };
    } catch (e) {
      captureError('content.loadSettings', e);
    }
  }

  async function saveSettings(patch) {
    try {
      settings = { ...settings, ...patch };
      await chrome.storage.local.set(patch);
    } catch (e) {
      captureError('content.saveSettings', e);
    }
  }

  // --- detection ---

  function getVideos() {
    return Array.from(document.querySelectorAll("video"));
  }

  function isAnyVideoPlaying() {
    if (document.hidden) return false;
    return getVideos().some((v) => {
      if (v.paused) return false;
      if (v.ended) return false;
      if (v.readyState < 2) return false; // HAVE_CURRENT_DATA
      if (v.muted || v.volume === 0) return false;
      // ignore tiny clips/ads if currentTime not moving
      return !!(v.currentTime > 0 && !v.paused);
    });
  }

  function pauseAllVideos() {
    getVideos().forEach((v) => {
      try {
        v.pause();
      } catch (e) {
        // ignore
      }
    });
  }

  // --- overlay / reminder ---

  function createOverlay() {
    if (overlay) return overlay;

    const root = document.createElement("div");
    root.id = "gbw-overlay";
    root.setAttribute(
      "style",
      [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "display:flex",
        "justify-content:center",
        "align-items:center",
        "overflow:hidden",
        "background:rgba(0,0,0,0.85)",
        'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,sans-serif',
      ].join(";"),
    );

    const flash = document.createElement("div");
    flash.className = "gbw-flash";
    flash.setAttribute(
      "style",
      [
        "position:absolute",
        "inset:0",
        "pointer-events:none",
        "animation:gbw-flash 1s steps(1) infinite",
      ].join(";"),
    );

    const card = document.createElement("div");
    card.className = "gbw-card";
    card.setAttribute(
      "style",
      [
        "position:relative",
        "z-index:1",
        "text-align:center",
        "padding:2rem",
        "max-width:min(90vw,640px)",
        "background:linear-gradient(135deg,#ff3b3b 0%,#b30000 100%)",
        "color:#fff",
        "border-radius:24px",
        "box-shadow:0 20px 80px rgba(0,0,0,0.7)",
      ].join(";"),
    );

    const title = document.createElement("h1");
    title.id = "gbw-headline";
    title.textContent = settings.headline || DEFAULTS.headline;
    title.setAttribute(
      "style",
      [
        "font-size:clamp(2rem,8vw,4rem)",
        "margin:0 0 0.5rem",
        "text-transform:uppercase",
        "letter-spacing:0.04em",
        "text-shadow:0 4px 12px rgba(0,0,0,0.6)",
      ].join(";"),
    );

    const visualContainer = document.createElement("div");
    visualContainer.id = "gbw-visual";
    visualContainer.setAttribute(
      "style",
      ["margin-bottom:1.5rem", "min-height:80px"].join(";"),
    );

    const btnGroup = document.createElement("div");
    btnGroup.setAttribute(
      "style",
      [
        "display:flex",
        "gap:1rem",
        "justify-content:center",
        "flex-wrap:wrap",
      ].join(";"),
    );

    const backBtn = document.createElement("button");
    backBtn.textContent = "I'm back to work";
    backBtn.setAttribute(
      "style",
      [
        "padding:1rem 1.5rem",
        "font-size:1.15rem",
        "font-weight:700",
        "border:none",
        "border-radius:12px",
        "cursor:pointer",
        "background:#fff",
        "color:#b30000",
        "box-shadow:0 6px 0 #7a0000",
        "transition:transform .05s, box-shadow .05s",
      ].join(";"),
    );

    const snoozeBtn = document.createElement("button");
    snoozeBtn.textContent = "Snooze 5 min";
    snoozeBtn.setAttribute(
      "style",
      [
        "padding:1rem 1.5rem",
        "font-size:1.15rem",
        "font-weight:700",
        "border:2px solid #fff",
        "border-radius:12px",
        "cursor:pointer",
        "background:transparent",
        "color:#fff",
        "transition:background .15s",
      ].join(";"),
    );

    backBtn.addEventListener("click", () => dismissReminder(true));
    backBtn.addEventListener("mousedown", () => {
      backBtn.style.transform = "translateY(4px)";
      backBtn.style.boxShadow = "0 2px 0 #7a0000";
    });
    backBtn.addEventListener("mouseup", () => {
      backBtn.style.transform = "translateY(0)";
      backBtn.style.boxShadow = "0 6px 0 #7a0000";
    });

    snoozeBtn.addEventListener("click", () => dismissReminder(false));
    snoozeBtn.addEventListener("mouseenter", () => {
      snoozeBtn.style.background = "rgba(255,255,255,0.15)";
    });
    snoozeBtn.addEventListener("mouseleave", () => {
      snoozeBtn.style.background = "transparent";
    });

    btnGroup.appendChild(backBtn);
    btnGroup.appendChild(snoozeBtn);

    card.appendChild(title);
    card.appendChild(visualContainer);
    card.appendChild(btnGroup);

    root.appendChild(flash);
    root.appendChild(card);

    injectStyles();
    document.documentElement.appendChild(root);
    overlay = root;
    return overlay;
  }

  function injectStyles() {
    if (document.getElementById("gbw-styles")) return;
    const style = document.createElement("style");
    style.id = "gbw-styles";
    style.textContent = `
      @keyframes gbw-flash {
        0%, 100% { background: rgba(255, 59, 59, 0.25); }
        50% { background: rgba(0, 0, 0, 0.45); }
      }
      #gbw-overlay button:hover {
        opacity: 0.95;
      }
      #gbw-overlay button:focus {
        outline: 3px solid #fff;
        outline-offset: 2px;
      }
      #gbw-overlay video,
      #gbw-overlay img {
        max-width: 100%;
        max-height: 35vh;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.5);
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function buildAudioUrl() {
    if (settings.audioMode === "upload" && settings.audioData) {
      return settings.audioData;
    }
    if (settings.audioMode === "url" && settings.audioUrl.trim()) {
      return settings.audioUrl.trim();
    }
    return chrome.runtime.getURL("alarm.wav");
  }

  function buildVisualData() {
    if (settings.visualMode === "upload" && settings.visualData) {
      return settings.visualData;
    }
    if (settings.visualMode === "url" && settings.visualUrl.trim()) {
      return settings.visualUrl.trim();
    }
    return null;
  }

  async function startReminder() {
    if (overlay) return;

    pauseAllVideos();
    createOverlay();

    // --- Audio: deferred until user gesture due to autoplay policies ---
    alarmAudio = new Audio(buildAudioUrl());
    alarmAudio.loop = true;
    alarmAudio.volume = Math.min(1, Math.max(0, settings.volume));

    async function tryPlayAudio() {
      if (!alarmAudio || !overlay) return;
      try {
        await alarmAudio.play();
      } catch (err) {
        console.warn(
          "GetBackToWork: audio play blocked or unavailable; will wait for user gesture.",
          err,
        );
      }

    alarmAudio.addEventListener("error", () => {
      if (!alarmAudio) return;
      const defaultAudioUrl = chrome.runtime.getURL("alarm.wav");
      if (alarmAudio.src !== defaultAudioUrl) {
        console.warn(
          "GetBackToWork: custom audio failed to load; falling back to default alarm.",
        );
        alarmAudio.src = defaultAudioUrl;
        alarmAudio.load();
        tryPlayAudio();
      }
    });

    // Modern browsers (and Brave Shields) block autoplay without a user gesture.
    // Try anyway in case the user already interacted with the page, but show a
    // sound-on-demand button as the reliable path.
    tryPlayAudio();

    // --- Sound-on-demand button (works around autoplay blocks) ---
    const card = overlay.querySelector(".gbw-card");
    if (card) {
      const soundBtn = document.createElement("button");
      soundBtn.textContent = "🔊 Sound the alarm";
      soundBtn.id = "gbw-sound-btn";
      soundBtn.setAttribute(
        "style",
        [
          "margin-top:1rem",
          "padding:0.75rem 1.25rem",
          "font-size:1rem",
          "font-weight:700",
          "border:none",
          "border-radius:12px",
          "cursor:pointer",
          "background:#ffeb3b",
          "color:#000",
          "box-shadow:0 4px 0 #bfa600",
          "transition:transform .05s, box-shadow .05s",
        ].join(";"),
      );
      soundBtn.addEventListener("click", () => {
        tryPlayAudio();
        soundBtn.style.display = "none";
      });
      soundBtn.addEventListener("mousedown", () => {
        soundBtn.style.transform = "translateY(3px)";
        soundBtn.style.boxShadow = "0 1px 0 #bfa600";
      });
      soundBtn.addEventListener("mouseup", () => {
        soundBtn.style.transform = "translateY(0)";
        soundBtn.style.boxShadow = "0 4px 0 #bfa600";
      });
      card.appendChild(soundBtn);
    }

    // Global quick gesture: first click/press anywhere in overlay also starts sound.
    overlay.addEventListener(
      "pointerdown",
      function unlockAudio() {
        tryPlayAudio();
        overlay.removeEventListener("pointerdown", unlockAudio);
      },
      { once: true },
    );

    // Visual
    const visualData = buildVisualData();
    const container = document.getElementById("gbw-visual");
    if (container && visualData) {
      container.innerHTML = "";
      if (settings.visualKind === "gif") {
        const img = document.createElement("img");
        img.src = visualData;
        img.alt = "Reminder visual";
        container.appendChild(img);
      } else {
        const video = document.createElement("video");
        video.src = visualData;
        video.loop = true;
        video.autoplay = true;
        video.muted = false;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.volume = Math.min(1, Math.max(0, settings.volume));
        visualElement = video;
        container.appendChild(video);
        const vp = video.play();
        if (vp && typeof vp.catch === "function") {
          vp.catch((err) => {
            console.warn(
              "GetBackToWork: reminder video autoplay blocked; fallback audio only.",
              err,
            );
          });
        }
      }

    // Ensure alarm keeps trying if it gets paused by browser policy
    alarmAudio.addEventListener("pause", () => {
      if (
        alarmAudio &&
        overlay &&
        !alarmAudio.ended &&
        alarmAudio.currentTime > 0
      ) {
        alarmAudio.play().catch(() => {});
      }
    });
  }

  function dismissReminder(resetCounter) {
    if (overlay) {
      const parent = overlay.parentNode;
      if (parent) parent.removeChild(overlay);
      overlay = null;
    }
    if (alarmAudio) {
      alarmAudio.pause();
      alarmAudio.src = "";
      alarmAudio = null;
    }
    if (visualElement) {
      visualElement.pause();
      visualElement.src = "";
      visualElement = null;
    }
    if (resetCounter) {
      watchingSeconds = 0;
    } else {
      // snooze
      snoozeUntil = Date.now() + 5 * 60 * SECOND;
      watchingSeconds = Math.max(0, watchingSeconds - 5 * 60); // don't accumulate the snooze backlog
    }
  }

  // --- main loop ---

  function tick() {
    try {
      if (!settings.enabled) {
        isWatching = false;
        return;
      }

      if (overlay) return;

      if (Date.now() < snoozeUntil) return;

      const active = isAnyVideoPlaying();
      if (active) {
        isWatching = true;
        watchingSeconds += 1;
      } else {
        isWatching = false;
      }

      const threshold = settings.intervalMinutes * 60;
      if (watchingSeconds >= threshold) {
        startReminder();
      }
    } catch (e) {
      captureError('content.tick', e);
    }
  }

  async function startLoop() {
    await loadSettings();
    if (timerId) return;
    timerId = setInterval(tick, CHECK_INTERVAL);
  }

  // --- external commands from popup/options ---

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return false;

    switch (message.action) {
      case "preview":
        startReminder();
        sendResponse({ ok: true });
        return false;
      case "dismiss":
        dismissReminder(true);
        sendResponse({ ok: true });
        return false;
      case "ping":
        sendResponse({
          ok: true,
          watching: isWatching,
          seconds: watchingSeconds,
        });
        return false;
      default:
        return false;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const patch = {};
    Object.keys(changes).forEach((k) => {
      patch[k] = changes[k].newValue ?? DEFAULTS[k];
    });
    settings = { ...settings, ...patch };
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startLoop);
  } else {
    startLoop();
  }
})();
