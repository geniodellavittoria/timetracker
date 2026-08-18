import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client.ts';
import { useLogin } from '../api/queries.ts';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate('/', { replace: true }) });
  };

  return (
    <section className="settings">
      <h2>Anmelden</h2>
      <div className="card settings-card">
        <form onSubmit={submit}>
          <label className="labelled">
            <span>E-Mail</span>
            <input
              type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="labelled">
            <span>Passwort</span>
            <input
              type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {login.error && (
            <p className="error-banner" role="alert">
              {login.error instanceof ApiError ? login.error.message : 'Anmeldung fehlgeschlagen.'}
            </p>
          )}

          <button type="submit" className="primary" disabled={login.isPending}>
            {login.isPending ? 'Meldet an…' : 'Anmelden'}
          </button>
        </form>
      </div>
      <p className="muted small">
        Noch kein Konto? <Link to="/register">Registrieren</Link>
      </p>
    </section>
  );
}
