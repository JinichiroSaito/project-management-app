import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import ProjectApplicationForm from './ProjectApplicationForm';

const ProjectList = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const { user, userInfo } = useAuth();
  const { t } = useLanguage();
  
  const isExecutor = userInfo?.position === 'executor';

  useEffect(() => {
    if (isExecutor) {
      fetchMyProjects();
    } else {
      fetchProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExecutor]);

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
      const response = await api.get('/api/projects/my');
      setProjects(response.data.projects);
      setLoading(false);
    } catch (error) {
      setError(t('projects.error.fetch'));
      setLoading(false);
    }
  };

  const handleFormComplete = () => {
    setShowForm(false);
    setEditingProject(null);
    if (isExecutor) {
      fetchMyProjects();
    } else {
      fetchProjects();
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
      setError(t('projects.error.delete'));
    }
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
        <h2 className="text-2xl font-bold text-gray-900">{t('projects.title')}</h2>
        {user && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="mt-4 sm:mt-0 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            {showForm ? t('projects.cancel') : t('projects.newProject')}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {(showForm || editingProject) && isExecutor && (
        <ProjectApplicationForm
          project={editingProject}
          onComplete={handleFormComplete}
          onCancel={() => {
            setShowForm(false);
            setEditingProject(null);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <div key={project.id} className="bg-white shadow rounded-lg p-6">
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
            {project.reviewer_name && (
              <div className="text-xs text-gray-500 mb-1">
                {t('projects.reviewer', 'Reviewer')}: {project.reviewer_name}
              </div>
            )}
            <div className="text-xs text-gray-500">
              {t('projects.created')}: {new Date(project.created_at).toLocaleDateString()}
            </div>
            {isExecutor && project.executor_id === userInfo?.id && (
              <div className="mt-4 flex space-x-2">
                {project.application_status === 'draft' && (
                  <button
                    onClick={() => setEditingProject(project)}
                    className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                  >
                    {t('projects.edit', 'Edit')}
                  </button>
                )}
                <button
                  onClick={() => handleDeleteProject(project.id)}
                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                >
                  {t('projects.delete', 'Delete')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">{t('projects.noProjects')}</p>
        </div>
      )}
    </div>
  );
};

export default ProjectList;
