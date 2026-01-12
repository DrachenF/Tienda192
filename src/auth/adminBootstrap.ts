import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { db, firebaseInitError } from '../config/firebase';

type BootstrapResult = {
  role: 'admin' | 'client';
  isFirstAdmin: boolean;
};

export const bootstrapAdminForUser = async (
  uid: string,
): Promise<BootstrapResult> => {
  if (firebaseInitError || !db) {
    throw new Error(firebaseInitError ?? 'Firebase no está configurado.');
  }

  const adminsQuery = query(collection(db, 'admins'), limit(1));
  const adminsSnapshot = await getDocs(adminsQuery);
  const userRef = doc(db, 'users', uid);

  if (adminsSnapshot.empty) {
    const adminRef = doc(db, 'admins', uid);

    await Promise.all([
      setDoc(adminRef, { active: true, createdAt: serverTimestamp() }),
      setDoc(userRef, { role: 'admin' }, { merge: true }),
    ]);

    return { role: 'admin', isFirstAdmin: true };
  }

  await setDoc(userRef, { role: 'client' }, { merge: true });

  return { role: 'client', isFirstAdmin: false };
};
