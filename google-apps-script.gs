const CONFIG = Object.freeze({
  OWNER_EMAIL: "cavol1320@gmail.com",
  STUDIO_NAME: "Studio Massage",
  LOCATION: "Via Piazza Diaz 10, Limena",
  PHONE: "380 766 6090",
  TIMEZONE: "Europe/Rome",
  SECRET_PROPERTY: "WEBHOOK_SECRET"
});

function doGet() {
  return jsonResponse_({ ok: true, service: "Studio Massage booking notifications" });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("Missing request body.");
    const p = JSON.parse(e.postData.contents);
    validateSecret_(p.secret);
    validatePayload_(p);

    const start = buildDate_(p.date, p.time);
    const end = new Date(start.getTime() + Number(p.duration) * 60000);
    const title = `${p.service} — ${p.customerName}`;
    const description = [
      `Cliente: ${p.customerName}`,
      `Telefono: ${p.customerPhone}`,
      `Email: ${p.customerEmail}`,
      `Trattamento: ${p.service}`,
      `Durata: ${p.duration} minuti`,
      `Prezzo: €${p.price}`,
      `Codice prenotazione: ${p.bookingId}`,
      `Note: ${p.notes || "Nessuna"}`
    ].join("\n");

    const event = CalendarApp.getDefaultCalendar().createEvent(title, start, end, {
      description,
      location: CONFIG.LOCATION
    });
    event.addPopupReminder(30);
    event.addEmailReminder(24 * 60);

    sendOwnerEmail_(p, start);
    sendCustomerEmail_(p, start);
    return jsonResponse_({ ok: true, eventId: event.getId() });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function validateSecret_(received) {
  const expected = PropertiesService.getScriptProperties().getProperty(CONFIG.SECRET_PROPERTY);
  if (!expected) throw new Error("WEBHOOK_SECRET is not configured.");
  if (String(received || "") !== expected) throw new Error("Unauthorized request.");
}

function validatePayload_(p) {
  ["bookingId","service","duration","price","date","time","customerName","customerEmail","customerPhone"]
    .forEach(k => { if (p[k] === undefined || p[k] === null || p[k] === "") throw new Error(`Missing field: ${k}`); });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new Error("Invalid date format.");
  if (!/^\d{2}:\d{2}$/.test(p.time)) throw new Error("Invalid time format.");
}

function buildDate_(dateString, timeString) {
  const [y,m,d] = dateString.split("-").map(Number);
  const [h,min] = timeString.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, CONFIG.TIMEZONE, "dd/MM/yyyy 'alle' HH:mm");
}

function sendOwnerEmail_(p, start) {
  const subject = `Nuova prenotazione: ${p.customerName} — ${p.date} ${p.time}`;
  const body = [
    "Nuova prenotazione Studio Massage", "",
    `Cliente: ${p.customerName}`,
    `Telefono: ${p.customerPhone}`,
    `Email: ${p.customerEmail}`,
    `Trattamento: ${p.service}`,
    `Durata: ${p.duration} minuti`,
    `Prezzo: €${p.price}`,
    `Data e ora: ${formatDateTime_(start)}`,
    `Note: ${p.notes || "Nessuna"}`,
    `Codice: ${p.bookingId}`
  ].join("\n");
  MailApp.sendEmail({
    to: CONFIG.OWNER_EMAIL,
    replyTo: p.customerEmail,
    subject,
    body,
    name: CONFIG.STUDIO_NAME
  });
}

function sendCustomerEmail_(p, start) {
  const english = p.language === "en";
  const subject = english ? `Booking confirmed — ${CONFIG.STUDIO_NAME}` : `Prenotazione confermata — ${CONFIG.STUDIO_NAME}`;
  const body = english ? [
    `Hello ${p.customerName},`, "", "your appointment has been confirmed.",
    `Treatment: ${p.service}`, `Date and time: ${formatDateTime_(start)}`,
    `Duration: ${p.duration} minutes`, `Price: €${p.price}`,
    `Address: ${CONFIG.LOCATION}`, `Booking reference: ${p.bookingId}`, "",
    `For changes, call ${CONFIG.PHONE}.`
  ].join("\n") : [
    `Ciao ${p.customerName},`, "", "la tua prenotazione è confermata.",
    `Trattamento: ${p.service}`, `Data e ora: ${formatDateTime_(start)}`,
    `Durata: ${p.duration} minuti`, `Prezzo: €${p.price}`,
    `Indirizzo: ${CONFIG.LOCATION}`, `Codice prenotazione: ${p.bookingId}`, "",
    `Per modifiche, chiama il ${CONFIG.PHONE}.`
  ].join("\n");
  MailApp.sendEmail({
    to: p.customerEmail,
    replyTo: CONFIG.OWNER_EMAIL,
    subject,
    body,
    name: CONFIG.STUDIO_NAME
  });
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function testAuthorization() {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 60000);
  const event = CalendarApp.getDefaultCalendar().createEvent("Test Studio Massage", now, end, { location: CONFIG.LOCATION });
  MailApp.sendEmail({ to: CONFIG.OWNER_EMAIL, subject: "Test notifiche Studio Massage", body: "Email e Calendar funzionano.", name: CONFIG.STUDIO_NAME });
  event.deleteEvent();
}
