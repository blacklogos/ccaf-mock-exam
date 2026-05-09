/* CCAF Mock — Exam Engine
 * Pure vanilla JS. Loads questions from data/questions.json.
 */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const richText = (s) => esc(s).replace(/`([^`\n]+?)`/g, '<code class="mark">$1</code>');

  const fmtTime = (s) => {
    if (s < 0) s = 0;
    const m = Math.floor(s / 60), sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // --- theme ---
  const themeKey = "ccaf-theme";
  const setTheme = (t) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(themeKey, t); } catch (_) {}
  };
  (function initTheme() {
    let saved;
    try { saved = localStorage.getItem(themeKey); } catch (_) {}
    if (!saved) saved = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(saved);
  })();

  // --- state ---
  const state = {
    questions: [],
    bank: [],   // active subset for this run
    idx: 0,
    answers: {},
    flagged: new Set(),
    mode: null,         // "timed" | "untimed"
    setKey: "set1",     // active set
    setLabel: "Set 1",
    started: 0,
    deadline: 0,
    timerInt: null,
    submitted: false,
  };

  // --- sets metadata ---
  const SETS = {
    set1: { file: "data/questions-set1.json", label: "Set 1", desc: "Standard difficulty · 60 Qs" },
    set2: { file: "data/questions-set2.json", label: "Set 2", desc: "Standard difficulty · alternate form" },
    set3: { file: "data/questions-set3.json", label: "Set 3", desc: "Hard · edge cases & subtle distractors" },
  };
  const SET_KEYS = ["set1", "set2", "set3"];
  const setKey = "ccaf-set";

  function getSavedSet() {
    try {
      const v = localStorage.getItem(setKey);
      if (v && (SETS[v] || v === "random")) return v;
    } catch (_) {}
    return "set1";
  }
  function saveSet(v) {
    try { localStorage.setItem(setKey, v); } catch (_) {}
  }

  // --- group labels ---
  const GROUP_LABELS = {
    research_pipeline: "Research Pipelines",
    code_exploration: "Code Exploration",
    customer_support: "Customer Support",
    extraction_pipeline: "Extraction Pipelines",
  };

  // --- load bank for a given set key ---
  const _bankCache = {};
  async function loadSet(key) {
    const meta = SETS[key];
    if (!meta) throw new Error(`Unknown set: ${key}`);
    if (_bankCache[key]) return _bankCache[key];
    const r = await fetch(meta.file, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${meta.file}`);
    const data = await r.json();
    _bankCache[key] = data;
    return data;
  }

  // initial pre-load of Set 1 (for the question count badge)
  async function bootstrapPreload() {
    try {
      const data = await loadSet("set1");
      state.questions = data;
      const elc = $("#stat-qcount"); if (elc) elc.textContent = data.length;
    } catch (err) {
      console.error("Failed to load Set 1:", err);
    }
  }

  // --- start exam ---
  async function startExam(mode) {
    // resolve set choice (state.setKey is set by the picker; "random" picks now)
    let chosen = state.setKey;
    if (chosen === "random") chosen = SET_KEYS[Math.floor(Math.random() * SET_KEYS.length)];
    let bank;
    try {
      bank = await loadSet(chosen);
    } catch (err) {
      alert("Failed to load question set: " + err.message);
      return;
    }
    if (!bank || !bank.length) {
      alert("Question bank is empty.");
      return;
    }
    state.questions = bank;
    state.setLabel = SETS[chosen].label;
    state.mode = mode;
    state.bank = shuffle(bank);
    state.idx = 0;
    state.answers = {};
    state.flagged = new Set();
    state.submitted = false;
    state.started = Date.now();

    if (mode === "timed") {
      state.deadline = state.started + 120 * 60 * 1000;
      startTimer();
    } else {
      state.deadline = 0;
      stopTimer();
      $("#exam-timer").textContent = "—";
      $("#exam-timer").classList.remove("warn", "critical");
    }

    document.body.classList.add("exam-mode");
    $("#exam-shell").classList.add("active");
    $("#result-shell").classList.remove("active");
    $("#result-shell").style.display = "none";

    renderPalette();
    renderQuestion();

    window.scrollTo(0, 0);
  }

  function endExamConfirm() {
    if (state.submitted) { showResults(); return; }
    $("#submit-modal").classList.add("active");
  }

  function endExam() {
    state.submitted = true;
    stopTimer();
    showResults();
  }

  function exitExam() {
    if (state.submitted || confirm("Exit exam? Your progress will be lost.")) {
      stopTimer();
      state.submitted = false;
      document.body.classList.remove("exam-mode");
      $("#exam-shell").classList.remove("active");
      $("#result-shell").classList.remove("active");
      $("#result-shell").style.display = "none";
      window.scrollTo(0, 0);
    }
  }

  // --- timer ---
  function startTimer() {
    stopTimer();
    tickTimer();
    state.timerInt = setInterval(tickTimer, 500);
  }
  function stopTimer() {
    if (state.timerInt) { clearInterval(state.timerInt); state.timerInt = null; }
  }
  function tickTimer() {
    if (state.mode !== "timed") return;
    const remain = Math.max(0, Math.floor((state.deadline - Date.now()) / 1000));
    const el = $("#exam-timer");
    el.textContent = fmtTime(remain);
    el.classList.toggle("warn", remain <= 600 && remain > 60);
    el.classList.toggle("critical", remain <= 60);
    if (remain <= 0) endExam();
  }

  // --- render ---
  function renderQuestion() {
    const q = state.bank[state.idx];
    if (!q) return;

    const headerEl = $("#q-header");
    const flagged = state.flagged.has(q.id);
    headerEl.innerHTML = `
      <div class="q-meta">
        <span class="badge-soft badge">${esc(state.setLabel)}</span>
        <span class="badge-soft badge">Question ${state.idx + 1} / ${state.bank.length}</span>
        <span class="badge-soft badge">${esc(GROUP_LABELS[q.group] || q.group)}</span>
        ${q.topic ? `<span class="badge-soft badge">${esc(q.topic)}</span>` : ""}
      </div>
      <button id="flag-btn" class="flag-btn ${flagged ? "on" : ""}" aria-pressed="${flagged}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4M4 4l14 4-4 4 4 4H4"/></svg>
        ${flagged ? "Flagged" : "Flag"}
      </button>`;
    $("#flag-btn").addEventListener("click", () => {
      if (flagged) state.flagged.delete(q.id); else state.flagged.add(q.id);
      renderQuestion();
      renderPalette();
    });

    $("#q-text").innerHTML = richText(q.text);

    const answered = state.answers[q.id];
    const showFeedback = state.submitted;

    const optsHtml = q.options.map((opt) => {
      const isSel = answered === opt.letter;
      let cls = "option";
      if (showFeedback) {
        cls += " locked";
        if (opt.correct) cls += " correct show-explain";
        else if (isSel && !opt.correct) cls += " wrong show-explain";
      } else if (isSel) {
        cls += " selected";
      }
      return `
        <button class="${cls}" data-letter="${opt.letter}" ${showFeedback ? "disabled" : ""}>
          <span class="option-letter">${opt.letter}</span>
          <span class="option-text">${richText(opt.text)}</span>
          <div class="option-explain">${richText(opt.explain || "")}</div>
        </button>`;
    }).join("");

    $("#q-options").innerHTML = optsHtml;
    if (!showFeedback) {
      $$("#q-options .option").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.answers[q.id] = btn.dataset.letter;
          renderQuestion();
          renderPalette();
          updateProgress();
        });
      });
    }

    $("#prev-btn").disabled = state.idx === 0;
    $("#next-btn").disabled = state.idx === state.bank.length - 1;

    updateProgress();
  }

  function updateProgress() {
    const total = state.bank.length || 1;
    const done = Object.keys(state.answers).length;
    const pct = Math.round((done / total) * 100);
    $("#progress-fill").style.width = pct + "%";
    $("#progress-text").textContent = `${done} / ${total}`;
  }

  function renderPalette() {
    const el = $("#palette-grid");
    el.innerHTML = state.bank.map((q, i) => {
      const answered = !!state.answers[q.id];
      const flagged = state.flagged.has(q.id);
      const current = i === state.idx;
      let cls = "palette-cell";
      if (state.submitted) {
        const sel = state.answers[q.id];
        const correct = q.options.find((o) => o.correct);
        if (sel && correct && sel === correct.letter) cls += " correct";
        else if (sel) cls += " wrong";
        else cls += " wrong";
      } else {
        if (answered) cls += " answered";
      }
      if (flagged) cls += " flagged";
      if (current) cls += " current";
      return `<button class="${cls}" data-idx="${i}" aria-label="Question ${i + 1}">${i + 1}</button>`;
    }).join("");
    $$("#palette-grid .palette-cell").forEach((c) => {
      c.addEventListener("click", () => {
        state.idx = parseInt(c.dataset.idx, 10);
        renderQuestion();
        renderPalette();
      });
    });
  }

  // --- results ---
  function computeResults() {
    let correct = 0;
    const byGroup = {};
    for (const q of state.bank) {
      const sel = state.answers[q.id];
      const right = q.options.find((o) => o.correct);
      const ok = sel && right && sel === right.letter;
      if (ok) correct++;
      const g = q.group;
      if (!byGroup[g]) byGroup[g] = { correct: 0, total: 0 };
      byGroup[g].total++;
      if (ok) byGroup[g].correct++;
    }
    const total = state.bank.length;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const score1000 = total ? Math.round((correct / total) * 1000) : 0;
    return { correct, total, pct, score1000, byGroup };
  }

  function showResults() {
    const r = computeResults();
    const passed = r.score1000 >= 700;
    const elapsedSec = Math.floor((Date.now() - state.started) / 1000);

    $("#result-score").textContent = r.score1000;
    $("#result-verdict").innerHTML = passed
      ? `<span class="result-pass">Pass benchmark cleared</span> · 700 / 1000`
      : `<span class="result-fail">Below benchmark</span> · 700 / 1000 to pass`;
    $("#result-correct").textContent = `${r.correct}/${r.total}`;
    $("#result-pct").textContent = r.pct + "%";
    $("#result-flagged").textContent = state.flagged.size;
    $("#result-time").textContent = fmtTime(elapsedSec);

    const breakdownHtml = Object.entries(r.byGroup).map(([g, v]) => {
      const pct = v.total ? Math.round((v.correct / v.total) * 100) : 0;
      return `
        <div class="breakdown-row">
          <div>
            <div class="breakdown-name">${esc(GROUP_LABELS[g] || g)}</div>
            <div class="muted" style="font-size:.86rem">${v.correct} / ${v.total} correct</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <div class="breakdown-bar"><div class="breakdown-fill" style="width:${pct}%"></div></div>
            <div class="breakdown-pct">${pct}%</div>
          </div>
        </div>`;
    }).join("");
    $("#result-breakdown").innerHTML = breakdownHtml;

    $("#result-shell").classList.add("active");
    $("#result-shell").style.display = "block";
    $("#exam-shell").scrollTop = 0;

    renderPalette();
    renderQuestion();
  }

  // --- nav ---
  function next() { if (state.idx < state.bank.length - 1) { state.idx++; renderQuestion(); renderPalette(); } }
  function prev() { if (state.idx > 0) { state.idx--; renderQuestion(); renderPalette(); } }

  // --- keyboard ---
  function onKey(e) {
    if (!$("#exam-shell").classList.contains("active")) return;
    if (e.target && /^(input|textarea)$/i.test(e.target.tagName)) return;
    const k = e.key;
    if (["ArrowRight", "PageDown"].includes(k)) { e.preventDefault(); next(); }
    else if (["ArrowLeft", "PageUp"].includes(k)) { e.preventDefault(); prev(); }
    else if (k === "f" || k === "F") {
      const q = state.bank[state.idx];
      if (state.flagged.has(q.id)) state.flagged.delete(q.id);
      else state.flagged.add(q.id);
      renderQuestion(); renderPalette();
    } else if (["1", "2", "3", "4"].includes(k) && !state.submitted) {
      const q = state.bank[state.idx];
      const letter = q.options[parseInt(k, 10) - 1]?.letter;
      if (letter) {
        state.answers[q.id] = letter;
        renderQuestion(); renderPalette(); updateProgress();
      }
    }
  }

  // --- set picker ---
  function setActiveSet(key) {
    state.setKey = key;
    saveSet(key);
    $$(".set-card").forEach((c) => c.classList.toggle("active", c.dataset.set === key));
    const meta = key === "random"
      ? { label: "Random", desc: "Picked at start of each attempt" }
      : SETS[key];
    const lbl = $("#active-set-label");
    if (lbl && meta) lbl.textContent = meta.label;
  }

  // --- wire up ---
  function wire() {
    $("#theme-toggle").addEventListener("click", () => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });

    // initial set selection
    setActiveSet(getSavedSet());
    $$(".set-card").forEach((c) => {
      c.addEventListener("click", () => setActiveSet(c.dataset.set));
    });

    $$(".js-start-timed").forEach((b) => b.addEventListener("click", () => startExam("timed")));
    $$(".js-start-untimed").forEach((b) => b.addEventListener("click", () => startExam("untimed")));

    $("#exit-btn").addEventListener("click", exitExam);
    $("#submit-btn").addEventListener("click", endExamConfirm);
    $("#prev-btn").addEventListener("click", prev);
    $("#next-btn").addEventListener("click", next);

    $("#submit-confirm").addEventListener("click", () => {
      $("#submit-modal").classList.remove("active");
      endExam();
    });
    $("#submit-cancel").addEventListener("click", () => {
      $("#submit-modal").classList.remove("active");
    });

    $("#result-retake").addEventListener("click", () => {
      $("#result-shell").style.display = "none";
      startExam(state.mode);
    });
    $("#result-exit").addEventListener("click", () => {
      $("#result-shell").style.display = "none";
      exitExam();
    });
    $("#result-review").addEventListener("click", () => {
      $("#result-shell").style.display = "none";
      state.idx = 0;
      renderQuestion(); renderPalette();
    });

    $("#palette-toggle")?.addEventListener("click", () => {
      $("#palette-pane").classList.toggle("open");
    });

    document.addEventListener("keydown", onKey);

    // Smooth scroll for in-page anchors
    $$("a[href^='#']").forEach((a) => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href").slice(1);
        if (!id) return;
        const t = document.getElementById(id);
        if (t) { e.preventDefault(); t.scrollIntoView({ behavior: "smooth", block: "start" }); }
      });
    });
  }

  // --- boot ---
  document.addEventListener("DOMContentLoaded", async () => {
    wire();
    await bootstrapPreload();
  });
})();
