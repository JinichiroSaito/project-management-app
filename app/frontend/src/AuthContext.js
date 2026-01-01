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
      console.log('[AuthContext] Fetching user info for:', firebaseUser.email);
      const token = await firebaseUser.getIdToken();
      console.log('[AuthContext] Got token, calling /api/auth/me');
      
      // API呼び出しにタイムアウトを設定
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await api.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        timeout: 5000
      });
      
      clearTimeout(timeoutId);
      console.log('[AuthContext] User info received:', response.data.user);
      setUserInfo(response.data.user);
      return response.data.user;
    } catch (error) {
      if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
        console.error('[AuthContext] Timeout fetching user info');
      } else {
        console.error('[AuthContext] Error fetching user info:', error);
      }
      setUserInfo(null);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;
    let loadingResolved = false;
    
    const resolveLoading = () => {
      if (isMounted && !loadingResolved) {
        loadingResolved = true;
        console.log('[AuthContext] Resolving loading state');
        setLoading(false);
      }
    };
    
    console.log('[AuthContext] Setting up auth state listener');
    
    // Firebase認証の初期化を確認
    try {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (!isMounted) return;
        
        console.log('[AuthContext] Auth state changed:', firebaseUser ? firebaseUser.email : 'no user');
        
        setUser(firebaseUser);
        if (firebaseUser) {
          try {
            // fetchUserInfoにタイムアウトを設定
            const fetchPromise = fetchUserInfo(firebaseUser);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Fetch user info timeout')), 5000)
            );
            
            await Promise.race([fetchPromise, timeoutPromise]);
            console.log('[AuthContext] User info fetched successfully');
          } catch (error) {
            console.error('[AuthContext] Error fetching user info:', error);
            // エラーが発生してもローディングを解除
          }
        } else {
          setUserInfo(null);
          console.log('[AuthContext] No user, setting userInfo to null');
        }
        
        resolveLoading();
      }, (error) => {
        // 認証エラーが発生した場合
        console.error('[AuthContext] Auth state change error:', error);
        if (isMounted) {
          setUser(null);
          setUserInfo(null);
          resolveLoading();
        }
      });

      // タイムアウト設定（10秒後に強制的にローディングを解除）
      const timeoutId = setTimeout(() => {
        console.warn('[AuthContext] Auth state change timeout, setting loading to false');
        resolveLoading();
      }, 10000);

      return () => {
        isMounted = false;
        clearTimeout(timeoutId);
        unsubscribe();
      };
    } catch (error) {
      console.error('[AuthContext] Error setting up auth state listener:', error);
      // エラーが発生してもローディングを解除
      resolveLoading();
      return () => {
        isMounted = false;
      };
    }
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
