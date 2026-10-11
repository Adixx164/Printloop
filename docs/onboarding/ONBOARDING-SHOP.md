# PrintLoop — get your shop live (zero dev time)

For the **print-shop owner**. No code, no developer, no support ticket. If you
can use a browser and plug in a printer, you can be taking PrintLoop customers
today.

This is where PrintLoop beats EFI M600 / Equitrac / Pharos: those need an IT
project. This is a web wizard.

---

## The whole thing in 5 minutes

1. **Sign up** → `printloop.app/saas/signup`
2. **Verify** the 6-digit code we email you
3. Open **Operator console** (`/saas/operator`) and follow the 3-step wizard
4. **Plug in your printer**, scan the QR on the shop PC
5. Click **Go live** — you're on the customer map at `/find`

Everything below is detail for each step.

---

## Step 1 — Payments (so you actually get paid)

PrintLoop takes a small commission (default 10%) and sends you the rest. To
route money to you we set up two things through **Paystack**:

### a) Paystack subaccount
`Operator console → Go live → Payments → Set up subaccount`

You'll need:
| Field | Where to find it |
|---|---|
| Business name | As registered (or your trading name) |
| Settlement bank code | See the bank-code table below |
| Account number | Your 10-digit NUBAN |

### b) Payout bank account
`… → Add bank account` — where your weekly earnings land (every Friday, or
instantly for a ₦100 fee).

### Nigerian bank codes (the ones you'll actually use)
| Bank | Code |
|---|---|
| Access Bank | 044 |
| Citibank | 023 |
| Ecobank | 050 |
| Fidelity Bank | 070 |
| First Bank | 011 |
| First City Monument Bank (FCMB) | 214 |
| Globus Bank | 00103 |
| Guaranty Trust Bank (GTBank) | 058 |
| Heritage Bank | 030 |
| Keystone Bank | 082 |
| Kuda (MFB) | 50211 |
| Moniepoint (MFB) | 50515 |
| OPay | 999992 |
| Palmpay | 999991 |
| Polaris Bank | 076 |
| Providus Bank | 101 |
| Stanbic IBTC | 221 |
| Standard Chartered | 068 |
| Sterling Bank | 232 |
| Union Bank | 032 |
| United Bank for Africa (UBA) | 033 |
| Unity Bank | 215 |
| Wema Bank | 035 |
| Zenith Bank | 057 |

> Full live list is in your Paystack dashboard under **Transfers → Banks**.

### KYC checklist (what Paystack asks a Nigerian business for)
Have these ready before you start — it makes onboarding one sitting, not three:

- [ ] **BVN** of the account holder
- [ ] **A valid ID** — NIN slip, driver's licence, or international passport
- [ ] **The settlement bank account** in the business's or owner's name
- [ ] **CAC documents** if you're a registered business (RC number) — sole
      traders can start with personal details and upgrade later
- [ ] **A phone number + email** that receive OTPs
- [ ] (Sometimes) **a utility bill / proof of address** for higher limits

You do the KYC inside Paystack's own flow; PrintLoop only stores the resulting
subaccount code, never your BVN or bank password.

---

## Step 2 — Branding (make the shop look like yours)

`Operator console → Go live → Branding` (`/saas/settings/branding`)

Optional but quick. Anything you set shows on your `/find` card and your shop
page:

- **Wordmark** — your shop's name as customers see it
- **Logo URL** + **favicon URL**
- **Primary / secondary / accent colours** (hex, e.g. `#1A1410`)
- **Support email + phone**

Leave blank to use PrintLoop defaults. The wizard ticks this step once you save
anything visible (wordmark, logo, or a colour).

---

## Step 3 — Printer & test print

`Operator console → Manage printers` (`/saas/operator/printers`)

### a) Add the printer
Click **Add printer**: give it a name (e.g. "Front desk LaserJet"), an optional
location, and your printer's queue name. You get a **pairing QR** immediately.

### b) Pair the shop PC (the M600-killer)
On the computer connected to your printer:

1. Install the PrintLoop agent — **double-click `PrintLoopSetup.exe`** on
   Windows, or `sudo bash install-kiosk-pc.sh` on Linux (see
   [`KIOSK.md`](KIOSK.md)).
2. When it asks to pair, **scan the QR** from the printers page. It carries the
   cloud address + this printer's key — no typing.
3. The agent picks your transport automatically:
   - **spooler** — any USB / local printer (recommended; most shops)
   - **ipp** — networked printer (HP, Brother, Canon…)
   - **raw9100** — Sharp MX-series and other JetDirect-only printers

The installer also drops **SumatraPDF** so PDFs print byte-faithfully.

### c) Confirm a test print
Back on the printers page, hit **Confirm test print** once a real page comes
out. The wizard ticks this step, and the printer shows **online** when the
agent is heartbeating.

---

## Go live

When all three steps are green and a printer is online, the **Go live** button
unlocks on the operator console. Click it — you're now on the customer map at
`printloop.app/find`, sorted by distance, with your prices and "open" status.

The console then becomes your daily dashboard:
- **Today at a glance** — revenue, jobs, in-progress (+ any stuck), printers online
- **Payouts** — request an instant payout or wait for Friday
- **Transactions** — every job, your commission, your net

---

## Troubleshooting (the 5 questions we actually get)

**"Go live is greyed out."** One of: account still in trial (we activate after
verification), no shop address set, no confirmed test print, or no printer
online right now. The console's go-live banner names exactly which.

**"My printer shows offline."** The agent isn't running or lost the network.
Re-open the agent on the shop PC; on Windows it's a Scheduled Task that
auto-restarts — check `%ProgramData%\PrintLoop\agent.log`.

**"Payment worked but no money."** Payouts are weekly (Friday) by default, or
instant for a ₦100 fee from the Payouts page. Make sure your bank account step
is green.

**"A print came out blurry."** Spooler mode without SumatraPDF lets Windows
re-rasterize PDFs. Re-run the installer (it sets SumatraPDF as the print
command) — see [`KIOSK.md`](KIOSK.md) § troubleshooting.

**"I need to re-pair / lost the key."** Printers page → **Pairing QR** issues a
fresh key (the old one stops working) and shows a new QR.

---

## What PrintLoop never asks you for
- Your bank password or Paystack login (KYC happens inside Paystack)
- Your customers' card details (Paystack handles the charge)
- A developer, an IT consultant, or a server

That's the point.

---

## Last updated
2026-06-10
