(() => {
  const tabs = Array.from(document.querySelectorAll('[role="tab"][data-tab]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"][data-panel]'));

  function activateTab(tab, moveFocus = false) {
    const key = tab.dataset.tab;
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== key;
    });
    if (moveFocus) tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', (event) => {
      let nextIndex;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      activateTab(tabs[nextIndex], true);
    });
  });

  const copyButton = document.getElementById('copy-manifest');
  const manifest = document.getElementById('manifest-url');
  const status = document.getElementById('copy-status');
  if (copyButton && manifest && status) {
    copyButton.addEventListener('click', async () => {
      const value = manifest.textContent.trim();
      try {
        if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(value);
        status.textContent = 'Manifest URL copied.';
      } catch (_) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(manifest);
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = 'Clipboard unavailable here. The URL is selected; copy it with Ctrl+C or Command+C.';
      }
    });
  }
})();
