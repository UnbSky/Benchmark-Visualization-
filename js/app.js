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
  const orgFill = { Anthropic: "#c45c26", OpenAI: "#3d6b9e", Google: "#2f7a5d" };
  const orgOrder = ["Anthropic", "OpenAI", "Google"];
  const shortModel = (m) =>
    m.name
      .replace("Claude ", "")
      .replace(" Thinking", " Think")
      .replace("OpenAI ", "")
      .replace(" (Oct 2024)", " Oct")
      .replace(" (Jun 2024)", " Jun")
      .replace(" (Operator)", "");

  let view = "atlas";
  let activeBenchId = D.benchmarks[0]?.id;
  let chartDomain = "all";
  let filter = { domain: null, org: null, model: null };
  let cam = { x: 0, y: 0, k: 1 };
  let frame = { w: 960, h: 560 };
  let panBound = false;

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
    const vw = Math.min(Math.max(w + 36, 980), 1280);
    const vh = Math.min(Math.max(h + 16, 560), 860);
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

  function setView(next) {
    view = next;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("is-on", b.dataset.view === view));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-on", v.id === `view-${view}`));
    if (view === "chart") renderChart();
    else drawAtlas();
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.onclick = () => setView(btn.dataset.view);
  });

  function openChart(id) {
    activeBenchId = id;
    const b = benchOf(activeBenchId);
    chartDomain = b?.domainIds[0] || "all";
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

  function drawAtlas() {
    $("tip").hidden = true;
    renderHlFilters();
    const { domains, benches, models } = visibleSet();
    const buckets = Object.fromEntries(domains.map((d) => [d.id, []]));
    benches.forEach((b) => {
      const primary = b.domainIds.find((id) => buckets[id]) || domains[0]?.id;
      if (primary) buckets[primary].push(b);
    });

    const nCol = Math.max(domains.length, 1);
    const colW = nCol <= 3 ? 280 : 268;
    const padX = 96;
    const domainY = 48;
    const benchY0 = 148;
    const benchGap = 96;
    const zig = 38;
    const maxRows = Math.max(1, ...domains.map((d) => buckets[d.id].length));
    const groups = groupedOrgs(models);
    const perRow = nCol <= 3 ? 7 : 8;
    const mGapX = 112;
    const mGapY = 54;
    const modelY0 = benchY0 + maxRows * benchGap + 36;

    const dx = {};
    const modelSpan = padX + Math.max(Math.min(models.length, perRow) - 1, 0) * mGapX;
    domains.forEach((d, i) => {
      dx[d.id] = nCol <= 2
        ? (modelSpan / (nCol + 1)) * (i + 1)
        : padX + i * colW;
    });
    const bp = {};
    domains.forEach((d) => {
      buckets[d.id].forEach((b, j) => {
        bp[b.id] = { x: dx[d.id] + (j % 2 === 0 ? -zig : zig), y: benchY0 + j * benchGap };
      });
    });
    const mp = {};
    let my = modelY0;
    let maxModelX = padX;
    groups.forEach((g) => {
      g.labelY = my;
      my += 26;
      g.models.forEach((m, i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const x = padX + col * mGapX;
        const y = my + row * mGapY;
        mp[m.id] = { x, y };
        maxModelX = Math.max(maxModelX, x);
      });
      my += Math.ceil(g.models.length / perRow) * mGapY + 8;
    });

    const contentW = Math.max(padX + nCol * colW, maxModelX + 80, 720);
    const contentH = Math.max(my + 24, 420);

    const domainLinks = benches.flatMap((b) =>
      b.domainIds.map((id) => {
        if (!dx[id] || !bp[b.id]) return "";
        const p = bp[b.id];
        return `<path d="M${dx[id]},${domainY + 16} C${dx[id]},${domainY + 70} ${p.x},${p.y - 56} ${p.x},${p.y - 18}" fill="none" stroke="#b7d0c4" stroke-width="1.6"/>`;
      })
    );

    const modelLinks = [];
    const seen = new Set();
    benches.forEach((b) => {
      const p = bp[b.id];
      if (!p) return;
      [...new Set(b.results.map((r) => r.modelId))].forEach((mid) => {
        const q = mp[mid];
        if (!q) return;
        const key = `${b.id}-${mid}`;
        if (seen.has(key)) return;
        seen.add(key);
        modelLinks.push(`<path class="mlink" data-bench="${b.id}" data-model="${mid}" d="M${p.x},${p.y + 18} C${p.x},${p.y + 52} ${q.x},${q.y - 40} ${q.x},${q.y - 12}" fill="none" stroke="#c45c26" stroke-width="1.4"/>`);
      });
    });

    const domainNodes = domains.map((d) => {
      const w = Math.max(92, d.label.length * 14 + 22);
      return `<g class="node" data-kind="domain" data-id="${d.id}" transform="translate(${dx[d.id]},${domainY})">
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

    const orgLabels = groups.map((g) =>
      `<text x="${padX - 8}" y="${g.labelY + 12}" fill="#8a887f" font-size="11" letter-spacing="0.08em">${esc(g.org.toUpperCase())}</text>`
    );

    const modelNodes = models.map((m) => {
      const p = mp[m.id];
      return `<g class="node" data-kind="model" data-id="${m.id}" transform="translate(${p.x},${p.y})">
        <rect x="-10" y="-10" width="20" height="20" rx="4" fill="${orgFill[m.org] || "#888"}"></rect>
        <text y="28" text-anchor="middle" fill="#1f1e1b" font-size="12">${esc(shortModel(m))}</text>
      </g>`;
    });

    const empty = !benches.length
      ? `<text x="${contentW / 2}" y="200" text-anchor="middle" fill="#5e5c56" font-size="16">没有匹配的节点</text>`
      : "";

    $("atlas").innerHTML = `${domainLinks.join("")}${modelLinks.join("")}${domainNodes.join("")}${benchNodes.join("")}${orgLabels.join("")}${modelNodes.join("")}${empty}`;
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
      svg.querySelectorAll(".mlink").forEach((el) => {
        const on = (kind === "bench" && el.dataset.bench === id)
          || (kind === "model" && el.dataset.model === id);
        el.classList.toggle("is-on", on);
      });
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

  function renderChart() {
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

  renderStats();
  drawAtlas();
})();
