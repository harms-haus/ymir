import { useState } from 'react';

export function useExpandCollapse() {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleExpand = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const toggleCollapsed = () => setIsCollapsed(prev => !prev);

  return { expandedFiles, isCollapsed, toggleExpand, toggleCollapsed };
}
