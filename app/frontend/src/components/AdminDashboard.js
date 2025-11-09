import React, { useState, useEffect } from 'react';
import api from '../api';
import { useLanguage } from '../LanguageContext';

const AdminDashboard = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'all'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPendingUsers();
    } else {
      fetchAllUsers();
    }
    
    // 30秒ごとにデータを更新（ポーリング、ローディング表示なし）
    const interval = setInterval(() => {
      if (activeTab === 'pending') {
        fetchPendingUsers(false);
      } else {
        fetchAllUsers(false);
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [activeTab]);

  const fetchPendingUsers = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const response = await api.get('/api/admin/users/pending');
      setPendingUsers(response.data.users);
      setError('');
    } catch (error) {
      console.error('Error fetching pending users:', error);
      setError(error.response?.data?.error || 'Failed to fetch pending users');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const fetchAllUsers = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const response = await api.get('/api/admin/users');
      setAllUsers(response.data.users);
      setError('');
    } catch (error) {
      console.error('Error fetching all users:', error);
      setError(error.response?.data?.error || 'Failed to fetch users');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleApprove = async (userId) => {
    try {
      await api.post(`/api/admin/users/${userId}/approve`);
      setPendingUsers(pendingUsers.filter(user => user.id !== userId));
      setError('');
      setSuccessMessage(t('admin.approvedSuccess', 'User approved successfully'));
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchPendingUsers(); // リストを更新
      if (activeTab === 'all') {
        fetchAllUsers(); // 全ユーザーリストも更新
      }
    } catch (error) {
      console.error('Error approving user:', error);
      setError(error.response?.data?.error || 'Failed to approve user');
    }
  };

  const handleDelete = async (userId, userEmail) => {
    const confirmMessage = t('admin.deleteConfirm', `Are you sure you want to delete user ${userEmail}?`).replace('{email}', userEmail);
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      await api.delete(`/api/admin/users/${userId}`);
      setPendingUsers(pendingUsers.filter(user => user.id !== userId));
      setAllUsers(allUsers.filter(user => user.id !== userId));
      setError('');
      setSuccessMessage(t('admin.deletedSuccess', 'User deleted successfully'));
      setTimeout(() => setSuccessMessage(''), 3000);
      // リストを更新
      if (activeTab === 'pending') {
        fetchPendingUsers();
      } else {
        fetchAllUsers();
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      setError(error.response?.data?.error || 'Failed to delete user');
    }
  };

  const currentUsers = activeTab === 'pending' ? pendingUsers : allUsers;
  const isPendingTab = activeTab === 'pending';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {t('admin.title', 'Admin Dashboard')}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {t('admin.subtitle', 'Approve pending user registrations from the list below')}
        </p>
      </div>

      {/* タブ切り替えと更新ボタン */}
      <div className="mb-4 flex justify-between items-center border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pending'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t('admin.tab.pending', 'Pending Approval')} ({pendingUsers.length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'all'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t('admin.tab.all', 'All Users')} ({allUsers.length})
          </button>
        </nav>
        <button
          onClick={() => {
            if (activeTab === 'pending') {
              fetchPendingUsers();
            } else {
              fetchAllUsers();
            }
          }}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          {t('admin.refresh', 'Refresh')}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded-md bg-green-50 p-4">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">{t('projects.loading')}</div>
        </div>
      ) : currentUsers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {isPendingTab 
              ? t('admin.noPendingUsers', 'No pending user approvals')
              : t('admin.noUsers', 'No users found')}
          </p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
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
                {!isPendingTab && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('admin.status', 'Status')}
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.createdAt', 'Created At')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.actions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentUsers.map((user) => (
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
                    {user.position === 'executor' 
                      ? t('profile.position.executor', 'Project Executor')
                      : user.position === 'reviewer'
                      ? t('profile.position.reviewer', 'Project Reviewer')
                      : user.position || '-'}
                  </td>
                  {!isPendingTab && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        user.is_approved 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {user.is_approved 
                          ? t('admin.status.approved', 'Approved')
                          : t('admin.status.pending', 'Pending')}
                      </span>
                      {user.is_admin && (
                        <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                          {t('admin.status.admin', 'Admin')}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      {!user.is_approved && (
                        <button
                          onClick={() => handleApprove(user.id)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                        >
                          {t('admin.approve', 'Approve')}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(user.id, user.email)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                      >
                        {t('admin.delete', 'Delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

