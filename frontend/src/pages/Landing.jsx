import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';

const STEPS = [
  {
    num: '01',
    title: 'Upload any product photo',
    desc: 'A phone photo works perfectly. No professional camera needed — just make sure your product is visible.',
  },
  {
    num: '02',
    title: 'Enter the product name',
    desc: 'Be specific — "Matte Black Ceramic Coffee Mug" works better than just "mug". Our AI uses this to understand context.',
  },
  {
    num: '03',
    title: 'Get 8 ready-to-list images',
    desc: '4 clean studio shots + 4 real-world in-use images. Download and upload directly to Amazon, Flipkart, or Meesho.',
  },
];

const PAIN_POINTS = [
  { icon: '📦', text: 'You have products in small quantities — a full photoshoot isn\'t worth it' },
  { icon: '💸', text: 'Professional shoots cost ₹5,000–₹20,000 and take days to deliver' },
  { icon: '📉', text: 'Your competitor\'s listing looks better just because of photography' },
  { icon: '⏳', text: 'You need to list fast — waiting for a photographer slows you down' },
];

const DELIVERABLES = [
  { type: 'Ecommerce', color: 'blue', shots: ['Clean white background', 'Soft gradient background', '45° angle studio shot', 'Close-up detail shot'] },
  { type: 'In-Use', color: 'purple', shots: ['Product being actively used', 'Installed in real context', 'Lifestyle environment shot', 'Hands-on usage shot'] },
];

export default function Landing() {
  useEffect(() => {
    document.body.style.background = '#ffffff';
    return () => { document.body.style.background = ''; };
  }, []);

  return (
    <div className="landing">
      {/* Nav */}
      <nav className="l-nav">
        <div className="l-nav-inner">
          <div className="l-logo">
            <span className="l-logo-mark">✦</span>
            <span>CatalogAI</span>
          </div>
          <div className="l-nav-links">
            <Link to="/pricing">Pricing</Link>
            <Link to="/tool" className="l-nav-cta">Try Free →</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="l-hero">
        <div className="l-hero-badge">Built for Amazon · Flipkart · Meesho sellers</div>
        <h1 className="l-hero-headline">
          Your Products Deserve<br />
          <span className="l-gradient-text">Professional Photos.</span><br />
          Your Budget Disagrees.
        </h1>
        <p className="l-hero-sub">
          Upload any raw product image — even a phone photo — and get <strong>8 catalog-ready images</strong> in minutes.
          Studio shots. Lifestyle shots. Zero photoshoot cost.
        </p>
        <div className="l-hero-actions">
          <Link to="/tool" className="l-btn-primary">Try it Free — 1 generation on us</Link>
          <Link to="/pricing" className="l-btn-ghost">See pricing →</Link>
        </div>
        <p className="l-hero-footnote">No signup needed · Takes ~4 minutes · ₹199/product after free trial</p>

        {/* Visual */}
        <div className="l-hero-visual">
          <div className="l-visual-before">
            <div className="l-visual-label">Your photo</div>
            <div className="l-raw-image">
              <div className="l-raw-inner">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>Raw product photo</span>
              </div>
            </div>
          </div>

          <div className="l-visual-arrow">
            <div className="l-arrow-line"/>
            <div className="l-arrow-label">AI Magic</div>
          </div>

          <div className="l-visual-after">
            <div className="l-visual-label">8 professional images</div>
            <div className="l-output-grid">
              {['#f0f4ff','#f5f0ff','#f0fff4','#fff8f0','#f0f4ff','#fff0f5','#f0fffc','#fdf0ff'].map((bg, i) => (
                <div key={i} className="l-output-card" style={{ background: bg }}>
                  <div className="l-output-tag">{i < 4 ? 'Studio' : 'Lifestyle'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="l-section l-pain">
        <div className="l-section-inner">
          <div className="l-eyebrow">The problem</div>
          <h2 className="l-section-title">Sound familiar?</h2>
          <p className="l-section-sub">Every marketplace seller knows this struggle.</p>
          <div className="l-pain-grid">
            {PAIN_POINTS.map((p, i) => (
              <div key={i} className="l-pain-card">
                <span className="l-pain-icon">{p.icon}</span>
                <p>{p.text}</p>
              </div>
            ))}
          </div>
          <div className="l-pain-stat">
            <div className="l-stat"><span className="l-stat-num">₹5,000+</span><span className="l-stat-label">avg. photoshoot cost</span></div>
            <div className="l-stat-divider"/>
            <div className="l-stat"><span className="l-stat-num">3–5 days</span><span className="l-stat-label">to get photos back</span></div>
            <div className="l-stat-divider"/>
            <div className="l-stat"><span className="l-stat-num">40%+</span><span className="l-stat-label">higher CTR with lifestyle images</span></div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="l-section l-how">
        <div className="l-section-inner">
          <div className="l-eyebrow">How it works</div>
          <h2 className="l-section-title">Three steps. Four minutes. Eight images.</h2>
          <div className="l-steps">
            {STEPS.map((s, i) => (
              <div key={i} className="l-step">
                <div className="l-step-num">{s.num}</div>
                <div className="l-step-content">
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
                {i < STEPS.length - 1 && <div className="l-step-connector"/>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="l-section l-deliverables">
        <div className="l-section-inner">
          <div className="l-eyebrow">What you get</div>
          <h2 className="l-section-title">8 images. Every type you need.</h2>
          <p className="l-section-sub">Amazon requires minimum 6 images. We give you 8 — covering every listing requirement.</p>
          <div className="l-deliverables-grid">
            {DELIVERABLES.map((d, i) => (
              <div key={i} className={`l-deliverable-card l-deliverable-${d.color}`}>
                <div className="l-deliverable-header">
                  <span className={`l-deliverable-badge l-badge-${d.color}`}>{d.type}</span>
                  <span className="l-deliverable-count">4 images</span>
                </div>
                <ul className="l-deliverable-list">
                  {d.shots.map((shot, j) => (
                    <li key={j}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      {shot}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="l-section l-pricing-teaser">
        <div className="l-section-inner">
          <div className="l-eyebrow">Pricing</div>
          <h2 className="l-section-title">Pay only when you need it.</h2>
          <div className="l-pricing-card">
            <div className="l-pricing-compare">
              <div className="l-compare-old">
                <span className="l-compare-label">Traditional photoshoot</span>
                <span className="l-compare-price l-compare-strikethrough">₹5,000 – ₹20,000</span>
                <span className="l-compare-detail">+ 3–5 days wait · 10–15 images max</span>
              </div>
              <div className="l-compare-vs">VS</div>
              <div className="l-compare-new">
                <span className="l-compare-label">CatalogAI</span>
                <span className="l-compare-price l-compare-highlight">₹199 / product</span>
                <span className="l-compare-detail">~4 minutes · 8 catalog-ready images</span>
              </div>
            </div>
            <div className="l-pricing-cta">
              <Link to="/tool" className="l-btn-primary">Start with 1 free generation</Link>
              <Link to="/pricing" className="l-pricing-details-link">View full pricing →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="l-section l-final-cta">
        <div className="l-cta-box">
          <h2>Ready to transform your listings?</h2>
          <p>Your first generation is completely free. No card. No signup.</p>
          <Link to="/tool" className="l-btn-primary l-btn-large">Generate My Product Images →</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="l-footer">
        <div className="l-footer-inner">
          <div className="l-logo">
            <span className="l-logo-mark">✦</span>
            <span>CatalogAI</span>
          </div>
          <div className="l-footer-links">
            <Link to="/pricing">Pricing</Link>
            <Link to="/tool">Try Free</Link>
          </div>
          <p className="l-footer-copy">© 2026 CatalogAI. Built for marketplace sellers.</p>
        </div>
      </footer>
    </div>
  );
}
