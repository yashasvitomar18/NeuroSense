/* ==========================================================================
   NeuroSense — frontend application logic
   No build step, no framework: plain DOM + fetch, organized by concern.
   ========================================================================== */

const EMOTIONS = ["sadness", "joy", "love", "anger", "fear", "surprise"];
const EMOTION_COLORS = {
  sadness: "#4d7dfb", joy: "#f2b84b", love: "#ee7fa6",
  anger: "#ef5b48", fear: "#8c6bfb", surprise: "#4fd1e8",
};
const EMOJI = { sadness: "😢", joy: "😄", love: "❤️", anger: "😠", fear: "😨", surprise: "😲" };
const SAMPLES = [
  "I'm really excited about this opportunity!",
  "I feel completely exhausted today.",
  "I can't believe what just happened.",
  "I'm worried about tomorrow.",
  "I really love spending time with my family.",
];
const HISTORY_KEY = "neurosense_history_v1";
const MAX_HISTORY = 200;

/* ── Router ───────────────────────────────────────────────────────────── */
function goToRoute(route) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.getElementById(`page-${route}`).classList.add("active");
  document.querySelectorAll(".nav-links button").forEach((b) =>
    b.classList.toggle("active", b.dataset.route === route)
  );
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  if (route === "history") renderHistoryPage();
  if (route === "analytics") renderAnalyticsPage();
  if (route === "model") loadModelInfo();
}

document.querySelectorAll("[data-route]").forEach((el) => {
  el.addEventListener("click", () => goToRoute(el.dataset.route));
});

/* ── Toast ────────────────────────────────────────────────────────────── */
function toast(message, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.style.background = isError ? "rgba(239,91,72,0.16)" : "rgba(79,209,232,0.14)";
  el.style.border = `1px solid ${isError ? "rgba(239,91,72,0.4)" : "rgba(79,209,232,0.35)"}`;
  el.style.color = isError ? "#ffb3a5" : "#bdeef7";
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ── API layer ────────────────────────────────────────────────────────── */
const api = {
  async predict(text) {
    const res = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Request failed (${res.status})`);
    }
    return res.json();
  },
  async modelInfo() {
    const res = await fetch("/model-info");
    if (!res.ok) throw new Error("Could not load model info.");
    return res.json();
  },
};

/* ── History (localStorage) ──────────────────────────────────────────── */
const historyStore = {
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  },
  add(entry) {
    const all = this.getAll();
    all.unshift(entry);
    if (all.length > MAX_HISTORY) all.length = MAX_HISTORY;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
    } catch {
      /* storage full or unavailable — fail silently, prediction still shown */
    }
  },
  clear() {
    localStorage.removeItem(HISTORY_KEY);
  },
};

/* ── Sample chips ─────────────────────────────────────────────────────── */
const chipsWrap = document.getElementById("sample-chips");
SAMPLES.forEach((s) => {
  const chip = document.createElement("button");
  chip.className = "sample-chip";
  chip.textContent = `"${s}"`;
  chip.addEventListener("click", () => {
    document.getElementById("text-input").value = s;
    updateCharCount();
  });
  chipsWrap.appendChild(chip);
});

/* ── Textarea char count ──────────────────────────────────────────────── */
const textInput = document.getElementById("text-input");
const charCountEl = document.getElementById("char-count");
function updateCharCount() {
  charCountEl.textContent = textInput.value.length;
}
textInput.addEventListener("input", updateCharCount);

/* ── Pipeline animation ───────────────────────────────────────────────── */
const STAGES = ["input", "token", "embed", "gru", "dense", "output"];
const CONNECTORS = ["c1", "c2", "c3", "c4", "c5"];
const STAGE_MESSAGES = {
  input: "READING INPUT...",
  token: "TOKENIZING...",
  embed: "ENCODING...",
  gru: "RUNNING BiGRU...",
  dense: "CALCULATING PROBABILITIES...",
  output: "DONE",
};

function resetPipeline() {
  document.querySelectorAll(".pipe-dot, .pipe-label").forEach((el) => el.classList.remove("lit"));
  document.querySelectorAll(".pipe-connector").forEach((el) => el.classList.remove("active"));
  document.getElementById("pipeline-status").textContent = "";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function playPipelineAnimation() {
  resetPipeline();
  const statusEl = document.getElementById("pipeline-status");
  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    document.querySelectorAll(`[data-stage="${stage}"]`).forEach((el) => el.classList.add("lit"));
    statusEl.textContent = STAGE_MESSAGES[stage];
    if (CONNECTORS[i]) {
      document.querySelector(`[data-stage="${CONNECTORS[i]}"]`).classList.add("active");
    }
    await sleep(220);
  }
}

/* ── Result rendering ─────────────────────────────────────────────────── */
function confidenceTag(conf) {
  if (conf >= 0.75) return "HIGH CONFIDENCE";
  if (conf >= 0.45) return "MODERATE CONFIDENCE";
  return "LOW CONFIDENCE";
}

function renderGauge(confidence) {
  const circumference = 2 * Math.PI * 68;
  const arc = document.getElementById("gauge-arc");
  const offset = circumference * (1 - confidence);
  arc.style.transition = "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1), stroke 0.4s";
  requestAnimationFrame(() => {
    arc.style.strokeDashoffset = offset;
  });
  const pct = (confidence * 100).toFixed(1);
  document.getElementById("gauge-value").textContent = `${pct}%`;
  document.getElementById("gauge-tag").textContent = confidenceTag(confidence);
}

function renderBars(container, probabilities, animate = true) {
  const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "bars";
  sorted.forEach(([emotion, prob]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label">${emotion}</div>
      <div class="bar-track"><div class="bar-fill" style="background:${EMOTION_COLORS[emotion]}"></div></div>
      <div class="bar-pct">${(prob * 100).toFixed(2)}%</div>
    `;
    wrap.appendChild(row);
    const fill = row.querySelector(".bar-fill");
    if (animate) {
      requestAnimationFrame(() => { fill.style.width = `${prob * 100}%`; });
    } else {
      fill.style.transition = "none";
      fill.style.width = `${prob * 100}%`;
    }
  });
  container.appendChild(wrap);
}

function renderRadar(svgEl, probabilities) {
  const cx = 120, cy = 100, R = 78;
  const n = EMOTIONS.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

  let svg = "";
  // rings
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    const pts = EMOTIONS.map((_, i) => point(i, R * f).join(",")).join(" ");
    svg += `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`;
  });
  // axes + labels
  EMOTIONS.forEach((emo, i) => {
    const [x, y] = point(i, R);
    svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`;
    const [lx, ly] = point(i, R + 16);
    svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${emo}</text>`;
  });
  // data polygon
  const dataPts = EMOTIONS.map((emo, i) => point(i, R * (probabilities[emo] || 0)).join(",")).join(" ");
  svg += `<polygon points="${dataPts}" fill="rgba(79,209,232,0.18)" stroke="#4fd1e8" stroke-width="2" style="transition: all 0.6s cubic-bezier(0.22,1,0.36,1);"/>`;
  EMOTIONS.forEach((emo, i) => {
    const [x, y] = point(i, R * (probabilities[emo] || 0));
    svg += `<circle cx="${x}" cy="${y}" r="3" fill="${EMOTION_COLORS[emo]}"/>`;
  });

  svgEl.setAttribute("class", "radar-labels");
  svgEl.innerHTML = svg;
}

function renderResultPanel(result) {
  const panel = document.getElementById("result-panel");
  panel.innerHTML = `
    <div class="result-head">
      <div class="result-emoji">${result.emoji}</div>
      <div>
        <div class="result-emotion" style="color:${EMOTION_COLORS[result.predicted_emotion]}">${result.predicted_emotion}</div>
        <div class="result-conf-label">${(result.confidence * 100).toFixed(2)}% confidence · ${result.inference_time_ms}ms</div>
      </div>
    </div>
    <div id="bars-container"></div>
  `;
  renderBars(document.getElementById("bars-container"), result.all_probabilities);
}

/* ── Analyze flow ─────────────────────────────────────────────────────── */
const analyzeBtn = document.getElementById("analyze-btn");

async function runAnalysis() {
  const text = textInput.value.trim();
  if (!text) {
    toast("Type something to analyze first.", true);
    return;
  }

  analyzeBtn.disabled = true;
  const animation = playPipelineAnimation();

  try {
    const [result] = await Promise.all([api.predict(text), animation]);

    renderResultPanel(result);
    renderGauge(result.confidence);
    renderRadar(document.getElementById("radar-svg"), result.all_probabilities);

    historyStore.add({
      text: result.text,
      cleaned_text: result.cleaned_text,
      predicted_emotion: result.predicted_emotion,
      emoji: result.emoji,
      confidence: result.confidence,
      all_probabilities: result.all_probabilities,
      timestamp: Date.now(),
    });
    renderLatestCard();
    document.getElementById("pipeline-status").textContent = "DONE";
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.", true);
    resetPipeline();
  } finally {
    analyzeBtn.disabled = false;
  }
}

analyzeBtn.addEventListener("click", runAnalysis);
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runAnalysis();
});

/* ── Homepage: latest prediction card ─────────────────────────────────── */
function renderLatestCard() {
  const all = historyStore.getAll();
  const section = document.getElementById("latest-section");
  if (!all.length) {
    section.style.display = "none";
    return;
  }
  const latest = all[0];
  section.style.display = "block";
  const card = document.getElementById("latest-card");
  card.innerHTML = `
    <div class="result-head">
      <div class="result-emoji">${latest.emoji}</div>
      <div>
        <div class="panel-title" style="margin-bottom:2px;">Latest Analysis</div>
        <div class="result-emotion" style="color:${EMOTION_COLORS[latest.predicted_emotion]}; font-size:1.4rem;">${latest.predicted_emotion}</div>
        <div class="result-conf-label">${(latest.confidence * 100).toFixed(1)}% confidence</div>
      </div>
    </div>
    <div id="latest-bars"></div>
  `;
  renderBars(document.getElementById("latest-bars"), latest.all_probabilities, false);
}

/* ── History page ─────────────────────────────────────────────────────── */
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(ts) {
  const d = new Date(ts), now = new Date();
  const isSameDay = (a, b) => a.toDateString() === b.toDateString();
  if (isSameDay(d, now)) return "TODAY";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "YESTERDAY";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
}

function renderHistoryPage() {
  const listEl = document.getElementById("history-list");
  const all = historyStore.getAll();

  if (!all.length) {
    listEl.innerHTML = `<div class="empty-state"><span class="glyph">◇</span><h4>No predictions yet</h4><p>Analyses you run will show up here as a timeline.</p></div>`;
    return;
  }

  let html = "";
  let lastDay = null;
  all.forEach((item, idx) => {
    const label = dayLabel(item.timestamp);
    if (label !== lastDay) {
      html += `<div class="history-day-label">${label}</div>`;
      lastDay = label;
    }
    html += `
      <div class="history-item" data-idx="${idx}">
        <div class="history-time">${formatTime(item.timestamp)}</div>
        <div class="history-text">"${item.text}"</div>
        <div class="history-tag">
          <span class="emo-dot" style="background:${EMOTION_COLORS[item.predicted_emotion]}"></span>
          ${item.predicted_emotion.toUpperCase()}
          <span class="history-conf">${(item.confidence * 100).toFixed(1)}%</span>
        </div>
      </div>
      <div class="history-detail" id="detail-${idx}"></div>
    `;
  });
  listEl.innerHTML = html;

  listEl.querySelectorAll(".history-item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = el.dataset.idx;
      const detail = document.getElementById(`detail-${idx}`);
      const isOpen = detail.classList.contains("open");
      listEl.querySelectorAll(".history-detail.open").forEach((d) => { d.classList.remove("open"); d.innerHTML = ""; });
      if (!isOpen) {
        detail.classList.add("open");
        renderBars(detail, all[idx].all_probabilities, false);
      }
    });
  });
}

document.getElementById("clear-history-btn").addEventListener("click", () => {
  if (confirm("Clear all prediction history? This cannot be undone.")) {
    historyStore.clear();
    renderHistoryPage();
    renderLatestCard();
    toast("History cleared.");
  }
});

/* ── Analytics page ───────────────────────────────────────────────────── */
function renderAnalyticsPage() {
  const all = historyStore.getAll();
  const emptyEl = document.getElementById("analytics-empty");
  const contentEl = document.getElementById("analytics-content");

  if (!all.length) {
    emptyEl.style.display = "block";
    contentEl.style.display = "none";
    return;
  }
  emptyEl.style.display = "none";
  contentEl.style.display = "block";

  const total = all.length;
  const avgConf = all.reduce((sum, p) => sum + p.confidence, 0) / total;
  const counts = {};
  EMOTIONS.forEach((e) => (counts[e] = 0));
  all.forEach((p) => counts[p.predicted_emotion]++);
  const topEmotion = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const highest = all.reduce((max, p) => (p.confidence > max.confidence ? p : max), all[0]);

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-avg-conf").textContent = `${(avgConf * 100).toFixed(1)}%`;
  document.getElementById("stat-top-emotion").textContent = topEmotion;
  document.getElementById("stat-high-conf").textContent = `${(highest.confidence * 100).toFixed(1)}%`;

  // distribution bars
  const distEl = document.getElementById("dist-bars");
  distEl.innerHTML = "";
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([emo, count]) => {
      const pct = total ? (count / total) * 100 : 0;
      const row = document.createElement("div");
      row.className = "dist-row";
      row.innerHTML = `
        <div class="bar-label">${emo}</div>
        <div class="bar-track"><div class="bar-fill" style="background:${EMOTION_COLORS[emo]}; width:${pct}%; transition:width .8s cubic-bezier(.22,1,.36,1);"></div></div>
        <div class="bar-pct">${pct.toFixed(0)}%</div>
      `;
      distEl.appendChild(row);
    });

  // timeline: predictions oldest -> newest, one dot per prediction, colored by emotion
  const ordered = [...all].reverse().slice(-40);
  const w = 400, h = 180, pad = 20;
  const step = ordered.length > 1 ? (w - pad * 2) / (ordered.length - 1) : 0;
  let svg = `<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="rgba(255,255,255,0.08)"/>`;
  let path = "";
  ordered.forEach((p, i) => {
    const x = pad + i * step;
    const y = h - pad - p.confidence * (h - pad * 2);
    path += `${i === 0 ? "M" : "L"}${x},${y} `;
  });
  svg += `<path d="${path}" fill="none" stroke="rgba(79,209,232,0.5)" stroke-width="1.5"/>`;
  ordered.forEach((p, i) => {
    const x = pad + i * step;
    const y = h - pad - p.confidence * (h - pad * 2);
    svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="${EMOTION_COLORS[p.predicted_emotion]}"><title>${p.predicted_emotion} — ${(p.confidence * 100).toFixed(1)}%</title></circle>`;
  });
  document.getElementById("timeline-svg").innerHTML = svg;
}

/* ── Model page ───────────────────────────────────────────────────────── */
let modelInfoCache = null;
async function loadModelInfo() {
  const specsEl = document.getElementById("model-specs");
  const archEl = document.getElementById("arch-flow");
  if (modelInfoCache) {
    renderModelInfo(modelInfoCache);
    return;
  }
  try {
    const info = await api.modelInfo();
    modelInfoCache = info;
    renderModelInfo(info);
  } catch (err) {
    specsEl.innerHTML = `<div class="empty-state"><span class="glyph">!</span>Could not load model info. Is the server running?</div>`;
    archEl.innerHTML = "";
  }
}

function renderModelInfo(info) {
  const specsEl = document.getElementById("model-specs");
  const rows = [
    ["Model", info.architecture],
    ["Task", info.task],
    ["Classes", info.num_classes],
    ["Sequence Length", info.sequence_length],
    ["Vocabulary Size", info.vocabulary_size.toLocaleString()],
    ["Trainable Parameters", info.trainable_parameters.toLocaleString()],
    ["Framework", info.framework],
    ["Inference API", "FastAPI"],
    ["Preprocessing", info.preprocessing],
  ];
  specsEl.innerHTML = rows
    .map(([k, v]) => `<div class="spec-row"><span>${k}</span><span>${v}</span></div>`)
    .join("");

  const archEl = document.getElementById("arch-flow");
  const nodes = [
    { label: "Input Text", sub: "raw sentence" },
    { label: "Tokenizer", sub: `vocabulary size ${info.vocabulary_size.toLocaleString()}` },
    { label: "Sequence Padding", sub: `length ${info.sequence_length}` },
  ];
  info.layers.forEach((l) => {
    if (l.type === "Embedding") nodes.push({ label: "Embedding", sub: `${l.input_dim} × ${l.output_dim}` });
    else if (l.type === "Bidirectional") nodes.push({ label: `Bidirectional ${l.wrapped_layer}`, sub: `${l.units} units${l.return_sequences ? ", return sequences" : ""}` });
    else if (l.type === "Dropout") nodes.push({ label: "Dropout", sub: `rate ${l.rate}` });
    else if (l.type === "Dense") nodes.push({ label: "Dense", sub: `${l.units} units · ${l.activation}` });
  });
  nodes.push({ label: "Emotion Probabilities", sub: "softmax output" });

  archEl.innerHTML = nodes
    .map((n, i) => `
      <div class="arch-node">${n.label}<div class="sub">${n.sub}</div></div>
      ${i < nodes.length - 1 ? '<div class="arch-arrow">↓</div>' : ""}
    `)
    .join("");
}

/* ── Hero canvas: decorative neural signal visualization ─────────────── */
function initHeroCanvas() {
  const canvas = document.getElementById("hero-canvas");
  const ctx = canvas.getContext("2d");
  let w, h, nodes = [], raf;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    w = canvas.width = rect.width * devicePixelRatio;
    h = canvas.height = rect.height * devicePixelRatio;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    buildNodes();
  }

  function buildNodes() {
    nodes = [];
    const layers = [3, 5, 5, 4];
    layers.forEach((count, li) => {
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: (w / (layers.length + 1)) * (li + 1),
          y: (h / (count + 1)) * (i + 1) + (Math.random() - 0.5) * 10,
          layer: li,
          r: 2.5 * devicePixelRatio + Math.random() * 1.5,
          phase: Math.random() * Math.PI * 2,
        });
      }
    });
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    // connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (b.layer === a.layer + 1) {
          const pulse = (Math.sin(t / 900 + a.phase) + 1) / 2;
          ctx.strokeStyle = `rgba(79, 209, 232, ${0.05 + pulse * 0.12})`;
          ctx.lineWidth = 1 * devicePixelRatio;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    // nodes
    nodes.forEach((n) => {
      const pulse = (Math.sin(t / 700 + n.phase) + 1) / 2;
      const colors = ["#4fd1e8", "#4d7dfb", "#8c6bfb", "#ee7fa6"];
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + pulse * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = colors[n.layer % colors.length];
      ctx.globalAlpha = 0.55 + pulse * 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    raf = requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  raf = requestAnimationFrame(draw);
}

/* ── Init ─────────────────────────────────────────────────────────────── */
initHeroCanvas();
renderLatestCard();
renderRadar(document.getElementById("radar-svg"), Object.fromEntries(EMOTIONS.map((e) => [e, 0])));
