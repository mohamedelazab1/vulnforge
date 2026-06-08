import '../styles/globals.css';
import 'prismjs/themes/prism-tomorrow.css';
import { useState, useEffect, createContext, useContext } from 'react';

export const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

function MyApp({ Component, pageProps }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (t && u) {
      try {
        setToken(t);
        setUser(JSON.parse(u));
      } catch {}
    }
    setLoading(false);
  }, []);

  const login = (t, u) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      <Component {...pageProps} />
    </AuthContext.Provider>
  );
}

export default MyApp;
