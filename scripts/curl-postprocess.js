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
 * Redocly renders code samples as:
 *   <pre data-component-name="CodeBlock/CodeBlockContainer" data-testid="source-code">
 *     <span class='line'><span class="token ...">curl</span> ...</span>
 *   </pre>
 * Shiki syntax highlighting splits tokens across <span> elements, so "curl"
 * and "-i" are typically in separate text nodes.
 *
 * The copy button uses copy-to-clipboard (document.execCommand), so we
 * intercept the 'copy' event to transform curl commands on copy.
 *
 * Loaded via redocly.yaml scripts.head.
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // --- Clipboard interception ---
  // Redocly's copy button uses copy-to-clipboard (document.execCommand),
  // not navigator.clipboard.writeText. copy-to-clipboard adds its own
  // listener on the temporary <span> that calls stopPropagation(), so a
  // bubbling listener on document never fires. Use capture phase instead:
  // capture runs top-down (document first) before the span's listener.
  document.addEventListener('copy', function (e) {
    var selection = window.getSelection();
    var text = selection ? selection.toString() : '';
    if (text.trimStart().startsWith('curl')) {
      e.preventDefault();
      e.clipboardData.setData('text/plain', transformCurlText(text));
    }
  }, true);

  function transformCurlText(text) {
    // Replace -i with -s
    if (text.indexOf('curl -i') !== -1) {
      text = text.replace('curl -i', 'curl -s');
    }
    // Append | jq if not present
    if (!text.trimEnd().endsWith('| jq')) {
      text = text.trimEnd() + ' | jq';
    }
    return text;
  }

  // --- DOM post-processing ---
  var scheduled = false;

  function processCurlSamples() {
    var blocks = document.querySelectorAll(
      'pre[data-component-name="CodeBlock/CodeBlockContainer"]'
    );

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var text = block.textContent || '';

      // Only process curl commands (first non-whitespace is "curl")
      if (!text.trimStart().startsWith('curl')) continue;

      // Replace -i with -s
      if (text.indexOf('curl -i') !== -1) {
        replaceFlagInTextNodes(block);
      }

      // Append | jq if not already present
      text = block.textContent || '';
      if (!text.trimEnd().endsWith('| jq')) {
        appendJq(block);
      }
    }
  }

  function replaceFlagInTextNodes(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      var t = node.textContent;
      // "curl -i" in same text node (no syntax highlighting or same token)
      if (t.indexOf('curl -i') !== -1) {
        node.textContent = t.replace('curl -i', 'curl -s');
        return;
      }
      // "-i" as its own token (Shiki splits flags into separate spans)
      if (t === '-i') {
        node.textContent = '-s';
        return;
      }
      // "-i" at start or surrounded by whitespace in a shared text node
      if (/(?:^|\s)-i(?:\s|$)/.test(t)) {
        node.textContent = t.replace(/-i(?=\s|$)/, '-s');
        return;
      }
    }
  }

  function appendJq(el) {
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

  function startObserver() {
    scheduleProcess();
    // Re-process when DOM changes (server/example switches cause re-renders)
    new MutationObserver(scheduleProcess).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Process on initial load (document.body may not exist yet in head scripts)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
})();
