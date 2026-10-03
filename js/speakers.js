/**
 * speakers.js — Speaker/Instructor exploration and grouping
 */

const SpeakerExplorer = (() => {
  const speakerIcons = {
    "Steve Jobs": "🍎",
    "Barack Obama": "🦅",
    "Simon Sinek": "💡",
  };

  function getSpeakerIcon(speakerName) {
    return speakerIcons[speakerName] || "🎙️";
  }

  function renderSpeakers(items, containerEl, onSelectSpeaker) {
    if (!containerEl) return;

    // Filter items with designated speaker
    const speakerMap = new Map();
    items.forEach(item => {
      if (item.speaker && item.speaker.trim()) {
        const spk = item.speaker.trim();
        if (!speakerMap.has(spk)) {
          speakerMap.set(spk, []);
        }
        speakerMap.get(spk).push(item);
      }
    });

    containerEl.innerHTML = "";

    if (speakerMap.size === 0) {
      containerEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; background: var(--bg-card); border: 1px solid var(--border-glass); border-radius: var(--radius-lg);">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🎙️</div>
          <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem; color: #fff;">등록된 단독 화자/강연자가 없습니다</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 500px; margin: 0 auto 1.25rem;">
            일반적인 영어 학습/동화 영상은 [채널별 보기]에서 관리됩니다.<br>
            Steve Jobs, Barack Obama 등 고유 화자가 학습 선택의 핵심인 명연설 영상이 등록되면 이곳에 표시됩니다.
          </p>
        </div>
      `;
      return;
    }

    const sortedSpeakers = Array.from(speakerMap.entries()).sort((a, b) => b[1].length - a[1].length);

    sortedSpeakers.forEach(([speakerName, speakerItems]) => {
      const card = document.createElement("div");
      card.className = "speaker-card";
      card.innerHTML = `
        <div class="speaker-icon">${getSpeakerIcon(speakerName)}</div>
        <div class="speaker-name">${escapeHtml(speakerName)}</div>
        <div class="speaker-count">${speakerItems.length}편의 명연설 쉐도잉</div>
      `;
      card.addEventListener("click", () => {
        if (onSelectSpeaker) {
          onSelectSpeaker(speakerName, speakerItems);
        }
      });
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

  return {
    renderSpeakers,
    getSpeakerIcon,
  };
})();
window.SpeakerExplorer = SpeakerExplorer;
