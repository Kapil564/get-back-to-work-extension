(function () {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    intervalMinutes: 15,
  };

  const enabledToggle = document.getElementById('enabledToggle');
  const enabledLabel = document.getElementById('enabledLabel');
  const statusText = document.getElementById('statusText');
  const previewBtn = document.getElementById('previewBtn');

  async function loadEnabled() {
    const res = await chrome.storage.local.get(DEFAULTS);
    const enabled = res.enabled ?? true;
    enabledToggle.checked = enabled;
    updateLabel(enabled);
  }

  function updateLabel(enabled) {
    enabledLabel.textContent = enabled ? 'Enabled' : 'Disabled';
    statusText.textContent = enabled
      ? 'Active on YouTube and Instagram while a video is playing.'
      : 'Monitoring is paused — your break is safe. 🏖️';
  }

  enabledToggle.addEventListener('change', async () => {
    const enabled = enabledToggle.checked;
    await chrome.storage.local.set({ enabled });
    updateLabel(enabled);
  });

  previewBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'preview' });
        window.close();
      } catch (e) {
        statusText.textContent = 'Preview only works on YouTube/Instagram tabs.';
      }
    }
  });

  loadEnabled();
})();
