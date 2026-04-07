const state = {
  view: 'browser',
  scope: 'wings',
  wing: '',
  room: '',
  q: '',

  wings: { limit: 20, offset: 0, total: 0 },
  rooms: { limit: 20, offset: 0, total: 0 },
  drawers: { limit: 24, offset: 0, total: 0 },
  snippets: { limit: 24, offset: 0, total: 0 },
};

const el = {
  summary: document.getElementById('summary'),
  activeWing: document.getElementById('activeWing'),
  activeRoom: document.getElementById('activeRoom'),
  clearFiltersBtn: document.getElementById('clearFiltersBtn'),

  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  clearBtn: document.getElementById('clearBtn'),
  refreshBtn: document.getElementById('refreshBtn'),

  wings: document.getElementById('wings'),
  wingsMeta: document.getElementById('wingsMeta'),
  wingsPrev: document.getElementById('wingsPrev'),
  wingsNext: document.getElementById('wingsNext'),

  rooms: document.getElementById('rooms'),
  roomsMeta: document.getElementById('roomsMeta'),
  roomsPrev: document.getElementById('roomsPrev'),
  roomsNext: document.getElementById('roomsNext'),

  drawers: document.getElementById('drawers'),
  drawersMeta: document.getElementById('drawersMeta'),
  drawersPrev: document.getElementById('drawersPrev'),
  drawersNext: document.getElementById('drawersNext'),

  snippets: document.getElementById('snippets'),
  snippetsMeta: document.getElementById('snippetsMeta'),
  snippetsPrev: document.getElementById('snippetsPrev'),
  snippetsNext: document.getElementById('snippetsNext'),

  graphSvg: document.getElementById('graphSvg'),
  graphMeta: document.getElementById('graphMeta'),
  graphRefreshBtn: document.getElementById('graphRefreshBtn'),

  drawerDialog: document.getElementById('drawerDialog'),
  dialogTitle: document.getElementById('dialogTitle'),
  dialogBody: document.getElementById('dialogBody'),
  closeDialog: document.getElementById('closeDialog'),

  viewTabs: Array.from(document.querySelectorAll('.side-nav [data-view]')),
  viewPanels: Array.from(document.querySelectorAll('[data-view-panel]')),
  scopeTabs: Array.from(document.querySelectorAll('.scope-tab')),
  scopePanels: {
    wings: document.getElementById('scope-wings'),
    rooms: document.getElementById('scope-rooms'),
    drawers: document.getElementById('scope-drawers'),
    snippets: document.getElementById('scope-snippets'),
  },
};

function normalizeViewFromHash() {
  const raw = window.location.hash.replace(/^#/, '').trim().toLowerCase();
  if (!raw) return 'browser';
  if (raw === 'browser' || raw === 'view-browser') return 'browser';
  if (raw === 'graph' || raw === 'view-graph') return 'graph';
  if (raw === 'view3d' || raw === '3d' || raw === 'view-3d') return 'view3d';
  return 'browser';
}

function setActiveView(view, updateHash = false) {
  state.view = view || 'browser';

  el.viewTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === state.view);
  });

  el.viewPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.viewPanel === state.view);
  });

  if (updateHash) {
    if (state.view === 'browser') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${state.view}`);
    }
  }

  if (state.view === 'graph') {
    loadGraph().catch((err) => renderError(err.message || String(err)));
  }
}

function setActiveScope(scope) {
  state.scope = scope;

  el.scopeTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.scope === scope);
  });

  Object.entries(el.scopePanels).forEach(([key, panel]) => {
    panel.classList.toggle('active', key === scope);
  });
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
  if (el.summary) {
    el.summary.textContent = `Error: ${message}`;
  }
}

function updateFilterUI() {
  el.activeWing.textContent = state.wing || 'All';
  el.activeRoom.textContent = state.room || 'All';
}

function formatRange(offset, limit, total) {
  if (total === 0) return 'No results';
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  return `${from}-${to} of ${total}`;
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

async function loadSummary() {
  const summary = await getJson(apiUrl('/api/summary'));
  el.summary.textContent = `${summary.wings} wings • ${summary.rooms} rooms • ${summary.totalDrawers} drawers`;
}

async function loadWings() {
  const data = await getJson(
    apiUrl('/api/wings', {
      limit: state.wings.limit,
      offset: state.wings.offset,
    })
  );

  state.wings.total = data.total;
  el.wings.innerHTML = '';

  el.wings.appendChild(
    makeFilterButton(
      'All wings',
      async () => {
        state.wing = '';
        state.room = '';
        state.rooms.offset = 0;
        state.drawers.offset = 0;
        state.snippets.offset = 0;
        await refreshBrowserData();
      },
      !state.wing
    )
  );

  data.items.forEach((item) => {
    el.wings.appendChild(
      makeFilterButton(
        `${item.wing} (${item.drawer_count})`,
        async () => {
          state.wing = item.wing;
          state.room = '';
          state.rooms.offset = 0;
          state.drawers.offset = 0;
          state.snippets.offset = 0;
          await refreshBrowserData();
          setActiveScope('rooms');
        },
        state.wing === item.wing
      )
    );
  });

  el.wingsMeta.textContent = formatRange(state.wings.offset, state.wings.limit, state.wings.total);
  el.wingsPrev.disabled = state.wings.offset === 0;
  el.wingsNext.disabled = state.wings.offset + state.wings.limit >= state.wings.total;
}

async function loadRooms() {
  const data = await getJson(
    apiUrl('/api/rooms', {
      wing: state.wing,
      limit: state.rooms.limit,
      offset: state.rooms.offset,
    })
  );

  state.rooms.total = data.total;
  el.rooms.innerHTML = '';

  el.rooms.appendChild(
    makeFilterButton(
      'All rooms',
      async () => {
        state.room = '';
        state.drawers.offset = 0;
        state.snippets.offset = 0;
        await refreshBrowserData();
      },
      !state.room
    )
  );

  data.items.forEach((item) => {
    const roomValue = item.room || '';
    const label = item.room || '(none)';

    el.rooms.appendChild(
      makeFilterButton(
        `${label} (${item.drawer_count})`,
        async () => {
          state.room = roomValue;
          state.drawers.offset = 0;
          state.snippets.offset = 0;
          await refreshBrowserData();
          setActiveScope('drawers');
        },
        state.room === roomValue
      )
    );
  });

  el.roomsMeta.textContent = formatRange(state.rooms.offset, state.rooms.limit, state.rooms.total);
  el.roomsPrev.disabled = state.rooms.offset === 0;
  el.roomsNext.disabled = state.rooms.offset + state.rooms.limit >= state.rooms.total;
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

async function openDrawer(embeddingId, wing, room) {
  const full = await getJson(apiUrl(`/api/drawer/${encodeURIComponent(embeddingId)}`));
  el.dialogTitle.textContent = `${embeddingId} (${wing}/${room || '(none)'})`;
  el.dialogBody.textContent = full.document || '';
  el.drawerDialog.showModal();
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
      await openDrawer(item.embedding_id, item.wing, item.room);
    } catch (err) {
      alert(String(err.message || err));
    }
  };

  actions.appendChild(openBtn);
  card.appendChild(actions);
  return card;
}

function makeSnippetCard(item) {
  const card = document.createElement('div');
  card.className = 'snippet-card';

  const top = document.createElement('div');
  top.className = 'meta';
  top.textContent = `${item.wing} / ${item.room || '(none)'} • ${item.embedding_id}`;
  card.appendChild(top);

  const text = document.createElement('p');
  text.className = 'snippet';
  text.textContent = snippetForDrawer(item);
  card.appendChild(text);

  const openBtn = document.createElement('button');
  openBtn.textContent = 'Open full drawer';
  openBtn.onclick = async () => {
    try {
      await openDrawer(item.embedding_id, item.wing, item.room);
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
      limit: state.drawers.limit,
      offset: state.drawers.offset,
    })
  );

  state.drawers.total = data.total;
  el.drawersMeta.textContent = formatRange(state.drawers.offset, state.drawers.limit, state.drawers.total);
  el.drawers.innerHTML = '';

  data.items.forEach((item) => el.drawers.appendChild(makeDrawerCard(item)));

  el.drawersPrev.disabled = state.drawers.offset === 0;
  el.drawersNext.disabled = state.drawers.offset + state.drawers.limit >= state.drawers.total;
}

async function loadSnippets() {
  const data = await getJson(
    apiUrl('/api/drawers', {
      wing: state.wing,
      room: state.room,
      q: state.q,
      limit: state.snippets.limit,
      offset: state.snippets.offset,
    })
  );

  state.snippets.total = data.total;
  el.snippetsMeta.textContent = formatRange(state.snippets.offset, state.snippets.limit, state.snippets.total);
  el.snippets.innerHTML = '';

  data.items.forEach((item) => el.snippets.appendChild(makeSnippetCard(item)));

  el.snippetsPrev.disabled = state.snippets.offset === 0;
  el.snippetsNext.disabled = state.snippets.offset + state.snippets.limit >= state.snippets.total;
}

async function refreshBrowserData() {
  updateFilterUI();
  await Promise.all([loadSummary(), loadWings(), loadRooms(), loadDrawers(), loadSnippets()]);
  updateFilterUI();
}

function lineWeightClass(weight) {
  if (weight >= 30) return 'edge-strong';
  if (weight >= 10) return 'edge-med';
  return 'edge-light';
}

function truncateLabel(text, max = 26) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function renderGraph(graph) {
  const svg = el.graphSvg;
  const width = 1200;

  const wings = graph.nodes.filter((n) => n.type === 'wing');
  const rooms = graph.nodes.filter((n) => n.type === 'room');
  const edges = graph.edges;

  const rows = Math.max(wings.length, rooms.length, 1);
  const height = Math.max(640, rows * 44 + 80);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const wingX = 260;
  const roomX = width - 260;

  const wingYStep = (height - 80) / Math.max(wings.length, 1);
  const roomYStep = (height - 80) / Math.max(rooms.length, 1);

  const nodePositions = new Map();

  wings.forEach((wing, i) => {
    nodePositions.set(wing.id, {
      x: wingX,
      y: 40 + wingYStep * i + wingYStep / 2,
      ...wing,
    });
  });

  rooms.forEach((room, i) => {
    nodePositions.set(room.id, {
      x: roomX,
      y: 40 + roomYStep * i + roomYStep / 2,
      ...room,
    });
  });

  const lines = edges
    .map((edge) => {
      const source = nodePositions.get(edge.source);
      const target = nodePositions.get(edge.target);
      if (!source || !target) return '';
      return `<line class="graph-edge ${lineWeightClass(edge.weight)}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" />`;
    })
    .join('');

  const nodes = Array.from(nodePositions.values())
    .map((node) => {
      const cls = node.type === 'wing' ? 'graph-wing' : 'graph-room';
      const textAnchor = node.type === 'wing' ? 'end' : 'start';
      const textX = node.type === 'wing' ? node.x - 18 : node.x + 18;
      const radius = node.type === 'wing' ? 9 : 7;
      const dataAttrs = `data-node-type="${node.type}" data-node-label="${escapeHtml(node.label)}"`;
      return `
        <g class="graph-node ${cls}" ${dataAttrs}>
          <circle cx="${node.x}" cy="${node.y}" r="${radius}" />
          <text x="${textX}" y="${node.y + 4}" text-anchor="${textAnchor}">${escapeHtml(truncateLabel(node.label))}</text>
        </g>
      `;
    })
    .join('');

  svg.innerHTML = `<g>${lines}${nodes}</g>`;
  el.graphMeta.textContent = `${wings.length} wings • ${rooms.length} rooms • ${edges.length} links`;

  svg.querySelectorAll('.graph-node').forEach((nodeEl) => {
    nodeEl.addEventListener('click', async () => {
      const type = nodeEl.getAttribute('data-node-type');
      const label = nodeEl.getAttribute('data-node-label') || '';

      try {
        if (type === 'wing') {
          state.wing = label;
          state.room = '';
          state.rooms.offset = 0;
        } else if (type === 'room') {
          state.room = label;
        }

        state.drawers.offset = 0;
        state.snippets.offset = 0;

        await refreshBrowserData();
        setActiveView('browser', true);
        setActiveScope(type === 'wing' ? 'rooms' : 'drawers');
      } catch (err) {
        renderError(err.message || String(err));
      }
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadGraph() {
  const graph = await getJson(apiUrl('/api/graph', { max_edges: 500 }));
  renderGraph(graph);
}

el.viewTabs.forEach((tab) => {
  tab.onclick = () => setActiveView(tab.dataset.view, true);
});

el.scopeTabs.forEach((tab) => {
  tab.onclick = () => setActiveScope(tab.dataset.scope);
});

el.searchBtn.onclick = async () => {
  try {
    state.q = el.searchInput.value.trim();
    state.drawers.offset = 0;
    state.snippets.offset = 0;
    await Promise.all([loadDrawers(), loadSnippets()]);
  } catch (err) {
    renderError(err.message || String(err));
  }
};

el.clearBtn.onclick = async () => {
  try {
    state.q = '';
    el.searchInput.value = '';
    state.drawers.offset = 0;
    state.snippets.offset = 0;
    await Promise.all([loadDrawers(), loadSnippets()]);
  } catch (err) {
    renderError(err.message || String(err));
  }
};

el.refreshBtn.onclick = async () => {
  try {
    await refreshBrowserData();
  } catch (err) {
    renderError(err.message || String(err));
  }
};

el.clearFiltersBtn.onclick = async () => {
  try {
    state.wing = '';
    state.room = '';
    state.rooms.offset = 0;
    state.drawers.offset = 0;
    state.snippets.offset = 0;
    await refreshBrowserData();
  } catch (err) {
    renderError(err.message || String(err));
  }
};

el.wingsPrev.onclick = async () => {
  state.wings.offset = Math.max(0, state.wings.offset - state.wings.limit);
  await loadWings().catch((err) => renderError(err.message || String(err)));
};

el.wingsNext.onclick = async () => {
  state.wings.offset += state.wings.limit;
  await loadWings().catch((err) => renderError(err.message || String(err)));
};

el.roomsPrev.onclick = async () => {
  state.rooms.offset = Math.max(0, state.rooms.offset - state.rooms.limit);
  await loadRooms().catch((err) => renderError(err.message || String(err)));
};

el.roomsNext.onclick = async () => {
  state.rooms.offset += state.rooms.limit;
  await loadRooms().catch((err) => renderError(err.message || String(err)));
};

el.drawersPrev.onclick = async () => {
  state.drawers.offset = Math.max(0, state.drawers.offset - state.drawers.limit);
  await loadDrawers().catch((err) => renderError(err.message || String(err)));
};

el.drawersNext.onclick = async () => {
  state.drawers.offset += state.drawers.limit;
  await loadDrawers().catch((err) => renderError(err.message || String(err)));
};

el.snippetsPrev.onclick = async () => {
  state.snippets.offset = Math.max(0, state.snippets.offset - state.snippets.limit);
  await loadSnippets().catch((err) => renderError(err.message || String(err)));
};

el.snippetsNext.onclick = async () => {
  state.snippets.offset += state.snippets.limit;
  await loadSnippets().catch((err) => renderError(err.message || String(err)));
};

el.graphRefreshBtn.onclick = () => loadGraph().catch((err) => renderError(err.message || String(err)));

el.closeDialog.onclick = () => el.drawerDialog.close();

window.addEventListener('hashchange', () => {
  setActiveView(normalizeViewFromHash());
});

(async function init() {
  try {
    setActiveView(normalizeViewFromHash());
    setActiveScope('wings');
    await refreshBrowserData();
    if (state.view === 'graph') {
      await loadGraph();
    }
  } catch (err) {
    renderError(err.message || String(err));
  }
})();
