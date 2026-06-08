import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../_app';

export default function Challenges() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [challenges, setChallenges] = useState([]);
  const [progress, setProgress] = useState({});

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/login'); return; }

    fetch('http://localhost:3001/api/challenges')
      .then(r => r.json())
      .then(data => setChallenges(data))
      .catch(() => {});

    fetch('http://localhost:3001/api/progress', {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
    }).then(r => r.json()).then(data => {
      const map = {};
      data.forEach(p => { map[p.challenge_id] = p; });
      setProgress(map);
    }).catch(() => {});
  }, [user, loading]);

  const diffClass = (d) => {
    const map = { Easy: 'badge-easy', Medium: 'badge-medium', Hard: 'badge-hard' };
    return map[d] || '';
  };

  if (loading) return <div className="container" style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>;
  if (!user) return null;

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1>VulnForge Challenges</h1>
            <p style={{ color: '#9ca3af' }}>From easy misconfigurations to advanced SSRF - exploit them all</p>
          </div>
        </div>

        <div className="grid grid-2">
          {challenges.map((c) => {
            const p = progress[c.id];
            const done = p && p.completed === 1;
            return (
              <Link
                key={c.id}
                href={`/challenges/${c.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div className="card" style={{ cursor: 'pointer', borderColor: done ? 'rgba(34,197,94,0.3)' : undefined, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <span style={{ color: '#6b7280', fontSize: '0.8rem', fontWeight: 600 }}>#{c.order_num}</span>
                    <div className="challenge-meta">
                      <span className={`badge ${diffClass(c.difficulty)}`}>{c.difficulty}</span>
                      {done && <span className="badge badge-completed">Completed</span>}
                    </div>
                  </div>
                  <h3 style={{ marginBottom: '0.5rem', color: done ? '#22c55e' : undefined }}>{c.name}</h3>
                  <p style={{ color: '#9ca3af', fontSize: '0.85rem', lineHeight: 1.5 }}>{c.description.substring(0, 120)}...</p>
                  <div style={{ marginTop: '0.75rem' }}>
                    <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: '0.75rem' }}>{c.category}</span>
                  </div>
                  {done && <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '100%', background: '#22c55e' }} />}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
