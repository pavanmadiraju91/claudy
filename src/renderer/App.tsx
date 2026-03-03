import React, { useState, useEffect, useCallback } from 'react';
import TerminalView from './components/Terminal/TerminalView';
import RPGView from './components/RPG/RPGView';
import SplashScreen from './components/SplashScreen/SplashScreen';
import FolderSelector from './components/FolderSelector';
import './styles/app.css';

type TabType = 'terminal' | 'rpg';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('rpg');
  const [isConnected, setIsConnected] = useState(false);
  const [showFolderSelector, setShowFolderSelector] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [folderSelectorFading, setFolderSelectorFading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [splashFading, setSplashFading] = useState(false);

  // Handle folder selection
  const handleFolderSelected = useCallback((path: string) => {
    console.log('[App] Folder selected:', path);
    setSelectedFolder(path);
    // Start fade out animation for folder selector
    setFolderSelectorFading(true);
    setTimeout(() => {
      setShowFolderSelector(false);
      setFolderSelectorFading(false);
      setIsLoading(true); // Now show splash screen
    }, 400);
  }, []);

  // Start Claude session after folder is selected and splash is shown
  useEffect(() => {
    if (!selectedFolder || !isLoading) return;

    let fallbackTimeout: NodeJS.Timeout | null = null;
    let unsubReady: (() => void) | null = null;

    const hideSplash = () => {
      setSplashFading(true);
      setTimeout(() => setIsLoading(false), 400);
    };

    const initSession = async () => {
      try {
        console.log('[App] Starting Claude session in:', selectedFolder);

        // Listen for Claude ready signal
        unsubReady = window.electronAPI.onClaudeReady(() => {
          console.log('[App] Claude ready signal received');
          if (fallbackTimeout) clearTimeout(fallbackTimeout);
          hideSplash();
        });

        const result = await window.electronAPI.ptyStart(selectedFolder);
        if (result.success) {
          setIsConnected(true);
          console.log('[App] Claude session started');
          // Fallback timeout (10s) in case ready signal never fires
          fallbackTimeout = setTimeout(() => {
            console.log('[App] Fallback timeout - hiding splash');
            hideSplash();
          }, 10000);
        } else {
          console.error('[App] Failed to start Claude session:', result.error);
          // Hide splash on error after short delay
          setTimeout(hideSplash, 2000);
        }
      } catch (error) {
        console.error('[App] Error starting Claude session:', error);
        setTimeout(hideSplash, 2000);
      }
    };

    initSession();

    return () => {
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (unsubReady) unsubReady();
    };
  }, [selectedFolder, isLoading]);

  // Handle keyboard shortcut to switch tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + 1 for Terminal, Cmd/Ctrl + 2 for RPG
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setActiveTab('terminal');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setActiveTab('rpg');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app">
      {/* Folder selector screen */}
      {showFolderSelector && (
        <div className={folderSelectorFading ? 'folder-selector-wrapper fade-out' : 'folder-selector-wrapper'}>
          <FolderSelector onFolderSelected={handleFolderSelected} />
        </div>
      )}

      {/* Splash screen */}
      {isLoading && (
        <div className={splashFading ? 'splash-wrapper fade-out' : 'splash-wrapper'}>
          <SplashScreen />
        </div>
      )}

      {/* Traffic lights area (macOS) with centered title */}
      <div className="traffic-lights-area">
        <span className="app-title">Claudy</span>
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        <button
          className={`tab-button ${activeTab === 'terminal' ? 'active' : ''}`}
          onClick={() => setActiveTab('terminal')}
        >
          Terminal
        </button>
        <button
          className={`tab-button ${activeTab === 'rpg' ? 'active' : ''}`}
          onClick={() => setActiveTab('rpg')}
        >
          RPG
        </button>

        {/* Project indicator - right side */}
        {selectedFolder && (
          <div className="project-indicator">
            <span className="project-icon">📁</span>
            <span className="project-name">{selectedFolder.split('/').pop()}</span>
          </div>
        )}
      </div>

      {/* Main content - only render after splash is done */}
      <div className="main-content">
        {/* Terminal View - always mounted for PTY connection */}
        <div className={`view-container ${activeTab === 'terminal' ? 'visible' : 'hidden'}`}>
          <TerminalView isVisible={activeTab === 'terminal'} />
        </div>

        {/* RPG View - always mounted for message subscription, hidden during splash/folder selection */}
        <div className={`view-container ${activeTab === 'rpg' && !isLoading && !showFolderSelector ? 'visible' : 'hidden'}`}>
          <RPGView isVisible={activeTab === 'rpg' && !isLoading && !showFolderSelector} />
        </div>
      </div>
    </div>
  );
}

export default App;
