'use client';

import { useRouter } from 'next/navigation';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { useState } from 'react';
import api from '../_lib/api';
import { setSession } from '../_lib/auth';

const NAVY = '#0A1420';
const ORANGE = '#E8503A';

// ---------- Hauler convoy pieces (ported from the loading-state concept) ----------

function MiniWheel({ left, right }: { left?: number | string; right?: number | string }) {
  return (
    <div style={{
      position: 'absolute', left, right, bottom: 0, width: 12, height: 12,
      borderRadius: '50%', background: '#0a1722', border: '2px solid #34495d',
    }}>
      <div style={{ position: 'absolute', left: '50%', top: 1, bottom: 1, width: 1.5, transform: 'translateX(-50%)', background: '#3a546c' }} />
    </div>
  );
}

function CarriedCar({ left, bottom, body, roof }: { left: number; bottom: number; body: string; roof: string }) {
  return (
    <div style={{ position: 'absolute', left, bottom, width: 80, height: 26 }}>
      <div style={{ position: 'absolute', left: 0, bottom: 4, width: '100%', height: 13, borderRadius: '6px 7px 4px 4px', background: body }} />
      <div style={{ position: 'absolute', left: '16%', bottom: 13, width: '58%', height: 11, borderRadius: '6px 6px 0 0', background: roof }} />
      <MiniWheel left="13%" />
      <MiniWheel right="13%" />
    </div>
  );
}

function BigWheel({ left }: { left: number }) {
  return (
    <div
      className="pod-roll"
      style={{
        position: 'absolute', left, bottom: 0, width: 22, height: 22,
        borderRadius: '50%', background: '#0a1722', border: '3px solid #2c4255',
      }}
    >
      <div style={{ position: 'absolute', left: '50%', top: 2, bottom: 2, width: 2, transform: 'translateX(-50%)', background: '#3a546c' }} />
      <div style={{ position: 'absolute', left: 2, right: 2, top: '50%', height: 2, transform: 'translateY(-50%)', background: '#3a546c' }} />
    </div>
  );
}

const CAR_PAINTS: Record<string, { body: string; roof: string }> = {
  white:  { body: '#eef1f3', roof: '#bcc7cf' },
  grey:   { body: '#8fa0ad', roof: '#5f7180' },
  orange: { body: ORANGE,    roof: '#C13A26' },
};

function Hauler({ delay, cars }: { delay: string; cars: [string, string, string] }) {
  const [lower, upFront, upRear] = cars.map((c) => CAR_PAINTS[c]);
  return (
    <div className="pod-drive" style={{ position: 'absolute', left: 0, bottom: 54, width: 188, height: 92, animationDelay: delay }}>
      {/* trailer frame */}
      <div style={{ position: 'absolute', left: 4, right: 4, bottom: 54, height: 5, borderRadius: 3, background: '#2c4255' }} />
      <div style={{ position: 'absolute', right: 3, bottom: 11, width: 5, height: 48, background: '#2c4255' }} />
      <div style={{ position: 'absolute', left: 50, bottom: 11, width: 4, height: 46, background: '#2c4255' }} />
      <div style={{ position: 'absolute', left: 48, right: 5, bottom: 11, height: 5, borderRadius: 3, background: '#2c4255' }} />

      {/* cars */}
      <CarriedCar left={60} bottom={16} body={lower.body} roof={lower.roof} />
      <CarriedCar left={6} bottom={58} body={upFront.body} roof={upFront.roof} />
      <CarriedCar left={98} bottom={58} body={upRear.body} roof={upRear.roof} />

      {/* cab */}
      <div style={{ position: 'absolute', left: 0, bottom: 11, width: 48, height: 44, borderRadius: '7px 9px 4px 4px', background: '#22405a', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 7, top: 7, width: 30, height: 17, background: '#9fb6c9', borderRadius: 3, clipPath: 'polygon(14% 0,100% 0,100% 100%,0 100%)' }} />
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 5, background: ORANGE }} />
      </div>

      <BigWheel left={12} />
      <BigWheel left={118} />
      <BigWheel left={146} />
    </div>
  );
}

// ---------- Login page ----------

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  width: '100%', padding: '11px 13px', borderRadius: 10,
  border: '1.5px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)',
  color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit',
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotUser, setForgotUser] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // There is no email transport in POD, so this cannot send a reset link.
  // It raises an internal notification for an admin, who resets the password
  // from the Team page. Always reports success, whatever the API returns, so
  // a wrong username reveals nothing.
  const requestReset = async () => {
    setForgotBusy(true);
    try {
      await api.post('/api/auth/forgot-password', { username: forgotUser.trim() });
    } catch {
      /* deliberately ignored — the message must not depend on the outcome */
    } finally {
      setForgotBusy(false);
      setForgotSent(true);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post('/api/auth/login', { username, password });
      setSession(data.token, data.user);
      router.push('/fleet');
    } catch (err: any) {
      setError(
        err.response?.status === 401
          ? 'Invalid username or password'
          : 'Could not reach the server — try again',
      );
      setBusy(false);
    }
  };

  return (
    <div style={{
      boxSizing: 'border-box',
      minHeight: '100vh', background: NAVY, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px 180px',
    }}>
      <style>{`
        @keyframes podDrive { from { transform: translateX(-220px) scaleX(-1); } to { transform: translateX(calc(100vw + 60px)) scaleX(-1); } }
        @keyframes podRoll { to { transform: rotate(-360deg); } }
        @keyframes podLane { to { background-position-x: -46px; } }
        @keyframes podLogoPulse { 0%,100% { opacity: .92; } 50% { opacity: 1; } }
        .pod-drive { animation: podDrive 14s linear infinite; }
        .pod-roll  { animation: podRoll 1.4s linear infinite; }
        .pod-lane  { animation: podLane .6s linear infinite; }
        .pod-login-card, .pod-login-card * { box-sizing: border-box; }
        .pod-input:focus { border-color: ${ORANGE} !important; background: rgba(255,255,255,.09) !important; }
        .pod-input::placeholder { color: rgba(255,255,255,.28); }
        .pod-enter-btn { transition: filter .15s, transform .1s; }
        .pod-enter-btn:not(:disabled):hover { filter: brightness(1.1); }
        .pod-enter-btn:not(:disabled):active { transform: translateY(1px); }
      `}</style>

      {/* Wordmark */}
      <img
        src="/pod-logo.png"
        alt="POD"
        style={{ height: 52, width: 'auto', display: 'block', animation: 'podLogoPulse 3s ease-in-out infinite' }}
      />
      <div style={{ marginTop: 10, fontSize: 12, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.34)' }}>
        Vehicle import &amp; delivery
      </div>

      {/* Sign-in card */}
      <form
        className="pod-login-card"
        onSubmit={submit}
        style={{
          marginTop: 40, width: '100%', maxWidth: 380,
          background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.10)',
          borderRadius: 14, padding: '24px 22px 22px', backdropFilter: 'blur(6px)',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', fontWeight: 600, marginBottom: 16 }}>
          Sign in
        </div>

        <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,.55)', fontWeight: 600, marginBottom: 6 }}>
          Username
        </label>
        <input
          className="pod-input"
          style={inputStyle}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          disabled={busy}
        />

        <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,.55)', fontWeight: 600, margin: '14px 0 6px' }}>
          Password
        </label>
        <div style={{ position: 'relative' }}>
          <input
            className="pod-input"
            style={{ ...inputStyle, paddingRight: 44 }}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 7,
              color: 'rgba(255,255,255,.45)', fontSize: 15, padding: 0,
            }}
          >
            {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            type="button"
            onClick={() => {
              // Seed from whatever is already typed above — nobody wants to
              // enter their username twice on the same card.
              if (!forgotOpen) setForgotUser((u) => u || username);
              setForgotOpen((v) => !v);
              setForgotSent(false);
            }}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: 11.5, color: 'rgba(255,255,255,.45)', textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Forgot password?
          </button>
        </div>

        {forgotOpen && (
          <div style={{
            marginTop: 12, padding: '12px 13px', borderRadius: 9,
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.10)',
          }}>
            {forgotSent ? (
              // Deliberately the same message whether or not the account
              // exists, so this cannot be used to discover usernames.
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.62)', lineHeight: 1.55 }}>
                If that account exists, an administrator has been notified and
                will reset it for you.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.55)', lineHeight: 1.55, marginBottom: 9 }}>
                  Enter your username and an administrator will be asked to reset
                  your password.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="pod-input"
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="Username"
                    value={forgotUser}
                    onChange={(e) => setForgotUser(e.target.value)}
                    disabled={forgotBusy}
                  />
                  <button
                    type="button"
                    onClick={requestReset}
                    disabled={forgotBusy || !forgotUser.trim()}
                    style={{
                      padding: '0 14px', borderRadius: 9, cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,.18)',
                      background: 'rgba(255,255,255,.08)', color: '#fff',
                      fontSize: 12, fontWeight: 600,
                      opacity: forgotBusy || !forgotUser.trim() ? 0.5 : 1,
                    }}
                  >
                    {forgotBusy ? '…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 14, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'rgba(231,76,56,.14)', border: '1px solid rgba(231,76,56,.4)', color: '#ff9d8f',
          }}>
            {error}
          </div>
        )}

        <button
          className="pod-enter-btn"
          type="submit"
          disabled={!username || !password || busy}
          style={{
            boxSizing: 'border-box',
            marginTop: 18, width: '100%', padding: '12px 0',
            borderRadius: 14, border: 'none',
            background: username && password ? ORANGE : 'rgba(255,255,255,.08)',
            color: username && password ? '#fff' : 'rgba(255,255,255,.30)',
            fontSize: 13, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
            cursor: username && password && !busy ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Signing in…' : 'Enter the board'}
        </button>
      </form>

      {/* Road + hauler convoy */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 130, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 54, background: 'linear-gradient(to bottom, rgba(255,255,255,.04), rgba(255,255,255,0))' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 54, height: 2, background: 'rgba(255,255,255,.14)' }} />
        <div
          className="pod-lane"
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 26, height: 4,
            background: 'repeating-linear-gradient(90deg, rgba(255,255,255,.16) 0 24px, transparent 24px 46px)',
            backgroundSize: '46px 100%',
          }}
        />
        <Hauler delay="0s" cars={['grey', 'white', 'orange']} />
        <Hauler delay="-4.7s" cars={['orange', 'grey', 'white']} />
        <Hauler delay="-9.4s" cars={['white', 'grey', 'orange']} />
      </div>
    </div>
  );
}
