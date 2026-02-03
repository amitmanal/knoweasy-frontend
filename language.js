// Language selection and dynamic UI translation helper.
// This script reads the user's preferred language from localStorage and applies
// translations to elements with a `data-i18n` attribute. It also wires up the
// language dropdown (`#keLangSelect`) so that changing the selection updates
// the UI immediately and persists the choice across pages.

(function(){
  // Default fallback language
  const DEFAULT_LANG = 'en';

  /**
   * Read the current language from localStorage. If none is set or the value
   * is unsupported, return the default language.
   */
  function getLang(){
    try {
      const lang = localStorage.getItem('ke_lang');
      if (!lang) return DEFAULT_LANG;
      if (window.KE_Translations && window.KE_Translations[lang]) return lang;
    } catch {}
    return DEFAULT_LANG;
  }

  /**
   * Save the selected language to localStorage and apply translations.
   * @param {string} lang Two‑letter language code ('en', 'hi', 'mr')
   */
  function setLang(lang){
    try {
      localStorage.setItem('ke_lang', lang);
    } catch {}
    applyTranslations();
  }

  /**
   * Apply translations to all elements with the `data-i18n` attribute. If a
   * translation is missing for a key in the selected language, fall back to
   * English. The function also updates the value of the language dropdown.
   */
  function applyTranslations(){
    const lang = getLang();
    // Set the lang attribute on the root element for accessibility
    try {
      document.documentElement.setAttribute('lang', lang);
    } catch {}
    const dict = (window.KE_Translations && window.KE_Translations[lang]) || window.KE_Translations?.en || {};
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const translation = dict[key] || (window.KE_Translations?.en && window.KE_Translations.en[key]);
      if (translation) {
        // Use innerHTML to preserve any markup in translations (e.g. <strong>)
        el.innerHTML = translation;
      }
    });
    // Update select to reflect current lang
    const select = document.getElementById('keLangSelect');
    if (select) {
      select.value = lang;
    }
  }

  // Attach event listener to the language dropdown
  function init(){
    const select = document.getElementById('keLangSelect');
    if (select) {
      select.addEventListener('change', evt => {
        const newLang = evt.target.value;
        if (window.KE_Translations && window.KE_Translations[newLang]) {
          setLang(newLang);
        }
      });
    }
    applyTranslations();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API globally for other scripts if needed
  window.KE_Lang = { getLang, setLang, applyTranslations };
})();
