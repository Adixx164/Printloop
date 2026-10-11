import { StudentWaitlistForm } from './components/StudentWaitlistForm';
import { ShopWaitlistForm } from './components/ShopWaitlistForm';
import { QRCode } from './components/QRCode';

function App() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/* ======================== HERO ======================== */}
      <header className="hero" role="banner">
        <nav className="nav container" aria-label="Main navigation">
          <a href="#" className="nav__logo" aria-label="PrintLoop home">
            <span className="nav__logo-mark" aria-hidden="true">PL</span>
            <span>PrintLoop</span>
          </a>
          <div className="nav__links">
            <a href="#how-it-works" className="nav__link" onClick={e => { e.preventDefault(); scrollTo('how-it-works'); }}>How it works</a>
            <a href="#for-students" className="nav__link" onClick={e => { e.preventDefault(); scrollTo('for-students'); }}>For students</a>
            <a href="#for-shops" className="nav__link" onClick={e => { e.preventDefault(); scrollTo('for-shops'); }}>For shops</a>
          </div>
        </nav>

        <main className="hero__main">
          <div className="hero__content">
            <span className="eyebrow">University of Abuja Pilot</span>
            <h1 className="hero__headline">Print on campus in <span className="toner-text">2 minutes</span>. No queue. No stress.</h1>
            <p className="hero__subhead">
              Upload your file → Get a QR code → Walk to any PrintLoop shop → Scan → Collect.
              <span className="highlight">First 200 students get 20% off your first 3 prints.</span>
            </p>

            <div className="hero__ctas">
              <button className="btn btn--toner btn--lg" onClick={() => scrollTo('for-students')}>
                Join waitlist — 20% off first 3 prints
              </button>
              <button className="btn btn--ghost btn--lg" onClick={() => scrollTo('for-shops')}>
                I run a print shop
              </button>
            </div>

            <div className="hero__trust">
              <span className="hero__trust-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                No card required
              </span>
              <span className="hero__trust-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                Works on any phone
              </span>
              <span className="hero__trust-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                Powering UniAbuja shops
              </span>
            </div>
          </div>

          <div className="hero__qr" aria-hidden="true">
            <QRCode 
              size={280} 
              animate={true} 
              interactive={true}
              caption="Scan to print — demo"
              data="https://printloop.ng/print/uniabuja/demo-job-001"
            />
            <p className="hero__qr-caption">This QR code is live. Hover it.</p>
          </div>
        </main>
      </header>

      {/* ======================== HOW IT WORKS ======================== */}
      <section id="how-it-works" className="timeline" aria-labelledby="timeline-title">
        <div className="container">
          <header className="timeline__header">
            <span className="eyebrow">How it works</span>
            <h2 id="timeline-title" className="timeline__title">Three steps from file to paper</h2>
            <p className="timeline__subtitle">The QR code is the bridge. Cloud renders, local spools, you collect.</p>
          </header>

          <div className="timeline__track" role="list">
            <article className="timeline__step" role="listitem">
              <div className="timeline__number">1</div>
              <div className="timeline__step-content">
                <h3 className="timeline__step-title">Find your shop</h3>
                <p className="timeline__step-desc">Open the PrintLoop app. See every campus shop on the map — Main Gate, Senate Building, Faculty of Science, Engineering, Law, Medicine, Hostels, Mini Campus, Gwagwalada. Each pin shows the shop's price per page and hours.</p>
                <QRCode size={96} caption="Tap shop → get QR" className="timeline__step-qr" />
              </div>
            </article>

            <article className="timeline__step" role="listitem">
              <div className="timeline__number">2</div>
              <div className="timeline__step-content">
                <h3 className="timeline__step-title">Upload & get QR</h3>
                <p className="timeline__step-desc">Drag PDF, Word, or image. Compare shop prices instantly. Pay via transfer, USSD, or card. Your QR code arrives instantly — valid for 24 hours.</p>
                <QRCode size={96} caption="Pay → QR ready" className="timeline__step-qr" />
              </div>
            </article>

            <article className="timeline__step" role="listitem">
              <div className="timeline__number">3</div>
              <div className="timeline__step-content">
                <h3 className="timeline__step-title">Walk. Scan. Collect.</h3>
                <p className="timeline__step-desc">Go to the shop. Scan your QR at the PrintLoop printer. Document prints instantly — warm from the tray. No attendant needed. No file handling. No "come tomorrow."</p>
                <QRCode size={96} caption="Scan → print done" className="timeline__step-qr" />
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ======================== SPLIT: STUDENTS & SHOPS ======================== */}
      <section className="split" aria-labelledby="split-title">
        <div className="container">
          <header className="split__header">
            <span className="eyebrow">Two sides, one network</span>
            <h2 id="split-title" className="split__title">Students print. Shops earn. PrintLoop connects.</h2>
            <p className="split__subtitle">You set your price. Students see it before choosing. PrintLoop takes 10-15% only after Month 1.</p>
          </header>

          <div className="split__grid">
            {/* Students panel */}
            <article className="split__panel split__panel--students" id="for-students">
              <div className="split__panel-icon" aria-hidden="true">📄</div>
              <h3 className="split__panel-title">For students</h3>
              <p className="split__panel-desc">Print where you are. Pay less. Save the trek to town.</p>
              
              <ul className="split__benefits">
                <li className="split__benefit"><strong>2-minute print:</strong> Upload from hostel, collect at faculty gate. No cyber cafe queue.</li>
                <li className="split__benefit"><strong>Cheaper than town:</strong> Shops set prices — typically ₦30/page vs ₦50+ off-campus. No transport cost.</li>
                <li className="split__benefit"><strong>Phone to paper:</strong> WhatsApp a file to yourself → open link → print. No laptop needed.</li>
                <li className="split__benefit"><strong>Flexible hours:</strong> Shops set hours. QR works anytime shop is open. Exam season? Extended hours.</li>
                <li className="split__benefit"><strong>Files stay private:</strong> End-to-end encrypted. Auto-deleted after print. No one sees your thesis.</li>
                <li className="split__benefit"><strong>Built for UniAbuja:</strong> Map shows Senate Building, Mini Campus, Main Campus, Gwagwalada, Hostels.</li>
              </ul>

              <button className="split__cta btn btn--toner btn--lg btn--full" onClick={() => scrollTo('student-form')}>
                Join waitlist — 20% off first 3 prints
              </button>

              <div className="split__converge" aria-hidden="true">
                <div className="split__converge-qr">
                  <QRCode size={96} caption="Student QR" />
                </div>
                <span className="split__converge-label">Your print job</span>
              </div>
            </article>

            {/* Shops panel */}
            <article className="split__panel split__panel--shops" id="for-shops">
              <div className="split__panel-icon" aria-hidden="true">🖨️</div>
              <h3 className="split__panel-title">For print shops</h3>
              <p className="split__panel-desc">Turn every printer into revenue. No upfront cost. You set your price.</p>
              
              <ul className="split__benefits">
                <li className="split__benefit"><strong>Zero setup fee:</strong> We configure your existing printer (any brand, any OS) in 15 minutes.</li>
                <li className="split__benefit"><strong>Customers walked to you:</strong> Students order via app, arrive with QR ready to print.</li>
                <li className="split__benefit"><strong>You set your price:</strong> Students see your ₦/page before choosing your shop.</li>
                <li className="split__benefit"><strong>Guaranteed payout:</strong> PrintLoop collects, deducts 10-15%, sends you ₦ weekly.</li>
                <li className="split__benefit"><strong>No contracts:</strong> Leave anytime. Keep your walk-in customers too.</li>
                <li className="split__benefit"><strong>Tech support included:</strong> We fix printing breaks. You focus on paper and toner.</li>
              </ul>

              <button className="split__cta btn btn--stock btn--lg btn--full" onClick={() => scrollTo('shop-form')}>
                Apply for pilot spot
              </button>

              <div className="split__converge" aria-hidden="true">
                <div className="split__converge-qr">
                  <QRCode size={96} caption="Shop receives" />
                </div>
                <span className="split__converge-label">Job arrives</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ======================== STUDENT FORM ======================== */}
      <section id="student-form" className="form-section form-section--students" aria-labelledby="student-form-title">
        <div className="container-narrow">
          <header className="form__header">
            <span className="eyebrow">Student waitlist</span>
            <h3 id="student-form-title" className="form__title">Join the first 200</h3>
            <p className="form__subtitle">20% off your first 3 prints. Locked in forever.</p>
          </header>
          <StudentWaitlistForm />
        </div>
      </section>

      {/* ======================== SHOP FORM ======================== */}
      <section id="shop-form" className="form-section form-section--shops" aria-labelledby="shop-form-title">
        <div className="container-narrow">
          <header className="form__header">
            <span className="eyebrow">Shop pilot program</span>
            <h3 id="shop-form-title" className="form__title">First 5 shops at UniAbuja</h3>
            <p className="form__subtitle">Month 1 = 0% platform fees. You keep 100% of PrintLoop revenue.</p>
          </header>
          <ShopWaitlistForm />
        </div>
      </section>

      {/* ======================== TRUST / TECH ======================== */}
      <section className="section" aria-labelledby="tech-title" style={{ background: 'var(--paper-deep)' }}>
        <div className="container">
          <header style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
            <span className="eyebrow" style={{ color: 'var(--stock)' }}>Built on open standards</span>
            <h2 id="tech-title" className="display-lg" style={{ marginBottom: 'var(--space-sm)' }}>No vendor lock-in. No proprietary drivers.</h2>
            <p style={{ color: 'var(--ink-soft)', maxWidth: '45ch', margin: '0 auto' }}>Your HP, Canon, Epson, Brother — any printer works. We use OpenPrinting drivers, not closed ecosystems.</p>
          </header>

          <div className="grid grid--3">
            <article className="card card--stock">
              <h3 style={{ marginBottom: 'var(--space-sm)' }}>OpenPrinting powered</h3>
              <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--body-sm)' }}>CUPS + OpenPrinting drivers = any printer works. No proprietary software to license or maintain.</p>
            </article>
            <article className="card card--toner">
              <h3 style={{ marginBottom: 'var(--space-sm)' }}>Cloud render → local spool</h3>
              <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--body-sm)' }}>Heavy lifting in cloud. QR releases job to your local spooler. Fast, reliable, works offline-ready.</p>
            </article>
            <article className="card card--margin">
              <h3 style={{ marginBottom: 'var(--space-sm)' }}>Nigeria-first payments</h3>
              <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--body-sm)' }}>Bank transfer, USSD, card. Payouts in ₦ weekly. Built for how money moves here.</p>
            </article>
          </div>

          <div className="card card--toner" style={{ maxWidth: '48rem', margin: 'var(--space-xl) auto 0' }}>
            <blockquote style={{ margin: 0, fontStyle: 'italic', fontSize: 'var(--body-lg)', lineHeight: 1.7, color: 'var(--ink)' }}>
              "I'm building this because I've watched students trek to town for ₦50 prints while campus printers sit idle. PrintLoop connects both sides. Starting with UniAbuja — where I know the terrain."
            </blockquote>
            <footer style={{ marginTop: 'var(--space-md)', fontStyle: 'normal', color: 'var(--fog)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <strong style={{ color: 'var(--ink)' }}>— Abdurrahman, Founder</strong>
            </footer>
          </div>
        </div>
      </section>

      {/* ======================== FOOTER ======================== */}
      <footer className="footer" role="contentinfo">
        <div className="container">
          <div className="footer__main">
            <div className="footer__brand">
              <a href="#" className="nav__logo" aria-label="PrintLoop home">
                <span className="nav__logo-mark" aria-hidden="true">PL</span>
                <span>PrintLoop</span>
              </a>
              <p className="footer__tagline">PrintLoop SaaS v2 — University of Abuja Pilot</p>
            </div>

            <nav aria-label="Product">
              <h4 className="footer__nav-title">Product</h4>
              <ul className="footer__nav-list">
                <li><a href="#for-students" className="footer__nav-link">For students</a></li>
                <li><a href="#for-shops" className="footer__nav-link">For print shops</a></li>
                <li><a href="#how-it-works" className="footer__nav-link">How it works</a></li>
              </ul>
            </nav>

            <nav aria-label="Company">
              <h4 className="footer__nav-title">Company</h4>
              <ul className="footer__nav-list">
                <li><a href="#" className="footer__nav-link">About</a></li>
                <li><a href="#" className="footer__nav-link">Blog</a></li>
                <li><a href="#" className="footer__nav-link">Careers</a></li>
              </ul>
            </nav>

            <div className="footer__contact">
              <h4 className="footer__nav-title">Get in touch</h4>
              <a href="https://wa.me/234XXXXXXXXXX" target="_blank" rel="noopener noreferrer" className="footer__contact-link">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                WhatsApp: +234-XXX-XXXX
              </a>
              <p className="footer__contact-email">email@printloop.ng</p>
            </div>
          </div>

          <div className="footer__bottom">
            <p>© 2025 PrintLoop. UniAbuja Pilot. Not affiliated with University of Abuja.</p>
          </div>
        </div>
      </footer>
    </>
  );
}

export default App;