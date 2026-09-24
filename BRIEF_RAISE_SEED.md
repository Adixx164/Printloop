# Strategy Brief: Raise Seed Round for PrintLoop

---

# Context
- **Company:** PrintLoop — campus print marketplace (Nigeria)
- **Stage:** Pre-seed, pre-revenue, product live (multi-tenant SaaS v2)
- **Ask:** ₦15M NGN (~$9K USD) for 18-month runway
- **Use of funds:** Software completion (multi-tenancy, payments, kiosk agent), marketing (campus ambassadors, WhatsApp/IG/TikTok content), 2 kiosk hardware units

---

# Problem (validated)
University students in Nigeria describe printing as: "slow, lots of queue, inconsistent quality." Current alternative: campus business centres (₦100-200/page, 45-min queue, limited hours).

---

# Customer (ICP)
**Primary:** "Chinedu, 300-level Civil Engineering, UNILAG. Prints 3×/week. Uses Biz Centre Akoka. Pays ₦20/page. Hates 45-min queue. Has smartphone, pays via USSD/bank app."
**Secondary:** Kiosk owners — "Mr. Yusuf, owns HP LaserJet at UNILAG gate. Makes ₦12k/week cyber cafe. Wants zero-rent, customer-bringing model."

---

# Distribution (tested, repeatable)
1. **WhatsApp broadcast** — UNILAG 300-level group chats (organic, zero CAC)
2. **Campus ambassadors** — 5 students/hostel, ₦5k/month + commission
3. **Short-form video** — IG Reels/TikTok/YouTube Shorts targeting "UNILAG printing" / "Nile University printing" searches
4. **Referral loop** — "Refer a friend, get ₦200 credit"

---

# Defensibility
**Switching costs (primary):**
- Student: saved cards, order history, campus-specific pricing, loyalty credits
- Kiosk: Paystack subaccount split, payout history, tenant dashboard, printer pairing
- Network effect: more students → more kiosk revenue → more kiosks join → better coverage → more students

---

# Market Size
- **TAM:** 2.1M university students in Nigeria × ₦500/month avg print spend = ₦1.05B/year
- **SAM (Phase 1):** 12 universities in Lagos/Abuja = 400k students = ₦200M/year
- **SOM (Year 1):** 3 universities, 5% penetration = 600 students = ₦3M ARR

---

# Business Model
- **Student:** ₦5/page B&W, ₦25/page color (Paystack: card/USSD/transfer)
- **Kiosk:** PrintLoop takes 10% commission only on completed jobs
- **No subscription, no wallet** — pay per job, code-based collection

---

# Traction (v2 platform)
- Multi-tenant SaaS: tenant isolation, subaccounts, white-label branding
- Paystack integration: live test keys, webhook handling, subaccount splits
- Kiosk agent: IPP + raw9100 + OS spooler (near-universal printer compatibility)
- Render worker: cloud PDF→PWG-Raster, HMAC callback, BullMQ queue
- 87 backend tests passing, CI/CD pipeline, Docker images

---

# Financials
| Metric | Value |
|--------|-------|
| Ask | ₦15M NGN ($9K USD) |
| Runway | 18 months |
| Burn | ~₦833k/month |
| Payback target | 24 months |
| Break-even | 1,200 active students/month |

---

# Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Paystack webhook reliability | Medium | High | Idempotent handling, manual fallback, retry logic |
| Kiosk onboarding friction | High | High | Self-serve wizard, QR pairing, remote support |
| Student acquisition cost | Medium | Medium | Organic WhatsApp + ambassadors + viral loops |
| Power/internet at kiosks | High | High | OS spooler fallback, offline queue, battery backup |
| Competitor (campus biz centres) | High | Medium | Price parity + speed + convenience + loyalty |

---

# Milestones (Next 18 Months)
| Month | Milestone |
|-------|-----------|
| 1-2 | 3 universities live, 500 students, 5 kiosks |
| 3-6 | 1,200 students, break-even on variable costs |
| 6-12 | 10 universities, 5k students, ₦10M ARR |
| 12-18 | 20 universities, ₦50M ARR, Series A ready |

---

# Decision Required
- **Proceed with seed raise?** (Y/N)
- **If Y:** Target investors — angel (Nigerian founders), micro-VC (Future Africa, Launch Africa), revenue-based financing (GetEquity)
- **If N:** Bootstrap to profitability, reinvest kiosk commissions