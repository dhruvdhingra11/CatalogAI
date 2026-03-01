import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';
import './Pricing.css';

const INCLUDES = [
  '8 AI-generated images per product',
  '4 ecommerce studio shots (white/gradient backgrounds)',
  '4 in-use lifestyle images (real-world context)',
  'High-resolution PNG downloads',
  'Ready to upload on Amazon, Flipkart & Meesho',
  'Powered by Google Gemini AI',
];

const FAQS = [
  {
    q: 'What kind of product image should I upload?',
    a: 'Any clear photo of your product works — even a phone camera shot. The better your input image, the better the output. Make sure the product is fully visible and well-lit.',
  },
  {
    q: 'What does "In-Use" style mean?',
    a: 'Instead of placing your product randomly in a lifestyle setting, our AI figures out exactly how your product is used and shows it in that exact real-world context — a door knob on a door, headphones on a person, a bottle being poured.',
  },
  {
    q: 'Can I use these images directly on Amazon or Flipkart?',
    a: 'Yes. The images are generated at high resolution and can be used directly on any marketplace listing. The ecommerce shots meet Amazon\'s white background requirements.',
  },
  {
    q: 'Do credits expire?',
    a: 'No. Credits never expire. Buy once, use whenever you need.',
  },
  {
    q: 'What if I am unhappy with the results?',
    a: 'AI-generated images can vary. If results are not satisfactory, you can regenerate with a more specific product name. We are working on a regeneration policy — reach out to us.',
  },
  {
    q: 'Is there a subscription?',
    a: 'No subscription. Pay as you go — buy credits only when you need them.',
  },
];

const PACKS = [
  {
    name: 'Starter',
    products: 1,
    price: 99,
    pricePerProduct: 99,
    highlight: false,
    badge: null,
  },
  {
    name: 'Growth',
    products: 10,
    price: 790,
    pricePerProduct: 79,
    highlight: true,
    badge: 'Most Popular',
  },
  {
    name: 'Scale',
    products: 30,
    price: 1990,
    pricePerProduct: 66,
    highlight: false,
    badge: 'Best Value',
  },
];

export default function Pricing() {
  useEffect(() => {
    document.body.style.background = '#fff';
    return () => { document.body.style.background = ''; };
  }, []);

  return (
    <div className="pricing-page">
      {/* Nav */}
      <nav className="l-nav">
        <div className="l-nav-inner">
          <Link to="/" className="l-logo" style={{ textDecoration: 'none' }}>
            <span className="l-logo-mark">✦</span>
            <span>SellerStudio</span>
          </Link>
          <div className="l-nav-links">
            <Link to="/">Home</Link>
            <Link to="/tool" className="l-nav-cta">Try Free →</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="p-hero">
        <div className="l-eyebrow" style={{ textAlign: 'center' }}>Pricing</div>
        <h1 className="p-hero-title">Simple, transparent pricing.</h1>
        <p className="p-hero-sub">
          Pay per product. No subscription. No hidden fees.<br />
          Start with <strong>1 free generation</strong> — no card required.
        </p>
      </section>

      {/* Packs */}
      <section className="p-packs-section">
        <div className="p-packs-inner">
          <div className="p-packs-grid">
            {PACKS.map((pack, i) => (
              <div key={i} className={`p-pack-card ${pack.highlight ? 'p-pack-highlight' : ''}`}>
                {pack.badge && <div className={`p-pack-badge ${pack.highlight ? 'p-badge-primary' : 'p-badge-secondary'}`}>{pack.badge}</div>}
                <div className="p-pack-name">{pack.name}</div>
                <div className="p-pack-products">{pack.products} {pack.products === 1 ? 'product' : 'products'}</div>
                <div className="p-pack-price">
                  <span className="p-price-currency">₹</span>
                  <span className="p-price-amount">{pack.price.toLocaleString('en-IN')}</span>
                </div>
                <div className="p-pack-per">₹{pack.pricePerProduct}/product</div>
                {pack.products > 1 && (
                  <div className="p-pack-saving">
                    Save ₹{((99 - pack.pricePerProduct) * pack.products).toLocaleString('en-IN')} vs single
                  </div>
                )}
                <div className="p-pack-divider"/>
                <ul className="p-pack-features">
                  <li>✓ {pack.products * 8} total images</li>
                  <li>✓ {pack.products * 4} ecommerce shots</li>
                  <li>✓ {pack.products * 4} in-use lifestyle shots</li>
                  <li>✓ Credits never expire</li>
                </ul>
                <Link
                  to="/tool"
                  className={`p-pack-cta ${pack.highlight ? 'p-cta-primary' : 'p-cta-secondary'}`}
                >
                  {pack.products === 1 ? 'Try Free First →' : 'Get Started →'}
                </Link>
              </div>
            ))}
          </div>

          {/* Free trial note */}
          <div className="p-free-note">
            <span>🎁</span>
            <p>New here? Try the tool completely free — <strong>1 full generation included</strong>. No card, no signup.</p>
            <Link to="/tool">Generate now →</Link>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="p-includes-section">
        <div className="p-includes-inner">
          <h2 className="p-includes-title">Every credit includes</h2>
          <div className="p-includes-grid">
            {INCLUDES.map((item, i) => (
              <div key={i} className="p-include-item">
                <div className="p-include-check">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c6af5" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compare */}
      <section className="p-compare-section">
        <div className="p-compare-inner">
          <h2 className="p-compare-title">Still thinking about it?</h2>
          <div className="p-compare-table">
            <div className="p-compare-row p-compare-header">
              <div/>
              <div>Traditional Photoshoot</div>
              <div className="p-compare-our">SellerStudio</div>
            </div>
            {[
              ['Cost per product', '₹5,000 – ₹20,000', '₹99'],
              ['Time to get images', '3–5 days', '~4 minutes'],
              ['Images per product', '10–15', '8 catalog-ready'],
              ['Ecommerce + Lifestyle', 'Extra cost', 'Included'],
              ['Need to schedule', 'Yes', 'No — on demand'],
              ['Works for 1 unit', 'Not worth it', 'Perfect for it'],
            ].map(([label, bad, good], i) => (
              <div key={i} className="p-compare-row">
                <div className="p-compare-label">{label}</div>
                <div className="p-compare-bad">{bad}</div>
                <div className="p-compare-good">{good}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="p-faq-section">
        <div className="p-faq-inner">
          <h2 className="p-faq-title">Frequently asked questions</h2>
          <div className="p-faq-list">
            {FAQS.map((faq, i) => (
              <div key={i} className="p-faq-item">
                <h3>{faq.q}</h3>
                <p>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="p-final-cta">
        <h2>Start with a free generation.</h2>
        <p>No card. No signup. See the quality yourself.</p>
        <Link to="/tool" className="l-btn-primary l-btn-large">Try it Free →</Link>
      </section>

      {/* Footer */}
      <footer className="l-footer">
        <div className="l-footer-inner">
          <div className="l-logo">
            <span className="l-logo-mark">✦</span>
            <span>SellerStudio</span>
          </div>
          <div className="l-footer-links">
            <Link to="/">Home</Link>
            <Link to="/tool">Try Free</Link>
          </div>
          <p className="l-footer-copy">© 2026 SellerStudio. Built for marketplace sellers.</p>
        </div>
      </footer>
    </div>
  );
}
