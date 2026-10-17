/* investigation_studio.js — Quantum Error Investigation Studio.
 *
 * A new sub-tab (C) in the 3D Simulator Lab that turns the QEC simulator
 * into a quantum laboratory: users create an experiment, observe a hidden
 * error, investigate the syndrome evidence, choose a correction, and
 * replay the experiment to see what changed.
 *
 * Three modes:
 *   1. Guided Investigation — the fault is shown, with step-by-step explanation
 *   2. Hidden Error Challenge — the fault is hidden; user must diagnose from syndrome
 *   3. Free Investigation — user chooses any recovery to compare outcomes
 *
 * Components:
 *   - Quantum Processor Chamber: 2D processor diagram with labeled qubits,
 *     animated error injection, syndrome panel
 *   - Circuit Time Machine: timeline with play/pause/step/replay controls,
 *     animated playhead
 *   - Investigation Console: live event log from the real simulation
 *   - Recovery Panel: user chooses a correction, submits, gets scored
 *
 * Everything is driven by the real Qiskit backend via /api/3d/investigate
 * and /api/3d/recover. No mock data, no hard-coded answers.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const E = window.Qec3D;

  // ---------- state ----------
  let investData = null;
  let investStage = 0;
  let investPlaying = false;
  let investTimer = null;
  let investSpeed = 1500;
  let recoveryResult = null;
  let attempts = 0;
  let totalScore = 0;

  // ---------- helpers ----------
  function api(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  }

  function getConfig() {
    const seg = document.querySelector("#inputBitSeg .seg.active");
    return {
      code: $("codeSel").value,
      noise: $("noiseSel").value,
      input_bit: parseInt(seg ? seg.dataset.value : "0", 10),
      probability_percent: parseFloat($("probNum").value),
      shots: parseInt($("shotsNum").value, 10),
      noise_scope: $("scopeSel").value,
      error_qubit: parseInt($("qubitSel").value || "0", 10),
      basis: $("basisSel").value,
    };
  }

  const STAGE_COLORS = ["#5b8cff", "#8b6cff", "#ff6b81", "#3ddc97", "#ffc857", "#7aa2ff", "#c9d3ff"];
  const PAULI_COLOR = { I: "#3ddc97", X: "#fb7185", Y: "#e879f9", Z: "#fbbf24" };

  // ============================================================
  // START INVESTIGATION
  // ============================================================

  async function startInvestigation() {
    const cfg = getConfig();
    const mode = $("investMode").value;
    const errorType = $("investFaultType").value || null;
    $("investStatus").textContent = "Starting investigation…";
    $("investStartBtn").disabled = true;
    try {
      const r = await api("/api/3d/investigate", {
        ...cfg,
        mode,
        error_type: errorType,
      });
      if (!r.ok) throw new Error("backend error");
      investData = r;
      investStage = 0;
      investPlaying = false;
      recoveryResult = null;
      attempts = 0;
      $("investStatus").textContent = `Experiment ${r.experiment_id.substring(0, 20)}… · ${r.code_name} · ${mode} mode`;
      renderInvestigation();
      // Show/hide the fault based on mode
      if (mode === "guided" || mode === "free") {
        if (r.hidden_fault) {
          $("investFaultReveal").textContent = `Fault: ${r.hidden_fault.error_type} on q${r.hidden_fault.error_qubit}`;
          $("investFaultReveal").style.color = "#fb7185";
        }
      } else {
        $("investFaultReveal").textContent = "Fault: HIDDEN — diagnose from the syndrome";
        $("investFaultReveal").style.color = "#8f9bc7";
      }
    } catch (e) {
      $("investStatus").textContent = "Error: " + (e.message || "unknown");
    } finally {
      $("investStartBtn").disabled = false;
    }
  }

  // ============================================================
  // RENDER INVESTIGATION
  // ============================================================

  function renderInvestigation() {
    if (!investData) return;
    renderProcessor();
    renderTimeline();
    renderConsole();
    renderSyndromePanel();
    renderRecoveryPanel();
    updateStageInfo();
  }

  // ============================================================
  // PROCESSOR CHAMBER (2D canvas)
  // ============================================================

  let procCanvas, procCtx, procRaf = 0;

  function renderProcessor() {
    const canvas = $("investProcessorCanvas");
    if (!canvas) return;
    procCanvas = canvas;

    function draw() {
      const fit = E.fitCanvas(canvas);
      if (!fit) return;
      const { w, h, ctx } = fit;
      ctx.clearRect(0, 0, w, h);
      if (!investData || !investData.processor) return;

      const proc = investData.processor;
      const cx = w / 2, cy = h / 2;
      const scale = Math.min(w / 12, h / 8);

      // Draw connections (stabilizer checks)
      ctx.save();
      for (const conn of proc.connections) {
        const from = proc.qubits.find((q) => q.id === conn.from);
        const to = proc.qubits.find((q) => q.id === conn.to);
        if (!from || !to) continue;
        const x1 = cx + from.x * scale, y1 = cy - from.y * scale;
        const x2 = cx + to.x * scale, y2 = cy - to.y * scale;
        const color = conn.type === "zz" ? "rgba(91,140,255,0.3)" : "rgba(139,108,255,0.3)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // Draw qubit nodes
      for (const q of proc.qubits) {
        const x = cx + q.x * scale, y = cy - q.y * scale;
        const isAncilla = q.type === "ancilla";
        const r = isAncilla ? 12 : 16;

        // Get syndrome bit for ancillas
        let synBit = null;
        if (isAncilla && investData.evidence) {
          const syn = investData.evidence.syndrome_bits.find((s) => s.ancilla === q.id);
          if (syn) synBit = syn.bit;
        }

        // Highlight if this is the noise target
        const isNoiseTarget = q.is_noise_target && investStage >= 2;
        const isCurrentEvent = investData.timeline[investStage] &&
          investData.timeline[investStage].qubits.includes(q.id);

        // Glow for active qubits
        if (isCurrentEvent || isNoiseTarget || synBit === 1) {
          ctx.save();
          ctx.shadowColor = isNoiseTarget ? "#ff6b81" : synBit === 1 ? "#ffc857" : "#a78bfa";
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(x, y, r + 3, 0, Math.PI * 2);
          ctx.fillStyle = isNoiseTarget ? "rgba(255,107,129,0.2)" :
                         synBit === 1 ? "rgba(255,200,87,0.2)" : "rgba(167,139,250,0.2)";
          ctx.fill();
          ctx.restore();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = isAncilla ? "#172345" : "#0c1329";
        ctx.fill();
        ctx.strokeStyle = isNoiseTarget ? "#ff6b81" :
                         synBit === 1 ? "#ffc857" :
                         isCurrentEvent ? "#a78bfa" :
                         isAncilla ? "#3a4a78" : "#5b8cff";
        ctx.lineWidth = isNoiseTarget || synBit === 1 || isCurrentEvent ? 2.5 : 1.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = isAncilla ? "#8f9bc7" : "#dfe6ff";
        ctx.font = "bold 11px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(q.label, x, y);

        // Syndrome bit for ancillas
        if (isAncilla && synBit !== null) {
          ctx.fillStyle = synBit === 1 ? "#ffc857" : "#3ddc97";
          ctx.font = "bold 9px ui-monospace, monospace";
          ctx.fillText(synBit, x + r + 6, y);
        }

        // Role label below
        ctx.fillStyle = "#5b5480";
        ctx.font = "8px ui-sans-serif";
        ctx.fillText(q.type === "data" ? "data" : "anc", x, y + r + 8);

        // Block label for Shor
        if (q.block !== undefined) {
          ctx.fillStyle = "#7aa2ff";
          ctx.font = "7px ui-sans-serif";
          ctx.fillText(`blk${q.block}`, x, y - r - 6);
        }
      }

      // Title
      ctx.save();
      ctx.fillStyle = "rgba(167,139,250,0.9)";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("Quantum Processor Chamber", 12, 18);
      ctx.fillStyle = "rgba(143,155,199,0.6)";
      ctx.font = "9px ui-sans-serif";
      const stageLabel = investData.timeline[investStage] ? investData.timeline[investStage].title : "";
      ctx.fillText(`current step: ${investStage + 1}/${investData.timeline.length} · ${stageLabel}`, 12, 32);
      ctx.restore();
    }

    if (!procRaf) {
      const loop = () => {
        draw();
        procRaf = requestAnimationFrame(loop);
      };
      loop();
    } else {
      draw();
    }
  }

  // ============================================================
  // CIRCUIT TIME MACHINE
  // ============================================================

  function renderTimeline() {
    if (!investData || !investData.timeline) return;
    const tl = $("investTimeline");
    const events = investData.timeline;
    const html = events.map((e, i) => {
      const color = STAGE_COLORS[i] || "#7aa2ff";
      const isActive = i === investStage;
      const isPast = i < investStage;
      const cls = isActive ? "invest-tl-event active" : isPast ? "invest-tl-event done" : "invest-tl-event";
      return `<div class="${cls}" data-step="${i}" style="--event-color: ${color};">
        <span class="invest-tl-num" style="background:${color};">${e.step}</span>
        <span class="invest-tl-title">${e.title}</span>
      </div>`;
    }).join("");
    tl.innerHTML = html;
    // Click handlers
    document.querySelectorAll("#investTimeline .invest-tl-event").forEach((el) => {
      el.addEventListener("click", () => goToStep(parseInt(el.dataset.step, 10)));
    });
  }

  function goToStep(step) {
    if (!investData || step < 0 || step >= investData.timeline.length) return;
    investStage = step;
    investPlaying = false;
    if (investTimer) { clearInterval(investTimer); investTimer = null; }
    updatePlaybackControls();
    renderInvestigation();
  }

  function playTimeline() {
    if (!investData) return;
    if (investStage >= investData.timeline.length - 1) investStage = 0;
    investPlaying = true;
    updatePlaybackControls();
    if (investTimer) clearInterval(investTimer);
    investTimer = setInterval(() => {
      if (investStage >= investData.timeline.length - 1) {
        investPlaying = false;
        clearInterval(investTimer);
        investTimer = null;
        updatePlaybackControls();
        return;
      }
      investStage++;
      renderInvestigation();
    }, investSpeed);
  }

  function pauseTimeline() {
    investPlaying = false;
    if (investTimer) { clearInterval(investTimer); investTimer = null; }
    updatePlaybackControls();
  }

  function restartTimeline() {
    investStage = 0;
    investPlaying = false;
    if (investTimer) { clearInterval(investTimer); investTimer = null; }
    updatePlaybackControls();
    renderInvestigation();
  }

  function updatePlaybackControls() {
    const btn = $("investPlayBtn");
    if (btn) btn.textContent = investPlaying ? "⏸ Pause" : "▶ Play";
  }

  // ============================================================
  // INVESTIGATION CONSOLE (event log)
  // ============================================================

  function renderConsole() {
    if (!investData || !investData.timeline) return;
    const consoleEl = $("investConsole");
    const events = investData.timeline;
    const html = events.map((e, i) => {
      const isActive = i === investStage;
      const isPast = i < investStage;
      const prefix = isPast ? "✓" : isActive ? "▶" : "○";
      const color = STAGE_COLORS[i] || "#7aa2ff";
      const hiddenNote = e.hidden && investData.mode === "challenge" ? " [hidden]" : "";
      return `<div class="invest-console-line ${isActive ? "active" : isPast ? "done" : ""}">
        <span class="invest-console-prefix" style="color:${color};">${prefix}</span>
        <span class="invest-console-step">Step ${String(e.step).padStart(2, "0")}</span>
        <span class="invest-console-title">${e.title}${hiddenNote}</span>
        <span class="invest-console-desc">${e.desc}</span>
      </div>`;
    }).join("");
    consoleEl.innerHTML = html;
    // Auto-scroll to the current step
    const activeLine = consoleEl.querySelector(".invest-console-line.active");
    if (activeLine) activeLine.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ============================================================
  // SYNDROME PANEL
  // ============================================================

  function renderSyndromePanel() {
    if (!investData || !investData.evidence) return;
    const panel = $("investSyndromePanel");
    const ev = investData.evidence;
    const bits = ev.syndrome_bits;
    const html = `
      <div class="invest-syn-summary">
        <span class="invest-syn-label">Syndrome:</span>
        <span class="invest-syn-value">${ev.syndrome_string}</span>
        <span class="invest-syn-status ${ev.has_error ? "err" : "ok"}">
          ${ev.has_error ? "⚠ ERROR DETECTED" : "✓ NO ERROR"}
        </span>
      </div>
      <div class="invest-syn-bits">
        ${bits.map((b) => `
          <div class="invest-syn-bit ${b.bit ? "fired" : ""}">
            <span class="invest-syn-bit-label">ancilla q${b.ancilla}</span>
            <span class="invest-syn-bit-val">${b.bit}</span>
          </div>
        `).join("")}
      </div>
      <div class="invest-syn-desc">${ev.syndrome_description}</div>
    `;
    panel.innerHTML = html;
  }

  // ============================================================
  // RECOVERY PANEL
  // ============================================================

  function renderRecoveryPanel() {
    if (!investData) return;
    const panel = $("investRecoveryPanel");
    const n = investData.n_data_qubits;
    // Build qubit selection checkboxes for X and Z
    let html = '<div class="invest-recovery-section"><h4>Apply X correction to:</h4><div class="invest-recovery-qubits">';
    for (let q = 0; q < n; q++) {
      html += `<label class="invest-recovery-qubit"><input type="checkbox" class="invest-rec-x" data-qubit="${q}"> q${q}</label>`;
    }
    html += '</div></div><div class="invest-recovery-section"><h4>Apply Z correction to:</h4><div class="invest-recovery-qubits">';
    for (let q = 0; q < n; q++) {
      html += `<label class="invest-recovery-qubit"><input type="checkbox" class="invest-rec-z" data-qubit="${q}"> q${q}</label>`;
    }
    html += '</div></div>';
    html += '<div class="invest-recovery-actions">';
    html += '<button type="button" class="btn btn-primary" id="investSubmitRecovery">Submit Recovery</button>';
    html += '<button type="button" class="btn btn-secondary" id="investClearRecovery">Clear</button>';
    html += '<button type="button" class="btn btn-secondary" id="investRevealAnswer">Reveal Answer</button>';
    html += '</div>';
    if (recoveryResult) {
      const r = recoveryResult;
      html += `<div class="invest-recovery-result ${r.diagnosis_correct && r.recovery_success ? "success" : r.diagnosis_correct ? "partial" : "fail"}">
        <div class="invest-result-score">Score: ${r.score} / ${r.max_score}</div>
        <div class="invest-result-diagnosis">Diagnosis: ${r.diagnosis_correct ? "✓ Correct" : "✗ Incorrect"}</div>
        <div class="invest-result-recovery">Recovery: ${r.recovery_success ? "✓ Logical state preserved" : "✗ Logical state lost"}</div>
        <div class="invest-result-explanation">${r.explanation}</div>
        <div class="invest-result-answer">Correct answer: X on q[${r.correct_correction.x.join(",")}] · Z on q[${r.correct_correction.z.join(",")}]</div>
        <div class="invest-result-fault">Hidden fault was: ${r.hidden_fault.error_type} on q${r.hidden_fault.error_qubit}</div>
      </div>`;
    }
    panel.innerHTML = html;

    // Wire up buttons
    const submitBtn = $("investSubmitRecovery");
    if (submitBtn) submitBtn.addEventListener("click", submitRecovery);
    const clearBtn = $("investClearRecovery");
    if (clearBtn) clearBtn.addEventListener("click", clearRecovery);
    const revealBtn = $("investRevealAnswer");
    if (revealBtn) revealBtn.addEventListener("click", revealAnswer);
  }

  async function submitRecovery() {
    if (!investData) return;
    const xQubits = [];
    const zQubits = [];
    document.querySelectorAll(".invest-rec-x:checked").forEach((cb) => xQubits.push(parseInt(cb.dataset.qubit, 10)));
    document.querySelectorAll(".invest-rec-z:checked").forEach((cb) => zQubits.push(parseInt(cb.dataset.qubit, 10)));

    $("investStatus").textContent = "Validating recovery…";
    try {
      const cfg = getConfig();
      // In challenge mode, we need to pass the seed so the backend can
      // reconstruct the hidden fault
      const body = {
        ...cfg,
        experiment_id: investData.experiment_id,
        error_type: investData.hidden_fault ? investData.hidden_fault.error_type : null,
        error_qubit: investData.hidden_fault ? investData.hidden_fault.error_qubit : cfg.error_qubit,
        user_correction_x: xQubits,
        user_correction_z: zQubits,
        seed: investData.seed,
      };
      const r = await api("/api/3d/recover", body);
      if (!r.ok) throw new Error("backend error");
      recoveryResult = r;
      attempts++;
      if (r.score > 0) totalScore += r.score;
      $("investAttempts").textContent = attempts;
      $("investScore").textContent = totalScore;
      renderRecoveryPanel();
      $("investStatus").textContent = `Recovery validated — score ${r.score}/${r.max_score} · attempts: ${attempts}`;
    } catch (e) {
      $("investStatus").textContent = "Error: " + (e.message || "unknown");
    }
  }

  function clearRecovery() {
    document.querySelectorAll(".invest-rec-x:checked, .invest-rec-z:checked").forEach((cb) => cb.checked = false);
  }

  function revealAnswer() {
    if (!investData) return;
    if (investData.hidden_fault) {
      $("investFaultReveal").textContent = `Fault: ${investData.hidden_fault.error_type} on q${investData.hidden_fault.error_qubit}`;
      $("investFaultReveal").style.color = "#fb7185";
    } else if (recoveryResult) {
      $("investFaultReveal").textContent = `Fault: ${recoveryResult.hidden_fault.error_type} on q${recoveryResult.hidden_fault.error_qubit}`;
      $("investFaultReveal").style.color = "#fb7185";
    } else {
      $("investFaultReveal").textContent = "Submit a recovery first to reveal the answer.";
      $("investFaultReveal").style.color = "#ffc857";
    }
  }

  // ============================================================
  // STAGE INFO
  // ============================================================

  function updateStageInfo() {
    if (!investData || !investData.timeline) return;
    const e = investData.timeline[investStage];
    if (!e) return;
    $("investStepLabel").textContent = `Step ${e.step}/${investData.timeline.length} · ${e.title}`;
    $("investStepDesc").textContent = e.desc || "";
  }

  // ============================================================
  // EXPORT REPORT
  // ============================================================

  function exportReport() {
    if (!investData) { alert("Start an investigation first."); return; }
    const w = window.open("", "_blank");
    if (!w) return;
    const events = investData.timeline;
    const eventRows = events.map((e, i) => `
      <tr>
        <td>${e.step}</td>
        <td><strong>${e.title}</strong></td>
        <td>${e.desc}</td>
        <td>q[${e.qubits.join(", ")}]</td>
      </tr>`).join("");

    const recoveryHtml = recoveryResult ? `
      <h2>Recovery Result</h2>
      <div class="header">
        <table>
          <tr><td>User correction</td><td>X on q[${recoveryResult.user_correction.x.join(",")}] · Z on q[${recoveryResult.user_correction.z.join(",")}]</td></tr>
          <tr><td>Correct correction</td><td>X on q[${recoveryResult.correct_correction.x.join(",")}] · Z on q[${recoveryResult.correct_correction.z.join(",")}]</td></tr>
          <tr><td>Hidden fault</td><td>${recoveryResult.hidden_fault.error_type} on q${recoveryResult.hidden_fault.error_qubit}</td></tr>
          <tr><td>Diagnosis</td><td class="${recoveryResult.diagnosis_correct ? "success" : "fail"}">${recoveryResult.diagnosis_correct ? "✓ Correct" : "✗ Incorrect"}</td></tr>
          <tr><td>Recovery</td><td class="${recoveryResult.recovery_success ? "success" : "fail"}">${recoveryResult.recovery_success ? "✓ Logical state preserved" : "✗ Logical state lost"}</td></tr>
          <tr><td>Score</td><td><strong>${recoveryResult.score} / ${recoveryResult.max_score}</strong></td></tr>
          <tr><td>Attempts</td><td>${attempts}</td></tr>
          <tr><td>Total score</td><td>${totalScore}</td></tr>
        </table>
      </div>
      <h2>Explanation</h2>
      <p>${recoveryResult.explanation}</p>
    ` : "<p>No recovery submitted yet.</p>";

    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quantum Error Investigation Report</title>
      <style>
        body { font-family: "Manrope", sans-serif; background: #0a0f1f; color: #e8ecff; margin: 40px; }
        h1 { color: #a78bfa; border-bottom: 2px solid #5b8cff; padding-bottom: 10px; }
        h2 { color: #c9d3ff; margin-top: 30px; }
        .header { background: #111a33; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #243257; }
        .header table { width: 100%; border-collapse: collapse; }
        .header td { padding: 4px 12px; color: #bfc9f3; }
        .header td:first-child { color: #8f9bc7; font-weight: 600; width: 200px; }
        table.data { width: 100%; border-collapse: collapse; margin: 10px 0; }
        table.data th { background: #172345; color: #c9d3ff; padding: 8px 10px; text-align: left; font-size: 12px; border-bottom: 2px solid #5b8cff; }
        table.data td { padding: 8px 10px; border-bottom: 1px solid #243257; font-size: 12px; vertical-align: top; }
        .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #243257; color: #8f9bc7; font-size: 11px; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; background: linear-gradient(135deg, #8b6cff, #5b8cff); color: #fff; font-size: 10px; font-weight: 700; }
        .success { color: #3ddc97; font-weight: 700; }
        .fail { color: #ff6b81; font-weight: 700; }
      </style></head><body>
      <h1>Quantum Error Investigation Studio — Report <span class="badge">Investigation</span></h1>
      <div class="header">
        <table>
          <tr><td>Experiment ID</td><td>${investData.experiment_id}</td></tr>
          <tr><td>QEC Code</td><td>${investData.code_name}</td></tr>
          <tr><td>Input bit</td><td>|${investData.input_bit}⟩</td></tr>
          <tr><td>Logical basis</td><td>${investData.basis}</td></tr>
          <tr><td>Mode</td><td>${investData.mode}</td></tr>
          <tr><td>Seed</td><td>${investData.seed}</td></tr>
          <tr><td>Syndrome</td><td>${investData.evidence.syndrome_string} (${investData.evidence.syndrome_description})</td></tr>
          <tr><td>Logical success</td><td class="${investData.logical_success ? "success" : "fail"}">${investData.logical_success ? "✓ Corrected" : "✗ Failed"}</td></tr>
        </table>
      </div>
      <h2>Event Timeline</h2>
      <table class="data">
        <thead><tr><th>Step</th><th>Event</th><th>Description</th><th>Qubits</th></tr></thead>
        <tbody>${eventRows}</tbody>
      </table>
      ${recoveryHtml}
      <div class="footer">
        <strong>Quantum Error Investigation Studio</strong><br>
        Team: K. Devendra Reddy · Shaik Muzzammil · D. Guna Samhith<br>
        Every event is from the real Qiskit simulation — no mock data.
      </div>
      </body></html>`);
    w.document.close();
  }

  // ============================================================
  // INIT
  // ============================================================

  function init() {
    // Start button
    $("investStartBtn").addEventListener("click", startInvestigation);
    // Playback controls
    $("investPlayBtn").addEventListener("click", () => {
      if (investPlaying) pauseTimeline();
      else playTimeline();
    });
    $("investPrevBtn").addEventListener("click", () => goToStep(investStage - 1));
    $("investNextBtn").addEventListener("click", () => goToStep(investStage + 1));
    $("investRestartBtn").addEventListener("click", restartTimeline);
    $("investSpeed").addEventListener("change", (e) => { investSpeed = parseInt(e.target.value, 10); });
    // Export
    $("investExportReport").addEventListener("click", exportReport);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
