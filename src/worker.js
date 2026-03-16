// ============================================================
// Pharmacist Consultation System — Cloudflare Worker
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

// ── Simple JWT-like token (base64 payload, no signature for demo) ──
function makeToken(payload) {
  return btoa(JSON.stringify({ ...payload, exp: Date.now() + 86400000 }));
}
function parseToken(token) {
  try {
    const p = JSON.parse(atob(token));
    if (p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}
function authUser(req) {
  const h = req.headers.get("Authorization") || "";
  const t = h.replace("Bearer ", "");
  return parseToken(t);
}

// ── Password hash (SHA-256 via Web Crypto) ──
async function hashPassword(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// ROUTER
// ============================================================
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const path = url.pathname;

  
    // Serve frontend
    if (path === "/" || path === "/index.html") {
      if (env.ASSETS) return env.ASSETS.fetch(req);
      return new Response("Frontend not found. Run with wrangler dev.", { status: 404 });
    }
    // API routes
    try {
      // Auth
      if (path === "/api/auth/register" && req.method === "POST") return register(req, env);
      if (path === "/api/auth/login" && req.method === "POST") return login(req, env);
      if (path === "/api/auth/me" && req.method === "GET") return me(req, env);

      // Users
      if (path === "/api/users" && req.method === "GET") return listUsers(req, env);
      if (path.startsWith("/api/users/") && req.method === "GET") return getUser(req, env);
      if (path.startsWith("/api/users/") && req.method === "PUT") return updateUser(req, env);

      // Consultations
      if (path === "/api/consultations" && req.method === "GET") return listConsultations(req, env);
      if (path === "/api/consultations" && req.method === "POST") return createConsultation(req, env);
      if (path.startsWith("/api/consultations/") && req.method === "GET") return getConsultation(req, env);
      if (path.startsWith("/api/consultations/") && req.method === "PUT") return updateConsultation(req, env);

      // Messages
      if (path.match(/^\/api\/consultations\/\d+\/messages$/) && req.method === "GET") return getMessages(req, env);
      if (path.match(/^\/api\/consultations\/\d+\/messages$/) && req.method === "POST") return sendMessage(req, env);

      // Drug search
      if (path === "/api/drugs" && req.method === "GET") return searchDrugs(req, env);

      // Patient records
      if (path === "/api/patients" && req.method === "GET") return listPatients(req, env);
      if (path === "/api/patients" && req.method === "POST") return createPatient(req, env);
      if (path.startsWith("/api/patients/") && req.method === "GET") return getPatient(req, env);
      if (path.startsWith("/api/patients/") && req.method === "PUT") return updatePatient(req, env);

      // Analytics
      if (path === "/api/analytics" && req.method === "GET") return getAnalytics(req, env);

      // Notifications
      if (path === "/api/notifications" && req.method === "GET") return getNotifications(req, env);
      if (path.startsWith("/api/notifications/") && req.method === "PUT") return markNotificationRead(req, env);

      
      // was: return env.ASSETS.fetch(req);
      if (env.ASSETS) return env.ASSETS.fetch(req);
      return new Response("Not found", { status: 404 });

    } catch (e) {
      return err("Internal error: " + e.message, 500);
    }
  },
};

// ============================================================
// AUTH
// ============================================================
async function register(req, env) {
  const { name, name_ar, email, password, role, license_number, phone, specialty } = await req.json();
  if (!name || !email || !password || !role) return err("Missing required fields");
  const validRoles = ["patient", "community_pharmacist", "volunteer_pharmacist", "admin"];
  if (!validRoles.includes(role)) return err("Invalid role");

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if (existing) return err("Email already registered");

  const pw = await hashPassword(password);
  const result = await env.DB.prepare(
    `INSERT INTO users (name, name_ar, email, password_hash, role, license_number, phone, specialty, created_at)
     VALUES (?,?,?,?,?,?,?,?,datetime('now'))`
  ).bind(name, name_ar || null, email, pw, role, license_number || null, phone || null, specialty || null).run();

  const user = await env.DB.prepare("SELECT id,name,name_ar,email,role,license_number,phone,specialty,created_at FROM users WHERE id=?")
    .bind(result.meta.last_row_id).first();
  const token = makeToken({ id: user.id, email: user.email, role: user.role });
  return json({ token, user });
}

async function login(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) return err("Missing credentials");
  const pw = await hashPassword(password);
  const user = await env.DB.prepare(
    "SELECT id,name,name_ar,email,role,license_number,phone,specialty,is_active FROM users WHERE email=? AND password_hash=?"
  ).bind(email, pw).first();
  if (!user) return err("Invalid credentials", 401);
  if (!user.is_active) return err("Account suspended", 403);

  await env.DB.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").bind(user.id).run();
  const token = makeToken({ id: user.id, email: user.email, role: user.role });
  delete user.is_active;
  return json({ token, user });
}

async function me(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const user = await env.DB.prepare(
    "SELECT id,name,name_ar,email,role,license_number,phone,specialty,created_at,last_login FROM users WHERE id=?"
  ).bind(u.id).first();
  if (!user) return err("User not found", 404);
  return json(user);
}

// ============================================================
// USERS
// ============================================================
async function listUsers(req, env) {
  const u = authUser(req);
  if (!u || !["admin", "community_pharmacist", "volunteer_pharmacist"].includes(u.role)) return err("Forbidden", 403);
  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  let q = "SELECT id,name,name_ar,email,role,license_number,phone,specialty,created_at,last_login,is_active FROM users";
  const params = [];
  if (role) { q += " WHERE role=?"; params.push(role); }
  q += " ORDER BY name";
  const { results } = await env.DB.prepare(q).bind(...params).all();
  return json(results);
}

async function getUser(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const id = parseInt(req.url.split("/api/users/")[1]);
  const user = await env.DB.prepare(
    "SELECT id,name,name_ar,email,role,license_number,phone,specialty,created_at FROM users WHERE id=?"
  ).bind(id).first();
  if (!user) return err("Not found", 404);
  return json(user);
}

async function updateUser(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const id = parseInt(req.url.split("/api/users/")[1]);
  if (u.id !== id && u.role !== "admin") return err("Forbidden", 403);
  const body = await req.json();
  const { name, name_ar, phone, specialty } = body;
  await env.DB.prepare("UPDATE users SET name=COALESCE(?,name), name_ar=COALESCE(?,name_ar), phone=COALESCE(?,phone), specialty=COALESCE(?,specialty) WHERE id=?")
    .bind(name || null, name_ar || null, phone || null, specialty || null, id).run();
  if (u.role === "admin" && body.is_active !== undefined) {
    await env.DB.prepare("UPDATE users SET is_active=? WHERE id=?").bind(body.is_active ? 1 : 0, id).run();
  }
  const updated = await env.DB.prepare("SELECT id,name,name_ar,email,role,phone,specialty FROM users WHERE id=?").bind(id).first();
  return json(updated);
}

// ============================================================
// CONSULTATIONS
// ============================================================
async function listConsultations(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  let q, params = [];

  if (u.role === "patient") {
    q = `SELECT c.*, p.name as pharmacist_name, p.name_ar as pharmacist_name_ar
         FROM consultations c LEFT JOIN users p ON c.pharmacist_id=p.id
         WHERE c.patient_id=?`;
    params.push(u.id);
    if (status) { q += " AND c.status=?"; params.push(status); }
  } else if (["community_pharmacist","volunteer_pharmacist"].includes(u.role)) {
    q = `SELECT c.*, pt.name as patient_name, pt.name_ar as patient_name_ar
         FROM consultations c LEFT JOIN users pt ON c.patient_id=pt.id
         WHERE (c.pharmacist_id=? OR c.pharmacist_id IS NULL)`;
    params.push(u.id);
    if (status) { q += " AND c.status=?"; params.push(status); }
  } else {
    q = `SELECT c.*, pt.name as patient_name, p.name as pharmacist_name
         FROM consultations c
         LEFT JOIN users pt ON c.patient_id=pt.id
         LEFT JOIN users p ON c.pharmacist_id=p.id`;
    if (status) { q += " WHERE c.status=?"; params.push(status); }
  }
  q += " ORDER BY c.created_at DESC LIMIT 100";
  const { results } = await env.DB.prepare(q).bind(...params).all();
  return json(results);
}

async function createConsultation(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const { subject, subject_ar, description, description_ar, priority, category, drug_names } = await req.json();
  if (!subject || !description) return err("Subject and description required");

  const result = await env.DB.prepare(
    `INSERT INTO consultations (patient_id, subject, subject_ar, description, description_ar, priority, category, drug_names, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`
  ).bind(u.id, subject, subject_ar || null, description, description_ar || null,
    priority || "normal", category || "general", drug_names || null, "open").run();

  const id = result.meta.last_row_id;
  // notify pharmacists
  const pharms = await env.DB.prepare("SELECT id FROM users WHERE role IN ('community_pharmacist','volunteer_pharmacist') AND is_active=1").all();
  for (const ph of pharms.results) {
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, type, title, title_ar, body, body_ar, ref_id, created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))"
    ).bind(ph.id, "new_consultation", "New Consultation Request", "طلب استشارة جديد",
      `Patient submitted: ${subject}`, `مريض قدّم: ${subject_ar || subject}`, id).run();
  }

  const row = await env.DB.prepare("SELECT * FROM consultations WHERE id=?").bind(id).first();
  return json(row, 201);
}

async function getConsultation(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const id = parseInt(req.url.split("/api/consultations/")[1]);
  const row = await env.DB.prepare(
    `SELECT c.*, pt.name as patient_name, pt.name_ar as patient_name_ar,
            p.name as pharmacist_name, p.name_ar as pharmacist_name_ar, p.license_number
     FROM consultations c
     LEFT JOIN users pt ON c.patient_id=pt.id
     LEFT JOIN users p ON c.pharmacist_id=p.id
     WHERE c.id=?`
  ).bind(id).first();
  if (!row) return err("Not found", 404);
  if (u.role === "patient" && row.patient_id !== u.id) return err("Forbidden", 403);
  return json(row);
}

async function updateConsultation(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const id = parseInt(req.url.split("/api/consultations/")[1].split("/")[0]);
  const body = await req.json();

  const row = await env.DB.prepare("SELECT * FROM consultations WHERE id=?").bind(id).first();
  if (!row) return err("Not found", 404);

  // Assign pharmacist
  if (body.assign && ["community_pharmacist","volunteer_pharmacist"].includes(u.role)) {
    await env.DB.prepare("UPDATE consultations SET pharmacist_id=?, status='in_progress', updated_at=datetime('now') WHERE id=?")
      .bind(u.id, id).run();
    await env.DB.prepare("INSERT INTO notifications (user_id,type,title,title_ar,body,body_ar,ref_id,created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))")
      .bind(row.patient_id, "consultation_assigned", "Pharmacist Assigned", "تم تعيين صيدلاني",
        "A pharmacist has taken your consultation", "قام صيدلاني بالرد على استشارتك", id).run();
  }

  // Update status
  if (body.status) {
    await env.DB.prepare("UPDATE consultations SET status=?, updated_at=datetime('now') WHERE id=?").bind(body.status, id).run();
    if (body.status === "resolved") {
      await env.DB.prepare("UPDATE consultations SET resolved_at=datetime('now') WHERE id=?").bind(id).run();
      await env.DB.prepare("INSERT INTO notifications (user_id,type,title,title_ar,body,body_ar,ref_id,created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))")
        .bind(row.patient_id, "consultation_resolved", "Consultation Resolved", "تم حل الاستشارة",
          "Your consultation has been resolved", "تم حل استشارتك", id).run();
    }
  }

  // Rating
  if (body.rating && u.role === "patient" && row.patient_id === u.id) {
    await env.DB.prepare("UPDATE consultations SET rating=?, rating_comment=? WHERE id=?")
      .bind(body.rating, body.rating_comment || null, id).run();
  }

  const updated = await env.DB.prepare("SELECT * FROM consultations WHERE id=?").bind(id).first();
  return json(updated);
}

// ============================================================
// MESSAGES
// ============================================================
async function getMessages(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const id = parseInt(req.url.split("/api/consultations/")[1]);
  const { results } = await env.DB.prepare(
    `SELECT m.*, u.name as sender_name, u.name_ar as sender_name_ar, u.role as sender_role
     FROM messages m LEFT JOIN users u ON m.sender_id=u.id
     WHERE m.consultation_id=? ORDER BY m.created_at ASC`
  ).bind(id).all();
  return json(results);
}

async function sendMessage(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const id = parseInt(req.url.split("/api/consultations/")[1]);
  const { body, body_ar, attachment_url } = await req.json();
  if (!body) return err("Message body required");

  const consult = await env.DB.prepare("SELECT * FROM consultations WHERE id=?").bind(id).first();
  if (!consult) return err("Consultation not found", 404);

  const result = await env.DB.prepare(
    "INSERT INTO messages (consultation_id, sender_id, body, body_ar, attachment_url, created_at) VALUES (?,?,?,?,?,datetime('now'))"
  ).bind(id, u.id, body, body_ar || null, attachment_url || null).run();

  await env.DB.prepare("UPDATE consultations SET updated_at=datetime('now') WHERE id=?").bind(id).run();

  // notify the other party
  const notifyId = u.role === "patient" ? consult.pharmacist_id : consult.patient_id;
  if (notifyId) {
    await env.DB.prepare("INSERT INTO notifications (user_id,type,title,title_ar,body,body_ar,ref_id,created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))")
      .bind(notifyId, "new_message", "New Message", "رسالة جديدة",
        "You have a new message in your consultation", "لديك رسالة جديدة في استشارتك", id).run();
  }

  const msg = await env.DB.prepare(
    `SELECT m.*, u.name as sender_name, u.role as sender_role FROM messages m
     LEFT JOIN users u ON m.sender_id=u.id WHERE m.id=?`
  ).bind(result.meta.last_row_id).first();
  return json(msg, 201);
}

// ============================================================
// DRUG DATABASE
// ============================================================
async function searchDrugs(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const category = url.searchParams.get("category");

  let query = "SELECT * FROM drugs WHERE (name LIKE ? OR name_ar LIKE ? OR generic_name LIKE ?)";
  const params = [`%${q}%`, `%${q}%`, `%${q}%`];
  if (category) { query += " AND category=?"; params.push(category); }
  query += " ORDER BY name LIMIT 50";

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json(results);
}

// ============================================================
// PATIENTS
// ============================================================
async function listPatients(req, env) {
  const u = authUser(req);
  if (!["community_pharmacist","volunteer_pharmacist","admin"].includes(u?.role)) return err("Forbidden", 403);
  const url = new URL(req.url);
  const search = url.searchParams.get("q") || "";
  const { results } = await env.DB.prepare(
    `SELECT pr.*, u.name, u.name_ar, u.email, u.phone FROM patient_records pr
     JOIN users u ON pr.user_id=u.id
     WHERE u.name LIKE ? OR u.email LIKE ? ORDER BY u.name LIMIT 50`
  ).bind(`%${search}%`, `%${search}%`).all();
  return json(results);
}

async function createPatient(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const body = await req.json();
  const { user_id, date_of_birth, blood_type, allergies, chronic_conditions, current_medications, emergency_contact } = body;
  const targetId = user_id || u.id;

  const existing = await env.DB.prepare("SELECT id FROM patient_records WHERE user_id=?").bind(targetId).first();
  if (existing) return err("Patient record already exists");

  const result = await env.DB.prepare(
    `INSERT INTO patient_records (user_id, date_of_birth, blood_type, allergies, chronic_conditions, current_medications, emergency_contact, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`
  ).bind(targetId, date_of_birth || null, blood_type || null, allergies || null,
    chronic_conditions || null, current_medications || null, emergency_contact || null).run();

  const rec = await env.DB.prepare("SELECT * FROM patient_records WHERE id=?").bind(result.meta.last_row_id).first();
  return json(rec, 201);
}

async function getPatient(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const id = parseInt(req.url.split("/api/patients/")[1]);
  const rec = await env.DB.prepare(
    `SELECT pr.*, u.name, u.name_ar, u.email, u.phone, u.role FROM patient_records pr
     JOIN users u ON pr.user_id=u.id WHERE pr.user_id=?`
  ).bind(id).first();
  if (!rec) return err("Not found", 404);
  if (u.role === "patient" && u.id !== id) return err("Forbidden", 403);
  return json(rec);
}

async function updatePatient(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const id = parseInt(req.url.split("/api/patients/")[1]);
  if (u.role === "patient" && u.id !== id) return err("Forbidden", 403);
  const { date_of_birth, blood_type, allergies, chronic_conditions, current_medications, emergency_contact } = await req.json();
  await env.DB.prepare(
    `UPDATE patient_records SET date_of_birth=COALESCE(?,date_of_birth), blood_type=COALESCE(?,blood_type),
     allergies=COALESCE(?,allergies), chronic_conditions=COALESCE(?,chronic_conditions),
     current_medications=COALESCE(?,current_medications), emergency_contact=COALESCE(?,emergency_contact),
     updated_at=datetime('now') WHERE user_id=?`
  ).bind(date_of_birth || null, blood_type || null, allergies || null,
    chronic_conditions || null, current_medications || null, emergency_contact || null, id).run();
  const rec = await env.DB.prepare("SELECT * FROM patient_records WHERE user_id=?").bind(id).first();
  return json(rec);
}

// ============================================================
// ANALYTICS
// ============================================================
async function getAnalytics(req, env) {
  const u = authUser(req);
  if (!u || !["admin","community_pharmacist","volunteer_pharmacist"].includes(u.role)) return err("Forbidden", 403);

  const [total, open, inprog, resolved, avgRating, users, messages] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as n FROM consultations").first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM consultations WHERE status='open'").first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM consultations WHERE status='in_progress'").first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM consultations WHERE status='resolved'").first(),
    env.DB.prepare("SELECT ROUND(AVG(rating),1) as n FROM consultations WHERE rating IS NOT NULL").first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM users WHERE role='patient'").first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM messages").first(),
  ]);

  const byCategory = await env.DB.prepare(
    "SELECT category, COUNT(*) as count FROM consultations GROUP BY category ORDER BY count DESC"
  ).all();

  const daily = await env.DB.prepare(
    `SELECT date(created_at) as day, COUNT(*) as count FROM consultations
     WHERE created_at >= date('now','-30 days') GROUP BY day ORDER BY day`
  ).all();

  const topPharmacists = await env.DB.prepare(
    `SELECT u.name, u.name_ar, COUNT(c.id) as resolved
     FROM consultations c JOIN users u ON c.pharmacist_id=u.id
     WHERE c.status='resolved' GROUP BY c.pharmacist_id ORDER BY resolved DESC LIMIT 5`
  ).all();

  return json({
    totals: {
      consultations: total.n, open: open.n, in_progress: inprog.n,
      resolved: resolved.n, avg_rating: avgRating.n, patients: users.n, messages: messages.n
    },
    by_category: byCategory.results,
    daily_trend: daily.results,
    top_pharmacists: topPharmacists.results,
  });
}

// ============================================================
// NOTIFICATIONS
// ============================================================
async function getNotifications(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const { results } = await env.DB.prepare(
    "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30"
  ).bind(u.id).all();
  return json(results);
}

async function markNotificationRead(req, env) {
  const u = authUser(req);
  if (!u) return err("Unauthorized", 401);
  const id = parseInt(req.url.split("/api/notifications/")[1]);
  await env.DB.prepare("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?").bind(id, u.id).run();
  return json({ ok: true });
}
