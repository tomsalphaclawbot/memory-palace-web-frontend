const state = {
  palace: '',
  wing: '',
  room: '',
  q: '',
  limit: 50,
  offset: 0,
  total: 0,
};

const el = {
  palaceInput: document.getElementById('palaceInput'),
  applyPalace: document.getElementById('applyPalace'),
  refresh: document.getElementById('refresh'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  clearBtn: document.getElementById('clearBtn'),
  summary: document.getElementById('summary'),
  wings: document.getElementById('wings'),
  rooms: document.getElementById('rooms'),
  drawerMeta: document.getElementById('drawerMeta'),
  drawers: document.getElementById('drawers'),
  prevPage: document.getElementById('prevPage'),
  nextPage: document.getElementById('nextPage'),
  drawerDialog: document.getElementById('drawerDialog'),
  dialogTitle: document.getElementById('dialogTitle'),
  dialogBody: document.getElementById('dialogBody'),
  closeDialog: document.getElementById('closeDialog'),
};

function apiUrl(path, params = {}) {
  const url = new URL(path, window.location.origin);
  if (state.palace) {
    url.searchParams.set('palace', state.palace);
  }
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) {
      url.searchParams.set(k, String(v));
    }
  });
  return url.toString();
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

function renderError(message) {
  el.summary.textContent = `Error: ${message}`;
  el.wings.innerHTML = '';
  el.rooms.innerHTML = '';
  el.drawers.innerHTML = '';
  el.drawerMeta.textContent = '';
}

async function loadConfig() {
  const config = await getJson('/api/config');
  const qsPalace = new URLSearchParams(window.location.search).get('palace') || '';
  state.palace = qsPalace || config.defaultPalace || '';
  el.palaceInput.value = state.palace;
}

async function loadSummary() {
  const summary = await getJson(apiUrl('/api/summary'));
  el.summary.textContent = `DB: ${summary.dbPath} | drawers: ${summary.totalDrawers} | wings: ${summary.wings} | rooms: ${summary.rooms}`;
}

function makeFilterButton(label, onClick, active = false) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.textContent = label;
  if (active) btn.style.borderColor = '#8ab4ff';
  btn.onclick = onClick;
  li.appendChild(btn);
  return li;
}

async function loadWings() {
  const data = await getJson(apiUrl('/api/wings'));
  el.wings.innerHTML = '';
  el.wings.appendChild(
    makeFilterButton(`All wings`, () => {
      state.wing = '';
      state.room = '';
      state.offset = 0;
      refreshAll();
    }, !state.wing)
  );

  data.items.forEach((item) => {
    el.wings.appendChild(
      makeFilterButton(
        `${item.wing} (${item.drawer_count})`,
        () => {
          state.wing = item.wing;
          state.room = '';
          state.offset = 0;
          refreshAll();
        },
        state.wing === item.wing
      )
    );
  });
}

async function loadRooms() {
  const data = await getJson(apiUrl('/api/rooms', { wing: state.wing }));
  el.rooms.innerHTML = '';
  el.rooms.appendChild(
    makeFilterButton(`All rooms`, () => {
      state.room = '';
      state.offset = 0;
      loadDrawers();
      loadRooms();
    }, !state.room)
  );

  data.items.forEach((item) => {
    el.rooms.appendChild(
      makeFilterButton(
        `${item.room || '(none)'} (${item.drawer_count})`,
        () => {
          state.room = item.room || '';
          state.offset = 0;
          loadDrawers();
          loadRooms();
        },
        state.room === (item.room || '')
      )
    );
  });
}

function makeDrawerCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = item.embedding_id;
  card.appendChild(h3);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${item.wing} / ${item.room} | ${item.source_file || 'unknown source'} | chunk ${item.chunk_index ?? 'n/a'}`;
  card.appendChild(meta);

  const pre = document.createElement('pre');
  pre.textContent = item.snippet || '';
  card.appendChild(pre);

  const openBtn = document.createElement('button');
  openBtn.textContent = 'Open full drawer';
  openBtn.onclick = async () => {
    try {
      const full = await getJson(apiUrl(`/api/drawer/${encodeURIComponent(item.embedding_id)}`));
      el.dialogTitle.textContent = `${full.embedding_id} (${full.wing}/${full.room})`;
      el.dialogBody.textContent = full.document || '';
      el.drawerDialog.showModal();
    } catch (err) {
      alert(String(err.message || err));
    }
  };
  card.appendChild(openBtn);

  return card;
}

async function loadDrawers() {
  const data = await getJson(
    apiUrl('/api/drawers', {
      wing: state.wing,
      room: state.room,
      q: state.q,
      limit: state.limit,
      offset: state.offset,
    })
  );

  state.total = data.total;
  el.drawerMeta.textContent = `Showing ${Math.min(data.offset + 1, data.total)}-${Math.min(data.offset + data.limit, data.total)} of ${data.total}`;

  el.drawers.innerHTML = '';
  data.items.forEach((item) => el.drawers.appendChild(makeDrawerCard(item)));

  el.prevPage.disabled = state.offset === 0;
  el.nextPage.disabled = state.offset + state.limit >= state.total;
}

async function refreshAll() {
  try {
    await loadSummary();
    await loadWings();
    await loadRooms();
    await loadDrawers();
  } catch (err) {
    renderError(err.message || String(err));
  }
}

el.applyPalace.onclick = () => {
  state.palace = el.palaceInput.value.trim();
  state.offset = 0;
  state.wing = '';
  state.room = '';
  state.q = '';
  el.searchInput.value = '';
  refreshAll();
};

el.refresh.onclick = () => refreshAll();

el.searchBtn.onclick = () => {
  state.q = el.searchInput.value.trim();
  state.offset = 0;
  loadDrawers().catch((err) => renderError(err.message || String(err)));
};

el.clearBtn.onclick = () => {
  state.q = '';
  state.offset = 0;
  el.searchInput.value = '';
  loadDrawers().catch((err) => renderError(err.message || String(err)));
};

el.prevPage.onclick = () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadDrawers().catch((err) => renderError(err.message || String(err)));
};

el.nextPage.onclick = () => {
  state.offset += state.limit;
  loadDrawers().catch((err) => renderError(err.message || String(err)));
};

el.closeDialog.onclick = () => el.drawerDialog.close();

(async function init() {
  try {
    await loadConfig();
    await refreshAll();
  } catch (err) {
    renderError(err.message || String(err));
  }
})();
