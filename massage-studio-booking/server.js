const express = require("express");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

const SERVICES = [
  { id: "relaxing-60", name: "Relaxing Massage", duration: 60, price: 70 },
  { id: "deep-tissue-60", name: "Deep Tissue Massage", duration: 60, price: 80 },
  { id: "sports-60", name: "Sports Massage", duration: 60, price: 85 },
  { id: "aromatherapy-75", name: "Aromatherapy Massage", duration: 75, price: 95 }
];

const OPENING_HOURS = {
  0: [], // Sunday
  1: ["09:00", "10:30", "12:00", "14:30", "16:00", "17:30"],
  2: ["09:00", "10:30", "12:00", "14:30", "16:00", "17:30"],
  3: ["09:00", "10:30", "12:00", "14:30", "16:00", "17:30"],
  4: ["09:00", "10:30", "12:00", "14:30", "16:00", "17:30"],
  5: ["09:00", "10:30", "12:00", "14:30", "16:00"],
  6: ["09:00", "10:30", "12:00", "14:30"]
};

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"]
    }
  }
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

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
    CREATE INDEX IF NOT EXISTS bookings_date_idx
    ON bookings (appointment_date, appointment_time);
  `);
}

function clean(value, maxLength = 300) {
  return String(value || "").trim().slice(0, maxLength);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validDateString(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function localDateFromISO(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isAdmin(req) {
  const expectedUser = process.env.ADMIN_USERNAME || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedPass) return false;

  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) return false;

  const [username = "", password = ""] = Buffer
    .from(auth.slice(6), "base64")
    .toString("utf8")
    .split(":");

  const userMatch = crypto.timingSafeEqual(
    Buffer.from(username.padEnd(expectedUser.length)),
    Buffer.from(expectedUser.padEnd(username.length))
  );
  const passMatch = crypto.timingSafeEqual(
    Buffer.from(password.padEnd(expectedPass.length)),
    Buffer.from(expectedPass.padEnd(password.length))
  );

  return userMatch && passMatch;
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    res.set("WWW-Authenticate", 'Basic realm="Massage Studio Admin"');
    return res.status(401).send("Authentication required.");
  }
  next();
}

app.get("/api/services", (req, res) => {
  res.json(SERVICES);
});

app.get("/api/availability", async (req, res) => {
  const date = clean(req.query.date, 10);
  if (!validDateString(date)) {
    return res.status(400).json({ error: "Please provide a valid date." });
  }

  const requestedDate = localDateFromISO(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (requestedDate < today) {
    return res.json({ slots: [] });
  }

  const weekday = requestedDate.getDay();
  const possibleSlots = OPENING_HOURS[weekday] || [];

  const result = await pool.query(
    `SELECT TO_CHAR(appointment_time, 'HH24:MI') AS time
     FROM bookings
     WHERE appointment_date = $1 AND status <> 'cancelled'`,
    [date]
  );

  const booked = new Set(result.rows.map(row => row.time));
  res.json({ slots: possibleSlots.filter(slot => !booked.has(slot)) });
});

app.post("/api/bookings", async (req, res) => {
  const serviceId = clean(req.body.serviceId, 80);
  const date = clean(req.body.date, 10);
  const time = clean(req.body.time, 5);
  const name = clean(req.body.name, 120);
  const email = clean(req.body.email, 180).toLowerCase();
  const phone = clean(req.body.phone, 40);
  const notes = clean(req.body.notes, 1000);
  const privacyAccepted = req.body.privacyAccepted === true;

  const service = SERVICES.find(item => item.id === serviceId);

  if (!service || !validDateString(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: "Invalid service, date, or time." });
  }

  const requestedDate = localDateFromISO(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (requestedDate < today) {
    return res.status(400).json({ error: "Past dates cannot be booked." });
  }

  const availableForDay = OPENING_HOURS[requestedDate.getDay()] || [];
  if (!availableForDay.includes(time)) {
    return res.status(400).json({ error: "That time is outside opening hours." });
  }

  if (name.length < 2 || !validEmail(email) || phone.length < 6) {
    return res.status(400).json({ error: "Please enter valid contact details." });
  }

  if (!privacyAccepted) {
    return res.status(400).json({ error: "Privacy consent is required." });
  }

  const id = crypto.randomUUID();

  try {
    await pool.query(
      `INSERT INTO bookings (
        id, service_id, service_name, duration_minutes, price_eur,
        appointment_date, appointment_time, customer_name,
        customer_email, customer_phone, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, service.id, service.name, service.duration, service.price,
        date, time, name, email, phone, notes || null
      ]
    );

    res.status(201).json({
      message: "Your appointment has been booked successfully.",
      booking: {
        id,
        service: service.name,
        date,
        time,
        duration: service.duration,
        price: service.price
      }
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "That time has just been booked. Please choose another slot."
      });
    }
    console.error(error);
    res.status(500).json({ error: "Unable to complete the booking." });
  }
});

app.get("/admin", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/api/admin/bookings", requireAdmin, async (req, res) => {
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
});

app.patch("/api/admin/bookings/:id/status", requireAdmin, async (req, res) => {
  const allowed = new Set(["confirmed", "completed", "cancelled"]);
  const status = clean(req.body.status, 30);

  if (!allowed.has(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }

  const result = await pool.query(
    `UPDATE bookings SET status = $1 WHERE id = $2 RETURNING id, status`,
    [status, req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Booking not found." });
  }

  res.json(result.rows[0]);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Massage booking app running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
