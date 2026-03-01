import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import './Dashboard.css';

const TABS = [
  { id: 'photos', label: 'My Photos' },
  { id: 'settings', label: 'Account Settings' },
  { id: 'history', label: 'Purchase History' },
];

const EMPTY_SETTINGS = {
  fullName: '', phone: '', gstNumber: '',
  billingName: '', billingAddress: '', billingCity: '',
  billingState: '', billingPincode: '',
};

function generateInvoiceHTML(purchase, profile, invoiceNumber) {
  const date = purchase.createdAt?.toDate?.() || new Date();
  const dateStr = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  const total = purchase.amount || 0;
  const gstAmount = Math.round(total * 18 / 118);
  const baseAmount = total - gstAmount;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${invoiceNumber} — SellerStudio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; padding: 40px; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .logo { font-size: 1.4rem; font-weight: 800; color: #7c6af5; }
    .logo-sub { font-size: 0.75rem; color: #999; margin-top: 2px; }
    .invoice-meta { text-align: right; }
    .invoice-num { font-size: 1.1rem; font-weight: 700; color: #0f0f1a; }
    .invoice-date { font-size: 0.85rem; color: #666; margin-top: 4px; }
    .divider { height: 1px; background: #e5e5f0; margin: 24px 0; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
    .party-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 8px; }
    .party-name { font-weight: 700; font-size: 1rem; color: #0f0f1a; margin-bottom: 4px; }
    .party-detail { font-size: 0.85rem; color: #555; line-height: 1.6; }
    .gst-num { font-size: 0.8rem; color: #7c6af5; font-weight: 600; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #f8f8fc; padding: 10px 14px; text-align: left; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #999; border-bottom: 1px solid #eee; }
    th:last-child, td:last-child { text-align: right; }
    td { padding: 14px; font-size: 0.9rem; border-bottom: 1px solid #f5f5f8; }
    .totals { margin-left: auto; width: 280px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.88rem; color: #555; }
    .totals-row.total { font-weight: 800; font-size: 1rem; color: #0f0f1a; border-top: 2px solid #e5e5f0; padding-top: 12px; margin-top: 6px; }
    .footer { margin-top: 48px; text-align: center; font-size: 0.78rem; color: #bbb; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">✦ SellerStudio</div>
      <div class="logo-sub">AI Product Image Generator</div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-num">Invoice ${invoiceNumber}</div>
      <div class="invoice-date">${dateStr}</div>
    </div>
  </div>
  <div class="divider"></div>
  <div class="parties">
    <div>
      <div class="party-label">From</div>
      <div class="party-name">SellerStudio</div>
      <div class="party-detail">AI Product Photography Service<br />India</div>
      <div class="gst-num">GSTIN: [Not Registered]</div>
    </div>
    <div>
      <div class="party-label">Bill To</div>
      <div class="party-name">${profile.billingName || profile.fullName || 'Customer'}</div>
      <div class="party-detail">${[profile.billingAddress, profile.billingCity, profile.billingState, profile.billingPincode].filter(Boolean).join(', ') || 'Address not provided'}</div>
      ${profile.gstNumber ? `<div class="gst-num">GSTIN: ${profile.gstNumber}</div>` : ''}
      ${profile.phone ? `<div class="party-detail" style="margin-top:4px">${profile.phone}</div>` : ''}
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty</th>
        <th>Rate</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>AI Product Image Generation Credits<br /><span style="font-size:0.8rem;color:#999">${purchase.credits || 1} product credit(s) · 8 images per product</span></td>
        <td>${purchase.credits || 1}</td>
        <td>₹${baseAmount.toLocaleString('en-IN')}</td>
        <td>₹${baseAmount.toLocaleString('en-IN')}</td>
      </tr>
    </tbody>
  </table>
  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>₹${baseAmount.toLocaleString('en-IN')}</span></div>
    <div class="totals-row"><span>GST @ 18%</span><span>₹${gstAmount.toLocaleString('en-IN')}</span></div>
    <div class="totals-row total"><span>Total</span><span>₹${total.toLocaleString('en-IN')}</span></div>
  </div>
  <div class="footer">Thank you for using SellerStudio · sellerstudio.in</div>
</body>
</html>`;
}

function openInvoice(purchase, profile) {
  const invoiceNumber = `CAI-${(purchase.id || '000000').slice(-6).toUpperCase()}`;
  const html = generateInvoiceHTML(purchase, profile, invoiceNumber);
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('photos');
  const [generations, setGenerations] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [generationsLoading, setGenerationsLoading] = useState(true);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [expandedGen, setExpandedGen] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [isEditingBullets, setIsEditingBullets] = useState(false);
  const [editBullets, setEditBullets] = useState([]);
  const [bulletSaving, setBulletSaving] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login', { replace: true }); return; }
    loadGenerations();
    loadSettings();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'history' && purchases.length === 0 && !purchasesLoading) {
      loadPurchases();
    }
  }, [activeTab]);

  async function loadGenerations() {
    if (!db) { setGenerationsLoading(false); return; }
    try {
      const q = query(collection(db, 'generations'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setGenerations(docs);
    } catch (err) {
      console.error('Failed to load generations:', err);
    } finally {
      setGenerationsLoading(false);
    }
  }

  async function loadPurchases() {
    if (!db) { setPurchasesLoading(false); return; }
    try {
      const q = query(collection(db, 'purchases'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPurchases(docs);
    } catch (err) {
      console.error('Failed to load purchases:', err);
    } finally {
      setPurchasesLoading(false);
    }
  }

  async function loadSettings() {
    if (!db) { setSettingsLoading(false); return; }
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) setSettings({ ...EMPTY_SETTINGS, ...snap.data() });
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    if (!db) return;
    setSettingsSaving(true);
    setSettingsSaved(false);
    try {
      await setDoc(doc(db, 'users', user.uid), settings, { merge: true });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSettingsSaving(false);
    }
  }

  function downloadAllImages(gen) {
    const urls = (gen.imageUrls || []).filter(Boolean);
    urls.forEach((url, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${gen.productName}_${i + 1}.png`;
        a.target = '_blank';
        a.rel = 'noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 350);
    });
  }

  async function handleRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === expandedGen.productName) { setIsRenaming(false); return; }
    setRenameSaving(true);
    try {
      await updateDoc(doc(db, 'generations', expandedGen.id), { productName: trimmed });
      const updated = { ...expandedGen, productName: trimmed };
      setExpandedGen(updated);
      setGenerations(prev => prev.map(g => g.id === expandedGen.id ? { ...g, productName: trimmed } : g));
      setIsRenaming(false);
    } catch (err) {
      console.error('Failed to rename:', err);
    } finally {
      setRenameSaving(false);
    }
  }

  async function saveBulletEdits() {
    setBulletSaving(true);
    try {
      await updateDoc(doc(db, 'generations', expandedGen.id), { bulletPoints: editBullets });
      setGenerations(prev => prev.map(g => g.id === expandedGen.id ? { ...g, bulletPoints: editBullets } : g));
      setExpandedGen(prev => ({ ...prev, bulletPoints: editBullets }));
      setIsEditingBullets(false);
    } catch (err) {
      console.error('Failed to save bullet points:', err);
    } finally {
      setBulletSaving(false);
    }
  }

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Account';

  return (
    <div className="dash-page">
      {/* Nav */}
      <nav className="dash-nav">
        <div className="dash-nav-inner">
          <Link to="/" className="dash-logo">
            <span className="dash-logo-mark">✦</span>
            <span>SellerStudio</span>
          </Link>
          <div className="dash-nav-right">
            <Link to="/tool" className="dash-nav-tool">+ Generate Images</Link>
            <div className="dash-user-pill">
              <span className="dash-user-avatar">{displayName[0].toUpperCase()}</span>
              <span className="dash-user-name">{displayName}</span>
            </div>
            <button className="dash-logout" onClick={handleLogout}>Log Out</button>
          </div>
        </div>
      </nav>

      {/* Tabs */}
      <div className="dash-tabs-bar">
        <div className="dash-tabs-inner">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`dash-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
              {t.id === 'photos' && generations.length > 0 && (
                <span className="dash-tab-count">{generations.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="dash-main">
        {/* My Photos */}
        {activeTab === 'photos' && (
          <div className="dash-photos">
            <div className="dash-section-header">
              <h2>My Photos</h2>
              <p>All your generated product images, saved to your account.</p>
            </div>
            {generationsLoading ? (
              <div className="dash-loading">
                <div className="dash-spinner" />
                <span>Loading your photos...</span>
              </div>
            ) : generations.length === 0 ? (
              <div className="dash-empty">
                <div className="dash-empty-icon">🖼️</div>
                <h3>No photos yet</h3>
                <p>Generate your first product images and they'll appear here.</p>
                <Link to="/tool" className="dash-empty-cta">Generate Images →</Link>
              </div>
            ) : (
              <div className="dash-gen-grid">
                {generations.map(gen => (
                  <div key={gen.id} className="dash-gen-card" onClick={() => { setExpandedGen(gen); setIsEditingBullets(false); setEditBullets(gen.bulletPoints || []); }}>
                    <div className="dash-gen-thumb">
                      {gen.imageUrls?.[0] ? (
                        <img src={gen.imageUrls[0]} alt={gen.productName} />
                      ) : (
                        <div className="dash-gen-placeholder">🖼️</div>
                      )}
                      <div className="dash-gen-overlay">
                        <span>View all {gen.imageUrls?.filter(Boolean).length || 0} images</span>
                      </div>
                    </div>
                    <div className="dash-gen-info">
                      <p className="dash-gen-name">{gen.productName}</p>
                      <p className="dash-gen-date">
                        {gen.createdAt?.toDate?.()?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) || '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Account Settings */}
        {activeTab === 'settings' && (
          <div className="dash-settings">
            <div className="dash-section-header">
              <h2>Account Settings</h2>
              <p>Billing details are used on GST invoices for your purchases.</p>
            </div>
            {settingsLoading ? (
              <div className="dash-loading">
                <div className="dash-spinner" />
                <span>Loading settings...</span>
              </div>
            ) : (
              <form className="dash-settings-form" onSubmit={saveSettings}>
                <div className="dash-form-section">
                  <h3>Profile</h3>
                  <div className="dash-form-grid">
                    <div className="dash-field">
                      <label>Full Name</label>
                      <input type="text" placeholder="Your full name" value={settings.fullName}
                        onChange={e => setSettings(s => ({ ...s, fullName: e.target.value }))} />
                    </div>
                    <div className="dash-field">
                      <label>Phone Number</label>
                      <input type="tel" placeholder="+91 98765 43210" value={settings.phone}
                        onChange={e => setSettings(s => ({ ...s, phone: e.target.value }))} />
                    </div>
                    <div className="dash-field">
                      <label>GST Number (optional)</label>
                      <input type="text" placeholder="22AAAAA0000A1Z5" value={settings.gstNumber}
                        onChange={e => setSettings(s => ({ ...s, gstNumber: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div className="dash-form-section">
                  <h3>Billing Address</h3>
                  <div className="dash-form-grid">
                    <div className="dash-field dash-field-full">
                      <label>Billing Name</label>
                      <input type="text" placeholder="Name for invoice" value={settings.billingName}
                        onChange={e => setSettings(s => ({ ...s, billingName: e.target.value }))} />
                    </div>
                    <div className="dash-field dash-field-full">
                      <label>Address</label>
                      <input type="text" placeholder="Street address" value={settings.billingAddress}
                        onChange={e => setSettings(s => ({ ...s, billingAddress: e.target.value }))} />
                    </div>
                    <div className="dash-field">
                      <label>City</label>
                      <input type="text" placeholder="Mumbai" value={settings.billingCity}
                        onChange={e => setSettings(s => ({ ...s, billingCity: e.target.value }))} />
                    </div>
                    <div className="dash-field">
                      <label>State</label>
                      <input type="text" placeholder="Maharashtra" value={settings.billingState}
                        onChange={e => setSettings(s => ({ ...s, billingState: e.target.value }))} />
                    </div>
                    <div className="dash-field">
                      <label>Pincode</label>
                      <input type="text" placeholder="400001" value={settings.billingPincode}
                        onChange={e => setSettings(s => ({ ...s, billingPincode: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div className="dash-form-actions">
                  <button type="submit" className="dash-save-btn" disabled={settingsSaving}>
                    {settingsSaving ? 'Saving...' : 'Save Settings'}
                  </button>
                  {settingsSaved && <span className="dash-saved-msg">✓ Saved</span>}
                </div>
              </form>
            )}
          </div>
        )}

        {/* Purchase History */}
        {activeTab === 'history' && (
          <div className="dash-history">
            <div className="dash-section-header">
              <h2>Purchase History</h2>
              <p>All your credit purchases. Download invoices for GST records.</p>
            </div>
            {purchasesLoading ? (
              <div className="dash-loading">
                <div className="dash-spinner" />
                <span>Loading purchases...</span>
              </div>
            ) : purchases.length === 0 ? (
              <div className="dash-empty">
                <div className="dash-empty-icon">🧾</div>
                <h3>No purchases yet</h3>
                <p>Your credit purchase history will appear here.</p>
                <Link to="/pricing" className="dash-empty-cta">View Pricing →</Link>
              </div>
            ) : (
              <div className="dash-purchase-list">
                {purchases.map(p => {
                  const date = p.createdAt?.toDate?.()?.toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  }) || '—';
                  return (
                    <div key={p.id} className="dash-purchase-item">
                      <div className="dash-purchase-left">
                        <p className="dash-purchase-desc">
                          {p.credits || 1} product credit{(p.credits || 1) > 1 ? 's' : ''} · 8 images each
                        </p>
                        <p className="dash-purchase-date">{date}</p>
                      </div>
                      <div className="dash-purchase-right">
                        <span className="dash-purchase-amount">₹{(p.amount || 0).toLocaleString('en-IN')}</span>
                        <button
                          className="dash-invoice-btn"
                          onClick={() => openInvoice(p, settings)}
                        >
                          Download Invoice
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Photo Expand Modal */}
      {expandedGen && (
        <div className="dash-modal-overlay" onClick={() => { setExpandedGen(null); setIsRenaming(false); }}>
          <div className="dash-modal" onClick={e => e.stopPropagation()}>
            <div className="dash-modal-header">
              <div className="dash-modal-title">
                {isRenaming ? (
                  <>
                    <input
                      className="dash-rename-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename();
                        if (e.key === 'Escape') setIsRenaming(false);
                      }}
                      autoFocus
                      disabled={renameSaving}
                    />
                    <button className="dash-rename-confirm" onClick={handleRename} disabled={renameSaving}>
                      {renameSaving ? '…' : '✓'}
                    </button>
                    <button className="dash-rename-cancel" onClick={() => setIsRenaming(false)}>✕</button>
                  </>
                ) : (
                  <>
                    <h3>{expandedGen.productName}</h3>
                    <button
                      className="dash-rename-trigger"
                      onClick={() => { setRenameValue(expandedGen.productName); setIsRenaming(true); }}
                      title="Rename product"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </>
                )}
              </div>
              <div className="dash-modal-header-actions">
                <button className="dash-dl-all-btn" onClick={() => downloadAllImages(expandedGen)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Download All
                </button>
                <button className="dash-modal-close" onClick={() => { setExpandedGen(null); setIsRenaming(false); }}>✕</button>
              </div>
            </div>
            <div className="dash-modal-grid">
              {(expandedGen.imageUrls || []).map((url, i) => url ? (
                <div key={i} className="dash-modal-img-wrap">
                  <img src={url} alt={`${expandedGen.productName} ${i + 1}`} />
                  <a href={url} download={`${expandedGen.productName}_${i + 1}.png`} target="_blank" rel="noreferrer"
                    className="dash-modal-dl">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </a>
                </div>
              ) : null)}
            </div>

            {/* Bullet Points Section */}
            <div className="dash-bullets-section">
              <div className="dash-bullets-header">
                <div className="dash-bullets-title-row">
                  <span>📝</span>
                  <h4>Product Description</h4>
                </div>
                {!isEditingBullets && expandedGen.bulletPoints?.length > 0 && (
                  <button className="dash-bullets-edit-btn" onClick={() => { setEditBullets(expandedGen.bulletPoints); setIsEditingBullets(true); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Edit
                  </button>
                )}
              </div>

              {isEditingBullets ? (
                <div className="dash-bullets-edit">
                  {editBullets.map((b, i) => (
                    <textarea
                      key={i}
                      className="dash-bullet-textarea"
                      value={b}
                      onChange={e => { const n = [...editBullets]; n[i] = e.target.value; setEditBullets(n); }}
                    />
                  ))}
                  <div className="dash-bullets-edit-actions">
                    <button className="dash-bullets-save-btn" onClick={saveBulletEdits} disabled={bulletSaving}>
                      {bulletSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button className="dash-bullets-cancel-btn" onClick={() => setIsEditingBullets(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : expandedGen.bulletPoints?.length > 0 ? (
                <ul className="dash-bullets-list">
                  {expandedGen.bulletPoints.map((b, i) => (
                    <li key={i}>
                      <span className="dash-bullet-num">{i + 1}</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dash-bullets-empty">No description bullets for this product.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
