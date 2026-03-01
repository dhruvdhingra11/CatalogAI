import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './APlus.css';

const apiBase = import.meta.env.VITE_API_URL || '';

const MODULE_META = {
  banner:   { label: 'Brand Banner',    dims: '970 × 300 px', wide: true },
  hero:     { label: 'Hero Lifestyle',  dims: '970 × 600 px', wide: true },
  feature1: { label: 'Feature Card 1',  dims: '300 × 300 px', wide: false },
  feature2: { label: 'Feature Card 2',  dims: '300 × 300 px', wide: false },
  feature3: { label: 'Feature Card 3',  dims: '300 × 300 px', wide: false },
};

const MODULE_ORDER = ['banner', 'hero', 'feature1', 'feature2', 'feature3'];

export default function APlus() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [images, setImages]           = useState([]);
  const [previews, setPreviews]       = useState([]);
  const [logoFile, setLogoFile]       = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [productTitle, setProductTitle] = useState('');
  const [brandName, setBrandName]     = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus]           = useState('idle'); // idle|generating|done|error
  const [modules, setModules]         = useState({});     // { banner, hero, feature1, feature2, feature3 } → base64
  const [copy, setCopy]               = useState(null);
  const [currentModule, setCurrentModule] = useState(null);
  const [error, setError]             = useState(null);
  const [dragOver, setDragOver]       = useState(false);
  const [saveStatus, setSaveStatus]   = useState(null);   // null|saving|saved|error
  const [copiedKey, setCopiedKey]     = useState(null);
  const fileInputRef                  = useRef(null);
  const logoInputRef                  = useRef(null);
  const modulesRef                    = useRef({});
  const copyRef                       = useRef(null);

  // Pre-fill from tool page via sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('aplusPreFill');
    if (!stored) return;
    try {
      const { productTitle: t, bulletPoints, imageBase64List } = JSON.parse(stored);
      sessionStorage.removeItem('aplusPreFill');
      if (t) setProductTitle(t);
      if (bulletPoints?.length) setDescription(bulletPoints.join('\n'));
      if (imageBase64List?.length) {
        const files = imageBase64List.map((b64, i) => {
          const byteArr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const blob = new Blob([byteArr], { type: 'image/png' });
          return new File([blob], `generated-${i + 1}.png`, { type: 'image/png' });
        });
        setImages(files);
        setPreviews(files.map(f => URL.createObjectURL(f)));
      }
    } catch (_) { /* ignore */ }
  }, []);

  const addFiles = (newFiles) => {
    const valid = Array.from(newFiles).filter(f => f.type.startsWith('image/'));
    setImages(prev => {
      const combined = [...prev, ...valid].slice(0, 4);
      setPreviews(combined.map(f => URL.createObjectURL(f)));
      return combined;
    });
  };

  const removeImage = (idx) => {
    setImages(prev => {
      const next = prev.filter((_, i) => i !== idx);
      setPreviews(next.map(f => URL.createObjectURL(f)));
      return next;
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleGenerate = async () => {
    if (!user) { navigate('/login', { state: { from: '/aplus' } }); return; }
    if (images.length < 3) return setError('Please upload at least 3 product images.');
    if (!productTitle.trim()) return setError('Product title is required.');
    if (!brandName.trim()) return setError('Brand name is required.');

    setStatus('generating');
    setError(null);
    setModules({});
    modulesRef.current = {};
    setCopy(null);
    copyRef.current = null;
    setCurrentModule('copy');

    try {
      const formData = new FormData();
      images.forEach(f => formData.append('images', f));
      if (logoFile) formData.append('logo', logoFile);
      formData.append('productTitle', productTitle.trim());
      formData.append('brandName', brandName.trim());
      formData.append('description', description.trim());

      const response = await fetch(`${apiBase}/api/generate-aplus`, { method: 'POST', body: formData });
      if (!response.ok) { const t = await response.text(); throw new Error(t || 'Server error'); }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const data = JSON.parse(jsonStr);
            if (data.type === 'started') {
              setCurrentModule('copy');
            } else if (data.type === 'aplus_copy') {
              copyRef.current = data.copy;
              setCopy(data.copy);
              setCurrentModule('banner');
            } else if (data.type === 'aplus_image') {
              if (data.imageData) {
                modulesRef.current[data.module] = data.imageData;
                setModules(prev => ({ ...prev, [data.module]: data.imageData }));
              }
              // Advance to next module indicator
              const idx = MODULE_ORDER.indexOf(data.module);
              const next = MODULE_ORDER[idx + 1];
              setCurrentModule(next || null);
            } else if (data.type === 'error') {
              setError(data.error);
              setStatus('error');
            } else if (data.type === 'done') {
              setStatus('done');
              setCurrentModule(null);
            }
          } catch (_) { /* skip */ }
        }
      }
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const downloadModule = (key) => {
    const imageData = modules[key];
    if (!imageData) return;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${imageData}`;
    link.download = `${productTitle.replace(/\s+/g, '_')}_aplus_${key}.png`;
    link.click();
  };

  const downloadAll = async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const folder = zip.folder(`${productTitle.replace(/\s+/g, '_')}_APlus`);
    for (const key of MODULE_ORDER) {
      if (modules[key]) {
        const blob = await fetch(`data:image/png;base64,${modules[key]}`).then(r => r.blob());
        folder.file(`${key}.png`, blob);
      }
    }
    if (copy) {
      const copyText = JSON.stringify(copy, null, 2);
      folder.file('copy.json', copyText);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${productTitle.replace(/\s+/g, '_')}_APlus_Content.zip`;
    link.click();
  };

  const handleSave = async () => {
    if (!user) return;
    setSaveStatus('saving');
    try {
      const resp = await fetch(`${apiBase}/api/save-aplus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: user.uid,
          productTitle: productTitle.trim(),
          brandName: brandName.trim(),
          modules: modulesRef.current,
          copy: copyRef.current,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      setSaveStatus('saved');
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('error');
    }
  };

  const handleCopyText = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const readyModules = MODULE_ORDER.filter(k => modules[k]);
  const isGenerating = status === 'generating';
  const isDone = status === 'done';
  const canGenerate = images.length >= 3 && productTitle.trim() && brandName.trim() && !isGenerating;

  return (
    <div className="aplus-page">
      {/* Nav */}
      <nav className="l-nav">
        <div className="l-nav-inner">
          <Link to="/" className="l-logo" style={{ textDecoration: 'none' }}>
            <span className="l-logo-mark">✦</span>
            <span>SellerStudio</span>
          </Link>
          <div className="l-nav-links">
            <div className="l-nav-dropdown">
              <button className="l-nav-dropdown-trigger">Tools ▾</button>
              <div className="l-nav-dropdown-menu">
                <Link to="/tool">🖼 Image + Copy Generator</Link>
                <Link to="/aplus">✦ A+ Listing Generator</Link>
              </div>
            </div>
            <Link to="/pricing">Pricing</Link>
            {user ? (
              <Link to="/dashboard" className="l-nav-cta">Dashboard →</Link>
            ) : (
              <Link to="/login" className="l-nav-cta">Login →</Link>
            )}
          </div>
        </div>
      </nav>

      {/* Header */}
      <header className="aplus-header">
        <div className="aplus-header-badge">Amazon A+ Content</div>
        <h1 className="aplus-header-title">A+ Listing Generator</h1>
        <p className="aplus-header-sub">
          Upload 3–4 product images, add your title and brand — get all 5 A+ module assets at exact Amazon dimensions, with text baked in.
        </p>
        <div className="aplus-header-modules">
          <span>970×300 Banner</span>
          <span>·</span>
          <span>970×600 Hero</span>
          <span>·</span>
          <span>3× 300×300 Feature Cards</span>
        </div>
      </header>

      <main className="aplus-main">
        {/* Input Form */}
        <section className="aplus-form-card">
          {/* Image upload slots */}
          <div className="aplus-form-section">
            <label className="aplus-field-label">Product Images <span className="aplus-field-req">3–4 images required</span></label>
            <div className="aplus-image-slots">
              {[0, 1, 2, 3].map(idx => (
                <div
                  key={idx}
                  className={`aplus-image-slot ${previews[idx] ? 'has-image' : ''} ${dragOver && !previews[idx] ? 'drag-over' : ''}`}
                  onClick={() => !previews[idx] && fileInputRef.current?.click()}
                  onDrop={idx === 0 || !previews[0] ? handleDrop : undefined}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                >
                  {previews[idx] ? (
                    <>
                      <img src={previews[idx]} alt={`Product ${idx + 1}`} />
                      <button
                        className="aplus-slot-remove"
                        onClick={e => { e.stopPropagation(); removeImage(idx); }}
                      >×</button>
                    </>
                  ) : (
                    <div className="aplus-slot-empty">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>Add image</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={e => addFiles(e.target.files)}
            />
            <p className="aplus-field-hint">JPG or PNG · Max 10MB each · First image used as primary reference</p>
          </div>

          {/* Logo upload */}
          <div className="aplus-form-section">
            <label className="aplus-field-label">Brand Logo <span className="aplus-field-opt">(optional — placed on banner &amp; hero images)</span></label>
            <div className="aplus-logo-upload-row">
              {logoPreview ? (
                <div className="aplus-logo-preview">
                  <img src={logoPreview} alt="Brand logo" />
                  <button
                    className="aplus-logo-remove"
                    onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                  >×</button>
                </div>
              ) : (
                <button
                  type="button"
                  className="aplus-logo-upload-btn"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isGenerating}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Upload Logo
                </button>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f && f.type.startsWith('image/')) {
                    setLogoFile(f);
                    setLogoPreview(URL.createObjectURL(f));
                  }
                }}
              />
              <span className="aplus-logo-hint">PNG with transparent background works best</span>
            </div>
          </div>

          {/* Text fields */}
          <div className="aplus-form-row">
            <div className="aplus-form-section">
              <label className="aplus-field-label">Product Title</label>
              <input
                className="aplus-input"
                type="text"
                placeholder="e.g. Premium Stainless Steel Water Bottle"
                value={productTitle}
                onChange={e => setProductTitle(e.target.value)}
                disabled={isGenerating}
              />
            </div>
            <div className="aplus-form-section">
              <label className="aplus-field-label">Brand Name</label>
              <input
                className="aplus-input"
                type="text"
                placeholder="e.g. AquaPure"
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                disabled={isGenerating}
              />
            </div>
          </div>

          <div className="aplus-form-section">
            <label className="aplus-field-label">Key Features / USPs <span className="aplus-field-opt">(optional but recommended)</span></label>
            <textarea
              className="aplus-textarea"
              rows={4}
              placeholder="Describe your product's main features and selling points. e.g. BPA-free, double-walled insulation, 750ml capacity, leak-proof lid, compatible with car cup holders..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          {error && <div className="aplus-error">{error}</div>}

          <button
            className="aplus-generate-btn"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            {isGenerating ? (
              <><span className="btn-spinner" />Generating A+ Assets...</>
            ) : (
              <>✦ Generate A+ Listing Assets</>
            )}
          </button>

          {!user && (
            <p className="aplus-login-note">
              <Link to="/login">Log in</Link> to save your A+ listings to Dashboard
            </p>
          )}
        </section>

        {/* Progress */}
        {isGenerating && (
          <section className="aplus-progress-card">
            <div className="aplus-progress-title">Generating your A+ content...</div>
            <div className="aplus-progress-steps">
              <div className={`aplus-step ${currentModule === 'copy' ? 'active' : copy ? 'done' : ''}`}>
                <div className="aplus-step-dot" />
                <span>Writing copy & headlines</span>
              </div>
              {MODULE_ORDER.map((key, i) => {
                const isActive = currentModule === key;
                const isDoneStep = !!modules[key];
                return (
                  <div key={key} className={`aplus-step ${isActive ? 'active' : isDoneStep ? 'done' : ''}`}>
                    <div className="aplus-step-dot" />
                    <span>{MODULE_META[key].label} ({MODULE_META[key].dims})</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Results */}
        {(readyModules.length > 0 || isDone) && (
          <section className="aplus-results">
            <div className="aplus-results-header">
              <div>
                <h2 className="aplus-results-title">A+ Listing Assets</h2>
                <p className="aplus-results-sub">{readyModules.length} of 5 modules ready{isDone ? ' — all done!' : ' — generating...'}</p>
              </div>
              {isDone && (
                <div className="aplus-results-actions">
                  <button className="aplus-download-zip-btn" onClick={downloadAll}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Download ZIP
                  </button>
                  {user && (
                    <button
                      className={`aplus-save-btn ${saveStatus === 'saved' ? 'saved' : ''}`}
                      onClick={handleSave}
                      disabled={!!saveStatus}
                    >
                      {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Save Failed' : 'Save to Dashboard'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Wide modules: banner + hero */}
            <div className="aplus-wide-modules">
              {['banner', 'hero'].map(key => (
                <div key={key} className={`aplus-module-card wide ${modules[key] ? '' : 'loading'}`}>
                  <div className="aplus-module-meta">
                    <span className="aplus-module-label">{MODULE_META[key].label}</span>
                    <span className="aplus-module-dims">{MODULE_META[key].dims}</span>
                  </div>
                  {modules[key] ? (
                    <>
                      <img src={`data:image/png;base64,${modules[key]}`} alt={MODULE_META[key].label} className="aplus-module-img" />
                      <button className="aplus-module-download" onClick={() => downloadModule(key)}>
                        Download
                      </button>
                    </>
                  ) : (
                    <div className="aplus-module-skeleton"><div className="skeleton-shimmer" /></div>
                  )}
                </div>
              ))}
            </div>

            {/* Feature cards: 3 × 300×300 */}
            <div className="aplus-feature-modules">
              {['feature1', 'feature2', 'feature3'].map(key => (
                <div key={key} className={`aplus-module-card square ${modules[key] ? '' : 'loading'}`}>
                  <div className="aplus-module-meta">
                    <span className="aplus-module-label">{MODULE_META[key].label}</span>
                    <span className="aplus-module-dims">{MODULE_META[key].dims}</span>
                  </div>
                  {modules[key] ? (
                    <>
                      <img src={`data:image/png;base64,${modules[key]}`} alt={MODULE_META[key].label} className="aplus-module-img square-img" />
                      <button className="aplus-module-download" onClick={() => downloadModule(key)}>
                        Download
                      </button>
                    </>
                  ) : (
                    <div className="aplus-module-skeleton square-skeleton"><div className="skeleton-shimmer" /></div>
                  )}
                </div>
              ))}
            </div>

            {/* Copy panel */}
            {copy && (
              <div className="aplus-copy-panel">
                <h3 className="aplus-copy-title">Module Copy Text</h3>
                <p className="aplus-copy-note">Use these in Amazon A+ Content Manager when filling in text fields for each module.</p>

                <div className="aplus-copy-block">
                  <div className="aplus-copy-block-header">
                    <span>Banner</span>
                    <button className="aplus-copy-btn" onClick={() => handleCopyText(`${copy.banner.headline}\n${copy.banner.tagline}`, 'banner')}>
                      {copiedKey === 'banner' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="aplus-copy-row"><span className="aplus-copy-key">Headline</span><span className="aplus-copy-val">{copy.banner.headline}</span></div>
                  <div className="aplus-copy-row"><span className="aplus-copy-key">Tagline</span><span className="aplus-copy-val">{copy.banner.tagline}</span></div>
                </div>

                <div className="aplus-copy-block">
                  <div className="aplus-copy-block-header">
                    <span>Hero</span>
                    <button className="aplus-copy-btn" onClick={() => handleCopyText(`${copy.hero.headline}\n${copy.hero.body}`, 'hero')}>
                      {copiedKey === 'hero' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="aplus-copy-row"><span className="aplus-copy-key">Headline</span><span className="aplus-copy-val">{copy.hero.headline}</span></div>
                  <div className="aplus-copy-row"><span className="aplus-copy-key">Body</span><span className="aplus-copy-val">{copy.hero.body}</span></div>
                </div>

                {copy.features.map((feat, i) => (
                  <div key={i} className="aplus-copy-block">
                    <div className="aplus-copy-block-header">
                      <span>Feature Card {i + 1}</span>
                      <button className="aplus-copy-btn" onClick={() => handleCopyText(`${feat.headline}\n${feat.body}`, `feature${i + 1}`)}>
                        {copiedKey === `feature${i + 1}` ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="aplus-copy-row"><span className="aplus-copy-key">Headline</span><span className="aplus-copy-val">{feat.headline}</span></div>
                    <div className="aplus-copy-row"><span className="aplus-copy-key">Body</span><span className="aplus-copy-val">{feat.body}</span></div>
                  </div>
                ))}
              </div>
            )}

            {isDone && (
              <div className="aplus-amazon-note">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>Upload these images to <strong>Seller Central → Advertising → A+ Content Manager</strong>. A+ Content requires Amazon Brand Registry.</span>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
