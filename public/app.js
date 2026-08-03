"use strict";

const bookingForm = document.querySelector("#booking-form");
const serviceSelect = document.querySelector("#service");
const dateInput = document.querySelector("#date");
const timeSelect = document.querySelector("#time");
const formMessage = document.querySelector("#form-message");
const languageToggle = document.querySelector("#language-toggle");
const submitButton = bookingForm.querySelector('button[type="submit"]');

let language = localStorage.getItem("studio-language") === "en" ? "en" : "it";
let services = [];

document.querySelector("#year").textContent = new Date().getFullYear();

const now = new Date();
const timezoneOffset = now.getTimezoneOffset();
dateInput.min = new Date(now.getTime() - timezoneOffset * 60000)
  .toISOString()
  .slice(0, 10);

function text(it, en) {
  return language === "it" ? it : en;
}

function applyTranslations() {
  document.documentElement.lang = language;

  document.querySelectorAll("[data-it][data-en]").forEach(element => {
    element.innerHTML = element.dataset[language];
  });

  languageToggle.textContent = language === "it" ? "EN" : "IT";
  renderServices();

  if (!dateInput.value) {
    timeSelect.innerHTML = `<option value="">${text("Scegli prima una data", "Choose a date first")}</option>`;
  }
}

function renderServices() {
  const selectedValue = serviceSelect.value;
  serviceSelect.innerHTML = `<option value="">${text("Scegli trattamento e durata", "Choose treatment and duration")}</option>`;

  services.forEach(service => {
    const option = document.createElement("option");
    option.value = service.id;
    const serviceName = language === "it" ? service.nameIt : service.nameEn;
    option.textContent = `${serviceName} — ${service.duration} min — €${service.price}`;
    serviceSelect.appendChild(option);
  });

  serviceSelect.value = selectedValue;
}

async function loadServices() {
  const response = await fetch("/api/services");
  if (!response.ok) {
    throw new Error(text("Impossibile caricare i trattamenti.", "Unable to load treatments."));
  }
  services = await response.json();
  renderServices();
}

async function loadAvailability() {
  const selectedDate = dateInput.value;
  timeSelect.disabled = true;

  if (!selectedDate) {
    timeSelect.innerHTML = `<option value="">${text("Scegli prima una data", "Choose a date first")}</option>`;
    return;
  }

  timeSelect.innerHTML = `<option value="">${text("Caricamento…", "Loading…")}</option>`;

  try {
    const response = await fetch(`/api/availability?date=${encodeURIComponent(selectedDate)}`);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || text("Errore nel caricamento.", "Unable to load availability."));
    }

    if (!result.slots.length) {
      timeSelect.innerHTML = `<option value="">${text("Nessun orario disponibile", "No times available")}</option>`;
      return;
    }

    timeSelect.innerHTML = `<option value="">${text("Scegli un orario", "Choose a time")}</option>`;
    result.slots.forEach(slot => {
      const option = document.createElement("option");
      option.value = slot;
      option.textContent = slot;
      timeSelect.appendChild(option);
    });
    timeSelect.disabled = false;
  } catch (error) {
    timeSelect.innerHTML = `<option value="">${error.message}</option>`;
  }
}

languageToggle.addEventListener("click", () => {
  language = language === "it" ? "en" : "it";
  localStorage.setItem("studio-language", language);
  applyTranslations();
});

dateInput.addEventListener("change", loadAvailability);

bookingForm.addEventListener("submit", async event => {
  event.preventDefault();
  formMessage.textContent = "";
  formMessage.className = "form-message";
  submitButton.disabled = true;
  submitButton.textContent = text("Prenotazione in corso…", "Booking…");

  const data = new FormData(bookingForm);
  const payload = {
    serviceId: data.get("serviceId"),
    date: data.get("date"),
    time: data.get("time"),
    name: data.get("name"),
    email: data.get("email"),
    phone: data.get("phone"),
    notes: data.get("notes"),
    privacyAccepted: document.querySelector("#privacy").checked,
    language
  };

  try {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || text("Prenotazione non riuscita.", "Booking failed."));
    }

    formMessage.textContent = `${result.message} ${text("Codice", "Reference")}: ${result.booking.id.slice(0, 8).toUpperCase()}`;
    formMessage.classList.add("success");
    bookingForm.reset();
    timeSelect.disabled = true;
    applyTranslations();
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.classList.add("error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = text("Conferma prenotazione", "Confirm booking");
  }
});

applyTranslations();
loadServices().catch(error => {
  formMessage.textContent = error.message;
  formMessage.classList.add("error");
});
