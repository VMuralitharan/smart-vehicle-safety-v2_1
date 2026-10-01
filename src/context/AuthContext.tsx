import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../config/firebase';

type AuthState = { user: User | null; loading: boolean };
const Context = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    return onAuthStateChanged(auth, current => {
      setUser(current);
      setLoading(false);
    }, () => setLoading(false));
  }, []);
  return <Context.Provider value={{ user, loading }}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
