/**
 * "Feed it to my AI Agent" — page action / palette row + copy-prompt dialog.
 *
 * The row is registered as a built-in page action by the site override of
 * the oink action context. Its URL is "#agent-prompt": a page-local no-op
 * that the palette or page-action link sets before this script opens the
 * copy-prompt modal and clears the hash so the action can fire again. Paste
 * the prompt into Claude Code or Codex: the agent clones the repo, reads the
 * README plus the scripts, shortcodes, and manifests in the tree, reports
 * what the field manual can do, and
 * asks the reader what to do next. The prompt deliberately points the
 * agent at README.md as the source of truth for setup, so the
 * instructions live in one place.
 *
 * The clone URL comes from the __TD_AGENT_SETUP__ blob the body-end hook
 * injects (params.github_repo), the same pattern chat.js uses for
 * llmsFull — the repo name has one source instead of a literal here too.
 *
 * Guards mirror chat.js: body-end.html runs on every HTML output including
 * print bundles, so the hash listener is only installed where the palette
 * exists, and the dialog is created only on first activation.
 */
(function () {
  'use strict';

  var CFG = window.__TD_AGENT_SETUP__ || {};
  var REPO = CFG.repo || 'rh-aiservices-bu/CAI-Field-Manual-Migration-2-3';
  var CLONE_URL = 'https://github.com/' + REPO + '.git';
  var CLONE_DIR = REPO.split('/').pop();

  var PROMPT =
    "Set up the CAI Field Manual prototype so it is ready to work on, then " +
    "orient me in it.\n\n" +
    "1. Clone the repository:\n" +
    "   git clone " + CLONE_URL + "\n" +
    "   cd " + CLONE_DIR + "\n\n" +
    "2. Read the \"Clone and render locally\" section of README.md and " +
    "follow it — prerequisites, dev server, everything it says.\n\n" +
    "3. Read through the repository: the content in content/ (the field " +
    "manuals, the author doctrine section, the chat page), the custom " +
    "shortcodes and partials under layouts/, the project scripts and styles " +
    "under static/, and the configuration in hugo.yaml and data/.\n\n" +
    "4. Report what this field manual can do: the manuals it contains, how " +
    "the display-option filtering and the Customize page work, the " +
    "agent-facing outputs (per-page markdown, llms.txt, print bundles), and " +
    "how a new manual is added.\n\n" +
    "5. Then stop and ask me what I want to do next — do not start editing " +
    "anything.";

  var TRIGGER_HASH = '#agent-prompt';
  var MODAL_TITLE = 'Feed this to your AI Agent';
  var HINT = 'Paste this into Claude Code or Codex. The agent clones the ' +
    'repository, reads the README and the code, reports what the manual ' +
    'can do, and asks what to do next.';
  var COPIED = 'Copied';

  function dialogElement() {
    return document.getElementById('td-agent-setup-dialog');
  }

  function ensureDialog() {
    var existing = dialogElement();
    if (existing) return existing;
    var dialog = document.createElement('dialog');
    dialog.id = 'td-agent-setup-dialog';
    dialog.className = 'td-agent-setup';
    dialog.setAttribute('aria-label', MODAL_TITLE);
    dialog.innerHTML =
      '<div class="td-agent-setup__surface">' +
      '  <button type="button" class="td-agent-setup__close" ' +
      '    data-td-agent-setup-close aria-label="Close">' +
      '    <i class="fa-solid fa-xmark" aria-hidden="true"></i>' +
      '  </button>' +
      '  <h2 class="td-agent-setup__title">' + MODAL_TITLE + '</h2>' +
      '  <p class="td-agent-setup__hint">' + HINT + '</p>' +
      '  <pre class="td-agent-setup__code"><code data-td-agent-setup-code></code></pre>' +
      '  <div class="td-agent-setup__actions">' +
      '    <button type="button" class="td-agent-setup__copy" ' +
      '      data-td-agent-setup-copy>' +
      '      <i class="fa-regular fa-copy" aria-hidden="true"></i>' +
      '      <span data-td-agent-setup-copy-label>Copy prompt</span>' +
      '    </button>' +
      '  </div>' +
      '</div>';
    var code = dialog.querySelector('[data-td-agent-setup-code]');
    code.textContent = PROMPT;
    document.body.appendChild(dialog);

    var lastFocus = null;
    function openDialog() {
      lastFocus = document.activeElement;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      var copyButton = dialog.querySelector('[data-td-agent-setup-copy]');
      if (copyButton) copyButton.focus();
    }
    function restoreFocus() {
      var candidates = [
        lastFocus,
        // The palette is hidden by the time the dialog closes; the navbar
        // search box is the visible control the reader came from.
        document.querySelector('[data-td-shell-search-open]')
      ];
      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        if (!el || !document.contains(el) || typeof el.focus !== 'function') continue;
        var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0 };
        if (rect.width) { el.focus(); return; }
      }
    }
    function closeDialog() {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      restoreFocus();
    }

    dialog.querySelector('[data-td-agent-setup-close]')
      .addEventListener('click', closeDialog);
    // Click on the dialog chrome (outside the surface) closes; clicks on
    // the surface itself stay.
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeDialog();
    });
    // Escape must close only the dialog: the page-actions menu on docs
    // pages has its own document-level Escape handler that would fire too.
    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') event.stopPropagation();
    });

    var copyButton = dialog.querySelector('[data-td-agent-setup-copy]');
    copyButton.addEventListener('click', function () {
      copyToClipboard(PROMPT).then(function () {
        flipCopied(copyButton);
      });
    });

    dialog._tdAgentSetupOpen = openDialog;
    dialog._tdAgentSetupClose = closeDialog;
    return dialog;
  }

  var flipTimer = 0;
  function flipCopied(button) {
    var label = button.querySelector('[data-td-agent-setup-copy-label]');
    if (label && !label.dataset.original) label.dataset.original = label.textContent;
    button.classList.add('td-agent-setup__copy--done');
    if (label) label.textContent = COPIED;
    if (flipTimer) window.clearTimeout(flipTimer);
    flipTimer = window.setTimeout(function () {
      flipTimer = 0;
      button.classList.remove('td-agent-setup__copy--done');
      if (label && label.dataset.original) label.textContent = label.dataset.original;
    }, 1600);
  }

  function copyToClipboard(text) {
    // The theme's shared clipboard (bundled with the actions script that
    // renders the palette) targets its execCommand fallback field at the
    // open dialog — a field in the inert body would "succeed" while leaving
    // the clipboard untouched (see clipboard.js).
    if (window.OinkClipboard && typeof window.OinkClipboard.writeText === 'function') {
      return window.OinkClipboard.writeText(text, document, window.navigator);
    }
    return navigator.clipboard.writeText(text);
  }

  function activate() {
    var dialogEl = ensureDialog();
    dialogEl._tdAgentSetupOpen();
  }

  function onHashChange() {
    if (window.location.hash !== TRIGGER_HASH) return;
    // Clear the fragment (no hashchange loop, no history entry) so the
    // palette command can re-fire after the dialog closes.
    window.history.replaceState(
      null, '', window.location.pathname + window.location.search
    );
    activate();
  }

  function init() {
    // No palette (landing, print bundles) means no command can fire this.
    if (document.querySelector('#td-shell-search')) {
      window.addEventListener('hashchange', onHashChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
