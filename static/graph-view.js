/* graph-view.js — Multi-renderer graph explorer (Sigma.js, Cytoscape.js, AntV G6 + Vis, D3, ForceGraph, Neo4j) */
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
    engine: 'neo4',
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
      vis: null,
      d3: null,
      force: null,
      neo4: null,
    },
  };

  const engines = {
    sigma: createSigmaEngine(),
    cytoscape: createCytoscapeEngine(),
    g6: createG6Engine(),
    vis: createVisEngine(),
    d3: createD3Engine(),
    force: createForceGraphEngine(),
    neo4: createNeo4Engine(),
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
    ui.panels.vis = document.getElementById('graphVis');
    ui.panels.d3 = document.getElementById('graphD3');
    ui.panels.force = document.getElementById('graphForce');
    ui.panels.neo4 = document.getElementById('graphNeo4');

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
      tab.addEventListener('click', () => setEngine(tab.dataset.graphEngine, true));
    });

    window.addEventListener('resize', () => {
      const active = engines[state.engine];
      if (active && typeof active.resize === 'function') active.resize();
    });

    if (ui.legend) {
      ui.legend.textContent =
        'Renderers: Neo4j, Sigma.js, Cytoscape.js, AntV G6, vis-network, D3 Force, ForceGraph. Click room to expand/collapse drawers. Click wing to focus neighborhood. Hover highlights local links.';
    }

    setEngine(state.engine, false);
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

  function setEngine(name, notify = true) {
    if (!engines[name]) return;
    state.engine = name;

    ui.engineTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.graphEngine === name);
    });

    Object.entries(ui.panels).forEach(([engineName, panel]) => {
      if (!panel) return;
      panel.classList.toggle('active', engineName === name);
    });

    if (notify) {
      window.dispatchEvent(
        new CustomEvent('graph:engine-change', {
          detail: { engine: name },
        })
      );
    }

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

  function createVisEngine() {
    return {
      label: 'vis-network',
      network: null,
      nodesData: null,
      edgesData: null,
      graphData: null,
      ctx: null,
      hoveredNodeId: null,
      render(graphData, ctx) {
        const panel = ui.panels.vis;
        if (!panel) return;

        const visGlobal = window.vis && (window.vis.default || window.vis);
        if (!visGlobal || typeof visGlobal.Network !== 'function') {
          setStatus('vis-network unavailable, check CDN load.');
          return;
        }

        this.destroy();
        this.graphData = graphData;
        this.ctx = ctx;

        this.nodesData = new visGlobal.DataSet(
          graphData.nodes.map((node) => ({
            id: node.id,
            label: node.label,
            shape: 'dot',
            size: nodeSize(node),
            color: nodeColor(node),
            font: { color: '#e7f0ff', size: 11, face: 'Inter, system-ui' },
            raw: node,
          }))
        );

        this.edgesData = new visGlobal.DataSet(
          graphData.edges.map((edge, index) => ({
            id: `e-${index}-${edge.source}-${edge.target}`,
            from: edge.source,
            to: edge.target,
            width: Math.max(1, Math.min(4, (edge.weight || 1) / 6)),
            color: { color: COLORS.edge },
            smooth: { enabled: false },
          }))
        );

        this.network = new visGlobal.Network(
          panel,
          { nodes: this.nodesData, edges: this.edgesData },
          {
            autoResize: true,
            interaction: { hover: true, dragNodes: true, dragView: true, zoomView: true },
            physics: {
              enabled: true,
              solver: 'forceAtlas2Based',
              stabilization: { enabled: true, iterations: 120 },
              forceAtlas2Based: { gravitationalConstant: -60, springLength: 120, springConstant: 0.06 },
            },
            edges: { color: { color: COLORS.edge, highlight: '#b7cbff' } },
          }
        );

        this.network.on('click', (params) => {
          const id = params && params.nodes && params.nodes[0];
          if (!id || !this.nodesData) return;
          const node = this.nodesData.get(id);
          if (node && node.raw) ctx.onNodeClick(node.raw);
        });

        this.network.on('hoverNode', (params) => {
          this.hoveredNodeId = params.node;
          this.applyFocus();
          const node = this.nodesData && this.nodesData.get(params.node);
          if (node && node.label) ctx.setStatus(`vis-network hover: ${node.label}`);
        });

        this.network.on('blurNode', () => {
          this.hoveredNodeId = null;
          this.applyFocus();
        });

        this.applyFocus();
      },
      applyFocus() {
        if (!this.nodesData || !this.edgesData || !this.ctx || !this.graphData) return;

        const focusId = this.hoveredNodeId || this.ctx.focusNodeId;
        const highlightSet = focusId ? this.ctx.getNeighborhood(focusId) : null;

        this.nodesData.update(
          this.graphData.nodes.map((node) => {
            const inFocus = !highlightSet || highlightSet.has(node.id);
            return {
              id: node.id,
              color: inFocus ? nodeColor(node) : COLORS.dim,
              font: { color: inFocus ? '#e7f0ff' : '#6f7890', size: 11, face: 'Inter, system-ui' },
              borderWidth: this.ctx.focusNodeId === node.id ? 2 : 0,
              borderWidthSelected: this.ctx.focusNodeId === node.id ? 2 : 0,
              borderWidthHovered: 1,
            };
          })
        );

        this.edgesData.update(
          this.graphData.edges.map((edge, index) => {
            const linked = !highlightSet || highlightSet.has(edge.source) || highlightSet.has(edge.target);
            return {
              id: `e-${index}-${edge.source}-${edge.target}`,
              color: { color: linked ? COLORS.edge : COLORS.dim },
              width: linked ? Math.max(1, Math.min(4, (edge.weight || 1) / 6)) : 0.7,
            };
          })
        );
      },
      resize() {
        if (this.network) this.network.redraw();
      },
      suspend() {
        this.hoveredNodeId = null;
      },
      resetView() {
        if (!this.network) return;
        this.hoveredNodeId = null;
        this.network.fit({ animation: { duration: 350 } });
        this.applyFocus();
      },
      destroy() {
        if (this.network && typeof this.network.destroy === 'function') {
          this.network.destroy();
        }
        this.network = null;
        this.nodesData = null;
        this.edgesData = null;
      },
    };
  }

  function createD3Engine() {
    return {
      label: 'D3 Force',
      svg: null,
      simulation: null,
      graphData: null,
      ctx: null,
      hoveredNodeId: null,
      nodesSel: null,
      linksSel: null,
      labelsSel: null,
      render(graphData, ctx) {
        const panel = ui.panels.d3;
        if (!panel || !window.d3) {
          setStatus('D3 unavailable, check CDN load.');
          return;
        }

        this.destroy();
        this.graphData = graphData;
        this.ctx = ctx;

        const d3 = window.d3;
        const width = Math.max(panel.clientWidth || 0, 320);
        const height = Math.max(panel.clientHeight || 0, 360);

        this.svg = d3.select(panel);
        this.svg.selectAll('*').remove();
        this.svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

        const root = this.svg.append('g').attr('class', 'd3-root');

        this.svg.call(
          d3.zoom().scaleExtent([0.2, 6]).on('zoom', (event) => {
            root.attr('transform', event.transform);
          })
        );

        const nodes = graphData.nodes.map((node) => ({ ...node }));
        const links = graphData.edges.map((edge) => ({ ...edge }));

        this.linksSel = root
          .append('g')
          .selectAll('line')
          .data(links)
          .enter()
          .append('line')
          .attr('stroke', COLORS.edge)
          .attr('stroke-width', (d) => Math.max(1, Math.min(4, (d.weight || 1) / 6)));

        this.nodesSel = root
          .append('g')
          .selectAll('circle')
          .data(nodes)
          .enter()
          .append('circle')
          .attr('r', (d) => nodeSize(d))
          .attr('fill', (d) => nodeColor(d))
          .attr('stroke', '#dce6ff')
          .attr('stroke-width', 0.8)
          .style('cursor', 'pointer')
          .on('click', (_, d) => ctx.onNodeClick(d))
          .on('mouseover', (_, d) => {
            this.hoveredNodeId = d.id;
            this.applyFocus();
            ctx.setStatus(`D3 hover: ${d.label}`);
          })
          .on('mouseout', () => {
            this.hoveredNodeId = null;
            this.applyFocus();
          })
          .call(
            d3.drag()
              .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
              })
              .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
              })
              .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
              })
          );

        this.labelsSel = root
          .append('g')
          .selectAll('text')
          .data(nodes)
          .enter()
          .append('text')
          .attr('font-size', 10)
          .attr('fill', '#e7f0ff')
          .attr('pointer-events', 'none')
          .text((d) => d.label);

        this.simulation = d3
          .forceSimulation(nodes)
          .force('link', d3.forceLink(links).id((d) => d.id).distance(120).strength(0.12))
          .force('charge', d3.forceManyBody().strength(-220))
          .force('center', d3.forceCenter(width / 2, height / 2))
          .force('collision', d3.forceCollide().radius((d) => nodeSize(d) + 4));

        this.simulation.on('tick', () => {
          this.linksSel
            .attr('x1', (d) => d.source.x)
            .attr('y1', (d) => d.source.y)
            .attr('x2', (d) => d.target.x)
            .attr('y2', (d) => d.target.y);

          this.nodesSel.attr('cx', (d) => d.x).attr('cy', (d) => d.y);

          this.labelsSel.attr('x', (d) => d.x + nodeSize(d) + 2).attr('y', (d) => d.y + 3);
        });

        this.applyFocus();
      },
      applyFocus() {
        if (!this.nodesSel || !this.linksSel || !this.ctx) return;

        const focusId = this.hoveredNodeId || this.ctx.focusNodeId;
        const highlightSet = focusId ? this.ctx.getNeighborhood(focusId) : null;

        this.nodesSel
          .attr('opacity', (d) => (!highlightSet || highlightSet.has(d.id) ? 1 : 0.18))
          .attr('stroke-width', (d) => (this.ctx.focusNodeId === d.id ? 2.8 : 0.8))
          .attr('stroke', (d) => (this.ctx.focusNodeId === d.id ? COLORS.focus : '#dce6ff'));

        this.labelsSel.attr('opacity', (d) => (!highlightSet || highlightSet.has(d.id) ? 1 : 0.2));

        this.linksSel.attr('opacity', (d) => {
          if (!highlightSet) return 0.9;
          const s = typeof d.source === 'string' ? d.source : d.source.id;
          const t = typeof d.target === 'string' ? d.target : d.target.id;
          return highlightSet.has(s) || highlightSet.has(t) ? 0.9 : 0.08;
        });
      },
      resize() {
        if (!this.simulation) return;
        const panel = ui.panels.d3;
        if (!panel || !this.svg) return;
        const width = Math.max(panel.clientWidth || 0, 320);
        const height = Math.max(panel.clientHeight || 0, 360);
        this.svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
        const center = this.simulation.force('center');
        if (center) center.x(width / 2).y(height / 2);
        this.simulation.alpha(0.25).restart();
      },
      suspend() {
        this.hoveredNodeId = null;
      },
      resetView() {
        this.hoveredNodeId = null;
        this.applyFocus();
        if (this.simulation) this.simulation.alpha(0.35).restart();
      },
      destroy() {
        if (this.simulation) this.simulation.stop();
        this.simulation = null;
        if (this.svg) this.svg.selectAll('*').remove();
        this.svg = null;
      },
    };
  }

  function createForceGraphEngine() {
    return {
      label: 'ForceGraph',
      graph: null,
      graphData: null,
      ctx: null,
      hoveredNodeId: null,
      render(graphData, ctx) {
        const panel = ui.panels.force;
        if (!panel || !window.ForceGraph) {
          setStatus('ForceGraph unavailable, check CDN load.');
          return;
        }

        this.destroy();
        this.graphData = graphData;
        this.ctx = ctx;

        panel.innerHTML = '';

        const width = Math.max(panel.clientWidth || 0, 320);
        const height = Math.max(panel.clientHeight || 0, 360);

        const links = graphData.edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          weight: edge.weight || 1,
        }));

        const nodes = graphData.nodes.map((node) => ({ ...node }));

        const graph = window.ForceGraph()(panel)
          .graphData({ nodes, links })
          .width(width)
          .height(height)
          .backgroundColor('#0f1220')
          .nodeLabel((node) => node.label)
          .nodeVal((node) => nodeSize(node) * 1.2)
          .nodeColor((node) => nodeColor(node))
          .linkColor(() => COLORS.edge)
          .linkWidth((link) => Math.max(0.8, Math.min(3.2, link.weight / 7)))
          .onNodeClick((node) => ctx.onNodeClick(node))
          .onNodeHover((node) => {
            this.hoveredNodeId = node ? node.id : null;
            this.applyFocus();
            if (node && node.label) ctx.setStatus(`ForceGraph hover: ${node.label}`);
          });

        this.graph = graph;
        this.applyFocus();
      },
      applyFocus() {
        if (!this.graph || !this.ctx || !this.graphData) return;

        const focusId = this.hoveredNodeId || this.ctx.focusNodeId;
        const highlightSet = focusId ? this.ctx.getNeighborhood(focusId) : null;

        this.graph
          .nodeColor((node) => {
            if (this.ctx.focusNodeId === node.id) return COLORS.focus;
            if (!highlightSet || highlightSet.has(node.id)) return nodeColor(node);
            return COLORS.dim;
          })
          .linkColor((link) => {
            if (!highlightSet) return COLORS.edge;
            return highlightSet.has(link.source.id || link.source) || highlightSet.has(link.target.id || link.target)
              ? '#b7cbff'
              : COLORS.dim;
          })
          .linkWidth((link) => {
            const base = Math.max(0.8, Math.min(3.2, (link.weight || 1) / 7));
            if (!highlightSet) return base;
            const linked = highlightSet.has(link.source.id || link.source) || highlightSet.has(link.target.id || link.target);
            return linked ? base : 0.45;
          });
      },
      resize() {
        if (!this.graph) return;
        const panel = ui.panels.force;
        if (!panel) return;
        this.graph.width(Math.max(panel.clientWidth || 0, 320)).height(Math.max(panel.clientHeight || 0, 360));
      },
      suspend() {
        this.hoveredNodeId = null;
      },
      resetView() {
        this.hoveredNodeId = null;
        this.applyFocus();
      },
      destroy() {
        if (!this.graph) return;
        const panel = ui.panels.force;
        if (panel) panel.innerHTML = '';
        this.graph = null;
      },
    };
  }

  function createNeo4Engine() {
    return {
      label: 'Neo4j',
      network: null,
      nodesData: null,
      edgesData: null,
      graphData: null,
      ctx: null,
      hoveredNodeId: null,
      render(graphData, ctx) {
        const panel = ui.panels.neo4;
        if (!panel) return;

        const visGlobal = window.vis && (window.vis.default || window.vis);
        if (!visGlobal || typeof visGlobal.Network !== 'function') {
          setStatus('Neo4j renderer unavailable, check vis-network CDN load.');
          return;
        }

        this.destroy();
        this.graphData = graphData;
        this.ctx = ctx;

        this.nodesData = new visGlobal.DataSet(
          graphData.nodes.map((node) => ({
            id: node.id,
            label: neo4Label(node),
            title: neo4Title(node),
            shape: 'dot',
            size: neo4Size(node),
            color: {
              background: neo4Color(node),
              border: '#dce6ff',
              highlight: { background: '#f4f8ff', border: '#ffffff' },
            },
            font: { color: '#f4f7ff', size: 11, face: 'Inter, system-ui' },
            raw: node,
          }))
        );

        this.edgesData = new visGlobal.DataSet(
          graphData.edges.map((edge, index) => ({
            id: `e-${index}-${edge.source}-${edge.target}`,
            from: edge.source,
            to: edge.target,
            label: neo4Rel(edge),
            arrows: 'to',
            width: Math.max(1, Math.min(4, (edge.weight || 1) / 6)),
            color: { color: 'rgba(168,184,232,0.58)' },
            font: { color: '#94a4d9', size: 9, strokeWidth: 0 },
            smooth: { enabled: true, type: 'dynamic', roundness: 0.28 },
          }))
        );

        this.network = new visGlobal.Network(
          panel,
          { nodes: this.nodesData, edges: this.edgesData },
          {
            autoResize: true,
            interaction: {
              hover: true,
              dragNodes: true,
              dragView: true,
              zoomView: true,
              hoverConnectedEdges: true,
              tooltipDelay: 120,
            },
            nodes: {
              borderWidth: 1.1,
              borderWidthSelected: 2.4,
              scaling: { min: 7, max: 28 },
            },
            edges: {
              arrows: { to: { enabled: true, scaleFactor: 0.55 } },
              color: { color: 'rgba(168,184,232,0.58)', highlight: '#c7d7ff' },
            },
            physics: {
              enabled: true,
              solver: 'barnesHut',
              stabilization: { enabled: true, iterations: 140 },
              barnesHut: {
                gravitationalConstant: -2500,
                springLength: 130,
                springConstant: 0.032,
                damping: 0.2,
              },
            },
          }
        );

        this.network.on('click', (params) => {
          const id = params && params.nodes && params.nodes[0];
          if (!id || !this.nodesData) return;
          const node = this.nodesData.get(id);
          if (node && node.raw) ctx.onNodeClick(node.raw);
        });

        this.network.on('hoverNode', (params) => {
          this.hoveredNodeId = params.node;
          this.applyFocus();
          const node = this.nodesData && this.nodesData.get(params.node);
          if (node && node.raw) {
            const type = String(node.raw.type || '').toUpperCase();
            ctx.setStatus(`Neo4j hover: (${type}) ${node.raw.label}`);
          }
        });

        this.network.on('blurNode', () => {
          this.hoveredNodeId = null;
          this.applyFocus();
        });

        this.applyFocus();
      },
      applyFocus() {
        if (!this.nodesData || !this.edgesData || !this.ctx || !this.graphData) return;

        const focusId = this.hoveredNodeId || this.ctx.focusNodeId;
        const highlightSet = focusId ? this.ctx.getNeighborhood(focusId) : null;

        this.nodesData.update(
          this.graphData.nodes.map((node) => {
            const inFocus = !highlightSet || highlightSet.has(node.id);
            return {
              id: node.id,
              color: {
                background: inFocus ? neo4Color(node) : COLORS.dim,
                border: this.ctx.focusNodeId === node.id ? COLORS.focus : '#dce6ff',
              },
              font: { color: inFocus ? '#f4f7ff' : '#6f7890', size: 11, face: 'Inter, system-ui' },
              borderWidth: this.ctx.focusNodeId === node.id ? 2.5 : 1.1,
              label: neo4Label(node),
            };
          })
        );

        this.edgesData.update(
          this.graphData.edges.map((edge, index) => {
            const linked = !highlightSet || highlightSet.has(edge.source) || highlightSet.has(edge.target);
            return {
              id: `e-${index}-${edge.source}-${edge.target}`,
              color: { color: linked ? 'rgba(183,203,255,0.72)' : COLORS.dim },
              width: linked ? Math.max(1, Math.min(4, (edge.weight || 1) / 6)) : 0.6,
              font: { color: linked ? '#9bb0ea' : '#5e6680', size: 9, strokeWidth: 0 },
            };
          })
        );
      },
      resize() {
        if (this.network) this.network.redraw();
      },
      suspend() {
        this.hoveredNodeId = null;
      },
      resetView() {
        if (!this.network) return;
        this.hoveredNodeId = null;
        this.network.fit({ animation: { duration: 350 } });
        this.applyFocus();
      },
      destroy() {
        if (this.network && typeof this.network.destroy === 'function') {
          this.network.destroy();
        }
        this.network = null;
        this.nodesData = null;
        this.edgesData = null;
      },
    };
  }

  function neo4Color(node) {
    if (node.type === 'wing') return '#4a6cf7';
    if (node.type === 'room') return '#2fb47c';
    if (node.type === 'drawer') return '#f39c4a';
    return '#9aa5c5';
  }

  function neo4Size(node) {
    if (node.type === 'wing') return 19;
    if (node.type === 'room') return 13;
    return 9;
  }

  function neo4Label(node) {
    const type = String(node.type || '').toUpperCase();
    return `(:${type}) ${node.label || node.id || ''}`.trim();
  }

  function neo4Title(node) {
    const type = String(node.type || '').toUpperCase();
    const count = node.count != null ? `\ncount: ${node.count}` : '';
    return `(${type}) ${node.label || node.id || ''}${count}`;
  }

  function neo4Rel(edge) {
    if (edge.room && edge.wing) return ':CONTAINS_ROOM';
    if (String(edge.source || '').startsWith('room::') && String(edge.target || '').startsWith('drawer::')) {
      return ':HAS_DRAWER';
    }
    return ':CONNECTED_TO';
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
