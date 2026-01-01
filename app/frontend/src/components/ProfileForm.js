import React, { useState } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';

const ProfileForm = ({ onComplete }) => {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    department: '',
    position: ''
  });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { refreshUserInfo, userInfo } = useAuth();
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const response = await api.put('/api/users/profile', formData);
      console.log('[ProfileForm] Profile updated successfully:', response.data);
      
      // ユーザー情報を再取得
      await refreshUserInfo();
      
      // 少し待ってから再度ユーザー情報を確認
      await new Promise(resolve => setTimeout(resolve, 500));
      await refreshUserInfo();
      
      // プロフィール送信成功メッセージを表示
      if (userInfo && !userInfo.is_approved) {
        setSuccessMessage(t('profile.submitted', 'Profile submitted successfully! An approval request has been sent to the administrator.'));
      } else {
        setSuccessMessage(t('profile.saved', 'Profile saved successfully!'));
      }
      
      // 少し待ってからリロード（メッセージを表示する時間を確保）
      setTimeout(() => {
        if (onComplete) {
          onComplete();
        } else {
          // onCompleteが指定されていない場合は、ページをリロード
          window.location.reload();
        }
      }, 2000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setError(error.response?.data?.error || 'Failed to update profile');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {t('profile.title', 'Complete Your Profile')}
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          {t('profile.description', 'Please provide your information to continue')}
        </p>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-md bg-green-50 p-4 border border-green-200">
            <p className="text-sm text-green-800">{successMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('profile.name', 'Name')} *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('profile.company', 'Company')} *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('profile.department', 'Department')} *
            </label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('profile.position', 'Position')} *
            </label>
            <select
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
            >
              <option value="">{t('profile.position.select', 'Select position')}</option>
              <option value="executor">{t('profile.position.executor', 'Project Executor')}</option>
              <option value="reviewer">{t('profile.position.reviewer', 'Project Reviewer')}</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {loading ? t('profile.saving', 'Saving...') : t('profile.save', 'Save Profile')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProfileForm;

