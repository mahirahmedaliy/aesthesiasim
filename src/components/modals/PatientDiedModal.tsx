import React from 'react';
import { Skull, RefreshCw, ArrowLeft, AlertOctagon, CheckCircle2, History, Clock } from 'lucide-react';
import { ActionLogEntry, PatientProfile } from '../../types/simulator';

interface PatientDiedModalProps {
  isOpen: boolean;
  deathCause: string;
  correctManagement?: string;
  actionLogs: ActionLogEntry[];
  elapsedSeconds: number;
  patient: PatientProfile;
  onRestartCase: () => void;
  onReturnToLobby: () => void;
}

export const PatientDiedModal: React.FC<PatientDiedModalProps> = ({
  isOpen,
  deathCause,
  correctManagement,
  actionLogs,
  elapsedSeconds,
  patient,
  onRestartCase,
  onReturnToLobby,
}) => {
  if (!isOpen) return null;

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-lg p-3 sm:p-4 animate-in fade-in duration-300">
      <div className="bg-slate-950 border-2 border-red-700/90 w-full max-w-3xl rounded-2xl shadow-[0_0_100px_rgba(239,68,68,0.5)] flex flex-col max-h-[92vh] overflow-hidden text-white font-mono">
        
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-red-950 via-red-900 to-black px-6 py-4 flex items-center justify-between border-b border-red-700/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)]">
              <Skull className="w-8 h-8 text-red-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded bg-red-950 text-red-300 font-bold border border-red-700 uppercase">
                  SIMULATION TERMINATED
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatTimer(elapsedSeconds)}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-wider uppercase text-red-400 mt-0.5">
                PATIENT EXPIRED (BIOLOGICAL DEATH)
              </h2>
            </div>
          </div>

          <div className="hidden sm:block text-right text-xs text-slate-400">
            <div>{patient.name} ({patient.age}y, {patient.weightKg}kg)</div>
            <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{patient.procedure}</div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs font-mono">
          
          {/* Cause of Death Card */}
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-600/70 space-y-2">
            <div className="flex items-center gap-2 text-red-300 font-bold text-xs uppercase tracking-wider">
              <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
              <span>Pathophysiological Cause of Death</span>
            </div>
            <p className="text-sm font-sans text-red-100 leading-relaxed font-semibold">
              {deathCause || 'Refractory Cardiorespiratory Arrest with uncorrected vital failure.'}
            </p>
          </div>

          {/* Correct Clinical Management & Pearls */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Correct Clinical Management (Standard of Care)</span>
            </div>
            <p className="text-xs font-sans text-slate-300 leading-relaxed">
              {correctManagement ||
                'In clinical anesthesia, close continuous monitoring of hemodynamics and gas exchange is paramount. Any acute drop in MAP, SpO2, or heart rate must be treated immediately before positive feedback decompensation leads to irreversible brain and myocardial anoxia.'}
            </p>
            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-sans space-y-1">
              <div>• <strong>Ventilation standard:</strong> Always verify bilateral chest rise, bilateral breath sounds, and square-wave EtCO2 capnogram immediately after induction and intubation.</div>
              <div>• <strong>Hemodynamic resuscitation:</strong> If MAP drops below 55 mmHg, immediately push IV fluids and titrate vasopressors (Phenylephrine / Ephedrine / Norepinephrine) to preserve coronary perfusion pressure.</div>
              <div>• <strong>Dose titration:</strong> Scale induction agents to patient weight and physical status (ASA class, elderly, hypovolemia) to avoid catastrophic overdose collapse.</div>
            </div>
          </div>

          {/* Event & Action Audit Timeline */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 text-xs uppercase flex items-center gap-1.5">
                <History className="w-4 h-4 text-sky-400" />
                <span>Clinical Event &amp; Action Timeline</span>
              </span>
              <span className="text-[10px] text-slate-500">
                {actionLogs.length} logged events
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/60">
              {actionLogs.length === 0 ? (
                <div className="text-slate-500 text-[11px] py-2 text-center">No actions were recorded prior to demise.</div>
              ) : (
                actionLogs.slice(-10).reverse().map((entry) => (
                  <div key={entry.id} className="pt-1.5 flex items-start justify-between text-[11px] gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-slate-500 shrink-0">{entry.timeFormatted}</span>
                      <span className="font-bold text-slate-200 truncate">{entry.title}</span>
                    </div>
                    <span className={`text-[10px] uppercase font-bold shrink-0 px-1.5 py-0.5 rounded ${
                      entry.scoreEffect === 'correct' ? 'bg-emerald-950 text-emerald-400' :
                      entry.scoreEffect === 'harmful' ? 'bg-red-950 text-red-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {entry.scoreEffect}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-900 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800 shrink-0">
          <button
            onClick={onReturnToLobby}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Choose Another Case</span>
          </button>

          <button
            onClick={onRestartCase}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-950/80 flex items-center justify-center gap-2 transition-all active:scale-95 animate-pulse"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Start Over (Restart Case)</span>
          </button>
        </div>

      </div>
    </div>
  );
};
