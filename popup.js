(function () {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    intervalMinutes: 15,
  };

  const REPO_URL = 'https://github.com/Kapil564/get-back-to-work-extension';

  const enabledToggle = document.getElementById('enabledToggle');
  const enabledLabel = document.getElementById('enabledLabel');
  const statusText = document.getElementById('statusText');
  const previewBtn = document.getElementById('previewBtn');
  const errorReport = document.getElementById('errorReport');
  const errorSummary = document.getElementById('errorSummary');
  const errorLink = document.getElementById('errorLink');
  const clearError = document.getElementById('clearError');

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

  async function loadEnabled() {
    try {
      const res = await chrome.storage.local.get(DEFAULTS);
      const enabled = res.enabled ?? true;
      enabledToggle.checked = enabled;
      updateLabel(enabled);
    } catch (e) {
      captureError('popup.loadEnabled', e);
    }
  }

  function updateLabel(enabled) {
    enabledLabel.textContent = enabled ? 'Enabled' : 'Disabled';
    statusText.textContent = enabled
      ? 'Active on YouTube and Instagram while a video is playing.'
      : 'Monitoring is paused — your break is safe. 🏖️';
  }

  function buildIssueUrl(err) {
    const title = encodeURIComponent(`[Bug] ${err.context}: ${err.message}`);
    const bodyLines = [
      '## Error report',
      '',
      `- **Context:** ${err.context}`,
      `- **Message:** ${err.message}`,
      `- **Page:** ${err.url || 'N/A'}`,
      `- **Time:** ${err.time ? new Date(err.time).toISOString() : 'N/A'}`,
      '',
      '### Stack trace',
      '```',
      err.stack || 'No stack trace available',
      '```',
      '',
      '> I will fix this in a later version. Thank you for reporting!',
    ];
    const body = encodeURIComponent(bodyLines.join('\n'));
    return `${REPO_URL}/issues/new?title=${title}&body=${body}`;
  }

  async function renderErrorReport() {
    try {
      const res = await chrome.storage.local.get('lastError');
      const err = res.lastError;
      if (!err) {
        errorReport.classList.add('hidden');
        return;
      }
      errorReport.classList.remove('hidden');
      errorSummary.textContent = `${err.context}: ${err.message}`;
      errorLink.href = buildIssueUrl(err);
    } catch (e) {
      captureError('popup.renderErrorReport', e);
    }
  }

  enabledToggle.addEventListener('change', async () => {
    try {
      const enabled = enabledToggle.checked;
      await chrome.storage.local.set({ enabled });
      updateLabel(enabled);
    } catch (e) {
      captureError('popup.enabledToggle', e);
    }
  });

  previewBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'preview' });
          window.close();
        } catch (e) {
          statusText.textContent = 'Preview only works on YouTube/Instagram tabs.';
        }
      }
    } catch (e) {
      captureError('popup.previewBtn', e);
    }
  });

  clearError.addEventListener('click', async () => {
    try {
      await chrome.storage.local.remove('lastError');
      errorReport.classList.add('hidden');
    } catch (e) {
      captureError('popup.clearError', e);
    }
  });

  loadEnabled();
  renderErrorReport();
})();
