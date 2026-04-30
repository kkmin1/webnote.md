import React from 'react';
import './ParticipantList.css';

interface Participant {
  id: string;
  name: string;
  color?: string;
  isAI?: boolean;
  roleLabel?: string;
  isChairman?: boolean;
}

interface ParticipantListProps {
  participants: Participant[];
}

const ParticipantList: React.FC<ParticipantListProps> = ({ participants }) => {
  const getSidebarLabel = (participant: Participant) => {
    if (!participant.isAI) {
      return participant.name;
    }

    const nickname = participant.roleLabel || participant.name;
    return `${nickname} (${participant.name})`;
  };

  return (
    <div className="participant-list">
      {participants.map((participant) => (
        <div key={participant.id} className="participant-item">
          <div 
            className="participant-avatar" 
            style={{ backgroundColor: participant.color || '#999' }}
          >
            {participant.isAI && <span className="ai-badge">AI</span>}
          </div>
          <div className="participant-meta">
            <div className="participant-name-row">
              <span className="participant-name">{getSidebarLabel(participant)}</span>
              {participant.isChairman && <span className="chair-badge">Chair</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ParticipantList;
