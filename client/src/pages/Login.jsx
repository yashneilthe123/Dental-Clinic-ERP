import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { Button, Field, Input } from '../components/ui.jsx';

const DEMO = [
  ['Admin', 'admin@clinic.com'],
  ['Dentist', 'priya@clinic.com'],
  ['Reception', 'reception@clinic.com'],
  ['Accounts', 'accounts@clinic.com'],
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-900 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-700 text-2xl">🦷</div>
          <span className="text-lg font-bold text-white">SmileCare ERP</span>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-bold leading-tight text-white">
            Run your whole clinic from one place.
          </h1>
          <p className="mt-4 max-w-md text-brand-100/80">
            Patients, dental charts, appointments, treatment plans, billing and inventory, built for small and mid-size dental practices.
          </p>
        </div>
        <p className="text-xs text-brand-200/60">© {new Date().getFullYear()} SmileCare</p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-700/40 blur-3xl" />
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-2xl font-bold">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your clinic staff account.</p>

          <div className="mt-8 space-y-4">
            <Field label="Email">
              <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
          </div>

          <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-4">
            <p className="text-xs font-semibold text-slate-500">Demo accounts · password <code>Password@123</code></p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DEMO.map(([label, mail]) => (
                <button
                  type="button"
                  key={mail}
                  onClick={() => { setEmail(mail); setPassword('Password@123'); }}
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-800"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
