import React, { useState } from 'react';
import api from '../api';
import { useLanguage } from '../LanguageContext';

const KpiReportForm = ({ project, reportType, report, onComplete, onCancel }) => {
  const [formData, setFormData] = useState({
    verification_content: report?.verification_content || '',
    kpi_metrics: report?.kpi_metrics ? (typeof report.kpi_metrics === 'string' ? report.kpi_metrics : JSON.stringify(report.kpi_metrics, null, 2)) : '',
    results: report?.results || '',
    budget_used: report?.budget_used || '',
    planned_date: report?.planned_date || '',
    planned_budget: report?.planned_budget || '',
    period_start: report?.period_start || '',
    period_end: report?.period_end || ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // KPIメトリクスをパース
      let kpiMetrics = null;
      if (formData.kpi_metrics.trim()) {
        try {
          kpiMetrics = JSON.parse(formData.kpi_metrics);
        } catch (parseError) {
          setError('KPI metrics must be valid JSON');
          setLoading(false);
          return;
        }
      }

      const payload = {
        report_type: reportType,
        verification_content: formData.verification_content,
        kpi_metrics: kpiMetrics,
        results: formData.results || null,
        budget_used: formData.budget_used ? parseFloat(formData.budget_used) : null,
        planned_date: formData.planned_date || null,
        planned_budget: formData.planned_budget ? parseFloat(formData.planned_budget) : null,
        period_start: formData.period_start || null,
        period_end: formData.period_end || null
      };

      if (report) {
        // 更新
        await api.put(`/api/projects/${project.id}/kpi-reports/${report.id}`, payload);
      } else {
        // 新規作成
        await api.post(`/api/projects/${project.id}/kpi-reports`, payload);
      }

      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error saving KPI report:', error);
      setError(error.response?.data?.error || error.response?.data?.message || t('kpi.error.save', 'Failed to save KPI report'));
    } finally {
      setLoading(false);
    }
  };

  const getReportTypeLabel = () => {
    switch (reportType) {
      case 'semi_annual':
        return t('kpi.semiAnnual', 'Semi-Annual Report');
      case 'mvp_completion':
        return t('kpi.mvpCompletion', 'MVP Development Completion Report');
      case 'internal_mvp':
        return t('kpi.internalMvp', 'Internal MVP Development Report');
      case 'external_mvp':
        return t('kpi.externalMvp', 'External MVP Development Report');
      default:
        return reportType;
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-4">
      <h3 className="text-lg font-medium text-gray-900 mb-4">{getReportTypeLabel()}</h3>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            {t('kpi.verificationContent', 'Verification Content')} *
          </label>
          <textarea
            required
            rows="4"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
            value={formData.verification_content}
            onChange={(e) => setFormData({ ...formData, verification_content: e.target.value })}
            placeholder={t('kpi.verificationContentPlaceholder', 'Enter the content to be verified in MVP development...')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            {t('kpi.kpiMetrics', 'KPI Metrics')} *
          </label>
          <textarea
            required
            rows="4"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border font-mono"
            value={formData.kpi_metrics}
            onChange={(e) => setFormData({ ...formData, kpi_metrics: e.target.value })}
            placeholder={t('kpi.kpiMetricsPlaceholder', 'Enter KPI metrics (e.g., {"metric1": "value1", "metric2": "value2"})')}
          />
          <p className="mt-1 text-xs text-gray-500">JSON形式で入力してください</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            {t('kpi.results', 'Verification Results')} *
          </label>
          <textarea
            required
            rows="4"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
            value={formData.results}
            onChange={(e) => setFormData({ ...formData, results: e.target.value })}
            placeholder={t('kpi.resultsPlaceholder', 'Enter verification results...')}
          />
        </div>

        {(reportType === 'internal_mvp' || reportType === 'external_mvp' || reportType === 'semi_annual') && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('kpi.budgetUsed', 'Budget Used (JPY)')} *
            </label>
            <input
              type="number"
              required
              min="0"
              step="1"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              value={formData.budget_used}
              onChange={(e) => setFormData({ ...formData, budget_used: e.target.value })}
            />
          </div>
        )}

        {(reportType === 'mvp_completion' || reportType === 'internal_mvp' || reportType === 'external_mvp') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('kpi.plannedDate', 'Planned Date (Year-Month)')}
              </label>
              <input
                type="month"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                value={formData.planned_date}
                onChange={(e) => setFormData({ ...formData, planned_date: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('kpi.plannedBudget', 'Planned Budget (JPY)')}
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                value={formData.planned_budget}
                onChange={(e) => setFormData({ ...formData, planned_budget: e.target.value })}
              />
            </div>
          </div>
        )}

        {(reportType === 'semi_annual') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('kpi.periodStart', 'Period Start')}
              </label>
              <input
                type="date"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                value={formData.period_start}
                onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('kpi.periodEnd', 'Period End')}
              </label>
              <input
                type="date"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                value={formData.period_end}
                onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
              />
            </div>
          </div>
        )}

        <div className="flex space-x-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {loading ? t('kpi.saving', 'Saving...') : t('kpi.save', 'Save')}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md text-sm font-medium"
            >
              {t('kpi.cancel', 'Cancel')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default KpiReportForm;

