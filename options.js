(function () {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    intervalMinutes: 15,
    headline: 'GET BACK TO WORK!',
    volume: 1.0,
    audioMode: 'default',
    audioUrl: '',
    audioData: '',
    visualMode: 'default',
    visualUrl: '',
    visualData: '',
    visualKind: 'video',
    educationalMode: false,
    educationalKeywords:
      'khan,freecodecamp,crashcourse,3blue1brown,mit,stanford,harvard,edx,coursera,udemy,lecture,tutorial,course,learn,how to,explain,education',
    educationalAllowMinutes: 30,
    hardBlockOnAlarm: true,
  };

  const REPO_URL = 'https://github.com/Kapil564/get-back-to-work-extension';

  const fields = {
    enabled: document.getElementById('enabled'),
    intervalMinutes: document.getElementById('intervalMinutes'),
    headline: document.getElementById('headline'),
    volume: document.getElementById('volume'),
    volumeValue: document.getElementById('volumeValue'),
    hardBlockOnAlarm: document.getElementById('hardBlockOnAlarm'),
    educationalMode: document.getElementById('educationalMode'),
    educationalKeywords: document.getElementById('educationalKeywords'),
    educationalAllowMinutes: document.getElementById('educationalAllowMinutes'),
    audioMode: document.getElementById('audioMode'),
    audioUrl: document.getElementById('audioUrl'),
    audioFile: document.getElementById('audioFile'),
    audioFileName: document.getElementById('audioFileName'),
    visualMode: document.getElementById('visualMode'),
    visualKind: document.getElementById('visualKind'),
    visualUrl: document.getElementById('visualUrl'),
    visualFile: document.getElementById('visualFile'),
    visualFileName: document.getElementById('visualFileName'),
    audioUrlWrap: document.getElementById('audioUrlWrap'),
    audioUploadWrap: document.getElementById('audioUploadWrap'),
    visualUrlWrap: document.getElementById('visualUrlWrap'),
    visualUploadWrap: document.getElementById('visualUploadWrap'),
    form: document.getElementById('settingsForm'),
    previewBtn: document.getElementById('previewBtn'),
    feedback: document.getElementById('saveFeedback'),
    errorReport: document.getElementById('errorReport'),
    errorSummary: document.getElementById('errorSummary'),
    errorLink: document.getElementById('errorLink'),
    clearError: document.getElementById('clearError'),
  };

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

  function showFeedback(text, type) {
    fields.feedback.textContent = text;
    fields.feedback.className = `feedback ${type}`;
    setTimeout(() => {
      fields.feedback.className = 'feedback';
      fields.feedback.textContent = '';
    }, 3000);
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function updateConditionals() {
    fields.audioUrlWrap.classList.toggle('hidden', fields.audioMode.value !== 'url');
    fields.audioUploadWrap.classList.toggle('hidden', fields.audioMode.value !== 'upload');
    fields.visualUrlWrap.classList.toggle('hidden', fields.visualMode.value !== 'url');
    fields.visualUploadWrap.classList.toggle('hidden', fields.visualMode.value !== 'upload');
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

  async function loadSettings() {
    try {
      const saved = await chrome.storage.local.get(DEFAULTS);
      const s = { ...DEFAULTS, ...saved };

      fields.enabled.checked = s.enabled;
      fields.intervalMinutes.value = s.intervalMinutes;
      fields.headline.value = s.headline;
      fields.volume.value = s.volume;
      fields.volumeValue.textContent = `${Math.round(s.volume * 100)}%`;
      fields.hardBlockOnAlarm.checked = s.hardBlockOnAlarm;

      fields.educationalMode.checked = s.educationalMode;
      fields.educationalKeywords.value = s.educationalKeywords;
      fields.educationalAllowMinutes.value = s.educationalAllowMinutes;

      fields.audioMode.value = s.audioMode;
      fields.audioUrl.value = s.audioUrl || '';
      fields.audioFileName.textContent = s.audioData ? 'File stored in extension storage' : 'No file selected';

      fields.visualMode.value = s.visualMode;
      fields.visualKind.value = s.visualKind;
      fields.visualUrl.value = s.visualUrl || '';
      fields.visualFileName.textContent = s.visualData ? 'File stored in extension storage' : 'No file selected';

      updateConditionals();
    } catch (e) {
      captureError('options.loadSettings', e);
    }
  }

  async function renderErrorReport() {
    try {
      const res = await chrome.storage.local.get('lastError');
      const err = res.lastError;
      if (!err) {
        fields.errorReport.classList.add('hidden');
        return;
      }
      fields.errorReport.classList.remove('hidden');
      fields.errorSummary.textContent = `${err.context}: ${err.message}`;
      fields.errorLink.href = buildIssueUrl(err);
    } catch (e) {
      captureError('options.renderErrorReport', e);
    }
  }

  fields.audioMode.addEventListener('change', updateConditionals);
  fields.visualMode.addEventListener('change', updateConditionals);

  fields.volume.addEventListener('input', () => {
    fields.volumeValue.textContent = `${Math.round(fields.volume.value * 100)}%`;
  });

  fields.form.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const payload = {
        enabled: fields.enabled.checked,
        intervalMinutes: Math.max(1, Math.min(180, parseInt(fields.intervalMinutes.value, 10) || 15)),
        headline: fields.headline.value.trim() || DEFAULTS.headline,
        volume: parseFloat(fields.volume.value),
        audioMode: fields.audioMode.value,
        visualMode: fields.visualMode.value,
        visualKind: fields.visualKind.value,
        hardBlockOnAlarm: fields.hardBlockOnAlarm.checked,
        educationalMode: fields.educationalMode.checked,
        educationalKeywords: fields.educationalKeywords.value,
        educationalAllowMinutes: Math.max(0, Math.min(240, parseInt(fields.educationalAllowMinutes.value, 10) || 0)),
      };

      if (payload.audioMode === 'url') {
        payload.audioUrl = fields.audioUrl.value.trim();
        payload.audioData = '';
      } else if (payload.audioMode === 'upload') {
        payload.audioUrl = '';
        if (fields.audioFile.files && fields.audioFile.files[0]) {
          payload.audioData = await readFileAsBase64(fields.audioFile.files[0]);
        } else {
          const saved = await chrome.storage.local.get('audioData');
          payload.audioData = saved.audioData || '';
        }
      } else {
        payload.audioUrl = '';
        payload.audioData = '';
      }

      if (payload.visualMode === 'url') {
        payload.visualUrl = fields.visualUrl.value.trim();
        payload.visualData = '';
      } else if (payload.visualMode === 'upload') {
        payload.visualUrl = '';
        if (fields.visualFile.files && fields.visualFile.files[0]) {
          payload.visualData = await readFileAsBase64(fields.visualFile.files[0]);
        } else {
          const saved = await chrome.storage.local.get('visualData');
          payload.visualData = saved.visualData || '';
        }
      } else {
        payload.visualUrl = '';
        payload.visualData = '';
      }

      await chrome.storage.local.set(payload);
      showFeedback('Settings saved.', 'success');
    } catch (e) {
      captureError('options.form.submit', e);
      showFeedback('Failed to save settings.', 'error');
    }
  });

  fields.previewBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.id) {
      showFeedback('Open a YouTube/Instagram tab to preview.', 'error');
      return;
    }
  });

  fields.clearError.addEventListener('click', async () => {
    try {
      await chrome.storage.local.remove('lastError');
      fields.errorReport.classList.add('hidden');
    } catch (e) {
      showFeedback('Preview only works on active YouTube/Instagram tabs.', 'error');
    }
  });

  loadSettings();
  renderErrorReport();
})();
