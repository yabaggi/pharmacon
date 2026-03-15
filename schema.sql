-- ============================================================
-- Pharmacist Consultation System — D1 Schema + Seed Data
-- ============================================================

-- Users (all roles)
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  name_ar         TEXT,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('patient','community_pharmacist','volunteer_pharmacist','admin')),
  license_number  TEXT,
  phone           TEXT,
  specialty       TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  last_login      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Patient medical records
CREATE TABLE IF NOT EXISTS patient_records (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id),
  date_of_birth        TEXT,
  blood_type           TEXT,
  allergies            TEXT,          -- JSON array string
  chronic_conditions   TEXT,          -- JSON array string
  current_medications  TEXT,          -- JSON array string
  emergency_contact    TEXT,          -- JSON object string
  notes                TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Consultations
CREATE TABLE IF NOT EXISTS consultations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id      INTEGER NOT NULL REFERENCES users(id),
  pharmacist_id   INTEGER REFERENCES users(id),
  subject         TEXT NOT NULL,
  subject_ar      TEXT,
  description     TEXT NOT NULL,
  description_ar  TEXT,
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  category        TEXT NOT NULL DEFAULT 'general',
  drug_names      TEXT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
  rating          INTEGER CHECK(rating BETWEEN 1 AND 5),
  rating_comment  TEXT,
  resolved_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Messages within consultations
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  consultation_id INTEGER NOT NULL REFERENCES consultations(id),
  sender_id       INTEGER NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  body_ar         TEXT,
  attachment_url  TEXT,
  is_read         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Drug database
CREATE TABLE IF NOT EXISTS drugs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  name_ar         TEXT,
  generic_name    TEXT,
  generic_name_ar TEXT,
  category        TEXT,
  category_ar     TEXT,
  dosage_forms    TEXT,
  indications     TEXT,
  indications_ar  TEXT,
  contraindications TEXT,
  contraindications_ar TEXT,
  side_effects    TEXT,
  side_effects_ar TEXT,
  interactions    TEXT,
  storage         TEXT,
  prescription_required INTEGER DEFAULT 0
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  title_ar    TEXT,
  body        TEXT,
  body_ar     TEXT,
  ref_id      INTEGER,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_pharmacist ON consultations(pharmacist_id);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
CREATE INDEX IF NOT EXISTS idx_messages_consultation ON messages(consultation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_drugs_name ON drugs(name);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Admin: admin@pharma.com / Admin@1234
INSERT OR IGNORE INTO users (id,name,name_ar,email,password_hash,role,license_number,specialty) VALUES
(1,'System Admin','مدير النظام','admin@pharma.com',
 '7c4d86e18e960ca41f4e9b0b5fc4e4b00a1daab4e88a1e5b1234567890abcdef',
 'admin',NULL,'Administration');

-- Community Pharmacist: pharmacist1@pharma.com / Pharma@1234
INSERT OR IGNORE INTO users (id,name,name_ar,email,password_hash,role,license_number,specialty,phone) VALUES
(2,'Dr. Sarah Al-Rashidi','د. سارة الراشدي','pharmacist1@pharma.com',
 'a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4',
 'community_pharmacist','CP-2019-0451','Clinical Pharmacy','+966501234567');

-- Volunteer Pharmacist: volunteer1@pharma.com / Pharma@1234
INSERT OR IGNORE INTO users (id,name,name_ar,email,password_hash,role,license_number,specialty,phone) VALUES
(3,'Dr. Khalid Mansour','د. خالد منصور','volunteer1@pharma.com',
 'a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4',
 'volunteer_pharmacist','VP-2020-0123','Community Health','+966509876543');

-- Patient: patient1@pharma.com / Patient@1234
INSERT OR IGNORE INTO users (id,name,name_ar,email,password_hash,role,phone) VALUES
(4,'Ahmad Al-Otaibi','أحمد العتيبي','patient1@pharma.com',
 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
 'patient','+966555123456');

-- Patient record
INSERT OR IGNORE INTO patient_records (user_id,date_of_birth,blood_type,allergies,chronic_conditions,current_medications) VALUES
(4,'1990-05-15','A+',
 '["Penicillin","Sulfa drugs"]',
 '["Type 2 Diabetes","Hypertension"]',
 '["Metformin 500mg twice daily","Amlodipine 5mg once daily","Aspirin 81mg once daily"]');

-- Sample consultations
INSERT OR IGNORE INTO consultations (id,patient_id,pharmacist_id,subject,subject_ar,description,description_ar,priority,category,drug_names,status,rating,created_at) VALUES
(1,4,2,
 'Drug interaction question — Metformin & new antibiotic',
 'سؤال حول تفاعل دواء — ميتفورمين ومضاد حيوي جديد',
 'My doctor prescribed Amoxicillin 500mg for a tooth infection. I am currently on Metformin 500mg for diabetes. Is it safe to take both?',
 'وصف لي الطبيب أموكسيسيلين 500 ملغ لعدوى في الأسنان. أتناول حاليًا ميتفورمين 500 ملغ للسكري. هل من الآمن تناول كليهما؟',
 'normal','drug_interaction','Metformin,Amoxicillin','resolved',5,datetime('now','-3 days'));

INSERT OR IGNORE INTO consultations (id,patient_id,subject,subject_ar,description,description_ar,priority,category,status,created_at) VALUES
(2,4,
 'Side effects — feeling dizzy after new blood pressure medication',
 'آثار جانبية — دوخة بعد دواء ضغط الدم الجديد',
 'I started taking Amlodipine 5mg 2 weeks ago. I feel dizzy when I stand up quickly. Is this normal?',
 'بدأت تناول أملوديبين 5 ملغ منذ أسبوعين. أشعر بالدوار عند الوقوف بسرعة. هل هذا طبيعي؟',
 'high','side_effects','open',datetime('now','-1 day'));

-- Messages for consultation 1
INSERT OR IGNORE INTO messages (consultation_id,sender_id,body,body_ar,created_at) VALUES
(1,4,
 'My doctor prescribed Amoxicillin for a tooth infection. I am taking Metformin for diabetes. Is it safe?',
 'وصف لي الطبيب أموكسيسيلين لعدوى في الأسنان. هل من الآمن مع ميتفورمين؟',
 datetime('now','-3 days')),
(1,2,
 'Great question! Amoxicillin and Metformin are generally safe to take together. There is no significant pharmacokinetic interaction. However, monitor for GI side effects (nausea, diarrhea) as both can cause these. Take Metformin with food as usual, and complete the full antibiotic course.',
 'سؤال ممتاز! الأموكسيسيلين والميتفورمين آمنان بشكل عام معًا. لا يوجد تفاعل دوائي مهم. ومع ذلك، راقب الأعراض الهضمية (غثيان، إسهال) حيث يمكن أن يسببها كلاهما. تناول الميتفورمين مع الطعام كالمعتاد.',
 datetime('now','-2 days','12 hours'));

-- Drug database seed
INSERT OR IGNORE INTO drugs (name,name_ar,generic_name,generic_name_ar,category,category_ar,indications,indications_ar,contraindications,contraindications_ar,side_effects,side_effects_ar,prescription_required) VALUES
('Metformin','ميتفورمين','Metformin HCl','هيدروكلوريد الميتفورمين','Antidiabetic','مضاد لمرض السكري',
 'Type 2 Diabetes Mellitus','داء السكري من النوع الثاني',
 'Renal impairment (eGFR<30), metabolic acidosis','القصور الكلوي، الحماض الاستقلابي',
 'GI upset, nausea, diarrhea, lactic acidosis (rare)','اضطراب هضمي، غثيان، إسهال، حماض لاكتيكي (نادر)',1),

('Amlodipine','أملوديبين','Amlodipine Besylate','بيسيلات أملوديبين','Antihypertensive','خافض ضغط الدم',
 'Hypertension, Angina Pectoris','ارتفاع ضغط الدم، الذبحة الصدرية',
 'Severe aortic stenosis','تضيق الأبهر الشديد',
 'Peripheral edema, dizziness, flushing, palpitations','وذمة محيطية، دوار، احمرار، خفقان',1),

('Amoxicillin','أموكسيسيلين','Amoxicillin trihydrate','أموكسيسيلين ثلاثي الهيدرات','Antibiotic','مضاد حيوي',
 'Bacterial infections: respiratory, urinary, dental','التهابات بكتيرية: تنفسية، بولية، أسنان',
 'Penicillin allergy','الحساسية من البنسلين',
 'Rash, diarrhea, nausea, anaphylaxis (rare)','طفح جلدي، إسهال، غثيان، صدمة تأقية (نادر)',1),

('Aspirin','أسبرين','Acetylsalicylic Acid','حمض الأسيتيل ساليسيليك','Antiplatelet/Analgesic','مضاد للصفيحات/مسكن ألم',
 'Pain, fever, cardiovascular prevention','الألم، الحمى، الوقاية القلبية الوعائية',
 'Peptic ulcer, aspirin-exacerbated asthma, children under 12','قرحة هضمية، الربو، الأطفال أقل من 12',
 'GI bleeding, tinnitus, Reye syndrome in children','نزيف هضمي، طنين، متلازمة راي عند الأطفال',0),

('Omeprazole','أوميبرازول','Omeprazole','أوميبرازول','Proton Pump Inhibitor','مثبط مضخة البروتون',
 'GERD, peptic ulcer, H. pylori eradication','ارتداد معدي، قرحة هضمية، استئصال جرثومة المعدة',
 'Hypersensitivity to PPI','فرط الحساسية لمثبطات مضخة البروتون',
 'Headache, diarrhea, nausea, hypomagnesemia (long-term)','صداع، إسهال، غثيان، نقص المغنيسيوم (طويل الأمد)',0),

('Atorvastatin','أتورفاستاتين','Atorvastatin Calcium','ستاتين','Statin / Lipid-lowering','خافض للدهون',
 'Hypercholesterolemia, cardiovascular prevention','ارتفاع الكوليسترول، الوقاية القلبية',
 'Active liver disease, pregnancy','مرض الكبد النشط، الحمل',
 'Myopathy, elevated liver enzymes, rhabdomyolysis (rare)','اعتلال عضلي، ارتفاع إنزيمات الكبد',1),

('Paracetamol','باراسيتامول','Acetaminophen','أسيتامينوفين','Analgesic/Antipyretic','مسكن ومضاد للحمى',
 'Mild to moderate pain, fever','الألم الخفيف إلى المتوسط، الحمى',
 'Severe hepatic impairment','القصور الكبدي الشديد',
 'Rare at therapeutic doses; overdose causes hepatotoxicity','نادر بالجرعات العلاجية؛ الجرعة الزائدة تسبب سمية كبدية',0),

('Lisinopril','ليسينوبريل','Lisinopril','ليسينوبريل','ACE Inhibitor','مثبط الإنزيم المحول',
 'Hypertension, heart failure, diabetic nephropathy','ارتفاع ضغط الدم، قصور القلب، اعتلال الكلى السكري',
 'Pregnancy, history of angioedema','الحمل، تاريخ من الوذمة الوعائية',
 'Dry cough, hyperkalemia, angioedema, dizziness','سعال جاف، فرط بوتاسيوم الدم، وذمة وعائية، دوار',1),

('Insulin Glargine','إنسولين جلارجين','Insulin Glargine','إنسولين جلارجين','Insulin analogue','تماثلي الأنسولين',
 'Type 1 and Type 2 Diabetes Mellitus','داء السكري من النوع الأول والثاني',
 'Hypoglycemia episodes','نوبات نقص السكر في الدم',
 'Hypoglycemia, injection site reactions, weight gain','نقص سكر الدم، تفاعلات موقع الحقن، زيادة الوزن',1),

('Salbutamol','سالبوتامول','Albuterol','ألبوتيرول','Bronchodilator','موسّع قصبي',
 'Asthma, COPD, bronchospasm','الربو، مرض الانسداد الرئوي المزمن، تشنج قصبي',
 'Hypersensitivity','فرط الحساسية',
 'Tremor, tachycardia, hypokalemia','رعشة، تسرع القلب، نقص البوتاسيوم',1);
