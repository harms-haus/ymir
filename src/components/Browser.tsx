import { useEffect, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import logger from '../lib/logger';
import './Browser.css';

export interface BrowserProps {
  tabId: string;
  url: string;
  paneId: string;
}

export function Browser({ tabId, url, paneId }: BrowserProps) {
  const [currentUrl] = useState(url);
  const [isLoading] = useState(false);
  const [hasError] = useState(false);

  useEffect(() => {
    logger.debug('Browser component mounted', { tabId, paneId, url });
    return () => {
      logger.debug('Browser component unmounted', { tabId, paneId });
    };
  }, [tabId, paneId, url]);

  return (
    <ErrorBoundary>
      <div className="browser-container">
        {/* Task 5: Webview integration will be added here */}
      </div>
    </ErrorBoundary>
  );
}

export default Browser;
