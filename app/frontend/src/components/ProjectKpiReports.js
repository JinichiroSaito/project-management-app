import React, { useState, useEffect } from 'react';
import api from '../api';
import { useLanguage } from '../LanguageContext';
import KpiReportForm from './KpiReportForm';

const ProjectKpiReports = ({ project }) => {
  const [kpiReports, setKpiReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingKpiReport, setEditingKpiReport] = useState(null);
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [kpiReportType, setKpiReportType] = useState(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (project?.id) {
      fetchKpiReports();
    }
  }, [project?.id]);

  const fetchKpiReports = async () => {
    if (!project?.id) return;
    try {
      setLoading(true);
      const response = await api.get(`/api/projects/${project.id}/kpi-reports`);
      setKpiReports(response.data.reports || []);
      setError('');
    } catch (error) {
      console.error('Error fetching KPI reports:', error);
      setError(error.response?.data?.error || t('kpi.error.fetch', 'Failed to fetch KPI reports'));
    } finally {
      setLoading(false);
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

  const getAmountCategory = () => {
    if (!project?.requested_amount) return null;
    const amount = parseFloat(project.requested_amount);
    if (amount < 100000000) return 'under_100m';
    if (amount < 500000000) return '100m_to_500m';
    return 'over_500m';
  };

  const amountCategory = getAmountCategory();
  const canCreateSemiAnnual = amountCategory === 'over_500m' && project?.application_status === 'approved';

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-gray-600">{t('projects.loading', 'Loading...')}</div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">
          {t('kpi.title', 'KPI Reports')}
        </h3>
        {canCreateSemiAnnual && !showKpiForm && (
          <button
            type="button"
            onClick={() => {
              setKpiReportType('semi_annual');
              setShowKpiForm(true);
              setEditingKpiReport(null);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            {t('kpi.addSemiAnnual', 'Add Semi-Annual Report')}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

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

      {kpiReports.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">{t('kpi.noReports', 'No KPI reports yet')}</p>
          {canCreateSemiAnnual && (
            <p className="text-sm text-gray-400 mt-2">
              {t('kpi.semiAnnualInfo', 'You can create semi-annual reports for approved projects over 500 million yen')}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {kpiReports.map((report) => (
            <div key={report.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-medium text-gray-900">
                    {report.report_type === 'external_mvp' && t('kpi.externalMvp', 'External MVP Development')}
                    {report.report_type === 'internal_mvp' && t('kpi.internalMvp', 'Internal MVP Development')}
                    {report.report_type === 'semi_annual' && t('kpi.semiAnnual', 'Semi-Annual Report')}
                  </h4>
                  <span className={`text-xs px-2 py-1 rounded-full mt-1 inline-block ${
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
              {report.kpi_metrics && (
                <div className="text-sm text-gray-700 mb-2">
                  <strong>{t('kpi.kpiMetrics', 'KPI Metrics')}:</strong>
                  <pre className="mt-1 bg-white p-2 rounded border text-xs overflow-x-auto">
                    {typeof report.kpi_metrics === 'string' ? report.kpi_metrics : JSON.stringify(report.kpi_metrics, null, 2)}
                  </pre>
                </div>
              )}
              {report.planned_date && (
                <p className="text-sm text-gray-700 mb-2">
                  <strong>{t('kpi.plannedDate', 'Planned Date')}:</strong> {new Date(report.planned_date + '-01').toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })}
                </p>
              )}
              {report.planned_budget && (
                <p className="text-sm text-gray-700 mb-2">
                  <strong>{t('kpi.plannedBudget', 'Planned Budget')}:</strong> {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(report.planned_budget)}
                </p>
              )}
              {report.period_start && report.period_end && (
                <p className="text-sm text-gray-700 mb-2">
                  <strong>{t('kpi.period', 'Period')}:</strong> {new Date(report.period_start).toLocaleDateString('ja-JP')} - {new Date(report.period_end).toLocaleDateString('ja-JP')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectKpiReports;

