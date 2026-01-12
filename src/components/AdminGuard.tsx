import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { auth, db, firebaseInitError } from '../config/firebase';

type AdminGuardProps = {
  children: ReactNode;
};

export const AdminGuard = ({ children }: AdminGuardProps) => {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (firebaseInitError || !auth || !db) {
      navigate('/app', { state: { message: 'Sin acceso' } });
      setIsChecking(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/app', { state: { message: 'Sin acceso' } });
        setIsChecking(false);
        return;
      }

      const adminSnap = await getDoc(doc(db, 'admins', user.uid));
      const isActive = adminSnap.exists() && adminSnap.data()?.active === true;

      if (!isActive) {
        navigate('/app', { state: { message: 'Sin acceso' } });
      }

      setIsChecking(false);
    });

    return () => unsubscribe();
  }, [navigate]);

  if (isChecking) {
    return null;
  }

  return <>{children}</>;
};
