/** Local Admin: ordered durable jobs, one polling loop, independent outcomes. */
const AdminController = (() => {
  const STORAGE_KEY = "shadowing-active-jobs";
  const STATE_KEY = "shadowing-active-jobs-state";
  const LEGACY_KEY = "shadowing-active-job";
  const HISTORY_KEY = "shadowing-publication-jobs-v1";
  const POLL_MS = 1500;
  const TERMINAL = new Set(["completed", "generated", "failed", "generation_failed", "interrupted", "missing"]);
  const STATUSES = new Set(["queued", "running", "processing", ...TERMINAL]);
  const PUBLICATION_ACTIVE = new Set(["pending", "exporting", "pushing", "deploying", "verifying", "retry_wait"]);
  const PUBLICATION_LABELS = {
    pending: "Private 저장 완료 · 공개 반영 대기 중...",
    exporting: "공개 저장소 반영 중...",
    pushing: "GitHub 푸시 중...",
    deploying: "GitHub Pages 배포 대기 중...",
    verifying: "Live URL 검증 중...",
    live_verified: "Live 배포 완료",
    retry_wait: "공개 반영 일시 실패 · 자동 재시도 대기 중...",
    blocked: "콘텐츠 생성·Private 저장 완료 / 공개 반영 차단 — 설정 또는 무결성 점검이 필요합니다.",
    publication_failed: "생성 완료 / 공개 배포 실패",
    unverified: "로컬 저장 완료 · 공개 반영 미확인",
    not_applicable: "생성 처리 완료 · 공개 대상 아님",
  };
  const generationState = job => job.generation_status || ({ completed: "generated", failed: "generation_failed", processing: "running" }[job.status] || job.status);
  const publicationState = job => generationState(job) === "generated" ? job.publication_stage || "unverified" : null;
  const shouldPoll = job => !TERMINAL.has(job.status) || PUBLICATION_ACTIVE.has(publicationState(job));
  const notificationKey = job => job.publication_id || job.live_url || "missing-live-link";
  const shouldNotify = job => publicationState(job) === "live_verified" && job.notifiedPublication !== notificationKey(job);
  function retryTime(value) {
    const date = new Date(typeof value === "number" ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString("ko-KR") : "시간 확인 중";
  }

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
    const retrying = new Set();
    const parseUrls = () => urlInput.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const hasWork = () => jobs.some(shouldPoll) || retrying.size > 0;
    const needsObservation = () => hasWork() || jobs.some(shouldNotify);

    function remember() {
      const state = JSON.stringify({ version: 1, jobs, settings });
      try { localStorage.setItem(HISTORY_KEY, state); }
      catch { /* Session fallback still retains terminal outcomes after refresh. */ }
      try {
        sessionStorage.setItem(STATE_KEY, state);
        if (hasWork()) {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.map(job => job.job_id)));
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
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
      submitBtn.textContent = busy ? "생성·공개 반영 진행 중..." : "콘텐츠 생성 시작";
      for (const input of [urlInput, levelSelect, speakerInput]) input.disabled = busy;
    }
    function safeLessonUrl(value, isPublic = false) {
      if (typeof value !== "string" || /[\\\u0000-\u001f]/.test(value)) return null;
      try {
        const decoded = decodeURIComponent(value);
        if (decoded.split("/").some(part => part === "..") || /[\\\u0000-\u001f]/.test(decoded)) return null;
        const url = new URL(value, window.location.href);
        const origin = isPublic ? "https://tonykks.github.io" : window.location.origin;
        const prefix = isPublic ? "/tony-english-shadowing/pages/listening/" : "/pages/listening/";
        if (url.origin !== origin || !url.pathname.startsWith(prefix) || !url.pathname.endsWith(".html") ||
            url.username || url.password || url.search || url.hash) return null;
        return url.href;
      } catch { return null; }
    }
    function resultLink(value, container, isPublic = false) {
      const href = safeLessonUrl(value, isPublic);
      if (!href) return;
      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = isPublic ? "Live 학습 페이지 열기" : "로컬 저장 페이지 열기";
      container.appendChild(document.createElement("br"));
      container.appendChild(link);
    }
    async function retryPublication(batchId) {
      if (retrying.has(batchId)) return;
      retrying.add(batchId);
      render();
      try {
        const { response } = await requestJson(`/api/batches/${encodeURIComponent(batchId)}/retry-publication`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
        });
        if (!response.ok) {
          message("공개 반영 재시도를 시작하지 못했습니다. 서버의 설정·무결성 점검 결과를 확인해주세요. 콘텐츠는 로컬에 보존되어 있습니다.");
          return;
        }
        for (const job of jobs) {
          if (job.batch_id === batchId && generationState(job) === "generated") {
            job.publication_stage = "pending";
            job.publication_error = null;
            job.publication_retry_at = null;
          }
        }
        message("공개 반영만 다시 확인합니다. 콘텐츠를 재생성하지 않습니다.");
      } catch {
        message("재시도 접수 여부를 확인하지 못했습니다. 상태를 다시 조회합니다. 콘텐츠를 재생성하지 않습니다.");
        // An accepted retry may have lost its response. Reconcile the existing
        // batch once through GET; never repeat the POST automatically.
        for (const job of jobs) if (job.batch_id === batchId) job.recheck = true;
      } finally {
        retrying.delete(batchId);
        remember();
        render();
        void pollJobs();
      }
    }
    function render() {
      const counts = { queued: 0, running: 0, generated: 0, failed: 0, live: 0, publishing: 0, publicationFailed: 0 };
      for (const job of jobs) {
        const generation = generationState(job), publication = publicationState(job);
        const category = ["generation_failed", "interrupted", "missing"].includes(generation) ? "failed" : generation;
        if (category in counts) counts[category]++;
        if (publication === "live_verified") counts.live++;
        if (PUBLICATION_ACTIVE.has(publication)) counts.publishing++;
        if (["blocked", "publication_failed"].includes(publication)) counts.publicationFailed++;
        let row = rows.get(job.job_id);
        if (!row) {
          row = document.createElement("div");
          row.className = "admin-job-row";
          rows.set(job.job_id, row);
          logBox.appendChild(row);
        }
        const manual = Number.isInteger(job.level) ? `Level ${job.level}` : "자동 난이도";
        const generationLabel = generation === "running" ? "콘텐츠 생성 중..." : generation === "generated" ? "생성 완료" :
          generation === "generation_failed" ? "생성 실패" : generation === "not_applicable" ? "공개 대상 아님" : job.status;
        row.textContent = `${jobs.indexOf(job) + 1}. ${job.video_id || job.job_id} — ${generationLabel}` +
          `${job.reused ? " (기존 작업에 연결)" : ""} · ${manual}` +
          `${job.speaker ? ` · 화자: ${job.speaker}` : ""}` +
          `\n[${job.stage || job.status}] ${job.generation_error || job.error || job.message || ""}` +
          `${generation === "generated" ? `\n${PUBLICATION_LABELS[publication] || "공개 상태 확인 필요"}` : ""}` +
          `${job.publication_error ? `\n공개 반영 사유: ${job.publication_error}` : ""}` +
          `${publication === "retry_wait" && job.publication_retry_at ? `\n다음 재시도 (현지 시간): ${retryTime(job.publication_retry_at)}` : ""}` +
          `${job.result?.title ? `\n${job.result.title}` : ""}` +
          `${job.warnings?.length ? `\n${job.warnings.join("\n")}` : ""}` +
          `${job.persistence_error ? `\n상태 저장 경고: ${job.persistence_error}` : ""}` +
          `${job.transportError ? "\n서버 연결 확인 중 — 상태 조회를 자동 재시도합니다." : ""}` +
          `${job.refreshError ? "\n등록 완료. 목록을 새로고침해주세요." : ""}`;
        if (generation === "generated") resultLink(job.result?.page_path, row);
        if (publication === "live_verified") {
          resultLink(job.live_url, row, true);
          if (!safeLessonUrl(job.live_url, true)) {
            const warning = document.createElement("span");
            warning.textContent = " Live 링크를 확인할 수 없습니다.";
            row.appendChild(warning);
          }
        }
        if (generation === "generated" && ["blocked", "publication_failed"].includes(publication) && job.batch_id) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "공개 반영만 재시도";
          button.disabled = retrying.has(job.batch_id);
          button.addEventListener("click", () => retryPublication(job.batch_id));
          row.appendChild(document.createElement("br"));
          row.appendChild(button);
        }
      }
      const begun = jobs.some(job => job.status !== "queued");
      const state = hasWork() ? (begun ? "running" : "queued") :
        (counts.failed || counts.publicationFailed ? "finished with failures" : counts.live === jobs.length ? "completed" : "saved locally");
      summary.textContent = jobs.length ? `${state} · 전체 ${jobs.length} · 대기 ${counts.queued} · 생성 중 ${counts.running} · 생성 완료 ${counts.generated} · 생성 실패/중단 ${counts.failed} · 공개 진행 ${counts.publishing} · Live 완료 ${counts.live} · 공개 실패/차단 ${counts.publicationFailed}` : "";
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
      if (polling || !(needsObservation() || jobs.some(job => job.recheck))) return;
      polling = true;
      clearTimeout(pollTimer);
      pollTimer = null;
      try {
        for (const job of jobs) {
          if (!shouldPoll(job) && !shouldNotify(job) && !job.recheck) continue;
          try {
            if (shouldPoll(job) || job.recheck) {
              const query = job.batch_id ? `?batch_id=${encodeURIComponent(job.batch_id)}` : "";
              const { response, data } = await requestJson(`/api/jobs/${encodeURIComponent(job.job_id)}${query}`);
              if (response.status === 404) {
                Object.assign(job, { status: "missing", generation_status: "missing", publication_stage: "unverified", recheck: false,
                  message: "저장된 작업을 찾을 수 없습니다. 서버/카탈로그를 확인해주세요.", transportError: false });
              } else {
                if (!response.ok || !STATUSES.has(data.status) ||
                    (data.publication_stage && !Object.hasOwn(PUBLICATION_LABELS, data.publication_stage))) throw new Error("status unavailable");
                // Preserve request-position reuse metadata across GET responses.
                const { job_id, batch_id, reused, notifiedPublication } = job;
                Object.assign(job, data, { job_id, batch_id: batch_id || data.batch_id, reused, notifiedPublication, transportError: false, recheck: false });
              }
            }
          } catch { job.transportError = true; }
          if (shouldNotify(job)) {
            const liveUrl = safeLessonUrl(job.live_url, true);
            job.notifiedPublication = notificationKey(job);
            remember();
            try { if (liveUrl && onContentCreated) await onContentCreated({ ...job.result, live_url: liveUrl, publication_id: job.publication_id, batch_id: job.batch_id }); }
            catch { job.refreshError = true; }
          }
          remember();
          render();
        }
      } finally {
        polling = false;
        setBusy();
        if (hasWork() || jobs.some(job => job.recheck)) pollTimer = setTimeout(pollJobs, POLL_MS);
      }
    }

    resetDisplay();
    try {
      let raw, legacy, sessionState;
      try {
        raw = sessionStorage.getItem(STORAGE_KEY);
        legacy = sessionStorage.getItem(LEGACY_KEY);
        sessionState = sessionStorage.getItem(STATE_KEY);
      } catch { /* Persistent storage may still be available. */ }
      let state = {};
      let savedHistory;
      try { savedHistory = localStorage.getItem(HISTORY_KEY); } catch { /* Session fallback. */ }
      try { state = JSON.parse(savedHistory || sessionState || "{}"); } catch { /* IDs are sufficient to reconnect. */ }
      let ids = state?.jobs?.map(job => job.job_id) || (raw ? JSON.parse(raw) : legacy ? [legacy] : []);
      if (typeof ids === "string") ids = [ids];
      if (!Array.isArray(ids) || ids.length > 5 || ids.some(id => typeof id !== "string" || !id)) ids = [];
      jobs = [...new Set(ids)].map(id => {
        const saved = state?.jobs?.find(job => job.job_id === id && STATUSES.has(job.status));
        return saved || { job_id: id, status: "queued" };
      });
      settings = state?.settings;
      if (settings && Array.isArray(settings.urls)) {
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
      // Keep the previous results, including blocked/partial batches, visible.
      // A fresh accepted submission replaces the displayed batch.
      urlInput.value = "";
      levelSelect.value = "auto";
      speakerInput.value = "";
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
      setBusy();
      message("작업을 서버에 등록하는 중입니다.");
      const level = levelSelect.value;
      const requestedSettings = { urls, level, speaker: speakerInput.value };
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
        resetDisplay();
        jobs = accepted.map(job => ({ ...job, batch_id: job.batch_id || data.batch_id }));
        settings = requestedSettings;
        remember();
        message("작업이 접수되었습니다. 각 영상의 진행 상태를 확인합니다.");
        render();
        void pollJobs();
      } catch {
        message("접수 여부를 확인하지 못했습니다. 자동 재제출하지 않습니다. 서버와 카탈로그를 확인한 후 다시 제출해주세요. 이미 완료된 영상은 새 작업이 될 수 있습니다.");
      } finally { submitting = false; setBusy(); }
    });
    if (jobs.length) render();
    if (needsObservation()) {
      message("이전 작업의 진행 상태를 다시 확인합니다.");
      render();
      void pollJobs();
    }
  }
  return { init };
})();
window.AdminController = AdminController;
