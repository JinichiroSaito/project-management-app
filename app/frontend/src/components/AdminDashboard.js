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
  const [editingUser, setEditingUser] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [approvalRoutes, setApprovalRoutes] = useState([
    { amount_threshold: '<100m', reviewer_ids: [], final_approver_user_id: null },
    { amount_threshold: '>=100m', reviewer_ids: [], final_approver_user_id: null }
  ]);
  const [savingRoute, setSavingRoute] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPendingUsers();
    } else {
      fetchAllUsers();
    }
    fetchApprovalRoutes();
    
    // 30秒ごとにデータを更新（ポーリング、ローディング表示なし）
    const interval = setInterval(() => {
      if (activeTab === 'pending') {
        fetchPendingUsers(false);
      } else {
        fetchAllUsers(false);
      }
      fetchApprovalRoutes(false);
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

  const fetchApprovalRoutes = async (showLoading = true) => {
    try {
      const response = await api.get('/api/admin/approval-routes');
      if (response.data.routes) {
        setApprovalRoutes((prev) =>
          ['<100m', '>=100m'].map((thr) => response.data.routes.find((r) => r.amount_threshold === thr) || { amount_threshold: thr, reviewer_ids: [], final_approver_user_id: null })
        );
      }
      if (showLoading) setLoading(false);
    } catch (error) {
      console.error('Error fetching approval routes:', error);
      if (showLoading) setLoading(false);
    }
  };

  const handleRouteChange = (threshold, key, value) => {
    setApprovalRoutes((prev) =>
      prev.map((r) =>
        r.amount_threshold === threshold
          ? { ...r, [key]: value }
          : r
      )
    );
  };

  const handleSaveRoute = async (route) => {
    try {
      setSavingRoute(true);
      await api.put('/api/admin/approval-routes', {
        amount_threshold: route.amount_threshold,
        reviewer_ids: route.reviewer_ids,
        final_approver_user_id: route.final_approver_user_id
      });
      setSuccessMessage(t('admin.approvalRouteSaved', 'Approval route saved'));
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchApprovalRoutes(false);
    } catch (error) {
      console.error('Error saving approval route:', error);
      setError(error.response?.data?.error || 'Failed to save approval route');
    } finally {
      setSavingRoute(false);
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

  const handleEdit = (user) => {
    setEditingUser(user.id);
    setEditFormData({
      name: user.name || '',
      company: user.company || '',
      department: user.department || '',
      position: user.position || '',
      is_admin: user.is_admin || false,
      is_approved: user.is_approved || false
    });
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setEditFormData({});
  };

  const handleSaveEdit = async (userId) => {
    try {
      await api.put(`/api/admin/users/${userId}`, editFormData);
      setError('');
      setSuccessMessage(t('admin.updatedSuccess', 'User updated successfully'));
      setTimeout(() => setSuccessMessage(''), 3000);
      setEditingUser(null);
      setEditFormData({});
      if (activeTab === 'pending') {
        fetchPendingUsers();
      } else {
        fetchAllUsers();
      }
    } catch (error) {
      console.error('Error updating user:', error);
      setError(error.response?.data?.error || 'Failed to update user');
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

      {/* Approval routes settings */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('admin.approvalRoutes.title', 'Approval Routes')}</h3>
        <p className="text-sm text-gray-600 mb-4">{t('admin.approvalRoutes.desc', 'Set reviewers and final approver by amount threshold')}</p>
        <div className="grid md:grid-cols-2 gap-4">
          {approvalRoutes.map((route) => (
            <div key={route.amount_threshold} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <p className="text-sm text-gray-600">{t('admin.approvalRoutes.threshold', 'Amount threshold')}</p>
                  <p className="text-lg font-bold text-gray-900">{route.amount_threshold}</p>
                </div>
                <button
                  onClick={() => handleSaveRoute(route)}
                  disabled={savingRoute}
                  className={`px-3 py-1.5 text-sm rounded-md ${savingRoute ? 'bg-gray-100 text-gray-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  {savingRoute ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                </button>
              </div>

              <div className="mb-3">
                <p className="text-sm font-medium text-gray-700 mb-1">{t('admin.approvalRoutes.reviewers', 'Reviewers')}</p>
                <div className="space-y-1 max-h-48 overflow-auto border rounded p-2">
                  {allUsers
                    .filter((u) => u.position === 'reviewer')
                    .map((user) => {
                      const checked = route.reviewer_ids?.includes(user.id);
                      return (
                        <label key={user.id} className="flex items-center space-x-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(route.reviewer_ids || []);
                              if (e.target.checked) next.add(user.id);
                              else next.delete(user.id);
                              handleRouteChange(route.amount_threshold, 'reviewer_ids', Array.from(next));
                            }}
                          />
                          <span>{user.name || user.email}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">{t('admin.approvalRoutes.finalApprover', 'Final approver')}</p>
                <select
                  value={route.final_approver_user_id || ''}
                  onChange={(e) => handleRouteChange(route.amount_threshold, 'final_approver_user_id', e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm text-sm"
                >
                  <option value="">{t('admin.approvalRoutes.selectFinal', 'Select user')}</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingUser === user.id ? (
                      <input
                        type="text"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-2 py-1 border"
                        value={editFormData.name}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      />
                    ) : (
                      user.name || '-'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingUser === user.id ? (
                      <input
                        type="text"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-2 py-1 border"
                        value={editFormData.company}
                        onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                      />
                    ) : (
                      user.company || '-'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingUser === user.id ? (
                      <input
                        type="text"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-2 py-1 border"
                        value={editFormData.department}
                        onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                      />
                    ) : (
                      user.department || '-'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingUser === user.id ? (
                      <select
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-2 py-1 border"
                        value={editFormData.position || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, position: e.target.value })}
                      >
                        <option value="">{t('admin.selectPosition', 'Select Position')}</option>
                        <option value="executor">{t('profile.position.executor', 'Project Executor')}</option>
                        <option value="reviewer">{t('profile.position.reviewer', 'Project Reviewer')}</option>
                      </select>
                    ) : (
                      user.position === 'executor' 
                        ? t('profile.position.executor', 'Project Executor')
                        : user.position === 'reviewer'
                        ? t('profile.position.reviewer', 'Project Reviewer')
                        : user.position || '-'
                    )}
                  </td>
                  {!isPendingTab && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {editingUser === user.id ? (
                        <div className="space-y-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              checked={editFormData.is_admin || false}
                              onChange={(e) => setEditFormData({ ...editFormData, is_admin: e.target.checked })}
                            />
                            <span className="ml-2 text-xs">{t('admin.isAdmin', 'Admin')}</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              checked={editFormData.is_approved || false}
                              onChange={(e) => setEditFormData({ ...editFormData, is_approved: e.target.checked })}
                            />
                            <span className="ml-2 text-xs">{t('admin.isApproved', 'Approved')}</span>
                          </label>
                        </div>
                      ) : (
                        <>
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
                        </>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      {editingUser === user.id ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(user.id)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md text-xs font-medium"
                          >
                            {t('admin.save', 'Save')}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1 rounded-md text-xs font-medium"
                          >
                            {t('admin.cancel', 'Cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEdit(user)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-xs font-medium"
                          >
                            {t('admin.edit', 'Edit')}
                          </button>
                          {!user.is_approved && (
                            <button
                              onClick={() => handleApprove(user.id)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md text-xs font-medium"
                            >
                              {t('admin.approve', 'Approve')}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(user.id, user.email)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-xs font-medium"
                          >
                            {t('admin.delete', 'Delete')}
                          </button>
                        </>
                      )}
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

