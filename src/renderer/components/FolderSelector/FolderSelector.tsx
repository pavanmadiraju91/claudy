import React, { useState } from 'react';
import './FolderSelector.css';

interface FolderSelectorProps {
  onFolderSelected: (path: string) => void;
}

function FolderSelector({ onFolderSelected }: FolderSelectorProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const handleBrowse = async () => {
    setIsSelecting(true);
    try {
      const path = await window.electronAPI.showFolderDialog();
      if (path) {
        setSelectedPath(path);
      }
    } finally {
      setIsSelecting(false);
    }
  };

  const handleStart = () => {
    if (selectedPath) {
      onFolderSelected(selectedPath);
    }
  };

  // Get display path (truncate if too long)
  const getDisplayPath = (path: string) => {
    const maxLength = 40;
    if (path.length <= maxLength) return path;
    return '...' + path.slice(-maxLength + 3);
  };

  return (
    <div className="folder-selector">
      {/* Decorative border frame */}
      <div className="folder-selector-frame" />

      {/* Main content */}
      <div className="folder-selector-content">
        {/* Logo/Title */}
        <div className="folder-selector-header">
          <div className="folder-selector-glow" />
          <h1 className="folder-selector-title">
            <span className="title-bracket">[</span>
            <span className="title-text">CLAUDY</span>
            <span className="title-bracket">]</span>
          </h1>
          <div className="folder-selector-subtitle">CLAUDE CLI INTERFACE</div>
        </div>

        {/* Welcome panel */}
        <div className="folder-selector-panel">
          <div className="panel-header">
            <span className="panel-icon">*</span>
            <span className="panel-title">Welcome, adventurer!</span>
          </div>
          <div className="panel-body">
            <p className="panel-text">
              Select a folder where Claude will work.
              This is where your project files live.
            </p>

            {/* Path display */}
            <div className="path-display">
              <span className="path-label">Selected:</span>
              <span className="path-value">
                {selectedPath ? getDisplayPath(selectedPath) : 'No folder selected'}
              </span>
            </div>

            {/* Action buttons */}
            <div className="folder-selector-actions">
              <button
                className="folder-button browse-button"
                onClick={handleBrowse}
                disabled={isSelecting}
              >
                <span className="button-icon">+</span>
                <span className="button-text">
                  {isSelecting ? 'Selecting...' : 'Browse...'}
                </span>
              </button>

              <button
                className="folder-button start-button"
                onClick={handleStart}
                disabled={!selectedPath}
              >
                <span className="button-icon">&gt;</span>
                <span className="button-text">Start</span>
              </button>
            </div>
          </div>
        </div>

        {/* Hint text */}
        <div className="folder-selector-hint">
          Press Browse to open the folder picker
        </div>
      </div>

      {/* Corner decorations */}
      <div className="folder-corner folder-corner-tl" />
      <div className="folder-corner folder-corner-tr" />
      <div className="folder-corner folder-corner-bl" />
      <div className="folder-corner folder-corner-br" />

      {/* Floating particles */}
      <div className="folder-particles">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="folder-particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default FolderSelector;
