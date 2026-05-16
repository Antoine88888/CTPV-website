'use strict';

const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const PDFDocument = require('pdfkit');

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
      },
      contacts: {
        phone: '07 82 47 62 09',
        email: 'ctpv@orange.fr',
        president:  { name: 'Gilbert', phone: '06 73 00 41 09' },
        secretaire: { name: 'Évelyne', phone: '06 79 01 22 83' }
      },
      sites: {
        site3: { street: 'Chemin de Tourris',       city: '83200 Le Revest-les-Eaux' },
        site4: { street: '245 avenue des Meuniers', city: '83200 Toulon' }
      }
    });

  if (!readJSON('news.json'))       writeJSON('news.json',       []);
  if (!readJSON('agenda.json'))     writeJSON('agenda.json',     []);
  if (!readJSON('palmares.json'))   writeJSON('palmares.json',   []);
  if (!readJSON('gallery.json'))    writeJSON('gallery.json',    []);
  if (!readJSON('membership.json')) writeJSON('membership.json', {
    season: '2025-2026',
    droitEntree: '',
    licence: '',
    carnetTir: '',
    pdf: {
      clubName: 'CLUB DE TIR POLICE VAROIS',
      clubSubtitle: 'Affilie a la Federation Francaise de Tir (FFTIR)',
      clubAddress: '245 av. des Meuniers, 83200 Toulon',
      clubEmail: 'ctpv@orange.fr',
      formTitle: "BULLETIN D'ADHESION",
      sectionIdentite: 'Informations personnelles',
      sectionParrain: 'Informations du parrain policier',
      sectionEngagement: 'Engagement',
      engagementText: "declare respecter l'ethique sportive, avoir pris connaissance et m'engage a appliquer les reglements interieurs du CTPV.",
      sectionDocuments: 'Documents a fournir',
      documents: [
        'Ce formulaire complete et signe',
        "Certificat medical d'aptitude a la pratique du tir sportif",
        "3 photos d'identite",
        "Acquittement du droit d'entree{droitEntree}",
        "Acquittement de la licence FFTIR{licence}",
        "Achat du carnet de tir{carnetTir}",
        "Photocopie de la carte nationale d'identite",
        'Extrait de casier judiciaire B3  -  https://www.cjn.justice.gouv.fr/cjn/b3/eje20'
      ]
    }
  });
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
app.get('/api/membership', (_, r) => r.json(readJSON('membership.json') || {}));
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

// ─── Membership form PDF ──────────────────────────────────
app.get('/api/membership-form', async (req, res) => {
  try {
    const m = readJSON('membership.json') || {};
    const p = m.pdf || {};

    const clubName      = p.clubName      || 'CLUB DE TIR POLICE VAROIS';
    const clubSubtitle  = p.clubSubtitle  || 'Affilie a la Federation Francaise de Tir (FFTIR)';
    const clubAddress   = p.clubAddress   || '245 av. des Meuniers, 83200 Toulon';
    const clubEmail     = p.clubEmail     || 'ctpv@orange.fr';
    const formTitle     = p.formTitle     || "BULLETIN D'ADHESION";
    const secIdentite   = p.sectionIdentite   || 'Informations personnelles';
    const secParrain    = p.sectionParrain    || 'Informations du parrain policier';
    const secEngagement = p.sectionEngagement || 'Engagement';
    const engText       = p.engagementText    || "declare respecter l'ethique sportive, avoir pris connaissance et m'engage a appliquer les reglements interieurs du CTPV.";
    const secDocuments  = p.sectionDocuments  || 'Documents a fournir';

    const defaultDocs = [
      'Ce formulaire complete et signe',
      "Certificat medical d'aptitude a la pratique du tir sportif",
      "3 photos d'identite",
      "Acquittement du droit d'entree{droitEntree}",
      "Acquittement de la licence FFTIR{licence}",
      "Achat du carnet de tir{carnetTir}",
      "Photocopie de la carte nationale d'identite",
      'Extrait de casier judiciaire B3  -  https://www.cjn.justice.gouv.fr/cjn/b3/eje20'
    ];
    const rawDocs = (Array.isArray(p.documents) && p.documents.length) ? p.documents : defaultDocs;
    const docList = rawDocs.map(d => d
      .replace('{droitEntree}', m.droitEntree ? ' : ' + m.droitEntree : '')
      .replace('{licence}',     m.licence     ? ' : ' + m.licence     : '')
      .replace('{carnetTir}',   m.carnetTir   ? ' : ' + m.carnetTir   : '')
    );

    const doc = new PDFDocument({ size: 'A4', margin: 48,
      info: { Title: "Bulletin d'adhesion CTPV", Author: 'CTPV' } });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="bulletin-adhesion-ctpv.pdf"');
    doc.pipe(res);

    const GOLD  = '#C9A84C';
    const DARK  = '#1a1a2e';
    const TEXT  = '#222222';
    const MUTED = '#666666';
    const GREY  = '#bbbbbb';
    const W     = doc.page.width - 96;
    const L     = 48;
    let   y     = 48;

    function hline(yy, col, w) {
      doc.moveTo(L, yy).lineTo(L + W, yy).lineWidth(w || 0.8).strokeColor(col || GOLD).stroke();
    }

    function field(label, yy, x, fw) {
      doc.fontSize(7.5).fillColor(MUTED).font('Helvetica').text(label, x, yy, { width: fw, lineBreak: false });
      const ly = yy + 13;
      doc.moveTo(x, ly).lineTo(x + fw, ly).lineWidth(0.5).strokeColor(GREY).stroke();
      return ly + 6;
    }

    function chk(label, x, yy) {
      doc.rect(x, yy + 1, 8, 8).lineWidth(0.7).strokeColor(DARK).stroke();
      doc.fontSize(8).fillColor(TEXT).font('Helvetica').text(label, x + 11, yy + 1, { lineBreak: false });
    }

    function secTitle(txt, yy) {
      doc.fontSize(7).fillColor(GOLD).font('Helvetica-Bold')
         .text(txt.toUpperCase(), L, yy, { width: W, characterSpacing: 1, lineBreak: false });
      return yy + 13;
    }

    // ── Header ────────────────────────────────────────────
    const cx = L + 28, cy = y + 26;
    const radii = [20, 13, 6];
    radii.forEach(r => {
      doc.circle(cx, cy, r).lineWidth(0.8).strokeColor(GOLD).stroke();
    });
    doc.circle(cx, cy, 2).fillColor(GOLD).fill();
    [
      [cx - 20, cy, cx - 15, cy], [cx + 15, cy, cx + 20, cy],
      [cx, cy - 20, cx, cy - 15], [cx, cy + 15, cx, cy + 20]
    ].forEach(([x1, y1, x2, y2]) => {
      doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(1.2).strokeColor(GOLD).stroke();
    });

    doc.fontSize(14).fillColor(DARK).font('Helvetica-Bold')
       .text(clubName, L + 64, y + 8, { width: W - 130, lineBreak: false });
    doc.fontSize(8).fillColor(MUTED).font('Helvetica')
       .text(clubSubtitle, L + 64, y + 27, { width: W - 130, lineBreak: false });
    doc.fontSize(7.5).fillColor(MUTED).font('Helvetica')
       .text(clubAddress + '  |  ' + clubEmail, L + 64, y + 40, { width: W - 130, lineBreak: false });

    const bx = L + W - 60, by = y + 4;
    const localLogo = path.join(DATA, 'logo-fftir.png');
    let logoBuf = null;
    if (fs.existsSync(localLogo)) {
      logoBuf = fs.readFileSync(localLogo);
    } else {
      try {
        const r = await fetch('https://www.fftir.org/wp-content/uploads/2021/01/Logo-FFTIR-1.png');
        if (r.ok) logoBuf = Buffer.from(await r.arrayBuffer());
      } catch {}
    }
    if (logoBuf) {
      doc.image(logoBuf, bx, by, { width: 60, height: 30, fit: [60, 30], align: 'center', valign: 'center' });
    } else {
      doc.roundedRect(bx, by, 60, 30, 4).fillColor(DARK).fill();
      doc.fontSize(11).fillColor(GOLD).font('Helvetica-Bold')
         .text('FFTIR', bx, by + 5, { width: 60, align: 'center', lineBreak: false });
      doc.fontSize(6).fillColor(GREY).font('Helvetica')
         .text('Fed. Francaise de Tir', bx, by + 18, { width: 60, align: 'center', lineBreak: false });
    }

    y += 60;
    hline(y, GOLD, 1.5);
    y += 8;

    // ── Title ─────────────────────────────────────────────
    doc.fontSize(13).fillColor(DARK).font('Helvetica-Bold')
       .text(formTitle, L, y, { width: W, align: 'center', lineBreak: false });
    y += 18;
    doc.fontSize(10).fillColor(GOLD).font('Helvetica-Bold')
       .text('SAISON ' + (m.season || '2025-2026'), L, y, { width: W, align: 'center', lineBreak: false });
    y += 14;
    hline(y, GOLD, 1.5);
    y += 10;

    // ── Identité ──────────────────────────────────────────
    y = secTitle(secIdentite, y);
    const half = (W - 12) / 2;

    field('DATE', y, L, 130);
    y = field('NOM ET PRENOM', y, L + 142, W - 142) + 3;
    y = field('DATE ET LIEU DE NAISSANCE (JJ/MM/AAAA  a)', y, L, W) + 3;
    y = field('NATIONALITE', y, L, half) + 3;

    const fry = y;
    field('FILS / FILLE DE', fry, L, half);
    doc.fontSize(7.5).fillColor(MUTED).font('Helvetica')
       .text('POLICIER / GENDARME / POLICIER MUNICIPAL :', L + half + 12, fry, { lineBreak: false });
    chk('OUI', L + half + 12, fry + 12);
    chk('NON', L + half + 55, fry + 12);
    y = fry + 28;

    y = field('PROFESSION', y, L, W) + 3;
    y = field('ADRESSE POSTALE', y, L, W) + 3;
    field('CODE POSTAL', y, L, 130);
    y = field('VILLE', y, L + 142, W - 142) + 3;
    y = field('EMAIL', y, L, W) + 3;
    field('N° TEL DOMICILE', y, L, half);
    y = field('N° TEL TRAVAIL', y, L + half + 12, half) + 3;
    y = field('N° TEL PORTABLE', y, L, half) + 3;
    y = field('ANCIEN CLUB ET N° DE LICENCE (si mutation)', y, L, W) + 3;
    y = field('ARMES DETENUES  -  N° DETENTION ET DATE', y, L, W) + 10;

    // ── Parrain ───────────────────────────────────────────
    hline(y, GREY, 0.4); y += 7;
    y = secTitle(secParrain, y);
    y = field('NOM ET PRENOM DU PARRAIN POLICIER', y, L, W) + 3;
    field('FONCTION DU PARRAIN', y, L, half);
    y = field('N° TEL DU PARRAIN', y, L + half + 12, half) + 10;

    // ── Engagement ────────────────────────────────────────
    hline(y, GREY, 0.4); y += 7;
    y = secTitle(secEngagement, y);
    doc.fontSize(8.5).fillColor(TEXT).font('Helvetica')
       .text('Je soussigne(e)  ', L, y, { lineBreak: false });
    doc.moveTo(L + 80, y + 11).lineTo(L + W, y + 11).lineWidth(0.5).strokeColor(GREY).stroke();
    y += 18;
    doc.fontSize(8.5).fillColor(TEXT).font('Helvetica')
       .text(engText, L, y, { width: W });
    y += 24;

    doc.fontSize(8).fillColor(MUTED).font('Helvetica').text('Lieu et date :', L, y, { lineBreak: false });
    doc.moveTo(L + 68, y + 11).lineTo(L + 240, y + 11).lineWidth(0.5).strokeColor(GREY).stroke();
    doc.fontSize(8).fillColor(MUTED).font('Helvetica').text('Signature :', L + W - 140, y, { lineBreak: false });
    doc.moveTo(L + W - 70, y + 11).lineTo(L + W, y + 11).lineWidth(0.5).strokeColor(GREY).stroke();
    y += 22;

    // ── Documents ─────────────────────────────────────────
    hline(y, GOLD, 0.8); y += 7;
    y = secTitle(secDocuments, y);

    docList.forEach(d => {
      doc.rect(L + 2, y + 2, 6, 6).lineWidth(0.6).strokeColor(GOLD).stroke();
      doc.fontSize(8).fillColor(TEXT).font('Helvetica').text(d, L + 13, y + 2, { width: W - 13, lineBreak: false });
      y += 14;
    });

    y += 6;
    hline(y, GOLD, 0.8);
    doc.fontSize(7).fillColor(MUTED).font('Helvetica')
       .text('CTPV  |  ' + clubAddress + '  |  ' + clubEmail, L, y + 6, { width: W, align: 'center', lineBreak: false });

    doc.end();
  } catch (err) {
    console.error('PDF error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur generation PDF' });
  }
});

// Membership admin (save)
app.put('/api/admin/membership', requireAdmin, (req, res) => {
  const current = readJSON('membership.json') || {};
  const data    = { ...current };
  const allowed = ['season', 'droitEntree', 'licence', 'carnetTir'];
  allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = String(req.body[k]); });
  if (req.body.pdf && typeof req.body.pdf === 'object') {
    const pdfAllowed = ['clubName', 'clubSubtitle', 'clubAddress', 'clubEmail',
                        'formTitle', 'sectionIdentite', 'sectionParrain',
                        'sectionEngagement', 'engagementText', 'sectionDocuments'];
    const pdf = { ...(current.pdf || {}) };
    pdfAllowed.forEach(k => { if (req.body.pdf[k] !== undefined) pdf[k] = String(req.body.pdf[k]); });
    if (Array.isArray(req.body.pdf.documents)) pdf.documents = req.body.pdf.documents.map(String);
    data.pdf = pdf;
  }
  writeJSON('membership.json', data);
  res.json({ ok: true });
});

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

// Settings (hours, contacts, etc.) — deep-merge to preserve unrelated keys
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const current = readJSON('settings.json') || {};
  writeJSON('settings.json', { ...current, ...req.body });
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
