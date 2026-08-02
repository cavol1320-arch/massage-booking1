const form = document.querySelector("#booking-form");
const serviceSelect = document.querySelector("#service");
const dateInput = document.querySelector("#date");
const timeSelect = document.querySelector("#time");
const message = document.querySelector("#form-message");
const submitButton = form.querySelector('button[type="submit"]');

document.querySelector("#year").textContent = new Date().getFullYear();

const today = new Date();
const offset = today.getTimezoneOffset();
const localToday = new Date(today.getTime() - offset * 60_000)
  .toISOString()
  .slice(0, 10);
dateInput.min = localToday;

async function loadServices() {
  const response = await fetch("/api/services");
  const services = await response.json();

  services.forEach(service => {
    const option = document.createElement("option");
    option.value = service.id;
    option.textContent =
      `${service.name} — ${service.duration} min — €${service.price}`;
    serviceSelect.appendChild(option);
  });
}

async function loadAvailability() {
  const date = dateInput.value;
  timeSelect.disabled = true;
  timeSelect.innerHTML = '<option value="">Loading…</option>';

  if (!date) {
    timeSelect.innerHTML = '<option value="">Choose a date first</option>';
    return;
  }

  try {
    const response = await fetch(`/api/availability?date=${encodeURIComponent(date)}`);
    const data = await response.json();

    timeSelect.innerHTML = '<option value="">Choose a time</option>';

    if (!data.slots?.length) {
      timeSelect.innerHTML = '<option value="">No times available</option>';
      return;
    }

    data.slots.forEach(slot => {
      const option = document.createElement("option");
      option.value = slot;
      option.textContent = slot;
      timeSelect.appendChild(option);
    });

    timeSelect.disabled = false;
  } catch {
    timeSelect.innerHTML = '<option value="">Unable to load times</option>';
  }
}

dateInput.addEventListener("change", loadAvailability);

form.addEventListener("submit", async event => {
  event.preventDefault();
  message.textContent = "";
  message.className = "form-message";
  submitButton.disabled = true;
  submitButton.textContent = "Booking…";

  const data = new FormData(form);
  const payload = {
    serviceId: data.get("serviceId"),
    date: data.get("date"),
    time: data.get("time"),
    name: data.get("name"),
    email: data.get("email"),
    phone: data.get("phone"),
    notes: data.get("notes"),
    privacyAccepted: document.querySelector("#privacy").checked
  };

  try {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) throw new Error(result.error || "Booking failed.");

    message.textContent =
      `${result.message} Reference: ${result.booking.id.slice(0, 8).toUpperCase()}`;
    message.classList.add("success");
    form.reset();
    dateInput.min = localToday;
    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option value="">Choose a date first</option>';
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("error");
    if (error.message.includes("just been booked")) loadAvailability();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Confirm appointment";
  }
});

loadServices().catch(() => {
  message.textContent = "Unable to load treatments.";
  message.classList.add("error");
});
