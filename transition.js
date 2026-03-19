/* Transitions légères entre pages */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('tel:') || href.startsWith('mailto:')) return;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.add('page-out');
      setTimeout(() => { window.location.href = href; }, 260);
    });
  });
});
