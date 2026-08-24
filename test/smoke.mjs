import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100';
let cookie = '', csrf = '';
async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  if (options.method && options.method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
  if (options.body && !(options.body instanceof FormData)) headers['content-type'] = 'application/json';
  const response = await fetch(base + url, { ...options, headers });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { response, data, text };
}

let result = await request('/health');
assert.equal(result.response.status, 200);
assert.equal(result.data.database, 'connected');

result = await request('/');
assert.equal(result.response.status, 200);
assert.match(result.text, /PYX Security Services \(Pvt\.\) Ltd\./);
assert.match(result.text, /Escort &amp; Personal Security/);
assert.match(result.text, /LATEST NEWS &amp; SECURITY INSIGHTS/);

result = await request('/cms');
assert.equal(result.response.status, 200);
assert.match(result.text, /Website Content Manager/);

result = await request('/api/cms/login', { method: 'POST', body: JSON.stringify({ email: 'admin@example.com', password: 'LocalTestPassword123!' }) });
assert.equal(result.response.status, 200);
cookie = result.response.headers.get('set-cookie').split(';')[0];
csrf = result.data.csrfToken;

result = await request('/api/cms/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: 'LocalTestPassword123!', newPassword: 'LocalChangedPassword456!' }) });
assert.equal(result.response.status, 200);

result = await request('/api/cms/dashboard');
assert.equal(result.response.status, 200);
assert.equal(Number(result.data.services), 13);

result = await request('/api/cms/services', { method: 'POST', body: JSON.stringify({ title: 'Test Technology Service', summary: 'Temporary automated CMS check.', image_url: '/assets/sectors/corporate.png', enabled: true, sort_order: 999 }) });
assert.equal(result.response.status, 201);
const service = result.data;
result = await request('/');
assert.match(result.text, /Test Technology Service/);

result = await request(`/api/cms/services/${service.id}`, { method: 'PUT', body: JSON.stringify({ ...service, enabled: false }) });
assert.equal(result.response.status, 200);
result = await request('/');
assert.doesNotMatch(result.text, /Test Technology Service/);

result = await request('/api/cms/posts', { method: 'POST', body: JSON.stringify({ type: 'news', title: 'CMS Publishing Test', excerpt: 'Draft should remain private.', body: '<p>Draft body.</p><script>alert(1)</script>', image_url: '/assets/sectors/corporate.png', status: 'draft', author: 'PYX Security Services' }) });
assert.equal(result.response.status, 201);
const post = result.data;
assert.doesNotMatch(post.body, /script/);
result = await request('/');
assert.doesNotMatch(result.text, /CMS Publishing Test/);
result = await request(`/api/cms/posts/${post.id}`, { method: 'PUT', body: JSON.stringify({ ...post, status: 'published', published_at: new Date(Date.now() - 1000).toISOString() }) });
assert.equal(result.response.status, 200);
result = await request(`/insights/${post.slug}`);
assert.equal(result.response.status, 200);
assert.match(result.text, /CMS Publishing Test/);

const sections = (await request('/api/cms/sections')).data;
const projectsSection = sections.find(item => item.section_key === 'projects');
result = await request(`/api/cms/sections/${projectsSection.id}`, { method: 'PUT', body: JSON.stringify({ ...projectsSection, enabled: true }) });
assert.equal(result.response.status, 200);
result = await request('/api/cms/projects', { method: 'POST', body: JSON.stringify({ title: 'Integrated Site Protection Test', status: 'published', published_at: new Date(Date.now() - 1000).toISOString(), sector: 'Technology', summary: 'Temporary automated CMS check.', body: '<p>Project body.</p>', image_url: '/assets/sectors/industrial.png' }) });
assert.equal(result.response.status, 201);
const project = result.data;
result = await request('/');
assert.match(result.text, /Integrated Site Protection Test/);
result = await request(`/projects/${project.slug}`);
assert.equal(result.response.status, 200);

result = await request('/api/cms/jobs', { method: 'POST', body: JSON.stringify({ title: 'Test Security Systems Role', status: 'open', department: 'Technology', location_label: 'Operations Site', employment_type: 'Full-time', summary: 'Temporary automated CMS check.', body: '<p>Role body.</p>' }) });
assert.equal(result.response.status, 201);
const job = result.data;
result = await request(`/careers/${job.slug}`);
assert.equal(result.response.status, 200);

result = await request('/api/public/assessment', { method: 'POST', body: JSON.stringify({ name: 'CMS Test', email: 'cms-test@example.com', mobile: '03001234567', location: 'Test Site', details: 'Automated request.' }) });
assert.equal(result.response.status, 201);
result = await request('/api/cms/leads');
assert.ok(result.data.some(item => item.email === 'cms-test@example.com'));

const form = new FormData();
const image = await fs.readFile(new URL('../assets/brand/pyx-logo.jpeg', import.meta.url));
form.append('file', new Blob([image], { type: 'image/jpeg' }), 'pyx-logo-test.jpeg');
form.append('alt_text', 'PYX logo automated test');
result = await request('/api/cms/media', { method: 'POST', body: form });
assert.equal(result.response.status, 201);
assert.match(result.data.url, /^\/uploads\//);
const media = result.data;
result = await request(media.url);
assert.equal(result.response.status, 200);

result = await request(`/api/cms/media/${media.id}`, { method: 'DELETE' });
assert.equal(result.response.status, 200);
for (const [entity, item] of [['services',service],['posts',post],['projects',project],['jobs',job]]) {
  result = await request(`/api/cms/${entity}/${item.id}`, { method: 'DELETE' });
  assert.equal(result.response.status, 200);
}
await request(`/api/cms/sections/${projectsSection.id}`, { method: 'PUT', body: JSON.stringify({ ...projectsSection, enabled: false }) });

result = await request('/api/cms/audit');
assert.ok(result.data.length >= 10);

console.log('CMS smoke test passed: public rendering, authentication, CRUD, publishing, visibility, forms, media and audit log.');
