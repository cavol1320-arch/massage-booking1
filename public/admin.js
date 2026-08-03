"use strict";

const bookingRows = document.querySelector("#booking-rows");
const adminMessage = document.querySelector("#admin-message");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function updateStatus(id, status) {
  const response = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });

  if (!response.ok) {
    throw new Error("Impossibile aggiornare la prenotazione.");
  }
}

async function loadBookings() {
  const response = await fetch("/api/admin/bookings");
  if (!response.ok) {
    throw new Error("Impossibile caricare le prenotazioni.");
  }

  const bookings = await response.json();

  if (!bookings.length) {
    bookingRows.innerHTML = '<tr><td colspan="7">Nessuna prenotazione.</td></tr>';
    return;
  }

  bookingRows.innerHTML = bookings.map(booking => `
    <tr>
      <td>${escapeHtml(booking.appointment_date)}</td>
      <td>${escapeHtml(booking.appointment_time)}</td>
      <td><strong>${escapeHtml(booking.customer_name)}</strong></td>
      <td>
        <a href="mailto:${escapeHtml(booking.customer_email)}">${escapeHtml(booking.customer_email)}</a><br>
        <a href="tel:${escapeHtml(booking.customer_phone)}">${escapeHtml(booking.customer_phone)}</a>
      </td>
      <td>${escapeHtml(booking.service_name)}<br>${booking.duration_minutes} min · €${booking.price_eur}</td>
      <td>${escapeHtml(booking.notes || "—")}</td>
      <td>
        <select data-id="${escapeHtml(booking.id)}">
          ${["confirmed", "completed", "cancelled"].map(status => `
            <option value="${status}" ${status === booking.status ? "selected" : ""}>
              ${status}
            </option>
          `).join("")}
        </select>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll("select[data-id]").forEach(select => {
    select.addEventListener("change", async () => {
      try {
        await updateStatus(select.dataset.id, select.value);
        adminMessage.textContent = "Prenotazione aggiornata.";
        adminMessage.className = "form-message success";
      } catch (error) {
        adminMessage.textContent = error.message;
        adminMessage.className = "form-message error";
        await loadBookings();
      }
    });
  });
}

loadBookings().catch(error => {
  adminMessage.textContent = error.message;
  adminMessage.className = "form-message error";
});
