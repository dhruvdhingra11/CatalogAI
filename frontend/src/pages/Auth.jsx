import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signInWithCustomToken } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import './Auth.css';

const apiBase = import.meta.env.VITE_API_URL || '';

export default function Auth() {
  const [tab, setTab]             = useState('login');
  const [email, setEmail]         = useState('');
  const [otpStep, setOtpStep]     = useState(false);
  const [otp, setOtp]             = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const { googleLogin } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from || '/dashboard';

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const sendOtp = async () => {
    const res  = await fetch(`${apiBase}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send code.');
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendOtp();
      setOtpStep(true);
      setResendTimer(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch(`${apiBase}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');
      await signInWithCustomToken(auth, data.token);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setError('');
    setLoading(true);
    try {
      await sendOtp();
      setOtp('');
      setResendTimer(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await googleLogin();
      // signInWithRedirect — page will redirect, no further action needed
    } catch (err) {
      if (err.message) setError(err.message);
      setLoading(false);
    }
  };

  // ── OTP verification screen ──────────────────────────────────────────────
  if (otpStep) {
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
            <span className="auth-otp-icon">📧</span>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-sub">
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below.
            </p>
            <form onSubmit={handleVerifyOtp} className="auth-form">
              <div className="auth-field">
                <label>6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="• • • • • •"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                  required
                />
              </div>
              {error && <div className="auth-error">{error}</div>}
              <button type="submit" className="auth-submit" disabled={loading || otp.length < 6}>
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>
            </form>
            <p className="auth-switch">
              {resendTimer > 0 ? (
                <span>Resend code in {resendTimer}s</span>
              ) : (
                <button type="button" onClick={handleResend} disabled={loading}>Resend code</button>
              )}
              {' · '}
              <button type="button" onClick={() => { setOtpStep(false); setOtp(''); setError(''); }}>
                Change email
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Email entry screen ───────────────────────────────────────────────────
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
          <div className="auth-tabs">
            <button
              className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setError(''); }}
            >
              Log In
            </button>
            <button
              className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
              onClick={() => { setTab('signup'); setError(''); }}
            >
              Sign Up
            </button>
          </div>

          <h1 className="auth-title">
            {tab === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="auth-sub">
            Enter your email and we'll send you a login code. No password needed.
          </p>

          <button className="auth-google-btn" onClick={handleGoogle} disabled={loading}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="auth-divider"><span>or</span></div>

          <form onSubmit={handleSendOtp} className="auth-form">
            <div className="auth-field">
              <label>Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Sending code...' : 'Send Login Code →'}
            </button>
          </form>

          <p className="auth-switch">
            {tab === 'login' ? (
              <>Don&apos;t have an account?{' '}
                <button type="button" onClick={() => { setTab('signup'); setError(''); }}>Sign up free</button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button type="button" onClick={() => { setTab('login'); setError(''); }}>Log in</button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
