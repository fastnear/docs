// @theme/scripts/dark-mode.js
(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const darkMode = urlParams.has('darkMode');
  if (darkMode) {
    document.documentElement.classList.add('dark', 'dark-theme');
  } else {
    document.documentElement.classList.add('light-theme');
  }
})();
