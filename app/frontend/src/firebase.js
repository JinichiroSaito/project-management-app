import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Firebase configuration for project-management-app-c1f78
// 環境変数から取得（ビルド時に設定される）
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyCkIXVpptpoFWS0kgK-Nt0aIcURjMV6_Uw",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "project-management-app-c1f78.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "project-management-app-c1f78",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "project-management-app-c1f78.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "924039910808",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:924039910808:web:b8befa1e5113441541c7ed",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-XWXBLY9LXT"
};

// 環境変数が設定されていない場合の警告（開発環境のみ）
if (process.env.NODE_ENV === 'development' && !process.env.REACT_APP_FIREBASE_API_KEY) {
  console.warn('[Firebase] REACT_APP_FIREBASE_API_KEY is not set. Using default value. Please set environment variables for production.');
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
