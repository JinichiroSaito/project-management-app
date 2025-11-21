import React, { useState, useEffect } from 'react';
import api from '../api';
import { useLanguage } from '../LanguageContext';
import { useAuth } from '../AuthContext';

const ProjectBudgetManagement = ({ project }) => {
  const { userInfo } = useAuth();
  const isExecutor = userInfo?.position === 'executor' && project?.executor_id === userInfo?.id;
  const isReviewer = userInfo?.position === 'reviewer';
  const [annualBudget, setAnnualBudget] = useState({ opex: 0, capex: 0 });
  const [budgetEntries, setBudgetEntries] = useState([]);
  const [cumulative, setCumulative] = useState({ opex_budget: 0, opex_used: 0, capex_budget: 0, capex_used: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [formData, setFormData] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    opex_budget: '',
    opex_used: '',
    capex_budget: '',
    capex_used: ''
  });
  const { t } = useLanguage();

  useEffect(() => {
    if (project?.id && project?.application_status === 'approved') {
      fetchAnnualBudget();
      fetchBudgetEntries();
    }
  }, [project?.id, selectedYear]);

  const fetchAnnualBudget = async () => {
    if (!project?.id) return;
    try {
      const response = await api.get(`/api/projects/${project.id}/annual-budget`);
      setAnnualBudget({
        opex: response.data.annual_opex_budget || 0,
        capex: response.data.annual_capex_budget || 0
      });
    } catch (error) {
      console.error('Error fetching annual budget:', error);
    }
  };

  const fetchBudgetEntries = async () => {
    if (!project?.id) return;
    try {
      setLoading(true);
      const response = await api.get(`/api/projects/${project.id}/budget-entries`, {
        params: { year: selectedYear }
      });
      setBudgetEntries(response.data.entries || []);
      setCumulative(response.data.cumulative || {});
      setError('');
    } catch (error) {
      console.error('Error fetching budget entries:', error);
      setError(error.response?.data?.error || t('budget.error.fetch', 'Failed to fetch budget entries'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAnnualBudget = async () => {
    if (!project?.id) return;
    
    // 申請金額に対するバリデーション
    const requestedAmount = parseFloat(project.requested_amount) || 0;
    const opexBudget = parseFloat(annualBudget.opex) || 0;
    const capexBudget = parseFloat(annualBudget.capex) || 0;
    const totalBudget = opexBudget + capexBudget;
    
    if (requestedAmount > 0 && totalBudget > requestedAmount) {
      alert(t('budget.error.exceedsRequestedAmount', 'The sum of OPEX and CAPEX budgets exceeds the requested amount. Please adjust the budgets.'));
      return;
    }
    
    try {
      await api.put(`/api/projects/${project.id}/annual-budget`, {
        annual_opex_budget: annualBudget.opex,
        annual_capex_budget: annualBudget.capex
      });
      alert(t('budget.annualBudgetSaved', 'Annual budget saved successfully'));
      fetchAnnualBudget();
    } catch (error) {
      console.error('Error saving annual budget:', error);
      alert(error.response?.data?.error || t('budget.error.saveAnnual', 'Failed to save annual budget'));
    }
  };

  const handleSubmitEntry = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      if (editingEntry) {
        await api.post(`/api/projects/${project.id}/budget-entries`, {
          ...formData,
          opex_budget: parseFloat(formData.opex_budget) || 0,
          opex_used: parseFloat(formData.opex_used) || 0,
          capex_budget: parseFloat(formData.capex_budget) || 0,
          capex_used: parseFloat(formData.capex_used) || 0
        });
      } else {
        await api.post(`/api/projects/${project.id}/budget-entries`, {
          ...formData,
          opex_budget: parseFloat(formData.opex_budget) || 0,
          opex_used: parseFloat(formData.opex_used) || 0,
          capex_budget: parseFloat(formData.capex_budget) || 0,
          capex_used: parseFloat(formData.capex_used) || 0
        });
      }
      
      setShowForm(false);
      setEditingEntry(null);
      setFormData({
        year: selectedYear,
        month: new Date().getMonth() + 1,
        opex_budget: '',
        opex_used: '',
        capex_budget: '',
        capex_used: ''
      });
      fetchBudgetEntries();
    } catch (error) {
      console.error('Error saving budget entry:', error);
      setError(error.response?.data?.error || t('budget.error.save', 'Failed to save budget entry'));
    }
  };

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setFormData({
      year: entry.year,
      month: entry.month,
      opex_budget: entry.opex_budget || '',
      opex_used: entry.opex_used || '',
      capex_budget: entry.capex_budget || '',
      capex_used: entry.capex_used || ''
    });
    setShowForm(true);
  };

  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm(t('budget.deleteConfirm', 'Are you sure you want to delete this budget entry?'))) {
      return;
    }
    try {
      await api.delete(`/api/projects/${project.id}/budget-entries/${entryId}`);
      fetchBudgetEntries();
    } catch (error) {
      console.error('Error deleting budget entry:', error);
      alert(error.response?.data?.error || t('budget.error.delete', 'Failed to delete budget entry'));
    }
  };

  const formatAmount = (amount) => {
    if (!amount) return '¥0';
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
  };

  const getMonthName = (month) => {
    const months = [
      t('budget.month.1', 'January'), t('budget.month.2', 'February'), t('budget.month.3', 'March'),
      t('budget.month.4', 'April'), t('budget.month.5', 'May'), t('budget.month.6', 'June'),
      t('budget.month.7', 'July'), t('budget.month.8', 'August'), t('budget.month.9', 'September'),
      t('budget.month.10', 'October'), t('budget.month.11', 'November'), t('budget.month.12', 'December')
    ];
    return months[month - 1] || month;
  };

  if (!project || project.application_status !== 'approved') {
    return null;
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-gray-600">{t('projects.loading', 'Loading...')}</div>
      </div>
    );
  }

  // 12ヶ月分のエントリを準備（存在しない月は空データ）
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const entriesByMonth = {};
  budgetEntries.forEach(entry => {
    if (entry.year === selectedYear) {
      entriesByMonth[entry.month] = entry;
    }
  });

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        {t('budget.title', 'Budget Management')}
      </h3>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* 年間予算設定 */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-medium text-blue-900 mb-3">
          {t('budget.annualBudget', 'Annual Budget')}
        </h4>
        {project?.requested_amount && (
          <div className="mb-3 p-2 bg-white rounded border border-blue-300">
            <p className="text-xs text-gray-600 mb-1">
              {t('budget.requestedAmount', 'Requested Amount')}
            </p>
            <p className="text-sm font-medium text-gray-900">
              {formatAmount(parseFloat(project.requested_amount) || 0)}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('budget.opexBudget', 'Opex Budget (Annual)')}
            </label>
            <input
              type="number"
              value={annualBudget.opex || ''}
              onChange={(e) => setAnnualBudget({ ...annualBudget, opex: e.target.value })}
              disabled={!isExecutor}
              className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                !isExecutor ? 'bg-gray-100 cursor-not-allowed' : ''
              }`}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('budget.capexBudget', 'Capex Budget (Annual)')}
            </label>
            <input
              type="number"
              value={annualBudget.capex || ''}
              onChange={(e) => setAnnualBudget({ ...annualBudget, capex: e.target.value })}
              disabled={!isExecutor}
              className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                !isExecutor ? 'bg-gray-100 cursor-not-allowed' : ''
              }`}
              placeholder="0"
            />
          </div>
        </div>
        {project?.requested_amount && (
          <div className="mt-3 p-2 bg-white rounded border border-gray-300">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">
                {t('budget.totalBudget', 'Total Budget (OPEX + CAPEX)')}
              </span>
              <span className={`text-sm font-medium ${
                (parseFloat(annualBudget.opex) || 0) + (parseFloat(annualBudget.capex) || 0) > (parseFloat(project.requested_amount) || 0)
                  ? 'text-red-600' : 'text-gray-900'
              }`}>
                {formatAmount((parseFloat(annualBudget.opex) || 0) + (parseFloat(annualBudget.capex) || 0))}
              </span>
            </div>
            {(parseFloat(annualBudget.opex) || 0) + (parseFloat(annualBudget.capex) || 0) > (parseFloat(project.requested_amount) || 0) && (
              <p className="text-xs text-red-600 mt-1">
                {t('budget.error.exceedsRequestedAmount', 'The sum of OPEX and CAPEX budgets exceeds the requested amount. Please adjust the budgets.')}
              </p>
            )}
          </div>
        )}
        {isExecutor && (
          <button
            onClick={handleSaveAnnualBudget}
            className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            {t('budget.saveAnnualBudget', 'Save Annual Budget')}
          </button>
        )}
      </div>

      {/* 累計表示 */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h4 className="text-sm font-medium text-gray-900 mb-3">
          {t('budget.cumulativeToDate', 'Cumulative Amount (Up to Current Month)')}
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-600 mb-1">{t('budget.opex', 'Opex')}</p>
            <p className="text-sm font-medium text-gray-900">
              {t('budget.budget', 'Budget')}: {formatAmount(cumulative.opex_budget)}
            </p>
            <p className="text-sm font-medium text-gray-900">
              {t('budget.used', 'Used')}: {formatAmount(cumulative.opex_used)}
            </p>
            <p className={`text-sm font-medium ${
              cumulative.opex_used > cumulative.opex_budget ? 'text-red-600' : 'text-green-600'
            }`}>
              {t('budget.remaining', 'Remaining')}: {formatAmount(cumulative.opex_budget - cumulative.opex_used)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">{t('budget.capex', 'Capex')}</p>
            <p className="text-sm font-medium text-gray-900">
              {t('budget.budget', 'Budget')}: {formatAmount(cumulative.capex_budget)}
            </p>
            <p className="text-sm font-medium text-gray-900">
              {t('budget.used', 'Used')}: {formatAmount(cumulative.capex_used)}
            </p>
            <p className={`text-sm font-medium ${
              cumulative.capex_used > cumulative.capex_budget ? 'text-red-600' : 'text-green-600'
            }`}>
              {t('budget.remaining', 'Remaining')}: {formatAmount(cumulative.capex_budget - cumulative.capex_used)}
            </p>
          </div>
        </div>
      </div>

      {/* 年度選択 */}
      <div className="mb-4 flex items-center space-x-4">
        <label className="text-sm font-medium text-gray-700">
          {t('budget.selectYear', 'Select Year')}:
        </label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        {!showForm && isExecutor && (
          <button
            onClick={() => {
              setFormData({
                year: selectedYear,
                month: new Date().getMonth() + 1,
                opex_budget: '',
                opex_used: '',
                capex_budget: '',
                capex_used: ''
              });
              setEditingEntry(null);
              setShowForm(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            {t('budget.addEntry', 'Add Entry')}
          </button>
        )}
      </div>

      {/* 入力フォーム */}
      {showForm && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            {editingEntry ? t('budget.editEntry', 'Edit Budget Entry') : t('budget.addEntry', 'Add Budget Entry')}
          </h4>
          <form onSubmit={handleSubmitEntry} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('budget.month', 'Month')} *
                </label>
                <select
                  required
                  value={formData.month}
                  onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {months.map(month => (
                    <option key={month} value={month}>
                      {getMonthName(month)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('budget.opexBudget', 'Opex Budget')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.opex_budget}
                  onChange={(e) => setFormData({ ...formData, opex_budget: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('budget.opexUsed', 'Opex Used')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.opex_used}
                  onChange={(e) => setFormData({ ...formData, opex_used: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('budget.capexBudget', 'Capex Budget')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.capex_budget}
                  onChange={(e) => setFormData({ ...formData, capex_budget: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('budget.capexUsed', 'Capex Used')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.capex_used}
                  onChange={(e) => setFormData({ ...formData, capex_used: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex space-x-4">
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {t('budget.save', 'Save')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingEntry(null);
                  setFormData({
                    year: selectedYear,
                    month: new Date().getMonth() + 1,
                    opex_budget: '',
                    opex_used: '',
                    capex_budget: '',
                    capex_used: ''
                  });
                }}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md text-sm font-medium"
              >
                {t('budget.cancel', 'Cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 月別エントリ一覧 */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('budget.month', 'Month')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('budget.opexBudget', 'Opex Budget')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('budget.opexUsed', 'Opex Used')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('budget.capexBudget', 'Capex Budget')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('budget.capexUsed', 'Capex Used')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('budget.actions', 'Actions')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {months.map(month => {
              const entry = entriesByMonth[month];
              return (
                <tr key={month} className={entry ? '' : 'bg-gray-50'}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {getMonthName(month)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {formatAmount(entry?.opex_budget || 0)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {formatAmount(entry?.opex_used || 0)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {formatAmount(entry?.capex_budget || 0)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {formatAmount(entry?.capex_used || 0)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                    {entry ? (
                      isExecutor ? (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditEntry(entry)}
                            className="text-indigo-600 hover:text-indigo-700"
                          >
                            {t('budget.edit', 'Edit')}
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            {t('budget.delete', 'Delete')}
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400">{t('budget.viewOnly', 'View Only')}</span>
                      )
                    ) : (
                      isExecutor && (
                        <button
                          onClick={() => {
                            setFormData({
                              year: selectedYear,
                              month: month,
                              opex_budget: '',
                              opex_used: '',
                              capex_budget: '',
                              capex_used: ''
                            });
                            setEditingEntry(null);
                            setShowForm(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-700"
                        >
                          {t('budget.add', 'Add')}
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectBudgetManagement;

