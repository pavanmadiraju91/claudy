import React from 'react';
import './ToolIndicator.css';

interface ToolIndicatorProps {
  tool: string;
}

function ToolIndicator({ tool }: ToolIndicatorProps) {
  return (
    <div className="tool-indicator">
      <span className="tool-dot" />
      <span className="tool-name">{tool}</span>
    </div>
  );
}

export default ToolIndicator;
