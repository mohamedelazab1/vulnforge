import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../_app';
import Prism from 'prismjs';

export default function Challenge() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const [challenge, setChallenge] = useState(null);
  const [flag, setFlag] = useState('');
  const [result, setResult] = useState(null);
  const [hintIndex, setHintIndex] = useState(-1);
  const [showSecure, setShowSecure] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (!id) return;

    fetch(`http://localhost:3001/api/challenges/${id}`)
      .then(r => r.json())
      .then(data => { setChallenge(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, user, authLoading]);

  useEffect(() => {
    if (!loading && challenge) {
      Prism.highlightAll();
    }
  }, [challenge, showSecure, loading]);

  const verifyFlag = async () => {
    const res = await fetch(`http://localhost:3001/api/challenges/${id}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + localStorage.getItem('token')
      },
      body: JSON.stringify({ flag: flag.trim() })
    });
    const data = await res.json();
    setResult(data);
    if (data.success) {
      setTimeout(() => router.push('/challenges'), 2000);
    }
  };

  const useHint = async () => {
    if (hintIndex < challenge.hints.length - 1) {
      setHintIndex(hintIndex + 1);
      await fetch(`http://localhost:3001/api/hints/${id}/use`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
      });
    }
  };

  const diffClass = (d) => {
    const map = { Easy: 'badge-easy', Medium: 'badge-medium', Hard: 'badge-hard' };
    return map[d] || '';
  };

  if (authLoading || loading) return <div className="container" style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>;
  if (!user) return null;
  if (!challenge) return <div className="container" style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>Challenge not found</div>;

  return (
    <>
      <nav>
        <div className="container">
          <Link href="/" className="logo">Vuln<span>Forge</span></Link>
          <div className="nav-links">
            <Link href="/challenges">Challenges</Link>
            <Link href="/dashboard">Dashboard</Link>
            <button className="btn btn-outline btn-sm" onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              router.push('/');
            }}>Logout</button>
          </div>
        </div>
      </nav>

      <div className="container" style={{ paddingTop: '2rem' }}>
        <Link href="/challenges" style={{ color: '#9ca3af', fontSize: '0.85rem', textDecoration: 'none' }}>← Back to Challenges</Link>

        <div className="challenge-header" style={{ marginTop: '1rem' }}>
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>CHALLENGE #{challenge.order_num}</span>
              <span className={`badge ${diffClass(challenge.difficulty)}`}>{challenge.difficulty}</span>
              <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>{challenge.category}</span>
            </div>
            <h1>{challenge.name}</h1>
            <p style={{ color: '#9ca3af', marginTop: '0.5rem', maxWidth: '600px' }}>{challenge.description}</p>
          </div>
        </div>

        <div className="challenge-content">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3>Vulnerable Code</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowSecure(false)}
                style={!showSecure ? { borderColor: '#3b82f6', color: '#3b82f6' } : {}}>
                Vulnerable
              </button>
            </div>
            <pre className="code-block language-javascript" style={{ margin: 0 }}>
              <code className="language-javascript">
                {showSecure ? challenge.secure_code : challenge.vulnerable_code}
              </code>
            </pre>
          </div>

          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>Exploit</h3>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Submit Flag</h4>
              <div className="flag-input-group">
                <input
                  placeholder="Enter the flag (e.g. FLAG{...})"
                  value={flag}
                  onChange={e => setFlag(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && verifyFlag()}
                />
                <button className="btn btn-primary" onClick={verifyFlag}>Verify</button>
              </div>
              {result && (
                <div style={{ marginTop: '0.75rem' }}>
                  <span className={result.success ? 'success' : 'error'}>{result.message}</span>
                </div>
              )}
            </div>

            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ fontSize: '0.9rem' }}>Hints ({Math.max(0, hintIndex + 1)}/{challenge.hints.length})</h4>
                <button className="btn btn-outline btn-sm" onClick={useHint}
                  disabled={hintIndex >= challenge.hints.length - 1}
                  style={hintIndex >= challenge.hints.length - 1 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                  Reveal Hint
                </button>
              </div>
              {hintIndex >= 0 && (
                <div className="hint-box">
                  <p>{challenge.hints[hintIndex]}</p>
                </div>
              )}
              {hintIndex < 0 && (
                <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Stuck? Click "Reveal Hint" for guidance.</p>
              )}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ fontSize: '0.9rem' }}>Fix It</h4>
                <button className="btn btn-outline btn-sm" onClick={() => setShowSecure(!showSecure)}>
                  {showSecure ? 'Hide Fix' : 'Show Fix'}
                </button>
              </div>
              {showSecure ? (
                <p style={{ color: '#22c55e', fontSize: '0.85rem' }}>Showing the secure version in the code panel above.</p>
              ) : (
                <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Click "Show Fix" to see how to properly secure this code against the vulnerability.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
