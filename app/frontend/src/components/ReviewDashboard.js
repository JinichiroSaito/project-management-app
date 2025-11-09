import React, { useState, useEffect } from 'react';
import api from '../api';
import { useLanguage } from '../LanguageContext';

const ReviewDashboard = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    fetchPendingReviews();
  }, []);

  const fetchPendingReviews = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/projects/review/pending');
      setProjects(response.data.projects);
      setError('');
    } catch (error) {
      console.error('Error fetching pending reviews:', error);
      setError(error.response?.data?.error || 'Failed to fetch pending reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (projectId, decision) => {
    if (!reviewComment.trim() && decision === 'rejected') {
      setError(t('review.commentRequired', 'Review comment is required when rejecting'));
      return;
    }

    try {
      await api.post(`/api/projects/${projectId}/review`, {
        decision,
        review_comment: reviewComment
      });
      
      setSelectedProject(null);
      setReviewComment('');
      fetchPendingReviews();
    } catch (error) {
      console.error('Error reviewing project:', error);
      setError(error.response?.data?.error || 'Failed to review project');
    }
  };

  const formatAmount = (amount) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
  };

  const getAmountCategory = (amount) => {
    if (!amount) return null;
    const numAmount = parseFloat(amount);
    if (numAmount < 100000000) return 'under_100m';
    if (numAmount < 500000000) return '100m_to_500m';
    return 'over_500m';
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
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        {t('review.title', 'Review Dashboard')}
      </h2>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">{t('review.noPendingReviews', 'No pending reviews')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{project.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {t('review.executor', 'Executor')}: {project.executor_name} ({project.executor_email})
                  </p>
                </div>
                <span className="px-3 py-1 text-sm font-medium rounded-full bg-yellow-100 text-yellow-800">
                  {t('review.pending', 'Pending Review')}
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-4">{project.description}</p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    {t('review.requestedAmount', 'Requested Amount')}:
                  </span>
                  <p className="text-lg font-bold text-indigo-600">
                    {formatAmount(project.requested_amount)}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    {t('review.amountCategory', 'Amount Category')}:
                  </span>
                  <p className="text-sm text-gray-600">
                    {getAmountCategory(project.requested_amount) === 'under_100m' && t('review.category.under100m', 'Under 100 million yen')}
                    {getAmountCategory(project.requested_amount) === '100m_to_500m' && t('review.category.100mTo500m', '100 million to 500 million yen')}
                    {getAmountCategory(project.requested_amount) === 'over_500m' && t('review.category.over500m', 'Over 500 million yen')}
                  </p>
                </div>
              </div>

              {selectedProject?.id === project.id ? (
                <div className="mt-4 border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('review.comment', 'Review Comment')}
                  </label>
                  <textarea
                    rows="3"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border mb-4"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder={t('review.commentPlaceholder', 'Enter your review comment...')}
                  />
                  <div className="flex space-x-4">
                    <button
                      onClick={() => handleReview(project.id, 'approved')}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                      {t('review.approve', 'Approve')}
                    </button>
                    <button
                      onClick={() => handleReview(project.id, 'rejected')}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                      {t('review.reject', 'Reject')}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedProject(null);
                        setReviewComment('');
                      }}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md text-sm font-medium"
                    >
                      {t('review.cancel', 'Cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedProject(project)}
                  className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  {t('review.review', 'Review')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReviewDashboard;

