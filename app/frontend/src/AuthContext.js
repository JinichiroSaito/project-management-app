import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth } from './firebase';
import api from './api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // ユーザー情報を取得
  const fetchUserInfo = async (firebaseUser) => {
    if (!firebaseUser) {
      setUserInfo(null);
      return;
    }

    try {
      const token = await firebaseUser.getIdToken();
      const response = await api.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUserInfo(response.data.user);
    } catch (error) {
      console.error('Error fetching user info:', error);
      setUserInfo(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchUserInfo(firebaseUser);
      } else {
        setUserInfo(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email, password) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    await fetchUserInfo(userCredential.user);
    return userCredential;
  };

  const signup = async (email, password) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // バックエンドにユーザー登録
    try {
      const token = await userCredential.user.getIdToken();
      const response = await api.post('/api/users/register', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('[Signup] Backend registration successful:', response.data);
    } catch (error) {
      console.error('[Signup] Error registering user:', error);
      console.error('[Signup] Error details:', error.response?.data);
      // 登録失敗でもFirebaseユーザーは作成されているので続行
      // ただし、エラーを再スローして呼び出し元で処理できるようにする
      throw new Error(error.response?.data?.error || 'Failed to register user in backend');
    }
    
    await fetchUserInfo(userCredential.user);
    return userCredential;
  };

  const logout = async () => {
    await signOut(auth);
    setUserInfo(null);
  };

  const refreshUserInfo = async () => {
    if (user) {
      await fetchUserInfo(user);
    }
  };

  const value = {
    user,
    userInfo,
    loading,
    login,
    signup,
    logout,
    refreshUserInfo,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
