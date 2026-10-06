/** Local Admin: ordered durable jobs, one polling loop, independent outcomes. */
const AdminController = (() => {
  const STORAGE_KEY = "shadowing-active-jobs";
  const STATE_KEY = "shadowing-active-jobs-state";
  const LEGACY_KEY = "shadowing-active-job";
  const POLL_MS = 1500;
  const TERMINAL = new Set(["completed", "failed", "interrupted", "missing"]);
  const STATUSES = new Set(["queued", "running", "processing", ...TERMINAL]);

  function init(onContentCreated) {
    const el = id => document.getElementById(id);
    const modal = el("admin-modal"), openBtn = el("open-admin-btn");
    if (!modal || !openBtn) return;
    const submitBtn = el("start-generate-btn"), urlInput = el("admin-url");
    const levelSelect = el("admin-level"), speakerInput = el("admin-speaker");
    const logBox = el("admin-log-box"), countBox = el("admin-url-count");
    let jobs = [], settings = null, submitting = false, polling = false, pollTimer = null;
    let summary, notice;
    const rows = new Map();
    const parseUrls = () => urlInput.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const hasWork = () => jobs.some(job => !TERMINAL.has(job.status));
    const needsObservation = () => hasWork() || jobs.some(job => job.status === "completed" && !job.notified);

    function remember() {
      try {
        if (hasWork()) {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.map(job => job.job_id)));
          sessionStorage.setItem(STATE_KEY, JSON.stringify({ jobs, settings }));
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
          sessionStorage.removeItem(STATE_KEY);
        }
        sessionStorage.removeItem(LEGACY_KEY);
      } catch { /* Status polling still works without session storage. */ }
    }

    function resetDisplay() {
      logBox.textContent = "";
      rows.clear();
      summary = document.createElement("div");
      notice = document.createElement("div");
      logBox.appendChild(summary);
      logBox.appendChild(notice);
    }
    function message(text) {
      notice.textContent = text;
      logBox.style.display = "block";
    }
    function updateCount() {
      const count = parseUrls().length;
      countBox.textContent = `${count} / 5개 입력${count > 5 ? " — 최대 5개까지 입력 가능합니다" : ""}`;
    }
    function setBusy() {
      const busy = submitting || polling || hasWork();
      submitBtn.disabled = busy;
      submitBtn.textContent = busy ? "생성 중..." : "콘텐츠 생성 시작";
      for (const input of [urlInput, levelSelect, speakerInput]) input.disabled = busy;
    }
    function resultLink(result, container) {
      if (!result?.page_path) return;
      try {
        const url = new URL(result.page_path, window.location.href);
        if (url.origin !== window.location.origin || !url.pathname.startsWith("/pages/listening/")) return;
        const link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "생성된 쉐도잉 페이지 열기";
        container.appendChild(link);
      } catch { /* Ignore malformed or unsafe result links. */ }
    }
    function render() {
      const counts = { queued: 0, running: 0, completed: 0, failed: 0 };
      for (const job of jobs) {
        const category = job.status === "processing" ? "running" :
          (["interrupted", "missing"].includes(job.status) ? "failed" : job.status);
        counts[category]++;
        let row = rows.get(job.job_id);
        if (!row) {
          row = document.createElement("div");
          row.className = "admin-job-row";
          rows.set(job.job_id, row);
          logBox.appendChild(row);
        }
        const manual = Number.isInteger(job.level) ? `Level ${job.level}` : "자동 난이도";
        row.textContent = `${jobs.indexOf(job) + 1}. ${job.video_id || job.job_id} — ${job.status}` +
          `${job.reused ? " (기존 작업에 연결)" : ""} · ${manual}` +
          `${job.speaker ? ` · 화자: ${job.speaker}` : ""}` +
          `\n[${job.stage || job.status}] ${job.error || job.message || ""}` +
          `${job.result?.title ? `\n${job.result.title}` : ""}` +
          `${job.warnings?.length ? `\n${job.warnings.join("\n")}` : ""}` +
          `${job.persistence_error ? `\n상태 저장 경고: ${job.persistence_error}` : ""}` +
          `${job.transportError ? "\n서버 연결 확인 중 — 상태 조회를 자동 재시도합니다." : ""}` +
          `${job.refreshError ? "\n등록 완료. 목록을 새로고침해주세요." : ""}`;
        if (job.status === "completed") resultLink(job.result, row);
      }
      const begun = jobs.some(job => job.status !== "queued");
      const state = hasWork() ? (begun ? "running" : "queued") :
        (counts.failed ? "finished with failures" : "completed");
      summary.textContent = jobs.length ? `${state} · 전체 ${jobs.length} · 대기 ${counts.queued} · 진행 ${counts.running} · 완료 ${counts.completed} · 실패/중단 ${counts.failed}` : "";
      if (jobs.length) logBox.style.display = "block";
      setBusy();
    }
    async function requestJson(url, options = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, { ...options, cache: "no-store", signal: controller.signal });
        // A confirmed missing ID is terminal even if a proxy returns an HTML 404.
        const data = response.status === 404 ? {} : await response.json();
        return { response, data };
      } finally { clearTimeout(timeout); }
    }
    async function pollJobs() {
      if (polling || !needsObservation()) return;
      polling = true;
      clearTimeout(pollTimer);
      pollTimer = null;
      try {
        for (const job of jobs) {
          if (TERMINAL.has(job.status) && !(job.status === "completed" && !job.notified)) continue;
          try {
            if (!TERMINAL.has(job.status)) {
              const { response, data } = await requestJson(`/api/jobs/${encodeURIComponent(job.job_id)}`);
              if (response.status === 404) {
                Object.assign(job, { status: "missing", message: "저장된 작업을 찾을 수 없습니다. 서버/카탈로그를 확인해주세요.", transportError: false });
              } else {
                if (!response.ok || !STATUSES.has(data.status)) throw new Error("status unavailable");
                // Preserve request-position reuse metadata across GET responses.
                const { job_id, reused, notified } = job;
                Object.assign(job, data, { job_id, reused, notified, transportError: false });
              }
            }
          } catch { job.transportError = true; }
          if (job.status === "completed" && !job.notified) {
            job.notified = true;
            remember();
            try { if (onContentCreated) await onContentCreated(job.result || {}); }
            catch { job.refreshError = true; }
          }
          remember();
          render();
        }
      } finally {
        polling = false;
        setBusy();
        if (hasWork()) pollTimer = setTimeout(pollJobs, POLL_MS);
      }
    }

    resetDisplay();
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const legacy = sessionStorage.getItem(LEGACY_KEY);
      let ids = raw ? JSON.parse(raw) : legacy ? [legacy] : [];
      if (typeof ids === "string") ids = [ids];
      if (!Array.isArray(ids) || ids.length > 5 || ids.some(id => typeof id !== "string" || !id)) ids = [];
      let state = {};
      try { state = JSON.parse(sessionStorage.getItem(STATE_KEY) || "{}"); } catch { /* IDs are sufficient to reconnect. */ }
      jobs = [...new Set(ids)].map(id => {
        const saved = state?.jobs?.find(job => job.job_id === id && STATUSES.has(job.status));
        return saved || { job_id: id, status: "queued" };
      });
      settings = state?.settings;
      if (settings) {
        urlInput.value = settings.urls.join("\n");
        levelSelect.value = settings.level;
        speakerInput.value = settings.speaker;
      }
      remember();
    } catch { /* Invalid storage cannot prevent a fresh submission. */ }
    updateCount();
    urlInput.addEventListener("input", updateCount);
    function openModal() {
      modal.classList.add("active");
      if (hasWork() || submitting || polling) { setBusy(); return; }
      jobs = [];
      settings = null;
      urlInput.value = "";
      levelSelect.value = "auto";
      speakerInput.value = "";
      resetDisplay();
      logBox.style.display = "none";
      updateCount();
      setBusy();
      urlInput.focus();
    }
    const closeModal = () => modal.classList.remove("active");
    openBtn.addEventListener("click", openModal);
    el("close-admin-btn")?.addEventListener("click", closeModal);
    el("cancel-admin-btn")?.addEventListener("click", closeModal);
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    submitBtn.addEventListener("click", async () => {
      if (hasWork() || submitting || polling) return;
      const urls = parseUrls();
      updateCount();
      if (!urls.length || urls.length > 5) {
        message("1개 이상, 최대 5개까지 입력 가능합니다. 한 줄에 하나씩 입력해주세요.");
        urlInput.focus();
        return;
      }
      submitting = true;
      jobs = [];
      resetDisplay();
      setBusy();
      message("작업을 서버에 등록하는 중입니다.");
      const level = levelSelect.value;
      settings = { urls, level, speaker: speakerInput.value };
      try {
        const { response, data } = await requestJson("/api/videos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(urls.length === 1 ? { url: urls[0] } : { urls }),
            level: level === "auto" ? null : Number(level), auto_level: level === "auto",
            speaker: speakerInput.value.trim() || null }),
        });
        if (response.status === 400 || response.status === 503) {
          message(data.message || "작업이 접수되지 않았습니다.");
          return;
        }
        const accepted = data.jobs || (data.job_id ? [{ job_id: data.job_id, status: data.status }] : []);
        if (response.status !== 202 || accepted.length !== urls.length ||
            accepted.some(job => !job.job_id || !STATUSES.has(job.status))) throw new Error("ambiguous response");
        jobs = accepted;
        remember();
        message("작업이 접수되었습니다. 각 영상의 진행 상태를 확인합니다.");
        render();
        void pollJobs();
      } catch {
        message("접수 여부를 확인하지 못했습니다. 자동 재제출하지 않습니다. 서버와 카탈로그를 확인한 후 다시 제출해주세요. 이미 완료된 영상은 새 작업이 될 수 있습니다.");
      } finally { submitting = false; setBusy(); }
    });
    if (needsObservation()) {
      message("이전 작업의 진행 상태를 다시 확인합니다.");
      render();
      void pollJobs();
    }
  }
  return { init };
})();
window.AdminController = AdminController;
