import React, { useState } from 'react';
import { DynamicPhysiology, VentilatorState, MonitoringAttachments } from '../../types/simulator';
import { OscilloscopeCanvas } from './OscilloscopeCanvas';
import { Heart, Activity, Wind, Thermometer, ShieldAlert, Volume2, VolumeX, BellOff, RefreshCw } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

interface LivePatientMonitorProps {
  phys: DynamicPhysiology;
  vent: VentilatorState;
  monitoring: MonitoringAttachments;
  displayedNibp?: { sbp: number; dbp: number; map: number };
  onTriggerNibp: () => void;
  isPaused: boolean;
  timeScale: number;
}

export const LivePatientMonitor: React.FC<LivePatientMonitorProps> = ({
  phys,
  vent,
  monitoring,
  displayedNibp,
  onTriggerNibp,
  isPaused,
  timeScale,
}) => {
  const [isMuted, setIsMuted] = useState<boolean>(audioEngine.getIsMuted());

  // Invasive Art-line provides beat-to-beat pressure; NIBP only provides intermittent cycle
  const activeSbp = monitoring.artLineAttached ? phys.sbp : (displayedNibp?.sbp ?? phys.sbp);
  const activeDbp = monitoring.artLineAttached ? phys.dbp : (displayedNibp?.dbp ?? phys.dbp);
  const activeMap = monitoring.artLineAttached ? phys.map : (displayedNibp?.map ?? phys.map);

  // Determine critical and warning alarms
  const alarms: { level: 'crit' | 'warn'; msg: string }[] = [];
  if (phys.rhythm === 'Asystole' || phys.hr === 0) alarms.push({ level: 'crit', msg: '🚨 ASYSTOLE / CARDIAC ARREST' });
  if (phys.spo2 < 88) alarms.push({ level: 'crit', msg: `CRITICAL HYPOXEMIA: SpO2 ${phys.spo2}%` });
  if (phys.map < 55) alarms.push({ level: 'crit', msg: `CRITICAL HYPOTENSION: MAP ${phys.map} mmHg` });
  if (vent.livePip > 40) alarms.push({ level: 'crit', msg: `HIGH AIRWAY PRESSURE: PIP ${vent.livePip} cmH2O` });
  if (phys.hr > 130) alarms.push({ level: 'warn', msg: `TACHYCARDIA: HR ${phys.hr} bpm` });
  if (phys.hr < 45 && phys.hr > 0) alarms.push({ level: 'crit', msg: `BRADYCARDIA: HR ${phys.hr} bpm` });
  if (phys.etco2 < 20 && phys.airwayDevice === 'ett') alarms.push({ level: 'warn', msg: `LOW ETCO2: ${phys.etco2} mmHg (Low perfusion/disconnect)` });

  // Play audio chime if critical alarms active
  React.useEffect(() => {
    if (alarms.some(a => a.level === 'crit') && !isPaused) {
      audioEngine.playCriticalAlarm();
    }
  }, [alarms, isPaused]);

  const handleToggleMute = () => {
    const muted = audioEngine.toggleMute();
    setIsMuted(muted);
  };

  const handleSilenceAlarm = () => {
    audioEngine.silenceAlarms();
  };

  return (
    <div className="flex flex-col h-full bg-[#030712] rounded-xl border-2 border-slate-800 shadow-2xl overflow-hidden font-sans">
      {/* Monitor Header / Alarm Bar */}
      <div className="bg-slate-950 border-b border-slate-800 px-3 py-1.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-mono font-bold tracking-wider text-slate-300 uppercase">
              PHILIPS INTELLIVUE MP70
            </span>
          </div>

          {/* Alarm Banner */}
          {alarms.length > 0 ? (
            <div className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold flex items-center gap-1.5 animate-pulse ${
              alarms[0].level === 'crit'
                ? 'bg-red-950/90 text-red-300 border border-red-500'
                : 'bg-amber-950/90 text-amber-300 border border-amber-500'
            }`}>
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{alarms[0].msg}</span>
              {alarms.length > 1 && <span className="opacity-75">(+{alarms.length - 1})</span>}
            </div>
          ) : (
            <div className="px-2.5 py-0.5 rounded bg-slate-900 text-[11px] font-mono text-emerald-400 border border-slate-800">
              ALL MONITORS NORMAL
            </div>
          )}
        </div>

        {/* Action Buttons: Stat NIBP, Silence, Mute */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onTriggerNibp}
            className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 flex items-center gap-1 transition-colors"
            title="Cycle NIBP Cuff Now"
          >
            <RefreshCw className={`w-3 h-3 ${monitoring.isNibpInflating ? 'animate-spin text-sky-400' : ''}`} />
            <span>{monitoring.isNibpInflating ? 'Inflating...' : 'Stat NIBP'}</span>
          </button>

          <button
            onClick={handleSilenceAlarm}
            title="Silence alarms for 60 seconds"
            className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 flex items-center gap-1 transition-colors"
          >
            <BellOff className="w-3 h-3" />
            <span>Silence</span>
          </button>

          <button
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute Audio Beeps' : 'Mute Audio Beeps'}
            className={`p-1 rounded transition-colors ${
              isMuted ? 'bg-red-900/50 text-red-400 border border-red-500/40' : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
            }`}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Split: Left 65% Waveforms, Right 35% Numerical Tiles */}
      <div className="grid grid-cols-12 flex-1 p-1.5 lg:p-2 gap-1.5 lg:gap-2 min-h-0">
        {/* Left: Waveforms Area */}
        <div className="col-span-12 md:col-span-7 h-full min-h-[160px] lg:min-h-[190px]">
          <OscilloscopeCanvas
            phys={phys}
            vent={vent}
            monitoring={monitoring}
            isPaused={isPaused}
            timeScale={timeScale}
          />
        </div>

        {/* Right: Numerical Tiles */}
        <div className="col-span-12 md:col-span-5 flex flex-col gap-1 lg:gap-1.5 h-full overflow-y-auto pr-0.5">
          
          {/* Tile 1: Heart Rate & Rhythm (Green) */}
          <div className="bg-slate-900/80 border border-emerald-900/60 rounded-lg p-1.5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono font-bold uppercase">
                <Heart className="w-3 h-3 fill-emerald-400 animate-pulse" />
                <span>HR / ECG (bpm)</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block mt-0.5 truncate max-w-[130px]">
                {phys.rhythm}
              </span>
            </div>
            <div className="text-right">
              <span className={`text-2xl lg:text-3xl font-mono font-black tracking-tight ${
                phys.hr > 120 || phys.hr < 45 || phys.hr === 0 ? 'text-red-400 animate-pulse' : 'text-emerald-400'
              }`}>
                {phys.hr}
              </span>
            </div>
          </div>

          {/* Tile 2: SpO2 Oxygen Saturation (Cyan) */}
          <div className="bg-slate-900/80 border border-cyan-900/60 rounded-lg p-1.5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-mono font-bold uppercase">
                <Activity className="w-3 h-3" />
                <span>SpO2 (%)</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                Pleth PI: {(phys.bloodVolumeMl / 2500).toFixed(1)}
              </span>
            </div>
            <div className="text-right">
              <span className={`text-2xl lg:text-3xl font-mono font-black tracking-tight ${
                phys.spo2 < 90 ? 'text-red-400 animate-pulse' : phys.spo2 < 94 ? 'text-amber-400' : 'text-cyan-400'
              }`}>
                {Math.round(phys.spo2)}
              </span>
            </div>
          </div>

          {/* Tile 3: Blood Pressure NIBP / ART (Red) */}
          <div className="bg-slate-900/80 border border-rose-900/60 rounded-lg p-1.5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-rose-400 text-xs font-mono font-bold uppercase">
                <Activity className="w-3 h-3" />
                <span>{monitoring.artLineAttached ? 'ART LINE (Beat-to-Beat)' : 'NIBP (Cuff Cycle)'}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-slate-400 font-mono">MAP:</span>
                <span className={`text-xs font-mono font-bold ${activeMap < 65 ? 'text-rose-400 animate-pulse' : 'text-slate-200'}`}>
                  ({activeMap})
                </span>
                {!monitoring.artLineAttached && (
                  <span className="text-[9px] text-amber-400 font-mono ml-1">q3min</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className={`text-xl lg:text-2xl font-mono font-black tracking-tight ${
                activeSbp < 85 || activeMap < 60 ? 'text-rose-400 animate-pulse' : activeSbp > 200 ? 'text-rose-300 font-black' : 'text-red-400'
              }`}>
                {activeSbp} / {activeDbp}
              </div>
            </div>
          </div>

          {/* Tile 4: Capnography & Respiration (Yellow) */}
          <div className="bg-slate-900/80 border border-amber-900/60 rounded-lg p-1.5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-mono font-bold uppercase">
                <Wind className="w-3 h-3" />
                <span>EtCO2 / RR</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                RR: <span className="text-slate-200 font-bold">{phys.rr}</span> /min
              </span>
            </div>
            <div className="text-right">
              <span className={`text-2xl lg:text-3xl font-mono font-black tracking-tight ${
                phys.etco2 > 45 || phys.etco2 < 20 ? 'text-amber-400 animate-pulse' : 'text-yellow-400'
              }`}>
                {phys.etco2}
              </span>
              <span className="text-[9px] text-amber-400 ml-1 font-mono">mmHg</span>
            </div>
          </div>

          {/* Bottom Dual Bar: Temp & TOF/BIS */}
          <div className="grid grid-cols-2 gap-1.5 mt-auto">
            {/* Core Temp */}
            <div className="bg-slate-900/80 border border-purple-900/50 rounded-lg p-1.5">
              <div className="flex items-center gap-1 text-purple-400 text-[10px] font-mono font-bold">
                <Thermometer className="w-3 h-3" />
                <span>TEMP (Core)</span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className={`text-base font-mono font-bold ${phys.tempC < 36.0 ? 'text-cyan-400' : 'text-purple-300'}`}>
                  {phys.tempC.toFixed(1)}°C
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  {((phys.tempC * 9/5) + 32).toFixed(1)}°F
                </span>
              </div>
            </div>

            {/* TOF & BIS Depth */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-1.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-300">
                <span>TOF TWITCH</span>
                <span className="text-cyan-400 font-bold">BIS {phys.bis}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4].map((num) => (
                    <span
                      key={num}
                      className={`w-2 h-2 rounded-full ${
                        num <= phys.tofCount
                          ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                          : 'bg-slate-800 border border-slate-700'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-300">{phys.tofCount}/4</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
