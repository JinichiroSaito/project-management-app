import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Firebase configuration for project-management-app-c1f78
const firebaseConfig = {
  apiKey: "AIzaSyCkIXVpptpoFWS0kgK-Nt0aIcURjMV6_Uw",
  authDomain: "project-management-app-c1f78.firebaseapp.com",
  projectId: "project-management-app-c1f78",
  storageBucket: "project-management-app-c1f78.firebasestorage.app",
  messagingSenderId: "924039910808",
  appId: "1:924039910808:web:b8befa1e5113441541c7ed",
  measurementId: "G-XWXBLY9LXT"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
