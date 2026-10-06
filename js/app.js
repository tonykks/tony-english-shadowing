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
      showChannel(activeChannel, allItems.filter(item => (item.channel || "기타 채널") === activeChannel));
    }
    if (activeSpeaker && speakerDetailView.style.display === "block") {
      showSpeaker(activeSpeaker, allItems.filter(item => (item.speaker || "").trim() === activeSpeaker));
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
      // If user types in search while on channels/speakers tab, switch to All Content tab for instant search results
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
    if (totalCountEl) totalCountEl.textContent = allItems.length;
  }

  function renderChannelChips() {
    const channelSet = new Set(allItems.map(i => i.channel).filter(Boolean));
    const sorted = Array.from(channelSet).sort();

    // Preserve the first "전체 채널" button
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
    return allItems.filter(item => {
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
    ChannelExplorer.renderChannels(allItems, channelsGridEl, showChannel);
  }
  function showChannel(channelName, channelItems) {
    activeChannel = channelName;
    channelsGridEl.style.display = "none";
    channelDetailView.style.display = "block";
    channelDetailTitle.textContent = `${channelName} (${channelItems.length}편)`;
    renderCards(channelItems, channelCardsGrid);
  }

  function renderSpeakersExplorer() {
    SpeakerExplorer.renderSpeakers(allItems, speakersGridEl, showSpeaker);
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
      const card = document.createElement("article");
      card.className = "lesson-card";

      const vid = item.video_id;
      const thumbUrl = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      const level = item.level || 1;
      const levelClass = `badge-level-${Math.min(level, 4)}`;
      const speakerBadge = item.speaker ? `
        <div class="badge-speaker">
          <span>🎙️</span>${escapeHtml(item.speaker)}
        </div>
      ` : "";

      const sections = item.section_count || 6;
      const words = item.wordcard_count || 10;
      const channelIcon = ChannelExplorer.getIcon(item.channel);

      card.innerHTML = `
        <div class="card-thumbnail-wrap">
          <img class="card-thumbnail" src="${thumbUrl}" alt="${escapeHtml(item.title)}" loading="lazy">
          <div class="card-badges">
            <span class="badge-level ${levelClass}">Level ${level}</span>
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
      containerEl.appendChild(card);
    });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
});
