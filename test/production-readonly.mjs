import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || 'https://pyx-security-website-production.up.railway.app';
const email = process.env.TEST_CMS_EMAIL;
const password = process.env.TEST_CMS_PASSWORD;
assert.ok(email && password, 'TEST_CMS_EMAIL and TEST_CMS_PASSWORD are required.');

let response = await fetch(base + '/health');
assert.equal(response.status, 200);
assert.equal((await response.json()).database, 'connected');

response = await fetch(base + '/');
assert.equal(response.status, 200);
const home = await response.text();
assert.match(home, /PYX Security Services \(Pvt\.\) Ltd\./);
assert.match(home, /LATEST NEWS &amp; SECURITY INSIGHTS/);
assert.match(home, /api\/public\/assessment|assessmentForm/);

response = await fetch(base + '/cms');
assert.equal(response.status, 200);
assert.match(await response.text(), /Website Content Manager/);

response = await fetch(base + '/assets/video/hero-final.mp4', { headers: { range: 'bytes=0-1023' } });
assert.equal(response.status, 206);
assert.equal((await response.arrayBuffer()).byteLength, 1024);

response = await fetch(base + '/api/cms/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
assert.equal(response.status, 200);
const login = await response.json();
const cookie = response.headers.get('set-cookie').split(';')[0];
assert.equal(login.user.mustChangePassword, true);

response = await fetch(base + '/api/cms/dashboard', { headers: { cookie } });
assert.equal(response.status, 200);
const dashboard = await response.json();
assert.equal(Number(dashboard.services), 13);
assert.ok(Number(dashboard.posts) >= 3);

for (const path of ['/api/cms/sections','/api/cms/services','/api/cms/sectors','/api/cms/posts','/api/cms/projects','/api/cms/jobs','/api/cms/leads','/api/cms/media','/api/cms/audit']) {
  response = await fetch(base + path, { headers: { cookie } });
  assert.equal(response.status, 200, path);
}

response = await fetch(base + '/api/cms/logout', { method: 'POST', headers: { cookie, 'x-csrf-token': login.csrfToken } });
assert.equal(response.status, 200);

console.log('Production read-only verification passed: database, public site, CMS authentication, all management endpoints and video range delivery.');
