import React from 'react';
import './ModeSelector.css';

interface ModeSelectorProps {
  currentMode: string | null;
  onModeChange: (mode: string) => void;
}

function ModeSelector({ currentMode, onModeChange }: ModeSelectorProps) {
  const isInPlanMode = currentMode === 'plan';

  const handleActivate = () => {
    // Only activate if not already in plan mode
    if (!isInPlanMode) {
      onModeChange('plan');
    }
  };

  return (
    <button
      className={`plan-mode-btn ${isInPlanMode ? 'active' : ''}`}
      onClick={handleActivate}
      disabled={isInPlanMode}
      title={isInPlanMode ? 'Plan mode is active' : 'Enter plan mode'}
    >
      <span className="plan-icon">📋</span>
      <span className="plan-label">{isInPlanMode ? 'Planning...' : 'Plan Mode'}</span>
    </button>
  );
}

export default ModeSelector;
