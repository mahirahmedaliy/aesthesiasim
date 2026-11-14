import React, { useState } from 'react';
import { NarratorMessage } from '../../types/simulator';
import { MessageSquare, ChevronDown, ChevronUp, AlertCircle, ShieldAlert, CheckCircle2, Info } from 'lucide-react';

interface NarratorBarProps {
  messages: NarratorMessage[];
}

export const NarratorBar: React.FC<NarratorBarProps> = ({ messages }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const latestMessage = messages[0];

  if (!latestMessage) return null;

  const getTypeStyles = (type: NarratorMessage['type']) => {
    switch (type) {
      case 'critical':
        return 'bg-red-950/90 border-red-500 text-red-200';
      case 'warning':
        return 'bg-amber-950/90 border-amber-500 text-amber-200';
      case 'success':
        return 'bg-emerald-950/90 border-emerald-500 text-emerald-200';
      case 'info':
      default:
        return 'bg-sky-950/90 border-sky-600 text-sky-200';
    }
  };

  const getSpeakerBadge = (speaker: NarratorMessage['speaker']) => {
    switch (speaker) {
      case 'Attending':
        return 'bg-sky-900 text-sky-200 border-sky-700';
      case 'Surgeon':
        return 'bg-amber-900 text-amber-200 border-amber-700';
      case 'Nurse':
        return 'bg-purple-900 text-purple-200 border-purple-700';
      case 'Monitor':
      case 'Workstation':
        return 'bg-red-900 text-red-200 border-red-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="bg-slate-950 border-b border-slate-800 shrink-0 z-20 font-sans shadow-lg">
      {/* Primary Latest Ticker */}
      <div className={`px-3 py-1.5 border-l-4 flex items-center justify-between transition-all ${getTypeStyles(latestMessage.type)}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] lg:text-[11px] font-mono text-slate-400 font-bold shrink-0">
            {latestMessage.timeFormatted}
          </span>

          <span className={`px-1.5 py-0.2 rounded text-[9px] lg:text-[10px] font-mono font-bold uppercase border shrink-0 ${getSpeakerBadge(latestMessage.speaker)}`}>
            [{latestMessage.speaker}]
          </span>

          <span className="text-xs font-medium truncate flex-1 font-sans">
            {latestMessage.text}
          </span>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="ml-2 px-2 py-0.5 rounded bg-black/40 hover:bg-black/60 text-slate-200 text-[10px] font-mono flex items-center gap-1 shrink-0 border border-white/10 transition-colors"
        >
          <MessageSquare className="w-3 h-3 text-sky-400" />
          <span>Feed ({messages.length})</span>
          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Expanded History Drawer */}
      {isExpanded && (
        <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/80 bg-slate-950 p-2.5 space-y-1.5 text-xs font-mono">
          <div className="flex items-center justify-between pb-1 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase">
            <span>Clinical Event Feed &amp; Narrator Log</span>
            <button onClick={() => setIsExpanded(false)} className="text-slate-400 hover:text-white">Close</button>
          </div>

          {messages.map((m) => (
            <div key={m.id} className="pt-1.5 flex items-start gap-2 text-slate-300">
              <span className="text-[10px] text-slate-500 shrink-0">{m.timeFormatted}</span>
              <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold border shrink-0 ${getSpeakerBadge(m.speaker)}`}>
                {m.speaker}
              </span>
              <span className="flex-1 font-sans">{m.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
