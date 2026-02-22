import { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithRedirect,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  const signup = (email, password) =>
    auth ? createUserWithEmailAndPassword(auth, email, password) : Promise.reject(new Error('Firebase not configured'));

  const login = (email, password) =>
    auth ? signInWithEmailAndPassword(auth, email, password) : Promise.reject(new Error('Firebase not configured'));

  const logout = () =>
    auth ? signOut(auth) : Promise.resolve();

  const googleLogin = () =>
    auth ? signInWithRedirect(auth, new GoogleAuthProvider()) : Promise.reject(new Error('Firebase not configured'));

  return (
    <AuthContext.Provider value={{ user, authLoading, signup, login, logout, googleLogin }}>
      {!authLoading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
