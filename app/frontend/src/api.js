import axios from 'axios';
import { auth } from './firebase';

// 環境変数でAPIのURLを切り替え（デフォルトはDevelopment）
const API_URL = process.env.REACT_APP_API_URL || 'https://app-dev-823277232006.asia-northeast1.run.app';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// リクエストインターセプター（認証トークンを自動付与）
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    try {
      // トークンを強制的に再取得（最新のトークンを取得）
      const token = await user.getIdToken(true);
      config.headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      console.error('[API] Error getting token:', error);
      // トークン取得に失敗した場合は、再取得を試みない
      const token = await user.getIdToken(false);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  }
  // FormDataの場合はContent-Typeを自動設定しない（ブラウザが自動設定する）
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// レスポンスインターセプター（401エラー時にトークンを再取得してリトライ）
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // 401エラーで、まだリトライしていない場合
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const user = auth.currentUser;
      if (user) {
        try {
          // トークンを強制的に再取得
          const token = await user.getIdToken(true);
          originalRequest.headers.Authorization = `Bearer ${token}`;
          
          // リクエストを再試行
          return api(originalRequest);
        } catch (tokenError) {
          console.error('[API] Error refreshing token:', tokenError);
          return Promise.reject(error);
        }
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
