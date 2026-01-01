import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import ProjectApplicationForm from './ProjectApplicationForm';
import ProjectKpiReports from './ProjectKpiReports';
import ProjectBudgetManagement from './ProjectBudgetManagement';
import ApprovalStatusView from './ApprovalStatusView';

const ProjectList = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [selectedProjectForKpi, setSelectedProjectForKpi] = useState(null);
  const [selectedProjectForBudget, setSelectedProjectForBudget] = useState(null);
  const [selectedProjectForApprovalStatus, setSelectedProjectForApprovalStatus] = useState(null);
  const [selectedProjectForRejection, setSelectedProjectForRejection] = useState(null); // 却下されたプロジェクトの詳細表示
  const [rejectionDetails, setRejectionDetails] = useState({}); // プロジェクトごとの却下詳細情報
  const [additionalFile, setAdditionalFile] = useState({}); // プロジェクトごとの追加ファイル
  const [executorMessage, setExecutorMessage] = useState({}); // プロジェクトごとの実行者メッセージ
  const [uploadingFile, setUploadingFile] = useState({}); // ファイルアップロード中かどうか
  const { user, userInfo } = useAuth();
  const { t, language } = useLanguage();
  
  const isExecutor = userInfo?.position === 'executor';
  const isAdmin = userInfo?.is_admin || false;

  useEffect(() => {
    console.log('[ProjectList] useEffect triggered', { isExecutor, userInfo, user });
    // userInfoが未取得の初期レンダリング時は待つ
    if (!userInfo) return;

    if (isExecutor) {
      fetchMyProjects();
    } else {
      fetchProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExecutor, userInfo]);

  const fetchProjects = async () => {
    try {
      const response = await api.get('/api/projects');
      setProjects(response.data.projects || []);
      setError('');
      setLoading(false);
    } catch (error) {
      console.error('Error fetching projects:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || t('projects.error.fetch');
      setError(errorMessage);
      setLoading(false);
    }
  };

  const fetchMyProjects = async () => {
    try {
      setLoading(true);
      setError('');
      console.log('[ProjectList] Fetching my projects...', { 
        isExecutor, 
        userInfo, 
        userId: userInfo?.id,
        userEmail: userInfo?.email 
      });
      const response = await api.get('/api/projects/my');
      console.log('[ProjectList] API response:', response);
      console.log('[ProjectList] Fetched projects data:', response.data);
      const projectsList = response.data.projects || [];
      console.log('[ProjectList] Projects list:', projectsList);
      console.log('[ProjectList] Number of projects:', projectsList.length);
      
      // プロジェクトのexecutor_idを確認
      if (projectsList.length > 0) {
        console.log('[ProjectList] First project executor_id:', projectsList[0].executor_id, 'Current userInfo.id:', userInfo?.id);
        projectsList.forEach((p, index) => {
          console.log(`[ProjectList] Project ${index}: id=${p.id}, name=${p.name}, executor_id=${p.executor_id}`);
        });
      }
      
      setProjects(projectsList);
      
      // 却下されたプロジェクトの詳細情報を取得
      const rejectionDetailsMap = {};
      await Promise.all(
        projectsList
          .filter(p => p.application_status === 'rejected' || (p.reviewer_approvals && Object.values(p.reviewer_approvals).some(a => a && a.status === 'rejected')))
          .map(async (p) => {
            try {
              const statusResponse = await api.get(`/api/projects/${p.id}/approval-status`);
              rejectionDetailsMap[p.id] = statusResponse.data;
            } catch (err) {
              console.warn('Failed to fetch rejection details for project', p.id, err);
            }
          })
      );
      setRejectionDetails(rejectionDetailsMap);
      
      setLoading(false);
      
      if (projectsList.length === 0) {
        console.warn('[ProjectList] No projects found for executor:', {
          userId: userInfo?.id,
          userEmail: userInfo?.email,
          position: userInfo?.position
        });
      }
    } catch (error) {
      console.error('Error fetching my projects:', error);
      console.error('Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });

      // 実行者でない/トークンがReviewerの場合の403は全件取得にフォールバック
      if (error.response?.status === 403) {
        console.warn('[ProjectList] 403 on /api/projects/my, fallback to /api/projects (user not executor)');
        setError('');
        fetchProjects();
        return;
      }

      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || t('projects.error.fetch');
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleFormComplete = () => {
    console.log('[ProjectList] handleFormComplete called', { 
      isExecutor, 
      userInfo, 
      userInfoId: userInfo?.id,
      userInfoEmail: userInfo?.email 
    });
    setShowForm(false);
    setEditingProject(null);
    
    // プロジェクト一覧を更新（データベース反映を待つため、少し待機）
    // プロジェクト作成→データベース反映→一覧取得の順序を保証
    // まず即座に一度取得を試みる
    if (isExecutor) {
      console.log('[ProjectList] Refreshing my projects immediately...', {
        userInfoId: userInfo?.id,
        userInfoEmail: userInfo?.email
      });
      fetchMyProjects();
    } else {
      console.log('[ProjectList] Refreshing all projects immediately...');
      fetchProjects();
    }
    
    // その後、データベース反映を待って再度取得（複数回試行）
    const retryCount = 3;
    for (let i = 1; i <= retryCount; i++) {
      setTimeout(() => {
        if (isExecutor) {
          console.log(`[ProjectList] Refreshing my projects after delay (attempt ${i}/${retryCount})...`, {
            userInfoId: userInfo?.id,
            userInfoEmail: userInfo?.email
          });
          fetchMyProjects();
        } else {
          console.log(`[ProjectList] Refreshing all projects after delay (attempt ${i}/${retryCount})...`);
          fetchProjects();
        }
      }, i * 2000); // 2秒、4秒、6秒後に取得を試行
    }
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm(t('projects.deleteConfirm'))) {
      return;
    }
    try {
      await api.delete(`/api/projects/${id}`);
      // 実行者かどうかで適切な関数を呼び出す
      if (isExecutor) {
        fetchMyProjects();
      } else {
        fetchProjects();
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || t('projects.error.delete');
      setError(errorMessage);
      alert(errorMessage);
    }
  };

  // プロジェクトを削除できるかどうかを判定
  const canDeleteProject = (project) => {
    // 管理者は全てのプロジェクトを削除可能
    if (isAdmin) {
      return true;
    }
    // 実行者は自分のプロジェクトのみ削除可能
    if (isExecutor && project.executor_id === userInfo?.id) {
      return true;
    }
    return false;
  };

  const getStatusColor = (status) => {
    const colors = {
      planning: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      on_hold: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
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
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {isExecutor ? t('projects.myProjects', 'My Projects') : t('projects.title', 'Projects')}
        </h2>
        {isExecutor && (
          <button
            onClick={() => {
              setShowForm(!showForm);
              setEditingProject(null);
            }}
            className="mt-4 sm:mt-0 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            {showForm ? t('projects.cancel') : t('projects.newProject', 'New Project Application')}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800 font-medium">エラー: {error}</p>
          {isExecutor && error.includes('executor') && (
            <p className="text-xs text-red-600 mt-2">
              ヒント: プロジェクトを作成するには、ユーザーのpositionが'executor'である必要があります。現在のpositionを確認してください。
            </p>
          )}
        </div>
      )}

      {(showForm || editingProject) && isExecutor && (
        <ProjectApplicationForm
          project={editingProject}
          onComplete={(savedProject) => {
            console.log('[ProjectList] onComplete called with project:', savedProject);
            console.log('[ProjectList] Current projects before update:', projects);
            console.log('[ProjectList] Current userInfo:', userInfo);
            
            // 保存されたプロジェクト情報でeditingProjectを更新
            if (savedProject) {
              console.log('[ProjectList] Adding saved project to list directly');
              console.log('[ProjectList] Saved project executor_id:', savedProject.executor_id);
              console.log('[ProjectList] Current userInfo.id:', userInfo?.id);
              
              // 保存されたプロジェクトを直接一覧に追加（executor_idが一致する場合のみ）
              if (savedProject.executor_id === userInfo?.id || savedProject.executor_id === parseInt(userInfo?.id)) {
                console.log('[ProjectList] Executor ID matches, adding project to list');
                // 既存のプロジェクトを確認（重複を避ける）
                const existingIndex = projects.findIndex(p => p.id === savedProject.id);
                if (existingIndex >= 0) {
                  // 既に存在する場合は更新
                  const updatedProjects = [...projects];
                  updatedProjects[existingIndex] = savedProject;
                  setProjects(updatedProjects);
                  console.log('[ProjectList] Updated existing project in list');
                } else {
                  // 新規の場合は先頭に追加
                  setProjects([savedProject, ...projects]);
                  console.log('[ProjectList] Added new project to list');
                }
              } else {
                console.warn('[ProjectList] Executor ID mismatch!', {
                  savedProjectExecutorId: savedProject.executor_id,
                  userInfoId: userInfo?.id,
                  types: {
                    savedProjectExecutorId: typeof savedProject.executor_id,
                    userInfoId: typeof userInfo?.id
                  }
                });
              }
              
              // 保存されたプロジェクト情報でeditingProjectを更新（フォームを継続表示）
              setEditingProject(savedProject);
              // フォームは閉じない（下書保存のため）
              // setShowForm(false); を削除
              
              // プロジェクト一覧を即座に更新（バックエンドから最新情報を取得）
              // 複数回試行して確実に取得
              if (isExecutor) {
                fetchMyProjects();
                setTimeout(() => fetchMyProjects(), 500);
                setTimeout(() => fetchMyProjects(), 2000);
              } else {
                fetchProjects();
                setTimeout(() => fetchProjects(), 500);
                setTimeout(() => fetchProjects(), 2000);
              }
            } else {
              handleFormComplete();
            }
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingProject(null);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4">
        {projects.map((project) => (
          <div key={project.id} className="bg-white shadow rounded-lg p-6 w-full">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-medium text-gray-900">{project.name}</h3>
              <div className="flex flex-col items-end space-y-1">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(project.status)}`}>
                  {t(`projects.status.${project.status}`)}
                </span>
                {project.application_status && (
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    project.application_status === 'approved' ? 'bg-green-100 text-green-800' :
                    project.application_status === 'rejected' ? 'bg-red-100 text-red-800' :
                    project.application_status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {project.application_status === 'draft' && t('projects.applicationStatus.draft', 'Draft')}
                    {project.application_status === 'submitted' && t('projects.applicationStatus.submitted', 'Submitted')}
                    {project.application_status === 'approved' && t('projects.applicationStatus.approved', 'Approved')}
                    {project.application_status === 'rejected' && t('projects.applicationStatus.rejected', 'Rejected')}
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">{project.description}</p>
            {project.requested_amount && (
              <div className="text-sm text-gray-700 mb-2">
                <span className="font-medium">{t('projects.requestedAmount', 'Requested Amount')}: </span>
                {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(project.requested_amount)}
              </div>
            )}
            {project.executor_name && (
              <div className="text-xs text-gray-500 mb-1">
                {t('projects.executor', 'Executor')}: {project.executor_name}
              </div>
            )}
            {(project.reviewer_name || (project.reviewers && project.reviewers.length > 0)) && (
              <div className="text-xs text-gray-500 mb-1">
                {t('projects.reviewer', 'Reviewer')}: {
                  project.reviewers && project.reviewers.length > 0
                    ? project.reviewers.map(r => r.name).join(', ')
                    : project.reviewer_name
                }
              </div>
            )}
            <div className="text-xs text-gray-500">
              {t('projects.created')}: {new Date(project.created_at).toLocaleDateString()}
            </div>
            
            {/* ファイルアップロード情報と分析ボタン */}
            {(project.application_file_name || project.application_file_url || project.missing_sections) && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                {project.application_file_name && (
                  <div className="text-xs text-gray-600 mb-2">
                    <span className="font-medium">{t('projectApplication.uploadedFile', 'Uploaded File')}: </span>
                    {project.application_file_name}
                  </div>
                )}
                <div className="flex space-x-2">
                  {(project.application_file_url || project.missing_sections) && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          // 現在の言語設定をリクエストに含める
                          const response = await api.post(`/api/projects/${project.id}/check-missing-sections`, {
                            language: language || 'ja'
                          });
                          alert(t('projectApplication.sectionsChecked', 'Missing sections checked successfully. Please check the project details.'));
                          // プロジェクト一覧を更新
                          if (isExecutor) {
                            fetchMyProjects();
                          } else {
                            fetchProjects();
                          }
                        } catch (error) {
                          console.error('Error checking missing sections:', error);
                          alert(error.response?.data?.error || t('projectApplication.error.checkSections', 'Failed to check missing sections'));
                        }
                      }}
                      className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700"
                    >
                      {t('projectApplication.analysis.checkSections', 'Check Missing Sections')}
                    </button>
                  )}
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
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">
                    {t('projectApplication.analysis.title', 'Document Evaluation Results')}
                  </h4>
                  
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      {t('projectApplication.analysis.completeness', 'Completeness Score')}
                    </span>
                    {missingSections.completeness_score !== undefined && (
                      <span className={`text-sm font-bold ${
                        missingSections.completeness_score >= 80 ? 'text-green-600' :
                        missingSections.completeness_score >= 60 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {missingSections.completeness_score}%
                      </span>
                    )}
                  </div>
                  {missingSections.completeness_score !== undefined && (
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                      <div
                        className={`h-2 rounded-full ${
                          missingSections.completeness_score >= 80 ? 'bg-green-600' :
                          missingSections.completeness_score >= 60 ? 'bg-yellow-600' :
                          'bg-red-600'
                        }`}
                        style={{ width: `${missingSections.completeness_score}%` }}
                      />
                    </div>
                  )}
                  
                  {missingSections.missing_sections && missingSections.missing_sections.length > 0 && (
                    <div className="mb-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                      <p className="text-xs font-medium text-yellow-800 mb-1">
                        {t('projectApplication.analysis.missingSections', 'Missing Sections')}: {missingSections.missing_sections.length}
                      </p>
                    </div>
                  )}
                  
                  {missingSections.critical_issues && missingSections.critical_issues.length > 0 && (
                    <div className="mb-2 p-2 bg-red-50 rounded border border-red-200">
                      <p className="text-xs font-medium text-red-800 mb-1">
                        {t('projectApplication.analysis.criticalIssues', 'Critical Issues')}: {missingSections.critical_issues.length}
                      </p>
                    </div>
                  )}
                  
                  {missingSections.strengths && missingSections.strengths.length > 0 && (
                    <div className="mb-2 p-2 bg-green-50 rounded border border-green-200">
                      <p className="text-xs font-medium text-green-800 mb-1">
                        {t('projectApplication.analysis.strengths', 'Strengths')}: {missingSections.strengths.length}
                      </p>
                    </div>
                  )}
                  
                  {missingSections.recommendations && missingSections.recommendations.length > 0 && (
                    <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                      <p className="text-xs font-medium text-blue-800 mb-1">
                        {t('projectApplication.analysis.recommendations', 'Recommendations')}: {missingSections.recommendations.length}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
            
            {/* 実行者が自分のプロジェクトを操作する場合 */}
            {isExecutor && project.executor_id === userInfo?.id && (
              <div className="mt-4 flex flex-col space-y-2">
                <div className="flex flex-wrap gap-2">
                  {/* 審査状況表示ボタン（提出済みまたは承認済みの場合） */}
                  {(project.application_status === 'submitted' || project.application_status === 'approved') && (
                    <button
                      onClick={() => setSelectedProjectForApprovalStatus(selectedProjectForApprovalStatus?.id === project.id ? null : project)}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md"
                    >
                      {selectedProjectForApprovalStatus?.id === project.id ? '審査状況を閉じる' : '審査状況を確認'}
                    </button>
                  )}
                  {/* 却下されたプロジェクトの詳細表示ボタン */}
                  {(project.application_status === 'rejected' || (project.reviewer_approvals && Object.values(project.reviewer_approvals).some(a => a && a.status === 'rejected'))) && (
                    <button
                      onClick={() => setSelectedProjectForRejection(selectedProjectForRejection?.id === project.id ? null : project)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md"
                    >
                      {selectedProjectForRejection?.id === project.id ? '却下詳細を閉じる' : '却下詳細を確認'}
                    </button>
                  )}
                  {project.application_status === 'draft' && (
                    <>
                      <button
                        onClick={() => setEditingProject(project)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md"
                      >
                        {t('projects.edit', 'Edit')}
                      </button>
                      <button
                        onClick={async () => {
                          // 複数の審査者が設定されているか確認
                          const hasReviewers = (project.reviewers && project.reviewers.length > 0) || project.reviewer_id;
                          if (!hasReviewers) {
                            alert(t('projectApplication.reviewerRequired', 'Please select at least one reviewer before submitting'));
                            return;
                          }
                          if (!window.confirm(t('projectApplication.confirmSubmit', 'Are you sure you want to submit this application for review?'))) {
                            return;
                          }
                          try {
                            await api.post(`/api/projects/${project.id}/submit`);
                            alert(t('projectApplication.submitted', 'Application submitted successfully'));
                            if (isExecutor) {
                              fetchMyProjects();
                            } else {
                              fetchProjects();
                            }
                          } catch (error) {
                            console.error('Error submitting application:', error);
                            alert(error.response?.data?.error || t('projectApplication.error.submit', 'Failed to submit application'));
                          }
                        }}
                        disabled={!(project.reviewers && project.reviewers.length > 0) && !project.reviewer_id}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                          ((project.reviewers && project.reviewers.length > 0) || project.reviewer_id)
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {t('projectApplication.submit', 'Submit for Review')}
                      </button>
                    </>
                  )}
                  {project.application_status === 'approved' && (
                    <>
                      <button
                        onClick={() => setSelectedProjectForKpi(selectedProjectForKpi?.id === project.id ? null : project)}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md"
                      >
                        {selectedProjectForKpi?.id === project.id ? t('kpi.hideReports', 'Hide KPI Reports') : t('kpi.showReports', 'Manage KPI Reports')}
                      </button>
                      <button
                        onClick={() => setSelectedProjectForBudget(selectedProjectForBudget?.id === project.id ? null : project)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
                      >
                        {selectedProjectForBudget?.id === project.id ? t('budget.hideBudget', 'Hide Budget Management') : t('budget.showBudget', 'Manage Budget')}
                      </button>
                    </>
                  )}
                  {canDeleteProject(project) && (
                    <button
                      onClick={() => handleDeleteProject(project.id)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md"
                    >
                      {t('projects.delete', 'Delete')}
                    </button>
                  )}
                </div>
                {selectedProjectForKpi?.id === project.id && (
                  <div className="mt-4 border-t pt-4">
                    <ProjectKpiReports project={selectedProjectForKpi} />
                  </div>
                )}
                {selectedProjectForBudget?.id === project.id && (
                  <div className="mt-4 border-t pt-4">
                    <ProjectBudgetManagement project={selectedProjectForBudget} />
                  </div>
                )}
                {/* 却下情報の表示 */}
                {selectedProjectForRejection?.id === project.id && (
                  <RejectionDetailsSection
                    project={project}
                    rejectionDetails={rejectionDetails[project.id]}
                    additionalFile={additionalFile[project.id]}
                    executorMessage={executorMessage[project.id]}
                    uploadingFile={uploadingFile[project.id]}
                    onFileChange={(file) => setAdditionalFile((prev) => ({ ...prev, [project.id]: file }))}
                    onMessageChange={(message) => setExecutorMessage((prev) => ({ ...prev, [project.id]: message }))}
                    onUploadFile={async () => {
                      if (!additionalFile[project.id]) {
                        alert(t('rejection.fileRequired', 'Please select a file to upload'));
                        return;
                      }
                      setUploadingFile((prev) => ({ ...prev, [project.id]: true }));
                      try {
                        const formData = new FormData();
                        formData.append('additionalFile', additionalFile[project.id]);
                        if (executorMessage[project.id]) {
                          formData.append('executorMessage', executorMessage[project.id]);
                        }
                        await api.post(`/api/projects/${project.id}/add-additional-material`, formData, {
                          headers: { 'Content-Type': 'multipart/form-data' }
                        });
                        alert(t('rejection.fileUploaded', 'Additional material uploaded successfully'));
                        setAdditionalFile((prev) => ({ ...prev, [project.id]: null }));
                        setExecutorMessage((prev) => ({ ...prev, [project.id]: '' }));
                        if (isExecutor) {
                          fetchMyProjects();
                        } else {
                          fetchProjects();
                        }
                      } catch (error) {
                        console.error('Error uploading additional material:', error);
                        alert(error.response?.data?.error || t('rejection.uploadError', 'Failed to upload additional material'));
                      } finally {
                        setUploadingFile((prev) => ({ ...prev, [project.id]: false }));
                      }
                    }}
                    onSendMessage={async () => {
                      if (!executorMessage[project.id]?.trim()) {
                        alert(t('rejection.messageRequired', 'Please enter a message'));
                        return;
                      }
                      try {
                        await api.post(`/api/projects/${project.id}/send-message-to-reviewers`, {
                          message: executorMessage[project.id]
                        });
                        alert(t('rejection.messageSent', 'Message sent successfully'));
                        setExecutorMessage((prev) => ({ ...prev, [project.id]: '' }));
                        if (isExecutor) {
                          fetchMyProjects();
                        } else {
                          fetchProjects();
                        }
                      } catch (error) {
                        console.error('Error sending message:', error);
                        alert(error.response?.data?.error || t('rejection.messageError', 'Failed to send message'));
                      }
                    }}
                  />
                )}
              </div>
            )}

            {/* 審査状況表示モーダル */}
            {selectedProjectForApprovalStatus?.id === project.id && (
              <ApprovalStatusView
                projectId={project.id}
                onClose={() => {
                  setSelectedProjectForApprovalStatus(null);
                  // 審査状況を更新
                  if (isExecutor) {
                    fetchMyProjects();
                  } else {
                    fetchProjects();
                  }
                }}
              />
            )}
            
            {/* 管理者が全てのプロジェクトを削除できる場合（実行者が自分のプロジェクトを操作する場合を除く） */}
            {isAdmin && !(isExecutor && project.executor_id === userInfo?.id) && canDeleteProject(project) && (
              <div className="mt-4 flex flex-col space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleDeleteProject(project.id)}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md"
                  >
                    {t('projects.delete', 'Delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {projects.length === 0 && !loading && !error && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">{t('projects.noProjects', 'No projects found')}</p>
          {isExecutor && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">
                プロジェクトを作成するには、右上の「新規プロジェクト申請」ボタンをクリックしてください。
              </p>
              <p className="text-xs text-gray-500">
                デバッグ情報: isExecutor={String(isExecutor)}, userInfo.position={userInfo?.position}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 却下情報表示コンポーネント
const RejectionDetailsSection = ({ 
  project, 
  rejectionDetails, 
  additionalFile, 
  executorMessage, 
  uploadingFile,
  onFileChange, 
  onMessageChange, 
  onUploadFile, 
  onSendMessage 
}) => {
  const { t } = useLanguage();
  
  // 却下した審査員を取得
  const rejectedReviewers = rejectionDetails?.reviewers?.filter(r => {
    const approval = rejectionDetails?.reviewer_approvals?.[r.id];
    return approval && approval.status === 'rejected';
  }) || [];
  
  return (
    <div className="mt-4 border-t pt-4">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
        <h4 className="text-lg font-semibold text-red-800 mb-3">
          {t('rejection.title', 'Project Rejected')}
        </h4>
        
        {/* 却下した審査員と理由 */}
        {rejectedReviewers.length > 0 && (
          <div className="space-y-3 mb-4">
            {rejectedReviewers.map((reviewer) => {
              const approval = rejectionDetails?.reviewer_approvals?.[reviewer.id];
              return (
                <div key={reviewer.id} className="bg-white rounded p-3 border border-red-200">
                  <div className="font-medium text-gray-900 mb-1">
                    {t('rejection.reviewer', 'Reviewer')}: {reviewer.name || reviewer.email}
                  </div>
                  {approval?.review_comment && (
                    <div className="text-sm text-gray-700 mt-2">
                      <span className="font-medium">{t('rejection.reason', 'Rejection Reason')}:</span>
                      <p className="mt-1 whitespace-pre-wrap">{approval.review_comment}</p>
                    </div>
                  )}
                  {approval?.updated_at && (
                    <div className="text-xs text-gray-500 mt-2">
                      {t('rejection.rejectedAt', 'Rejected at')}: {new Date(approval.updated_at).toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {/* 最終決裁者が却下した場合 */}
        {rejectionDetails?.final_approver_user_id && project.review_comment && project.application_status === 'rejected' && (
          <div className="bg-white rounded p-3 border border-red-200 mb-4">
            <div className="font-medium text-gray-900 mb-1">
              {t('rejection.finalApprover', 'Final Approver')}: {rejectionDetails.final_approver_name || rejectionDetails.final_approver_email}
            </div>
            {project.review_comment && (
              <div className="text-sm text-gray-700 mt-2">
                <span className="font-medium">{t('rejection.reason', 'Rejection Reason')}:</span>
                <p className="mt-1 whitespace-pre-wrap">{project.review_comment}</p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* 資料追加とメッセージ送信 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h5 className="text-md font-semibold text-blue-800 mb-3">
          {t('rejection.actions', 'Actions')}
        </h5>
        
        {/* 追加資料のアップロード */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('rejection.uploadAdditionalMaterial', 'Upload Additional Material')}
          </label>
          <input
            type="file"
            onChange={(e) => onFileChange(e.target.files[0])}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            accept=".pdf,.doc,.docx,.pptx,.xlsx"
          />
          {additionalFile && (
            <p className="text-xs text-gray-600 mt-1">
              {t('rejection.selectedFile', 'Selected file')}: {additionalFile.name}
            </p>
          )}
          <button
            onClick={onUploadFile}
            disabled={!additionalFile || uploadingFile}
            className={`mt-2 px-4 py-2 rounded-md text-sm font-medium ${
              !additionalFile || uploadingFile
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {uploadingFile ? t('rejection.uploading', 'Uploading...') : t('rejection.upload', 'Upload')}
          </button>
        </div>
        
        {/* メッセージ送信 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('rejection.sendMessage', 'Send Message to Reviewers')}
          </label>
          <textarea
            rows="4"
            value={executorMessage || ''}
            onChange={(e) => onMessageChange(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border mb-2"
            placeholder={t('rejection.messagePlaceholder', 'Enter your message to reviewers...')}
          />
          <button
            onClick={onSendMessage}
            disabled={!executorMessage?.trim()}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              !executorMessage?.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {t('rejection.send', 'Send Message')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectList;
