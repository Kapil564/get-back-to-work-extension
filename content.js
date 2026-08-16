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
    educationalMode: false,
    educationalKeywords:
      "khan,freecodecamp,crashcourse,3blue1brown,mit,stanford,harvard,edx,coursera,udemy,lecture,tutorial,course,learn,how to,explain,education",
    educationalAllowMinutes: 30,
    hardBlockOnAlarm: true,
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
  let alarmActive = false;
  let educationalSeconds = 0;
  let lastDate = new Date().toDateString();
  let audioUnlocked = false;

  // --- error reporting helper ---

  function captureError(context, err) {
    try {
      const payload = {
        lastError: {
          context,
          message: err && err.message ? err.message : String(err),
          stack: err && err.stack ? err.stack : "",
          url: typeof location !== "undefined" ? location.href : "",
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
      const state = await chrome.storage.local.get({ alarmActive: false, educationalSeconds: 0, educationalDate: new Date().toDateString() });
      alarmActive = state.alarmActive;
      if (state.educationalDate !== new Date().toDateString()) {
        educationalSeconds = 0;
        await chrome.storage.local.set({ educationalSeconds: 0, educationalDate: new Date().toDateString() });
      } else {
        educationalSeconds = state.educationalSeconds || 0;
      }
    } catch (e) {
      captureError("content.loadSettings", e);
    }
  }

  async function saveSettings(patch) {
    try {
      settings = { ...settings, ...patch };
      await chrome.storage.local.set(patch);
    } catch (e) {
      captureError("content.saveSettings", e);
    }
  }

  async function setAlarmState(active) {
    alarmActive = active;
    try {
      await chrome.storage.local.set({ alarmActive: active });
      await chrome.runtime.sendMessage({ action: "setAlarmState", active });
    } catch (e) {
      captureError("content.setAlarmState", e);
    }
  }

  async function saveEduSeconds() {
    try {
      await chrome.storage.local.set({ educationalSeconds, educationalDate: new Date().toDateString() });
    } catch (e) {
      captureError("content.saveEduSeconds", e);
    }
  }

  // --- detection helpers ---

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

  function getPageText() {
    const title = document.title || "";
    const description =
      document.querySelector('meta[name="description"]')?.content ||
      document.querySelector('meta[property="og:description"]')?.content ||
      "";
    const h1 = document.querySelector("h1")?.textContent || "";
    return `${title} ${h1} ${description}`.toLowerCase();
  }

  function getYouTubeCategoryKeywords() {
    const texts = [].concat(
      ...Array.from(document.querySelectorAll('a, span, meta')).map((el) => {
        if (el.tagName === "META") return el.content || "";
        return el.textContent?.trim() || "";
      })
    );
    return texts.slice(0, 30).join(" ").toLowerCase();
  }

  function getChannelName() {
    const selectors = [
      "#text.ytd-channel-name a",
      "#upload-info ytd-channel-name a",
      "ytd-channel-name a",
      '[href^="/@"]',
      'a[href*="/channel/"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) return el.textContent.trim().toLowerCase();
    }
    return "";
  }

  function isEducationalVideo() {
    if (!settings.educationalMode) return false;

    const keywords = settings.educationalKeywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    if (keywords.length === 0) return false;

    const pageText = getPageText();
    const channel = getChannelName();
    const categoryTexts = getYouTubeCategoryKeywords();
    const combined = `${pageText} ${channel} ${categoryTexts}`;

    const matchesKeyword = keywords.some((kw) => combined.includes(kw));

    let isEducationCategory = false;
    try {
      const ld = document.querySelectorAll('script[type="application/ld+json"]');
      ld.forEach((s) => {
        const txt = s.textContent || "";
        if (/"genre"\s*:\s*"Education"/i.test(txt)) isEducationCategory = true;
        if (/"applicationCategory"\s*:\s*"Education"/i.test(txt)) isEducationCategory = true;
      });
    } catch (_e) {
      // ignore
    }

    return matchesKeyword || isEducationCategory;
  }

  function eduAllowanceExceeded() {
    if (!settings.educationalMode) return false;
    if (settings.educationalAllowMinutes <= 0) return false; // 0 = unlimited
    return educationalSeconds >= settings.educationalAllowMinutes * 60;
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

    const subText = document.createElement("p");
    subText.id = "gbw-subtext";
    subText.textContent = settings.hardBlockOnAlarm
      ? "YouTube and Instagram are locked until you get back to work."
      : "Time is up — close this tab and get back to work.";
    subText.setAttribute(
      "style",
      ["margin:0.5rem 0 1.5rem", "font-size:1.05rem", "opacity:0.95"].join(";"),
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
    card.appendChild(subText);
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

  async function tryPlayAudio() {
    if (!alarmAudio || !overlay) return;
    try {
      await alarmAudio.play();
      audioUnlocked = true;
    } catch (err) {
      console.warn(
        "GetBackToWork: audio play blocked or unavailable; will wait for user gesture.",
        err,
      );
    }
  }

  async function startReminder(force = false) {
    try {
      if (overlay && !force) return;

      pauseAllVideos();
      createOverlay();
      await setAlarmState(true);

      alarmAudio = new Audio(buildAudioUrl());
      alarmAudio.loop = true;
      alarmAudio.volume = Math.min(1, Math.max(0, settings.volume));

      // Ensure alarm keeps trying if it gets paused by browser policy (limited; works better after a gesture)
      alarmAudio.addEventListener("pause", () => {
        if (alarmAudio && overlay && !alarmAudio.ended && alarmAudio.currentTime > 0) {
          alarmAudio.play().catch(() => {});
        }
      });

      // First autoplay attempt
      tryPlayAudio();

      // Sound-on-demand button for strict autoplay policies
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
      }
    } catch (e) {
      captureError("content.startReminder", e);
    }
  }

  async function dismissReminder(resetCounter) {
    try {
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
      audioUnlocked = false;
      await setAlarmState(false);
      if (resetCounter) {
        watchingSeconds = 0;
        educationalSeconds = 0;
        await saveEduSeconds();
      } else {
        snoozeUntil = Date.now() + 5 * 60 * SECOND;
        watchingSeconds = Math.max(0, watchingSeconds - 5 * 60);
      }
    } catch (e) {
      captureError("content.dismissReminder", e);
    }
  }

  function resetDailyCountersIfNeeded() {
    const today = new Date().toDateString();
    if (lastDate !== today) {
      lastDate = today;
      watchingSeconds = 0;
      educationalSeconds = 0;
      saveEduSeconds();
    }
  }

  // --- main loop ---

  function tick() {
    try {
      resetDailyCountersIfNeeded();

      if (!settings.enabled) {
        isWatching = false;
        return;
      }

      if (overlay) return;

      if (Date.now() < snoozeUntil) return;

      // If alarm was active from another tab / navigation, enforce it here too
      if (alarmActive && settings.hardBlockOnAlarm) {
        startReminder(true);
        return;
      }

      const active = isAnyVideoPlaying();
      if (active) {
        const edu = isEducationalVideo();
        if (edu && !eduAllowanceExceeded()) {
          isWatching = false;
          educationalSeconds += 1;
          if (educationalSeconds % 15 === 0) saveEduSeconds();
          return;
        }
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
      captureError("content.tick", e);
    }
  }

  async function startLoop() {
    await loadSettings();
    if (timerId) return;
    timerId = setInterval(tick, CHECK_INTERVAL);
  }

  // --- external commands from popup/options/background ---

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return false;

    try {
      switch (message.action) {
        case "preview":
          startReminder();
          sendResponse({ ok: true });
          return false;
        case "forceOverlay":
          if (settings.hardBlockOnAlarm) startReminder(true);
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
            alarmActive,
            educationalSeconds,
            isEducational: isEducationalVideo(),
            eduAllowanceExceeded: eduAllowanceExceeded(),
          });
          return false;
        default:
          return false;
      }
    } catch (e) {
      captureError("content.onMessage", e);
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
    if (patch.alarmActive !== undefined) {
      alarmActive = patch.alarmActive;
    }
  });

  document.addEventListener("visibilitychange", () => {
    try {
      if (!document.hidden && alarmActive && settings.hardBlockOnAlarm) {
        startReminder(true);
      }
    } catch (e) {
      captureError("content.visibilitychange", e);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startLoop);
  } else {
    startLoop();
  }
})();
