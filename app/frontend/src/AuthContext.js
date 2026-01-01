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
      return null;
    }

    try {
      const token = await firebaseUser.getIdToken();
      const response = await api.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUserInfo(response.data.user);
      return response.data.user;
    } catch (error) {
      console.error('Error fetching user info:', error);
      setUserInfo(null);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;
      
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          await fetchUserInfo(firebaseUser);
        } catch (error) {
          console.error('[AuthContext] Error fetching user info:', error);
          // エラーが発生してもローディングを解除
        }
      } else {
        setUserInfo(null);
      }
      
      if (isMounted) {
        setLoading(false);
      }
    });

    // タイムアウト設定（10秒後に強制的にローディングを解除）
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn('[AuthContext] Auth state change timeout, setting loading to false');
        setLoading(false);
      }
    }, 10000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const userInfoData = await fetchUserInfo(userCredential.user);
    
    // 承認待ちの場合はログアウト
    if (userInfoData && !userInfoData.is_approved) {
      console.log('[Login] User is pending approval, logging out...');
      await signOut(auth);
      setUserInfo(null);
      throw new Error('PENDING_APPROVAL');
    }
    
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
      
      // ユーザー情報を取得して承認状態を確認
      const userInfoData = await fetchUserInfo(userCredential.user);
      
      // 承認待ちの場合は、プロフィール入力画面を表示するため、ログアウトしない
      // プロフィール情報が入力されていない場合は、App.jsでプロフィール入力画面が表示される
      if (userInfoData && !userInfoData.is_approved) {
        console.log('[Signup] User is pending approval, profile form will be shown');
        // ログアウトせず、そのまま続行（App.jsでプロフィール入力画面が表示される）
      }
    } catch (error) {
      console.error('[Signup] Error registering user:', error);
      console.error('[Signup] Error details:', error.response?.data);
      
      // 承認待ちの場合は特別な処理（エラーとして扱わない）
      if (error.message === 'PENDING_APPROVAL') {
        throw error; // 呼び出し元で特別に処理
      }
      
      // その他のエラーは再スロー
      throw new Error(error.response?.data?.error || 'Failed to register user in backend');
    }
    
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
      {loading ? (
        <div className="flex justify-center items-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">読み込み中...</p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
