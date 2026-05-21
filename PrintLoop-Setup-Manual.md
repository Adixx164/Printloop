# PrintLoop Setup Manual

**For: Abdurrahman, Founder · Version 1.0 · May 2026**

This manual will take you from "I have a folder of code" to "PrintLoop is running on the internet" in 8 parts. Don't skip ahead. Each part builds on the previous one.

**Estimated time to finish all 8 parts:** 6–10 hours, spread over 2–3 days.

---

## Table of contents

- **Part 1** · Get your computer ready
- **Part 2** · Understand what you're building
- **Part 3** · Set up the database
- **Part 4** · Get the backend (server) running on your laptop
- **Part 5** · Get the frontend (website) running on your laptop
- **Part 6** · Connect them and test the full flow
- **Part 7** · Push everything to GitHub
- **Part 8** · Deploy to the internet
- **Appendix A** · When something goes wrong
- **Appendix B** · Glossary of technical words
- **Appendix C** · Hiring help when you need it

---

# Part 1 · Get your computer ready

You'll install 5 free programs. This is one-time work — you'll never have to do this again.

## What you're about to install

| Software | What it does |
|---|---|
| **Node.js** | The runtime that runs JavaScript code on your computer. Both backend and frontend need it. |
| **Git** | Tracks changes to your code and lets you push it to GitHub. |
| **VS Code** | A code editor — like Microsoft Word, but for code. Free, made by Microsoft. |
| **MySQL Server** | The database that stores users, jobs, payments, etc. |
| **Redis** | A fast in-memory store. Used for queues (background jobs) and rate limiting. |

## Step 1.1 — Install Node.js

1. Open your web browser.
2. Go to **https://nodejs.org**
3. Click the green button that says **"LTS"** (Long Term Support). Don't pick "Current" — that's for developers.
4. The downloaded file will be either a `.msi` (Windows) or `.pkg` (Mac).
5. Double-click it. Click "Next" through the installer. Use all default settings.
6. **Verify it installed correctly:**
   - On Windows: Press the Windows key, type `cmd`, press Enter. A black window opens.
   - On Mac: Press Command+Space, type `Terminal`, press Enter.
   - Type this exactly and press Enter: `node --version`
   - You should see something like `v20.18.0`. Congratulations.
7. Now type: `npm --version` and press Enter. You should see something like `10.8.2`.

If either command shows "command not found" or "is not recognized", restart your computer and try again. If it still doesn't work, the installer didn't finish properly — uninstall and reinstall.

## Step 1.2 — Install Git

1. Go to **https://git-scm.com/downloads**
2. Click your operating system (Windows or macOS).
3. The download starts automatically.
4. Run the installer. **Important:** When it asks "Adjusting your PATH environment", choose the middle option ("Git from the command line and also from 3rd-party software"). All other options can stay as default.
5. **Verify:** In Terminal/cmd: `git --version` — you should see `git version 2.40.something`.

## Step 1.3 — Install VS Code

1. Go to **https://code.visualstudio.com**
2. Click the big blue Download button.
3. Run the installer. All defaults are fine.
4. Open VS Code once after install to confirm it works.

## Step 1.4 — Install MySQL

This is the most fiddly install. Follow carefully.

### On Windows:
1. Go to **https://dev.mysql.com/downloads/installer/**
2. Click "Download" next to "Windows (x86, 32-bit), MSI Installer" — pick the LARGER file (~400MB).
3. You can skip the "Login" prompt — there's a small "No thanks, just start my download" link below.
4. Run the installer.
5. Choose **"Server only"** when asked which products to install.
6. When asked for an authentication method, pick **"Use Strong Password Encryption"**.
7. **Set a password and write it down somewhere safe.** You'll need it later. Use something like `printloop-dev-2026` — avoid spaces and special characters.
8. Leave all other settings as default. Click Next through everything.

### On Mac:
1. Go to **https://dev.mysql.com/downloads/mysql/**
2. Pick the DMG installer for your Mac (Apple silicon or Intel — System Settings → About will tell you which).
3. Run the .dmg, double-click the .pkg inside.
4. **Set a password and write it down.**
5. After install: System Settings → MySQL → click "Start MySQL Server".

### Verify it works:
Open Terminal/cmd and type: `mysql -u root -p`
Enter your password. You should see a prompt like `mysql>`. Type `exit;` and press Enter to leave.

## Step 1.5 — Install Redis

### On Windows:
Redis isn't natively supported on Windows. Use this Docker-free workaround:
1. Go to **https://github.com/microsoftarchive/redis/releases**
2. Scroll down and download `Redis-x64-3.0.504.msi`.
3. Run the installer with default settings.
4. Open the Services app (press Windows key, type "Services"). Find "Redis", make sure it's "Running".
5. **Verify:** Open cmd: `redis-cli ping` — should return `PONG`.

### On Mac:
1. First install Homebrew if you don't have it. Open Terminal and paste:
   ```
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   Press Enter. Wait. Enter your Mac password when asked.
2. Then install Redis:
   ```
   brew install redis
   brew services start redis
   ```
3. **Verify:** `redis-cli ping` — should return `PONG`.

## Step 1.6 — Final check

In Terminal/cmd, run all 5 commands:
```
node --version
git --version
mysql --version
redis-cli ping
code --version
```

If all 5 print something (no errors), Part 1 is done. ✓

---

# Part 2 · Understand what you're building

Before you start touching code, you need a mental picture of how the pieces talk to each other. Spend 10 minutes here. It will save you hours later.

## The 4 systems

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│                  │         │                  │         │                  │
│   STUDENT'S      │  HTTPS  │   PRINTLOOP      │  HTTPS  │   PRINT KIOSK    │
│   PHONE          │ ──────► │   BACKEND        │ ◄────── │   (Tablet at     │
│   (browser)      │         │   (your server)  │         │    print shop)   │
│                  │         │                  │         │                  │
└──────────────────┘         └────────┬─────────┘         └─────────┬────────┘
                                      │                              │
                                      │                              │
                                      ▼                              ▼
                             ┌──────────────────┐         ┌──────────────────┐
                             │   DATABASE       │         │   RASPBERRY PI   │
                             │   (MySQL)        │         │   + PRINTER      │
                             │                  │         │                  │
                             └──────────────────┘         └──────────────────┘
```

## What each piece does

### 1. The frontend (the website)
- This is what students see when they visit `printloop.ng` on their phone.
- They upload a document, pay, and see their print code.
- It also includes the admin panel (`printloop.ng/admin`) where you log in to manage things.
- And the kiosk screen interface (`printloop.ng/kiosk`) that runs on the tablets in print shops.

### 2. The backend (the server)
- This is the brain. It receives requests from the frontend, charges the user via Paystack, generates the 6-digit code, sends the SMS, stores everything in the database.
- It also talks to the kiosk to release the print job when the code is entered.
- It runs Node.js and is in folder `01-backend/`.

### 3. The database (MySQL)
- Stores: users, print jobs, payments, kiosks, group sessions, audit logs, everything.
- The structure is defined by "migration files" you'll run in Part 3.

### 4. The kiosk (Raspberry Pi + printer)
- A small computer (Raspberry Pi, costs about ₦40k) connects to a USB printer.
- A tablet sits on top displaying the kiosk interface.
- The Pi runs a small Node.js program that listens for print jobs from the backend and sends them to the printer.
- We've designed and partly built this. The kiosk auth code is in folder `04-kiosk-auth-implementation/`.

## How a single print job flows through the system

1. Student opens `printloop.ng` on her phone.
2. She uploads `essay.pdf` and clicks "Pay".
3. The **frontend** sends the file to the **backend**.
4. The **backend** stores the file in cloud storage (Cloudinary), creates a job record in the **database**, and asks Paystack to charge her card.
5. Paystack confirms the payment.
6. The **backend** generates code `M7K3X9` and sends it to her phone via Termii SMS.
7. She walks to a print shop. The **kiosk** screen says "Enter your code". She types `M7K3X9`.
8. The **kiosk** asks the **backend**: "Is M7K3X9 a valid paid job? If yes, give me the file."
9. The **backend** checks the database, marks the job as "in progress", and sends the file URL.
10. The **Pi** downloads the file and sends it to the USB printer.
11. The printer prints. The student walks away with her essay.

That's the entire flow. Everything you'll do in Parts 3-8 is just making each of those arrows work.

---

# Part 3 · Set up the database

Now we'll create the database that stores all the data PrintLoop needs.

## Step 3.1 — Open the backend folder

1. Extract the package you got from Claude (you may already have done this).
2. Open VS Code.
3. File menu → Open Folder → navigate to `PrintLoop-Complete/01-backend/` and click Open.
4. You'll see a list of folders on the left: `controllers/`, `services/`, `entities/`, etc.

## Step 3.2 — Open the integrated terminal in VS Code

VS Code has a built-in terminal so you don't have to switch windows.

- Press **Ctrl+`** (the backtick key, usually below Esc) on Windows
- Or **Control+`** on Mac
- A terminal pane opens at the bottom.

Make sure the terminal is showing the path to `01-backend`. If not:
```
cd /path/to/PrintLoop-Complete/01-backend
```

## Step 3.3 — Create an empty database

In the terminal:
```
mysql -u root -p
```
Enter the password you set in Step 1.4. You're now inside MySQL.

Type these commands one by one (press Enter after each):
```sql
CREATE DATABASE printloop;
CREATE USER 'printloop_user'@'localhost' IDENTIFIED BY 'change-this-to-a-real-password';
GRANT ALL PRIVILEGES ON printloop.* TO 'printloop_user'@'localhost';
FLUSH PRIVILEGES;
exit;
```

**Replace `change-this-to-a-real-password`** with a real password. Write it down. You'll use it in the next step.

## Step 3.4 — Create the configuration file

The backend reads its passwords and keys from a file called `.env`.

1. In VS Code, look at the file list on the left for `.env.example`.
2. Right-click it → "Copy".
3. Right-click in empty space → "Paste". A copy called `.env.example copy` is created.
4. Right-click it → "Rename" → change the name to exactly `.env` (just .env, no extension).

Now open `.env` and fill in these values:

```
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=printloop_user
DATABASE_PASSWORD=the-password-you-just-wrote-down
DATABASE_NAME=printloop

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=any-long-random-string-of-letters-and-numbers
NODE_ENV=development
PORT=4000
```

For now, leave the Paystack/Termii/Cloudinary keys empty. We'll fill those in Part 8 when you have real accounts.

## Step 3.5 — Install backend dependencies

In the terminal:
```
npm install
```
This downloads all the packages the backend needs. It takes 1-3 minutes. You'll see lots of text scrolling. As long as it finishes without saying "ERROR" in red, you're fine.

## Step 3.6 — Run the migrations (create the tables)

The "migrations" are scripts that build the database structure (users table, jobs table, etc.).

```
npm run migration:run
```

You should see something like:
```
Migration "CreateKiosksTable1714500000000" has been executed successfully
Migration "AddSchemaGapsAndNewEntities1714600000000" has been executed successfully
```

## Step 3.7 — Seed initial data

This adds your first admin user and some test kiosks.

```
npm run seed
```

When this finishes, your database has:
- 1 admin user (email: `admin@printloop.ng`, password: `admin123` — **change this later**)
- 12 sample kiosks
- The pricing rows (₦5/page A4 B&W, etc.)

## Step 3.8 — Verify

```
mysql -u printloop_user -p printloop
```
Enter the password from Step 3.3. Then:
```sql
SHOW TABLES;
```
You should see ~15 tables: `users`, `jobs`, `kiosks`, `payments`, `group_sessions`, etc. Type `exit;` to leave.

**Part 3 is done.** ✓

---

# Part 4 · Get the backend running

## Step 4.1 — Start the backend

In the terminal (still in `01-backend`):
```
npm run dev
```

You should see something like:
```
[INFO] Server listening on port 4000
[INFO] Database connected
[INFO] Redis connected
[INFO] Worker started: file-cleanup
[INFO] Worker started: watermark
```

If you see any errors (red text), check Appendix A.

## Step 4.2 — Test it

Open your web browser and go to:
```
http://localhost:4000/health
```

You should see:
```json
{"status":"ok","timestamp":"2026-05-09T..."}
```

If you see this, the backend is running! ✓

**Important:** Leave this terminal window open. Closing it stops the server. If you need to use your terminal for something else, open a SECOND terminal pane (in VS Code: click the `+` icon at the top right of the terminal panel).

---

# Part 5 · Get the frontend running

## Step 5.1 — Open the frontend folder

Open a **second** VS Code window (don't close the backend one).

- File menu → New Window
- Then File → Open Folder → navigate to `PrintLoop-Complete/02-frontend/` and Open.

Open a terminal in this window too (Ctrl+` / Control+`).

## Step 5.2 — Install dependencies

```
npm install
```
Takes 1-2 minutes.

## Step 5.3 — Configure the API URL

The frontend needs to know where to find the backend.

1. In the file list, look for `.env.example`. (If there isn't one, skip to Step 5.4.)
2. Copy it and rename the copy to `.env.local`.
3. Inside `.env.local`, add:
   ```
   VITE_API_URL=http://localhost:4000
   ```

For now, the frontend uses fake mock data — it doesn't need the backend to display screens. So even if you skip this step, you can still see the designs.

## Step 5.4 — Start the frontend

```
npm run dev
```

You'll see:
```
VITE v7.3.3 ready in 236 ms
➜  Local:   http://localhost:5173/
```

## Step 5.5 — Open it in your browser

Go to **http://localhost:5173**

You'll see the PrintLoop landing page. Click around — try:
- `http://localhost:5173/index` — catalogue of all 28 screens
- `http://localhost:5173/app` — customer dashboard
- `http://localhost:5173/admin` — admin console
- `http://localhost:5173/kiosk` — kiosk screen

Every screen works because it's reading from mock data. **Part 5 is done.** ✓

---

# Part 6 · Connect frontend to backend (real data)

This is where the frontend stops using fake data and starts talking to the backend you set up. **This is the longest part.**

A full description of this work is in `05-guides-and-checklists/PrintLoop_Complete_Integration_Guide.docx` — Part 5 of that guide. The short version:

1. The mock data lives in `02-frontend/src/data/mockData.js`.
2. You replace each export with a function that calls the backend instead.
3. We use a library called **RTK Query** to make this clean.

Because this involves writing real code (not just running commands), we recommend you **hire a freelancer for this part** — see Appendix C. Budget: 10–15 hours of a Nigerian Node/React developer (~₦150-250k total).

You can attempt it yourself by following the integration guide closely. The guide names every endpoint and shows exactly which mock function corresponds to which API call.

---

# Part 7 · Push everything to GitHub

GitHub is where you store your code in the cloud. Two reasons to do this:
1. Backup — if your laptop dies, your code is safe.
2. Auto-deploy — every time you push code, your live website updates.

## Step 7.1 — Create a GitHub account

If you don't have one:
1. Go to **https://github.com/signup**
2. Use a real email (you'll need to verify it).
3. Choose a username — `printloop`, `abdurrahman-printloop`, whatever.
4. Pick "Free" plan.

## Step 7.2 — Push the frontend (this is the easiest part)

The frontend folder is already a git repo with one clean commit on the `main` branch. Open the terminal in your frontend window:

1. Go to **https://github.com/new**
2. Repository name: `printloop-frontend`
3. Set it to **Private** (only you can see it).
4. **Do NOT** check any of the "Add README/license/.gitignore" boxes.
5. Click "Create repository".
6. The next page shows a "push an existing repository" snippet. Copy the commands.
7. Paste them into your terminal:
   ```
   git remote add origin https://github.com/YOUR_USERNAME/printloop-frontend.git
   git branch -M main
   git push -u origin main
   ```
8. It'll ask for your username and a "password". GitHub no longer accepts passwords here — you need a "Personal Access Token":
   - Go to **https://github.com/settings/tokens**
   - "Generate new token (classic)"
   - Name: `printloop-laptop`
   - Scope: check `repo`
   - Click Generate. **Copy the token immediately** — it shows only once.
   - Paste this token where it asks for "password" in the terminal.

After this, refresh your GitHub repo page — you should see all your files there.

The frontend folder also includes a file called `PUSH_GUIDE.md` with these exact steps if you need to refer back.

## Step 7.3 — Push the backend (same process)

Open the backend folder in a terminal. Initialize git (the backend doesn't have it yet):

```
cd /path/to/PrintLoop-Complete/01-backend
git init -b main
git add .
git commit -m "Initial backend code"
```

Then create another empty private repo on GitHub called `printloop-backend` (don't add any files at creation), and push:
```
git remote add origin https://github.com/YOUR_USERNAME/printloop-backend.git
git push -u origin main
```

Use the same Personal Access Token from before.

**Part 7 done.** ✓

---

# Part 8 · Deploy to the internet

Time to make it real. We'll deploy the **frontend** to Vercel (free) and the **backend** to Railway (~$5/month).

## Step 8.1 — Deploy the frontend to Vercel

1. Go to **https://vercel.com/signup**
2. Click "Continue with GitHub". Authorize Vercel.
3. From the Vercel dashboard, click "Add New" → "Project".
4. Find `printloop-frontend` in the list and click "Import".
5. Vercel auto-detects Vite. Don't change any settings.
6. Click "Deploy".
7. Wait 1-2 minutes. You'll get a URL like `printloop-frontend-abc123.vercel.app`.
8. Open it. You should see your PrintLoop website live on the internet.

To use a custom domain like `printloop.ng`:
- Buy the domain (Namecheap or DomainKing.ng, ~₦15k/year).
- In Vercel: Settings → Domains → Add your domain.
- Follow Vercel's instructions to add DNS records at your domain registrar.

## Step 8.2 — Deploy the backend to Railway

Railway is the simplest place to host a Node.js + MySQL backend. Free trial, then ~$5-10/month for low traffic.

1. Go to **https://railway.app**, sign in with GitHub.
2. New Project → Deploy from GitHub Repo → pick `printloop-backend`.
3. Railway will start trying to deploy. It will fail because we need a database first.
4. In your project, click "+ New" → "Database" → "MySQL". Wait for it to provision.
5. Click "+ New" → "Database" → "Redis". Same.
6. Now click on your backend service → Variables tab.
7. You need to set these environment variables (Railway provides MySQL/Redis values automatically when you click the "+" button next to each variable name):

   ```
   DATABASE_HOST=${{MySQL.MYSQLHOST}}
   DATABASE_PORT=${{MySQL.MYSQLPORT}}
   DATABASE_USER=${{MySQL.MYSQLUSER}}
   DATABASE_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   DATABASE_NAME=${{MySQL.MYSQLDATABASE}}
   REDIS_HOST=${{Redis.REDISHOST}}
   REDIS_PORT=${{Redis.REDISPORT}}
   REDIS_PASSWORD=${{Redis.REDISPASSWORD}}
   JWT_SECRET=any-long-random-string
   NODE_ENV=production
   PORT=4000
   ```

8. Click "Deploy" again at the top. It should now succeed.
9. Settings tab → Networking → Generate Domain. You'll get something like `printloop-backend-production.up.railway.app`.
10. Test: open `https://your-backend.up.railway.app/health` — should show `{"status":"ok"}`.

## Step 8.3 — Run migrations on Railway

Once deployed:
- Railway service → Settings → "Deploy" tab → run a one-off command.
- Use: `npm run migration:run` then `npm run seed`.

## Step 8.4 — Tell the frontend where the backend lives

1. In Vercel: Project Settings → Environment Variables.
2. Add: `VITE_API_URL` = `https://your-backend.up.railway.app`.
3. Vercel → Deployments → click the three-dot menu on the latest deployment → "Redeploy".

## Step 8.5 — Get your real API keys

Now plug in real services. Each one takes 10-30 minutes to set up.

| Service | What for | Where |
|---|---|---|
| **Paystack** | Payments | https://dashboard.paystack.com/#/signup |
| **Termii** | SMS | https://termii.com/signup |
| **Cloudinary** | File storage | https://cloudinary.com/users/register/free |
| **Sentry** | Error tracking | https://sentry.io/signup/ |

For each:
1. Sign up.
2. Find the API keys section.
3. Copy the keys.
4. Add them as environment variables in Railway:
   ```
   PAYSTACK_SECRET_KEY=sk_live_...
   PAYSTACK_PUBLIC_KEY=pk_live_...
   TERMII_API_KEY=TLm5...
   CLOUDINARY_CLOUD_NAME=your-name
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   ```

5. Redeploy the backend.

**Part 8 done.** Your full PrintLoop platform is now live. ✓✓✓

---

# Appendix A — When something goes wrong

## "Command not found"
Whatever you typed, the computer doesn't know that command. Either:
- You typed it wrong (check spelling).
- You haven't installed that program yet (go back to Part 1).
- Your terminal hasn't picked up the new install — restart your computer.

## "EADDRINUSE" or "port 4000 is already in use"
Something else is using port 4000. Either:
- The backend is already running in another window — find and close it.
- Another program uses 4000. Edit `.env` and change `PORT=4000` to `PORT=4001`.

## "ECONNREFUSED" when backend tries to connect to MySQL
MySQL is not running.
- Windows: Services app → find MySQL → Start.
- Mac: System Settings → MySQL → Start MySQL Server.

## "Access denied for user"
Your `.env` has the wrong password.
- Open `.env`, double-check `DATABASE_PASSWORD` matches what you set in Step 3.3.

## "Cannot find module '...'"
You forgot to run `npm install`. Run it.

## Frontend shows a blank white page
Open the browser DevTools (F12 on Windows, Option+Cmd+I on Mac), look at the Console tab. The error message will tell you what's wrong. Most common: the frontend is trying to call the backend but can't reach it. Make sure both are running.

## "git push" rejects you
GitHub stopped accepting passwords. You need a Personal Access Token. See Step 7.2.

## I don't know how to fix it
Three ways forward:
1. Copy the EXACT error and paste it into Google. Add "node.js" or "vite" to the search.
2. Copy the error and ask Claude (this AI). Paste the error AND the command you ran.
3. Hire a freelancer (Appendix C).

---

# Appendix B — Glossary

- **Backend** — the server-side code. Receives requests, talks to the database. Lives in `01-backend/`.
- **Frontend** — the website code. What users see in their browser. Lives in `02-frontend/`.
- **Database** — where data is stored permanently. We use MySQL.
- **Redis** — like a database, but faster and forgets things when restarted. Used for queues and rate limiting.
- **API** — a way for two programs to talk to each other. Frontend calls the backend's API.
- **Endpoint** — a single URL on the backend, like `/jobs` or `/payments`.
- **Migration** — a script that changes the database structure (creates tables, adds columns).
- **Seed** — initial data inserted into the database (default admin user, sample kiosks).
- **Environment variable** — a setting stored outside the code, in a `.env` file. Things like passwords go here so they're not hardcoded.
- **Repository (repo)** — a folder of code tracked by Git. You have two: frontend and backend.
- **Commit** — a saved snapshot of your code changes.
- **Push** — uploading your local commits to GitHub.
- **Deploy** — getting your code running on a server somewhere on the internet (not your laptop).
- **JWT** — a way of saying "this user is logged in" using a special token.
- **Webhook** — when an external service (like Paystack) calls your backend to notify it of an event (like "payment completed").

---

# Appendix C — Hiring help

Some parts of this manual are genuinely hard. Hiring is not failure; it's smart.

## When to hire

- **Part 6 (frontend ↔ backend integration)** — best ROI from a freelancer. ~10-15 hours.
- **Custom branding / design tweaks** — if you want a designer to refine the editorial look.
- **Kiosk physical setup** — when you're ready to set up the first Pi-and-printer combo.

## Where to find Nigerian freelancers

- **Upwork** (https://upwork.com) — global, well-vetted, expect $20–50/hr USD.
- **Toptal** (https://toptal.com) — premium, $60–100/hr USD.
- **Twitter / X** — search "Nigerian developer" or "Lagos developer". Cheaper, less vetted.
- **Andela alumni network** — top-tier Nigerian engineers, but usually too expensive for a small project.
- **A small agency** — try Genesys, Tunga, or Andela Talent Cloud. They handle the management for you.

## How to brief a freelancer

Send them:
1. The relevant folder (`01-backend/` or `02-frontend/`).
2. The relevant guide from `05-guides-and-checklists/`.
3. The specific tasks. Don't say "build PrintLoop" — say "wire up the print job creation endpoint to the frontend's PrintFlow.jsx".

## Sample brief for Part 6

> I have a React frontend that uses mocked data, and a Node/Express/TypeORM backend. I need them connected via RTK Query. Spec:
> - Replace each export in `src/data/mockData.js` with an RTK Query endpoint
> - Add an auth slice that stores the JWT and adds it to all requests
> - Wire up the 4-step print flow to: create job → upload file → confirm payment → poll status
> - Hook up the admin pages to their respective backend endpoints
>
> The backend is documented in `05-guides-and-checklists/PrintLoop_Complete_Integration_Guide.docx`. Estimate: 10-15 hours. Budget: ₦150-250k.

---

**End of manual. Good luck, Abdurrahman. You've got this.**
