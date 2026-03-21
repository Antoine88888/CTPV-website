/**
 * CTPV – site.js
 * Script partagé : bandeau d'alerte, horaires dynamiques, contenu dynamique par page.
 */
(function () {
  'use strict';

  // ─── Fetch helpers ────────────────────────────────────────
  function get(url) {
    return fetch(url).then(r => r.ok ? r.json() : Promise.reject(r));
  }

  // ─── Notice banner ────────────────────────────────────────
  function initNotice(data) {
    if (!data || !data.active || !data.message) return;
    // Allow user to dismiss for this session
    if (sessionStorage.getItem('ctpv-notice-dismissed') === data.message) return;

    const nav = document.querySelector('.navbar');
    if (!nav) return;

    const typeClass = { warning: 'ctpv-notice--warning', info: 'ctpv-notice--info', danger: 'ctpv-notice--danger' };
    const icons     = { warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill', danger: 'bi-x-octagon-fill' };

    const el = document.createElement('div');
    el.className = 'ctpv-notice ' + (typeClass[data.type] || typeClass.warning);
    el.innerHTML =
      '<i class="bi ' + (icons[data.type] || icons.warning) + '"></i>' +
      '<span>' + escHtml(data.message) + '</span>' +
      '<button class="ctpv-notice-close" aria-label="Fermer"><i class="bi bi-x-lg"></i></button>';

    el.querySelector('.ctpv-notice-close').addEventListener('click', function () {
      el.remove();
      sessionStorage.setItem('ctpv-notice-dismissed', data.message);
    });

    nav.insertAdjacentElement('afterend', el);
  }

  // ─── Hours injection ──────────────────────────────────────
  function initHours(settings) {
    if (!settings || !settings.hours) return;
    const h = settings.hours;

    function fmt(day) {
      if (!day.open) return 'Fermé';
      const parts = [];
      if (day.morning)   parts.push(day.morning);
      if (day.afternoon) parts.push(day.afternoon);
      return parts.join(' / ');
    }

    document.querySelectorAll('[data-slot="hours-lundi"]').forEach(el => {
      el.textContent = h.lundi ? fmt(h.lundi) : '';
    });
    document.querySelectorAll('[data-slot="hours-samedi"]').forEach(el => {
      el.textContent = h.samedi ? fmt(h.samedi) : '';
    });
  }

  // ─── Escape HTML ──────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Loading state ────────────────────────────────────────
  function setLoading(el) {
    el.innerHTML = '<div class="ctpv-loading"><span class="ctpv-spinner"></span> Chargement…</div>';
  }
  function setError(el, msg) {
    el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">' + escHtml(msg) + '</p>';
  }

  // ─── Render: News ─────────────────────────────────────────
  function renderNews(grid, items) {
    if (!items.length) {
      grid.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;grid-column:1/-1;">Aucune actualité pour le moment.</p>';
      return;
    }
    grid.innerHTML = items.slice(0, 6).map(n => `
      <article class="news-card">
        <img class="news-card-img" src="${escHtml(n.imageUrl || 'https://picsum.photos/600/360')}"
             alt="${escHtml(n.imageAlt || n.title)}" loading="lazy">
        <div class="news-card-body">
          <div class="news-meta">
            <span class="news-tag">${escHtml(n.tag || '')}</span>
            <span class="news-date">${escHtml(n.dateLabel || n.date || '')}</span>
          </div>
          <h3>${escHtml(n.title)}</h3>
          <p>${escHtml(n.summary || '')}</p>
          <a href="${escHtml(n.linkHref || '#')}" class="news-link">${escHtml(n.linkLabel || 'Lire la suite')}</a>
        </div>
      </article>`).join('');
  }

  // ─── Render: Agenda ───────────────────────────────────────
  function renderAgenda(list, items) {
    if (!items.length) {
      list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">Aucun événement pour le moment.</p>';
      return;
    }

    const upcoming = items.filter(e => !e.isPast);
    const past     = items.filter(e =>  e.isPast);

    function fmtDate(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
      return { day: String(d.getDate()).padStart(2,'0'), month: months[d.getMonth()] };
    }

    function eventHTML(e) {
      const d    = fmtDate(e.date);
      const tags = (e.tags || []).map((t, i) =>
        `<span class="badge${(e.tagColors||[])[i]==='gold'?' gold':''}">${escHtml(t)}</span>`
      ).join('');
      return `
        <div class="agenda-event${e.isPast ? ' past' : ''}">
          <div class="agenda-date-box"${e.isPast?' style="opacity:0.7;"':''}>
            <div class="agenda-date-day">${d.day}</div>
            <div class="agenda-date-month">${d.month}</div>
          </div>
          <div>
            <h3 class="agenda-event-title">${escHtml(e.title)}</h3>
            <p class="agenda-event-desc">${escHtml(e.description || '')}</p>
            <div class="agenda-event-tags">${tags}</div>
          </div>
        </div>`;
    }

    let html = '';
    if (upcoming.length) html += upcoming.map(eventHTML).join('');
    if (past.length) {
      html += '<div style="margin:1.5rem 0 0.75rem;"><span class="section-label">Événements passés</span></div>';
      html += past.map(eventHTML).join('');
    }
    list.innerHTML = html;
  }

  // ─── Render: Palmarès ─────────────────────────────────────
  function renderPalmares(grid, histContainer, items) {
    const current = items.filter(p => !p.isHistorique);
    const hist    = items.filter(p =>  p.isHistorique);

    const medalClass = { or: 'medal-or', argent: 'medal-argent', bronze: 'medal-bronze' };
    const medalEmoji = { or: '🥇', argent: '🥈', bronze: '🥉' };

    if (!current.length) {
      grid.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;grid-column:1/-1;">Aucun résultat pour le moment.</p>';
    } else {
      grid.innerHTML = current.map(p => {
        const tags = (p.tags || []).map((t, i) =>
          `<span class="badge${(p.tagColors||[])[i]==='gold'?' gold':''}">${escHtml(t)}</span>`
        ).join('');
        return `
          <div class="palmares-card">
            <div class="palmares-card-header">
              <div class="palmares-medal ${medalClass[p.medal] || 'medal-or'}">${medalEmoji[p.medal] || '🏅'}</div>
              <div>
                <h3 class="palmares-tireur">${escHtml(p.athleteName || '')}</h3>
                <p class="palmares-event">${escHtml(p.eventName || '')}</p>
              </div>
            </div>
            <div class="palmares-card-body">
              <div class="palmares-meta">${tags}</div>
              <p style="font-size:0.85rem;color:var(--muted);line-height:1.7;margin:0;">${escHtml(p.description || '')}</p>
            </div>
          </div>`;
      }).join('');
    }

    if (histContainer) {
      if (!hist.length) {
        histContainer.innerHTML = '';
      } else {
        histContainer.innerHTML = hist.map(p => `
          <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1.5rem;display:grid;grid-template-columns:80px 1fr;gap:1.25rem;align-items:center;">
            <div style="text-align:center;">
              <div style="font-family:'Rajdhani',sans-serif;font-size:1.6rem;font-weight:800;color:var(--gold);">${escHtml(p.season||'')}</div>
            </div>
            <div>
              <div style="font-family:'Rajdhani',sans-serif;font-weight:700;color:var(--white);margin-bottom:0.5rem;">${escHtml(p.eventName||'')}</div>
              <p style="font-size:0.83rem;color:var(--muted);line-height:1.7;margin:0;">${escHtml(p.description||'')}</p>
            </div>
          </div>`).join('');
      }
    }
  }

  // ─── Render: Gallery ──────────────────────────────────────
  function renderGallery(container, items) {
    if (!items.length) {
      container.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;grid-column:1/-1;">Aucune photo pour le moment.</p>';
      document.dispatchEvent(new CustomEvent('galleryRendered'));
      return;
    }
    container.innerHTML = items.map(img => `
      <div class="gallery-item${img.isTall?' tall':''}"
           data-cat="${escHtml(img.category||'')}"
           data-src="${escHtml(img.url||'')}"
           data-title="${escHtml(img.title||'')}"
           data-desc="${escHtml(img.description||'')}">
        <img src="${escHtml(img.url||'')}" alt="${escHtml(img.title||'')}" loading="lazy">
        <div class="gallery-overlay">
          <div class="gallery-overlay-title">${escHtml(img.title||'')}</div>
        </div>
      </div>`).join('');
    document.dispatchEvent(new CustomEvent('galleryRendered'));
  }

  // ─── Main init ────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    const page = document.body.dataset.page;

    // Always fetch notice + settings in parallel
    Promise.all([get('/api/notice'), get('/api/settings')])
      .then(([notice, settings]) => {
        initNotice(notice);
        initHours(settings);
      })
      .catch(() => {}); // silently ignore

    // Page-specific content
    if (page === 'index') {
      const grid = document.getElementById('news-grid');
      if (grid) {
        setLoading(grid);
        get('/api/news').then(items => renderNews(grid, items)).catch(() => setError(grid, 'Impossible de charger les actualités.'));
      }
    }

    if (page === 'agenda') {
      const list = document.getElementById('agenda-list');
      if (list) {
        setLoading(list);
        get('/api/agenda').then(items => renderAgenda(list, items)).catch(() => setError(list, 'Impossible de charger l\'agenda.'));
      }
    }

    if (page === 'palmares') {
      const grid = document.getElementById('palmares-grid');
      const hist = document.getElementById('palmares-historique');
      if (grid) {
        setLoading(grid);
        get('/api/palmares').then(items => renderPalmares(grid, hist, items)).catch(() => setError(grid, 'Impossible de charger le palmarès.'));
      }
    }

    if (page === 'galerie') {
      const container = document.getElementById('gallery');
      if (container) {
        setLoading(container);
        get('/api/gallery').then(items => renderGallery(container, items)).catch(() => setError(container, 'Impossible de charger la galerie.'));
      }
    }
  });
})();
