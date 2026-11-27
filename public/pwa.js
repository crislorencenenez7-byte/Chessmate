(() => {
  const $ = id => document.getElementById(id);

  const installBanner = $('pwa-banner');
  const installMessage = $('pwa-message');
  const installAction = $('pwa-action');
  const installClose = $('pwa-close');

  const updateBanner = $('update-banner');
  const updateTitle = $('update-title');
  const updateCountdown = $('update-countdown');
  const updateDate = $('update-date');
  const updateDescription = $('update-description');

  if (!('serviceWorker' in navigator)) return;

  let installPrompt = null;
  let registration = null;
  let releaseTime = null;
  let releaseStarted = false;
  let refreshing = false;

  const hadController = !!navigator.serviceWorker.controller;

  // Install prompt
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;

    if (!installBanner || !installMessage || !installAction) return;

    installMessage.textContent = 'Install ChessMate for quick access.';
    installAction.textContent = 'Install';
    installAction.hidden = false;
    installBanner.hidden = false;

    installAction.onclick = async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      installBanner.hidden = true;
    };
  });

  installClose?.addEventListener('click', () => {
    installBanner.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    if (installBanner) installBanner.hidden = true;
  });

  // Reload only after an existing app receives its new controller.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function showUpdate(config) {
    if (!updateBanner) return;
    updateTitle.textContent = config.title || "ChessMate Scheduled Update";
    updateDate.textContent = config.date || new Date(config.scheduledAt).toLocaleString();
    updateDescription.textContent = Array.isArray(config.description)
      ? config.description.join(" • ")
      : String(config.description || "ChessMate improvements and new features");
    updateBanner.hidden = false;
    updateBanner.style.display = "block";
  }

  function activateWaitingWorker() {
    const waiting = registration?.waiting;

    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      return true;
    }

    return false;
  }

  async function checkForRelease() {
    if (!releaseStarted || !registration) return;

    await registration.update().catch(() => {});

    if (registration.waiting) {
      activateWaitingWorker();
    }
  }

  async function loadSchedule() {
    try {
      const response = await fetch('./update.json', {
        cache: 'no-store'
      });

      if (!response.ok) throw new Error('Update configuration unavailable');

      const config = await response.json();

      if (!config.enabled || !config.scheduledAt) {
        if (updateBanner) updateBanner.hidden = true;
        return;
      }

      const parsed = Date.parse(config.scheduledAt);

      if (!Number.isFinite(parsed)) {
        console.error('Invalid scheduledAt in update.json');
        return;
      }

      releaseTime = parsed;
      showUpdate(config);
      updateCountdown.textContent = formatTime(releaseTime - Date.now());

      function tick() {
        const remaining = releaseTime - Date.now();

        if (remaining > 0) {
          updateCountdown.textContent = formatTime(remaining);
          return;
        }

        updateCountdown.textContent = '00:00:00';

        if (!releaseStarted) {
          releaseStarted = true;
          updateTitle.textContent = 'ChessMate update is being released';
          updateDescription.textContent =
            'Applying the scheduled update. Please wait…';
          checkForRelease();
        }
      }

      tick();
      setInterval(tick, 1000);

      // Keep checking in case the new worker is still installing.
      setInterval(() => {
        if (releaseStarted && !refreshing) {
          checkForRelease();
        }
      }, 5000);

    } catch (error) {
      console.error('Could not load update schedule:', error);
    }
  }

  navigator.serviceWorker.register('./sw.js', {
    scope: './',
    updateViaCache: 'none'
  }).then(async reg => {
    registration = reg;

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;

      worker.addEventListener('statechange', () => {
        if (
          worker.state === 'installed' &&
          releaseStarted
        ) {
          activateWaitingWorker();
        }
      });
    });

    await loadSchedule();

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
