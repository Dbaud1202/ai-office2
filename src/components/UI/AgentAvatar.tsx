import React from 'react';
import type { Agent } from '../../types/index.js';

interface Props {
  agent?: Pick<Agent, 'name' | 'emoji' | 'avatarUrl' | 'color'>;
  className?: string;
  fallback?: string;
}

export default function AgentAvatar({ agent, className = 'agent-avatar', fallback = 'AI' }: Props) {
  if (agent?.avatarUrl) {
    return (
      <img
        src={agent.avatarUrl}
        alt={`${agent.name} 프로필`}
        className={`${className} object-cover`}
      />
    );
  }

  return (
    <div className={`${className} ${agent?.color ?? 'bg-gray-600'} text-white`}>
      {agent?.emoji ?? fallback}
    </div>
  );
}
