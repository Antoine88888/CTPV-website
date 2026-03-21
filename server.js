'use strict';

const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(ROOT, 'uploads');

// ─── Ensure directories ───────────────────────────────────
for (const d of [DATA, UPLOADS, path.join(ROOT, 'admin')]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ─── JSON helpers ─────────────────────────────────────────
const readJSON  = f => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return null; } };
const writeJSON = (f, d) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), 'utf8');
const newId     = () => 'id_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');

// ─── Init default data ────────────────────────────────────
(function initDefaults() {
  if (!readJSON('admin.json')) {
    writeJSON('admin.json', {
      username: 'admin',
      passwordHash: bcrypt.hashSync('ctpv2026', 10),
      email: 'ctpv@orange.fr'
    });
    console.log('\n  ✓ Compte admin créé — identifiant: admin  /  mot de passe: ctpv2026');
    console.log('  ⚠ Changez le mot de passe dès la première connexion !\n');
  }

  if (!readJSON('notice.json'))
    writeJSON('notice.json', { active: false, type: 'warning', message: '' });

  if (!readJSON('settings.json'))
    writeJSON('settings.json', {
      hours: {
        lundi:  { open: true, morning: '08h00 – 12h00', afternoon: '13h30 – 16h30' },
        samedi: { open: true, morning: '08h00 – 12h00', afternoon: '13h30 – 16h30' }
      }
    });

  if (!readJSON('news.json'))     writeJSON('news.json',     []);
  if (!readJSON('agenda.json'))   writeJSON('agenda.json',   []);
  if (!readJSON('palmares.json')) writeJSON('palmares.json', []);
  if (!readJSON('gallery.json'))  writeJSON('gallery.json',  []);
})();

// ─── Middleware ───────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(session({
  secret: 'ctpv-cms-secret-2026-var83',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', maxAge: 7 * 24 * 3600 * 1000 }
}));

// Static: uploads first (so /uploads/ paths work)
app.use('/uploads', express.static(UPLOADS));
// Static: admin panel
app.use('/admin',   express.static(path.join(ROOT, 'admin')));
// Static: the main site
app.use(express.static(ROOT));

// ─── Auth middleware ──────────────────────────────────────
const requireAdmin = (req, res, next) =>
  req.session?.admin ? next() : res.status(401).json({ error: 'Non autorisé — veuillez vous connecter' });

// ─── Multer (image uploads) ───────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
    cb(null, 'img_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|gif|webp|avif)$/i.test(file.mimetype))
});

// ═══════════════════════════════════════════════════════════
//  PUBLIC API  (no auth required — called by site.js)
// ═══════════════════════════════════════════════════════════
app.get('/api/notice',   (_, r) => r.json(readJSON('notice.json') || { active: false }));
app.get('/api/settings', (_, r) => r.json(readJSON('settings.json') || {}));
app.get('/api/news',     (_, r) => r.json((readJSON('news.json') || []).slice(0, 6)));
app.get('/api/gallery',  (_, r) => r.json(readJSON('gallery.json') || []));

app.get('/api/agenda', (_, r) => {
  const now   = new Date().toISOString().slice(0, 10);
  const items = (readJSON('agenda.json') || []).map(e => ({ ...e, isPast: e.date < now }));
  items.sort((a, b) => {
    if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
    return new Date(a.date) - new Date(b.date);
  });
  r.json(items);
});

app.get('/api/palmares', (_, r) => r.json(readJSON('palmares.json') || []));

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const admin = readJSON('admin.json');
  if (admin && username === admin.username && bcrypt.compareSync(password, admin.passwordHash)) {
    req.session.admin = true;
    res.json({ ok: true, email: admin.email });
  } else {
    res.status(401).json({ error: 'Identifiants incorrects' });
  }
});

app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/auth/me', (req, res) => {
  if (req.session?.admin) {
    const { username, email } = readJSON('admin.json');
    res.json({ ok: true, username, email });
  } else {
    res.json({ ok: false });
  }
});

// ═══════════════════════════════════════════════════════════
//  ADMIN API  (all routes protected)
// ═══════════════════════════════════════════════════════════

// Upload image
app.post('/api/admin/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file)
    return res.status(400).json({ error: 'Fichier invalide ou trop lourd (max 10 Mo)' });
  res.json({ url: '/uploads/' + req.file.filename, filename: req.file.filename });
});

// Notice
app.put('/api/admin/notice', requireAdmin, (req, res) => {
  const { active, type, message } = req.body;
  writeJSON('notice.json', {
    active: !!active,
    type: ['warning', 'info', 'danger'].includes(type) ? type : 'warning',
    message: String(message || '').slice(0, 500)
  });
  res.json({ ok: true });
});

// Settings (hours, etc.)
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  writeJSON('settings.json', req.body);
  res.json({ ok: true });
});

// Account (change email or password)
app.put('/api/admin/account', requireAdmin, (req, res) => {
  const admin = readJSON('admin.json');
  const { email, currentPassword, newPassword } = req.body;
  if (!bcrypt.compareSync(currentPassword, admin.passwordHash))
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  if (email) admin.email = email;
  if (newPassword) {
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'Nouveau mot de passe trop court (min 6 caractères)' });
    admin.passwordHash = bcrypt.hashSync(newPassword, 10);
  }
  writeJSON('admin.json', admin);
  res.json({ ok: true });
});

// ─── Generic CRUD factory ─────────────────────────────────
function makeCRUD(name, sortFn) {
  const file    = name + '.json';
  const getAll  = () => readJSON(file) || [];
  const saveAll = d  => writeJSON(file, d);

  // List (admin sees all)
  app.get(`/api/admin/${name}`, requireAdmin, (_, r) => r.json(getAll()));

  // Create
  app.post(`/api/admin/${name}`, requireAdmin, (req, res) => {
    const list = getAll();
    const item = { id: newId(), ...req.body };
    list.unshift(item);
    if (sortFn) list.sort(sortFn);
    saveAll(list);
    res.json({ ok: true, item });
  });

  // Update
  app.put(`/api/admin/${name}/:id`, requireAdmin, (req, res) => {
    const list = getAll();
    const i    = list.findIndex(x => x.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'Non trouvé' });
    list[i] = { ...list[i], ...req.body };
    if (sortFn) list.sort(sortFn);
    saveAll(list);
    res.json({ ok: true, item: list[i] });
  });

  // Delete
  app.delete(`/api/admin/${name}/:id`, requireAdmin, (req, res) => {
    const list = getAll();
    const item = list.find(x => x.id === req.params.id);
    // Remove uploaded file if gallery item
    if (item?.filename) {
      const fp = path.join(UPLOADS, item.filename);
      if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch {} }
    }
    saveAll(list.filter(x => x.id !== req.params.id));
    res.json({ ok: true });
  });
}

makeCRUD('news');
makeCRUD('agenda', (a, b) => new Date(a.date) - new Date(b.date));
makeCRUD('palmares');
makeCRUD('gallery');

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  const line = '═'.repeat(54);
  console.log('\n' + line);
  console.log('  🎯  CTPV – Serveur CMS démarré');
  console.log(line);
  console.log(`  Site   : http://localhost:${PORT}`);
  console.log(`  Admin  : http://localhost:${PORT}/admin`);
  console.log(line);
  console.log('  Appuyez sur Ctrl+C pour arrêter\n');
});
