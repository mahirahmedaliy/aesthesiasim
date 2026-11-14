import React, { useState, useEffect } from 'react';
import { ShieldAlert, Zap, Syringe, Wind, Activity, Heart, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { HeartRhythm } from '../../types/simulator';
import { audioEngine } from '../../utils/audioEngine';

interface CodeBlueModalProps {
  isOpen: boolean;
  onClose: () => void;
  rhythm?: HeartRhythm;
  causeOfDeath: string;
  onAdministerEpi: () => void;
  onDefibrillate?: () => void;
  onTurnOffGas: () => void;
  onDeliver100O2: () => void;
  onStartCPR: () => void;
  onAdministerAntidote?: (antidoteId: string) => void;
  onPatientDied: (reason: string) => void;
  onResetCase: () => void;
}

export const CodeBlueModal: React.FC<CodeBlueModalProps> = ({
  isOpen,
  onClose,
  rhythm = 'Asystole',
  causeOfDeath,
  onAdministerEpi,
  onDefibrillate,
  onTurnOffGas,
  onDeliver100O2,
  onStartCPR,
  onAdministerAntidote,
  onPatientDied,
  onResetCase,
}) => {
  const [compressionsActive, setCompressionsActive] = useState<boolean>(false);
  const [epiGiven, setEpiGiven] = useState<boolean>(false);
  const [defibDelivered, setDefibDelivered] = useState<boolean>(false);
  const [gasOff, setGasOff] = useState<boolean>(false);
  const [o2Delivered, setO2Delivered] = useState<boolean>(false);
  const [antidoteGiven, setAntidoteGiven] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(75); // 75 seconds window before biological death
  const [hasROSC, setHasROSC] = useState<boolean>(false);

  const isShockable = rhythm === 'Ventricular Fibrillation (VF)' || rhythm === 'Ventricular Tachycardia (VT)';

  useEffect(() => {
    if (!isOpen) {
      setCountdown(75);
      setHasROSC(false);
      setCompressionsActive(false);
      setEpiGiven(false);
      setDefibDelivered(false);
      setGasOff(false);
      setO2Delivered(false);
      setAntidoteGiven(null);
      return;
    }

    audioEngine.playCriticalAlarm();

    const timer = setInterval(() => {
      setCountdown((prev) => {
        // CPR pauses or slows down biological brain death timer by 3x
        if (compressionsActive) {
          if (prev <= 1) {
            clearInterval(timer);
            onPatientDied(causeOfDeath || 'Refractory Cardiac Arrest despite CPR.');
            return 0;
          }
          return prev; // Paused while CPR active!
        }

        if (prev <= 1) {
          clearInterval(timer);
          onPatientDied(causeOfDeath || 'Prolonged unresuscitated cardiac arrest (> 75 seconds).');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, compressionsActive, causeOfDeath, onPatientDied]);

  // Check for Return of Spontaneous Circulation (ROSC)
  useEffect(() => {
    // If rhythm is shockable (VF/VT), defibrillation is required!
    const shockRequirementMet = !isShockable || defibDelivered;

    if (compressionsActive && epiGiven && gasOff && o2Delivered && shockRequirementMet && !hasROSC) {
      setHasROSC(true);
      audioEngine.playActionChime(true);
      setTimeout(() => {
        onClose();
      }, 2500);
    }
  }, [compressionsActive, epiGiven, defibDelivered, gasOff, o2Delivered, isShockable, hasROSC, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-red-950 border-4 border-red-600 w-full max-w-2xl rounded-2xl shadow-[0_0_80px_rgba(220,38,38,0.7)] flex flex-col overflow-hidden text-white animate-pulse font-mono">
        {/* Banner */}
        <div className="bg-red-900 px-6 py-4 flex items-center justify-between border-b-2 border-red-700">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-yellow-300 animate-bounce shrink-0" />
            <div>
              <h2 className="text-xl sm:text-2xl font-black tracking-wider uppercase text-yellow-300">
                🚨 CODE BLUE: CARDIAC ARREST
              </h2>
              <p className="text-xs text-red-200 font-mono">
                Rhythm: <strong>{rhythm}</strong> {isShockable ? '(SHOCKABLE)' : '(NON-SHOCKABLE)'}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-mono text-red-200 uppercase block">
              {compressionsActive ? 'Perfusion Maintained by CPR' : 'Time to Biological Death:'}
            </span>
            <span className={`text-3xl font-mono font-black ${compressionsActive ? 'text-emerald-300' : 'text-yellow-300'}`}>
              {countdown}s
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 bg-black/70 text-xs">
          {/* Situation Analysis */}
          <div className="p-3 rounded-xl bg-red-900/60 border border-red-500 text-red-100 space-y-1">
            <span className="font-bold uppercase text-yellow-300 block text-xs">Arrest Etiology / Crisis:</span>
            <p className="text-xs sm:text-sm font-sans">{causeOfDeath}</p>
          </div>

          {/* ROSC Success Screen */}
          {hasROSC ? (
            <div className="p-6 rounded-xl bg-emerald-950 border-2 border-emerald-500 text-center space-y-2 animate-in zoom-in">
              <Activity className="w-12 h-12 text-emerald-400 mx-auto animate-pulse" />
              <h3 className="text-2xl font-black text-emerald-300">RETURN OF SPONTANEOUS CIRCULATION (ROSC)!</h3>
              <p className="text-xs text-emerald-200 font-sans">
                Coronary perfusion restored. Sinus rhythm recovered. Resuming case management...
              </p>
            </div>
          ) : (
            /* Active Resuscitation Actions */
            <div className="space-y-3">
              <span className="font-bold text-yellow-300 text-xs uppercase tracking-wider block">
                Execute Immediate ACLS Resuscitation Protocol:
              </span>

              <div className="grid grid-cols-2 gap-2.5">
                {/* 1. Start CPR */}
                <button
                  onClick={() => {
                    setCompressionsActive(true);
                    onStartCPR();
                  }}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold ${
                    compressionsActive
                      ? 'bg-emerald-900 border-emerald-400 text-emerald-200 shadow-md'
                      : 'bg-red-900/90 border-red-500 hover:bg-red-800 text-white shadow-lg active:scale-95 animate-pulse'
                  }`}
                >
                  <Heart className="w-5 h-5" />
                  <span className="text-center">{compressionsActive ? '✓ CPR ACTIVE (100-120/min)' : '1. START CHEST COMPRESSIONS'}</span>
                </button>

                {/* 2. Push Epinephrine 1mg */}
                <button
                  onClick={() => {
                    setEpiGiven(true);
                    onAdministerEpi();
                  }}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold ${
                    epiGiven
                      ? 'bg-emerald-900 border-emerald-400 text-emerald-200 shadow-md'
                      : 'bg-red-900/90 border-red-500 hover:bg-red-800 text-white shadow-lg active:scale-95'
                  }`}
                >
                  <Syringe className="w-5 h-5" />
                  <span className="text-center">{epiGiven ? '✓ EPINEPHRINE 1mg GIVEN IV' : '2. PUSH EPINEPHRINE 1 mg STAT'}</span>
                </button>

                {/* 3. Defibrillation (For VT/VF) */}
                {isShockable ? (
                  <button
                    onClick={() => {
                      setDefibDelivered(true);
                      onDefibrillate?.();
                      audioEngine.playActionChime(true);
                    }}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold ${
                      defibDelivered
                        ? 'bg-emerald-900 border-emerald-400 text-emerald-200'
                        : 'bg-amber-600 hover:bg-amber-500 text-black border-amber-300 shadow-lg active:scale-95 animate-bounce'
                    }`}
                  >
                    <Zap className="w-5 h-5" />
                    <span className="text-center">{defibDelivered ? '✓ 200J BIPHASIC SHOCKED' : '⚡ DEFIBRILLATE (200J BIPHASIC)'}</span>
                  </button>
                ) : (
                  /* 3. Turn off Gas */
                  <button
                    onClick={() => {
                      setGasOff(true);
                      onTurnOffGas();
                    }}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold ${
                      gasOff
                        ? 'bg-emerald-900 border-emerald-400 text-emerald-200'
                        : 'bg-red-900/90 border-red-500 hover:bg-red-800 text-white shadow-lg active:scale-95'
                    }`}
                  >
                    <Zap className="w-5 h-5" />
                    <span className="text-center">{gasOff ? '✓ VOLATILE GAS OFF (0%)' : '3. DISCONTINUE ANESTHETIC GAS'}</span>
                  </button>
                )}

                {/* 4. Deliver 100% O2 Ventilation */}
                <button
                  onClick={() => {
                    setO2Delivered(true);
                    onDeliver100O2();
                  }}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold ${
                    o2Delivered
                      ? 'bg-emerald-900 border-emerald-400 text-emerald-200'
                      : 'bg-red-900/90 border-red-500 hover:bg-red-800 text-white shadow-lg active:scale-95'
                  }`}
                >
                  <Wind className="w-5 h-5" />
                  <span className="text-center">{o2Delivered ? '✓ 100% O2 VENTILATION ACTIVE' : '4. DELIVER 100% OXYGEN'}</span>
                </button>
              </div>

              {/* Specific Emergency Antidotes Section */}
              <div className="pt-2 border-t border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1.5">
                  Specific Reversal Antidotes (If indicated for overdose/toxicity):
                </span>
                <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                  <button
                    onClick={() => {
                      setAntidoteGiven('naloxone');
                      onAdministerAntidote?.('naloxone');
                    }}
                    className={`p-1.5 rounded-lg border text-center transition-all ${
                      antidoteGiven === 'naloxone' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Naloxone 0.4mg (Opioids)
                  </button>

                  <button
                    onClick={() => {
                      setAntidoteGiven('flumazenil');
                      onAdministerAntidote?.('flumazenil');
                    }}
                    className={`p-1.5 rounded-lg border text-center transition-all ${
                      antidoteGiven === 'flumazenil' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Flumazenil 0.2mg (Benzos)
                  </button>

                  <button
                    onClick={() => {
                      setAntidoteGiven('sugammadex');
                      onAdministerAntidote?.('sugammadex');
                    }}
                    className={`p-1.5 rounded-lg border text-center transition-all ${
                      antidoteGiven === 'sugammadex' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Sugammadex 200mg (Paralytics)
                  </button>

                  <button
                    onClick={() => {
                      setAntidoteGiven('intralipid');
                      onAdministerAntidote?.('lipid_emulsion');
                    }}
                    className={`p-1.5 rounded-lg border text-center transition-all ${
                      antidoteGiven === 'intralipid' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Intralipid 100mL (LAST)
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
