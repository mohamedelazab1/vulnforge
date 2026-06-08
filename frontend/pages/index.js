import Link from 'next/link';
import { useAuth } from './_app';
import { useEffect, useState } from 'react';

export default function Home() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({ total: 11, completed: 0 });

  useEffect(() => {
    if (user) {
      fetch('http://localhost:3001/api/progress', {
        headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
      }).then(r => r.json()).then(data => {
        const done = data.filter(p => p.completed === 1).length;
        setStats({ total: 11, completed: done });
      }).catch(() => {});
    }
  }, [user]);

  return (
    <>
      <nav>
        <div className="container">
          <Link href="/" className="logo">Vuln<span>Forge</span></Link>
          <div className="nav-links">
            {user ? (
              <>
                <Link href="/challenges">Challenges</Link>
                <Link href="/dashboard">Dashboard</Link>
                <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{user.username}</span>
                <button className="btn btn-outline btn-sm" onClick={logout}>Logout</button>
              </>
            ) : (
              <>
                <Link href="/login">Login</Link>
                <Link href="/login?register=true" className="btn btn-primary btn-sm">Register</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="hero">
        <div className="container">
          <h1>Learn <span>OWASP Top 10</span> Web Vulnerabilities</h1>
          <p>A hands-on training platform with real vulnerable scenarios. Exploit, learn, and master web security from easy to hard.</p>

          <div className="hero-stats">
            <div className="stat">
              <div className="stat-value">11</div>
              <div className="stat-label">Vulnerabilities</div>
            </div>
            <div className="stat">
              <div className="stat-value">4</div>
              <div className="stat-label">Difficulty Levels</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.completed}/{stats.total}</div>
              <div className="stat-label">Completed</div>
            </div>
          </div>

          {!user && (
            <Link href="/login" className="btn btn-primary" style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>
              Get Started
            </Link>
          )}
          {user && (
            <Link href="/challenges" className="btn btn-primary" style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>
              Start Hacking
            </Link>
          )}
        </div>
      </div>

      <div className="container">
        <div className="features">
          <div className="feature">
            <h3><span className="icon">🛡️</span>Real Vulnerabilities</h3>
            <p>Not just examples - real vulnerable code running in a safe environment. Exploit actual security flaws.</p>
          </div>
          <div className="feature">
            <h3><span className="icon">📈</span>Easy to Hard</h3>
            <p>Start with simple misconfigurations and work up to advanced SSRF and XXE attacks. Progressive learning curve.</p>
          </div>
          <div className="feature">
            <h3><span className="icon">💡</span>Hint System</h3>
            <p>Stuck on a challenge? Use hints to guide you toward the solution without giving away the answer entirely.</p>
          </div>
          <div className="feature">
            <h3><span className="icon">🔧</span>Fix It Mode</h3>
            <p>See the secure version of each vulnerable code snippet to understand how to properly defend against each attack.</p>
          </div>
          <div className="feature">
            <h3><span className="icon">📊</span>Track Progress</h3>
            <p>Your dashboard tracks completed challenges and hints used so you can monitor your learning journey.</p>
          </div>
          <div className="feature">
            <h3><span className="icon">🏴</span>Capture The Flag</h3>
            <p>Each challenge has a unique flag to capture. Find all 10 to become an OWASP Top 10 master!</p>
          </div>
        </div>
      </div>
    </>
  );
}
