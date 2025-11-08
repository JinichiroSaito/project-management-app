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

  const t = (key) => {
    return translations[language]?.[key] || key;
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

