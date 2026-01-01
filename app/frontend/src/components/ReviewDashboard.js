import React, { useState, useEffect } from 'react';
import api from '../api';
import { useLanguage } from '../LanguageContext';
import ProjectKpiReports from './ProjectKpiReports';
import ProjectBudgetManagement from './ProjectBudgetManagement';

const ReviewDashboard = () => {
  const [projects, setProjects] = useState([]);
  const [approvedProjects, setApprovedProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedApprovedProject, setSelectedApprovedProject] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'approved'
  const { t, language } = useLanguage();

  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [expandedAnalysis, setExpandedAnalysis] = useState({});
  const [recheckLoading, setRecheckLoading] = useState({});
  const [analysisProject, setAnalysisProject] = useState(null);

  useEffect(() => {
    fetchPendingReviews();
    fetchApprovedProjects();
  }, []);

  const fetchDebugInfo = async () => {
    try {
      const response = await api.get('/api/debug/review-pending');
      setDebugInfo(response.data);
    } catch (error) {
      console.error('Error fetching debug info:', error);
    }
  };

  const fetchPendingReviews = async () => {
    try {
      setLoading(true);
      console.log('[ReviewDashboard] Fetching pending reviews...');
      const response = await api.get('/api/projects/review/pending');
      console.log('[ReviewDashboard] Received response:', response.data);
      setProjects(response.data.projects || []);
      setError('');
      if ((response.data.projects || []).length === 0) {
        console.warn('[ReviewDashboard] No pending projects found');
      }
    } catch (error) {
      console.error('[ReviewDashboard] Error fetching pending reviews:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to fetch pending reviews';
      setError(errorMessage);
      console.error('[ReviewDashboard] Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchApprovedProjects = async () => {
    try {
      const response = await api.get('/api/projects/review/approved');
      setApprovedProjects(response.data.projects);
    } catch (error) {
      console.error('Error fetching approved projects:', error);
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
      fetchApprovedProjects();
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

  const parseMissingSections = (project) => {
    if (!project?.missing_sections) return null;
    if (typeof project.missing_sections === 'object') return project.missing_sections;
    try {
      return JSON.parse(project.missing_sections);
    } catch {
      return null;
    }
  };

  const renderStatusBadge = (label, type = 'default') => {
    const colors = {
      missing: 'bg-red-100 text-red-800 border border-red-200',
      incomplete: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
      ok: 'bg-green-100 text-green-800 border border-green-200',
      default: 'bg-gray-100 text-gray-700 border border-gray-200'
    };
    return (
      <span className={`inline-block px-2 py-0.5 text-xs rounded ${colors[type] || colors.default}`}>
        {label}
      </span>
    );
  };

  const recheckAnalysis = async (project) => {
    if (!project?.id) return;
    setRecheckLoading((prev) => ({ ...prev, [project.id]: true }));
    try {
      const response = await api.post(`/api/projects/${project.id}/check-missing-sections`, {
        language
      });
      const newAnalysis = response.data?.analysis;
      if (newAnalysis) {
        // pending側のリストを更新
        setProjects((prev) =>
          prev.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  missing_sections: newAnalysis,
                  missing_sections_updated_at: new Date().toISOString()
                }
              : p
          )
        );
        // approved側も更新
        setApprovedProjects((prev) =>
          prev.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  missing_sections: newAnalysis,
                  missing_sections_updated_at: new Date().toISOString()
                }
              : p
          )
        );
      }
    } catch (error) {
      console.error('[ReviewDashboard] Re-check analysis failed:', error);
      setError(
        error.response?.data?.error ||
          error.message ||
          t('projectApplication.error.checkSections', 'Failed to check missing sections')
      );
    } finally {
      setRecheckLoading((prev) => ({ ...prev, [project.id]: false }));
    }
  };

  const renderAnalysisModal = () => {
    if (!analysisProject) return null;
    const missingSections = parseMissingSections(analysisProject);
    if (!missingSections) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
        <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">{analysisProject.name}</h3>
              <p className="text-sm text-gray-600">
                {t('review.analysis.updatedAt', 'Updated')}{' '}
                {analysisProject.missing_sections_updated_at
                  ? new Date(analysisProject.missing_sections_updated_at).toLocaleString()
                  : t('review.analysis.unknown', 'Unknown')}
              </p>
            </div>
            <button
              onClick={() => setAnalysisProject(null)}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              {t('common.close', 'Close')}
            </button>
          </div>

          {missingSections.completeness_score !== undefined && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">
                {t('projectApplication.analysis.completeness', 'Completeness Score')}
              </h4>
              <div className="flex items-center space-x-3">
                <span className="text-2xl font-bold">{missingSections.completeness_score}%</span>
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-indigo-600"
                    style={{ width: `${missingSections.completeness_score}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {missingSections.category_scores && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">
                {t('projectApplication.analysis.categoryScores', 'Category Scores')}
              </h4>
              <div className="grid md:grid-cols-2 gap-2">
                {Object.entries(missingSections.category_scores).map(([category, score]) => (
                  <div key={category} className="border border-gray-200 rounded p-2 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-700 truncate">{category}</span>
                      <span className="font-semibold">{score}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-indigo-600"
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {missingSections.missing_sections && missingSections.missing_sections.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">
                {t('projectApplication.analysis.missingSections', 'Missing Sections')} ({missingSections.missing_sections.length})
              </h4>
              <div className="space-y-2 text-sm text-gray-800">
                {missingSections.missing_sections.map((section, idx) => (
                  <div key={idx} className="p-3 rounded border border-yellow-100 bg-yellow-50">
                    <div className="flex items-center space-x-2">
                      <div className="font-medium text-yellow-900">
                        {section.section_number}. {t(`projectApplication.sectionName.${section.section_name}`, section.section_name)}
                      </div>
                      <div className="flex space-x-1">
                        {section.is_missing && renderStatusBadge(t('review.analysis.status.missing', 'Missing'), 'missing')}
                        {section.is_incomplete && renderStatusBadge(t('review.analysis.status.incomplete', 'Incomplete'), 'incomplete')}
                        {!section.is_missing && !section.is_incomplete && renderStatusBadge(t('review.analysis.status.ok', 'OK'), 'ok')}
                      </div>
                    </div>
                    {section.reason && (
                      <p className="text-xs text-gray-700 mt-1">{section.reason}</p>
                    )}
                    {section.checkpoints && Array.isArray(section.checkpoints) && section.checkpoints.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-xs text-gray-600 font-semibold">
                          {t('review.analysis.checkpoints', 'Checkpoints')}
                        </div>
                        {section.checkpoints.map((cp, cpIdx) => (
                          <div key={cpIdx} className="text-xs bg-white border border-gray-200 rounded px-2 py-1">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-800">{cp.point}</span>
                              {cp.status && renderStatusBadge(cp.status, cp.status === 'ok' ? 'ok' : cp.status === 'missing' ? 'missing' : 'incomplete')}
                            </div>
                            {cp.note && <div className="text-gray-600 mt-0.5">{cp.note}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {missingSections.critical_issues && missingSections.critical_issues.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-red-800 mb-2">
                {t('projectApplication.analysis.criticalIssues', 'Critical Issues')}
              </h4>
              <ul className="list-disc list-inside text-sm text-red-900 space-y-1">
                {missingSections.critical_issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {missingSections.strengths && missingSections.strengths.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-green-800 mb-2">
                {t('projectApplication.analysis.strengths', 'Strengths')}
              </h4>
              <ul className="list-disc list-inside text-sm text-green-900 space-y-1">
                {missingSections.strengths.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {analysisProject.extracted_text && (
            <div className="mb-2">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">
                {t('projectApplication.analysis.fullText', 'Full extracted text:')}
              </h4>
              <pre className="text-xs text-gray-800 whitespace-pre-wrap max-h-64 overflow-auto bg-gray-50 border border-gray-200 rounded p-3">
                {analysisProject.extracted_text}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
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

      {/* タブ切り替え */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pending'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t('review.pendingReviews', 'Pending Reviews')} ({projects.length})
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'approved'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t('review.approvedProjects', 'Approved Projects')} ({approvedProjects.length})
          </button>
        </nav>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* デバッグ情報 */}
      <div className="mb-4">
        <button
          onClick={() => {
            if (!showDebug) {
              fetchDebugInfo();
            }
            setShowDebug(!showDebug);
          }}
          className="text-sm text-gray-600 hover:text-gray-800 underline"
        >
          {showDebug ? 'デバッグ情報を非表示' : 'デバッグ情報を表示'}
        </button>
        {showDebug && debugInfo && (
          <div className="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-lg text-xs">
            <h4 className="font-medium mb-2">デバッグ情報:</h4>
            <div className="space-y-2">
              <div>
                <strong>現在のユーザー:</strong>
                <pre className="mt-1 bg-white p-2 rounded overflow-auto">
                  {JSON.stringify(debugInfo.currentUser, null, 2)}
                </pre>
              </div>
              <div>
                <strong>提出済みプロジェクト数:</strong> {debugInfo.submittedProjects?.length || 0}
                {debugInfo.submittedProjects && debugInfo.submittedProjects.length > 0 && (
                  <pre className="mt-1 bg-white p-2 rounded overflow-auto">
                    {JSON.stringify(debugInfo.submittedProjects, null, 2)}
                  </pre>
                )}
              </div>
              <div>
                <strong>project_reviewersテーブルのデータ数:</strong> {debugInfo.projectReviewers?.length || 0}
                {debugInfo.projectReviewers && debugInfo.projectReviewers.length > 0 && (
                  <pre className="mt-1 bg-white p-2 rounded overflow-auto">
                    {JSON.stringify(debugInfo.projectReviewers, null, 2)}
                  </pre>
                )}
              </div>
              <div>
                <strong>現在のユーザーに割り当てられたプロジェクト数:</strong> {debugInfo.assignedProjects?.length || 0}
                {debugInfo.assignedProjects && debugInfo.assignedProjects.length > 0 && (
                  <pre className="mt-1 bg-white p-2 rounded overflow-auto">
                    {JSON.stringify(debugInfo.assignedProjects, null, 2)}
                  </pre>
                )}
              </div>
              <div>
                <strong>表示されるべきプロジェクト数:</strong> {debugInfo.projectsWithCurrentUserAsReviewer?.length || 0}
                {debugInfo.projectsWithCurrentUserAsReviewer && debugInfo.projectsWithCurrentUserAsReviewer.length > 0 && (
                  <pre className="mt-1 bg-white p-2 rounded overflow-auto">
                    {JSON.stringify(debugInfo.projectsWithCurrentUserAsReviewer, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'pending' && (
        <>
          {projects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">{t('review.noPendingReviews', 'No pending reviews')}</p>
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg max-w-2xl mx-auto">
              <p className="text-sm text-red-800 font-medium mb-2">エラー:</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg max-w-2xl mx-auto">
            <p className="text-sm text-blue-800 font-medium mb-2">確認事項:</p>
            <ul className="text-sm text-blue-700 text-left space-y-1 list-disc list-inside">
              <li>プロジェクトが「提出済み」ステータスになっているか確認してください</li>
              <li>プロジェクトに審査者が正しく設定されているか確認してください</li>
              <li>現在のユーザーのpositionが「reviewer」になっているか確認してください</li>
              <li>ブラウザのコンソール（F12キー）でエラーメッセージを確認してください</li>
            </ul>
          </div>
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

              {/* ファイルダウンロード */}
              {project.application_file_url && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        {t('review.applicationFile', 'Application Document')}
                      </p>
                      {project.application_file_name && (
                        <p className="text-xs text-blue-700 mt-1">
                          {project.application_file_name}
                        </p>
                      )}
                    </div>
                    <a
                      href={project.application_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={project.application_file_name || 'application-document'}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium inline-flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>{t('review.downloadFile', 'Download File')}</span>
                    </a>
                  </div>
                </div>
              )}

              {/* 評価結果の表示 */}
              {(() => {
                if (!project.missing_sections) return null;
                let missingSections = project.missing_sections;
                if (typeof missingSections === 'string') {
                  try {
                    missingSections = JSON.parse(missingSections);
                  } catch (e) {
                    return null;
                  }
                }
                if (typeof missingSections !== 'object' || missingSections === null) return null;
                
                return (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">
                    {t('projectApplication.analysis.title', 'Document Analysis')}
                  </h4>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-600">
                      {t('review.analysis.updatedAt', 'Updated')}{' '}
                      {project.missing_sections_updated_at ? new Date(project.missing_sections_updated_at).toLocaleString() : t('review.analysis.unknown', 'Unknown')}
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        className="text-xs text-gray-700 underline"
                        onClick={() => setAnalysisProject(project)}
                      >
                        {t('review.analysis.viewDetails', 'View full details')}
                      </button>
                      <button
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        onClick={() =>
                          setExpandedAnalysis((prev) => ({
                            ...prev,
                            [project.id]: !prev[project.id]
                          }))
                        }
                      >
                        {expandedAnalysis[project.id]
                          ? t('review.analysis.hideDetails', 'Hide details')
                          : t('review.analysis.showDetails', 'Show details')}
                      </button>
                      <button
                        disabled={recheckLoading[project.id]}
                        onClick={() => recheckAnalysis(project)}
                        className={`text-xs px-2 py-1 rounded border ${
                          recheckLoading[project.id]
                            ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed'
                            : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                        }`}
                      >
                        {recheckLoading[project.id]
                          ? t('review.analysis.rechecking', 'Rechecking...')
                          : t('review.analysis.rerun', 'Re-run in current language')}
                      </button>
                    </div>
                  </div>
                  
                  {missingSections.completeness_score !== undefined && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          {t('projectApplication.analysis.completeness', 'Completeness Score')}
                        </span>
                        <span className={`text-lg font-bold ${
                          missingSections.completeness_score >= 80 ? 'text-green-600' :
                          missingSections.completeness_score >= 60 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {missingSections.completeness_score}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            missingSections.completeness_score >= 80 ? 'bg-green-600' :
                            missingSections.completeness_score >= 60 ? 'bg-yellow-600' :
                            'bg-red-600'
                          }`}
                          style={{ width: `${missingSections.completeness_score}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {missingSections.category_scores && (
                    <div className="mb-3">
                      <h5 className="text-xs font-medium text-gray-700 mb-2">
                        {t('projectApplication.analysis.categoryScores', 'Category Scores')}
                      </h5>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(missingSections.category_scores)
                          .slice(0, expandedAnalysis[project.id] ? undefined : 6)
                          .map(([category, score]) => (
                          <div key={category} className="text-xs">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-gray-600 truncate">{category}</span>
                              <span className={`font-medium ml-1 ${
                                score >= 80 ? 'text-green-600' :
                                score >= 60 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                {score}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1">
                              <div
                                className={`h-1 rounded-full ${
                                  score >= 80 ? 'bg-green-600' :
                                  score >= 60 ? 'bg-yellow-600' :
                                  'bg-red-600'
                                }`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {missingSections.missing_sections && missingSections.missing_sections.length > 0 && (
                    <div className="mb-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                      <h5 className="text-xs font-medium text-yellow-900 mb-1">
                        {t('projectApplication.analysis.missingSections', 'Missing Sections')}: {missingSections.missing_sections.length}
                      </h5>
                      <ul className="text-xs text-yellow-800 space-y-1">
                        {missingSections.missing_sections.slice(0, expandedAnalysis[project.id] ? undefined : 3).map((section, index) => (
                          <li key={index}>
                            {section.section_number}. {t(`projectApplication.sectionName.${section.section_name}`, section.section_name)}
                            {section.is_missing && <span className="text-red-600 ml-1">({t('projectApplication.analysis.missing', 'Missing')})</span>}
                            {section.is_incomplete && <span className="text-orange-600 ml-1">({t('projectApplication.analysis.incomplete', 'Incomplete')})</span>}
                          </li>
                        ))}
                        {!expandedAnalysis[project.id] && missingSections.missing_sections.length > 3 && (
                          <li className="text-gray-600">{t('projectApplication.analysis.others', '...and {count} more', { count: missingSections.missing_sections.length - 3 })}</li>
                        )}
                      </ul>
                    </div>
                  )}
                  
                  {missingSections.critical_issues && missingSections.critical_issues.length > 0 && (
                    <div className="mb-3 p-2 bg-red-50 rounded border border-red-200">
                      <h5 className="text-xs font-medium text-red-900 mb-1">
                        {t('projectApplication.analysis.criticalIssues', 'Critical Issues')}
                      </h5>
                      <ul className="text-xs text-red-800 space-y-1">
                        {missingSections.critical_issues.slice(0, expandedAnalysis[project.id] ? undefined : 2).map((issue, index) => (
                          <li key={index} className="list-disc list-inside">{issue}</li>
                        ))}
                        {!expandedAnalysis[project.id] && missingSections.critical_issues.length > 2 && (
                          <li className="text-gray-600">{t('projectApplication.analysis.others', '...and {count} more', { count: missingSections.critical_issues.length - 2 })}</li>
                        )}
                      </ul>
                    </div>
                  )}
                  
                  {missingSections.strengths && missingSections.strengths.length > 0 && (
                    <div className="p-2 bg-green-50 rounded border border-green-200">
                      <h5 className="text-xs font-medium text-green-900 mb-1">
                        {t('projectApplication.analysis.strengths', 'Strengths')}
                      </h5>
                      <ul className="text-xs text-green-800 space-y-1">
                        {missingSections.strengths.slice(0, expandedAnalysis[project.id] ? undefined : 2).map((strength, index) => (
                          <li key={index} className="list-disc list-inside">{strength}</li>
                        ))}
                        {!expandedAnalysis[project.id] && missingSections.strengths.length > 2 && (
                          <li className="text-gray-600">{t('projectApplication.analysis.others', '...and {count} more', { count: missingSections.strengths.length - 2 })}</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {expandedAnalysis[project.id] && project.extracted_text && (
                    <div className="mt-3 p-2 bg-white rounded border border-gray-200">
                      <h5 className="text-xs font-medium text-gray-800 mb-1">
                        {t('projectApplication.analysis.fullText', 'Full extracted text:')}
                      </h5>
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-48 overflow-auto bg-gray-50 p-2 rounded">
                        {project.extracted_text}
                      </pre>
                    </div>
                  )}
                </div>
                );
              })()}

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

              <div className="mt-4 border-t pt-4">
                {selectedProject?.id === project.id ? (
                  <>
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
                  </>
                ) : (
                  <div className="flex space-x-4">
                    <button
                      onClick={() => {
                        setSelectedProject(project);
                        setReviewComment('');
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                      {t('review.review', 'Review')}
                    </button>
                    <button
                      onClick={async () => {
                        if (window.confirm(t('review.confirmApprove', 'Are you sure you want to approve this project?'))) {
                          await handleReview(project.id, 'approved');
                        }
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                      {t('review.approve', 'Approve')}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedProject(project);
                        setReviewComment('');
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                      {t('review.reject', 'Reject')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {activeTab === 'approved' && (
        <>
          {approvedProjects.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">{t('review.noApprovedProjects', 'No approved projects')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {approvedProjects.map((project) => (
                <div key={project.id} className="bg-white shadow rounded-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{project.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {t('review.executor', 'Executor')}: {project.executor_name} ({project.executor_email})
                      </p>
                    </div>
                    <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-800">
                      {t('review.approved', 'Approved')}
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

                  {/* KPIレポート表示 */}
                  <div className="mt-6 border-t pt-6">
                    <ProjectKpiReports project={project} />
                  </div>

                  {/* 予算管理 */}
                  <div className="mt-6 border-t pt-6">
                    <ProjectBudgetManagement project={project} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Analysis detail modal */}
      {renderAnalysisModal()}
    </div>
  );
};

export default ReviewDashboard;


