(() => {
  const banner = document.getElementById('pwa-banner');
  const message = document.getElementById('pwa-message');
  const action = document.getElementById('pwa-action');
  const close = document.getElementById('pwa-close');

  if (!('serviceWorker' in navigator)) return;

  let installPrompt = null;
  let hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;

  const show = (text, label, handler) => {
    if (!banner || !message || !action) return;
    message.textContent = text;
    action.textContent = label;
    action.hidden = !handler;
    action.onclick = handler || null;
    banner.hidden = false;
  };

  close?.addEventListener('click', () => {
    if (banner) banner.hidden = true;
  });

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

  window.addEventListener('appinstalled', () => {
    if (banner) banner.hidden = true;
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js', {
    scope: './',
    updateViaCache: 'none'
  }).then(async reg => {
    const activateUpdate = worker => {
      if (!worker || !hadController) return;
      worker.postMessage({ type: 'SKIP_WAITING' });
    };

    if (reg.waiting) activateUpdate(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;

      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          if (reg.waiting) activateUpdate(reg.waiting);
          else if (worker.state === 'installed' && hadController) {
            activateUpdate(worker);
          }
        }
      });
    });

    await reg.update().catch(() => {});

    window.addEventListener('focus', () => {
      reg.update().catch(() => {});
    });

    window.addEventListener('online', () => {
      reg.update().catch(() => {});
    });
  }).catch(error => {
    console.error('ChessMate Service Worker registration failed:', error);
  });
})();
