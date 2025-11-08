import React, { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { LanguageProvider, useLanguage } from './LanguageContext';
import Login from './components/Login';
import Header from './components/Header';
import ProjectList from './components/ProjectList';
import AdminDashboard from './components/AdminDashboard';
import ProfileForm from './components/ProfileForm';

function AppContentInner() {
  const { user, userInfo } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);
  const { t } = useLanguage();

  if (!user) {
    return <Login />;
  }

  // 承認待ち状態
  if (userInfo && !userInfo.is_approved) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-yellow-800 mb-2">
              {t('approval.pending', 'Account Pending Approval')}
            </h2>
            <p className="text-yellow-700">
              {t('approval.message', 'Your account is pending approval. Please wait for an administrator to approve your registration.')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // プロフィール未登録（承認済みだがプロフィール情報がない）
  if (userInfo && userInfo.is_approved && userInfo.needsProfile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <ProfileForm onComplete={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      {userInfo?.is_admin && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex space-x-4">
            <button
              onClick={() => setShowAdmin(!showAdmin)}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                showAdmin
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {showAdmin ? t('admin.hideDashboard', 'Hide Admin Dashboard') : t('admin.showDashboard', 'Show Admin Dashboard')}
            </button>
          </div>
        </div>
      )}
      {showAdmin && userInfo?.is_admin ? (
        <AdminDashboard />
      ) : (
        <ProjectList />
      )}
    </div>
  );
}

function AppContent() {
  return (
    <LanguageProvider>
      <AppContentInner />
    </LanguageProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
