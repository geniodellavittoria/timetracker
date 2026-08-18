import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client.ts';
import { useRegister } from '../api/queries.ts';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const register = useRegister();
  const navigate = useNavigate();

  const mismatch = confirm.length > 0 && password !== confirm;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    register.mutate({ email, password }, { onSuccess: () => navigate('/', { replace: true }) });
  };

  return (
    <section className="settings">
      <h2>Registrieren</h2>
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
              type="password" autoComplete="new-password" minLength={8} required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="labelled">
            <span>Passwort bestätigen</span>
            <input
              type="password" autoComplete="new-password" required
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch || undefined}
            />
          </label>

          {mismatch && <p className="day-error" role="alert">Die Passwörter stimmen nicht überein.</p>}
          {register.error && (
            <p className="error-banner" role="alert">
              {register.error instanceof ApiError ? register.error.message : 'Registrierung fehlgeschlagen.'}
            </p>
          )}

          <button type="submit" className="primary" disabled={register.isPending || mismatch}>
            {register.isPending ? 'Registriert…' : 'Registrieren'}
          </button>
        </form>
      </div>
      <p className="muted small">
        Bereits ein Konto? <Link to="/login">Anmelden</Link>
      </p>
    </section>
  );
}
