import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { RecaptchaVerifier, signInWithPhoneNumber, EmailAuthProvider, linkWithCredential } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { db, auth } from '../lib/firebase';
import './Auth.css';

function getErrorMessage(code) {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/invalid-phone-number':
      return 'Invalid phone number. Use format: +91 XXXXX XXXXX';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/invalid-verification-code':
      return 'Incorrect OTP. Please try again.';
    case 'auth/code-expired':
      return 'OTP has expired. Please request a new one.';
    case 'auth/credential-already-in-use':
      return 'This phone number is already linked to another account.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.startsWith('91') && digits.length === 12) return '+' + digits;
  if (raw.trim().startsWith('+')) return raw.replace(/\s+/g, '');
  return '+91' + digits;
}

export default function Auth() {
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // OTP step
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [resendTimer, setResendTimer] = useState(0);

  const recaptchaContainerRef = useRef(null);
  const appVerifierRef = useRef(null);
  const isLinkingRef = useRef(false);

  const { user, login, googleLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';

  useEffect(() => {
    if (user && !isLinkingRef.current) navigate(from, { replace: true });
  }, [user]);

  // Initialise visible reCAPTCHA as soon as the signup tab is shown
  useEffect(() => {
    if (tab !== 'signup' || !auth) return;

    const timer = setTimeout(() => {
      if (appVerifierRef.current || !recaptchaContainerRef.current) return;
      try {
        appVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
          size: 'normal',
          'expired-callback': () => {
            // Token expired — clear so it gets recreated on next attempt
            try { appVerifierRef.current.clear(); } catch (_) {}
            appVerifierRef.current = null;
          },
        });
        appVerifierRef.current.render().catch(console.error);
      } catch (err) {
        console.error('RecaptchaVerifier init error:', err);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [tab]);

  // Clean up verifier when leaving signup tab or unmounting
  useEffect(() => {
    if (tab === 'signup') return;
    if (appVerifierRef.current) {
      try { appVerifierRef.current.clear(); } catch (_) {}
      appVerifierRef.current = null;
    }
  }, [tab]);

  useEffect(() => {
    return () => {
      if (appVerifierRef.current) {
        try { appVerifierRef.current.clear(); } catch (_) {}
        appVerifierRef.current = null;
      }
    };
  }, []);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  async function sendOtp() {
    if (!appVerifierRef.current) {
      throw new Error('reCAPTCHA not ready. Please complete the checkbox above first.');
    }
    const result = await signInWithPhoneNumber(auth, formatPhone(phone), appVerifierRef.current);
    setConfirmationResult(result);
    setResendTimer(30);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'login') {
        await login(email, password);
        navigate(from, { replace: true });
      } else {
        if (!phone.trim()) {
          setError('Mobile number is required to create an account.');
          setLoading(false);
          return;
        }
        await sendOtp();
        setOtpStep(true);
        setLoading(false);
      }
    } catch (err) {
      console.error('Send OTP error:', err.code, err.message);
      setError(getErrorMessage(err.code) || err.message);
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim() || !confirmationResult) return;
    setError('');
    setLoading(true);
    try {
      isLinkingRef.current = true;

      // Confirm OTP → creates phone-auth user
      const phoneUserCred = await confirmationResult.confirm(otp);

      // Link email + password to the phone user
      const emailCred = EmailAuthProvider.credential(email, password);
      await linkWithCredential(phoneUserCred.user, emailCred);

      // Save profile to Firestore
      if (db) {
        await setDoc(doc(db, 'users', phoneUserCred.user.uid), {
          phone: phone.trim(),
          email,
        }, { merge: true });
      }

      isLinkingRef.current = false;
      navigate(from, { replace: true });
    } catch (err) {
      isLinkingRef.current = false;
      console.error('Verify OTP error:', err.code, err.message);
      setError(getErrorMessage(err.code) || err.message);
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setError('');
    setLoading(true);
    try {
      // Reset verifier so reCAPTCHA can be solved again
      if (appVerifierRef.current) {
        try { appVerifierRef.current.clear(); } catch (_) {}
        appVerifierRef.current = null;
      }
      if (recaptchaContainerRef.current) {
        appVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
          size: 'normal',
          'expired-callback': () => {
            try { appVerifierRef.current.clear(); } catch (_) {}
            appVerifierRef.current = null;
          },
        });
        await appVerifierRef.current.render();
      }
      await sendOtp();
      setOtp('');
    } catch (err) {
      setError(getErrorMessage(err.code) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await googleLogin();
      navigate(from, { replace: true });
    } catch (err) {
      const msg = getErrorMessage(err.code);
      if (msg) setError(msg);
    } finally {
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
            <div className="auth-otp-icon">📱</div>
            <h1 className="auth-title">Verify your number</h1>
            <p className="auth-sub">
              OTP sent to <strong>{phone}</strong>. Enter it below to complete signup.
            </p>
            <form onSubmit={handleVerifyOtp} className="auth-form">
              <div className="auth-field">
                <label>6-digit OTP</label>
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
                {loading ? 'Verifying...' : 'Verify & Create Account'}
              </button>
            </form>
            <p className="auth-switch">
              {resendTimer > 0 ? (
                <span>Resend OTP in {resendTimer}s</span>
              ) : (
                <button type="button" onClick={handleResend} disabled={loading}>Resend OTP</button>
              )}
              {' · '}
              <button type="button" onClick={() => { setOtpStep(false); setOtp(''); setError(''); }}>
                Change number
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main login / signup screen ───────────────────────────────────────────
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
              onClick={() => { setTab('login'); setError(''); setPhone(''); }}
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
            {tab === 'login'
              ? 'Log in to access your saved product images.'
              : 'Sign up to save images and manage your credits.'}
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

          <form onSubmit={handleSubmit} className="auth-form">
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
            <div className="auth-field">
              <label>Password</label>
              <input
                type="password"
                placeholder={tab === 'signup' ? 'Min. 6 characters' : '••••••••'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            {tab === 'signup' && (
              <>
                <div className="auth-field">
                  <label>Mobile Number <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    autoComplete="tel"
                    required
                  />
                </div>
                <div className="auth-recaptcha" ref={recaptchaContainerRef} />
              </>
            )}
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading
                ? (tab === 'signup' ? 'Sending OTP...' : 'Please wait...')
                : (tab === 'login' ? 'Log In' : 'Send OTP →')}
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
