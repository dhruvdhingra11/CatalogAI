import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import './Auth.css';

export default function Auth() {
  const [email, setEmail]   = useState('');
  const [mobile, setMobile] = useState('');
  const [code, setCode]     = useState('');
  const [step, setStep]     = useState(1); // 1=enter email+mobile, 2=enter code
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const { user, customTokenLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user]);

  // ── Step 1: send OTP ───────────────────────────────────────────────────────
  const handleSendCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send code.');
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify OTP ─────────────────────────────────────────────────────
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');

      const credential = await customTokenLogin(data.token);
      const uid = credential.user.uid;

      // Save user data for analytics/CRM
      if (db) {
        await setDoc(doc(db, 'users', uid), {
          email,
          mobile,
          lastSignIn: serverTimestamp(),
        }, { merge: true });
      }

      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <nav className="auth-nav">
        <Link to="/" className="auth-logo">
          <span className="auth-logo-mark">✦</span>
          <span>SellerStudio</span>
        </Link>
      </nav>

      <div className="auth-container">
        <div className="auth-card">

          {step === 1 ? (
            <form onSubmit={handleSendCode} className="auth-form">
              <h1 className="auth-title">Sign in to SellerStudio</h1>
              <p className="auth-sub">Enter your details and we'll send a login code.</p>

              <div className="auth-field">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="auth-field">
                <label>Mobile number</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={mobile}
                  onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  required
                  autoComplete="tel"
                />
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Sending code...' : 'Send Code →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="auth-form">
              <span className="auth-otp-icon">📧</span>
              <h1 className="auth-title">Check your email</h1>
              <p className="auth-sub">
                We sent a 6-digit code to <strong>{email}</strong>.
              </p>

              <div className="auth-field">
                <label>6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoFocus
                  className="auth-code-input"
                />
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button
                type="submit"
                className="auth-submit"
                disabled={loading || code.length !== 6}
              >
                {loading ? 'Verifying...' : 'Verify Code →'}
              </button>

              <p className="auth-switch">
                Wrong email?{' '}
                <button type="button" onClick={() => { setStep(1); setCode(''); setError(''); }}>
                  Go back
                </button>
              </p>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
