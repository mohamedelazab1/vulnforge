import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './_app';
import { useRouter } from 'next/router';

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [progress, setProgress] = useState([]);
  const [challenges, setChallenges] = useState([]);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/login'); return; }

    fetch('http://localhost:3001/api/challenges')
      .then(r => r.json())
      .then(data => setChallenges(data))
      .catch(() => {});

    fetch('http://localhost:3001/api/progress', {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
    }).then(r => r.json()).then(data => setProgress(data))
      .catch(() => {});
  }, [user, loading]);

  const completed = progress.filter(p => p.completed === 1).length;
  const totalHints = progress.reduce((sum, p) => sum + p.hints_used, 0);
  const pct = challenges.length > 0 ? Math.round((completed / challenges.length) * 100) : 0;

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
            <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{user.username}</span>
            <button className="btn btn-outline btn-sm" onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              router.push('/');
            }}>Logout</button>
          </div>
        </div>
      </nav>

      <div className="dashboard">
        <div className="container">
          <h2>Dashboard</h2>

          <div className="dashboard-grid">
            <div>
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Progress Overview</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{completed} of {challenges.length} challenges completed</span>
                  <span style={{ color: '#3b82f6', fontWeight: 600 }}>{pct}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: pct + '%' }} />
                </div>
              </div>

              <h3 style={{ marginBottom: '1rem' }}>Challenge Details</h3>
              {challenges.map(c => {
                const p = progress.find(pr => pr.challenge_id === c.id);
                const done = p && p.completed === 1;
                const hints = p ? p.hints_used : 0;
                return (
                  <Link key={c.id} href={`/challenges/${c.id}`} style={{ textDecoration: 'none' }}>
                    <div className="card" style={{ marginBottom: '0.75rem', cursor: 'pointer', borderColor: done ? 'rgba(34,197,94,0.3)' : undefined }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ color: '#6b7280', fontSize: '0.8rem', fontWeight: 600, minWidth: '1.5rem' }}>#{c.order_num}</span>
                          <span style={{ fontSize: '0.9rem', color: done ? '#22c55e' : undefined }}>{c.name}</span>
                          <span className={`badge ${diffClass(c.difficulty)}`}>{c.difficulty}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {hints > 0 && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{hints} hints</span>}
                          {done ? (
                            <span className="badge badge-completed">Done</span>
                          ) : (
                            <span className="badge" style={{ background: 'rgba(107,114,128,0.1)', color: '#6b7280' }}>Pending</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div>
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Statistics</h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #1f2937' }}>
                    <span style={{ color: '#9ca3af' }}>Completed</span>
                    <span style={{ fontWeight: 600, color: '#22c55e' }}>{completed}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #1f2937' }}>
                    <span style={{ color: '#9ca3af' }}>Pending</span>
                    <span style={{ fontWeight: 600, color: '#eab308' }}>{challenges.length - completed}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #1f2937' }}>
                    <span style={{ color: '#9ca3af' }}>Hints Used</span>
                    <span style={{ fontWeight: 600 }}>{totalHints}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                    <span style={{ color: '#9ca3af' }}>Progress</span>
                    <span style={{ fontWeight: 600, color: '#3b82f6' }}>{pct}%</span>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 style={{ marginBottom: '1rem' }}>Quick Links</h3>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <Link href="/challenges" className="btn btn-primary" style={{ textAlign: 'center' }}>All Challenges</Link>
                  <Link href="/" className="btn btn-outline" style={{ textAlign: 'center' }}>Home</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
