(() => {
  const banner = document.getElementById('pwa-banner');
  const message = document.getElementById('pwa-message');
  const action = document.getElementById('pwa-action');
  const close = document.getElementById('pwa-close');
  if (!banner || !action || !('serviceWorker' in navigator)) return;

  let installPrompt = null;
  let waitingWorker = null;
  const show = (text, label, handler) => {
    message.textContent = text;
    action.textContent = label;
    action.hidden = !handler;
    action.onclick = handler || null;
    banner.hidden = false;
  };
  close?.addEventListener('click', () => { banner.hidden = true; });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    show('Install ChessMate for quick access.', 'Install', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      banner.hidden = true;
    });
  });
  window.addEventListener('appinstalled', () => { banner.hidden = true; });

  navigator.serviceWorker.register('./sw.js', { scope: './' }).then(reg => {
    const check = () => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        waitingWorker = reg.waiting;
        show('A new ChessMate update is ready.', 'Update', () => {
          waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
        });
      }
    };
    check();
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') check();
      });
    });
    window.addEventListener('focus', () => reg.update().catch(() => {}));
  }).catch(() => {});

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
})();
