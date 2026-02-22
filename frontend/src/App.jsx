import { useState, useRef, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { useAuth } from './context/AuthContext';
import { db, storage } from './lib/firebase';

const freeKey = (uid) => `sellerstudio_free_used_${uid}`;

const PENDING_KEY = 'sellerstudio_pending_generation';

function savePendingState(file, name) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({
          productName: name,
          imageDataUrl: e.target.result,
          imageName: file.name,
          imageMimeType: file.type,
        }));
      } catch (_) {
        // sessionStorage full (large image) — save only the name
        try {
          sessionStorage.setItem(PENDING_KEY, JSON.stringify({ productName: name }));
        } catch (_) {}
      }
      resolve();
    };
    reader.readAsDataURL(file);
  });
}

function loadPendingState() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    const saved = JSON.parse(raw);
    if (saved.imageDataUrl) {
      const arr = saved.imageDataUrl.split(',');
      const bstr = atob(arr[1] ?? arr[0]);
      const u8 = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
      const file = new File([u8], saved.imageName || 'product.png', { type: saved.imageMimeType || 'image/png' });
      return { productName: saved.productName, file, preview: saved.imageDataUrl };
    }
    return { productName: saved.productName, file: null, preview: null };
  } catch (_) {
    sessionStorage.removeItem(PENDING_KEY);
    return null;
  }
}

const LOADING_MESSAGES = [
  'Something interesting is brewing...',
  'Teaching AI what your product looks like...',
  'Crafting the perfect studio setup...',
  'Lighting the scene just right...',
  'Placing your product in the real world...',
  'Adding the finishing touches...',
  'This usually takes 3–4 minutes. Worth the wait.',
  'Generating ecommerce shots...',
  'Dreaming up lifestyle scenarios...',
  'Almost there — good things take time...',
  'Amazing images on the way...',
  'Still cooking — hang tight...',
];

const TIPS = [
  { label: 'Be specific', example: '"Matte Black Ceramic Coffee Mug" not "mug"' },
  { label: 'Include material', example: '"Full-Grain Leather Bifold Wallet"' },
  { label: 'Mention key feature', example: '"Wireless Noise-Cancelling Over-Ear Headphones"' },
];

async function saveGenerationToFirebase(slots, productName, uid) {
  if (!db || !storage) throw new Error('Firebase not initialized. Check your .env config.');

  const genId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const imageUrls = new Array(slots.length).fill(null);

  await Promise.all(
    slots.map(async (slot, i) => {
      if (!slot?.imageData) return;
      const storageRef = ref(storage, `generations/${uid}/${genId}/${i}.png`);
      await uploadString(storageRef, slot.imageData, 'base64', { contentType: 'image/png' });
      imageUrls[i] = await getDownloadURL(storageRef);
    })
  );

  await addDoc(collection(db, 'generations'), {
    userId: uid,
    productName,
    imageUrls,
    createdAt: serverTimestamp(),
  });
}

export default function App() {
  const [productName, setProductName] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [loadingVisible, setLoadingVisible] = useState(true);
  const [imageSlots, setImageSlots] = useState(null);
  const [generatedName, setGeneratedName] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState('');
  const [queuePosition, setQueuePosition] = useState(null);
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const loadingIntervalRef = useRef(null);
  const slotsAccumRef = useRef([]);

  const { user } = useAuth();
  const [freeUsed, setFreeUsed] = useState(false);

  useEffect(() => {
    if (user) {
      setFreeUsed(localStorage.getItem(freeKey(user.uid)) === 'true');
      // Restore any form state saved before the login redirect
      const pending = loadPendingState();
      if (pending) {
        if (pending.productName) setProductName(pending.productName);
        if (pending.file)        { setImageFile(pending.file); setImagePreview(pending.preview); }
      }
    } else {
      setFreeUsed(false);
    }
  }, [user]);

  useEffect(() => {
    if (loading) {
      setLoadingMsgIndex(0);
      setLoadingVisible(true);
      loadingIntervalRef.current = setInterval(() => {
        setLoadingVisible(false);
        setTimeout(() => {
          setLoadingMsgIndex(i => (i + 1) % LOADING_MESSAGES.length);
          setLoadingVisible(true);
        }, 400);
      }, 3500);
    } else {
      clearInterval(loadingIntervalRef.current);
    }
    return () => clearInterval(loadingIntervalRef.current);
  }, [loading]);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Please upload a valid image file.');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
    setImageSlots(null);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, []);

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleGenerate = async () => {
    if (!user) {
      await savePendingState(imageFile, productName.trim());
      navigate('/login', { state: { from: '/tool' } });
      return;
    }
    if (freeUsed) { navigate('/pricing'); return; }
    if (!imageFile) return setError('Please upload a product image.');
    if (!productName.trim()) return setError('Please enter a product name.');

    setLoading(true);
    setError(null);
    setQueuePosition(null);
    setGeneratedName(productName.trim());
    slotsAccumRef.current = Array(8).fill(null);
    setImageSlots(Array(8).fill(null));

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('productName', productName.trim());

      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/generate`, { method: 'POST', body: formData });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Server error');
      }

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
            if (data.type === 'queued') {
              setQueuePosition(data.position);
            } else if (data.type === 'started') {
              setQueuePosition(null);
            } else if (data.type === 'image') {
              slotsAccumRef.current[data.index] = data;
              setImageSlots(prev => {
                const next = [...prev];
                next[data.index] = data;
                return next;
              });
            } else if (data.type === 'error') {
              setError(data.error);
              setLoading(false);
              setQueuePosition(null);
            } else if (data.type === 'done') {
              setQueuePosition(null);
              localStorage.setItem(freeKey(user.uid), 'true');
              setFreeUsed(true);
              setLoading(false);
              setShowUpgradeModal(true);
              setSaveStatus('saving');
              setSaveError('');
              saveGenerationToFirebase(slotsAccumRef.current, productName.trim(), user.uid)
                .then(() => setSaveStatus('saved'))
                .catch(err => {
                  console.error('Firebase save error:', err);
                  setSaveStatus('error');
                  setSaveError(err.message);
                });
            }
          } catch (_) { /* skip malformed lines */ }
        }
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const downloadImage = (imageData, index, style) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${imageData}`;
    link.download = `${generatedName.replace(/\s+/g, '_')}_${style}_${index + 1}.png`;
    link.click();
  };

  const downloadAll = () => {
    imageSlots?.forEach((img, i) => {
      if (img?.imageData) setTimeout(() => downloadImage(img.imageData, i, img.style), i * 300);
    });
  };

  const successCount = imageSlots?.filter(img => img?.imageData).length ?? 0;
  const showResults = imageSlots !== null;

  return (
    <div className="app">
      {/* Tool Nav */}
      <nav className="tool-nav">
        <Link to="/" className="tool-nav-logo">
          <span className="tool-logo-mark">✦</span>
          <span>SellerStudio</span>
        </Link>
        <div className="tool-nav-right">
          {user ? (
            <Link to="/dashboard" className="tool-nav-link">Dashboard</Link>
          ) : (
            <Link to="/login" className="tool-nav-link">Login</Link>
          )}
          {user && (freeUsed ? (
            <Link to="/pricing" className="tool-nav-upgrade">Buy Credits — ₹99/product →</Link>
          ) : (
            <span className="tool-nav-free">🎁 1 free generation remaining</span>
          ))}
        </div>
      </nav>

      <header className="header">
        <div className="header-badge">AI-Powered</div>
        <h1>Product Image Generator</h1>
        <p>Upload a product photo and get 8 professional images — ecommerce &amp; in-use styles.</p>
      </header>

      <main className="main">
        <div className="input-panel">
          <div className="panel-left">
            <div
              className={`dropzone ${dragOver ? 'drag-over' : ''} ${imagePreview ? 'has-image' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="Product preview" className="preview-image" />
                  <div className="preview-overlay"><span>Click to change</span></div>
                </>
              ) : (
                <div className="dropzone-placeholder">
                  <div className="upload-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <p>Drop your product image here</p>
                  <span>PNG · JPG · WEBP &nbsp;·&nbsp; Max 10MB</span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleFile(e.target.files[0])} style={{ display: 'none' }} />
          </div>

          <div className="panel-right">
            <div className="field-group">
              <label className="field-label">Product Name</label>
              <input
                type="text"
                placeholder="e.g. Matte Black Ceramic Coffee Mug"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                className="product-input"
                disabled={loading}
              />
            </div>

            <div className="tips-box">
              <p className="tips-title">Tips for best results</p>
              <ul className="tips-list">
                {TIPS.map((tip, i) => (
                  <li key={i}>
                    <span className="tip-label">{tip.label}</span>
                    <span className="tip-example">{tip.example}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              className="generate-btn"
              onClick={handleGenerate}
              disabled={loading || !imageFile || !productName.trim() || freeUsed}
            >
              {loading ? (
                <><span className="btn-spinner" />Generating...</>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Generate 8 Images
                </>
              )}
            </button>

            {loading && (
              queuePosition ? (
                <p className="loading-status msg-visible">
                  ⏳ You are #{queuePosition} in queue — generation starts soon...
                </p>
              ) : (
                <p className={`loading-status ${loadingVisible ? 'msg-visible' : 'msg-hidden'}`}>
                  {LOADING_MESSAGES[loadingMsgIndex]}
                </p>
              )
            )}
            {error && <div className="error-box">{error}</div>}
          </div>
        </div>

        {showResults && (
          <section className="results-section">
            <div className="results-header">
              <div>
                <h2 className="results-title">{generatedName}</h2>
                <p className="results-sub">
                  {loading
                    ? `${successCount} of 8 images ready — generating more...`
                    : `${successCount} of 8 images generated successfully`}
                </p>
              </div>
              {successCount > 0 && !loading && (
                <button className="download-all-btn" onClick={downloadAll}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Download All
                </button>
              )}
            </div>

            <div className="style-group">
              <div className="group-header">
                <span className="group-label ecommerce-label">Ecommerce</span>
                <span className="group-desc">Clean studio backgrounds, sharp focus</span>
              </div>
              <div className="image-grid">
                {imageSlots.slice(0, 4).map((img, i) => (
                  <ImageCard key={i} img={img} index={i} onDownload={downloadImage} />
                ))}
              </div>
            </div>

            <div className="style-group">
              <div className="group-header">
                <span className="group-label lifestyle-label">In-Use</span>
                <span className="group-desc">Product in real-world, contextual use</span>
              </div>
              <div className="image-grid">
                {imageSlots.slice(4).map((img, i) => (
                  <ImageCard key={i + 4} img={img} index={i + 4} onDownload={downloadImage} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {showUpgradeModal && (
        <div className="upgrade-overlay" onClick={() => setShowUpgradeModal(false)}>
          <div className="upgrade-modal" onClick={e => e.stopPropagation()}>
            <div className="upgrade-emoji">🎉</div>
            <h2>Your 8 images are ready!</h2>
            {saveStatus === 'saving' && <p style={{color:'#7c6af5'}}>⏳ Saving images to your account...</p>}
            {saveStatus === 'saved' && <p style={{color:'#22c55e'}}>✓ Images saved to your account.</p>}
            {saveStatus === 'error' && <p style={{color:'#ef4444'}}>⚠️ Could not save: {saveError}</p>}
            {!saveStatus && <p>Ready to do more products?</p>}
            <div className="upgrade-pricing-row">
              <span className="upgrade-price">₹99</span>
              <span className="upgrade-per">per product · 8 images · credits never expire</span>
            </div>
            <Link to="/pricing" className="upgrade-btn-primary">Buy Credits →</Link>
            <div className="upgrade-actions-row">
              <Link to="/dashboard" className="upgrade-btn-secondary" onClick={() => setShowUpgradeModal(false)}>View Dashboard</Link>
              <button className="upgrade-btn-ghost" onClick={() => { downloadAll(); setShowUpgradeModal(false); }}>
                Download all images
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageCard({ img, index, onDownload }) {
  if (img === null) {
    return <div className="image-card image-card--skeleton"><div className="skeleton-shimmer" /></div>;
  }

  return (
    <div className={`image-card ${!img.imageData ? 'image-card--error' : ''}`}>
      {img.imageData ? (
        <>
          <img
            src={`data:image/png;base64,${img.imageData}`}
            alt={`Generated ${img.style} ${index + 1}`}
            className="generated-image"
          />
          <div className="image-overlay">
            <button className="download-btn" onClick={() => onDownload(img.imageData, index, img.style)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Download
            </button>
          </div>
          {img.prompt && (
            <div className="prompt-badge" title={img.prompt}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
          )}
        </>
      ) : (
        <div className="image-error">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p>Failed to generate</p>
          <small>{img.error}</small>
        </div>
      )}
    </div>
  );
}
