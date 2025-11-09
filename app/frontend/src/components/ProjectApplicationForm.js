import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import KpiReportForm from './KpiReportForm';

const ProjectApplicationForm = ({ project, onComplete, onCancel }) => {
  const [formData, setFormData] = useState({
    name: project?.name || '',
    description: project?.description || '',
    requested_amount: project?.requested_amount || '',
    reviewer_id: project?.reviewer_id || ''
  });
  const [reviewers, setReviewers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [kpiReports, setKpiReports] = useState([]);
  const [editingKpiReport, setEditingKpiReport] = useState(null);
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [kpiReportType, setKpiReportType] = useState(null);
  const { t } = useLanguage();

  useEffect(() => {
    fetchReviewers();
    if (project?.id) {
      fetchKpiReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const fetchReviewers = async () => {
    try {
      const response = await api.get('/api/users/reviewers');
      console.log('[ProjectApplicationForm] Fetched reviewers:', response.data.reviewers);
      setReviewers(response.data.reviewers || []);
      if (!response.data.reviewers || response.data.reviewers.length === 0) {
        setError(t('projectApplication.noReviewers', 'No reviewers available. Please contact an administrator.'));
      }
    } catch (error) {
      console.error('Error fetching reviewers:', error);
      setError(error.response?.data?.error || t('projectApplication.errorFetchingReviewers', 'Failed to fetch reviewers. Please try again.'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (project) {
        // 更新
        await api.put(`/api/projects/${project.id}`, formData);
      } else {
        // 新規作成
        await api.post('/api/projects', formData);
      }
      
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error saving project application:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || t('projectApplication.error.save', 'Failed to save project application');
      setError(errorMessage);
      
      // マイグレーションが必要な場合の特別なメッセージ
      if (error.response?.data?.error === 'Database migration required') {
        setError(t('projectApplication.migrationRequired', 'Database migration is required. Please contact an administrator.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitApplication = async () => {
    if (!formData.reviewer_id) {
      setError(t('projectApplication.reviewerRequired', 'Please select a reviewer before submitting'));
      return;
    }

    try {
      setLoading(true);
      await api.post(`/api/projects/${project.id}/submit`);
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error submitting application:', error);
      setError(error.response?.data?.error || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount) => {
    if (!amount) return '';
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
  };

  const fetchKpiReports = async () => {
    if (!project?.id) return;
    try {
      const response = await api.get(`/api/projects/${project.id}/kpi-reports`);
      setKpiReports(response.data.reports || []);
    } catch (error) {
      console.error('Error fetching KPI reports:', error);
    }
  };

  const handleKpiReportComplete = () => {
    setShowKpiForm(false);
    setEditingKpiReport(null);
    setKpiReportType(null);
    fetchKpiReports();
  };

  const handleDeleteKpiReport = async (reportId) => {
    if (!window.confirm(t('kpi.deleteConfirm', 'Are you sure you want to delete this KPI report?'))) {
      return;
    }
    try {
      await api.delete(`/api/projects/${project.id}/kpi-reports/${reportId}`);
      fetchKpiReports();
    } catch (error) {
      console.error('Error deleting KPI report:', error);
      setError(error.response?.data?.error || t('kpi.error.delete', 'Failed to delete KPI report'));
    }
  };

  const getAmountCategory = (amount) => {
    if (!amount) return null;
    const numAmount = parseFloat(amount);
    if (numAmount < 100000000) return 'under_100m';
    if (numAmount < 500000000) return '100m_to_500m';
    return 'over_500m';
  };

  const amountCategory = getAmountCategory(formData.requested_amount);
  
  const getRequiredKpiReportTypes = () => {
    if (!amountCategory) return [];
    switch (amountCategory) {
      case 'under_100m':
        // 1億円以下：申請時に社外MVPのKPIのみ
        return ['external_mvp'];
      case '100m_to_500m':
        // 1億円以上5億円未満：申請時に社内MVPと社外MVPのKPI
        return ['internal_mvp', 'external_mvp'];
      case 'over_500m':
        // 5億円以上：申請時に社内MVPと社外MVPのKPI（半年毎報告は承認後に作成）
        return ['internal_mvp', 'external_mvp'];
      default:
        return [];
    }
  };

  const requiredReportTypes = getRequiredKpiReportTypes();
  const existingReportTypes = kpiReports.map(r => r.report_type);
  const reportingRequirements = {
    under_100m: t('projectApplication.reportingRequirement.under100m', 'External MVP development and verification: Set KPIs and report results'),
    '100m_to_500m': t('projectApplication.reportingRequirement.100mTo500m', 'Internal MVP development and external MVP development: Set KPIs for each and report'),
    over_500m: t('projectApplication.reportingRequirement.over500m', 'Semi-annual: Set KPIs and budget, report usage and results once. Also required to apply for next year budget at year-end')
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {project ? t('projectApplication.edit', 'Edit Project Application') : t('projectApplication.create', 'Create Project Application')}
        </h2>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('projectApplication.name', 'Project Name')} *
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
              {t('projectApplication.description', 'Description')}
            </label>
            <textarea
              rows="4"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('projectApplication.requestedAmount', 'Requested Amount (JPY)')} *
            </label>
            <input
              type="number"
              required
              min="1"
              step="1"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              value={formData.requested_amount}
              onChange={(e) => setFormData({ ...formData, requested_amount: e.target.value })}
              placeholder="100000000"
            />
            {formData.requested_amount && (
              <p className="mt-1 text-sm text-gray-500">
                {formatAmount(formData.requested_amount)}
              </p>
            )}
          </div>

          {amountCategory && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">
                {t('projectApplication.reportingRequirementTitle', 'Reporting Requirements')}
              </h3>
              <p className="text-sm text-blue-800">
                {reportingRequirements[amountCategory]}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('projectApplication.reviewer', 'Reviewer')} *
            </label>
            <select
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              value={formData.reviewer_id}
              onChange={(e) => setFormData({ ...formData, reviewer_id: e.target.value })}
            >
              <option value="">{t('projectApplication.selectReviewer', 'Select a reviewer')}</option>
              {reviewers.map((reviewer) => (
                <option key={reviewer.id} value={reviewer.id}>
                  {reviewer.name} ({reviewer.email}) - {reviewer.company}
                </option>
              ))}
            </select>
          </div>

          {/* KPI Reports Section */}
          {amountCategory && requiredReportTypes.length > 0 && (
            <div className="border-t pt-6 mt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {t('kpi.title', 'KPI Reports')}
                </h3>
                {!showKpiForm && (
                  <div className="flex space-x-2">
                    {requiredReportTypes.map((type) => {
                      if (existingReportTypes.includes(type)) return null;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setKpiReportType(type);
                            setShowKpiForm(true);
                            setEditingKpiReport(null);
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md text-sm font-medium"
                        >
                          {type === 'external_mvp' && t('kpi.externalMvp', 'External MVP')}
                          {type === 'internal_mvp' && t('kpi.internalMvp', 'Internal MVP')}
                          {type === 'semi_annual' && t('kpi.semiAnnual', 'Semi-Annual')}
                          {' '}+ {t('kpi.addReport', 'Add')}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {showKpiForm && (
                <KpiReportForm
                  project={project}
                  reportType={kpiReportType}
                  report={editingKpiReport}
                  onComplete={handleKpiReportComplete}
                  onCancel={() => {
                    setShowKpiForm(false);
                    setEditingKpiReport(null);
                    setKpiReportType(null);
                  }}
                />
              )}

              {/* Existing KPI Reports */}
              {kpiReports.length > 0 && (
                <div className="space-y-4 mt-4">
                  {kpiReports.map((report) => (
                    <div key={report.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-medium text-gray-900">
                            {report.report_type === 'external_mvp' && t('kpi.externalMvp', 'External MVP Development')}
                            {report.report_type === 'internal_mvp' && t('kpi.internalMvp', 'Internal MVP Development')}
                            {report.report_type === 'semi_annual' && t('kpi.semiAnnual', 'Semi-Annual Report')}
                          </h4>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            report.status === 'submitted' ? 'bg-green-100 text-green-800' :
                            report.status === 'reviewed' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {t(`kpi.status.${report.status}`, report.status)}
                          </span>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKpiReport(report);
                              setKpiReportType(report.report_type);
                              setShowKpiForm(true);
                            }}
                            className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                          >
                            {t('kpi.editReport', 'Edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteKpiReport(report.id)}
                            className="text-red-600 hover:text-red-700 text-sm font-medium"
                          >
                            {t('kpi.deleteReport', 'Delete')}
                          </button>
                        </div>
                      </div>
                      {report.verification_content && (
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>{t('kpi.verificationContent', 'Verification Content')}:</strong> {report.verification_content}
                        </p>
                      )}
                      {report.planned_date && (
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>{t('kpi.plannedDate', 'Planned Date')}:</strong> {report.planned_date}
                        </p>
                      )}
                      {report.planned_budget && (
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>{t('kpi.plannedBudget', 'Planned Budget')}:</strong> {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(report.planned_budget)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {requiredReportTypes.length > existingReportTypes.length && (
                <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4">
                  <p className="text-sm text-yellow-800">
                    {t('kpi.requiredAtApplication', 'This information is required when submitting the application')}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {loading ? t('projectApplication.saving', 'Saving...') : t('projectApplication.save', 'Save Draft')}
            </button>
            
            {project && project.application_status === 'draft' && (
              <button
                type="button"
                onClick={handleSubmitApplication}
                disabled={loading || !formData.reviewer_id}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                {t('projectApplication.submit', 'Submit for Review')}
              </button>
            )}
            
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md text-sm font-medium"
              >
                {t('projectApplication.cancel', 'Cancel')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectApplicationForm;

