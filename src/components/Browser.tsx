import { useEffect, useState, useRef } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import logger from '../lib/logger';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Webview } from '@tauri-apps/api/webview';
import './Browser.css';

export interface BrowserProps {
  tabId: string;
  url: string;
  paneId: string;
}

export function Browser({ tabId, url, paneId }: BrowserProps) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  const webviewRef = useRef<Webview | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const unlistenersRef = useRef<(() => void)[]>([]);

  const [history, setHistory] = useState<string[]>(['about:blank']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const handleUrlChange = useCallback((newUrl: string) => {
    setCurrentUrl(newUrl);
    setHasError(false);
    logger.debug('Browser URL changed', { tabId, paneId, url: newUrl });
  }, [tabId, paneId]);

  const handleBack = useCallback(() => {
    if (historyIndex > 0) {
      const newUrl = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setCurrentUrl(newUrl);
      logger.debug('Browser back navigation', { tabId, paneId, url: newUrl });
    }
    setCanGoBack(historyIndex > 1);
  }, [historyIndex, history]);

  const handleForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newUrl = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setCurrentUrl(newUrl);
      logger.debug('Browser forward navigation', { tabId, paneId, url: newUrl });
    }
    setCanGoForward(historyIndex < history.length - 1);
  }, [historyIndex, history]);

  const handleReload = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    logger.debug('Browser reload requested', { tabId, paneId, url: currentUrl });
    setTimeout(() => setIsLoading(false), 500);
  }, [tabId, paneId, currentUrl]);

  const handleNavigate = useCallback((url: string) => {
    if (url && url !== currentUrl) {
      setHistory([...history, url]);
      setHistoryIndex(history.length);
      setCurrentUrl(url);
      setCanGoBack(true);
      setCanGoForward(false);
      logger.debug('Browser navigation', { tabId, paneId, url });
    }
  }, [tabId, paneId, currentUrl, history]);

  const handleOpenDevTools = useCallback(() => {
    webviewRef.current?.openDevTools();
    logger.debug('DevTools opened', { tabId });
  }, [tabId]);

  useEffect(() => {

  useEffect(() => {
    logger.debug('Browser component mounted', { tabId, paneId, url });
    
    let mounted = true;

    async function createWebview() {
      try {
        const appWindow = getCurrentWindow();
        const webviewLabel = `browser-${tabId}`;
        
        const webview = new Webview(appWindow, webviewLabel, {
          url: url || 'about:blank',
          x: 0,
          y: 0,
          width: containerRef.current?.clientWidth || 800,
          height: containerRef.current?.clientHeight || 600,
        });

        if (!mounted) {
          webview.close();
          return;
        }

        webviewRef.current = webview;

        webview.once('tauri://created', () => {
          logger.debug('Webview created successfully', { tabId, webviewLabel });
        });

        webview.once('tauri://error', (e) => {
          logger.error('Webview creation error', { tabId, error: e });
          if (mounted) {
            setHasError(true);
          }
        });

        const unlistenUrl = await webview.listen('tauri://url-changed', (event) => {
          const newUrl = (event.payload as { url?: string })?.url;
          if (newUrl && mounted) {
            logger.debug('Webview URL changed', { tabId, url: newUrl });
            setCurrentUrl(newUrl);
          }
        });
        unlistenersRef.current.push(unlistenUrl);

        const unlistenError = await webview.listen('tauri://load-error', (event) => {
          const error = event.payload;
          logger.error('Webview load error', { tabId, error });
          if (mounted) {
            setHasError(true);
            setIsLoading(false);
          }
        });
        unlistenersRef.current.push(unlistenError);

        const unlistenLoadStart = await webview.listen('tauri://load-start', () => {
          if (mounted) {
            setIsLoading(true);
            setHasError(false);
          }
        });
        unlistenersRef.current.push(unlistenLoadStart);

        const unlistenLoadEnd = await webview.listen('tauri://load-end', () => {
          if (mounted) {
            setIsLoading(false);
          }
        });
        unlistenersRef.current.push(unlistenLoadEnd);

      } catch (error) {
        logger.error('Failed to create webview', { tabId, error });
        if (mounted) {
          setHasError(true);
        }
      }
    }

    createWebview();
    return () => {
      mounted = false;
      logger.debug('Browser component unmounting, cleaning up webview', { tabId, paneId });
      
      unlistenersRef.current.forEach(unlisten => {
        try {
          unlisten();
        } catch (error) {
          logger.warn('Error during event listener cleanup', { tabId, error });
        }
      });
      unlistenersRef.current = [];
      
      if (webviewRef.current) {
        try {
          webviewRef.current.close();
          webviewRef.current = null;
        } catch (error) {
          logger.warn('Error closing webview', { tabId, error });
        }
      }
      
      <div ref={containerRef} className="browser-container">
        <div className="browser-nav-bar">
          <button
            className="browser-nav-button"
            onClick={() => handleBack()}
            disabled={!canGoBack}
            title="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-9-5 5 5" />
            </svg>
          </button>
          
          <button
            className="browser-nav-button"
            onClick={() => handleForward()}
            disabled={!canGoForward}
            title="Forward"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5l14 5 5" />
            </svg>
          </button>
          
          <button
            className="browser-nav-button"
            onClick={handleReload}
            disabled={isLoading}
            title={isLoading ? "Stop" : "Refresh"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={isLoading ? "M6 19L12 12" : "M4 4v19 12"} />
            </svg>
          </button>
          
          <input
            className="browser-url-input"
            type="text"
            value={currentUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleNavigate(currentUrl); } }}
            placeholder={isLoading ? 'Loading...' : 'Enter URL'}
          />
          
          <button
            className="browser-nav-button"
            onClick={handleOpenDevTools}
            title="Open DevTools"
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="nonteal" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6a2 2v2 4" />
            </svg>
          </button>
        </div>
        
        <div ref={webviewContainerRef}>
          {/* Task 5: Webview */}
        </div>
      });
      unlistenersRef.current = [];

      if (webviewRef.current) {
        try {
          webviewRef.current.close();
          webviewRef.current = null;
        } catch (error) {
          logger.warn('Error closing webview', { tabId, error });
        }
      }
    };
  }, [tabId, paneId, url]);

  return (
    <ErrorBoundary>
        <div ref={containerRef} className="browser-container">
        <div className="browser-nav-bar">
          <button
            className="browser-nav-button"
            onClick={() => handleBack()}
            disabled={!canGoBack}
            title="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-9-5 5 5" />
            </svg>
          </button>
          
          <button
            className="browser-nav-button"
            onClick={() => handleForward()}
            disabled={!canGoForward}
            title="Forward"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5l14 5 5" />
            </svg>
          </button>
          
          <button
            className="browser-nav-button"
            onClick={handleReload}
            disabled={isLoading}
            title={isLoading ? "Stop" : "Refresh"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={isLoading ? "M6 19L12 12" : "M4 4v19 12"} />
            </svg>
          </button>
          
          <input
            className="browser-url-input"
            type="text"
            value={currentUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleNavigate(currentUrl); } }}
            placeholder={isLoading ? 'Loading...' : 'Enter URL'}
          />
          
          <button
            className="browser-nav-button"
            onClick={handleOpenDevTools}
            title="Open DevTools"
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6a2 2v2 4" />
            </svg>
          </button>
        </div>
        
        <div ref={webviewContainerRef}>
          {/* Task 5: Webview */}
        </div>
      </ErrorBoundary>
  );
}

export default Browser;
