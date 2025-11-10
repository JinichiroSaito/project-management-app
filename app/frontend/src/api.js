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
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  // FormDataの場合はContent-Typeを自動設定しない（ブラウザが自動設定する）
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

export default api;
