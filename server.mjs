import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import sanitizeHtml from 'sanitize-html';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeDatabase, query, audit, slugify } from './lib/db.mjs';
import { createSession, setSessionCookie, clearSessionCookie, loadSession, requireAuth, requireCsrf, verifyLogin } from './lib/auth.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(root, 'uploads'));
fs.mkdirSync(uploadDir, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(root, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      frameSrc: ['https://www.google.com', 'https://maps.google.com'],
      connectSrc: ["'self'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(loadSession);
app.use('/assets', express.static(path.join(root, 'assets'), { maxAge: '7d', immutable: true }));
app.use('/uploads', express.static(uploadDir, { maxAge: '1d' }));
app.use(express.static(path.join(root, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.get('/cms-preview.css', (_req, res) => res.sendFile(path.join(root, 'cms-preview.css')));
app.get('/layout-refinements.css', (_req, res) => res.sendFile(path.join(root, 'layout-refinements.css')));
app.get('/portal.html', (_req, res) => res.sendFile(path.join(root, 'portal.html')));

const cleanText = (value, max = 10000) => String(value ?? '').trim().slice(0, max);
const cleanHtml = value => sanitizeHtml(String(value ?? ''), {
  allowedTags: ['p','br','strong','b','em','i','ul','ol','li','h2','h3','h4','blockquote','a'],
  allowedAttributes: { a: ['href','target','rel'] },
  allowedSchemes: ['http','https','mailto','tel']
});
const asBool = value => value === true || value === 'true' || value === 1 || value === '1' || value === 'on';
const asInt = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
const asNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safeUrl = value => {
  const url = cleanText(value, 500);
  return /^(\/|https:\/\/)/i.test(url) ? url : '';
};

async function publicData() {
  const [settings, sections, services, sectors, posts, projects, jobs] = await Promise.all([
    query('SELECT key,value FROM settings'),
    query('SELECT * FROM sections WHERE enabled=true ORDER BY sort_order,id'),
    query('SELECT * FROM services WHERE enabled=true ORDER BY sort_order,id'),
    query('SELECT * FROM sectors WHERE enabled=true ORDER BY sort_order,id'),
    query("SELECT * FROM posts WHERE status='published' AND (published_at IS NULL OR published_at <= NOW()) ORDER BY featured DESC,published_at DESC NULLS LAST,id DESC LIMIT 6"),
    query("SELECT * FROM projects WHERE status='published' AND (published_at IS NULL OR published_at <= NOW()) ORDER BY featured DESC,published_at DESC NULLS LAST,id DESC LIMIT 6"),
    query("SELECT * FROM jobs WHERE status='open' AND (closing_date IS NULL OR closing_date >= CURRENT_DATE) ORDER BY closing_date NULLS LAST,id DESC")
  ]);
  return {
    settings: Object.fromEntries(settings.rows.map(row => [row.key, row.value])),
    sections: Object.fromEntries(sections.rows.map(row => [row.section_key, row])),
    services: services.rows,
    sectors: sectors.rows,
    posts: posts.rows,
    projects: projects.rows,
    jobs: jobs.rows
  };
}

app.get('/', async (_req, res, next) => {
  try { res.render('home', await publicData()); } catch (error) { next(error); }
});
app.get('/insights/:slug', async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM posts WHERE slug=$1 AND status='published' AND (published_at IS NULL OR published_at <= NOW())", [req.params.slug]);
    if (!result.rowCount) return res.status(404).render('not-found', { title: 'Article not found' });
    const settings = await query("SELECT value FROM settings WHERE key='site'");
    res.render('content', { item: result.rows[0], site: settings.rows[0].value, kind: 'Insight' });
  } catch (error) { next(error); }
});
app.get('/services/:slug', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM services WHERE slug=$1 AND enabled=true', [req.params.slug]);
    if (!result.rowCount) return res.status(404).render('not-found', { title: 'Service not found' });
    const settings = await query("SELECT value FROM settings WHERE key='site'");
    res.render('content', { item: { ...result.rows[0], excerpt: result.rows[0].summary }, site: settings.rows[0].value, kind: 'PYX Service' });
  } catch (error) { next(error); }
});
app.get('/projects/:slug', async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM projects WHERE slug=$1 AND status='published' AND (published_at IS NULL OR published_at <= NOW())", [req.params.slug]);
    if (!result.rowCount) return res.status(404).render('not-found', { title: 'Project not found' });
    const settings = await query("SELECT value FROM settings WHERE key='site'");
    res.render('content', { item: result.rows[0], site: settings.rows[0].value, kind: 'Project' });
  } catch (error) { next(error); }
});
app.get('/careers/:slug', async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM jobs WHERE slug=$1 AND status='open' AND (closing_date IS NULL OR closing_date >= CURRENT_DATE)", [req.params.slug]);
    if (!result.rowCount) return res.status(404).render('not-found', { title: 'Vacancy not found' });
    const settings = await query("SELECT value FROM settings WHERE key='site'");
    res.render('job', { item: result.rows[0], site: settings.rows[0].value });
  } catch (error) { next(error); }
});

const publicRate = new Map();
function publicRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const entries = (publicRate.get(key) || []).filter(time => now - time < 10 * 60 * 1000);
  if (entries.length >= 10) return res.status(429).json({ error: 'Please wait before sending another request.' });
  entries.push(now); publicRate.set(key, entries); next();
}
function publicLead(type) {
  return async (req, res, next) => {
    try {
      const name = cleanText(req.body.name, 150);
      const email = cleanText(req.body.email, 250).toLowerCase();
      const mobile = cleanText(req.body.mobile, 50);
      const location = cleanText(req.body.location, 250);
      const details = cleanText(req.body.details, 5000);
      if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Please provide your name and a valid email address.' });
      if (type === 'assessment' && (!mobile || !location)) return res.status(400).json({ error: 'Mobile number and City / Site are required.' });
      const result = await query(`INSERT INTO leads (type,name,email,mobile,company,industry,location_label,requirement,details,job_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [type,name,email,mobile,cleanText(req.body.company,250),cleanText(req.body.industry,250),location,cleanText(req.body.requirement,500),details,req.body.jobId ? asInt(req.body.jobId) : null]);
      res.status(201).json({ ok: true, id: result.rows[0].id, message: type === 'career' ? 'Your application has been received.' : 'Thank you. Your request has been received by PYX.' });
    } catch (error) { next(error); }
  };
}
app.post('/api/public/assessment', publicRateLimit, publicLead('assessment'));
app.post('/api/public/contact', publicRateLimit, publicLead('contact'));
app.post('/api/public/career', publicRateLimit, publicLead('career'));

const loginRate = new Map();
app.post('/api/cms/login', async (req, res, next) => {
  try {
    const now = Date.now(), key = req.ip;
    const attempts = (loginRate.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
    if (attempts.length >= 8) return res.status(429).json({ error: 'Too many sign-in attempts. Please wait 15 minutes.' });
    const admin = await verifyLogin(req.body.email, req.body.password);
    if (!admin) { attempts.push(now); loginRate.set(key, attempts); return res.status(401).json({ error: 'Email or password is incorrect.' }); }
    loginRate.delete(key);
    const session = await createSession(admin.id);
    setSessionCookie(res, session.id);
    await query('UPDATE administrators SET last_login_at=NOW() WHERE id=$1', [admin.id]);
    await audit(admin.id, 'login', 'administrator', admin.id);
    res.json({ ok: true, csrfToken: session.csrf, user: { id: admin.id, email: admin.email, name: admin.name, mustChangePassword: admin.must_change_password } });
  } catch (error) { next(error); }
});
app.get('/api/cms/session', requireAuth, (req, res) => res.json({ csrfToken: req.cmsSession.csrf_token, user: { id: req.cmsSession.administrator_id, email: req.cmsSession.email, name: req.cmsSession.name, mustChangePassword: req.cmsSession.must_change_password } }));
app.post('/api/cms/logout', requireAuth, requireCsrf, async (req, res, next) => {
  try { await query('DELETE FROM sessions WHERE id=$1', [req.cmsSession.id]); clearSessionCookie(res); res.json({ ok: true }); } catch (error) { next(error); }
});
app.post('/api/cms/change-password', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const current = cleanText(req.body.currentPassword, 500), password = String(req.body.newPassword || '');
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) return res.status(400).json({ error: 'Use at least 12 characters including uppercase, lowercase and a number.' });
    const found = await query('SELECT password_hash FROM administrators WHERE id=$1', [req.cmsSession.administrator_id]);
    if (!await bcrypt.compare(current, found.rows[0].password_hash)) return res.status(400).json({ error: 'Current password is incorrect.' });
    const hash = await bcrypt.hash(password, 12);
    await query('UPDATE administrators SET password_hash=$1,must_change_password=false,updated_at=NOW() WHERE id=$2', [hash, req.cmsSession.administrator_id]);
    await audit(req.cmsSession.administrator_id, 'change_password', 'administrator', req.cmsSession.administrator_id);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/cms/dashboard', requireAuth, async (_req, res, next) => {
  try {
    const result = await query(`SELECT
      (SELECT COUNT(*) FROM services) AS services,
      (SELECT COUNT(*) FROM posts) AS posts,
      (SELECT COUNT(*) FROM projects) AS projects,
      (SELECT COUNT(*) FROM jobs WHERE status='open') AS open_jobs,
      (SELECT COUNT(*) FROM leads WHERE status='new') AS new_leads,
      (SELECT COUNT(*) FROM media) AS media`);
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});
app.get('/api/cms/settings', requireAuth, async (_req, res, next) => {
  try { const result = await query('SELECT key,value,updated_at FROM settings ORDER BY key'); res.json(result.rows); } catch (error) { next(error); }
});
app.put('/api/cms/settings/:key', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    if (!['site','hero','careers'].includes(req.params.key)) return res.status(400).json({ error: 'Unknown settings group.' });
    const value = req.body.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return res.status(400).json({ error: 'Settings must be an object.' });
    const result = await query('INSERT INTO settings (key,value,updated_at) VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW() RETURNING *', [req.params.key, JSON.stringify(value)]);
    await audit(req.cmsSession.administrator_id, 'update', 'settings', req.params.key);
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});
app.get('/api/cms/sections', requireAuth, async (_req, res, next) => {
  try { const result = await query('SELECT * FROM sections ORDER BY sort_order,id'); res.json(result.rows); } catch (error) { next(error); }
});
app.put('/api/cms/sections/:id', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const result = await query(`UPDATE sections SET label=$1,kicker=$2,title=$3,body=$4,enabled=$5,sort_order=$6,extra=$7::jsonb,updated_at=NOW() WHERE id=$8 RETURNING *`, [cleanText(req.body.label,100),cleanText(req.body.kicker,150),cleanText(req.body.title,250),cleanText(req.body.body,3000),asBool(req.body.enabled),asInt(req.body.sort_order),JSON.stringify(req.body.extra && typeof req.body.extra === 'object' ? req.body.extra : {}),asInt(req.params.id)]);
    if (!result.rowCount) return res.status(404).json({ error: 'Section not found.' });
    await audit(req.cmsSession.administrator_id, 'update', 'section', req.params.id);
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

const entityConfig = {
  services: { table: 'services', listOrder: 'sort_order,id', fields: ['title','slug','summary','body','image_url','video_url','video_start','video_end','enabled','featured','sort_order'] },
  sectors: { table: 'sectors', listOrder: 'sort_order,id', fields: ['title','slug','summary','image_url','enabled','sort_order'] },
  posts: { table: 'posts', listOrder: 'created_at DESC', fields: ['type','title','slug','excerpt','body','image_url','status','featured','published_at','author','meta_title','meta_description'] },
  projects: { table: 'projects', listOrder: 'created_at DESC', fields: ['title','slug','client_label','sector','location_label','summary','body','image_url','status','featured','published_at'] },
  jobs: { table: 'jobs', listOrder: 'created_at DESC', fields: ['title','slug','department','location_label','employment_type','summary','body','status','closing_date'] }
};
function entityValues(entity, body) {
  const config = entityConfig[entity];
  const data = {};
  for (const field of config.fields) {
    if (field === 'slug') data[field] = slugify(body[field] || body.title);
    else if (['enabled','featured'].includes(field)) data[field] = asBool(body[field]);
    else if (['sort_order'].includes(field)) data[field] = asInt(body[field]);
    else if (['video_start','video_end'].includes(field)) data[field] = asNumber(body[field]);
    else if (field === 'body') data[field] = cleanHtml(body[field]);
    else if (['image_url','video_url'].includes(field)) data[field] = safeUrl(body[field]);
    else if (['published_at','closing_date'].includes(field)) data[field] = body[field] || null;
    else data[field] = cleanText(body[field], field.includes('summary') || field === 'excerpt' ? 1000 : 500);
  }
  return data;
}
for (const [entity, config] of Object.entries(entityConfig)) {
  app.get(`/api/cms/${entity}`, requireAuth, async (_req, res, next) => {
    try { const result = await query(`SELECT * FROM ${config.table} ORDER BY ${config.listOrder}`); res.json(result.rows); } catch (error) { next(error); }
  });
  app.post(`/api/cms/${entity}`, requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const data = entityValues(entity, req.body);
      if (!data.title) return res.status(400).json({ error: 'Title is required.' });
      const fields = Object.keys(data), params = Object.values(data);
      const result = await query(`INSERT INTO ${config.table} (${fields.join(',')}) VALUES (${fields.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`, params);
      await audit(req.cmsSession.administrator_id, 'create', entity, result.rows[0].id);
      res.status(201).json(result.rows[0]);
    } catch (error) { next(error); }
  });
  app.put(`/api/cms/${entity}/:id`, requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const data = entityValues(entity, req.body);
      if (!data.title) return res.status(400).json({ error: 'Title is required.' });
      const fields = Object.keys(data), params = Object.values(data);
      params.push(asInt(req.params.id));
      const result = await query(`UPDATE ${config.table} SET ${fields.map((field,i)=>`${field}=$${i+1}`).join(',')},updated_at=NOW() WHERE id=$${params.length} RETURNING *`, params);
      if (!result.rowCount) return res.status(404).json({ error: 'Item not found.' });
      await audit(req.cmsSession.administrator_id, 'update', entity, req.params.id);
      res.json(result.rows[0]);
    } catch (error) { next(error); }
  });
  app.delete(`/api/cms/${entity}/:id`, requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const result = await query(`DELETE FROM ${config.table} WHERE id=$1 RETURNING id`, [asInt(req.params.id)]);
      if (!result.rowCount) return res.status(404).json({ error: 'Item not found.' });
      await audit(req.cmsSession.administrator_id, 'delete', entity, req.params.id);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
    callback(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extensions[file.mimetype]}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (_req, file, callback) => callback(null, ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype)) });
app.get('/api/cms/media', requireAuth, async (_req, res, next) => {
  try { const result = await query('SELECT * FROM media ORDER BY created_at DESC'); res.json(result.rows); } catch (error) { next(error); }
});
app.post('/api/cms/media', requireAuth, requireCsrf, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Select a JPG, PNG, WebP or GIF image up to 8 MB.' });
    const url = `/uploads/${req.file.filename}`;
    const result = await query('INSERT INTO media (original_name,file_name,url,mime_type,size_bytes,alt_text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [req.file.originalname,req.file.filename,url,req.file.mimetype,req.file.size,cleanText(req.body.alt_text,300)]);
    await audit(req.cmsSession.administrator_id, 'upload', 'media', result.rows[0].id);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});
app.delete('/api/cms/media/:id', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const result = await query('DELETE FROM media WHERE id=$1 RETURNING *', [asInt(req.params.id)]);
    if (!result.rowCount) return res.status(404).json({ error: 'Media item not found.' });
    const filePath = path.join(uploadDir, result.rows[0].file_name);
    if (filePath.startsWith(uploadDir + path.sep) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await audit(req.cmsSession.administrator_id, 'delete', 'media', req.params.id);
    res.json({ ok: true });
  } catch (error) { next(error); }
});
app.get('/api/cms/leads', requireAuth, async (req, res, next) => {
  try {
    const type = ['assessment','contact','career'].includes(req.query.type) ? req.query.type : null;
    const result = await query(`SELECT l.*,j.title AS job_title FROM leads l LEFT JOIN jobs j ON j.id=l.job_id ${type ? 'WHERE l.type=$1' : ''} ORDER BY l.created_at DESC`, type ? [type] : []);
    res.json(result.rows);
  } catch (error) { next(error); }
});
app.put('/api/cms/leads/:id', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    if (!['new','in_progress','closed'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
    const result = await query('UPDATE leads SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [req.body.status,asInt(req.params.id)]);
    if (!result.rowCount) return res.status(404).json({ error: 'Submission not found.' });
    await audit(req.cmsSession.administrator_id, 'update_status', 'lead', req.params.id, { status: req.body.status });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});
app.get('/api/cms/audit', requireAuth, async (_req, res, next) => {
  try { const result = await query('SELECT a.*,u.name AS administrator_name FROM audit_log a LEFT JOIN administrators u ON u.id=a.administrator_id ORDER BY a.created_at DESC LIMIT 200'); res.json(result.rows); } catch (error) { next(error); }
});

app.get('/health', async (_req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true, database: 'connected' }); } catch { res.status(503).json({ ok: false, database: 'unavailable' }); }
});
app.get('/cms', (_req, res) => res.sendFile(path.join(root, 'public', 'cms', 'index.html')));
app.get('/cms/*path', (_req, res) => res.sendFile(path.join(root, 'public', 'cms', 'index.html')));
app.use((_req, res) => res.status(404).render('not-found', { title: 'Page not found' }));
app.use((error, req, res, _next) => {
  console.error(error);
  const duplicate = error?.code === '23505';
  const uploadError = error instanceof multer.MulterError;
  const message = duplicate ? 'That slug is already in use. Please choose another.' : uploadError ? 'The image could not be uploaded. Check its size and format.' : 'Something went wrong. Please try again.';
  if (req.path.startsWith('/api/')) return res.status(duplicate ? 409 : 500).json({ error: message });
  res.status(500).send('The site is temporarily unavailable.');
});

await initializeDatabase();
app.listen(port, '0.0.0.0', () => console.log(`PYX website CMS listening on port ${port}`));
