# PYX Security Website & CMS

The public corporate website and content-management system for PYX Security Services (Pvt.) Ltd.

## Managed content

- Homepage hero, proof counts, section headings and contact details
- Section visibility and ordering
- Services and sectors, including media and visibility controls
- News, blogs and security insights with draft/publish/archive states
- Project showcases with draft/publish/archive states
- Careers content and job vacancies
- Assessment, contact and career submissions
- Image uploads and media library
- Administrator password and activity log

## Runtime

The site is a Node.js application backed by PostgreSQL. CMS-uploaded images are stored in `UPLOAD_DIR`, which should point to a persistent volume in production.

Required first-run environment variables:

- `DATABASE_URL`
- `CMS_ADMIN_EMAIL`
- `CMS_ADMIN_PASSWORD` (at least 12 characters)
- `UPLOAD_DIR` (recommended: `/data/uploads`)
