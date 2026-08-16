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

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  }

  async function refreshStats() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const timerText = document.getElementById('timerText');
      const eduText = document.getElementById('eduText');

      if (!tab?.id) {
        if (timerText) timerText.textContent = '';
        if (eduText) eduText.textContent = '';
        return;
      }

      // Only ping watch pages; avoids 'receiving end does not exist' on unrelated tabs.
      const url = tab.url ? new URL(tab.url) : null;
      const isWatchPage = url && (
        (url.hostname.endsWith('youtube.com') &&
          (url.pathname.startsWith('/watch') || url.pathname.startsWith('/shorts'))) ||
        (url.hostname.endsWith('instagram.com') && url.pathname.startsWith('/reel'))
      );

      if (!isWatchPage) {
        if (timerText) timerText.textContent = '';
        if (eduText) eduText.textContent = '';
        return;
      }

      const res = await chrome.tabs.sendMessage(tab.id, { action: 'ping' }).catch(() => null);
      if (res) {
        timerText.textContent = `Watch time: ${formatTime(res.seconds)}`;
        if (res.alarmActive) {
          statusText.textContent = '🚨 Alarm is active — YouTube locked until dismissed.';
          statusText.style.color = '#ff6b6b';
        } else if (res.isEducational) {
          eduText.textContent = '📚 Educational video detected — not counting down.';
          eduText.style.color = '#74c0fc';
        } else if (res.eduAllowanceExceeded) {
          eduText.textContent = `Daily educational allowance used (${formatTime(res.educationalSeconds)}).`;
        } else {
          eduText.textContent = '';
        }
      } else {
        if (timerText) timerText.textContent = '';
        if (eduText) eduText.textContent = '';
      }
    } catch (e) {
      captureError('popup.refreshStats', e);
    }
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
      if (!tab?.id) return;

      const url = tab.url ? new URL(tab.url) : null;
      const isWatchPage = url && (
        (url.hostname.endsWith('youtube.com') &&
          (url.pathname.startsWith('/watch') || url.pathname.startsWith('/shorts'))) ||
        (url.hostname.endsWith('instagram.com') && url.pathname.startsWith('/reel'))
      );
      if (!isWatchPage) {
        statusText.textContent = 'Preview only works on YouTube/Instagram watch pages.';
        return;
      }

      await chrome.tabs.sendMessage(tab.id, { action: 'preview' });
      window.close();
    } catch (e) {
      statusText.textContent = 'Preview only works on YouTube/Instagram tabs.';
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
  refreshStats().catch((e) => captureError('popup.init', e));
})();
