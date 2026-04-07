const settingsEl = {
  palaceInput: document.getElementById('settingsPalaceInput'),
  loadDefault: document.getElementById('settingsLoadDefault'),
  validate: document.getElementById('settingsValidate'),
  openBrowser: document.getElementById('settingsOpenBrowser'),
  status: document.getElementById('settingsStatus'),
};

function setStatus(message, isError = false) {
  settingsEl.status.textContent = message;
  settingsEl.status.classList.toggle('error', isError);
}

async function getJson(url) {
  const res = await fetch(url);
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : { error: await res.text() };
  if (!res.ok) {
    throw new Error(payload.error || payload.description || `HTTP ${res.status}`);
  }
  return payload;
}

function currentPalaceFromQuery() {
  return new URLSearchParams(window.location.search).get('palace') || '';
}

settingsEl.loadDefault.onclick = async () => {
  try {
    const config = await getJson('/api/config');
    settingsEl.palaceInput.value = config.defaultPalace || '';
    setStatus(config.defaultPalace ? `Loaded API default: ${config.defaultPalace}` : 'No API default path configured.');
  } catch (err) {
    setStatus(`Failed to load API config: ${err.message || String(err)}`, true);
  }
};

settingsEl.validate.onclick = async () => {
  const palace = settingsEl.palaceInput.value.trim();
  const url = new URL('/api/summary', window.location.origin);
  if (palace) {
    url.searchParams.set('palace', palace);
  }

  try {
    const summary = await getJson(url.toString());
    setStatus(
      `Validated. DB: ${summary.dbPath} | drawers: ${summary.totalDrawers} | wings: ${summary.wings} | rooms: ${summary.rooms}`
    );
  } catch (err) {
    setStatus(`Validation failed: ${err.message || String(err)}`, true);
  }
};

settingsEl.openBrowser.onclick = () => {
  const palace = settingsEl.palaceInput.value.trim();
  const url = new URL('/', window.location.origin);
  if (palace) {
    url.searchParams.set('palace', palace);
  }
  window.location.href = url.toString();
};

(function init() {
  settingsEl.palaceInput.value = currentPalaceFromQuery();
  setStatus('Set a path, validate it, then open Browser.');
})();
