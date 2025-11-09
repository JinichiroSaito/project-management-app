import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const { login, signup } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (isSignup) {
        await signup(email, password);
        // 通常はここに到達しない（承認待ちの場合はログアウトされる）
      } else {
        await login(email, password);
      }
    } catch (error) {
      // 承認待ちの場合は特別なメッセージを表示
      if (error.message === 'PENDING_APPROVAL') {
        if (isSignup) {
          setError(t('signUp.pendingApproval', 'Registration successful! Please check your email and click the approval link to activate your account.'));
        } else {
          setError(t('signIn.pendingApproval', 'Your account is pending approval. Please check your email and click the approval link to activate your account.'));
        }
      } else {
        setError(error.message);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="flex justify-end mb-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setLanguage('en')}
              className={`px-3 py-1 text-sm rounded-md ${
                language === 'en'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {t('language.english')}
            </button>
            <button
              onClick={() => setLanguage('ja')}
              className={`px-3 py-1 text-sm rounded-md ${
                language === 'ja'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {t('language.japanese')}
            </button>
          </div>
        </div>
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isSignup ? t('signUp.title') : t('signIn.title')}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">{t('signIn.email')}</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder={t('signIn.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">{t('signIn.password')}</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder={t('signIn.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {isSignup ? t('signUp.submit') : t('signIn.submit')}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
              className="text-indigo-600 hover:text-indigo-500"
            >
              {isSignup ? t('signUp.switchToSignin') : t('signIn.switchToSignup')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
