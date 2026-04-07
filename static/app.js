const state = {
  wing: '',
  room: '',
  q: '',
  limit: 50,
  offset: 0,
  total: 0,
};

const el = {
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
  viewTabs: Array.from(document.querySelectorAll('.side-nav [data-view]')),
  viewPanels: Array.from(document.querySelectorAll('[data-view-panel]')),
  scopeTabs: Array.from(document.querySelectorAll('.scope-tab')),
};

function normalizeViewFromHash() {
  const raw = window.location.hash.replace(/^#/, '').trim().toLowerCase();
  if (!raw) return 'browser';
  if (raw === 'browser' || raw === 'view-browser') return 'browser';
  if (raw === 'view3d' || raw === '3d' || raw === 'view-3d') return 'view3d';
  if (raw === 'graph' || raw === 'view-graph') return 'graph';
  return 'browser';
}

function setActiveView(view, updateHash = false) {
  const nextView = view || 'browser';
  el.viewTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === nextView);
  });
  el.viewPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.viewPanel === nextView);
  });

  if (!updateHash) return;
  if (nextView === 'browser') {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } else {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${nextView}`);
  }
}

function apiUrl(path, params = {}) {
  const url = new URL(path, window.location.origin);
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

async function loadSummary() {
  const summary = await getJson(apiUrl('/api/summary'));
  el.summary.textContent = `${summary.wings} wings • ${summary.rooms} rooms • ${summary.totalDrawers} drawers`;
}

function makeFilterButton(label, onClick, active = false) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.textContent = label;
  if (active) btn.classList.add('active-filter');
  btn.onclick = onClick;
  li.appendChild(btn);
  return li;
}

async function loadWings() {
  const data = await getJson(apiUrl('/api/wings'));
  el.wings.innerHTML = '';
  el.wings.appendChild(
    makeFilterButton(
      'All wings',
      () => {
        state.wing = '';
        state.room = '';
        state.offset = 0;
        refreshAll();
      },
      !state.wing
    )
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
    makeFilterButton(
      'All rooms',
      () => {
        state.room = '';
        state.offset = 0;
        loadDrawers();
        loadRooms();
      },
      !state.room
    )
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

function titleForDrawer(item) {
  if (item.room) return item.room;
  if (item.source_file) {
    const parts = item.source_file.split('/');
    return parts[parts.length - 1];
  }
  return item.embedding_id;
}

function snippetForDrawer(item) {
  const text = (item.snippet || '').replace(/\s+/g, ' ').trim();
  if (text.length <= 180) return text;
  return `${text.slice(0, 177)}...`;
}

function makeDrawerCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = titleForDrawer(item);
  card.appendChild(h3);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${item.wing} / ${item.room || '(none)'} • chunk ${item.chunk_index ?? 'n/a'}`;
  card.appendChild(meta);

  const snippet = document.createElement('p');
  snippet.className = 'snippet';
  snippet.textContent = snippetForDrawer(item);
  card.appendChild(snippet);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const openBtn = document.createElement('button');
  openBtn.textContent = 'Open';
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

  actions.appendChild(openBtn);
  card.appendChild(actions);

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

  if (data.total === 0) {
    el.drawerMeta.textContent = 'No drawers found.';
  } else {
    const from = data.offset + 1;
    const to = Math.min(data.offset + data.limit, data.total);
    el.drawerMeta.textContent = `Showing ${from}-${to} of ${data.total}`;
  }

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

if (el.refresh) {
  el.refresh.onclick = () => refreshAll();
}

if (el.searchBtn) {
  el.searchBtn.onclick = () => {
    state.q = el.searchInput.value.trim();
    state.offset = 0;
    loadDrawers().catch((err) => renderError(err.message || String(err)));
  };
}

if (el.clearBtn) {
  el.clearBtn.onclick = () => {
    state.q = '';
    state.offset = 0;
    el.searchInput.value = '';
    loadDrawers().catch((err) => renderError(err.message || String(err)));
  };
}

if (el.prevPage) {
  el.prevPage.onclick = () => {
    state.offset = Math.max(0, state.offset - state.limit);
    loadDrawers().catch((err) => renderError(err.message || String(err)));
  };
}

if (el.nextPage) {
  el.nextPage.onclick = () => {
    state.offset += state.limit;
    loadDrawers().catch((err) => renderError(err.message || String(err)));
  };
}

if (el.closeDialog) {
  el.closeDialog.onclick = () => el.drawerDialog.close();
}

el.viewTabs.forEach((tab) => {
  tab.onclick = () => setActiveView(tab.dataset.view, true);
});

el.scopeTabs.forEach((tab) => {
  tab.onclick = () => {
    el.scopeTabs.forEach((t) => t.classList.toggle('active', t === tab));
    const target = document.getElementById(tab.dataset.target);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
});

window.addEventListener('hashchange', () => {
  setActiveView(normalizeViewFromHash());
});

(async function init() {
  try {
    setActiveView(normalizeViewFromHash());
    await refreshAll();
  } catch (err) {
    renderError(err.message || String(err));
  }
})();
