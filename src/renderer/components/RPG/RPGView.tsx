import React from 'react';
import GodotGameView from '../GodotGame/GodotGameView';
import ChatPanel from '../ChatPanel/ChatPanel';
import './RPGView.css';

interface RPGViewProps {
  isVisible: boolean;
}

function RPGView({ isVisible }: RPGViewProps) {
  return (
    <div className="rpg-view">
      {/* Game area - left side */}
      <div className="rpg-game-area">
        <GodotGameView isVisible={isVisible} />
      </div>

      {/* Chat panel - right side */}
      <div className="rpg-chat-area">
        <ChatPanel isVisible={isVisible} />
      </div>
    </div>
  );
}

export default RPGView;
