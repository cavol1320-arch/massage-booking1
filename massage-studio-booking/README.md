# Massage Studio Booking App

A polished English-language booking website for a massage studio, built with
Node.js, Express, PostgreSQL, and plain HTML/CSS/JavaScript.

## Features

- Public booking form
- Treatment list with duration and price
- Live availability
- Protection against double bookings
- PostgreSQL persistence
- Password-protected admin dashboard at `/admin`
- Booking status management
- Responsive design
- Railway health check endpoint

## Deploy on Railway

1. Create a new GitHub repository and upload this project.
2. In Railway, create a new project and deploy the GitHub repository.
3. Add a PostgreSQL database service to the same Railway project.
4. In the web app service, add these variables:

   ```text
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=use-a-long-random-password
   NODE_ENV=production
   ```

   If your database service has a different name, replace `Postgres` in the
   reference with that service name.

5. Open the service settings, enable Public Networking, and generate a domain.
6. Visit the generated domain for the booking page.
7. Visit `/admin` and enter the admin credentials.

The database table is created automatically when the server starts.

## Local development

1. Install PostgreSQL and create a database.
2. Copy `.env.example` to `.env` and update `DATABASE_URL`.
3. Run:

   ```bash
   npm install
   npm run dev
   ```

4. Open `http://localhost:3000`.

## Customize

Edit these sections in `server.js`:

- `SERVICES` for treatment names, durations, and prices.
- `OPENING_HOURS` for available time slots.

Edit `public/index.html` to replace the studio name, description, and hours.

## Production notes

Before accepting real bookings:

- Add your full privacy policy and business details.
- Configure transactional email or SMS confirmations.
- Confirm local tax, consumer, health-data, and privacy requirements.
- Use a strong unique `ADMIN_PASSWORD`.
- Consider adding rate limiting and CAPTCHA if the form receives spam.
