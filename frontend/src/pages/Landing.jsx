import { useEffect, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Landing.css';

const MARKETPLACES = ['Amazon', 'Flipkart', 'Meesho', 'Snapdeal', 'JioMart'];

const FEATURES = [
  {
    icon: '🚀',
    title: 'List products 10x faster than manual photography',
    desc: 'No booking appointments. No waiting days. Upload a product photo and get professional catalog images in minutes — not days.',
    color: '#f0eaff',
    accent: '#6c5ce7',
  },
  {
    icon: '🎯',
    title: 'See your product exactly as buyers will see it',
    desc: 'Preview clean studio shots and real-world lifestyle images before downloading. Know exactly what customers see on Amazon and Flipkart.',
    color: '#fff0f8',
    accent: '#f06292',
  },
  {
    icon: '📂',
    title: 'All your listings organised in one dashboard',
    desc: 'Every generation saved automatically. Browse, rename, and re-download any product photos from your personal dashboard anytime.',
    color: '#f0fff5',
    accent: '#059669',
  },
  {
    icon: '⚡',
    title: 'Download and go live in minutes',
    desc: 'One click downloads all 8 images. Already sized and formatted to meet Amazon, Flipkart, and Meesho listing requirements.',
    color: '#fff8f0',
    accent: '#f59e0b',
  },
  {
    icon: '📝',
    title: 'AI-written bullet points ready for Amazon & Flipkart',
    desc: 'Get 5 detailed product description bullets written by AI from your image and title — highlights materials, benefits, and use cases. Copy-paste straight to your listing.',
    color: '#f0f6ff',
    accent: '#3b82f6',
  },
];

const HIGHLIGHTS = [
  {
    icon: '🎨',
    title: 'Studio + lifestyle shots',
    desc: '4 clean studio shots and 4 real-world lifestyle images, every time.',
  },
  {
    icon: '🔗',
    title: 'Seamless platform upload',
    desc: 'Images formatted and ready for all major Indian marketplace listings.',
  },
  {
    icon: '⚡',
    title: 'Fast turnaround',
    desc: 'Results in ~4 minutes. List new products the same day you photograph them.',
  },
  {
    icon: '💰',
    title: 'Save time and money',
    desc: '98% cheaper than a professional photoshoot. No scheduling, no waiting.',
  },
];


const STATS = [
  { prefix: '₹', target: 5000, suffix: '+', label: 'avg. photoshoot cost' },
  { prefix: '', target: null, raw: '3–5 days', label: 'to get photos back' },
  { prefix: '', target: 40, suffix: '%+', label: 'higher CTR with lifestyle images' },
];


const PRICING_TIERS = [
  {
    name: 'Starter',
    price: '₹99',
    period: 'per product',
    desc: 'Perfect for trying SellerStudio',
    features: ['1 product', '8 AI-generated images', '4 studio + 4 lifestyle shots', 'Instant download', 'Email support'],
    cta: 'Get Started Free',
    href: '/tool',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '₹790',
    period: 'for 10 products',
    desc: 'Best for active marketplace sellers',
    features: ['10 products (save 20%)', '80 AI-generated images', '4 studio + 4 lifestyle each', 'Priority processing', 'Dashboard access', 'GST invoice'],
    cta: 'Start Growing',
    href: '/tool',
    highlighted: true,
  },
  {
    name: 'Scale',
    price: '₹1990',
    period: 'for 30 products',
    desc: 'For high-volume sellers',
    features: ['30 products (save 33%)', '240 AI-generated images', '4 studio + 4 lifestyle each', 'Fastest processing', 'Dashboard access', 'GST invoice', 'Priority support'],
    cta: 'Scale Your Store',
    href: '/tool',
    highlighted: false,
  },
];

function animateCounter(el, target, prefix, suffix, duration = 1400) {
  const start = Date.now();
  const end = start + duration;
  const tick = () => {
    const now = Date.now();
    const remaining = Math.max(end - now, 0);
    const progress = 1 - remaining / duration;
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(eased * target);
    el.textContent = prefix + current.toLocaleString('en-IN') + suffix;
    if (remaining > 0) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export default function Landing() {
  const { user } = useAuth();

  useEffect(() => {
    document.body.style.background = '#fff';
    return () => { document.body.style.background = ''; };
  }, []);

  // Scroll-triggered reveals
  useEffect(() => {
    const revealObserver = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible');
      }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
    return () => revealObserver.disconnect();
  }, []);

  // Animated counters
  useEffect(() => {
    const counterObserver = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          const el = e.target;
          const target = parseInt(el.dataset.target);
          const prefix = el.dataset.prefix || '';
          const suffix = el.dataset.suffix || '';
          animateCounter(el, target, prefix, suffix);
          counterObserver.unobserve(el);
        }
      }),
      { threshold: 0.5 }
    );
    document.querySelectorAll('.counter-num').forEach(el => counterObserver.observe(el));
    return () => counterObserver.disconnect();
  }, []);

  return (
    <div className="landing">

      {/* ── Nav ── */}
      <nav className="l-nav">
        <div className="l-nav-inner">
          <div className="l-logo">
            <span className="l-logo-mark">✦</span>
            <span>SellerStudio</span>
          </div>
          <div className="l-nav-links">
            <Link to="/pricing">Pricing</Link>
            {user ? (
              <Link to="/dashboard">Dashboard</Link>
            ) : (
              <Link to="/login">Login</Link>
            )}
            <Link to="/tool" className="l-nav-cta">Try Free →</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="l-hero">
        <div className="l-hero-content">
          <div className="l-hero-badge">Built for Amazon · Flipkart · Meesho sellers</div>
          <h1 className="l-hero-headline">
            Your Products Deserve<br />
            <span className="l-gradient-text">Professional Photos.</span><br />
            Your Budget Disagrees.
          </h1>
          <p className="l-hero-sub">
            Upload any raw product image — even a phone photo — and get{' '}
            <strong>8 catalog-ready images</strong> in minutes. Studio shots. Lifestyle shots.
            Zero photoshoot cost.
          </p>
          <div className="l-hero-actions">
            <Link to="/tool" className="l-btn-primary l-btn-glow">
              Try it Free — 1 generation on us
            </Link>
            <Link to="/pricing" className="l-btn-ghost">See pricing →</Link>
          </div>
          <p className="l-hero-footnote">Takes ~4 minutes · ₹99/product after free trial</p>
        </div>

        {/* Browser-style mockup */}
        <div className="l-hero-mockup-wrap">
          <div className="l-hero-mockup">
            <div className="l-mockup-bar">
              <div className="l-mockup-dot l-mockup-dot-r" />
              <div className="l-mockup-dot l-mockup-dot-y" />
              <div className="l-mockup-dot l-mockup-dot-g" />
              <div className="l-mockup-title">SellerStudio — AI Product Image Generator</div>
            </div>
            <div className="l-mockup-body">
              <div className="l-mockup-left">
                <div className="l-mockup-upload">
                  <div className="l-mockup-upload-icon">📷</div>
                  <div className="l-mockup-upload-text">Drop product photo here</div>
                  <div className="l-mockup-upload-hint">PNG · JPG · WEBP · Max 10MB</div>
                </div>
                <div className="l-mockup-input">e.g. "Matte Black Ceramic Coffee Mug"</div>
                <div className="l-mockup-btn">✦ Generate 8 Images</div>
              </div>
              <div className="l-mockup-right">
                <div className="l-mockup-section-label">Studio Shots</div>
                <div className="l-mockup-grid">
                  {['#f0ecf8', '#fdf0ff', '#f0f4ef', '#faf5f0'].map((bg, i) => (
                    <div key={i} className="l-mockup-card" style={{ background: bg, animationDelay: `${i * 0.3}s` }}>
                      <span>Studio</span>
                    </div>
                  ))}
                </div>
                <div className="l-mockup-section-label" style={{ marginTop: 12 }}>Lifestyle Shots</div>
                <div className="l-mockup-grid">
                  {['#f0ecf8', '#fdf0f5', '#f0f5f2', '#fdf0ff'].map((bg, i) => (
                    <div key={i} className="l-mockup-card" style={{ background: bg, animationDelay: `${(i + 4) * 0.3}s` }}>
                      <span>Lifestyle</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof Bar ── */}
      <section className="l-social-proof">
        <p className="l-sp-text">
          Over <strong>500+ sellers</strong> trust SellerStudio to list on
        </p>
        <div className="l-sp-logos">
          {MARKETPLACES.map((m, i) => (
            <div key={i} className="l-sp-logo">{m}</div>
          ))}
        </div>
      </section>

      {/* ── Features 2×2 ── */}
      <section className="l-section l-features-section">
        <div className="l-section-inner">
          <div className="l-eyebrow reveal">Why SellerStudio</div>
          <h2 className="l-section-title reveal">
            Everything you need to win on marketplace listings
          </h2>
          <div className="l-features-2x2">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="l-feature-card reveal"
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <div className="l-feature-screenshot" style={{ background: f.color }}>
                  <div className="l-feature-screenshot-inner">
                    <div className="l-feature-icon-badge" style={{ background: f.accent + '22', border: `1px solid ${f.accent}33` }}>
                      <span className="l-feature-icon">{f.icon}</span>
                    </div>
                    <div className="l-feature-mini-ui">
                      <div className="l-mini-bar" style={{ background: f.accent }} />
                      <div className="l-mini-bar l-mini-bar-short" style={{ background: f.accent }} />
                      <div className="l-mini-row">
                        <div className="l-mini-block" style={{ background: f.accent }} />
                        <div className="l-mini-block" style={{ background: f.accent }} />
                        <div className="l-mini-block" style={{ background: f.accent }} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="l-feature-body">
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard / Manage Section ── */}
      <section className="l-section l-manage-section">
        <div className="l-section-inner">
          <div className="l-eyebrow reveal">Dashboard</div>
          <h2 className="l-section-title reveal">
            Manage, download and reuse all your product images in one place
          </h2>
          <p className="l-section-sub reveal">
            Every generation is saved automatically. Browse all your products, download
            batches, and reuse images anytime — no re-generating needed.
          </p>
          <div className="l-dashboard-mockup reveal">
            <div className="l-dash-sidebar">
              <div className="l-dash-logo">
                <span style={{ color: '#6c5ce7' }}>✦</span> SellerStudio
              </div>
              <div className="l-dash-nav-item l-dash-nav-active">📷 My Photos</div>
              <div className="l-dash-nav-item">👤 Account</div>
              <div className="l-dash-nav-item">🧾 Purchases</div>
            </div>
            <div className="l-dash-content">
              <div className="l-dash-header">
                <div className="l-dash-search" />
                <div className="l-dash-btn">⬇ Download All</div>
              </div>
              <div className="l-dash-grid">
                {[
                  { bg: '#f0ecf8', name: 'Coffee Mug' },
                  { bg: '#fdf0ff', name: 'Ceramic Plate' },
                  { bg: '#f0f4ef', name: 'Yoga Mat' },
                  { bg: '#faf5f0', name: 'Phone Stand' },
                  { bg: '#f0ecf8', name: 'Water Bottle' },
                  { bg: '#fdf0f5', name: 'Desk Lamp' },
                ].map((item, i) => (
                  <div key={i} className="l-dash-card" style={{ background: item.bg }}>
                    <div className="l-dash-card-label">{item.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Highlights 4-col ── */}
      <section className="l-section l-highlights-section">
        <div className="l-section-inner">
          <div className="l-highlights-grid">
            {HIGHLIGHTS.map((h, i) => (
              <div
                key={i}
                className="l-highlight-item reveal"
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <div className="l-highlight-icon">{h.icon}</div>
                <h3 className="l-highlight-title">{h.title}</h3>
                <p className="l-highlight-desc">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Split Section 1: Before & After ── */}
      <section className="l-section l-split-section">
        <div className="l-section-inner l-split-inner">
          <div className="l-split-text reveal">
            <div className="l-eyebrow l-eyebrow-left">Before &amp; After</div>
            <h2 className="l-split-title">
              See your product exactly as buyers will see it
            </h2>
            <p className="l-split-desc">
              Upload any phone photo — even a plain white wall background. Our AI generates
              clean studio shots and lifestyle images that look like a professional photoshoot.
            </p>
            <Link to="/tool" className="l-btn-primary l-split-cta">
              Try it Free
            </Link>
          </div>
          <div className="l-split-visual reveal" style={{ transitionDelay: '0.15s' }}>
            <div className="l-split-card">
              <div className="l-split-top-row">
                <div className="l-split-before">
                  <div className="l-split-label">Your photo</div>
                  <div className="l-split-image-ph">
                    <span>📱</span>
                    <span className="l-split-ph-text">Phone photo</span>
                  </div>
                </div>
                <div className="l-split-arrow-col">
                  <div className="l-split-arrow-line" />
                  <div className="l-split-arrow-tip">→</div>
                  <div className="l-split-arrow-badge">AI</div>
                </div>
                <div className="l-split-after">
                  <div className="l-split-label">8 professional images</div>
                  <div className="l-split-output-grid">
                    {['#f0ecf8', '#fdf0ff', '#f0f4ef', '#faf5f0'].map((bg, i) => (
                      <div key={i} className="l-split-output-card" style={{ background: bg }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Split Section 2: Image Types (reversed) ── */}
      <section className="l-section l-split-section l-split-reverse-section">
        <div className="l-section-inner l-split-inner l-split-inner-reverse">
          <div className="l-split-visual reveal">
            <div className="l-deliverables-mini-wrap">
              <div className="l-deliverable-mini l-deliverable-mini-blue">
                <div className="l-dm-badge">Studio Images</div>
                {['White background', 'Gradient background', '45° angle shot', 'Close-up detail'].map((s, i) => (
                  <div key={i} className="l-dm-item">✓ {s}</div>
                ))}
              </div>
              <div className="l-deliverable-mini l-deliverable-mini-purple">
                <div className="l-dm-badge">Lifestyle Images</div>
                {['Product in use', 'Real context shot', 'Environment lifestyle', 'Hands-on usage'].map((s, i) => (
                  <div key={i} className="l-dm-item">✓ {s}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="l-split-text reveal" style={{ transitionDelay: '0.15s' }}>
            <div className="l-eyebrow l-eyebrow-left">What you get</div>
            <h2 className="l-split-title">
              Get every image type your listing needs
            </h2>
            <p className="l-split-desc">
              Amazon requires minimum 6 images. We give you 8 — 4 clean studio shots and
              4 lifestyle images that build trust with buyers and dramatically increase
              conversions.
            </p>
            <Link to="/tool" className="l-btn-primary l-split-cta">
              Generate My Images
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats Row ── */}
      <section className="l-section l-stats-section">
        <div className="l-section-inner">
          <div className="l-pain-stat reveal">
            {STATS.map((s, i) => (
              <Fragment key={i}>
                <div className="l-stat">
                  {s.target != null ? (
                    <span
                      className="l-stat-num counter-num"
                      data-target={s.target}
                      data-prefix={s.prefix}
                      data-suffix={s.suffix}
                    >
                      {s.prefix}0{s.suffix}
                    </span>
                  ) : (
                    <span className="l-stat-num">{s.raw}</span>
                  )}
                  <span className="l-stat-label">{s.label}</span>
                </div>
                {i < STATS.length - 1 && <div className="l-stat-divider" />}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing 3-col ── */}
      <section className="l-section l-pricing-lp-section">
        <div className="l-section-inner">
          <div className="l-eyebrow reveal">Pricing</div>
          <h2 className="l-section-title reveal">Simple pricing. Pay only when you need it.</h2>
          <p className="l-section-sub reveal">
            Start free with 1 generation. No credit card required.
          </p>
          <div className="l-pricing-grid">
            {PRICING_TIERS.map((tier, i) => (
              <div
                key={i}
                className={`l-pricing-tier reveal ${tier.highlighted ? 'l-pricing-highlighted' : ''}`}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                {tier.highlighted && (
                  <div className="l-pricing-popular-badge">Most Popular</div>
                )}
                <div className="l-pricing-tier-name">{tier.name}</div>
                <div className="l-pricing-tier-price">{tier.price}</div>
                <div className="l-pricing-tier-period">{tier.period}</div>
                <p className="l-pricing-tier-desc">{tier.desc}</p>
                <ul className="l-pricing-tier-features">
                  {tier.features.map((f, j) => (
                    <li key={j}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to={tier.href}
                  className={`l-pricing-tier-cta ${tier.highlighted ? 'l-pricing-cta-white' : 'l-pricing-cta-purple'}`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="l-pricing-footnote reveal">
            Need bulk pricing for large catalogues?{' '}
            <Link to="/pricing">View full pricing →</Link>
          </p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="l-final-cta">
        <div className="l-cta-box">
          <h2 className="reveal">Ready to transform your listings?</h2>
          <p className="reveal">Your first generation is completely free. No card. No signup.</p>
          <Link to="/tool" className="l-btn-primary l-btn-large l-btn-glow reveal">
            Generate My Product Images →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="l-footer">
        <div className="l-footer-inner">
          <div className="l-logo l-footer-logo">
            <span className="l-logo-mark">✦</span>
            <span>SellerStudio</span>
          </div>
          <div className="l-footer-links">
            <Link to="/pricing">Pricing</Link>
            <Link to="/tool">Try Free</Link>
            {user ? (
              <Link to="/dashboard">Dashboard</Link>
            ) : (
              <Link to="/login">Login</Link>
            )}
          </div>
          <p className="l-footer-copy">© 2026 SellerStudio. Built for marketplace sellers.</p>
        </div>
      </footer>
    </div>
  );
}
