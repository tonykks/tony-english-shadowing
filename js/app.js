/**
 * app.js — Main application coordinator for Tony's English Shadowing
 */

function sortCatalogNewestFirst(items) {
  const sequence = item => {
    const value = Number(item.sequence);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  // Modern JS sort is stable: ties and invalid sequences retain source order.
  return [...items].sort((a, b) => sequence(b) - sequence(a));
}

document.addEventListener("DOMContentLoaded", async () => {
  let allItems = [];
  let showHidden = false;
  const selectedVideoIds = new Set();
  let publicationPollTimer = null;

  let currentFilter = {
    search: "",
    level: "all",
    channel: "all",
  };
  let currentActiveTab = "all"; // "all" | "channels" | "speakers"
  let activeChannel = null;
  let activeSpeaker = null;

  // Elements
  const totalCountEl = document.getElementById("total-video-count");
  const allCountHintEl = document.getElementById("all-count-hint");
  const cardsGridEl = document.getElementById("cards-grid");
  const searchInput = document.getElementById("search-input");
  const searchClearBtn = document.getElementById("search-clear-btn");
  const levelChipsContainer = document.getElementById("level-chips");
  const channelChipsContainer = document.getElementById("channel-chips");

  // Admin Elements
  const toggleHiddenBtn = document.getElementById("toggle-hidden-btn");
  const adminSelectionBar = document.getElementById("admin-selection-bar");
  const adminSelectedCount = document.getElementById("admin-selected-count");
  const adminSelectAllBtn = document.getElementById("admin-select-all-btn");
  const adminClearSelectBtn = document.getElementById("admin-clear-select-btn");
  const adminHideBtn = document.getElementById("admin-hide-btn");
  const adminUnhideBtn = document.getElementById("admin-unhide-btn");
  const adminBarStatus = document.getElementById("admin-bar-status");

  // Nav buttons
  const navAllBtn = document.getElementById("nav-all-btn");
  const navChannelsBtn = document.getElementById("nav-channels-btn");
  const navSpeakersBtn = document.getElementById("nav-speakers-btn");

  // Views
  const viewAll = document.getElementById("view-all");
  const viewChannels = document.getElementById("view-channels");
  const viewSpeakers = document.getElementById("view-speakers");

  // Detail views
  const channelDetailView = document.getElementById("channel-detail-view");
  const channelCardsGrid = document.getElementById("channel-cards-grid");
  const channelDetailTitle = document.getElementById("channel-detail-title");
  const backToChannelsBtn = document.getElementById("back-to-channels-btn");

  const speakerDetailView = document.getElementById("speaker-detail-view");
  const speakerCardsGrid = document.getElementById("speaker-cards-grid");
  const speakerDetailTitle = document.getElementById("speaker-detail-title");
  const backToSpeakersBtn = document.getElementById("back-to-speakers-btn");

  const channelsGridEl = document.getElementById("channels-grid");
  const speakersGridEl = document.getElementById("speakers-grid");

  // Helper: Catalog visibility
  function getVisibleCatalog() {
    if (!DataSource.isLocal()) {
      // PUBLIC SITE: NEVER expose hidden items!
      return allItems.filter(item => !item.hidden);
    }
    if (!showHidden) {
      return allItems.filter(item => !item.hidden);
    }
    return allItems;
  }

  // 1. Check local admin mode & load catalog
  await DataSource.checkLocalMode();
  const catalog = await DataSource.loadCatalog();
  allItems = sortCatalogNewestFirst(catalog.items || []);

  updateStats();
  renderChannelChips();
  renderMainCards();
  renderChannelsExplorer();
  renderSpeakersExplorer();

  // 2. Initialize Admin Controller
  AdminController.init(async (newItem) => {
    const updatedCatalog = await DataSource.loadCatalog(true);
    allItems = sortCatalogNewestFirst(updatedCatalog.items || []);
    updateStats();
    renderChannelChips();
    renderMainCards();
    renderChannelsExplorer();
    renderSpeakersExplorer();
    if (activeChannel && channelDetailView.style.display === "block") {
      showChannel(activeChannel, getVisibleCatalog().filter(item => (item.channel || "기타 채널") === activeChannel));
    }
    if (activeSpeaker && speakerDetailView.style.display === "block") {
      showSpeaker(activeSpeaker, getVisibleCatalog().filter(item => (item.speaker || "").trim() === activeSpeaker));
    }
  });

  // 3. Tab switching
  function switchTab(tabId) {
    currentActiveTab = tabId;
    [navAllBtn, navChannelsBtn, navSpeakersBtn].forEach(b => b.classList.remove("active"));
    [viewAll, viewChannels, viewSpeakers].forEach(v => v.classList.remove("active"));

    if (tabId === "all") {
      navAllBtn.classList.add("active");
      viewAll.classList.add("active");
    } else if (tabId === "channels") {
      navChannelsBtn.classList.add("active");
      viewChannels.classList.add("active");
      channelDetailView.style.display = "none";
      channelsGridEl.style.display = "grid";
    } else if (tabId === "speakers") {
      navSpeakersBtn.classList.add("active");
      viewSpeakers.classList.add("active");
      speakerDetailView.style.display = "none";
      speakersGridEl.style.display = "grid";
    }
  }

  navAllBtn.addEventListener("click", () => switchTab("all"));
  navChannelsBtn.addEventListener("click", () => switchTab("channels"));
  navSpeakersBtn.addEventListener("click", () => switchTab("speakers"));

  // 4. Search & Filters
  let searchDebounceTimer = null;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchDebounceTimer);
    const query = e.target.value.trim();
    searchClearBtn.style.display = query ? "flex" : "none";

    searchDebounceTimer = setTimeout(() => {
      currentFilter.search = query.toLowerCase();
      if (currentActiveTab !== "all" && query) {
        switchTab("all");
      }
      renderMainCards();
    }, 180);
  });

  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchClearBtn.style.display = "none";
    currentFilter.search = "";
    renderMainCards();
    searchInput.focus();
  });

  levelChipsContainer.addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip");
    if (!chip) return;
    levelChipsContainer.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    currentFilter.level = chip.dataset.level || "all";
    if (currentActiveTab !== "all") switchTab("all");
    renderMainCards();
  });

  channelChipsContainer.addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip");
    if (!chip) return;
    channelChipsContainer.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    currentFilter.channel = chip.dataset.channel || "all";
    if (currentActiveTab !== "all") switchTab("all");
    renderMainCards();
  });

  // Admin Hidden Toggle
  if (toggleHiddenBtn) {
    toggleHiddenBtn.addEventListener("click", () => {
      showHidden = !showHidden;
      toggleHiddenBtn.classList.toggle("active", showHidden);
      toggleHiddenBtn.setAttribute("aria-pressed", showHidden ? "true" : "false");
      toggleHiddenBtn.innerHTML = showHidden
        ? '<span class="toggle-icon">👁️</span> 숨김 항목 포함 중'
        : '<span class="toggle-icon">👁️</span> 숨김 항목 보기';
      updateStats();
      renderChannelChips();
      renderMainCards();
      renderChannelsExplorer();
      renderSpeakersExplorer();
      updateSelectionBar();
    });
  }

  // Back buttons
  backToChannelsBtn.addEventListener("click", () => {
    channelDetailView.style.display = "none";
    channelsGridEl.style.display = "grid";
  });

  backToSpeakersBtn.addEventListener("click", () => {
    speakerDetailView.style.display = "none";
    speakersGridEl.style.display = "grid";
  });

  // Renderers
  function updateStats() {
    const visible = getVisibleCatalog();
    if (totalCountEl) {
      if (DataSource.isLocal() && showHidden) {
        const hiddenCount = allItems.filter(i => i.hidden).length;
        totalCountEl.textContent = `${visible.length} (숨김 ${hiddenCount}편 포함)`;
      } else {
        totalCountEl.textContent = visible.length;
      }
    }
  }

  function renderChannelChips() {
    const visible = getVisibleCatalog();
    const channelSet = new Set(visible.map(i => i.channel).filter(Boolean));
    const sorted = Array.from(channelSet).sort();

    channelChipsContainer.innerHTML = `
      <span class="chips-label">채널:</span>
      <button class="filter-chip ${currentFilter.channel === 'all' ? 'active' : ''}" data-channel="all">전체 채널</button>
    `;

    sorted.forEach(ch => {
      const btn = document.createElement("button");
      btn.className = `filter-chip ${currentFilter.channel === ch ? 'active' : ''}`;
      btn.dataset.channel = ch;
      btn.textContent = ch;
      channelChipsContainer.appendChild(btn);
    });
  }

  function getFilteredItems() {
    return getVisibleCatalog().filter(item => {
      // Level check
      if (currentFilter.level !== "all") {
        if (String(item.level) !== String(currentFilter.level)) {
          return false;
        }
      }

      // Channel check
      if (currentFilter.channel !== "all") {
        if (item.channel !== currentFilter.channel) {
          return false;
        }
      }

      // Search check
      if (currentFilter.search) {
        const q = currentFilter.search;
        const inTitle = (item.title || "").toLowerCase().includes(q);
        const inChannel = (item.channel || "").toLowerCase().includes(q);
        const inSpeaker = (item.speaker || "").toLowerCase().includes(q);
        const inTags = (item.tags || []).some(t => t.toLowerCase().includes(q));
        const inIntro = (item.introEn || "").toLowerCase().includes(q);
        if (!inTitle && !inChannel && !inSpeaker && !inTags && !inIntro) {
          return false;
        }
      }

      return true;
    });
  }

  function renderMainCards() {
    const filtered = getFilteredItems();
    if (allCountHintEl) allCountHintEl.textContent = `(${filtered.length}편)`;
    renderCards(filtered, cardsGridEl);
  }

  function renderChannelsExplorer() {
    ChannelExplorer.renderChannels(getVisibleCatalog(), channelsGridEl, showChannel);
  }
  function showChannel(channelName, channelItems) {
    activeChannel = channelName;
    channelsGridEl.style.display = "none";
    channelDetailView.style.display = "block";
    channelDetailTitle.textContent = `${channelName} (${channelItems.length}편)`;
    renderCards(channelItems, channelCardsGrid);
  }

  function renderSpeakersExplorer() {
    SpeakerExplorer.renderSpeakers(getVisibleCatalog(), speakersGridEl, showSpeaker);
  }
  function showSpeaker(speakerName, speakerItems) {
    activeSpeaker = speakerName;
    speakersGridEl.style.display = "none";
    speakerDetailView.style.display = "block";
    speakerDetailTitle.textContent = `${speakerName} 명연설 쉐도잉 (${speakerItems.length}편)`;
    renderCards(speakerItems, speakerCardsGrid);
  }

  function renderCards(items, containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = "";

    if (items.length === 0) {
      containerEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1.5rem; background: var(--bg-card); border: 1px solid var(--border-glass); border-radius: var(--radius-lg);">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔍</div>
          <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem; color: #fff;">검색 조건에 맞는 쉐도잉 영상이 없습니다</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted);">다른 검색어나 필터를 선택해보세요.</p>
        </div>
      `;
      return;
    }

    items.forEach(item => {
      const vid = item.video_id;
      const isHidden = Boolean(item.hidden);
      const isSelected = selectedVideoIds.has(vid);

      const card = document.createElement("article");
      card.className = `lesson-card${isHidden ? " is-hidden" : ""}${isSelected ? " selected" : ""}`;
      card.dataset.videoId = vid;

      const thumbUrl = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      const level = item.level || 1;
      const levelClass = `badge-level-${Math.min(level, 4)}`;
      const speakerBadge = item.speaker ? `
        <div class="badge-speaker">
          <span>🎙️</span>${escapeHtml(item.speaker)}
        </div>
      ` : "";
      const hiddenBadge = isHidden ? `
        <div class="badge-hidden" title="숨김 처리된 영상">
          <span>🚫</span>숨김
        </div>
      ` : "";

      const sections = item.section_count || 6;
      const words = item.wordcard_count || 10;
      const channelIcon = ChannelExplorer.getIcon(item.channel);

      const selectCheckboxHtml = DataSource.isLocal() ? `
        <label class="card-select-label" data-local-only title="영상 선택">
          <input type="checkbox" class="card-select-cb" data-video-id="${vid}" ${isSelected ? "checked" : ""}>
        </label>
      ` : "";

      card.innerHTML = `
        <div class="card-thumbnail-wrap">
          ${selectCheckboxHtml}
          <img class="card-thumbnail" src="${thumbUrl}" alt="${escapeHtml(item.title)}" loading="lazy">
          <div class="card-badges">
            <span class="badge-level ${levelClass}">Level ${level}</span>
            ${hiddenBadge}
            ${speakerBadge}
          </div>
          <a href="${item.href}" class="play-overlay" aria-label="${escapeHtml(item.title)} 학습 시작">
            <div class="play-btn-circle">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </div>
          </a>
        </div>
        <div class="card-body">
          <div class="card-channel">
            <span>${channelIcon}</span>
            <span>${escapeHtml(item.channel)}</span>
          </div>
          <h3 class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
          <p class="card-desc">${escapeHtml(item.introEn || "영어 듣기와 문장 쉐도잉을 위한 집중 학습 콘텐츠")}</p>
          <div class="card-metrics">
            <div class="metric-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              <span><strong>${sections}</strong>개 섹션</span>
            </div>
            <div class="metric-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
              <span><strong>${words}</strong>개 단어카드</span>
            </div>
          </div>
          <div class="card-actions">
            <a href="${item.href}" class="btn-start-shadowing">
              <span>▶</span>
              <span>쉐도잉 학습 시작</span>
            </a>
          </div>
        </div>
      `;

      if (DataSource.isLocal()) {
        const cb = card.querySelector(".card-select-cb");
        const label = card.querySelector(".card-select-label");
        if (label) {
          label.addEventListener("click", e => e.stopPropagation());
        }
        if (cb) {
          cb.addEventListener("click", e => e.stopPropagation());
          cb.addEventListener("change", e => {
            e.stopPropagation();
            if (e.target.checked) {
              selectedVideoIds.add(vid);
              card.classList.add("selected");
            } else {
              selectedVideoIds.delete(vid);
              card.classList.remove("selected");
            }
            updateSelectionBar();
          });
        }
      }

      containerEl.appendChild(card);
    });
  }

  // Selection Bar Controller
  function updateSelectionBar() {
    if (!adminSelectionBar || !DataSource.isLocal()) return;
    const count = selectedVideoIds.size;
    if (count === 0) {
      adminSelectionBar.hidden = true;
      return;
    }
    adminSelectionBar.hidden = false;
    if (adminSelectedCount) {
      adminSelectedCount.textContent = `${count}개 선택됨`;
    }
    const selectedItems = allItems.filter(i => selectedVideoIds.has(i.video_id));
    const hasNonHidden = selectedItems.some(i => !i.hidden);
    const hasHidden = selectedItems.some(i => i.hidden);

    if (adminHideBtn) {
      adminHideBtn.style.display = hasNonHidden ? "inline-flex" : "none";
    }
    if (adminUnhideBtn) {
      adminUnhideBtn.style.display = hasHidden ? "inline-flex" : "none";
    }
  }

  if (adminClearSelectBtn) {
    adminClearSelectBtn.addEventListener("click", () => {
      selectedVideoIds.clear();
      document.querySelectorAll(".card-select-cb").forEach(cb => cb.checked = false);
      document.querySelectorAll(".lesson-card.selected").forEach(c => c.classList.remove("selected"));
      updateSelectionBar();
    });
  }

  if (adminSelectAllBtn) {
    adminSelectAllBtn.addEventListener("click", () => {
      const visibleCards = document.querySelectorAll(".cards-grid .lesson-card");
      visibleCards.forEach(card => {
        const vid = card.dataset.videoId;
        if (vid) {
          selectedVideoIds.add(vid);
          card.classList.add("selected");
          const cb = card.querySelector(".card-select-cb");
          if (cb) cb.checked = true;
        }
      });
      updateSelectionBar();
    });
  }

  async function executeVisibilityMutation(action) {
    const isHide = action === "hide";
    const selectedItems = allItems.filter(i => selectedVideoIds.has(i.video_id));
    const targetIds = selectedItems
      .filter(i => isHide ? !i.hidden : i.hidden)
      .map(i => i.video_id);

    if (!targetIds.length) return;

    const btn = isHide ? adminHideBtn : adminUnhideBtn;
    if (btn) btn.disabled = true;

    if (adminBarStatus) {
      adminBarStatus.style.display = "flex";
      adminBarStatus.textContent = `${targetIds.length}개 영상 ${isHide ? "숨김" : "숨김 해제"} 처리 중...`;
    }

    try {
      const endpoint = isHide ? "/api/videos/hide" : "/api/videos/unhide";
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_ids: targetIds }),
      });
      const data = await resp.json();
      if (!resp.ok || data.status === "ERROR") {
        throw new Error(data.message || "요청 실패");
      }

      selectedVideoIds.clear();
      const updatedCatalog = await DataSource.loadCatalog(true);
      allItems = sortCatalogNewestFirst(updatedCatalog.items || []);
      updateStats();
      renderChannelChips();
      renderMainCards();
      renderChannelsExplorer();
      renderSpeakersExplorer();
      updateSelectionBar();

      if (adminBarStatus) {
        adminBarStatus.textContent = `Private 저장 완료 · 공개 배포 시작 (ID: ${data.batch_id?.slice(0, 8) || "진행 중"})...`;
      }

      if (data.batch_id) {
        pollBatchPublication(data.batch_id, isHide ? "숨김" : "숨김 해제");
      }
    } catch (err) {
      if (adminBarStatus) {
        adminBarStatus.textContent = `오류: ${err.message}`;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function pollBatchPublication(batchId, label) {
    clearInterval(publicationPollTimer);
    const stages = {
      pending: "Private 저장 완료 · 공개 반영 대기 중...",
      exporting: "공개 저장소 반영 중...",
      pushing: "GitHub 푸시 중...",
      deploying: "GitHub Pages 배포 대기 중...",
      verifying: "Live URL 검증 중...",
      live_verified: "Live 배포 및 검증 완료! (공개 사이트 반영됨)",
    };

    publicationPollTimer = setInterval(async () => {
      try {
        const resp = await fetch(`/api/batches/${batchId}`);
        if (!resp.ok) return;
        const batch = await resp.json();
        const stage = batch.publication_stage;
        const statusText = stages[stage] || `공개 단계: ${stage}`;

        if (adminBarStatus) {
          adminBarStatus.textContent = `[${label}] ${statusText}`;
        }

        if (stage === "live_verified") {
          clearInterval(publicationPollTimer);
          setTimeout(() => {
            if (adminBarStatus && selectedVideoIds.size === 0) {
              adminBarStatus.style.display = "none";
            }
          }, 6000);
        } else if (stage === "blocked" || stage === "publication_failed") {
          clearInterval(publicationPollTimer);
          if (adminBarStatus) {
            adminBarStatus.textContent = `[${label}] 공개 반영 실패: ${batch.publication_error || "오류"}`;
          }
        }
      } catch {
        // network retry
      }
    }, 1800);
  }

  if (adminHideBtn) {
    adminHideBtn.addEventListener("click", () => executeVisibilityMutation("hide"));
  }
  if (adminUnhideBtn) {
    adminUnhideBtn.addEventListener("click", () => executeVisibilityMutation("unhide"));
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
});
