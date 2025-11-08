import React, { useState, useEffect } from 'react';
import api from '../api';
import { useLanguage } from '../LanguageContext';

const AdminDashboard = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendingEmails, setSendingEmails] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/admin/users/pending');
      setPendingUsers(response.data.users);
      setError('');
    } catch (error) {
      console.error('Error fetching pending users:', error);
      setError(error.response?.data?.error || 'Failed to fetch pending users');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId) => {
    try {
      await api.post(`/api/admin/users/${userId}/approve`);
      setPendingUsers(pendingUsers.filter(user => user.id !== userId));
      setError('');
      fetchPendingUsers(); // リストを更新
    } catch (error) {
      console.error('Error approving user:', error);
      setError(error.response?.data?.error || 'Failed to approve user');
    }
  };

  const handleResendApprovalRequests = async () => {
    try {
      setSendingEmails(true);
      setError('');
      const response = await api.post('/api/admin/users/resend-approval-requests');
      alert(`${response.data.sent}件の承認依頼メールを送信しました。`);
    } catch (error) {
      console.error('Error resending approval requests:', error);
      setError(error.response?.data?.error || 'Failed to resend approval request emails');
    } finally {
      setSendingEmails(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">{t('projects.loading')}</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {t('admin.title', 'Admin Dashboard')}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {t('admin.subtitle', 'Approve pending user registrations')}
          </p>
        </div>
        {pendingUsers.length > 0 && (
          <button
            onClick={handleResendApprovalRequests}
            disabled={sendingEmails}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendingEmails 
              ? t('admin.sending', 'Sending...') 
              : t('admin.resendEmails', 'Resend Approval Request Emails')}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {pendingUsers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {t('admin.noPendingUsers', 'No pending user approvals')}
          </p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.email', 'Email')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.name', 'Name')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.company', 'Company')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.department', 'Department')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.position', 'Position')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.createdAt', 'Created At')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.actions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pendingUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.company || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.department || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.position || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleApprove(user.id)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      {t('admin.approve', 'Approve')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

