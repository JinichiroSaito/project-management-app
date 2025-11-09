import React, { useState, useEffect } from 'react';
import { useLanguage } from '../LanguageContext';
import axios from 'axios';

function ApprovePage({ token, onComplete }) {
  const [status, setStatus] = useState('loading'); // loading, success, error, already-approved
  const [message, setMessage] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    const approveUser = async () => {
      try {
        // 承認エンドポイントは認証不要なので、直接axiosを使用
        const API_URL = process.env.REACT_APP_API_URL || 'https://app-dev-823277232006.asia-northeast1.run.app';
        const response = await axios.get(`${API_URL}/api/users/approve?token=${token}`);
        
        if (response.data.message === 'Account is already approved') {
          setStatus('already-approved');
          setMessage(t('approval.alreadyApproved', 'Your account is already approved. You can now log in.'));
        } else {
          setStatus('success');
          setMessage(t('approval.approved', 'Your account has been approved successfully! You can now log in.'));
        }
      } catch (error) {
        console.error('Approval error:', error);
        setStatus('error');
        if (error.response?.data?.error) {
          setMessage(error.response.data.error);
        } else {
          setMessage(t('approval.error', 'An error occurred while approving your account. Please contact the administrator.'));
        }
      }
    };

    if (token) {
      approveUser();
    } else {
      setStatus('error');
      setMessage(t('approval.noToken', 'No approval token provided.'));
    }
  }, [token, t]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        {status === 'loading' && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{t('approval.processing', 'Processing approval...')}</p>
          </div>
        )}
        
        {status === 'success' && (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {t('approval.success', 'Account Approved')}
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700"
            >
              {t('approval.goToLogin', 'Go to Login')}
            </button>
          </div>
        )}
        
        {status === 'already-approved' && (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {t('approval.alreadyApprovedTitle', 'Already Approved')}
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700"
            >
              {t('approval.goToLogin', 'Go to Login')}
            </button>
          </div>
        )}
        
        {status === 'error' && (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {t('approval.errorTitle', 'Approval Failed')}
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700"
            >
              {t('approval.goToLogin', 'Go to Login')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ApprovePage;

