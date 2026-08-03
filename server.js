const express = require("express");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

const SERVICES = Object.freeze([
  { id: "sports-30", nameIt: "Massaggio Sportivo", nameEn: "Sports Massage", duration: 30, price: 30 },
  { id: "sports-50", nameIt: "Massaggio Sportivo", nameEn: "Sports Massage", duration: 50, price: 50 },
  { id: "deep-30", nameIt: "Massaggio Decontratturante", nameEn: "Deep Tissue Massage", duration: 30, price: 30 },
  { id: "deep-50", nameIt: "Massaggio Decontratturante", nameEn: "Deep Tissue Massage", duration: 50, price: 50 },
  { id: "relax-30", nameIt: "Massaggio Rilassante", nameEn: "Relaxing Massage", duration: 30, price: 30 },
  { id: "relax-50", nameIt: "Massaggio Rilassante", nameEn: "Relaxing Massage", duration: 50, price: 50 }
]);

const WEEKDAY_SLOTS = Object.freeze([
  "09:00", "10:00", "11:00", "12:00", "13:00",
  "14:00", "15:00", "16:00", "17:00", "18:00"
]);

const OPENING_HOURS = Object.freeze({
  0: [],
  1: WEEKDAY_SLOTS,
  2: WEEKDAY_SLOTS,
  3: WEEKDAY_SLOTS,
  4: WEEKDAY_SLOTS,
  5: WEEKDAY_SLOTS,
  6: WEEKDAY_SLOTS
});

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"]
    }
  }
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  etag: true
}));

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id UUID PRIMARY KEY,
      service_id VARCHAR(80) NOT NULL,
      service_name VARCHAR(120) NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price_eur NUMERIC(8,2) NOT NULL,
      appointment_date DATE NOT NULL,
      appointment_time TIME NOT NULL,
      customer_name VARCHAR(120) NOT NULL,
      customer_email VARCHAR(180) NOT NULL,
      customer_phone VARCHAR(40) NOT NULL,
      notes TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (appointment_date, appointment_time)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS bookings_date_time_idx
    ON bookings (appointment_date, appointment_time);
  `);
}

function clean(value, maxLength = 300) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function localDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

app.get("/api/services", (_req, res) => {
  res.json(SERVICES);
});

app.get("/api/availability", async (req, res, next) => {
  try {
    const date = clean(req.query.date, 10);
    if (!isValidDate(date)) {
      return res.status(400).json({ error: "Invalid date." });
    }

    const requestedDate = localDate(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (requestedDate < today) {
      return res.json({ slots: [] });
    }

    const possibleSlots = OPENING_HOURS[requestedDate.getDay()] || [];
    const result = await pool.query(
      `SELECT TO_CHAR(appointment_time, 'HH24:MI') AS time
       FROM bookings
       WHERE appointment_date = $1 AND status <> 'cancelled'`,
      [date]
    );

    const booked = new Set(result.rows.map(row => row.time));
    res.json({ slots: possibleSlots.filter(slot => !booked.has(slot)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/bookings", async (req, res, next) => {
  const language = clean(req.body.language, 2) === "en" ? "en" : "it";
  const messages = {
    invalid: language === "it" ? "Controlla i dati inseriti." : "Please check the information entered.",
    privacy: language === "it" ? "Accetta il consenso privacy." : "Privacy consent is required.",
    taken: language === "it" ? "Questo orario è stato appena prenotato. Scegline un altro." : "That time was just booked. Please choose another one.",
    success: language === "it" ? "Prenotazione confermata." : "Appointment confirmed."
  };

  try {
    const service = SERVICES.find(item => item.id === clean(req.body.serviceId, 80));
    const date = clean(req.body.date, 10);
    const time = clean(req.body.time, 5);
    const name = clean(req.body.name, 120);
    const email = clean(req.body.email, 180).toLowerCase();
    const phone = clean(req.body.phone, 40);
    const notes = clean(req.body.notes, 1000);

    if (
      !service ||
      !isValidDate(date) ||
      !/^\d{2}:\d{2}$/.test(time) ||
      name.length < 2 ||
      !isValidEmail(email) ||
      phone.length < 6
    ) {
      return res.status(400).json({ error: messages.invalid });
    }

    if (req.body.privacyAccepted !== true) {
      return res.status(400).json({ error: messages.privacy });
    }

    const requestedDate = localDate(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (
      requestedDate < today ||
      !(OPENING_HOURS[requestedDate.getDay()] || []).includes(time)
    ) {
      return res.status(400).json({ error: messages.invalid });
    }

    const id = crypto.randomUUID();
    const serviceName = language === "it" ? service.nameIt : service.nameEn;

    await pool.query(
      `INSERT INTO bookings (
        id, service_id, service_name, duration_minutes, price_eur,
        appointment_date, appointment_time, customer_name,
        customer_email, customer_phone, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, service.id, serviceName, service.duration, service.price,
        date, time, name, email, phone, notes || null
      ]
    );

    res.status(201).json({
      message: messages.success,
      booking: { id, service: serviceName, date, time }
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: messages.taken });
    }
    next(error);
  }
});

function requireAdmin(req, res, next) {
  const expectedUser = process.env.ADMIN_USERNAME || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD;
  const authorization = req.headers.authorization || "";

  if (!expectedPassword || !authorization.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Studio Massage Admin"');
    return res.status(401).send("Authentication required.");
  }

  const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const username = separator >= 0 ? decoded.slice(0, separator) : "";
  const password = separator >= 0 ? decoded.slice(separator + 1) : "";

  if (username !== expectedUser || password !== expectedPassword) {
    res.set("WWW-Authenticate", 'Basic realm="Studio Massage Admin"');
    return res.status(401).send("Authentication required.");
  }

  next();
}

app.get("/admin", requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/api/admin/bookings", requireAdmin, async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        id, service_name, duration_minutes, price_eur,
        TO_CHAR(appointment_date, 'YYYY-MM-DD') AS appointment_date,
        TO_CHAR(appointment_time, 'HH24:MI') AS appointment_time,
        customer_name, customer_email, customer_phone,
        notes, status, created_at
      FROM bookings
      ORDER BY appointment_date ASC, appointment_time ASC
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/bookings/:id/status", requireAdmin, async (req, res, next) => {
  try {
    const status = clean(req.body.status, 20);
    if (!["confirmed", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const result = await pool.query(
      "UPDATE bookings SET status = $1 WHERE id = $2 RETURNING id, status",
      [status, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Booking not found." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error." });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Studio Massage v3 running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
