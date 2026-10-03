/**
 * channels.js — Channel exploration and grouping
 */

const ChannelExplorer = (() => {
  const channelIcons = {
    "English Avenue": "🎓",
    "Learn English With Listening": "🎧",
    "This Day in English Plus": "📖",
    "Professional English": "💼",
  };

  function getIcon(channelName) {
    return channelIcons[channelName] || "📺";
  }

  function renderChannels(items, containerEl, onSelectChannel) {
    if (!containerEl) return;

    // Group items by channel
    const channelMap = new Map();
    items.forEach(item => {
      const ch = item.channel || "기타 채널";
      if (!channelMap.has(ch)) {
        channelMap.set(ch, []);
      }
      channelMap.get(ch).push(item);
    });

    // Sort by count descending
    const sortedChannels = Array.from(channelMap.entries()).sort((a, b) => b[1].length - a[1].length);

    containerEl.innerHTML = "";
    sortedChannels.forEach(([channelName, channelItems]) => {
      const card = document.createElement("div");
      card.className = "channel-card";
      card.innerHTML = `
        <div class="channel-icon">${getIcon(channelName)}</div>
        <div class="channel-name">${escapeHtml(channelName)}</div>
        <div class="channel-count">${channelItems.length}편의 쉐도잉 영상</div>
      `;
      card.addEventListener("click", () => {
        if (onSelectChannel) {
          onSelectChannel(channelName, channelItems);
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
    renderChannels,
    getIcon,
  };
})();
window.ChannelExplorer = ChannelExplorer;
