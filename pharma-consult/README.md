# 💊 PharmaCare Consultation System
**نظام استشارات فارماكير للصيادلة والمجتمع**

A full-stack, bilingual (EN/AR + RTL), mobile-first pharmacist consultation platform
deployed on **Cloudflare Workers** with a **D1** SQLite database.

---

## Architecture

```
pharma-consult/
├── src/
│   └── worker.js         ← Cloudflare Worker (API + asset serving)
├── public/
│   └── index.html        ← Full SPA (HTML + CSS + JS, zero dependencies)
├── schema.sql            ← D1 schema + seed data (demo accounts + drug DB)
├── wrangler.toml         ← Cloudflare deployment config
└── package.json
```

Single-file architecture — no build step, no bundler, no Node runtime needed.

---

## Features

### User Roles & Authentication
| Role | Access |
|------|--------|
| **Patient** | Submit consultations, chat, view health record, rate pharmacists |
| **Community Pharmacist** | Manage/respond to consultations, view patient summaries, analytics |
| **Volunteer Pharmacist** | Same as community pharmacist |
| **Admin** | All of the above + user management |

### Consultation Management
- Open, In-Progress, Resolved, Closed statuses
- Priority levels: Urgent / High / Normal / Low
- Categories: Drug Interaction, Side Effects, Dosage, Allergy, Chronic Disease, General
- Real-time-style messaging within each consultation
- Pharmacist self-assignment ("Assign to Me")
- Resolution workflow with patient 5-star rating

### Patient Data
- Secure health records: blood type, allergies, chronic conditions, current medications, emergency contact
- Pharmacist sees patient summary panel during consultation (allergies highlighted in red)
- Role-based data access controls

### Drug Database
- 10 seed drugs (expandable); bilingual EN/AR fields
- Searchable by name or generic name
- Shows: indications, contraindications, side effects, Rx/OTC status

### Communication
- Async messaging per consultation (Enter to send)
- Push-style notification system (polling every 15s)
- Notification bell with unread dot + panel
- Auto-notifies pharmacists on new consultation
- Auto-notifies patient when pharmacist assigns or resolves

### Analytics (Pharmacist/Admin)
- Consultation totals, open/in-progress/resolved counts
- 30-day trend bar chart
- By-category breakdown
- Top pharmacists by resolved consultations
- Average patient rating

### UI/UX
- Bilingual EN/AR with single toggle button, RTL layout auto-applied
- Mobile responsive with hamburger sidebar
- Medical teal + warm ivory design system
- Zero external JS dependencies (fonts only from Google Fonts)

---

## Deployment Steps

### 1. Prerequisites
```bash
npm install -g wrangler
wrangler login
```

### 2. Create D1 Database
```bash
wrangler d1 create pharma-consult-db
```
Copy the `database_id` from output and paste it into `wrangler.toml`.

### 3. Initialize Schema + Seed Data
```bash
# Local dev
wrangler d1 execute pharma-consult-db --file=schema.sql

# Production (remote)
wrangler d1 execute pharma-consult-db --remote --file=schema.sql
```

### 4. Local Development
```bash
npm run dev
# Opens at http://localhost:8787
```

### 5. Deploy to Production
```bash
npm run deploy
# Your app is live at https://pharma-consult.<your-subdomain>.workers.dev
```

---

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@pharma.com | Admin@1234 |
| Community Pharmacist | pharmacist1@pharma.com | Pharma@1234 |
| Volunteer Pharmacist | volunteer1@pharma.com | Pharma@1234 |
| Patient | patient1@pharma.com | Patient@1234 |

> ⚠️ **Note:** The demo accounts use simple SHA-256 hashing for passwords (sufficient for a demo). For production, replace with bcrypt/Argon2 via a Durable Object or external auth service (Cloudflare Access, Auth0, etc.).

---

## Security Considerations for Production

1. **Authentication:** Replace the simple base64 token with proper JWT (using `jsonwebtoken` compatible with Workers) or use **Cloudflare Access**.
2. **Password Hashing:** Integrate `argon2-wasm` or delegate to an auth provider.
3. **HTTPS:** Cloudflare Workers are always HTTPS by default ✅
4. **Input Validation:** Add Zod or similar schema validation to all API handlers.
5. **Rate Limiting:** Add Cloudflare Rate Limiting rules on `/api/auth/*` endpoints.
6. **HIPAA/Data Compliance:** For real healthcare data in your jurisdiction, review data residency requirements. D1 data can be pinned to specific Cloudflare regions.

---

## Extending the Drug Database

```sql
INSERT INTO drugs (name, name_ar, generic_name, category, category_ar, indications, indications_ar,
  contraindications, side_effects, prescription_required)
VALUES ('DrugName', 'اسم الدواء', 'GenericName', 'Category', 'الفئة',
  'Indications text', 'نص الاستطبابات',
  'Contraindications', 'Side effects list', 1);
```

Or integrate with an external API (e.g., OpenFDA, RxNorm) by adding a fetch call in the `/api/drugs` handler.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET  | `/api/auth/me` | Get current user |
| GET  | `/api/consultations` | List consultations (role-filtered) |
| POST | `/api/consultations` | Create consultation |
| GET  | `/api/consultations/:id` | Get consultation detail |
| PUT  | `/api/consultations/:id` | Update (assign, status, rating) |
| GET  | `/api/consultations/:id/messages` | Get messages |
| POST | `/api/consultations/:id/messages` | Send message |
| GET  | `/api/drugs?q=` | Search drug database |
| GET  | `/api/patients` | List patient records |
| POST | `/api/patients` | Create patient record |
| GET  | `/api/patients/:id` | Get patient record |
| PUT  | `/api/patients/:id` | Update patient record |
| GET  | `/api/analytics` | Analytics (pharmacist/admin only) |
| GET  | `/api/notifications` | Get user notifications |
| PUT  | `/api/notifications/:id` | Mark notification read |
| GET  | `/api/users` | List users (admin/pharmacist) |
| PUT  | `/api/users/:id` | Update user profile |
