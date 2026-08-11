# 🔥 Get Back To Work

A Chrome/Brave browser extension that detects when you're actively watching videos on YouTube or Instagram and interrupts you with a loud, attention-grabbing reminder after a configurable time limit.

I lost motivation easily and started slipping into long YouTube/Instagram binges during work hours. Existing tools either blocked sites entirely (too harsh) or sent easy-to-ignore notifications (too weak). This extension sits in the middle: it lets you watch when you want, but after your set limit, it breaks the flow state with a reminder you have to consciously dismiss.

---

## Features

- **Automatic video detection** on `youtube.com` and `instagram.com`
- **Timer only counts while a video is actually playing** and the tab is visible
- **Configurable trigger interval** (1–180 minutes, default 15)
- **Full-screen overlay** with flashing animation and custom headline
- **Looping alarm audio** with fallback to bundled siren if autoplay is blocked
- **Custom audio support**: default siren, direct URL, or uploaded file
- **Custom visual support**: text-only, video, or GIF via URL or upload
- **Volume control**
- **"I'm back to work"** — closes overlay and resets timer
- **"Snooze 5 min"** — dismisses overlay and pauses new triggers for 5 minutes
- **Toolbar popup** with enable/disable toggle and preview
- **Full options page** for settings and reminder preview

---

## Install

### From source (recommended for now)

1. Open **Chrome** or **Brave** and navigate to `chrome://extensions`.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **"Load unpacked"**.
4. Select the extension folder (the folder containing `manifest.json`).
5. Pin the extension to your toolbar: click the extensions icon (puzzle piece) → pin 🔥.

---

## How to Use

1. Visit **YouTube** or **Instagram**.
2. Play a video or reel.
3. The extension starts a timer the moment the video is actively playing.
4. Once your configured interval is reached, the video pauses and a full-screen reminder appears.
5. Choose **"I'm back to work"** to reset the timer, or **"Snooze 5 min"** to dismiss temporarily.

To test the reminder immediately, click the extension icon and press **"Preview Reminder"** while on YouTube or Instagram.

---

## Settings

Open the extension settings by clicking the extension icon → **"Open Settings"**.

| Setting | Description |
|---------|-------------|
| Enable extension | Toggle monitoring on/off |
| Trigger interval | Minutes of watching before triggering the reminder |
| Headline text | Custom text shown on the overlay |
| Volume | Audio volume from 0 to 100% |
| Audio source | Default siren / URL / uploaded file |
| Visual media | Text-only / video / GIF via URL or upload |

All settings are stored locally with `unlimitedStorage` so uploaded media files work without quota issues.

---

## Permissions

- `storage` / `unlimitedStorage` — save your settings and uploaded media
- `activeTab` — send preview trigger to the currently active tab
- Host permissions for `*.youtube.com` and `*.instagram.com` — inject the content script

No remote network calls are made by the extension. No analytics, no tracking.

---

## File Structure

```
get-back-to-work-extension/
├── manifest.json       # Extension manifest (MV3)
├── content.js          # Detection, timer, overlay, reminder
├── popup.html          # Toolbar popup markup
├── popup.js            # Toolbar popup logic
├── options.html        # Full settings page markup
├── options.js          # Full settings page logic
├── shared.css          # Styles for popup and options
├── alarm.wav           # Bundled default siren
└── icons/              # Extension icons
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## Roadmap

Ideas for future versions:

- [ ] Escalation after repeated dismissals (shorter interval / capped snooze)
- [ ] Optional hard block — close tab or redirect after ignored overlay
- [ ] Daily watch-time stats in popup
- [ ] User-configurable site list (Twitter/X, Reddit, Netflix, etc.)
- [ ] Focus schedule for different rules during work hours
- [ ] Random media/message rotation to avoid habituation
- [ ] Cross-device sync for small settings

---

## Report an Error

If the extension crashes or something behaves unexpectedly, the popup or settings page may show an error banner.

1. Click the **"Report on GitHub"** button in the popup or settings.
2. Review the prefilled details and submit the issue.
3. **Report any error on GitHub — it will be fixed in a later version.**

No analytics or remote logging is used, so a GitHub issue is the best way to help improve the extension.

---

## Notes

- **Brave users**: autoplay/audio policies can vary depending on Shields settings. If custom audio/video doesn't auto-play, the bundled siren will try to play as a fallback.
- This is intentionally a **nudge**, not a blocker. The goal is to break the passive-watching flow without removing agency.

---

## License

MIT

Built by **Kapil Sisodiya**.
