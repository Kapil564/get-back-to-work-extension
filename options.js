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
  };

  const fields = {
    enabled: document.getElementById('enabled'),
    intervalMinutes: document.getElementById('intervalMinutes'),
    headline: document.getElementById('headline'),
    volume: document.getElementById('volume'),
    volumeValue: document.getElementById('volumeValue'),
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
  };

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

  async function loadSettings() {
    const saved = await chrome.storage.local.get(DEFAULTS);
    const s = { ...DEFAULTS, ...saved };

    fields.enabled.checked = s.enabled;
    fields.intervalMinutes.value = s.intervalMinutes;
    fields.headline.value = s.headline;
    fields.volume.value = s.volume;
    fields.volumeValue.textContent = `${Math.round(s.volume * 100)}%`;

    fields.audioMode.value = s.audioMode;
    fields.audioUrl.value = s.audioUrl || '';
    fields.audioFileName.textContent = s.audioData ? 'File stored in extension storage' : 'No file selected';

    fields.visualMode.value = s.visualMode;
    fields.visualKind.value = s.visualKind;
    fields.visualUrl.value = s.visualUrl || '';
    fields.visualFileName.textContent = s.visualData ? 'File stored in extension storage' : 'No file selected';

    updateConditionals();
  }

  fields.audioMode.addEventListener('change', updateConditionals);
  fields.visualMode.addEventListener('change', updateConditionals);

  fields.volume.addEventListener('input', () => {
    fields.volumeValue.textContent = `${Math.round(fields.volume.value * 100)}%`;
  });

  fields.form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      enabled: fields.enabled.checked,
      intervalMinutes: Math.max(1, Math.min(180, parseInt(fields.intervalMinutes.value, 10) || 15)),
      headline: fields.headline.value.trim() || DEFAULTS.headline,
      volume: parseFloat(fields.volume.value),
      audioMode: fields.audioMode.value,
      visualMode: fields.visualMode.value,
      visualKind: fields.visualKind.value,
    };

    if (payload.audioMode === 'url') {
      payload.audioUrl = fields.audioUrl.value.trim();
      payload.audioData = '';
    } else if (payload.audioMode === 'upload') {
      payload.audioUrl = '';
      if (fields.audioFile.files && fields.audioFile.files[0]) {
        payload.audioData = await readFileAsBase64(fields.audioFile.files[0]);
      } else {
        // keep existing upload if unchanged
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

    // refresh display labels
    fields.audioFileName.textContent = payload.audioData ? 'File stored in extension storage' : 'No file selected';
    fields.visualFileName.textContent = payload.visualData ? 'File stored in extension storage' : 'No file selected';
  });

  fields.previewBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      showFeedback('Open a YouTube/Instagram tab to preview.', 'error');
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'preview' });
      showFeedback('Reminder preview triggered.', 'success');
    } catch (e) {
      showFeedback('Preview only works on YouTube/Instagram tabs.', 'error');
    }
  });

  loadSettings();
})();
