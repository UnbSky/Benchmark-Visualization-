(() => {
  const D = window.BENCHMARK_DATA;
  if (!D) return;

  const $ = (id) => document.getElementById(id);
  const modelOf = (id) => D.models.find((m) => m.id === id);
  const sourceOf = (id) => D.sources.find((s) => s.id === id);
  const benchOf = (id) => D.benchmarks.find((b) => b.id === id);
  const fmt = (n) => `${n.toFixed(1)}%`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const srcLink = (id) => {
    const s = sourceOf(id);
    return s ? `<a href="${s.url}" target="_blank" rel="noopener">${s.org}</a>` : id;
  };
  const orgFill = {
    Anthropic: "#c45c26",
    OpenAI: "#3d6b9e",
    Google: "#2f7a5d",
    DeepSeek: "#3f6f8c",
    Tencent: "#1a66d1",
    Zhipu: "#4c51c8",
    Moonshot: "#6b4c9a",
    Alibaba: "#c2410c",
    xAI: "#52525b",
  };
  const orgOrder = [
    "Anthropic",
    "OpenAI",
    "Google",
    "DeepSeek",
    "Tencent",
    "Zhipu",
    "Moonshot",
    "Alibaba",
    "xAI",
  ];
  const shortModel = (m) =>
    m.name
      .replace("Claude ", "")
      .replace(" Thinking", " Think")
      .replace("OpenAI ", "")
      .replace(" (Oct 2024)", " Oct")
      .replace(" (Jun 2024)", " Jun")
      .replace(" (Operator)", "");
  const barPalette = ["#c45c26", "#3d6b9e", "#2f7a5d", "#6b4c9a", "#c2410c", "#1a66d1", "#4c51c8", "#52525b"];
  const HOWTO = {
    atlas: "图谱：类别、数据集、模型在同一张图。默认不画数据集–模型连线；悬停或选中节点才显示对应连线。上方按领域或机构筛选，点模型可只看相关数据集。悬停数据集看说明并点进去打开图表。",
    single: "图表：下拉切换领域和数据集。右下角「返回图谱」随时回到图谱。要公平对比多个模型，切到「交集对比」。",
    intersect: "交集对比：勾选至少 2 个模型。只要某数据集在其中 ≥2 个模型上有分，就会进入对比；缺成绩显示为 —。同一数据集取该模型最高分。点表中数据集名可看单集详情。",
  };

  let view = "atlas";
  let chartMode = "single";
  let activeBenchId = D.benchmarks[0]?.id;
  let chartDomain = "all";
  let intersectModels = [];
  let intersectBenchSet = null;
  let showModelCatalog = false;
  let filter = { domain: null, org: null, model: null };
  let cam = { x: 0, y: 0, k: 1 };
  let frame = { w: 960, h: 560 };
  let panBound = false;
  let atlasLayout = null;

  const rows = D.benchmarks.flatMap((b) =>
    b.results.map((r) => ({ ...r, benchId: b.id, bench: b, model: modelOf(r.modelId) }))
  );

  function bestOf(b) {
    let pool = b.results;
    if (filter.model) {
      const mine = pool.filter((r) => r.modelId === filter.model);
      if (mine.length) pool = mine;
    } else if (filter.org) {
      const mine = pool.filter((r) => modelOf(r.modelId)?.org === filter.org);
      if (mine.length) pool = mine;
    }
    return pool.reduce((a, r) => (r.score > a.score ? r : a));
  }

  const leaders = D.benchmarks.map((b) => {
    const r = b.results.reduce((a, x) => (x.score > a.score ? x : a));
    return { bench: b, result: r, model: modelOf(r.modelId) };
  });
  const winCount = {};
  leaders.forEach((l) => { winCount[l.model.id] = (winCount[l.model.id] || 0) + 1; });
  const topWinner = D.models.filter((m) => winCount[m.id]).sort((a, b) => winCount[b.id] - winCount[a.id])[0];

  function recency(date) {
    if (!date || date === "ongoing") return "9999-99";
    const [y, m = "99"] = String(date).split("-");
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  function latestKey(dates) {
    return dates.map(recency).sort().at(-1) || "0000-00";
  }
  const newestBenches = [...D.benchmarks]
    .sort((a, b) => latestKey(b.results.map((r) => r.date).concat(String(b.year)))
      .localeCompare(latestKey(a.results.map((r) => r.date).concat(String(a.year)))))
    .map((b) => b.short);
  const newestModels = [...D.models]
    .sort((a, b) => latestKey(rows.filter((r) => r.modelId === b.id).map((r) => r.date))
      .localeCompare(latestKey(rows.filter((r) => r.modelId === a.id).map((r) => r.date))))
    .map((m) => shortModel(m));
  const preview = (arr) => `${arr.slice(0, 3).join(" · ")}${arr.length ? " …" : ""}`;

  function applyCam() {
    $("atlas").setAttribute("viewBox", `${cam.x} ${cam.y} ${frame.w / cam.k} ${frame.h / cam.k}`);
  }

  function fitCam(w, h) {
    const vw = Math.min(Math.max(w + 28, 900), 1280);
    const vh = Math.max(h + 20, 520);
    frame = { w: vw, h: vh };
    cam = { x: w < vw ? (w - vw) / 2 : 0, y: 0, k: 1 };
    applyCam();
  }

  function bindPanZoom() {
    if (panBound) return;
    panBound = true;
    const svg = $("atlas");
    svg.onwheel = (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mx = cam.x + ((e.clientX - rect.left) / rect.width) * (frame.w / cam.k);
      const my = cam.y + ((e.clientY - rect.top) / rect.height) * (frame.h / cam.k);
      const next = Math.min(2.8, Math.max(0.35, cam.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      cam.x = mx - ((e.clientX - rect.left) / rect.width) * (frame.w / next);
      cam.y = my - ((e.clientY - rect.top) / rect.height) * (frame.h / next);
      cam.k = next;
      applyCam();
    };
    let drag = null;
    svg.onpointerdown = (e) => {
      if (e.target.closest(".node")) return;
      drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
      svg.setPointerCapture(e.pointerId);
    };
    svg.onpointermove = (e) => {
      if (!drag) return;
      const rect = svg.getBoundingClientRect();
      cam.x = drag.cx - ((e.clientX - drag.x) / rect.width) * (frame.w / cam.k);
      cam.y = drag.cy - ((e.clientY - drag.y) / rect.height) * (frame.h / cam.k);
      applyCam();
    };
    svg.onpointerup = () => { drag = null; };
  }

  function setHowto() {
    $("howto").textContent = HOWTO[view === "atlas" ? "atlas" : chartMode];
  }

  function setChartMode(next) {
    chartMode = next;
    if (chartMode === "intersect") seedIntersectIfNeeded();
    document.querySelectorAll("[data-chart-mode]").forEach((b) =>
      b.classList.toggle("is-on", b.dataset.chartMode === chartMode)
    );
    $("chart-single").classList.toggle("is-on", chartMode === "single");
    $("chart-intersect").classList.toggle("is-on", chartMode === "intersect");
    setHowto();
    renderChart();
  }

  function setView(next) {
    view = next;
    document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("is-on", b.dataset.view === view));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-on", v.id === `view-${view}`));
    $("back-atlas").hidden = view !== "chart";
    setHowto();
    if (view === "chart") renderChart();
    else drawAtlas();
  }

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.onclick = () => setView(btn.dataset.view);
  });
  document.querySelectorAll("[data-chart-mode]").forEach((btn) => {
    btn.onclick = () => setChartMode(btn.dataset.chartMode);
  });
  $("back-atlas").onclick = () => setView("atlas");

  function openChart(id) {
    activeBenchId = id;
    const b = benchOf(activeBenchId);
    chartDomain = b?.domainIds[0] || "all";
    chartMode = "single";
    setView("chart");
  }

  function visibleSet() {
    let benches = D.benchmarks;
    if (filter.domain) benches = benches.filter((b) => b.domainIds.includes(filter.domain));
    if (filter.org) {
      benches = benches.filter((b) => b.results.some((r) => modelOf(r.modelId)?.org === filter.org));
    }
    if (filter.model) {
      benches = benches.filter((b) => b.results.some((r) => r.modelId === filter.model));
    }
    let models = D.models.filter((m) => benches.some((b) => b.results.some((r) => r.modelId === m.id)));
    if (filter.org) models = models.filter((m) => m.org === filter.org);
    if (filter.model) models = models.filter((m) => m.id === filter.model);
    const used = new Set();
    benches.forEach((b) => b.domainIds.forEach((id) => used.add(id)));
    const domains = D.taxonomy.domains.filter((d) => used.has(d.id) && (!filter.domain || d.id === filter.domain));
    return { domains, benches, models };
  }

  function renderStats() {
    $("stats").innerHTML = `
      <div class="stat">
        <div class="k">数据集</div>
        <div class="n">${D.benchmarks.length}</div>
        <div class="d">${preview(newestBenches)}</div>
      </div>
      <div class="stat">
        <div class="k">模型数</div>
        <div class="n">${D.models.length}</div>
        <div class="d">${preview(newestModels)}</div>
      </div>
      <div class="stat">
        <div class="k">第一名最多</div>
        <div class="n">${winCount[topWinner.id]}/${D.benchmarks.length}</div>
        <div class="d">${topWinner.name}</div>
      </div>`;
  }

  function chip(type, id, label, on) {
    return `<button class="chip${on ? " is-on" : ""}" data-type="${type}" data-id="${id || ""}">${label}</button>`;
  }

  function renderHlFilters() {
    const orgs = [...new Set(D.models.map((m) => m.org))];
    orgs.sort((a, b) => {
      const ia = orgOrder.indexOf(a), ib = orgOrder.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const none = !filter.domain && !filter.org && !filter.model;
    const modelChip = filter.model
      ? `<div class="filter-row"><span class="k">模型</span>${chip("model", filter.model, shortModel(modelOf(filter.model)), true)}</div>`
      : "";
    $("hl-filters").innerHTML = `
      <div class="filter-row">
        <span class="k">筛选</span>
        ${chip("all", "", "全部", none)}
      </div>
      <div class="filter-row">
        <span class="k">领域</span>
        ${D.taxonomy.domains.map((d) => chip("domain", d.id, d.label, filter.domain === d.id)).join("")}
      </div>
      <div class="filter-row">
        <span class="k">机构</span>
        ${orgs.map((o) => chip("org", o, o, filter.org === o)).join("")}
      </div>
      ${modelChip}`;
    $("hl-filters").onclick = (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      const type = btn.dataset.type;
      const id = btn.dataset.id || null;
      if (type === "all") filter = { domain: null, org: null, model: null };
      else if (type === "domain") filter.domain = filter.domain === id ? null : id;
      else if (type === "org") filter.org = filter.org === id ? null : id;
      else if (type === "model") filter.model = filter.model === id ? null : id;
      drawAtlas();
    };
  }

  function groupedOrgs(models) {
    const seen = [];
    models.forEach((m) => { if (!seen.includes(m.org)) seen.push(m.org); });
    seen.sort((a, b) => {
      const ia = orgOrder.indexOf(a), ib = orgOrder.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return seen.map((org) => ({ org, models: models.filter((m) => m.org === org) }));
  }

  function mlinkEl(p, q, benchId, modelId) {
    return `<path class="mlink" data-bench="${benchId}" data-model="${modelId}" d="M${p.x},${p.y + 18} C${p.x},${p.y + 48} ${q.x},${q.y - 36} ${q.x},${q.y - 12}" fill="none" stroke="#c45c26" stroke-width="1.4"/>`;
  }

  function selectedMlinkOpts() {
    if (filter.model) return { modelId: filter.model };
    if (filter.org) return { org: filter.org };
    return {};
  }

  function paintMlinks(opts = {}) {
    const g = document.getElementById("atlas-mlinks");
    if (!g || !atlasLayout) return;
    const { benchId, modelId, org } = opts;
    if (!benchId && !modelId && !org) {
      g.innerHTML = "";
      return;
    }
    const { bp, mp, benches } = atlasLayout;
    const out = [];
    const seen = new Set();
    benches.forEach((b) => {
      if (benchId && b.id !== benchId) return;
      const p = bp[b.id];
      if (!p) return;
      [...new Set(b.results.map((r) => r.modelId))].forEach((mid) => {
        if (modelId && mid !== modelId) return;
        if (org && modelOf(mid)?.org !== org) return;
        const q = mp[mid];
        if (!q) return;
        const key = `${b.id}-${mid}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(mlinkEl(p, q, b.id, mid));
      });
    });
    g.innerHTML = out.join("");
  }

  function placeModels(groups, startY, padX) {
    const perRow = 8;
    const mGapX = 104;
    const mGapY = 56;
    const clusterGap = 36;
    const bigCut = 6;
    const maxX = padX + perRow * mGapX;
    const mp = {};
    const labels = [];
    let y = startY;
    let maxModelX = padX;

    const placeDedicated = (g) => {
      labels.push({ org: g.org, x: padX, y: y + 12 });
      y += 22;
      g.models.forEach((m, i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const x = padX + col * mGapX;
        const my = y + row * mGapY;
        mp[m.id] = { x, y: my };
        maxModelX = Math.max(maxModelX, x);
      });
      y += Math.ceil(g.models.length / perRow) * mGapY + 10;
    };

    groups.filter((g) => g.models.length >= bigCut).forEach(placeDedicated);

    const small = groups.filter((g) => g.models.length < bigCut);
    if (small.length) {
      let x = padX;
      small.forEach((g) => {
        const w = Math.max(g.models.length, 1) * mGapX;
        if (x > padX && x + w > maxX + 8) {
          x = padX;
          y += mGapY + 28;
        }
        labels.push({ org: g.org, x: x, y: y + 12 });
        const my = y + 26;
        g.models.forEach((m, i) => {
          const mx = x + i * mGapX;
          mp[m.id] = { x: mx, y: my };
          maxModelX = Math.max(maxModelX, mx);
        });
        x += w + clusterGap;
      });
      y += mGapY + 28;
    }

    return { mp, labels, bottom: y, maxModelX };
  }

  function drawAtlas() {
    $("tip").hidden = true;
    renderHlFilters();
    const { domains, benches, models } = visibleSet();
    const buckets = Object.fromEntries(domains.map((d) => [d.id, []]));
    benches.forEach((b) => {
      const primary = b.domainIds.find((id) => buckets[id]) || domains[0]?.id;
      if (primary) buckets[primary].push(b);
    });

    const COLS = 4;
    const CELL_W = 200;
    const CELL_H = 82;
    const STAGGER = 36;
    const padX = 48;
    const domainHead = 38;
    const sectionGap = 6;
    const groups = groupedOrgs(models);

    const bp = {};
    const dx = {};
    const dy = {};
    const placeDomain = (d, left, top, cols) => {
      const list = buckets[d.id] || [];
      dy[d.id] = top;
      dx[d.id] = left + (cols * CELL_W) / 2;
      const benchY0 = top + domainHead;
      list.forEach((b, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        bp[b.id] = {
          x: left + col * CELL_W + CELL_W / 2 + (row % 2 === 1 ? STAGGER : 0),
          y: benchY0 + row * CELL_H,
        };
      });
      return domainHead + Math.max(1, Math.ceil(Math.max(list.length, 1) / cols)) * CELL_H;
    };

    let y = 28;
    const large = domains.filter((d) => (buckets[d.id] || []).length >= 3);
    const small = domains.filter((d) => (buckets[d.id] || []).length < 3);
    large.forEach((d) => {
      y += placeDomain(d, padX, y, COLS) + sectionGap;
    });
    if (small.length) {
      let x = padX;
      let rowH = 0;
      const rowLimit = padX + COLS * CELL_W + STAGGER;
      small.forEach((d) => {
        const n = Math.max((buckets[d.id] || []).length, 1);
        const cols = Math.min(2, n);
        const w = cols * CELL_W + 16;
        if (x > padX && x + w > rowLimit) {
          y += rowH + sectionGap;
          x = padX;
          rowH = 0;
        }
        rowH = Math.max(rowH, placeDomain(d, x, y, cols));
        x += w + 28;
      });
      y += rowH + sectionGap;
    }

    const placed = placeModels(groups, y + 6, padX);
    const mp = placed.mp;
    const contentW = Math.max(padX + COLS * CELL_W + STAGGER + 40, placed.maxModelX + 80, 720);
    const contentH = Math.max(placed.bottom + 20, 420);

    const domainLinks = benches.flatMap((b) =>
      b.domainIds.map((id) => {
        if (!dx[id] || !bp[b.id]) return "";
        const p = bp[b.id];
        return `<path d="M${dx[id]},${dy[id] + 14} C${dx[id]},${dy[id] + 40} ${p.x},${p.y - 44} ${p.x},${p.y - 18}" fill="none" stroke="#b7d0c4" stroke-width="1.6"/>`;
      })
    );

    const domainNodes = domains.map((d) => {
      const w = Math.max(92, d.label.length * 14 + 22);
      return `<g class="node" data-kind="domain" data-id="${d.id}" transform="translate(${dx[d.id]},${dy[d.id]})">
        <rect x="${-w / 2}" y="-14" width="${w}" height="28" rx="14" fill="#2f7a5d"></rect>
        <text y="5" text-anchor="middle" fill="#fff" font-size="13">${esc(d.label)}</text>
      </g>`;
    });

    const benchNodes = benches.map((b) => {
      const p = bp[b.id];
      const top = bestOf(b);
      const m = modelOf(top.modelId);
      return `<g class="node" data-kind="bench" data-id="${b.id}" transform="translate(${p.x},${p.y})">
        <circle r="17" fill="#c45c26"></circle>
        <text y="36" text-anchor="middle" fill="#1f1e1b" font-size="13">${esc(b.short)}</text>
        <text y="54" text-anchor="middle" fill="#5e5c56" font-size="11">${esc(shortModel(m))} ${fmt(top.score)}</text>
      </g>`;
    });

    const orgLabels = placed.labels.map((g) =>
      `<text x="${g.x}" y="${g.y}" fill="#8a887f" font-size="11" letter-spacing="0.08em">${esc(g.org.toUpperCase())}</text>`
    );

    const modelNodes = models.map((m) => {
      const p = mp[m.id];
      if (!p) return "";
      return `<g class="node" data-kind="model" data-id="${m.id}" transform="translate(${p.x},${p.y})">
        <rect x="-10" y="-10" width="20" height="20" rx="4" fill="${orgFill[m.org] || "#888"}"></rect>
        <text y="28" text-anchor="middle" fill="#1f1e1b" font-size="12">${esc(shortModel(m))}</text>
      </g>`;
    });

    const empty = !benches.length
      ? `<text x="${contentW / 2}" y="200" text-anchor="middle" fill="#5e5c56" font-size="16">没有匹配的节点</text>`
      : "";

    $("atlas").innerHTML = `${domainLinks.join("")}<g id="atlas-mlinks"></g>${domainNodes.join("")}${benchNodes.join("")}${orgLabels.join("")}${modelNodes.join("")}${empty}`;
    atlasLayout = { bp, mp, benches, models };
    paintMlinks(selectedMlinkOpts());
    fitCam(contentW, contentH);
    bindAtlasEvents();
    bindPanZoom();
  }

  function bindAtlasEvents() {
    const svg = $("atlas");
    const tip = $("tip");
    svg.onclick = (e) => {
      const g = e.target.closest(".node");
      if (!g) return;
      const kind = g.dataset.kind;
      const id = g.dataset.id;
      if (kind === "domain") {
        filter.domain = filter.domain === id ? null : id;
        drawAtlas();
        return;
      }
      if (kind === "model") {
        filter.model = filter.model === id ? null : id;
        drawAtlas();
        return;
      }
      if (kind === "bench") openChart(id);
    };
    const setEdgeHover = (kind, id) => {
      if (kind === "bench") paintMlinks({ benchId: id });
      else if (kind === "model") paintMlinks({ modelId: id });
      else paintMlinks(selectedMlinkOpts());
    };
    svg.onmouseover = (e) => {
      const g = e.target.closest(".node");
      if (!g) return;
      const kind = g.dataset.kind;
      const id = g.dataset.id;
      let html = "";
      if (kind === "domain") {
        const d = D.taxonomy.domains.find((x) => x.id === id);
        const n = D.benchmarks.filter((b) => b.domainIds.includes(id)).length;
        html = `<h3>${esc(d.label)}</h3><p>${esc(d.desc)}</p><p>${n} 个数据集。点击可筛选此类。</p>`;
        setEdgeHover(null, null);
      } else if (kind === "bench") {
        const b = benchOf(id);
        html = `<h3>${esc(b.name)}</h3>
          <p><b>领域</b>${esc(b.domainNeed)}</p>
          <p><b>评估</b>${esc(b.evaluates)}</p>
          <p><b>为何重要</b>${esc(b.whyImportant)}</p>
          <p><b>指标</b>${esc(b.metric)}。${esc(b.metricExplain)}</p>
          <p class="cta"><strong>点我查看详细表格数据</strong></p>`;
        setEdgeHover("bench", id);
      } else if (kind === "model") {
        const m = modelOf(id);
        const mine = rows.filter((r) => r.modelId === id);
        const best = [...mine].sort((a, b) => b.score - a.score)[0];
        const n = new Set(mine.map((r) => r.benchId)).size;
        html = `<h3>${esc(m.name)}</h3>
          <p><b>机构</b>${esc(m.org)}</p>
          <p>出现在 ${n} 个数据集。最高 ${esc(best.bench.short)} ${fmt(best.score)}。点击可筛选相关数据集。</p>`;
        setEdgeHover("model", id);
      }
      if (!html) return;
      tip.hidden = false;
      tip.innerHTML = html;
    };
    svg.onmousemove = (e) => {
      if (tip.hidden) return;
      const pad = 16;
      let x = e.clientX + 18, y = e.clientY + 18;
      const w = tip.offsetWidth || 320, h = tip.offsetHeight || 180;
      if (x + w > window.innerWidth - pad) x = e.clientX - w - 12;
      if (y + h > window.innerHeight - pad) y = e.clientY - h - 12;
      tip.style.left = `${Math.max(pad, x)}px`;
      tip.style.top = `${Math.max(pad, y)}px`;
    };
    svg.onmouseout = (e) => {
      if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
        tip.hidden = true;
        setEdgeHover(null, null);
      }
      if (e.target.closest(".node") && !e.relatedTarget?.closest(".node")) {
        tip.hidden = true;
        setEdgeHover(null, null);
      }
    };
  }

  function benchesForChart() {
    if (chartDomain === "all") return D.benchmarks;
    return D.benchmarks.filter((b) => b.domainIds.includes(chartDomain));
  }

  function bestRow(bench, modelId) {
    const mine = bench.results.filter((r) => r.modelId === modelId);
    if (!mine.length) return null;
    return mine.reduce((a, r) => (r.score > a.score ? r : a));
  }

  function overlapBenches(modelIds) {
    if (modelIds.length < 2) return [];
    return D.benchmarks.filter((b) => {
      let n = 0;
      for (const id of modelIds) {
        if (bestRow(b, id)) n += 1;
        if (n >= 2) return true;
      }
      return false;
    });
  }

  function topModelsOf(benchId, n = 3) {
    const list = rows.filter((r) => r.benchId === benchId).sort((a, c) => c.score - a.score);
    const ids = [];
    list.forEach((r) => { if (!ids.includes(r.modelId)) ids.push(r.modelId); });
    return ids.slice(0, n);
  }

  function seedIntersectIfNeeded() {
    if (intersectModels.length) return;
    intersectModels = topModelsOf(activeBenchId, 3);
    intersectBenchSet = null;
  }

  function chosenIntersectBenches(common) {
    if (!intersectBenchSet) return common;
    return common.filter((b) => intersectBenchSet.has(b.id));
  }

  function renderChart() {
    document.querySelectorAll("[data-chart-mode]").forEach((b) =>
      b.classList.toggle("is-on", b.dataset.chartMode === chartMode)
    );
    $("chart-single").classList.toggle("is-on", chartMode === "single");
    $("chart-intersect").classList.toggle("is-on", chartMode === "intersect");
    if (chartMode === "intersect") renderIntersect();
    else renderSingleChart();
  }

  function renderSingleChart() {
    const listB = benchesForChart();
    if (!listB.some((b) => b.id === activeBenchId)) activeBenchId = listB[0]?.id;
    const b = benchOf(activeBenchId) || D.benchmarks[0];
    activeBenchId = b.id;
    const list = rows.filter((r) => r.benchId === b.id).sort((a, c) => c.score - a.score);

    $("chart-filters").innerHTML = `
      <label>领域
        <select class="pick" id="chart-domain">
          <option value="all"${chartDomain === "all" ? " selected" : ""}>全部领域</option>
          ${D.taxonomy.domains.map((d) =>
            `<option value="${d.id}"${chartDomain === d.id ? " selected" : ""}>${esc(d.label)}</option>`
          ).join("")}
        </select>
      </label>
      <label>数据集
        <select class="pick" id="chart-bench">
          ${listB.map((x) =>
            `<option value="${x.id}"${x.id === b.id ? " selected" : ""}>${esc(x.name)}</option>`
          ).join("")}
        </select>
      </label>`;
    $("chart-domain").onchange = (e) => {
      chartDomain = e.target.value;
      renderChart();
    };
    $("chart-bench").onchange = (e) => {
      activeBenchId = e.target.value;
      renderChart();
    };

    $("chart-head").innerHTML = `<div class="chart-head"><h2>${esc(b.name)}</h2>
      <div class="meta">
        <p><b>领域</b>${esc(b.domainNeed)}</p>
        <p><b>评估</b>${esc(b.evaluates)}</p>
        <p><b>为何重要</b>${esc(b.whyImportant)}</p>
      </div></div>
      <div class="metric-box"><strong>指标 ${esc(b.metric)}</strong> — ${esc(b.metricExplain)}</div>`;

    $("axis-label").textContent = `横轴 = ${b.metric}（越高越好）`;

    const W = 960, left = 250, right = 80, top = 14, bot = 14;
    const H = Math.max(160, 28 + list.length * 40);
    const inner = H - top - bot;
    const n = Math.max(list.length, 1);
    const gap = inner / n;
    const bars = list.map((r, i) => {
      const y = top + i * gap + gap * 0.18;
      const h = Math.max(gap * 0.52, 10);
      const w = ((W - left - right) * r.score) / 100;
      const label = `${r.model.name}${r.subset ? " · " + r.subset : ""}`;
      return `<text x="${left - 12}" y="${y + h * 0.78}" text-anchor="end" font-size="14" fill="#5e5c56">${label}</text>
        <rect x="${left}" y="${y}" width="${w}" height="${h}" rx="4" fill="#c45c26" opacity="0.9"></rect>
        <text x="${left + w + 8}" y="${y + h * 0.78}" font-size="14" font-family="IBM Plex Mono" fill="#2f7a5d">${fmt(r.score)}</text>`;
    }).join("");
    $("bars").setAttribute("viewBox", `0 0 960 ${H}`);
    $("bars").innerHTML = bars || `<text x="480" y="70" text-anchor="middle" font-size="16" fill="#5e5c56">无数据</text>`;

    $("score-body").innerHTML = list.map((r) => `<tr>
      <td>${r.model.name}<br><span class="muted">${r.model.org}</span></td>
      <td class="muted">${r.harness}</td>
      <td class="col-metric">${b.metric}${r.subset ? " · " + r.subset : ""}</td>
      <td class="score">${fmt(r.score)}</td>
      <td class="date">${r.date || "—"}</td>
      <td>${srcLink(r.sourceId)}</td>
    </tr>`).join("");
  }

  function hideIntersectViz(on) {
    $("intersect-stats").hidden = on;
    $("intersect-axis").hidden = on;
    $("intersect-bars").hidden = on;
    $("intersect-table-wrap").hidden = on;
  }

  function renderIntersect() {
    const selected = new Set(intersectModels);
    const groups = groupedOrgs(D.models);
    const common = overlapBenches(intersectModels);
    const chosen = chosenIntersectBenches(common);
    const activeBench = benchOf(activeBenchId);
    const hint = intersectModels.length < 2
      ? "至少选 2 个模型。默认用当前数据集前三名，便于马上看到可对比的数据集。"
      : common.length
        ? `这 ${intersectModels.length} 个模型在 ${common.length} 个数据集上至少两两有分。去掉芯片可缩小范围。`
        : "这组模型没有任何数据集同时覆盖其中 2 个及以上，试着再选几个模型。";

    const catalogOpen = showModelCatalog || intersectModels.length < 2;
    $("intersect-pick").innerHTML = `
      <div class="pick-card">
        <p class="hint">${hint}</p>
        <div class="pick-actions">
          <button type="button" class="chip" data-act="seed">用「${esc(activeBench?.short || "当前数据集")}」前三名</button>
          <button type="button" class="chip" data-act="clear">清空模型</button>
          <button type="button" class="chip${catalogOpen ? " is-on" : ""}" data-act="catalog">${catalogOpen ? "收起模型列表" : "添加 / 更换模型"}</button>
        </div>
        <div class="filter-row">
          <span class="k">已选</span>
          ${intersectModels.length
            ? intersectModels.map((id) => chip("imodel", id, shortModel(modelOf(id)), true)).join("")
            : `<span class="muted">尚未选择</span>`}
        </div>
        ${common.length ? `
          <div class="filter-row">
            <span class="k">数据集</span>
            ${common.map((b) => chip("ibench", b.id, b.short, !intersectBenchSet || intersectBenchSet.has(b.id))).join("")}
          </div>
        ` : ""}
        ${catalogOpen ? `
          <div class="model-catalog">
            ${groups.map((g) => `
              <div class="filter-row">
                <span class="k">${esc(g.org)}</span>
                ${g.models.map((m) => chip("imodel", m.id, shortModel(m), selected.has(m.id))).join("")}
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>`;

    $("intersect-pick").onclick = (e) => {
      const act = e.target.closest("[data-act]");
      if (act) {
        if (act.dataset.act === "clear") {
          intersectModels = [];
          intersectBenchSet = null;
          showModelCatalog = true;
        } else if (act.dataset.act === "seed") {
          intersectModels = topModelsOf(activeBenchId, 3);
          intersectBenchSet = null;
          showModelCatalog = false;
        } else if (act.dataset.act === "catalog") {
          showModelCatalog = !showModelCatalog;
        }
        renderIntersect();
        return;
      }
      const btn = e.target.closest(".chip");
      if (!btn) return;
      const type = btn.dataset.type;
      const id = btn.dataset.id;
      if (type === "imodel") {
        const i = intersectModels.indexOf(id);
        if (i >= 0) intersectModels.splice(i, 1);
        else intersectModels.push(id);
        intersectBenchSet = null;
        renderIntersect();
      } else if (type === "ibench") {
        const on = new Set((intersectBenchSet ? common.filter((b) => intersectBenchSet.has(b.id)) : common).map((b) => b.id));
        if (on.has(id)) on.delete(id);
        else on.add(id);
        intersectBenchSet = on.size === common.length ? null : on;
        renderIntersect();
      }
    };

    if (intersectModels.length < 2 || !chosen.length) {
      hideIntersectViz(true);
      if (intersectModels.length >= 2 && !common.length) {
        $("intersect-stats").hidden = false;
        $("intersect-stats").innerHTML = `<div class="intersect-empty">没有至少覆盖 2 个已选模型的数据集。</div>`;
      } else if (intersectModels.length >= 2 && common.length && !chosen.length) {
        $("intersect-stats").hidden = false;
        $("intersect-stats").innerHTML = `<div class="intersect-empty">勾选至少一个数据集以对比。</div>`;
      } else {
        $("intersect-stats").innerHTML = "";
      }
      $("intersect-axis").textContent = "";
      $("intersect-bars").innerHTML = "";
      $("intersect-head").innerHTML = "";
      $("intersect-body").innerHTML = "";
      return;
    }

    hideIntersectViz(false);
    const colors = Object.fromEntries(intersectModels.map((id, i) => [id, barPalette[i % barPalette.length]]));
    const wins = Object.fromEntries(intersectModels.map((id) => [id, 0]));
    const sums = Object.fromEntries(intersectModels.map((id) => [id, 0]));
    const counts = Object.fromEntries(intersectModels.map((id) => [id, 0]));
    const cells = chosen.map((b) => {
      const scores = intersectModels.map((id) => ({ id, row: bestRow(b, id) }));
      const present = scores.filter((s) => s.row);
      const max = Math.max(...present.map((s) => s.row.score));
      present.forEach((s) => {
        sums[s.id] += s.row.score;
        counts[s.id] += 1;
        if (s.row.score === max) wins[s.id] += 1;
      });
      return { bench: b, scores, present, max };
    });
    const avgs = Object.fromEntries(intersectModels.map((id) => [id, counts[id] ? sums[id] / counts[id] : null]));
    const ranked = [...intersectModels].filter((id) => counts[id]);
    const winLead = [...ranked].sort((a, b) => wins[b] - wins[a] || (avgs[b] ?? 0) - (avgs[a] ?? 0))[0];
    const avgLead = [...ranked].sort((a, b) => avgs[b] - avgs[a])[0];
    const metrics = new Set(chosen.map((b) => b.metric));
    const fmtAvg = (id) => (avgs[id] == null ? "—" : fmt(avgs[id]));

    $("intersect-stats").innerHTML = `
      <div class="stat">
        <div class="k">可对比数据集</div>
        <div class="n">${chosen.length}${chosen.length !== common.length ? `/${common.length}` : ""}</div>
        <div class="d">${chosen.map((b) => b.short).slice(0, 3).join(" · ")}${chosen.length > 3 ? " …" : ""}</div>
      </div>
      <div class="stat">
        <div class="k">领先次数</div>
        <div class="n">${wins[winLead]}/${chosen.length}</div>
        <div class="d">${intersectModels.map((id) => `${shortModel(modelOf(id))} ${wins[id]}`).join(" · ")}</div>
      </div>
      <div class="stat">
        <div class="k">均分最高</div>
        <div class="n">${fmtAvg(avgLead)}</div>
        <div class="d">${intersectModels.map((id) => `${shortModel(modelOf(id))} ${fmtAvg(id)}`).join(" · ")}</div>
      </div>`;

    $("intersect-axis").textContent = metrics.size > 1
      ? "每个数据集至少 2 个已选模型有分才会出现。缺成绩不画条、表中为 —。均分只计有分的集；指标不完全相同，仅供并置。"
      : `每个数据集至少 2 个已选模型有分才会出现。缺成绩不画条。横轴 = ${[...metrics][0]}（越高越好）`;

    const W = 960, left = 186, right = 72, top = 10, bot = 12;
    const rowH = 24;
    const headH = 22;
    const groupGap = 14;
    let yCursor = top;
    const innerW = W - left - right;
    const svg = cells.map((cell) => {
      const y0 = yCursor;
      const bars = cell.present.map((s, j) => {
        const y = y0 + headH + j * rowH;
        const h = 14;
        const w = Math.max((innerW * s.row.score) / 100, 0);
        const best = s.row.score === cell.max;
        return `<text x="${left - 10}" y="${y + 12}" text-anchor="end" font-size="12" fill="#5e5c56">${esc(shortModel(modelOf(s.id)))}</text>
          <rect x="${left}" y="${y}" width="${w}" height="${h}" rx="3" fill="${colors[s.id]}" opacity="${best ? 0.95 : 0.72}"></rect>
          <text x="${left + w + 8}" y="${y + 12}" font-size="12" font-family="IBM Plex Mono" fill="${best ? "#2f7a5d" : "#5e5c56"}">${fmt(s.row.score)}</text>`;
      }).join("");
      yCursor += headH + cell.present.length * rowH + groupGap;
      return `<text x="${left}" y="${y0 + 14}" font-size="13" fill="#1f1e1b"><tspan font-weight="600">${esc(cell.bench.short)}</tspan><tspan fill="#8a887f"> · ${esc(cell.bench.metric)}</tspan></text>
        ${bars}`;
    }).join("");
    const H = Math.max(160, yCursor + bot);
    $("intersect-bars").setAttribute("viewBox", `0 0 960 ${H}`);
    $("intersect-bars").innerHTML = svg;

    $("intersect-head").innerHTML = `<tr>
      <th>数据集</th>
      <th>指标</th>
      ${intersectModels.map((id) => `<th><i class="swatch" style="background:${colors[id]}"></i>${esc(shortModel(modelOf(id)))}</th>`).join("")}
    </tr>`;
    $("intersect-body").innerHTML = cells.map((cell) => `<tr>
      <td class="bench-link" data-open="${cell.bench.id}">${esc(cell.bench.short)}</td>
      <td class="muted">${esc(cell.bench.metric)}</td>
      ${cell.scores.map((s) => s.row
        ? `<td class="score${s.row.score === cell.max ? " is-best" : ""}">${fmt(s.row.score)}</td>`
        : `<td class="muted">—</td>`).join("")}
    </tr>`).join("") + `<tr>
      <td>均分</td>
      <td class="muted">${metrics.size > 1 ? "有分的集" : esc([...metrics][0])}</td>
      ${intersectModels.map((id) => {
        const best = avgs[id] != null && id === avgLead;
        return `<td class="score${best ? " is-best" : ""}">${fmtAvg(id)}</td>`;
      }).join("")}
    </tr>`;

    $("intersect-body").onclick = (e) => {
      const cell = e.target.closest("[data-open]");
      if (!cell) return;
      openChart(cell.dataset.open);
    };
  }

  renderStats();
  drawAtlas();
})();
