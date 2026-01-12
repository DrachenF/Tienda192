import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { bootstrapAdminForUser } from '../auth/adminBootstrap';
import { auth, firebaseInitError } from '../config/firebase';
import { storeName } from '../config/appSettings';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (firebaseInitError || !auth) {
      setError(firebaseInitError ?? 'Firebase no está configurado.');
      return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/app');
    } catch (err) {
      setError('No se pudo iniciar sesión. Verifica tus datos.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError(null);

    if (firebaseInitError || !auth) {
      setError(firebaseInitError ?? 'Firebase no está configurado.');
      return;
    }

    try {
      setLoading(true);
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await bootstrapAdminForUser(result.user.uid);
      navigate('/app');
    } catch (err) {
      setError('No se pudo registrar. Revisa los datos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container stack">
      <div>
        <h1>Ingreso {storeName ? `- ${storeName}` : ''}</h1>
        <p className="helper">Acceso para clientes y admin.</p>
      </div>

      {firebaseInitError && (
        <div className="alert">
          Firebase no está configurado. Revisa tu archivo .env.local.
        </div>
      )}

      {error && <div className="alert">{error}</div>}

      <form className="stack" onSubmit={handleLogin}>
        <div>
          <label htmlFor="email">Correo</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>

      <button type="button" onClick={handleRegister} disabled={loading}>
        {loading ? 'Registrando...' : 'Crear cuenta'}
      </button>
    </div>
  );
};
