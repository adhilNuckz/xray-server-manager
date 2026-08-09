import { createContext, useContext, useEffect, useState } from 'react';

const PageTitleContext = createContext(null);

export function PageTitleProvider({ children }) {
  const [title, setTitle] = useState('Dashboard');
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}

export function usePageTitle(title) {
  const ctx = useContext(PageTitleContext);
  useEffect(() => {
    if (ctx && title) ctx.setTitle(title);
  }, [title]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useTitleContext() {
  return useContext(PageTitleContext);
}
