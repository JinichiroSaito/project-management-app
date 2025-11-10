import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import KpiReportForm from './KpiReportForm';

// 各セクションの説明を定義
const sectionDescriptions = {
  section_2: {
    title: '2. ターゲット顧客［必須：アイディエーション］',
    description: [
      'コアペルソナ 1〜3体（属性／行動／動機）',
      '作成根拠（何名・方法・実施時期）',
      '代替手段（現状のやり方・競合）'
    ]
  },
  section_3: {
    title: '3. 顧客課題（具体性・深刻度）［必須：アイディエーション］',
    description: [
      '誰が／いつ・どこで／何をしようとして／何に阻まれるか（状況・トリガー・阻害要因・結果）',
      'エビデンス添付：インタビュー引用・観察ノート・アンケート結果（どの結論に対応かを明記）'
    ]
  },
  section_4: {
    title: '4. ソリューション仮説（課題—解決の整合）',
    description: [
      'どの場面で、何と比べて、どれだけ良いか（PSM等の主張と出所のトレーサビリティ）',
      'コア機能／提供価値の要点'
    ]
  },
  section_5: {
    title: '5. 差別化・自社優位',
    description: [
      '比較表：主要競合/代替（機能・価格・UX）',
      '自社アセット活用（技術・データ・ブランド・チャネル・顧客基盤・人材）',
      '優位の維持/拡張メカニズム（非模倣性、学習効果、ネットワーク、規模等）'
    ]
  },
  section_6: {
    title: '6. 市場性',
    description: [
      'ターゲット市場規模（潜在顧客数／売上規模）と根拠データ',
      '成長率・動向（将来性の仮説でも可：アイディエーション）',
      'ニッチ戦略／拡張余地（MVPではアップデート数値）'
    ]
  },
  section_7: {
    title: '7. 収益モデル',
    description: [
      '誰が何に対していくら払うか（料金形態：サブスク／従量／広告 等）',
      '主要収益源ごとの売上規模・粗利想定（仮説で可：アイディエーション）',
      '収支シミュレーション（主コスト要因、単価、CAC/LTV 等：MVPは更新版）'
    ]
  },
  section_8_1: {
    title: '8-1. 検証計画：アイディエーション（PoC）［必須：核心仮説＆計画］',
    description: [
      '核心仮説（課題仮説／解決仮説）と検証方法（実験手法・評価指標）',
      '期間・使用データ/技術・体制',
      'PoCの成功判定（KPI、Go/Kill条件と未達時の対応）'
    ]
  },
  section_8_2: {
    title: '8-2. 検証計画：MVP開発（顧客価値・有償意向）',
    description: [
      'コアバリューが伝わるMVPのスコープ［必須：MVPコア価値］',
      'ユーザー参画計画（パイロット顧客/βユーザーの属性・確保状況・合意数）',
      '価格検証／支払いフロー試行（有償転換率テスト等）',
      '成功指標とGo/Kill基準［必須：明確化］（例：継続率・有料転換率・NPS・解約率）',
      'トライアル運用計画（期間、サポート/問い合わせ対応、フィードバック収集）'
    ]
  },
  section_9: {
    title: '9. 実行計画・体制・予算',
    description: [
      'マイルストーン（試作完了／テスト開始／評価／次フェーズ判断）',
      '体制（必要スキル：開発・UX・ユーザー対応・マーケ）',
      '予算内実行可否（見積根拠・リソース確保状況）',
      'リスクと対応（技術・法規・データ入手・人員）'
    ]
  },
  section_10: {
    title: '10. 自社戦略との整合',
    description: [
      '部署ミッション／中長期戦略との適合',
      '「Why us」（自社でやる意義）と本業へのシナジー',
      '検証結果の社内位置付け（次ステップ、横展開の可能性）'
    ]
  }
};

const ProjectApplicationForm = ({ project, onComplete, onCancel }) => {
  const [formData, setFormData] = useState({
    name: project?.name || '',
    description: project?.description || '',
    requested_amount: project?.requested_amount || '',
    reviewer_id: project?.reviewer_id || '',
    section_2_target_customers: project?.section_2_target_customers || '',
    section_3_customer_problems: project?.section_3_customer_problems || '',
    section_4_solution_hypothesis: project?.section_4_solution_hypothesis || '',
    section_5_differentiation: project?.section_5_differentiation || '',
    section_6_market_potential: project?.section_6_market_potential || '',
    section_7_revenue_model: project?.section_7_revenue_model || '',
    section_8_1_ideation_plan: project?.section_8_1_ideation_plan || '',
    section_8_2_mvp_plan: project?.section_8_2_mvp_plan || '',
    section_9_execution_plan: project?.section_9_execution_plan || '',
    section_10_strategic_alignment: project?.section_10_strategic_alignment || ''
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

  const renderSectionField = (sectionKey, fieldName) => {
    const section = sectionDescriptions[sectionKey];
    if (!section) return null;

    return (
      <div className="mb-6 border-b border-gray-200 pb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{section.title}</h3>
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
          <p className="text-sm font-medium text-blue-900 mb-2">記載すべき内容：</p>
          <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
            {section.description.map((desc, idx) => (
              <li key={idx}>{desc}</li>
            ))}
          </ul>
        </div>
        <textarea
          rows="6"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
          value={formData[fieldName]}
          onChange={(e) => setFormData({ ...formData, [fieldName]: e.target.value })}
          placeholder={`${section.title}の内容を入力してください`}
        />
      </div>
    );
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

          {/* セクション2-10の入力フィールド */}
          {renderSectionField('section_2', 'section_2_target_customers')}
          {renderSectionField('section_3', 'section_3_customer_problems')}
          {renderSectionField('section_4', 'section_4_solution_hypothesis')}
          {renderSectionField('section_5', 'section_5_differentiation')}
          {renderSectionField('section_6', 'section_6_market_potential')}
          {renderSectionField('section_7', 'section_7_revenue_model')}
          {renderSectionField('section_8_1', 'section_8_1_ideation_plan')}
          {renderSectionField('section_8_2', 'section_8_2_mvp_plan')}
          {renderSectionField('section_9', 'section_9_execution_plan')}
          {renderSectionField('section_10', 'section_10_strategic_alignment')}

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
