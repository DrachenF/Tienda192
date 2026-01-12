import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { bootstrapAdminForUser } from '../auth/adminBootstrap';
import { auth, db, firebaseInitError } from '../config/firebase';
import { storeName } from '../config/appSettings';

const CLUSTERS = ['1', '2', '3', '4', '5'];
const INVALID_PINS = new Set(['0000', '1111', '1234']);

export const LoginPage = () => {
  const navigate = useNavigate();
  const [cluster, setCluster] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const houseKey = useMemo(
    () => (cluster && houseNumber ? `${cluster}-${houseNumber}` : ''),
    [cluster, houseNumber],
  );

  const pinIsValid = pin.length === 4 && /^\d{4}$/.test(pin) && !INVALID_PINS.has(pin);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (firebaseInitError || !auth) {
      setError(firebaseInitError ?? 'Firebase no está configurado.');
      return;
    }

    if (!cluster || !houseNumber || !phone || !pin) {
      setError('Completa todos los campos obligatorios.');
      return;
    }

    if (!pinIsValid) {
      setError('El PIN debe tener 4 dígitos y no puede ser 0000, 1111 o 1234.');
      return;
    }

    try {
      setLoading(true);
      const email = `casa-${cluster}-${houseNumber}@app.local`;
      await signInWithEmailAndPassword(auth, email, pin);
      navigate('/app');
    } catch (err) {
      setError('No se pudo iniciar sesión. Verifica tus datos.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError(null);

    if (firebaseInitError || !auth || !db) {
      setError(firebaseInitError ?? 'Firebase no está configurado.');
      return;
    }

    if (!cluster || !houseNumber || !phone || !pin) {
      setError('Completa todos los campos obligatorios.');
      return;
    }

    if (!pinIsValid) {
      setError('El PIN debe tener 4 dígitos y no puede ser 0000, 1111 o 1234.');
      return;
    }

    try {
      setLoading(true);
      const existsQuery = query(
        collection(db, 'users'),
        where('houseKey', '==', houseKey),
        limit(1),
      );
      const existing = await getDocs(existsQuery);
      if (!existing.empty) {
        setError('Esta casa ya está registrada');
        return;
      }

      const email = `casa-${cluster}-${houseNumber}@app.local`;
      const result = await createUserWithEmailAndPassword(auth, email, pin);
      await setDoc(doc(db, 'users', result.user.uid), {
        cluster,
        houseNumber,
        houseKey,
        phone,
        name: name || null,
        role: 'client',
        createdAt: serverTimestamp(),
      });
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
          <label htmlFor="cluster">Cluster</label>
          <select
            id="cluster"
            value={cluster}
            onChange={(event) => setCluster(event.target.value)}
            required
          >
            <option value="">Selecciona</option>
            {CLUSTERS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="houseNumber">Número de casa</label>
          <input
            id="houseNumber"
            inputMode="numeric"
            value={houseNumber}
            onChange={(event) => setHouseNumber(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="phone">Teléfono / WhatsApp</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="pin">PIN</label>
          <input
            id="pin"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            required
          />
          <p className="helper">Crea un PIN de 4 números (no es contraseña).</p>
        </div>
        <div>
          <label htmlFor="name">Nombre (opcional)</label>
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>

      <button type="button" onClick={handleRegister} disabled={loading}>
        {loading ? 'Registrando...' : 'Crear cuenta'}
      </button>
      <p className="helper">
        Recuperación de PIN solo vía WhatsApp con la tienda.
      </p>
    </div>
  );
};
