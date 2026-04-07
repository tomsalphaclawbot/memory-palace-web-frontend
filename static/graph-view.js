/* graph-view.js — Force-directed knowledge graph (Obsidian-style, zero deps) */
(function () {
  'use strict';

  const C = {
    wing: '#4a6cf7',
    room: '#12a37c',
    drawer: '#e8913a',
    edgeHL: '#a0b8e8',
    edgeDim: 'rgba(80,90,120,0.15)',
    text: '#c7d2e8',
    textHL: '#fff',
    bg: '#0f1220',
    sel: '#ffd166',
    grid: 'rgba(120,130,170,0.07)',
  };

  let canvas;
  let ctx;
  let dpr = window.devicePixelRatio || 1;
  let gD = { nodes: [], edges: [] };
  let nds = [];
  let eds = [];
  let hov = null;
  let sel = new Set();
  let exp = new Set();
  let drag = null;
  let dragMoved = false;
  let pan = false;
  let panS = { x: 0, y: 0 };
  let panO = { x: 0, y: 0 };
  let zm = 1;
  let aId = null;
  let cool = 0;
  let fQ = '';
  let $status;
  let $legend;
  let $search;
  let $clearSearch;
  let $resetView;

  window.GraphView = { init, load, reset: resetAll, applyFilter: doFilter };

  function init(canvasId, wrapId, searchId, clearSearchId, statusId, legendId, resetViewId) {
    canvas = document.getElementById(canvasId);
    const wrap = document.getElementById(wrapId);
    $search = document.getElementById(searchId);
    $clearSearch = document.getElementById(clearSearchId);
    $status = document.getElementById(statusId);
    $legend = document.getElementById(legendId);
    $resetView = document.getElementById(resetViewId);

    if (!canvas || !wrap) {
      throw new Error('Graph canvas or wrapper missing');
    }

    ctx = canvas.getContext('2d');
    rsz();

    window.addEventListener('resize', rsz);
    canvas.addEventListener('pointerdown', onPD);
    canvas.addEventListener('pointermove', onPM);
    canvas.addEventListener('pointerup', onPU);
    canvas.addEventListener('wheel', onWh, { passive: false });

    if ($search) {
      $search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doFilter();
      });
    }

    if ($clearSearch) {
      $clearSearch.addEventListener('click', () => {
        if ($search) $search.value = '';
        fQ = '';
        rebuild();
      });
    }

    if ($resetView) {
      $resetView.addEventListener('click', resetAll);
    }

    if ($legend) {
      $legend.innerHTML =
        '<span style="color:' + C.wing + '">●</span>Wings ' +
        '<span style="color:' + C.room + '">●</span>Rooms ' +
        '<span style="color:' + C.drawer + '">●</span>Drawers' +
        ' · click expand · drag nodes · drag background pan · wheel zoom';
    }

    panO.x = canvas.width / dpr / 2;
    panO.y = canvas.height / dpr / 2;

    if (!aId) loop();
  }

  function rsz() {
    dpr = window.devicePixelRatio || 1;
    const r = canvas.parentElement.getBoundingClientRect();
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
  }

  function load(data) {
    gD = JSON.parse(JSON.stringify(data || { nodes: [], edges: [] }));
    sel.clear();
    exp.clear();
    cool = 0;
    rebuild();
  }

  function rebuild() {
    const vn = visNodes();
    const eSet = new Set(vn.map((n) => n.id));
    const ve = gD.edges.filter((e) => eSet.has(e.source) && eSet.has(e.target));

    const ex = new Map();
    nds.forEach((n) => ex.set(n.id, n));

    nds = vn.map((v) => {
      const p = ex.get(v.id);
      if (p) {
        p.vis = true;
        p.label = v.label;
        p.type = v.type;
        p.count = v.count || 1;
        return p;
      }
      const a = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * 200;
      return {
        id: v.id,
        label: v.label,
        type: v.type,
        count: v.count || 1,
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: 0,
        vy: 0,
        vis: true,
      };
    });

    const nm = new Map();
    nds.forEach((n) => nm.set(n.id, n));
    eds = ve
      .map((e) => ({ s: nm.get(e.source), t: nm.get(e.target), w: e.weight || 1 }))
      .filter((e) => e.s && e.t);

    if ($status) {
      const wc = nds.filter((n) => n.type === 'wing').length;
      const rc = nds.filter((n) => n.type === 'room').length;
      const dc = nds.filter((n) => n.type === 'drawer').length;
      $status.textContent = `${wc} wings · ${rc} rooms · ${dc} drawers · ${eds.length} links`;
    }

    cool = 80;
  }

  function visNodes() {
    const out = gD.nodes.filter((n) => n.type === 'wing' || n.type === 'room');
    exp.forEach((roomId) => {
      gD.nodes
        .filter((n) => n.type === 'drawer' && n.parentRoom === roomId)
        .forEach((n) => {
          out.push(n);
        });
    });
    return out;
  }

  function phys() {
    if (cool <= 0) return;
    cool -= 1;

    const R = 5000;
    const A = 0.005;
    const G = 0.006;
    const IL = 110;

    for (let i = 0; i < nds.length; i += 1) {
      const a = nds[i];
      for (let j = i + 1; j < nds.length; j += 1) {
        const b = nds[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = R / (d * d);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    for (let i = 0; i < eds.length; i += 1) {
      const e = eds[i];
      const dx = e.t.x - e.s.x;
      const dy = e.t.y - e.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - IL) * A;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      if (e.s !== drag) {
        e.s.vx += fx;
        e.s.vy += fy;
      }
      if (e.t !== drag) {
        e.t.vx -= fx;
        e.t.vy -= fy;
      }
    }

    for (let i = 0; i < nds.length; i += 1) {
      const n = nds[i];
      if (n === drag) continue;
      n.vx -= n.x * G;
      n.vy -= n.y * G;
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  function loop() {
    aId = requestAnimationFrame(loop);
    phys();
    draw();
  }

  function draw() {
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr * zm, 0, 0, dpr * zm, panO.x, panO.y);
    ctx.fillStyle = C.bg;
    ctx.fillRect(-5000, -5000, 10000, 10000);

    ctx.fillStyle = C.grid;
    const gs = 50;
    const sx = -Math.ceil(W / gs / zm) * gs;
    const sy = -Math.ceil(H / gs / zm) * gs;
    for (let gx = sx; gx < W / zm + gs; gx += gs) {
      for (let gy = sy; gy < H / zm + gs; gy += gs) {
        ctx.fillRect(gx - 0.4, gy - 0.4, 1.2, 1.2);
      }
    }

    const hl = hlSet();

    eds.forEach((e) => {
      const dim = hl && !hl.has(e.s.id) && !hl.has(e.t.id);
      ctx.beginPath();
      ctx.strokeStyle = dim ? C.edgeDim : C.edgeHL;
      ctx.lineWidth = dim ? 0.5 : Math.max(0.6, Math.min(3.5, Math.log(e.w + 1) * 0.7));
      ctx.globalAlpha = dim ? 1 : 0.7;
      ctx.moveTo(e.s.x, e.s.y);
      ctx.lineTo(e.t.x, e.t.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    nds.forEach((n) => {
      if (!n.vis) return;
      const dim = hl && !hl.has(n.id);
      const isHov = n === hov;
      const isSel = sel.has(n.id);

      ctx.globalAlpha = dim ? 0.2 : 1;
      const r = rR(n);

      if (isHov || isSel) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2);
        ctx.fillStyle = isHov ? 'rgba(168,192,255,.12)' : 'rgba(255,209,102,.12)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = C[n.type] || '#888';
      ctx.fill();

      if (isSel) {
        ctx.strokeStyle = C.sel;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      if (n.type === 'wing' || n.type === 'room' || isHov) {
        ctx.font = `${n.type === 'wing' ? 'bold ' : ''}11px Inter,sans-serif`;
        ctx.fillStyle = isHov || isSel ? C.textHL : C.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const lb = n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label;
        ctx.fillText(lb, n.x, n.y - r - 5);
      }

      ctx.globalAlpha = 1;
    });
  }

  function rR(n) {
    if (n.type === 'wing') return 10 + Math.min(22, Math.log(n.count + 1) * 4);
    if (n.type === 'room') return 7 + Math.min(14, Math.log(n.count + 1) * 2.5);
    return 3;
  }

  function hlSet() {
    if (hov) {
      const s = new Set([hov.id]);
      eds.forEach((e) => {
        if (e.s.id === hov.id) s.add(e.t.id);
        if (e.t.id === hov.id) s.add(e.s.id);
      });
      return s;
    }

    if (sel.size) {
      const s = new Set(sel);
      eds.forEach((e) => {
        if (sel.has(e.s.id)) s.add(e.t.id);
        if (sel.has(e.t.id)) s.add(e.s.id);
      });
      return s;
    }

    return null;
  }

  function s2w(sx, sy) {
    return {
      x: (sx - panO.x) / zm,
      y: (sy - panO.y) / zm,
    };
  }

  function nAt(wx, wy) {
    for (let i = nds.length - 1; i >= 0; i -= 1) {
      const n = nds[i];
      if (!n.vis) continue;
      const dx = wx - n.x;
      const dy = wy - n.y;
      const r = rR(n) + 5;
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  }

  function onPD(e) {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const w = s2w(e.clientX - r.left, e.clientY - r.top);
    const n = nAt(w.x, w.y);
    if (n) {
      drag = n;
      dragMoved = false;
      return;
    }
    pan = true;
    panS = { x: e.clientX, y: e.clientY };
  }

  function onPM(e) {
    if (drag) {
      const r = canvas.getBoundingClientRect();
      const w = s2w(e.clientX - r.left, e.clientY - r.top);
      drag.x = w.x;
      drag.y = w.y;
      drag.vx = 0;
      drag.vy = 0;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) dragMoved = true;
      cool = Math.max(cool, 10);
      return;
    }

    if (pan) {
      panO.x += e.movementX;
      panO.y += e.movementY;
      return;
    }

    const r = canvas.getBoundingClientRect();
    const w = s2w(e.clientX - r.left, e.clientY - r.top);
    hov = nAt(w.x, w.y);
    canvas.style.cursor = hov ? 'pointer' : 'default';
  }

  function onPU() {
    if (drag && !dragMoved) {
      expandNode(drag);
    }
    drag = null;
    dragMoved = false;
    pan = false;
    canvas.style.cursor = 'default';
  }

  function onWh(e) {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.15 : 0.87;
    const nz = Math.min(5, Math.max(0.15, zm * f));

    panO.x = mx - ((mx - panO.x) * nz) / zm;
    panO.y = my - ((my - panO.y) * nz) / zm;
    zm = nz;
  }

  function expandNode(n) {
    if (n.type === 'room') {
      if (exp.has(n.id)) {
        exp.delete(n.id);
        sel.delete(n.id);
        cool = 60;
        rebuild();
      } else {
        fetchRoomDrawers(n);
      }
      return;
    }

    if (n.type === 'wing') {
      if (sel.has(n.id)) sel.delete(n.id);
      else sel.add(n.id);
    }
  }

  async function fetchRoomDrawers(rn) {
    try {
      const res = await fetch(`/api/graph_drawers?room=${encodeURIComponent(rn.label)}&limit=40`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      (data.drawers || []).forEach((dr) => {
        const did = `drawer::${dr.embedding_id}`;
        if (gD.nodes.find((n) => n.id === did)) return;

        gD.nodes.push({
          id: did,
          label: dr.label || dr.embedding_id.slice(0, 24),
          type: 'drawer',
          count: 1,
          parentRoom: rn.id,
        });

        gD.edges.push({ source: rn.id, target: did, weight: 1 });
      });

      exp.add(rn.id);
      sel.add(rn.id);
      cool = 100;
      rebuild();

      if ($status) {
        const count = (data.drawers || []).length;
        $status.textContent = `${count} drawers in ${rn.label} · click room again to collapse`;
      }
    } catch (err) {
      console.error('expand failed', err);
      if ($status) $status.textContent = `Expand failed: ${err.message || String(err)}`;
    }
  }

  function doFilter() {
    fQ = (($search && $search.value) || '').trim().toLowerCase();

    if (!fQ) {
      rebuild();
      return;
    }

    const orig = JSON.parse(JSON.stringify(gD));
    gD.nodes = orig.nodes.filter((n) => n.label.toLowerCase().includes(fQ) || n.type.includes(fQ));
    const ids = new Set(gD.nodes.map((n) => n.id));
    gD.edges = orig.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    rebuild();
    gD = orig;
  }

  function resetAll() {
    sel.clear();
    exp.clear();
    fQ = '';
    if ($search) $search.value = '';
    zm = 1;
    panO.x = canvas.width / dpr / 2;
    panO.y = canvas.height / dpr / 2;
    cool = 100;
    rebuild();
  }
})();
