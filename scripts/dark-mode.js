// @theme/scripts/dark-mode.js
(function() {
  var params = new URLSearchParams(window.location.search);
  // Support both Redocly-native ?colorSchema=dark and our legacy ?darkMode flag
  var mode = params.get('colorSchema');
  if (!mode && params.has('darkMode')) mode = 'dark';
  if (mode === 'dark' || mode === 'light') {
    // Use className = (full replacement) to match Redocly's own pattern.
    // This overwrites whatever Redocly's SSR script set moments ago.
    document.documentElement.className = mode;
    // Persist so React's initActiveColorMode and future page loads stay in sync
    try { localStorage.setItem('colorSchema', mode); } catch(e) {}
  }
})();
