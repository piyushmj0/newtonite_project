import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getApiError } from '../utils/helpers';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form.email, form.name, form.password);
      }
      navigate('/');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="sidebar-logo-mark" style={{ width: 40, height: 40, fontSize: 18 }}>N</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>Newtonite</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Operational Work Management</div>
          </div>
        </div>

        <h1 className="auth-title">{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</h1>
        <p className="auth-subtitle">
          {mode === 'login'
            ? "Welcome back. Don't have an account? "
            : "Join your team. Already have an account? "}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: 0, color: 'var(--accent)', fontSize: 13 }}
            onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div className="alert alert-error" role="alert">{error}</div>}

          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-name">Full Name</label>
              <input
                id="auth-name"
                className="form-control"
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="Alice Johnson"
                required
                autoFocus
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="form-control"
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="alice@company.com"
              required
              autoFocus={mode === 'login'}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="form-control"
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder={mode === 'login' ? '••••••••' : 'At least 8 characters'}
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full" style={{ marginTop: 6 }} disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: 24, padding: 14, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Demo accounts:</strong><br />
          alice@company.com / password123 (Engineering admin)<br />
          bob@company.com / password123 (Team member)<br />
          carol@company.com / password123 (Operations)
        </div>
      </div>
    </div>
  );
}
