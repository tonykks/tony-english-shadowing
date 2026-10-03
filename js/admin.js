/**
 * admin.js — Local Admin video generation controller
 */

const AdminController = (() => {
  function init(onContentCreated) {
    const modal = document.getElementById("admin-modal");
    const openBtn = document.getElementById("open-admin-btn");
    const closeBtn = document.getElementById("close-admin-btn");
    const cancelBtn = document.getElementById("cancel-admin-btn");
    const submitBtn = document.getElementById("start-generate-btn");
    const urlInput = document.getElementById("admin-url");
    const levelSelect = document.getElementById("admin-level");
    const speakerInput = document.getElementById("admin-speaker");
    const logBox = document.getElementById("admin-log-box");

    if (!modal || !openBtn) return;

    function openModal() {
      modal.classList.add("active");
      urlInput.value = "";
      speakerInput.value = "";
      logBox.style.display = "none";
      logBox.innerHTML = "";
      submitBtn.disabled = false;
      submitBtn.textContent = "콘텐츠 생성 시작";
      urlInput.focus();
    }

    function closeModal() {
      modal.classList.remove("active");
    }

    openBtn.addEventListener("click", openModal);
    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);

    modal.addEventListener("click", e => {
      if (e.target === modal) closeModal();
    });

    submitBtn.addEventListener("click", async () => {
      const url = urlInput.value.trim();
      if (!url) {
        alert("YouTube URL 또는 Video ID를 입력해주세요.");
        urlInput.focus();
        return;
      }

      const levelVal = levelSelect.value;
      const speaker = speakerInput.value.trim();

      submitBtn.disabled = true;
      submitBtn.textContent = "생성 중... (잠시만 기다려주세요)";
      logBox.style.display = "block";
      logBox.innerHTML = `<div>[1/4] 유튜브 자막 및 메타데이터 수집 중...</div>`;

      try {
        const payload = {
          url: url,
          level: levelVal === "auto" ? null : parseInt(levelVal, 10),
          auto_level: levelVal === "auto",
          speaker: speaker || null,
        };

        logBox.innerHTML += `<div>[2/4] Vertex AI 및 대본 정밀 분석 중...</div>`;
        const resp = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await resp.json();
        if (!resp.ok || data.status === "BLOCKED" || data.status === "ERROR") {
          throw new Error(data.message || "영상 생성에 실패했습니다.");
        }

        logBox.innerHTML += `<div>[3/4] 00_meta~06_hangman 및 개별 학습 페이지 완성!</div>`;
        logBox.innerHTML += `<div style="color: #4ade80; font-weight: bold; margin-top: 0.5rem;">[4/4] 성공: ${data.title || data.video_id} 등록 완료!</div>`;
        logBox.innerHTML += `<div style="margin-top: 0.5rem;"><a href="${data.page_path}" target="_blank" style="color: #38bdf8; text-decoration: underline;">👉 생성된 쉐도잉 페이지 바로 열기</a></div>`;

        submitBtn.textContent = "등록 완료";
        if (onContentCreated) {
          onContentCreated(data);
        }
      } catch (err) {
        console.error("Content generation error:", err);
        logBox.innerHTML += `<div style="color: #f43f5e; font-weight: bold; margin-top: 0.5rem;">오류 발생: ${err.message}</div>`;
        submitBtn.disabled = false;
        submitBtn.textContent = "다시 시도";
      }
    });
  }

  return { init };
})();
window.AdminController = AdminController;
