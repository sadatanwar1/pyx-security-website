import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

let Pool = pg.Pool;
if (process.env.CMS_DB_MODE === 'memory') {
  const { newDb } = await import('pg-mem');
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  Pool = memory.adapters.createPg().Pool;
}
export const pool = new Pool({
  ...(process.env.CMS_DB_MODE === 'memory' ? {} : {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  }),
  max: 10,
  idleTimeoutMillis: 30000
});

export const query = (text, params = []) => pool.query(text, params);

const schema = `
CREATE TABLE IF NOT EXISTS administrators (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  administrator_id BIGINT NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sections (
  id BIGSERIAL PRIMARY KEY,
  section_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  kicker TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS services (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  video_start NUMERIC NOT NULL DEFAULT 0,
  video_end NUMERIC NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sectors (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'insight' CHECK (type IN ('news','blog','insight')),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  author TEXT NOT NULL DEFAULT 'PYX Security Services',
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  client_label TEXT NOT NULL DEFAULT '',
  sector TEXT NOT NULL DEFAULT '',
  location_label TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  location_label TEXT NOT NULL DEFAULT '',
  employment_type TEXT NOT NULL DEFAULT 'Full-time',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  closing_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS media (
  id BIGSERIAL PRIMARY KEY,
  original_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('assessment','contact','career')),
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  location_label TEXT NOT NULL DEFAULT '',
  requirement TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
  attachment_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  administrator_id BIGINT REFERENCES administrators(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const settingsSeed = {
  site: {
    companyName: 'PYX Security Services (Pvt.) Ltd.',
    shortName: 'PYX Security Services',
    strapline: 'Security Operations + Technology',
    notice: 'PYX SECURITY SERVICES (PVT.) LTD. · SECURITY OPERATIONS & TECHNOLOGY SOLUTIONS SINCE 1991',
    title: 'PYX Security Services | Security Operations & Technology',
    description: 'Professional security personnel, specialist protection, security systems and technology services across Pakistan.',
    logo: '/assets/brand/pyx-logo.jpeg',
    email: 'info@pyxsecurity.com',
    assessmentEmail: 'msadatanwar1@gmail.com',
    phones: ['+92 42 36685320', '+92 42 36685301'],
    address: '12-A, 1st Floor, Tufail Market, opposite Cantt Courts, Tufail Road, Saddar, Lahore Cantt.',
    mapQuery: '12-A, 1st Floor, Tufail Market, Tufail Road, Lahore Cantt, Pakistan',
    footer: 'PYX Security Services (Pvt.) Ltd.',
    chatEnabled: true
  },
  hero: {
    kicker: 'SECURITY OPERATIONS + TECHNOLOGY',
    title: 'Protection built around your operating reality.',
    body: 'PYX combines professional security personnel, specialist protection, security systems and technology services to protect people, property and business operations.',
    video: '/assets/video/hero-final.mp4',
    primaryLabel: 'Request an Assessment',
    secondaryLabel: 'Explore Services',
    stats: [
      { value: 35, suffix: '+', label: 'Years of operations' },
      { value: 2800, suffix: '+', label: 'Punjab & KPK personnel' },
      { value: 560, suffix: '+', label: 'Punjab & KPK sites' },
      { value: 57, suffix: '', label: 'Technology professionals' }
    ]
  },
  careers: {
    applicationEmail: 'info@pyxsecurity.com',
    emptyMessage: 'There are no advertised vacancies at present. You can still share your profile for future opportunities.'
  }
};

const sectionsSeed = [
  ['promise','Promise','THE PYX PROMISE','Understand the requirement first. Design protection around it.','Recruitment, verification, training, supervision, security technology and management visibility are connected parts of service delivery.',true,10,{quote:'Protection should fit the operation—not force the operation to fit a generic package.',image:'/assets/sectors/banking-uniform-v4.png'}],
  ['services','Services','SECURITY + TECHNOLOGY SERVICES','A broader capability set than guarding alone.','From professional guarding and specialist protection to security systems, training, information security, technology projects and manpower support.',true,20,{}],
  ['sectors','Sectors','SECTORS SERVED','Different environments require different security thinking.','Security arrangements should reflect how people, vehicles, visitors, assets and operations actually move through each environment.',true,30,{}],
  ['digital','PYX Digital','PYX DIGITAL PLATFORM','Dashboards and portals that make service information easier to see.','Connected customer, employee, administration and operations workspaces.',true,40,{dashboardTitle:'PYX Digital Dashboard Preview',ctaLabel:'Open PYX Digital walkthrough →',roles:[{label:'CUSTOMER',title:'Customer Portal',body:'Reports, incidents, invoices, complaints and requests.'},{label:'FIELD',title:'Employee & Mobile',body:'Attendance, tasks, documents and reporting.'},{label:'ADMINISTRATION',title:'Admin',body:'Users, governance and oversight.'},{label:'BACK-OFFICE',title:'Operations & Support',body:'Connected HR, finance and workflows.'}]}],
  ['projects','Projects','SELECTED PROJECTS','Protection and technology designed around real operating environments.','Publish approved project and solution highlights without disclosing confidential client information.',false,50,{}],
  ['insights','News & Insights','LATEST NEWS & SECURITY INSIGHTS','Practical thinking for safer, better-controlled operations.','Security guidance, company news and relevant industry observations from PYX.',true,60,{}],
  ['careers','Careers','CAREERS AT PYX','Build a career around trust, discipline and service.','PYX welcomes people interested in field security, supervision, operations, technology, administration and support roles.',true,70,{paths:[{title:'Security Operations',body:'Guards, supervisors and field operations'},{title:'Technology',body:'Security systems, digital platforms and support'},{title:'Corporate Services',body:'Administration, HR, finance and coordination'}]}],
  ['assessment','Assessment','REQUEST AN ASSESSMENT','Let’s understand what your site needs.','Tell us about your operating environment and the outcome you need. We’ll use it to prepare a focused security or technology discussion.',true,80,{note:'Mobile number is required. City / Site is entered as free text.',buttonLabel:'Request Assessment'}],
  ['contact','Contact','CONTACT US','Talk to PYX Security Services (Pvt.) Ltd.','Connect with our team or visit our office.',true,90,{messageHeading:'Send us a message',buttonLabel:'Send Message'}]
];

const servicesSeed = [
  ['Customized Security Solutions','customized-security-solutions','Bespoke planning around the client environment.','/assets/sectors/corporate.png','',0,0,10],
  ['Guarding / Watchmen Services','guarding-watchmen-services','Armed and unarmed personnel to assignment requirements.','/assets/photos/pyx-guard-uniform-v3.png','',0,0,20],
  ['Escort & Personal Security','escort-personal-security','Secure movement with disciplined protection.','','/assets/video/hero-final.mp4',13,19.2,30],
  ['Special Events Security','special-events-security','Controlled access and event-specific protection.','/assets/sectors/government-uniform-v3.png','',0,0,40],
  ['Access, Vehicle & Traffic Control','access-vehicle-traffic-control','Control of people, vehicles and visitors.','/assets/sectors/logistics.png','',0,0,50],
  ['CCTV Monitoring & Surveillance','cctv-monitoring-surveillance','Surveillance supporting site awareness.','/assets/sectors/corporate.png','',0,0,60],
  ['Electronic Detection Systems','electronic-detection-systems','Sensors, detectors, gates and communications.','/assets/sectors/industrial.png','',0,0,70],
  ['Mobile Patrol / Search / Inspection','mobile-patrol-search-inspection','Patrol, search and parcel inspection.','/assets/sectors/logistics.png','',0,0,80],
  ['Security Training','security-training','Initial and refresher training.','/assets/sectors/education-uniform-v3.png','',0,0,90],
  ['IT Disaster Recovery','it-disaster-recovery','Technology resilience and recovery planning.','/assets/sectors/corporate.png','',0,0,100],
  ['Information Security & Governance','information-security-governance','Implementation and audit support.','/assets/sectors/corporate.png','',0,0,110],
  ['IT Project / Software / Change','it-project-software-change','Technology delivery and change management.','/assets/sectors/healthcare.png','',0,0,120],
  ['Manpower Outsourcing','manpower-outsourcing','Security and non-security manpower.','/assets/sectors/government-uniform-v3.png','',0,0,130]
];

const sectorsSeed = [
  ['Banking & Financial Services','banking-financial-services','/assets/sectors/banking-uniform-v4.png',10],
  ['Industrial & Manufacturing','industrial-manufacturing','/assets/sectors/industrial.png',20],
  ['Healthcare','healthcare','/assets/sectors/healthcare.png',30],
  ['Education','education','/assets/sectors/education-uniform-v3.png',40],
  ['Logistics & Warehousing','logistics-warehousing','/assets/sectors/logistics.png',50],
  ['Government & Public Sector','government-public-sector','/assets/sectors/government-uniform-v3.png',60],
  ['Corporate & Commercial','corporate-commercial','/assets/sectors/corporate.png',70],
  ['Residential & Communities','residential-communities','/assets/sectors/residential.png',80]
];

const postsSeed = [
  ['insight','Five checks that strengthen security personnel deployment','five-checks-that-strengthen-security-personnel-deployment','A dependable deployment starts before a guard reaches the site.','<p>A dependable deployment starts before a guard reaches the site. Confirm the personnel profile fits the requirement, verification is complete, site training is covered, post instructions are clear, and supervision and escalation are understood.</p>','/assets/sectors/logistics.png','2026-08-20T08:00:00Z'],
  ['blog','Designing access control around people and vehicles','designing-access-control-around-people-and-vehicles','Access control should reflect how people and vehicles actually move through a site.','<p>Access control should reflect how employees, visitors, deliveries, contractors, emergency access and vehicles actually move through the site.</p>','/assets/sectors/industrial.png','2026-08-12T08:00:00Z'],
  ['insight','Why incident reporting should support action','why-incident-reporting-should-support-action','Useful reporting turns observations into accountable follow-up.','<p>Useful reporting identifies what happened, where, who was involved, what immediate action was taken, and whether follow-up actions were closed.</p>','/assets/sectors/corporate.png','2026-08-05T08:00:00Z']
];

export async function initializeDatabase() {
  await query(schema);
  for (const [key, value] of Object.entries(settingsSeed)) {
    await query('INSERT INTO settings (key,value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)]);
  }
  for (const row of sectionsSeed) {
    await query('INSERT INTO sections (section_key,label,kicker,title,body,enabled,sort_order,extra) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (section_key) DO NOTHING', [...row.slice(0,7), JSON.stringify(row[7])]);
  }
  for (const row of servicesSeed) {
    await query('INSERT INTO services (title,slug,summary,image_url,video_url,video_start,video_end,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (slug) DO NOTHING', row);
  }
  for (const row of sectorsSeed) {
    await query('INSERT INTO sectors (title,slug,image_url,sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT (slug) DO NOTHING', row);
  }
  for (const row of postsSeed) {
    await query("INSERT INTO posts (type,title,slug,excerpt,body,image_url,status,published_at) VALUES ($1,$2,$3,$4,$5,$6,'published',$7) ON CONFLICT (slug) DO NOTHING", row);
  }
  const email = (process.env.CMS_ADMIN_EMAIL || 'admin@pyxsecurity.com').trim().toLowerCase();
  const password = process.env.CMS_ADMIN_PASSWORD;
  const existing = await query('SELECT id FROM administrators LIMIT 1');
  if (!existing.rowCount) {
    if (!password || password.length < 12) throw new Error('CMS_ADMIN_PASSWORD must be set to at least 12 characters for first-run setup.');
    const hash = await bcrypt.hash(password, 12);
    await query('INSERT INTO administrators (email,name,password_hash,must_change_password) VALUES ($1,$2,$3,true)', [email, 'PYX Administrator', hash]);
  }
  await query('DELETE FROM sessions WHERE expires_at < NOW()');
}

export async function audit(administratorId, action, entityType, entityId = '', details = {}) {
  await query('INSERT INTO audit_log (administrator_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5::jsonb)', [administratorId || null, action, entityType, String(entityId || ''), JSON.stringify(details)]);
}

export function slugify(value = '') {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || crypto.randomBytes(4).toString('hex');
}
