/*
 * KnowEasy OS – Progressive Web App Install Prompt (v1)
 *
 * This module exposes a quiet, premium install suggestion for students.
 * It listens for the `beforeinstallprompt` event fired by compatible
 * browsers and surfaces a small call‑to‑action on the Home and Me pages.
 * The prompt never blocks the UI, never nags users after dismissal,
 * and hides automatically once the app is installed. A secondary
 * indicator appears on the profile page if installation is complete.
 */
(function () {
  'use strict';

  // LocalStorage keys used to persist user choice across sessions
  const KEY_DISMISSED = 'ke_app_install_dismissed_v1';
  const KEY_INSTALLED = 'ke_app_install_installed_v1';

  // Will hold the deferred beforeinstallprompt event when available
  let deferredPrompt = null;
  // Element reference for the injected prompt UI, if created
  let promptEl = null;

  /**
   * Determine if the user previously dismissed the install prompt.
   */
  function isDismissed() {
    try {
      return localStorage.getItem(KEY_DISMISSED) === '1';
    } catch (_) {
      return false;
    }
  }

  /**
   * Determine if the app has already been installed by the user.
   */
  function isInstalled() {
    try {
      return localStorage.getItem(KEY_INSTALLED) === '1';
    } catch (_) {
      return false;
    }
  }

  /**
   * Create the visual prompt element and insert it into the page. The
   * layout differs slightly between the Home and Me pages to respect
   * existing structure and spacing. All styles are inline to avoid
   * touching global stylesheets. A media query is injected to hide
   * prompts on very large screens (desktop) where installation is
   * generally less relevant.
   *
   * @param {string} page Current page filename (e.g. "index.html").
   */
  function insertPrompt(page) {
    // Avoid duplicate insertion
    if (promptEl) return;

    // Build container element
    const container = document.createElement('div');
    container.className = 'ke-install-prompt';
    // Use flex column on Me page and inline‑flex on Home page
    container.style.display = page === 'me.html' ? 'flex' : 'inline-flex';
    container.style.flexDirection = page === 'me.html' ? 'column' : 'row';
    container.style.alignItems = page === 'me.html' ? 'flex-start' : 'center';
    container.style.gap = '4px';
    container.style.marginTop = '12px';
    container.style.padding = '8px 12px';
    container.style.borderRadius = '14px';
    container.style.border = '1px solid rgba(148,163,184,0.24)';
    container.style.background = 'rgba(255,255,255,0.65)';
    container.style.backdropFilter = 'blur(8px)';
    container.style.webkitBackdropFilter = 'blur(8px)';
    container.style.fontSize = '12px';
    container.style.fontWeight = '600';
    container.style.color = 'rgba(15,23,42,0.9)';
    container.style.position = 'relative';
    container.style.maxWidth = '100%';

    // Install call to action (button)
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '📲 Install KnowEasy App';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '6px';
    btn.style.padding = '6px 10px';
    btn.style.border = 'none';
    btn.style.borderRadius = '12px';
    btn.style.fontSize = '13px';
    btn.style.fontWeight = '800';
    btn.style.background = 'rgba(255,255,255,0.8)';
    btn.style.color = 'rgba(15,23,42,0.9)';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 2px 6px rgba(2,6,23,0.08)';
    btn.addEventListener('click', async () => {
      try {
        if (!deferredPrompt) return;
        // Show the install prompt
        deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        // If the user accepts, the appinstalled handler will run
        if (choiceResult && choiceResult.outcome === 'dismissed') {
          // Remember dismissal and hide prompt
          try { localStorage.setItem(KEY_DISMISSED, '1'); } catch (_) {}
          hidePrompt();
        }
      } catch (_) {}
    });

    // Subtext element
    const sub = document.createElement('div');
    sub.textContent = 'Faster access • Works offline';
    sub.style.fontSize = '10px';
    sub.style.color = 'rgba(15,23,42,0.65)';
    // Align left for both pages
    sub.style.marginTop = page === 'me.html' ? '2px' : '0';
    sub.style.marginLeft = page === 'me.html' ? '0' : '8px';

    // Dismiss (×) button for users who don’t want to install
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Dismiss install suggestion');
    dismiss.style.position = 'absolute';
    dismiss.style.top = '4px';
    dismiss.style.right = '6px';
    dismiss.style.border = 'none';
    dismiss.style.background = 'transparent';
    dismiss.style.fontSize = '14px';
    dismiss.style.color = 'rgba(15,23,42,0.6)';
    dismiss.style.cursor = 'pointer';
    dismiss.addEventListener('click', () => {
      try { localStorage.setItem(KEY_DISMISSED, '1'); } catch (_) {}
      hidePrompt();
    });

    // Assemble container
    container.appendChild(btn);
    container.appendChild(sub);
    container.appendChild(dismiss);

    // Insert into page at appropriate location
    if (page === 'index.html') {
      const heroLeft = document.querySelector('.hero-left');
      if (heroLeft) {
        heroLeft.appendChild(container);
      } else {
        // Fallback: append to main if hero missing
        const main = document.querySelector('main');
        main && main.insertBefore(container, main.firstChild);
      }
    } else if (page === 'me.html') {
      // On the profile page, attach inside the first card section after the buttons
      const cardSection = document.querySelector('section.card');
      if (cardSection) {
        cardSection.appendChild(container);
      } else {
        // Fallback: append to main
        const main = document.querySelector('main');
        main && main.insertBefore(container, main.firstChild);
      }
    }

    // Save reference to allow removal later
    promptEl = container;
  }

  /**
   * Remove the prompt element from the DOM and clear references.
   */
  function hidePrompt() {
    if (promptEl && promptEl.parentNode) {
      promptEl.parentNode.removeChild(promptEl);
    }
    promptEl = null;
  }

  /**
   * Shows an indicator on the Me page once installation is complete. This
   * fulfils the requirement to communicate that the app is already
   * installed. It adds a simple text row styled similarly to existing
   * content.
   */
  function insertInstalledIndicator() {
    // Avoid running on other pages
    const path = (location.pathname || '').toLowerCase();
    const page = path.split('/').pop() || 'index.html';
    if (page !== 'me.html') return;
    // Check for presence and avoid duplicates
    if (document.querySelector('.ke-install-indicator')) return;
    const cardSection = document.querySelector('section.card');
    if (!cardSection) return;
    const indicator = document.createElement('div');
    indicator.className = 'ke-install-indicator';
    indicator.textContent = 'App already installed ✓';
    // Styling matches small hint text
    indicator.style.fontSize = '12px';
    indicator.style.color = 'rgba(15,23,42,0.7)';
    indicator.style.marginTop = '10px';
    indicator.style.fontWeight = '600';
    cardSection.appendChild(indicator);
  }

  /**
   * Check whether we should show the install prompt on this page. Prompt
   * appears only on index.html and me.html, and only if the app is
   * installable (beforeinstallprompt event fired), not dismissed and not
   * already installed.
   */
  function maybeShowPrompt() {
    const path = (location.pathname || '').toLowerCase();
    const page = path.split('/').pop() || 'index.html';
    if (page !== 'index.html' && page !== 'me.html') return;
    if (isDismissed() || isInstalled()) return;
    if (!deferredPrompt) return;
    insertPrompt(page);
  }

  // Attach listeners once DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    // Immediately add installed indicator on Me page
    if (isInstalled()) {
      insertInstalledIndicator();
    }
    maybeShowPrompt();
  });

  // Capture the install prompt event and store it; prevent default so we
  // control when the browser prompt appears.
  window.addEventListener('beforeinstallprompt', (event) => {
    // Only intercept the native install banner on pages where we show our own install CTA.
    // This avoids noisy console warnings on other pages while keeping the custom install button on Home/Me.
    const path = (location.pathname || '').toLowerCase();
    const page = path.split('/').pop() || 'index.html';
    if (page !== 'index.html' && page !== 'me.html') return;
    event.preventDefault();
    deferredPrompt = event;
    // Try to show prompt on eligible pages
    maybeShowPrompt();
  });

  // Listen for the appinstalled event to update state and remove prompt
  window.addEventListener('appinstalled', () => {
    try { localStorage.setItem(KEY_INSTALLED, '1'); } catch (_) {}
    hidePrompt();
    insertInstalledIndicator();
  });

  // Inject a minimal media query to hide prompts on large screens (desktop).
  // This style tag is inserted once per page load.
  (function injectMediaRule() {
    try {
      const style = document.createElement('style');
      style.textContent = '@media (min-width: 1024px) { .ke-install-prompt { display: none !important; } }';
      document.head.appendChild(style);
    } catch (_) {}
  })();
})();