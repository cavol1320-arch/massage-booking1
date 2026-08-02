const body = document.querySelector("#bookings-body");
const message = document.querySelector("#admin-message");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function updateStatus(id, status) {
  const response = await fetch(`/api/admin/bookings/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  if (!response.ok) throw new Error("Could not update booking.");
}

async function loadBookings() {
  const response = await fetch("/api/admin/bookings");
  if (!response.ok) throw new Error("Could not load bookings.");
  const bookings = await response.json();

  if (!bookings.length) {
    body.innerHTML = '<tr><td colspan="7" class="muted">No appointments yet.</td></tr>';
    return;
  }

  body.innerHTML = bookings.map(booking => `
    <tr>
      <td>${escapeHtml(booking.appointment_date)}</td>
      <td>${escapeHtml(booking.appointment_time)}</td>
      <td><strong>${escapeHtml(booking.customer_name)}</strong></td>
      <td>
        <a href="mailto:${escapeHtml(booking.customer_email)}">${escapeHtml(booking.customer_email)}</a><br>
        <a href="tel:${escapeHtml(booking.customer_phone)}">${escapeHtml(booking.customer_phone)}</a>
      </td>
      <td>
        ${escapeHtml(booking.service_name)}<br>
        <span class="muted">${booking.duration_minutes} min · €${booking.price_eur}</span>
      </td>
      <td>${escapeHtml(booking.notes || "—")}</td>
      <td>
        <select data-id="${booking.id}">
          ${["confirmed","completed","cancelled"].map(status =>
            `<option value="${status}" ${status === booking.status ? "selected" : ""}>
              ${status[0].toUpperCase() + status.slice(1)}
            </option>`
          ).join("")}
        </select>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll("select[data-id]").forEach(select => {
    select.addEventListener("change", async () => {
      try {
        await updateStatus(select.dataset.id, select.value);
        message.textContent = "Booking updated.";
        message.className = "form-message success";
      } catch (error) {
        message.textContent = error.message;
        message.className = "form-message error";
        await loadBookings();
      }
    });
  });
}

loadBookings().catch(error => {
  message.textContent = error.message;
  message.className = "form-message error";
});
