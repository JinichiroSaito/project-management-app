import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from './locales/translations';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    // ローカルストレージから言語設定を取得、デフォルトは日本語
    const savedLanguage = localStorage.getItem('language');
    return savedLanguage || 'ja';
  });

  useEffect(() => {
    // 言語設定をローカルストレージに保存
    localStorage.setItem('language', language);
  }, [language]);

  const t = (key, defaultValueOrParams = {}) => {
    // 第2引数が文字列の場合はデフォルト値として扱う
    let defaultText = null;
    let params = {};
    if (typeof defaultValueOrParams === 'string') {
      defaultText = defaultValueOrParams;
    } else if (typeof defaultValueOrParams === 'object' && defaultValueOrParams !== null) {
      params = defaultValueOrParams;
    }
    
    let text = translations[language]?.[key] || defaultText || key;
    // パラメータ置換（例: {title} -> params.title）
    if (params && typeof text === 'string' && Object.keys(params).length > 0) {
      Object.keys(params).forEach(paramKey => {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), params[paramKey]);
      });
    }
    return text;
  };

  const value = {
    language,
    setLanguage,
    t,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

