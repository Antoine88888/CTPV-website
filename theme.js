/* Gestion du thème clair / sombre */
(function () {
  const KEY  = 'ctpv-theme';
  const html = document.documentElement;

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
    const btn  = document.getElementById('theme-toggle');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (icon) icon.className = theme === 'light' ? 'bi bi-moon-fill' : 'bi bi-sun-fill';
    btn.setAttribute('aria-label', theme === 'light' ? 'Mode sombre' : 'Mode clair');
  }

  /* Applique immédiatement (avant rendu) pour éviter le flash */
  applyTheme(localStorage.getItem(KEY) || 'dark');

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      /* Re-sync l'icône après chargement DOM */
      applyTheme(localStorage.getItem(KEY) || 'dark');
      btn.addEventListener('click', function () {
        applyTheme(html.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
      });
    }
  });
})();
