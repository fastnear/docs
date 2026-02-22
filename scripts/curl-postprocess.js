/**
 * curl-postprocess.js
 *
 * DOM post-processor that modifies Redocly's auto-generated curl code samples:
 *   1. Replaces `-i` (include headers) with `-s` (silent) so output is pure JSON
 *   2. Appends `| jq` so the output is pretty-printed
 *
 * This is needed because Redocly hardcodes `-i` in curl generation with no
 * config option to change it. The samples are dynamic (update when the user
 * switches servers/examples), so we observe the DOM and reprocess on changes.
 *
 * Loaded via redocly.yaml scripts.head.
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var scheduled = false;

  function processCurlSamples() {
    // Find all <code> elements that might contain curl commands.
    // Redocly renders code samples inside <code> within <pre> blocks.
    var codeBlocks = document.querySelectorAll('pre code, code');

    for (var i = 0; i < codeBlocks.length; i++) {
      var block = codeBlocks[i];
      var text = block.textContent || '';

      // Only target curl commands that still have -i
      if (text.indexOf('curl -i ') === -1) {
        // Check if we need to add | jq to already-processed blocks
        if (text.indexOf('curl -s ') !== -1 && !text.trimEnd().endsWith('| jq')) {
          appendJq(block);
        }
        continue;
      }

      // Replace -i with -s in text nodes (preserves syntax highlighting spans)
      replaceInTextNodes(block, 'curl -i ', 'curl -s ');

      // Append | jq if not already present
      if (!block.textContent.trimEnd().endsWith('| jq')) {
        appendJq(block);
      }
    }
  }

  function replaceInTextNodes(el, find, replace) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      if (node.textContent.indexOf(find) !== -1) {
        node.textContent = node.textContent.replace(find, replace);
        return; // Only need to replace the first occurrence
      }
    }
  }

  function appendJq(el) {
    // Find the last non-empty text node and append | jq
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var lastNode = null;
    var node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim()) {
        lastNode = node;
      }
    }
    if (lastNode) {
      lastNode.textContent = lastNode.textContent.replace(/\s*$/, '') + ' | jq';
    }
  }

  function scheduleProcess() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () {
      scheduled = false;
      processCurlSamples();
    }, 50);
  }

  // Process on initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleProcess);
  } else {
    scheduleProcess();
  }

  // Re-process when DOM changes (server/example switches cause re-renders)
  new MutationObserver(scheduleProcess).observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
