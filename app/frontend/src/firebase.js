import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDVqlrEpda2Tqa8VHfDD56hMFkcbfRkejM",
  authDomain: "project-management-app-1517f.firebaseapp.com",
  projectId: "project-management-app-1517f",
  storageBucket: "project-management-app-1517f.firebasestorage.app",
  messagingSenderId: "498773285957",
  appId: "1:498773285957:web:a682697f4719280926172c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
