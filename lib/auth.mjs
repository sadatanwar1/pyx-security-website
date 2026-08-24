import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from './db.mjs';

const COOKIE = 'pyx_cms_session';
const HOURS = 12;

export async function createSession(adminId) {
  const id = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  await query("INSERT INTO sessions (id,administrator_id,csrf_token,expires_at) VALUES ($1,$2,$3,NOW() + INTERVAL '12 hours')", [id, adminId, csrf]);
  return { id, csrf };
}

export function setSessionCookie(res, id) {
  res.cookie(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: HOURS * 60 * 60 * 1000, path: '/' });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
}

export async function loadSession(req, _res, next) {
  try {
    const id = req.cookies?.[COOKIE];
    if (!id) return next();
    const result = await query(`SELECT s.id,s.csrf_token,s.expires_at,a.id AS administrator_id,a.email,a.name,a.must_change_password,a.active
      FROM sessions s JOIN administrators a ON a.id=s.administrator_id
      WHERE s.id=$1 AND s.expires_at > NOW() AND a.active=true`, [id]);
    if (result.rowCount) req.cmsSession = result.rows[0];
    next();
  } catch (error) { next(error); }
}

export function requireAuth(req, res, next) {
  if (!req.cmsSession) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}

export function requireCsrf(req, res, next) {
  const token = req.get('x-csrf-token');
  const supplied = Buffer.from(token || '');
  const expected = Buffer.from(req.cmsSession?.csrf_token || '');
  if (!token || !req.cmsSession || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(403).json({ error: 'Your secure session token is missing or expired. Refresh and try again.' });
  }
  const allowedDuringPasswordChange = ['/api/cms/change-password', '/api/cms/logout'];
  if (req.cmsSession.must_change_password && !allowedDuringPasswordChange.includes(req.originalUrl.split('?')[0])) {
    return res.status(403).json({ error: 'Please replace the temporary password before managing website content.' });
  }
  next();
}

export async function verifyLogin(email, password) {
  const result = await query('SELECT * FROM administrators WHERE email=$1 AND active=true', [String(email || '').trim().toLowerCase()]);
  if (!result.rowCount) return null;
  const admin = result.rows[0];
  return await bcrypt.compare(String(password || ''), admin.password_hash) ? admin : null;
}
