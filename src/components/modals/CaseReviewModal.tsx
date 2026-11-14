import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  X,
  Clock,
  Sparkles,
  TrendingUp,
  FileText,
  Activity,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { CaseCompletionRecord } from '../../lib/authService';

interface CaseReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: CaseCompletionRecord | null;
  onReplayCase: (caseId: string) => void;
}

export const CaseReviewModal: React.FC<CaseReviewModalProps> = ({
  isOpen,
  onClose,
  record,
  onReplayCase,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'good' | 'bad'>('all');

  if (!isOpen || !record) return null;

  const mins = Math.floor(record.timestampSec / 60);
  const secs = record.timestampSec % 60;
  const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const correctActions = record.actionLogs.filter((a) => a.scoreEffect === 'correct');
  const mistakes = record.mistakes || [];

  const getGradeColor = (s: number) => {
    if (s >= 90) return 'text-emerald-400 border-emerald-500 bg-emerald-950/60';
    if (s >= 80) return 'text-sky-400 border-sky-500 bg-sky-950/60';
    if (s >= 70) return 'text-amber-400 border-amber-500 bg-amber-950/60';
    return 'text-rose-400 border-rose-500 bg-rose-950/60';
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in duration-200 select-none font-sans"
    >
      <div className="bg-slate-900 border-2 border-slate-700 w-full max-w-4xl h-[90vh] max-h-[780px] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        
        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Performance Review &amp; Debrief Log</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  COMPLETED CASE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {record.patientName} • Completed on {new Date(record.completedAt).toLocaleDateString()} at{' '}
                {new Date(record.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Time: {timeFormatted}</span>
            </span>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer border border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scoreboard Banner */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="grid grid-cols-12 gap-4 items-center">
            
            <div className={`col-span-12 sm:col-span-8 p-4 rounded-xl border flex items-center justify-between ${getGradeColor(record.score)}`}>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-80 block">
                  Achieved Final Clinical Score
                </span>
                <h3 className="text-xl font-black mt-0.5">
                  {record.score >= 80 ? 'Proficient OR Management' : 'Review Required: Unsafe Events Detected'}
                </h3>
                <p className="text-xs font-mono opacity-90 mt-1">
                  {correctActions.length} correct procedures • {mistakes.length} mistakes penalized
                </p>
              </div>

              <div className="text-right pl-4">
                <div className="text-4xl font-mono font-black">{record.score}/100</div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider">Grade: {record.grade}</span>
              </div>
            </div>

            <div className="col-span-12 sm:col-span-4 flex flex-col gap-2">
              <button
                onClick={() => setFilterMode('all')}
                className={`py-1.5 px-3 rounded-lg text-xs font-mono font-bold border transition-all text-left flex items-center justify-between cursor-pointer ${
                  filterMode === 'all' ? 'bg-slate-800 border-sky-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <span>All Actions &amp; Deductions</span>
                <span className="text-[10px]">{correctActions.length + mistakes.length}</span>
              </button>

              <button
                onClick={() => setFilterMode('good')}
                className={`py-1.5 px-3 rounded-lg text-xs font-mono font-bold border transition-all text-left flex items-center justify-between cursor-pointer ${
                  filterMode === 'good' ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span>What You Did Good</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-400">+{correctActions.length}</span>
              </button>

              <button
                onClick={() => setFilterMode('bad')}
                className={`py-1.5 px-3 rounded-lg text-xs font-mono font-bold border transition-all text-left flex items-center justify-between cursor-pointer ${
                  filterMode === 'bad' ? 'bg-rose-950/60 border-rose-500 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <ThumbsDown className="w-3.5 h-3.5 text-rose-400" />
                  <span>What You Did Bad (Mistakes)</span>
                </span>
                <span className="text-[10px] font-bold text-rose-400">-{mistakes.length}</span>
              </button>
            </div>

          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* Section 1: Mistakes & Deductions */}
          {(filterMode === 'all' || filterMode === 'bad') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono font-bold text-rose-300 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Clinical Mistakes &amp; Deductions ({mistakes.length})</span>
                </h4>
                <span className="text-[11px] font-mono text-slate-400">Points Deducted: -{mistakes.reduce((s, m) => s + m.pointsDeducted, 0)} pts</span>
              </div>

              {mistakes.length === 0 ? (
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold block">Flawless Clinical Execution!</span>
                    <span>Zero inappropriate or hazardous clinical decisions detected throughout the case.</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {mistakes.map((m, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-rose-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase ${
                            m.severity === 'critical'
                              ? 'bg-red-950 text-red-300 border border-red-700'
                              : 'bg-amber-950 text-amber-300 border border-amber-700'
                          }`}>
                            {m.severity}
                          </span>
                          <span className="font-bold text-white text-sm">{m.title}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-mono font-bold text-xs border border-rose-800">
                          -{m.pointsDeducted} pts
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{m.description}</p>

                      <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-900/50 text-xs space-y-1">
                        <span className="text-[10px] uppercase font-mono font-bold text-red-300 block">Operating Room Danger:</span>
                        <p className="text-slate-200 text-xs leading-relaxed">{m.realLifeConsequence}</p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-900/50 text-xs space-y-1">
                        <span className="text-[10px] uppercase font-mono font-bold text-emerald-300 block">Standard Care Correction:</span>
                        <p className="text-emerald-100 text-xs leading-relaxed">{m.correction}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 2: Good Actions */}
          {(filterMode === 'all' || filterMode === 'good') && (
            <div className="space-y-3">
              <h4 className="text-xs font-mono font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>What You Did Good (Appropriate Clinical Management)</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {correctActions.map((act, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{act.title}</span>
                        <span className="text-[10px] font-mono text-slate-500">[{act.timeFormatted}]</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{act.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold transition-colors cursor-pointer"
          >
            Close Review
          </button>

          <button
            onClick={() => {
              onClose();
              onReplayCase(record.caseId);
            }}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-mono font-bold shadow-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Replay This Case</span>
          </button>
        </div>

      </div>
    </div>
  );
};
