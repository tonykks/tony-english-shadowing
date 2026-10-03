(function loadLegacyMain() {
  const script = document.createElement("script");
  const currentSrc = document.currentScript?.src || window.location.href;
  script.src = new URL("../main.js", currentSrc).href;
  script.defer = true;
  document.head.appendChild(script);
})();
