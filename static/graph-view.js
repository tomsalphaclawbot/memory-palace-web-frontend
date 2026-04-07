/* graph-view.js — Multi-renderer graph explorer (Sigma.js, Cytoscape.js, AntV G6) */
(function () {
  'use strict';

  const COLORS = {
    wing: '#4a6cf7',
    room: '#12a37c',
    drawer: '#e8913a',
    edge: 'rgba(161,180,230,0.46)',
    dim: 'rgba(110,126,164,0.18)',
    focus: '#ffd166',
  };

  const state = {
    raw: { nodes: [], edges: [] },
    graph: { nodes: [], edges: [] },
    engine: 'sigma',
    query: '',
    typeFilter: '',
    expandedRooms: new Set(),
    drawersByRoomLabel: new Map(),
    focusedWingId: null,
  };

  const ui = {
    wrap: null,
    search: null,
    clearSearch: null,
    status: null,
    legend: null,
    resetView: null,
    engineTabs: [],
    panels: {
      sigma: null,
      cytoscape: null,
      g6: null,
    },
  };

  const engines = {
    sigma: createSigmaEngine(),
    cytoscape: createCytoscapeEngine(),
    g6: createG6Engine(),
  };

  window.GraphView = {
    init,
    load,
    applyFilter,
    reset: resetAll,
  };

  function init(options) {
    const opts = options || {};

    ui.wrap = document.getElementById(opts.wrapId || 'graphWrap');
    ui.search = document.getElementById(opts.searchId || 'graphSearchInput');
    ui.clearSearch = document.getElementById(opts.clearSearchId || 'graphClearSearchBtn');
    ui.status = document.getElementById(opts.statusId || 'graphStatus');
    ui.legend = document.getElementById(opts.legendId || 'graphLegend');
    ui.resetView = document.getElementById(opts.resetViewId || 'graphResetViewBtn');
    ui.engineTabs = Array.from(document.querySelectorAll(opts.engineTabSelector || '.graph-engine-tab'));

    ui.panels.sigma = document.getElementById('graphSigma');
    ui.panels.cytoscape = document.getElementById('graphCytoscape');
    ui.panels.g6 = document.getElementById('graphG6');

    if (!ui.wrap) throw new Error('Graph wrapper missing');

    if (ui.search) {
      ui.search.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') applyFilter();
      });
    }

    if (ui.clearSearch) {
      ui.clearSearch.addEventListener('click', () => {
        if (ui.search) ui.search.value = '';
        applyFilter();
      });
    }

    if (ui.resetView) {
      ui.resetView.addEventListener('click', resetAll);
    }

    ui.engineTabs.forEach((tab) => {
      tab.addEventListener('click', () => setEngine(tab.dataset.graphEngine));
    });

    window.addEventListener('resize', () => {
      const active = engines[state.engine];
      if (active && typeof active.resize === 'function') active.resize();
    });

    if (ui.legend) {
      ui.legend.textContent =
        'Renderers: Sigma.js, Cytoscape.js, AntV G6. Click room to expand/collapse drawers. Click wing to focus neighborhood. Hover highlights local links.';
    }

    setEngine(state.engine);
    setStatus('Graph ready. Pick a renderer, then click nodes to explore.');
  }

  function load(data) {
    state.raw = deepClone(data || { nodes: [], edges: [] });
    state.expandedRooms.clear();
    state.drawersByRoomLabel.clear();
    state.focusedWingId = null;
    buildDerivedGraph();
    renderActiveEngine();
  }

  function applyFilter() {
    const raw = ui.search ? ui.search.value || '' : '';
    state.query = raw.trim().toLowerCase();

    const typeMatch = state.query.match(/\btype:(wing|room|drawer)\b/);
    state.typeFilter = typeMatch ? typeMatch[1] : '';

    buildDerivedGraph();
    renderActiveEngine();
  }

  function resetAll() {
    state.query = '';
    state.typeFilter = '';
    state.expandedRooms.clear();
    state.focusedWingId = null;
    if (ui.search) ui.search.value = '';
    buildDerivedGraph();
    Object.values(engines).forEach((engine) => {
      if (engine && typeof engine.resetView === 'function') engine.resetView();
    });
    renderActiveEngine();
    setStatus('Graph reset.');
  }

  function setEngine(name) {
    if (!engines[name]) return;
    state.engine = name;

    ui.engineTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.graphEngine === name);
    });

    Object.entries(ui.panels).forEach(([engineName, panel]) => {
      if (!panel) return;
      panel.classList.toggle('active', engineName === name);
    });

    renderActiveEngine();
  }

  async function onNodeClick(node) {
    if (!node) return;

    if (node.type === 'room') {
      await toggleRoomExpansion(node);
      return;
    }

    if (node.type === 'wing') {
      if (state.focusedWingId === node.id) {
        state.focusedWingId = null;
        setStatus(`Cleared focus for ${node.label}.`);
      } else {
        state.focusedWingId = node.id;
        setStatus(`Focused wing: ${node.label}`);
      }

      renderActiveEngine();
    }
  }

  async function toggleRoomExpansion(roomNode) {
    const alreadyExpanded = state.expandedRooms.has(roomNode.id);

    if (alreadyExpanded) {
      state.expandedRooms.delete(roomNode.id);
      buildDerivedGraph();
      renderActiveEngine();
      setStatus(`Collapsed drawer cluster for ${roomNode.label}.`);
      return;
    }

    if (!state.drawersByRoomLabel.has(roomNode.label)) {
      try {
        const drawers = await fetchRoomDrawers(roomNode.label);
        state.drawersByRoomLabel.set(roomNode.label, drawers);
      } catch (error) {
        setStatus(`Expand failed for ${roomNode.label}: ${error.message || String(error)}`);
        return;
      }
    }

    state.expandedRooms.add(roomNode.id);
    buildDerivedGraph();
    renderActiveEngine();

    const count = (state.drawersByRoomLabel.get(roomNode.label) || []).length;
    setStatus(`Expanded ${count} drawers in ${roomNode.label}.`);
  }

  async function fetchRoomDrawers(roomLabel) {
    const url = `/api/graph_drawers?room=${encodeURIComponent(roomLabel)}&limit=50`;
    const res = await fetch(url);
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || `HTTP ${res.status}`);
    }

    return (payload.drawers || []).map((drawer, index) => ({
      id: `drawer::${drawer.embedding_id}`,
      type: 'drawer',
      label: drawer.label || drawer.embedding_id || `drawer-${index + 1}`,
      embedding_id: drawer.embedding_id,
      parentRoomLabel: roomLabel,
      count: 1,
    }));
  }

  function buildDerivedGraph() {
    const baseNodes = state.raw.nodes
      .filter((node) => node.type === 'wing' || node.type === 'room')
      .map((node) => ({ ...node }));

    const roomById = new Map(baseNodes.filter((node) => node.type === 'room').map((node) => [node.id, node]));

    const extraNodes = [];
    const extraEdges = [];

    state.expandedRooms.forEach((roomId) => {
      const roomNode = roomById.get(roomId);
      if (!roomNode) return;

      const drawers = state.drawersByRoomLabel.get(roomNode.label) || [];
      drawers.forEach((drawer) => {
        extraNodes.push({ ...drawer });
        extraEdges.push({
          source: roomNode.id,
          target: drawer.id,
          weight: 1,
          room: roomNode.label,
        });
      });
    });

    const allNodes = [...baseNodes, ...extraNodes];
    const allEdges = [...state.raw.edges.map((edge) => ({ ...edge })), ...extraEdges];

    const filtered = filterGraph(allNodes, allEdges, state.query, state.typeFilter);

    state.graph = filtered;
  }

  function filterGraph(nodes, edges, query, typeFilter) {
    const cleanedQuery = (query || '').replace(/\btype:(wing|room|drawer)\b/g, '').trim();

    let filteredNodes = nodes;

    if (typeFilter) {
      filteredNodes = filteredNodes.filter((node) => node.type === typeFilter);
    }

    if (cleanedQuery) {
      filteredNodes = filteredNodes.filter((node) => {
        const label = String(node.label || '').toLowerCase();
        const type = String(node.type || '').toLowerCase();
        return label.includes(cleanedQuery) || type.includes(cleanedQuery);
      });
    }

    const idSet = new Set(filteredNodes.map((node) => node.id));
    const filteredEdges = edges.filter((edge) => idSet.has(edge.source) && idSet.has(edge.target));

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
    };
  }

  function renderActiveEngine() {
    const engine = engines[state.engine];
    if (!engine) return;

    const context = {
      focusNodeId: state.focusedWingId,
      onNodeClick,
      getNeighborhood(nodeId) {
        return neighborhoodForNode(state.graph, nodeId);
      },
      setStatus,
    };

    Object.entries(engines).forEach(([name, instance]) => {
      if (!instance) return;
      if (name === state.engine) return;
      if (typeof instance.suspend === 'function') instance.suspend();
    });

    engine.render(state.graph, context);

    const wingCount = state.graph.nodes.filter((node) => node.type === 'wing').length;
    const roomCount = state.graph.nodes.filter((node) => node.type === 'room').length;
    const drawerCount = state.graph.nodes.filter((node) => node.type === 'drawer').length;
    const edgeCount = state.graph.edges.length;

    if (!ui.status || ui.status.textContent.includes('Expanded') || ui.status.textContent.includes('Collapsed')) {
      return;
    }

    setStatus(`${engine.label}: ${wingCount} wings · ${roomCount} rooms · ${drawerCount} drawers · ${edgeCount} links`);
  }

  function neighborhoodForNode(graph, nodeId) {
    if (!nodeId) return null;

    const linked = new Set([nodeId]);
    graph.edges.forEach((edge) => {
      if (edge.source === nodeId) linked.add(edge.target);
      if (edge.target === nodeId) linked.add(edge.source);
    });

    return linked;
  }

  function setStatus(text) {
    if (!ui.status) return;
    ui.status.textContent = text;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nodeColor(node) {
    return COLORS[node.type] || '#9aa5c5';
  }

  function nodeSize(node) {
    if (node.type === 'wing') return 18;
    if (node.type === 'room') return 12;
    return 8;
  }

  function createSigmaEngine() {
    return {
      label: 'Sigma.js',
      renderer: null,
      graph: null,
      hoveredNodeId: null,
      _refreshTimer: null,
      render(graphData, ctx) {
        const panel = ui.panels.sigma;
        if (!panel) return;

        if (!window.Sigma || !window.graphology || !window.graphology.Graph) {
          setStatus('Sigma.js unavailable, check CDN load.');
          return;
        }

        this.destroy();

        this.graph = new window.graphology.Graph();

        const positions = sigmaPositions(graphData.nodes);
        graphData.nodes.forEach((node) => {
          const pos = positions.get(node.id) || { x: 0, y: 0 };
          this.graph.addNode(node.id, {
            x: pos.x,
            y: pos.y,
            label: node.label,
            size: nodeSize(node),
            color: nodeColor(node),
            raw: node,
          });
        });

        graphData.edges.forEach((edge, index) => {
          if (!this.graph.hasNode(edge.source) || !this.graph.hasNode(edge.target)) return;
          this.graph.addEdgeWithKey(`e-${index}-${edge.source}-${edge.target}`, edge.source, edge.target, {
            size: Math.max(1, Math.min(4, (edge.weight || 1) / 6)),
            color: COLORS.edge,
          });
        });

        this.renderer = new window.Sigma(this.graph, panel, {
          renderLabels: true,
          labelDensity: 0.07,
          labelGridCellSize: 120,
          defaultEdgeType: 'line',
          allowInvalidContainer: true,
        });

        this.renderer.on('clickNode', (event) => {
          const attrs = this.graph.getNodeAttributes(event.node);
          if (attrs && attrs.raw) ctx.onNodeClick(attrs.raw);
        });

        this.renderer.on('enterNode', (event) => {
          this.hoveredNodeId = event.node;
          this.refresh(ctx);
        });

        this.renderer.on('leaveNode', () => {
          this.hoveredNodeId = null;
          this.refresh(ctx);
        });

        this.renderer.setSetting('nodeReducer', (nodeKey, data) => {
          const highlighted = this.highlightSet(ctx);
          const result = { ...data };

          if (highlighted && !highlighted.has(nodeKey)) {
            result.color = COLORS.dim;
            result.label = '';
          }

          if (ctx.focusNodeId && nodeKey === ctx.focusNodeId) {
            result.color = COLORS.focus;
            result.size = (result.size || 10) + 2;
          }

          return result;
        });

        this.renderer.setSetting('edgeReducer', (edgeKey, data) => {
          const highlighted = this.highlightSet(ctx);
          if (!highlighted) return data;

          const extremities = this.graph.extremities(edgeKey);
          if (!extremities || extremities.length !== 2) return data;

          if (highlighted.has(extremities[0]) || highlighted.has(extremities[1])) {
            return { ...data, color: '#b8cbff', size: Math.max(1.2, data.size || 1) };
          }

          return { ...data, color: COLORS.dim, size: 0.7 };
        });

        this.refresh(ctx);
      },
      highlightSet(ctx) {
        if (this.hoveredNodeId) {
          return ctx.getNeighborhood(this.hoveredNodeId);
        }
        if (ctx.focusNodeId) {
          return ctx.getNeighborhood(ctx.focusNodeId);
        }
        return null;
      },
      refresh(ctx) {
        if (!this.renderer) return;
        this.renderer.refresh();

        if (this.hoveredNodeId && this.graph && this.graph.hasNode(this.hoveredNodeId)) {
          const node = this.graph.getNodeAttributes(this.hoveredNodeId);
          if (node && node.label) {
            ctx.setStatus(`Sigma.js hover: ${node.label}`);
          }
        }
      },
      resize() {
        if (this.renderer) this.renderer.refresh();
      },
      suspend() {
        this.hoveredNodeId = null;
      },
      resetView() {
        if (!this.renderer) return;
        this.hoveredNodeId = null;
        this.renderer.refresh();
      },
      destroy() {
        if (this.renderer && typeof this.renderer.kill === 'function') {
          this.renderer.kill();
        }
        this.renderer = null;
        this.graph = null;
      },
    };
  }

  function sigmaPositions(nodes) {
    const map = new Map();

    const wings = nodes.filter((node) => node.type === 'wing');
    const rooms = nodes.filter((node) => node.type === 'room');
    const drawers = nodes.filter((node) => node.type === 'drawer');

    wings.forEach((node, index) => {
      const y = index * 24 - (wings.length * 24) / 2;
      map.set(node.id, { x: -130, y });
    });

    rooms.forEach((node, index) => {
      const y = index * 16 - (rooms.length * 16) / 2;
      map.set(node.id, { x: 50, y });
    });

    drawers.forEach((node, index) => {
      const y = index * 12 - (drawers.length * 12) / 2;
      map.set(node.id, { x: 220, y });
    });

    return map;
  }

  function createCytoscapeEngine() {
    return {
      label: 'Cytoscape.js',
      cy: null,
      hoveredNodeId: null,
      graphData: null,
      ctx: null,
      render(graphData, ctx) {
        const panel = ui.panels.cytoscape;
        if (!panel) return;

        if (!window.cytoscape) {
          setStatus('Cytoscape.js unavailable, check CDN load.');
          return;
        }

        this.destroy();
        this.graphData = graphData;
        this.ctx = ctx;

        const elements = [
          ...graphData.nodes.map((node) => ({
            data: {
              id: node.id,
              label: node.label,
              type: node.type,
              size: nodeSize(node),
              color: nodeColor(node),
              raw: node,
            },
          })),
          ...graphData.edges.map((edge, index) => ({
            data: {
              id: `e-${index}-${edge.source}-${edge.target}`,
              source: edge.source,
              target: edge.target,
              weight: edge.weight || 1,
            },
          })),
        ];

        this.cy = window.cytoscape({
          container: panel,
          elements,
          style: [
            {
              selector: 'node',
              style: {
                'background-color': 'data(color)',
                label: 'data(label)',
                color: '#e7f0ff',
                'font-size': 10,
                width: 'mapData(size, 8, 20, 14, 30)',
                height: 'mapData(size, 8, 20, 14, 30)',
                'text-outline-width': 2,
                'text-outline-color': '#1a2034',
              },
            },
            {
              selector: 'edge',
              style: {
                'line-color': COLORS.edge,
                width: 'mapData(weight, 1, 30, 1, 4)',
                opacity: 0.85,
              },
            },
            { selector: 'node.dim', style: { opacity: 0.18 } },
            { selector: 'edge.dim', style: { opacity: 0.07 } },
            { selector: 'node.focus', style: { 'border-width': 3, 'border-color': COLORS.focus } },
          ],
          layout: {
            name: 'cose',
            animate: true,
            fit: true,
            padding: 36,
            idealEdgeLength: 120,
          },
        });

        this.cy.on('tap', 'node', (event) => {
          const raw = event.target.data('raw');
          if (raw) ctx.onNodeClick(raw);
        });

        this.cy.on('mouseover', 'node', (event) => {
          this.hoveredNodeId = event.target.id();
          this.applyFocusClasses();
          const raw = event.target.data('raw');
          if (raw && raw.label) ctx.setStatus(`Cytoscape hover: ${raw.label}`);
        });

        this.cy.on('mouseout', 'node', () => {
          this.hoveredNodeId = null;
          this.applyFocusClasses();
        });

        this.cy.on('layoutstop', () => this.applyFocusClasses());

        this.applyFocusClasses();
      },
      applyFocusClasses() {
        if (!this.cy || !this.ctx) return;

        const highlightSource = this.hoveredNodeId || this.ctx.focusNodeId;
        const highlightSet = highlightSource ? this.ctx.getNeighborhood(highlightSource) : null;

        this.cy.nodes().removeClass('dim focus');
        this.cy.edges().removeClass('dim');

        if (highlightSet) {
          this.cy.nodes().forEach((node) => {
            if (!highlightSet.has(node.id())) node.addClass('dim');
          });

          this.cy.edges().forEach((edge) => {
            const source = edge.data('source');
            const target = edge.data('target');
            if (!highlightSet.has(source) && !highlightSet.has(target)) edge.addClass('dim');
          });
        }

        if (this.ctx.focusNodeId) {
          this.cy.getElementById(this.ctx.focusNodeId).addClass('focus');
        }
      },
      resize() {
        if (!this.cy) return;
        this.cy.resize();
        this.cy.fit(undefined, 36);
      },
      suspend() {
        this.hoveredNodeId = null;
      },
      resetView() {
        if (!this.cy) return;
        this.hoveredNodeId = null;
        this.cy.fit(undefined, 36);
        this.applyFocusClasses();
      },
      destroy() {
        if (this.cy) this.cy.destroy();
        this.cy = null;
      },
    };
  }

  function createG6Engine() {
    return {
      label: 'AntV G6',
      graph: null,
      hoveredNodeId: null,
      graphData: null,
      ctx: null,
      render(graphData, ctx) {
        const panel = ui.panels.g6;
        if (!panel) return;

        if (!window.G6 || !window.G6.Graph) {
          setStatus('AntV G6 unavailable, check CDN load.');
          return;
        }

        this.destroy();
        this.graphData = graphData;
        this.ctx = ctx;

        const width = Math.max(panel.clientWidth || 0, 320);
        const height = Math.max(panel.clientHeight || 0, 360);

        this.graph = new window.G6.Graph({
          container: panel,
          width,
          height,
          modes: {
            default: ['drag-canvas', 'zoom-canvas', 'drag-node'],
          },
          layout: {
            type: 'force',
            preventOverlap: true,
            linkDistance: 130,
            nodeStrength: -200,
            edgeStrength: 0.08,
          },
          defaultNode: {
            size: 16,
            style: {
              stroke: '#dce6ff',
              lineWidth: 1,
            },
            labelCfg: {
              style: {
                fill: '#e8f0ff',
                fontSize: 11,
              },
            },
          },
          defaultEdge: {
            style: {
              stroke: COLORS.edge,
              lineWidth: 1,
            },
          },
          nodeStateStyles: {
            dim: { opacity: 0.16 },
            focus: { stroke: COLORS.focus, lineWidth: 3 },
            hover: { stroke: '#9fc0ff', lineWidth: 2 },
          },
          edgeStateStyles: {
            dim: { opacity: 0.08 },
            highlight: { stroke: '#b7cbff', lineWidth: 2 },
          },
        });

        const data = {
          nodes: graphData.nodes.map((node) => ({
            id: node.id,
            label: node.label,
            size: nodeSize(node),
            style: { fill: nodeColor(node) },
            raw: node,
          })),
          edges: graphData.edges.map((edge, index) => ({
            id: `e-${index}-${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            weight: edge.weight || 1,
          })),
        };

        this.graph.data(data);
        this.graph.render();

        this.graph.on('node:click', (event) => {
          const model = event.item && event.item.getModel ? event.item.getModel() : null;
          if (model && model.raw) ctx.onNodeClick(model.raw);
        });

        this.graph.on('node:mouseenter', (event) => {
          const model = event.item && event.item.getModel ? event.item.getModel() : null;
          this.hoveredNodeId = model ? model.id : null;
          this.applyStates();
          if (model && model.label) ctx.setStatus(`G6 hover: ${model.label}`);
        });

        this.graph.on('node:mouseleave', () => {
          this.hoveredNodeId = null;
          this.applyStates();
        });

        this.applyStates();
      },
      applyStates() {
        if (!this.graph || !this.ctx) return;

        const focusId = this.hoveredNodeId || this.ctx.focusNodeId;
        const highlightSet = focusId ? this.ctx.getNeighborhood(focusId) : null;

        this.graph.getNodes().forEach((nodeItem) => {
          const model = nodeItem.getModel();
          this.graph.clearItemStates(nodeItem);
          if (highlightSet && !highlightSet.has(model.id)) this.graph.setItemState(nodeItem, 'dim', true);
          if (this.ctx.focusNodeId && model.id === this.ctx.focusNodeId) this.graph.setItemState(nodeItem, 'focus', true);
          if (this.hoveredNodeId && model.id === this.hoveredNodeId) this.graph.setItemState(nodeItem, 'hover', true);
        });

        this.graph.getEdges().forEach((edgeItem) => {
          const model = edgeItem.getModel();
          this.graph.clearItemStates(edgeItem);
          if (!highlightSet) return;

          const linked = highlightSet.has(model.source) || highlightSet.has(model.target);
          if (linked) this.graph.setItemState(edgeItem, 'highlight', true);
          else this.graph.setItemState(edgeItem, 'dim', true);
        });
      },
      resize() {
        if (!this.graph) return;
        const panel = ui.panels.g6;
        if (!panel) return;
        const width = Math.max(panel.clientWidth || 0, 320);
        const height = Math.max(panel.clientHeight || 0, 360);
        this.graph.changeSize(width, height);
      },
      suspend() {
        this.hoveredNodeId = null;
      },
      resetView() {
        if (!this.graph) return;
        this.hoveredNodeId = null;
        this.graph.fitView(20);
        this.applyStates();
      },
      destroy() {
        if (this.graph && typeof this.graph.destroy === 'function') {
          this.graph.destroy();
        }
        this.graph = null;
      },
    };
  }
})();
