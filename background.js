const LOCKED_HOSTS = ['youtube.com', 'instagram.com'];
const EXEMPT_PATHS = ['/feed', '/subscriptions', '/history', '/playlist'];

function isWatchUrl(host, pathname) {
  if (!LOCKED_HOSTS.some((h) => host.endsWith(h))) return false;
  const path = pathname.toLowerCase();
  if (host.includes('youtube')) {
    return path.startsWith('/watch') || path.startsWith('/shorts');
  }
  if (host.includes('instagram')) {
    return path.startsWith('/reel');
  }
  return false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'setAlarmState') {
    chrome.storage.local.set({ alarmActive: !!message.active });
    sendResponse({ ok: true });
    return false;
  }
  if (message?.action === 'getAlarmState') {
    chrome.storage.local.get({ alarmActive: false }).then((r) => {
      sendResponse({ alarmActive: r.alarmActive });
    });
    return true;
  }
  return false;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  const url = new URL(tab.url);
  const { alarmActive } = await chrome.storage.local.get({ alarmActive: false });
  if (alarmActive && isWatchUrl(url.hostname, url.pathname)) {
    // Retry injection a few times to avoid race conditions with content script load.
    for (let i = 0; i < 5; i++) {
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'forceOverlay' });
        return;
      } catch (_e) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url) return;
  const url = new URL(tab.url);
  const { alarmActive } = await chrome.storage.local.get({ alarmActive: false });
  if (alarmActive && isWatchUrl(url.hostname, url.pathname)) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'forceOverlay' });
    } catch (_e) {
      // ignore
    }
  }
});
