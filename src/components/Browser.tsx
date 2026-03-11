import { useEffect, useState, useRef, useCallback } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { Button } from './ui/Button';
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
  
  const webviewRef = useRef<Webview | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  const unlistenersRef = useRef<(() => void)[]>([]);

  const [history, setHistory] = useState<string[]>(['about:blank']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const handleUrlChange = useCallback((newUrl: string) => {
    setCurrentUrl(newUrl);
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
    logger.debug('Browser reload requested', { tabId, paneId, url: currentUrl });
    setTimeout(() => setIsLoading(false), 500);
  }, [tabId, paneId, currentUrl]);

  const normalizeUrl = useCallback((url: string): string => {
    if (!url) return 'about:blank';
    if (url === 'about:blank') return url;
    if (!/^https?:\/\//i.test(url)) {
      return `https://${url}`;
    }
    return url;
  }, []);

  const handleNavigate = useCallback((url: string) => {
    const normalizedUrl = normalizeUrl(url);
    if (normalizedUrl && normalizedUrl !== currentUrl) {
      setHistory([...history, normalizedUrl]);
      setHistoryIndex(history.length);
      setCurrentUrl(normalizedUrl);
      setCanGoBack(true);
      setCanGoForward(false);
      logger.debug('Browser navigation', { tabId, paneId, url: normalizedUrl });
    }
  }, [tabId, paneId, currentUrl, history, normalizeUrl]);

  const handleOpenDevTools = useCallback(() => {
    logger.debug('DevTools requested', { tabId });
    // DevTools not implemented yet - Tauri Webview API open_devtools not available
  }, [tabId]);

  useEffect(() => {
    logger.debug('Browser component mounted', { tabId, paneId, url });
    
    let mounted = true;

    async function createWebview(webviewUrl: string) {
      try {
        const appWindow = getCurrentWindow();
        const webviewLabel = `browser-${tabId}`;
        
        const webview = new Webview(appWindow, webviewLabel, {
          url: webviewUrl,
          x: 0,
          y: 0,
          width: containerRef.current?.clientWidth || 800,
          height: containerRef.current?.clientHeight || 600,
        });

        if (!mounted) {
          webview.close();
          return null;
        }

        webviewRef.current = webview;

        webview.once('tauri://created', () => {
          logger.debug('Webview created successfully', { tabId, webviewLabel });
        });

        webview.once('tauri://error', (e) => {
          logger.error('Webview creation error', { tabId, error: e });
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
            setIsLoading(false);
          }
        });
        unlistenersRef.current.push(unlistenError);
        
        const unlistenLoadStart = await webview.listen('tauri://load-start', () => {
          if (mounted) {
            setIsLoading(true);
          }
        });
        unlistenersRef.current.push(unlistenLoadStart);

        const unlistenLoadEnd = await webview.listen('tauri://load-end', () => {
          if (mounted) {
            setIsLoading(false);
          }
        });
        unlistenersRef.current.push(unlistenLoadEnd);

        return webview;
      } catch (error) {
        logger.error('Failed to create webview', { tabId, error });
        return null;
      }
    }

    createWebview(url);

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
    };
  }, [tabId, paneId, url]);

  useEffect(() => {
    if (!webviewRef.current || !currentUrl || currentUrl === url) {
      return;
    }
    
    let cancelled = false;

    async function navigate() {
      const existingWebview = webviewRef.current;
      if (!existingWebview) return;

      try {
        unlistenersRef.current.forEach(unlisten => {
          try {
            unlisten();
          } catch {}
        });
        unlistenersRef.current = [];

        existingWebview.close();
        if (cancelled) return;
        webviewRef.current = null;

        const appWindow = getCurrentWindow();
        const webviewLabel = `browser-${tabId}`;

        const newWebview = new Webview(appWindow, webviewLabel, {
          url: currentUrl,
          x: 0,
          y: 0,
          width: containerRef.current?.clientWidth || 800,
          height: containerRef.current?.clientHeight || 600,
        });

        if (cancelled) {
          newWebview.close();
          return;
        }

        webviewRef.current = newWebview;

        newWebview.once('tauri://created', () => {
          logger.debug('Webview recreated for navigation', { tabId, url: currentUrl });
        });

        const unlistenLoadStart = await newWebview.listen('tauri://load-start', () => {
          setIsLoading(true);
        });
        unlistenersRef.current.push(unlistenLoadStart);

        const unlistenLoadEnd = await newWebview.listen('tauri://load-end', () => {
          setIsLoading(false);
        });
        unlistenersRef.current.push(unlistenLoadEnd);
      } catch (error) {
        logger.error('Failed to recreate webview for navigation', { tabId, error });
      }
    }

    navigate();
    return () => {
      cancelled = true;
    };
  }, [currentUrl, tabId, url]);

  return (
    <ErrorBoundary>
        <div ref={containerRef} className="browser-container">
        <div className="browser-nav-bar">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleBack()}
            disabled={!canGoBack}
            title="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleForward()}
            disabled={!canGoForward}
            title="Forward"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReload}
            disabled={isLoading}
            title={isLoading ? "Stop" : "Refresh"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 11-2.636-6.364" />
              <path d="M21 3v6h-6" />
            </svg>
          </Button>
          
          <input
            className="browser-url-input"
            type="text"
            value={currentUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleNavigate(currentUrl); } }}
            placeholder={isLoading ? 'Loading...' : 'Enter URL'}
          />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenDevTools}
            title="Open DevTools"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </Button>
        </div>
        
        <div ref={webviewContainerRef}>
          {webviewRef.current && <div className="webview-wrapper">Task 5: Webview created</div>}
        </div>
      </div>
      </ErrorBoundary>
  );
}

export default Browser;
