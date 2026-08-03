# Configurazione gratuita: Gmail + Google Calendar

Questa versione usa Google Apps Script. Quando un cliente prenota:

- la prenotazione resta salvata in PostgreSQL;
- ricevi una mail su `cavol1320@gmail.com`;
- il cliente riceve una conferma;
- l’appuntamento viene creato nel tuo Google Calendar;
- ricevi un promemoria Calendar 30 minuti prima e una mail 24 ore prima.

## 1. Aggiorna il sito

Carica su GitHub il contenuto interno di questa cartella e attendi il deployment verde su Railway.

## 2. Crea lo script Google

1. Accedi con `cavol1320@gmail.com`.
2. Apri `https://script.google.com`.
3. Premi **Nuovo progetto**.
4. Rinominalo `Studio Massage Notifications`.
5. Elimina il codice presente.
6. Apri il file `google-apps-script.gs` di questo progetto, copia tutto e incollalo nell’editor Google.
7. Salva.

## 3. Imposta il fuso orario

In **Impostazioni progetto**, imposta il fuso orario su `Europe/Rome`.

## 4. Imposta la chiave segreta

Scegli una chiave lunga, per esempio cambiando questo modello:

`StudioMassage-2026-x9Q7p2L5-Secure`

In **Impostazioni progetto → Proprietà script** aggiungi:

- Nome: `WEBHOOK_SECRET`
- Valore: la chiave scelta

## 5. Autorizza Gmail e Calendar

1. Nell’editor seleziona la funzione `testAuthorization`.
2. Premi **Esegui**.
3. Scegli `cavol1320@gmail.com`.
4. Autorizza l’invio email e l’accesso al calendario.
5. Controlla che arrivi la mail di test.

## 6. Pubblica come applicazione web

1. Premi **Esegui il deployment → Nuovo deployment**.
2. Tipo: **Applicazione web**.
3. Esegui come: **Me**.
4. Chi può accedere: **Chiunque**.
5. Pubblica e copia l’URL che termina con `/exec`.

## 7. Aggiungi due variabili su Railway

Apri **Railway → massage-booking1 → Variables** e aggiungi:

- `GOOGLE_APPS_SCRIPT_URL` = URL `/exec` copiato
- `GOOGLE_APPS_SCRIPT_SECRET` = la stessa chiave di `WEBHOOK_SECRET`

Avvia il deploy.

## 8. Prova

Fai una prenotazione di prova e controlla:

- email su `cavol1320@gmail.com`;
- evento su Google Calendar;
- email di conferma all’indirizzo del cliente.

Sul telefono tieni attive le notifiche di Gmail e Google Calendar.
