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
  const [selectedFile, setSelectedFile] = useState(null);
  const [reviewers, setReviewers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [kpiReports, setKpiReports] = useState([]);
  const [editingKpiReport, setEditingKpiReport] = useState(null);
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [kpiReportType, setKpiReportType] = useState(null);
  const [extractedText, setExtractedText] = useState(null);
  const [missingSections, setMissingSections] = useState(null);
  const [extractingText, setExtractingText] = useState(false);
  const [checkingSections, setCheckingSections] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    fetchReviewers();
    if (project?.id) {
      fetchKpiReports();
      fetchExtractedText();
      fetchMissingSections();
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
      // FormDataを使用してファイルアップロード
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('description', formData.description || '');
      formDataToSend.append('requested_amount', formData.requested_amount);
      if (formData.reviewer_id) {
        formDataToSend.append('reviewer_id', formData.reviewer_id);
      }
      
      if (selectedFile) {
        formDataToSend.append('applicationFile', selectedFile);
      }

      if (project) {
        // 更新
        await api.put(`/api/projects/${project.id}`, formDataToSend);
      } else {
        // 新規作成
        await api.post('/api/projects', formDataToSend);
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
        return ['external_mvp'];
      case '100m_to_500m':
        return ['internal_mvp', 'external_mvp'];
      case 'over_500m':
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // ファイルタイプの検証
      const allowedTypes = [
        'application/pdf',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint.presentation.macroEnabled.12'
      ];
      const allowedExtensions = ['.pdf', '.ppt', '.pptx', '.pptm'];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        setError(t('projectApplication.file.invalidType', 'Only PPT and PDF files are allowed'));
        return;
      }
      
      // ファイルサイズの検証（50MB制限）
      if (file.size > 50 * 1024 * 1024) {
        setError(t('projectApplication.file.tooLarge', 'File size must be less than 50MB'));
        return;
      }
      
      setSelectedFile(file);
      setError('');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const fetchExtractedText = async () => {
    if (!project?.id) return;
    try {
      const response = await api.get(`/api/projects/${project.id}/extracted-text`);
      setExtractedText(response.data.extracted_text);
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Error fetching extracted text:', error);
      }
    }
  };

  const fetchMissingSections = async () => {
    if (!project?.id) return;
    try {
      const response = await api.get(`/api/projects/${project.id}/missing-sections`);
      setMissingSections(response.data.missing_sections);
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Error fetching missing sections:', error);
      }
    }
  };

  const handleExtractText = async () => {
    if (!project?.id) return;
    try {
      setExtractingText(true);
      setError('');
      const response = await api.post(`/api/projects/${project.id}/extract-text`);
      setExtractedText(response.data.extracted_text);
      alert(t('projectApplication.textExtracted', 'Text extracted successfully'));
    } catch (error) {
      console.error('Error extracting text:', error);
      setError(error.response?.data?.error || t('projectApplication.error.extractText', 'Failed to extract text'));
    } finally {
      setExtractingText(false);
    }
  };

  const handleCheckMissingSections = async () => {
    if (!project?.id) return;
    try {
      setCheckingSections(true);
      setError('');
      const response = await api.post(`/api/projects/${project.id}/check-missing-sections`);
      setMissingSections(response.data.analysis);
      alert(t('projectApplication.sectionsChecked', 'Missing sections checked successfully'));
    } catch (error) {
      console.error('Error checking missing sections:', error);
      setError(error.response?.data?.error || t('projectApplication.error.checkSections', 'Failed to check missing sections'));
    } finally {
      setCheckingSections(false);
    }
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
              placeholder="プロジェクトの概要を入力してください"
            />
          </div>

          {/* ファイルアップロード */}
          <div className="mb-6 border-b border-gray-200 pb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t('projectApplication.file.title', 'Application Document (PPT/PDF)')}
            </h3>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
              <p className="text-sm font-medium text-blue-900 mb-2">
                {t('projectApplication.file.description', 'Please upload a PPT or PDF file containing sections 2-10 of the project application')}
              </p>
              <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
                <li>{t('projectApplication.file.requirement.1', 'File format: PPT (.ppt, .pptx, .pptm) or PDF (.pdf)')}</li>
                <li>{t('projectApplication.file.requirement.2', 'Maximum file size: 50MB')}</li>
                <li>{t('projectApplication.file.requirement.3', 'The document should include all required sections (2-10)')}</li>
              </ul>
            </div>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('projectApplication.file.select', 'Select File')}
              </label>
              <input
                type="file"
                accept=".pdf,.ppt,.pptx,.pptm"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              
              {selectedFile && (
                <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-800">
                    <strong>{t('projectApplication.file.selected', 'Selected:')}</strong> {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                </div>
              )}
              
              {project?.application_file_url && !selectedFile && (
                <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>{t('projectApplication.file.current', 'Current file:')}</strong> {project.application_file_name || 'N/A'}
                  </p>
                  <a
                    href={project.application_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                  >
                    {t('projectApplication.file.download', 'Download current file')}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* テキスト抽出と不足部分チェック */}
          {project?.id && project?.application_file_url && (
            <div className="mb-6 border-b border-gray-200 pb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {t('projectApplication.analysis.title', 'Document Analysis')}
              </h3>
              
              <div className="space-y-4">
                {/* テキスト抽出 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-medium text-gray-900">
                      {t('projectApplication.analysis.extractText', 'Extract Text from Document')}
                    </h4>
                    <button
                      type="button"
                      onClick={handleExtractText}
                      disabled={extractingText}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      {extractingText ? t('projectApplication.analysis.extracting', 'Extracting...') : t('projectApplication.analysis.extract', 'Extract Text')}
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {t('projectApplication.analysis.extractDescription', 'Extract text content from the uploaded PPT/PDF file using AI')}
                  </p>
                  {extractedText && (
                    <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {extractedText.substring(0, 500)}
                        {extractedText.length > 500 && '...'}
                      </p>
                      {extractedText.length > 500 && (
                        <button
                          type="button"
                          onClick={() => {
                            const fullText = window.prompt(t('projectApplication.analysis.fullText', 'Full extracted text:'), extractedText);
                          }}
                          className="mt-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                        >
                          {t('projectApplication.analysis.viewFull', 'View full text')}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 不足部分チェック */}
                {extractedText && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium text-gray-900">
                        {t('projectApplication.analysis.checkMissing', 'Check Missing Sections')}
                      </h4>
                      <button
                        type="button"
                        onClick={handleCheckMissingSections}
                        disabled={checkingSections}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        {checkingSections ? t('projectApplication.analysis.checking', 'Checking...') : t('projectApplication.analysis.check', 'Check Missing Sections')}
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      {t('projectApplication.analysis.checkDescription', 'Analyze the extracted text and identify missing sections required for the project application')}
                    </p>
                    {missingSections && (
                      <div className="mt-3 space-y-3">
                        {missingSections.completeness_score !== undefined && (
                          <div className="p-3 bg-white rounded border border-gray-200">
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
                        {missingSections.missing_sections && missingSections.missing_sections.length > 0 && (
                          <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                            <h5 className="text-sm font-medium text-yellow-900 mb-2">
                              {t('projectApplication.analysis.missingSections', 'Missing Sections')}
                            </h5>
                            <ul className="space-y-3">
                              {missingSections.missing_sections.map((section, index) => (
                                <li key={index} className="text-sm text-yellow-800">
                                  <div className="mb-1">
                                    <strong>
                                      {section.section_number}. {section.section_name}
                                      {section.is_missing && <span className="ml-2 text-red-600">(不足)</span>}
                                      {section.is_incomplete && <span className="ml-2 text-orange-600">(不完全)</span>}
                                    </strong>
                                  </div>
                                  {section.reason && (
                                    <p className="text-xs text-yellow-700 mb-1">{section.reason}</p>
                                  )}
                                  {section.checkpoints && section.checkpoints.length > 0 && (
                                    <ul className="ml-4 mt-1 space-y-1">
                                      {section.checkpoints.map((checkpoint, cpIndex) => (
                                        <li key={cpIndex} className="text-xs">
                                          <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                                            checkpoint.status === 'ok' ? 'bg-green-500' :
                                            checkpoint.status === 'missing' ? 'bg-red-500' :
                                            'bg-yellow-500'
                                          }`}></span>
                                          {checkpoint.point}
                                          {checkpoint.note && <span className="text-gray-600"> - {checkpoint.note}</span>}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {missingSections.category_scores && (
                          <div className="p-3 bg-white rounded border border-gray-200">
                            <h5 className="text-sm font-medium text-gray-900 mb-3">
                              {t('projectApplication.analysis.categoryScores', 'Category Scores')}
                            </h5>
                            <div className="space-y-2">
                              {Object.entries(missingSections.category_scores).map(([category, score]) => (
                                <div key={category}>
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-gray-700">{category}</span>
                                    <span className={`text-xs font-medium ${
                                      score >= 80 ? 'text-green-600' :
                                      score >= 60 ? 'text-yellow-600' :
                                      'text-red-600'
                                    }`}>
                                      {score}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                                    <div
                                      className={`h-1.5 rounded-full ${
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
                        {missingSections.strengths && missingSections.strengths.length > 0 && (
                          <div className="p-3 bg-green-50 rounded border border-green-200">
                            <h5 className="text-sm font-medium text-green-900 mb-2">
                              {t('projectApplication.analysis.strengths', 'Strengths')}
                            </h5>
                            <ul className="list-disc list-inside space-y-1">
                              {missingSections.strengths.map((strength, index) => (
                                <li key={index} className="text-sm text-green-800">{strength}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {missingSections.critical_issues && missingSections.critical_issues.length > 0 && (
                          <div className="p-3 bg-red-50 rounded border border-red-200">
                            <h5 className="text-sm font-medium text-red-900 mb-2">
                              {t('projectApplication.analysis.criticalIssues', 'Critical Issues')}
                            </h5>
                            <ul className="list-disc list-inside space-y-1">
                              {missingSections.critical_issues.map((issue, index) => (
                                <li key={index} className="text-sm text-red-800">{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {missingSections.recommendations && missingSections.recommendations.length > 0 && (
                          <div className="p-3 bg-blue-50 rounded border border-blue-200">
                            <h5 className="text-sm font-medium text-blue-900 mb-2">
                              {t('projectApplication.analysis.recommendations', 'Recommendations')}
                            </h5>
                            <ul className="list-disc list-inside space-y-1">
                              {missingSections.recommendations.map((rec, index) => (
                                <li key={index} className="text-sm text-blue-800">{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

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
