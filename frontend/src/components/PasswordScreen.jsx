import { useState, useEffect, useRef } from 'react';

export default function PasswordScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const ok = onLogin(password);
    if (!ok) {
      setError('Incorrect password, try again');
      setShaking(true);
      setPassword('');
      setTimeout(() => setShaking(false), 600);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className="password-screen">
      <div className={`password-screen__card ${shaking ? 'password-screen__card--shake' : ''}`}>
        <img src="/logo.png" alt="" className="password-screen__logo" width={80} height={80} />
        <h1 className="password-screen__title">Drive Streamer</h1>
        <p className="password-screen__subtitle">Enter password to continue</p>

        <form className="password-screen__form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="password"
            className="password-screen__input"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            placeholder="Password"
            autoComplete="current-password"
            aria-label="Password"
          />
          <button
            type="submit"
            className="password-screen__btn"
            disabled={!password}
          >
            Unlock
          </button>
        </form>

        {error && (
          <p className="password-screen__error">{error}</p>
        )}
      </div>
    </div>
  );
}

