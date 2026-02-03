// Service Worker disabled (Option B)
// Unregister any existing SW and clear caches to prevent stale assets.
(function () {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(function (regs) {
          regs.forEach(function (r) {
            try { r.unregister(); } catch (e) {}
          });
        })
        .catch(function () {});
    }
    if (window.caches && caches.keys) {
      caches.keys()
        .then(function (keys) { keys.forEach(function (k) { try { caches.delete(k); } catch (e) {} }); })
        .catch(function () {});
    }
  } catch (e) {}
})();
