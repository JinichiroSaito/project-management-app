import React, { useState, useEffect } from 'react';
import api from '../api';
import { useLanguage } from '../LanguageContext';
import ProjectKpiReports from './ProjectKpiReports';
import ProjectBudgetManagement from './ProjectBudgetManagement';

const ApprovedProjectsDashboard = () => {
  const [phases, setPhases] = useState([]);
  const [overallSummary, setOverallSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [showKpi, setShowKpi] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/api/projects/approved/dashboard');
      setPhases(response.data.phases || []);
      setOverallSummary(response.data.overall_summary || {});
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(error.response?.data?.error || t('dashboard.error.fetch', 'Failed to fetch dashboard data'));
      setLoading(false);
    }
  };

  const handleProjectClick = (project) => {
    setSelectedProject(project);
    setShowKpi(false);
    setShowBudget(false);
  };

  const handleUpdatePhase = async (projectId, newPhase) => {
    try {
      await api.put(`/api/projects/${projectId}/phase`, { phase: newPhase });
      // データを再取得
      fetchDashboardData();
    } catch (error) {
      console.error('Error updating phase:', error);
      alert(error.response?.data?.error || t('dashboard.error.updatePhase', 'Failed to update phase'));
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return '¥0';
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getPhaseLabel = (phase) => {
    const labels = {
      mvp_development: t('dashboard.phase.mvpDevelopment', 'MVP Development'),
      business_launch: t('dashboard.phase.businessLaunch', 'Business Launch'),
      business_stabilization: t('dashboard.phase.businessStabilization', 'Business Stabilization')
    };
    return labels[phase] || phase;
  };

  const getPhaseColor = (phase) => {
    const colors = {
      mvp_development: 'bg-purple-100 text-purple-800 border-purple-200',
      business_launch: 'bg-green-100 text-green-800 border-green-200',
      business_stabilization: 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[phase] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <p className="text-gray-500">{t('dashboard.loading', 'Loading...')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {t('dashboard.title', 'Approved Projects Dashboard')}
        </h2>
        {overallSummary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">{t('dashboard.summary.totalProjects', 'Total Projects')}</p>
              <p className="text-2xl font-bold text-gray-900">{overallSummary.total_projects || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">{t('dashboard.summary.totalRequested', 'Total Requested Amount')}</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(overallSummary.total_requested_amount || 0)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">{t('dashboard.summary.totalUsed', 'Total Used Amount')}</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(overallSummary.total_budget_used || 0)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">{t('dashboard.summary.totalKpiReports', 'Total KPI Reports')}</p>
              <p className="text-2xl font-bold text-gray-900">{overallSummary.total_kpi_reports || 0}</p>
            </div>
          </div>
        )}
      </div>

      {/* Phase Sections - Horizontal Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {phases.map((phaseData) => (
          <div key={phaseData.phase} className="bg-white rounded-lg shadow flex flex-col">
            <div className={`p-4 border-b-2 ${getPhaseColor(phaseData.phase)}`}>
              <h3 className="text-lg font-semibold mb-2">
                {getPhaseLabel(phaseData.phase)}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-600">{t('dashboard.projects', 'Projects')}:</span>
                  <span className="font-semibold ml-1">{phaseData.summary.project_count}</span>
                </div>
                <div>
                  <span className="text-gray-600">{t('dashboard.requested', 'Requested')}:</span>
                  <span className="font-semibold ml-1">{formatCurrency(phaseData.summary.total_requested_amount)}</span>
                </div>
                <div>
                  <span className="text-gray-600">{t('dashboard.used', 'Used')}:</span>
                  <span className="font-semibold ml-1">{formatCurrency(phaseData.summary.total_budget_used)}</span>
                </div>
                <div>
                  <span className="text-gray-600">{t('dashboard.kpiReports', 'KPI Reports')}:</span>
                  <span className="font-semibold ml-1">{phaseData.summary.total_kpi_reports}</span>
                </div>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-y-auto" style={{ maxHeight: '600px' }}>
              {phaseData.projects.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  {t('dashboard.noProjects', 'No projects in this phase')}
                </p>
              ) : (
                <div className="space-y-3">
                  {phaseData.projects.map((project) => (
                    <div
                      key={project.id}
                      className={`border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedProject?.id === project.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                      }`}
                      onClick={() => handleProjectClick(project)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 text-sm truncate">{project.name}</h4>
                          <p className="text-xs text-gray-600 mt-1 truncate">
                            {project.executor_company && (
                              <span className="font-semibold">{project.executor_company}</span>
                            )}
                            {project.executor_company && project.executor_name && ' / '}
                            {project.executor_name}
                          </p>
                        </div>
                        <select
                          value={project.project_phase || 'mvp_development'}
                          onChange={(e) => handleUpdatePhase(project.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs border border-gray-300 rounded px-1 py-0.5 ml-2 flex-shrink-0"
                        >
                          <option value="mvp_development">{t('dashboard.phase.mvpDevelopment', 'MVP')}</option>
                          <option value="business_launch">{t('dashboard.phase.businessLaunch', 'Launch')}</option>
                          <option value="business_stabilization">{t('dashboard.phase.businessStabilization', 'Stabilization')}</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                        <div>
                          <p className="text-gray-600 text-xs">{t('dashboard.requested', 'Requested')}</p>
                          <p className="font-semibold text-gray-900 text-xs">{formatCurrency(project.requested_amount || 0)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 text-xs">{t('dashboard.used', 'Used')}</p>
                          <p className="font-semibold text-gray-900 text-xs">{formatCurrency(project.total_budget_used || 0)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 text-xs">{t('dashboard.kpiReports', 'KPI')}</p>
                          <p className="font-semibold text-gray-900 text-xs">{project.kpi_report_count || 0}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Project Detail Modal */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedProject.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {t('dashboard.executor', 'Executor')}: {selectedProject.executor_company && (
                      <span className="font-semibold">{selectedProject.executor_company}</span>
                    )}
                    {selectedProject.executor_company && ' / '}
                    {selectedProject.executor_name} ({selectedProject.executor_email})
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedProject(null);
                    setShowKpi(false);
                    setShowBudget(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-700">{selectedProject.description}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">{t('dashboard.requestedAmount', 'Requested Amount')}</p>
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(selectedProject.requested_amount || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('dashboard.usedAmount', 'Used Amount')}</p>
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(selectedProject.total_budget_used || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('dashboard.kpiReportCount', 'KPI Reports')}</p>
                  <p className="text-lg font-bold text-gray-900">{selectedProject.kpi_report_count || 0}</p>
                </div>
              </div>

              <div className="flex space-x-2 mb-4">
                <button
                  onClick={() => {
                    setShowKpi(!showKpi);
                    setShowBudget(false);
                  }}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    showKpi
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {t('dashboard.viewKpi', 'View KPI Reports')}
                </button>
                <button
                  onClick={() => {
                    setShowBudget(!showBudget);
                    setShowKpi(false);
                  }}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    showBudget
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {t('dashboard.viewBudget', 'View Budget')}
                </button>
              </div>

              {showKpi && (
                <div className="border-t pt-4">
                  <ProjectKpiReports project={selectedProject} />
                </div>
              )}

              {showBudget && (
                <div className="border-t pt-4">
                  <ProjectBudgetManagement project={selectedProject} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovedProjectsDashboard;

