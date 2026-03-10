import { useState, useEffect } from 'react';

const SESSION_KEY = 'gds_authenticated';
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD;

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    setAuthenticated(stored === 'true');
    setLoading(false);
  }, []);

  /** Returns true on correct password, false otherwise. */
  const login = (password) => {
    if (password === APP_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setAuthenticated(true);
      return true;
    }
    return false;
  };

  return { authenticated, loading, login };
}

