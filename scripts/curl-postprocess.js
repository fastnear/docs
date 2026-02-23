/**
 * curl-postprocess.js
 *
 * Post-processor for Redocly's auto-generated curl code samples.
 *
 * Three concerns:
 * 1. DOM transforms: MutationObserver replaces `-i` → `-s` and appends `| jq`
 *    in displayed curl code blocks.
 * 2. Clipboard interception: Capture-phase copy listener applies the same
 *    transforms when copying curl commands.
 * 3. Example → Server sync: When the example picker changes to a testnet/mainnet
 *    example, auto-switches the server dropdown to match.
 *
 * Loaded via redocly.yaml scripts.head.
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  function transformCurlText(text) {
    if (text.indexOf('curl -i') !== -1) {
      text = text.replace('curl -i', 'curl -s');
    }
    if (!/\|\s*jq\b/.test(text)) {
      text = text.trimEnd() + ' | jq';
    }
    return text;
  }

  // --- A. DOM curl transforms via MutationObserver ---

  function transformCodeBlock(pre) {
    var fullText = pre.textContent || '';
    if (!fullText.trimStart().startsWith('curl')) return;

    var needsFlagFix = fullText.indexOf('curl -i') !== -1;
    var needsJq = !/\|\s*jq\b/.test(fullText);
    if (!needsFlagFix && !needsJq) return;

    if (needsFlagFix) {
      // Walk text nodes to replace -i → -s.
      // Handles Shiki splitting "curl -i" across spans, e.g.
      //   <span>curl</span><span> -i</span>  or  <span>curl -i</span>
      var walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT, null, false);
      var node;
      var fixed = false;
      while (!fixed && (node = walker.nextNode())) {
        if (node.nodeValue.indexOf('curl -i') !== -1) {
          node.nodeValue = node.nodeValue.replace('curl -i', 'curl -s');
          fixed = true;
        } else if (/(?:^|\s)-i(?:\s|$)/.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace('-i', '-s');
          fixed = true;
        }
      }
    }

    if (needsJq) {
      // Append | jq to the last text node in the block.
      var walker2 = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT, null, false);
      var lastTextNode = null;
      var n;
      while ((n = walker2.nextNode())) {
        lastTextNode = n;
      }
      if (lastTextNode) {
        lastTextNode.nodeValue = lastTextNode.nodeValue.trimEnd() + ' | jq';
      }
    }
  }

  function processAllCodeBlocks() {
    var blocks = document.querySelectorAll(
      'pre[data-component-name="CodeBlock/CodeBlockContainer"]'
    );
    blocks.forEach(transformCodeBlock);
  }

  document.addEventListener('DOMContentLoaded', function () {
    processAllCodeBlocks();

    var observer = new MutationObserver(function () {
      // Debounce via requestAnimationFrame so we batch rapid re-renders.
      if (observer._raf) return;
      observer._raf = requestAnimationFrame(function () {
        observer._raf = null;
        processAllCodeBlocks();
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // --- B. Example → Server sync ---
    //
    // DOM structure (from SSR):
    //   <select class="dropdown-select">          ← example picker
    //     <option value="View Mainnet Account">…</option>
    //     <option value="View Testnet Account">…</option>
    //   </select>
    //
    //   <div data-testid="dropdown" class="… RequestSamples__StyledServerListDropdown-…">
    //     <button data-component-name="Button/Button">POST / ▾</button>
    //     <div class="Dropdown__ChildrenWrapper-…">
    //       <ul data-component-name="Dropdown/DropdownMenu">
    //         <li data-component-name="Dropdown/DropdownMenuItem">
    //           <span class="styled__Header-…">Mainnet</span>
    //           <span class="styled__Title-…">✓ https://rpc.mainnet.fastnear.com</span>
    //         </li>
    //         <li …>Testnet …</li>
    //       </ul>
    //     </div>
    //   </div>

    var syncing = false;

    document.body.addEventListener('change', function (e) {
      if (syncing) return;
      var select = e.target;
      if (!select.matches || !select.matches('select.dropdown-select')) return;

      var selectedOption = select.options[select.selectedIndex];
      if (!selectedOption) return;
      var text = (selectedOption.textContent || '').toLowerCase();

      var network = null;
      if (text.indexOf('testnet') !== -1) network = 'testnet';
      else if (text.indexOf('mainnet') !== -1) network = 'mainnet';
      if (!network) return;

      // Find the server dropdown by data-testid.
      var serverDropdown = document.querySelector('[data-testid="dropdown"]');
      if (!serverDropdown) return;

      // Check which server is currently selected (has a CheckmarkIcon).
      var items = serverDropdown.querySelectorAll(
        '[data-component-name="Dropdown/DropdownMenuItem"]'
      );
      var activeItem = null;
      var targetItem = null;
      items.forEach(function (item) {
        if (item.querySelector('[data-component-name="icons/CheckmarkIcon/CheckmarkIcon"]')) {
          activeItem = item;
        }
        var header = item.querySelector('[class*="Header"]');
        if (header && header.textContent.toLowerCase() === network) {
          targetItem = item;
        }
      });

      // Already on the correct server.
      if (activeItem && targetItem && activeItem === targetItem) return;
      if (!targetItem) return;

      syncing = true;

      // Open the server dropdown, then click the target item.
      var trigger = serverDropdown.querySelector(
        'button[data-component-name="Button/Button"]'
      );
      if (trigger) trigger.click();

      setTimeout(function () {
        targetItem.click();
        setTimeout(function () {
          syncing = false;
        }, 100);
      }, 50);
    });
  });

  // --- C. Clipboard interception (capture phase) ---

  document.addEventListener(
    'copy',
    function (e) {
      try {
        var selection = window.getSelection();
        var text = selection ? selection.toString() : '';
        if (text.trimStart().startsWith('curl')) {
          if (
            !e.clipboardData ||
            typeof e.clipboardData.setData !== 'function'
          )
            return;
          e.preventDefault();
          e.clipboardData.setData('text/plain', transformCurlText(text));
        }
      } catch (err) {
        // silently ignore
      }
    },
    true
  );
})();
