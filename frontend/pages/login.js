import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from './_app';

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(router.query.register === 'true');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    setIsRegister(!isRegister);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const res = await fetch('http://localhost:3001/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setIsRegister(false);
        setError('');
        setForm({ ...form, password: '' });
        setLoading(false);
        return;
      }

      const res = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username, password: form.password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      login(data.token, data.user);
      router.push('/challenges');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <>
      <nav>
        <div className="container">
          <Link href="/" className="logo">Vuln<span>Forge</span></Link>
          <div className="nav-links">
            <Link href="/">Home</Link>
          </div>
        </div>
      </nav>

      <div className="auth-page">
        <div className="auth-card">
          <h2>{isRegister ? 'Create Account' : 'Welcome Back'}</h2>
          <p className="subtitle">
            {isRegister ? 'Register to start using VulnForge' : 'Login to continue your progress'}
          </p>

          {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            {isRegister && (
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
            )}
            <div className="form-group">
              <label>Username</label>
              <input
                placeholder="Your username"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Your password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Processing...' : isRegister ? 'Register' : 'Login'}
            </button>
          </form>

          <div className="auth-toggle">
            {isRegister ? (
              <>Already have an account? <a onClick={toggle}>Login here</a></>
            ) : (
              <>Don't have an account? <a onClick={toggle}>Register here</a></>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
