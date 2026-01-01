import React, { useState, useEffect } from 'react';
import api from '../api';
import { useLanguage } from '../LanguageContext';

const ApprovalStatusView = ({ projectId, onClose }) => {
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { t, language } = useLanguage();

  useEffect(() => {
    fetchApprovalStatus();
  }, [projectId]);

  const fetchApprovalStatus = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/api/projects/${projectId}/approval-status`);
      setApprovalStatus(response.data);
    } catch (error) {
      console.error('Error fetching approval status:', error);
      setError(error.response?.data?.error || error.message || '審査状況の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      approved: { bg: 'bg-green-100', text: 'text-green-800', label: '承認済み' },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '審査中' },
      waiting: { bg: 'bg-gray-100', text: 'text-gray-800', label: '待機中' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: '却下' }
    };
    const badge = badges[status] || badges.waiting;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getApplicationStatusBadge = (status) => {
    const badges = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-800', label: '下書き' },
      submitted: { bg: 'bg-blue-100', text: 'text-blue-800', label: '提出済み' },
      approved: { bg: 'bg-green-100', text: 'text-green-800', label: '承認済み' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: '却下' }
    };
    const badge = badges[status] || badges.draft;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">審査状況を取得中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={onClose}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  if (!approvalStatus) {
    return null;
  }

  const { approval_summary, reviewers, final_approver_name, final_approval_status, application_status } = approvalStatus;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-900">審査状況</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* 申請ステータス */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">申請ステータス</span>
            {getApplicationStatusBadge(application_status)}
          </div>
        </div>

        {/* 審査者承認状況 */}
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">審査者承認状況</h4>
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">{approval_summary.total_reviewers}</div>
                <div className="text-sm text-gray-600">審査者数</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{approval_summary.approved_count}</div>
                <div className="text-sm text-gray-600">承認済み</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{approval_summary.pending_count}</div>
                <div className="text-sm text-gray-600">審査中</div>
              </div>
            </div>
          </div>

          {reviewers.length > 0 ? (
            <div className="space-y-3">
              {reviewers.map((reviewer) => {
                const reviewerApproval = approvalStatus.reviewer_approvals?.[reviewer.id] || approvalStatus.reviewer_approvals?.[reviewer.reviewer_id];
                const isRejected = reviewerApproval?.status === 'rejected';
                const rejectionComment = reviewerApproval?.review_comment;
                
                return (
                  <div key={reviewer.id || reviewer.reviewer_id} className={`p-3 border rounded-lg ${isRejected ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{reviewer.reviewer_name || reviewer.name || reviewer.reviewer_email || reviewer.email}</div>
                        {(reviewer.reviewer_email || reviewer.email) && (reviewer.reviewer_name || reviewer.name) && (
                          <div className="text-sm text-gray-500">{reviewer.reviewer_email || reviewer.email}</div>
                        )}
                        {reviewerApproval?.updated_at && (
                          <div className="text-xs text-gray-400 mt-1">
                            更新: {new Date(reviewerApproval.updated_at).toLocaleString('ja-JP')}
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        {getStatusBadge(reviewer.status || reviewerApproval?.status || 'pending')}
                      </div>
                    </div>
                    {isRejected && rejectionComment && (
                      <div className="mt-3 pt-3 border-t border-red-200">
                        <div className="text-sm font-medium text-red-800 mb-1">却下理由:</div>
                        <div className="text-sm text-red-700 whitespace-pre-wrap bg-white p-2 rounded border border-red-200">
                          {rejectionComment}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-4">審査者が割り当てられていません</div>
          )}
        </div>

        {/* 最終承認状況 */}
        {approvalStatus.final_approver_user_id && (
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">最終承認状況</h4>
            <div className={`p-4 border rounded-lg ${application_status === 'rejected' ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-medium text-gray-900">
                    {final_approver_name || '最終承認者'}
                  </div>
                  {approvalStatus.final_approver_email && (
                    <div className="text-sm text-gray-500">{approvalStatus.final_approver_email}</div>
                  )}
                </div>
                <div>
                  {getStatusBadge(final_approval_status)}
                </div>
              </div>
              {application_status === 'rejected' && approvalStatus.final_review_comment && (
                <div className="mt-3 pt-3 border-t border-red-200">
                  <div className="text-sm font-medium text-red-800 mb-1">却下理由:</div>
                  <div className="text-sm text-red-700 whitespace-pre-wrap bg-white p-2 rounded border border-red-200">
                    {approvalStatus.final_review_comment}
                  </div>
                </div>
              )}
              {approval_summary.all_reviewers_approved && final_approval_status === 'pending' && (
                <div className="mt-2 text-sm text-blue-600">
                  ✓ すべての審査者が承認しました。最終承認待ちです。
                </div>
              )}
              {!approval_summary.all_reviewers_approved && (
                <div className="mt-2 text-sm text-gray-600">
                  すべての審査者の承認が必要です。
                </div>
              )}
            </div>
          </div>
        )}

        {/* 進捗バー */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">承認進捗</span>
            <span className="text-sm text-gray-600">
              {approval_summary.approved_count} / {approval_summary.total_reviewers}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${approval_summary.total_reviewers > 0 ? (approval_summary.approved_count / approval_summary.total_reviewers) * 100 : 0}%`
              }}
            ></div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApprovalStatusView;

