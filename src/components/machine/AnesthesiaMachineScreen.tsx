import React from 'react';
import { VentilatorState, VentMode, VolatileAgent, DynamicPhysiology } from '../../types/simulator';
import {
  Gauge,
  Flame,
  Wind,
  Sliders,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Power,
  CheckCircle2,
  AlertCircle,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

interface AnesthesiaMachineScreenProps {
  vent: VentilatorState;
  onUpdateVent: (updates: Partial<VentilatorState>) => void;
  onO2Flush: () => void;
  patientAge: number;
  patientWeightKg?: number;
  phys?: DynamicPhysiology;
  isLeakTestDone?: boolean;
  isLeakTesting?: boolean;
  onRunLeakTest?: () => void;
}

export const AnesthesiaMachineScreen: React.FC<AnesthesiaMachineScreenProps> = ({
  vent,
  onUpdateVent,
  onO2Flush,
  patientAge,
  patientWeightKg = 70,
  phys,
  isLeakTestDone = false,
  isLeakTesting = false,
  onRunLeakTest,
}) => {
  // Age-adjusted MAC calculation
  const sevoMac40 = 2.0;
  const ageFactor = 1 - (patientAge - 40) * 0.005;
  const target1Mac = Math.max(1.3, sevoMac40 * ageFactor);

  // Gas mixing calculations
  const totalFgf = Math.round((vent.o2FlowLpm + vent.airFlowLpm + vent.n2oFlowLpm) * 10) / 10;
  const deliveredFio2 =
    totalFgf > 0.1
      ? Math.min(100, Math.max(10, Math.round(((vent.o2FlowLpm * 1.0 + vent.airFlowLpm * 0.21) / totalFgf) * 100)))
      : 21;
  const deliveredFin2o =
    totalFgf > 0.1 ? Math.min(79, Math.max(0, Math.round((vent.n2oFlowLpm / totalFgf) * 100))) : 0;
  const n2oMac = totalFgf > 0.1 ? Number(((vent.n2oFlowLpm / totalFgf) * (100 / 104)).toFixed(2)) : 0;
  const volatileMac = Number((vent.liveEtAgent / target1Mac).toFixed(2));
  const currentTotalMac = Number((volatileMac + n2oMac).toFixed(2));

  // =========================================================================
  // VENTILATOR SETUP EVALUATION ENGINE
  // =========================================================================
  const vtPerKg = Number((vent.setVt / patientWeightKg).toFixed(1));
  const minuteVol = Number(((vent.setVt * vent.setRR) / 1000).toFixed(1));
  const isBronchospasm = phys?.airwayPatency === 'bronchospasm' || phys?.breathSounds.includes('Wheezing');

  // 1. Tidal Volume Assessment
  let vtStatus: 'good' | 'warn' | 'crit' = 'good';
  let vtLabel = '';
  if (vtPerKg > 10.0) {
    vtStatus = 'crit';
    vtLabel = `High Vt (${vtPerKg} mL/kg) — Volutrauma/Barotrauma risk!`;
  } else if (vtPerKg < 5.0) {
    vtStatus = 'warn';
    vtLabel = `Low Vt (${vtPerKg} mL/kg) — Dependent atelectasis risk!`;
  } else if (vtPerKg >= 6.0 && vtPerKg <= 8.5) {
    vtStatus = 'good';
    vtLabel = `Optimal Vt (${vtPerKg} mL/kg PBW) — Lung-protective.`;
  } else {
    vtStatus = 'good';
    vtLabel = `Acceptable Vt (${vtPerKg} mL/kg).`;
  }

  // 2. Minute Ventilation Assessment
  let mvStatus: 'good' | 'warn' | 'crit' = 'good';
  let mvLabel = '';
  if (minuteVol < 4.0) {
    mvStatus = 'crit';
    mvLabel = `Inadequate Minute Vol (${minuteVol} L/min) — PaCO2/EtCO2 will surge!`;
  } else if (minuteVol > 12.0) {
    mvStatus = 'warn';
    mvLabel = `Excessive Minute Vol (${minuteVol} L/min) — Severe hypocapnia risk!`;
  } else if (minuteVol >= 5.0 && minuteVol <= 8.5) {
    mvStatus = 'good';
    mvLabel = `Normocapnic Minute Vol (${minuteVol} L/min).`;
  } else {
    mvStatus = 'good';
    mvLabel = `Acceptable Minute Vol (${minuteVol} L/min).`;
  }

  // 3. PEEP Assessment
  let peepStatus: 'good' | 'warn' | 'crit' = 'good';
  let peepLabel = '';
  if (vent.peep === 0) {
    peepStatus = 'warn';
    peepLabel = 'Zero PEEP (0 cmH2O) — Progressive alveolar derecruitment!';
  } else if (vent.peep > 12) {
    peepStatus = 'crit';
    peepLabel = `High PEEP (${vent.peep} cmH2O) — Impairs venous return & BP!`;
  } else if (vent.peep >= 4 && vent.peep <= 8) {
    peepStatus = 'good';
    peepLabel = `Optimal PEEP (${vent.peep} cmH2O) — Alveolar stability.`;
  } else {
    peepStatus = 'good';
    peepLabel = `PEEP ${vent.peep} cmH2O.`;
  }

  // 4. I:E Ratio Assessment
  let ieStatus: 'good' | 'warn' = 'good';
  let ieLabel = '';
  if (isBronchospasm && (vent.ieRatio === '1:1' || vent.ieRatio === '1:2')) {
    ieStatus = 'warn';
    ieLabel = `Short Expiratory Time in Bronchospasm! Set I:E to 1:3 or 1:4.`;
  } else if (isBronchospasm && (vent.ieRatio === '1:3' || vent.ieRatio === '1:4')) {
    ieStatus = 'good';
    ieLabel = `Prolonged Expiration (I:E ${vent.ieRatio}) — Prevents auto-PEEP.`;
  } else {
    ieStatus = 'good';
    ieLabel = `I:E Ratio ${vent.ieRatio} (Standard).`;
  }

  // 5. Overall Evaluation
  let overallRating: 'Optimal' | 'Suboptimal' | 'Unsafe' = 'Optimal';
  if (!vent.powerOn) {
    overallRating = 'Unsafe';
  } else if (vtStatus === 'crit' || mvStatus === 'crit' || peepStatus === 'crit' || deliveredFio2 < 21) {
    overallRating = 'Unsafe';
  } else if (vtStatus === 'warn' || mvStatus === 'warn' || peepStatus === 'warn' || ieStatus === 'warn') {
    overallRating = 'Suboptimal';
  }

  const handleAdjustFlow = (gas: 'o2' | 'air' | 'n2o', delta: number) => {
    if (gas === 'o2') {
      const next = Math.max(0.2, Math.min(10.0, Math.round((vent.o2FlowLpm + delta) * 10) / 10));
      onUpdateVent({ o2FlowLpm: next });
    } else if (gas === 'air') {
      const next = Math.max(0.0, Math.min(10.0, Math.round((vent.airFlowLpm + delta) * 10) / 10));
      onUpdateVent({ airFlowLpm: next });
    } else if (gas === 'n2o') {
      const next = Math.max(0.0, Math.min(10.0, Math.round((vent.n2oFlowLpm + delta) * 10) / 10));
      onUpdateVent({ n2oFlowLpm: next });
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#060b19] rounded-xl border-2 border-slate-700 shadow-2xl overflow-hidden font-sans select-none">
      
      {/* ======================================================== */}
      {/* HEADER BANNER: Workstation ID, Master Power, Bag/Vent Switch */}
      {/* ======================================================== */}
      <div className="bg-slate-900 border-b border-slate-700 px-3 py-1.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
          <span className="text-[11px] font-mono font-bold tracking-wider text-slate-200 uppercase">
            DRÄGER PERSEUS A500 ANESTHESIA WORKSTATION
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 hidden sm:inline">
            Pipeline: 52 PSI
          </span>
        </div>

        {/* Master Power, Leak Test, Mode Switch, O2 Flush */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          
          {/* Automated Machine Leak Test & Checkout Button */}
          {onRunLeakTest && (
            <button
              onClick={onRunLeakTest}
              disabled={isLeakTesting}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-md ${
                isLeakTesting
                  ? 'bg-amber-600 text-white animate-pulse'
                  : isLeakTestDone
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/70 hover:bg-emerald-900/40'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400 ring-2 ring-indigo-400/50 shadow-indigo-950 animate-pulse'
              }`}
              title="Perform automated pre-use workstation leak check & compliance calibration"
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${isLeakTestDone ? 'text-emerald-400' : 'text-indigo-200'}`} />
              <span className="hidden sm:inline">
                {isLeakTesting
                  ? 'TESTING LEAK (30 cmH2O)...'
                  : isLeakTestDone
                  ? 'LEAK TEST: PASSED (12 mL/min)'
                  : '▶ RUN WORKSTATION LEAK TEST'}
              </span>
              <span className="sm:hidden">
                {isLeakTesting ? 'TESTING...' : isLeakTestDone ? 'LEAK PASS' : 'LEAK TEST'}
              </span>
            </button>
          )}

          {/* Master Power ON/OFF Toggle */}
          <button
            onClick={() => {
              const next = !vent.powerOn;
              onUpdateVent({
                powerOn: next,
                ...(next ? {} : { liveDeliveredVt: 0, liveMinuteVolume: 0, livePip: 0, livePplat: 0 }),
              });
              audioEngine.playActionChime(next);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-md ${
              vent.powerOn
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950 border border-emerald-400/50'
                : 'bg-red-950 hover:bg-red-900 text-red-300 border border-red-600/70 animate-pulse'
            }`}
            title={vent.powerOn ? 'Ventilator Power is ON (Click to set to Standby/OFF)' : 'Ventilator Power is OFF (Click to Turn ON)'}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{vent.powerOn ? 'POWER: ON' : 'POWER: OFF (STANDBY)'}</span>
          </button>

          {/* Bag / Vent Auto Switch */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => onUpdateVent({ bagVentSwitch: 'bag' })}
              className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                vent.bagVentSwitch === 'bag'
                  ? 'bg-amber-600 text-black shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              BAG / MANUAL
            </button>
            <button
              onClick={() => {
                if (!vent.powerOn) {
                  onUpdateVent({ bagVentSwitch: 'vent', powerOn: true });
                } else {
                  onUpdateVent({ bagVentSwitch: 'vent' });
                }
              }}
              className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                vent.bagVentSwitch === 'vent'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              VENTILATOR AUTO
            </button>
          </div>

          {/* O2 Flush */}
          <button
            onClick={() => {
              onO2Flush();
              audioEngine.playActionChime(true);
            }}
            className="px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white font-mono text-[10px] font-black transition-all active:scale-95 flex items-center gap-1 shadow-md"
            title="Deliver 100% O2 at 35-75 L/min flush directly to circuit"
          >
            <Zap className="w-3 h-3 text-yellow-300" />
            <span>O2 FLUSH</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MAIN WORKSTATION VIEWPORT */}
      {/* ======================================================== */}
      <div className="grid grid-cols-12 flex-1 p-2 gap-2 overflow-y-auto min-h-0">
        
        {/* Animated Workstation Checkout Diagnostic Progress Banner */}
        {isLeakTesting && (
          <div className="col-span-12 p-3 rounded-lg bg-indigo-950/95 border border-indigo-500/80 text-xs font-mono text-indigo-100 flex flex-col md:flex-row items-center justify-between gap-2 shadow-2xl animate-pulse">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400 animate-spin" />
              <div>
                <span className="font-bold text-cyan-300 uppercase block tracking-wider">
                  Automated Pre-Use Workstation Checkout in Progress
                </span>
                <span className="text-[11px] text-slate-300">
                  Occluding circuit Y-piece... Pressurizing circuit to 30 cmH2O... Measuring pressure decay & compliance...
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-indigo-900 border border-indigo-700 text-[10px] font-bold text-cyan-300">
                P-CIRCUIT: 30 cmH2O
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-[10px] font-bold text-emerald-300">
                LEAK RATE &lt; 20 mL/min (PASS)
              </span>
            </div>
          </div>
        )}
        
        {/* Left Column: Airway Pressures, APL & Gas Flowmeters */}
        <div className="col-span-12 2xl:col-span-6 flex flex-col gap-2">
          
          {/* Card 1: Airway Pressures & Mechanics */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
              <div className="flex items-center gap-1.5 text-sky-400 text-xs font-mono font-bold uppercase">
                <Gauge className="w-3.5 h-3.5" />
                <span>Airway Pressures &amp; Mechanics</span>
              </div>
              <span className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold ${
                !vent.powerOn
                  ? 'bg-slate-800 text-slate-400 border border-slate-700'
                  : vent.livePip > 38
                  ? 'bg-red-950 text-red-300 border border-red-500 animate-pulse'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}>
                {!vent.powerOn ? 'STANDBY (POWER OFF)' : vent.livePip > 38 ? 'HIGH RESISTANCE ALARM' : 'NORMAL RANGE'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {/* PIP */}
              <div className={`p-2 rounded-lg border flex flex-col items-center justify-center ${
                !vent.powerOn ? 'bg-slate-900 border-slate-800 text-slate-500' :
                vent.livePip > 38 ? 'bg-red-950/40 border-red-700 text-red-300' : 'bg-slate-900 border-slate-800 text-sky-400'
              }`}>
                <span className="text-[9px] font-mono font-semibold uppercase">P-Peak (PIP)</span>
                <span className="text-2xl font-mono font-black mt-0.5">{vent.powerOn ? vent.livePip : '--'}</span>
                <span className="text-[9px] text-slate-400 font-mono">cmH2O</span>
              </div>

              {/* Pplat */}
              <div className="p-2 rounded-lg border bg-slate-900 border-slate-800 text-sky-300 flex flex-col items-center justify-center">
                <span className="text-[9px] font-mono font-semibold uppercase">P-Plateau</span>
                <span className="text-2xl font-mono font-black mt-0.5">{vent.powerOn ? vent.livePplat : '--'}</span>
                <span className="text-[9px] text-slate-400 font-mono">cmH2O</span>
              </div>

              {/* PEEP */}
              <div className="p-2 rounded-lg border bg-slate-900 border-slate-800 text-emerald-400 flex flex-col items-center justify-center">
                <span className="text-[9px] font-mono font-semibold uppercase">PEEP</span>
                <span className="text-2xl font-mono font-black mt-0.5">{vent.powerOn ? vent.peep : '--'}</span>
                <span className="text-[9px] text-slate-400 font-mono">cmH2O</span>
              </div>
            </div>

            {/* Delivered Volume & Minute Ventilation */}
            <div className="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-slate-800 text-xs font-mono">
              <div className="flex justify-between items-center p-1.5 rounded bg-slate-900/60">
                <span className="text-slate-400 text-[11px]">Delivered Vt:</span>
                <span className="font-bold text-slate-200">{vent.powerOn ? `${vent.liveDeliveredVt} mL` : '0 mL'}</span>
              </div>
              <div className="flex justify-between items-center p-1.5 rounded bg-slate-900/60">
                <span className="text-slate-400 text-[11px]">Minute Vol:</span>
                <span className="font-bold text-slate-200">{vent.powerOn ? `${vent.liveMinuteVolume} L/min` : '0 L/min'}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Interactive Gas Rotameters (O2, Air, N2O) & APL Valve */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300 uppercase">
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                <span>Gas Rotameter Flowmeters &amp; APL</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Total FGF: <span className="font-bold text-sky-300">{totalFgf} L/min</span>
              </span>
            </div>

            {/* APL Slider for Bag/Manual Mode */}
            <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>Spontaneous (Open)</span>
                <span>APL Valve: <strong className="text-amber-300">{vent.aplValveCmH2o} cmH2O</strong></span>
                <span>70 (Closed)</span>
              </div>
              <input
                type="range"
                min="0"
                max="70"
                step="5"
                value={vent.aplValveCmH2o}
                onChange={(e) => onUpdateVent({ aplValveCmH2o: parseInt(e.target.value) })}
                className="w-full accent-amber-400"
              />
            </div>

            {/* 3 Interactive Rotameters (O2, Air, N2O) */}
            <div className="grid grid-cols-3 gap-2">
              
              {/* Rotameter 1: O2 Flowmeter (Green) */}
              <div className="p-2 rounded-lg bg-slate-900 border border-emerald-950 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400 font-bold uppercase">
                  <span>O2 (Green)</span>
                  <span className="text-xs text-white">{vent.o2FlowLpm} L</span>
                </div>
                {/* Visual Glass Tube Float */}
                <div className="h-14 bg-slate-950 rounded border border-emerald-900/60 relative my-1 overflow-hidden flex items-end justify-center">
                  <div
                    className="w-full bg-emerald-950/40 transition-all duration-150 relative"
                    style={{ height: `${Math.min(100, (vent.o2FlowLpm / 10) * 100)}%` }}
                  >
                    <div className="w-4 h-2 rounded bg-emerald-400 mx-auto shadow-[0_0_6px_#10b981]" />
                  </div>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="10.0"
                  step="0.1"
                  value={vent.o2FlowLpm}
                  onChange={(e) => onUpdateVent({ o2FlowLpm: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 my-1"
                />
                <div className="grid grid-cols-4 gap-0.5 text-[9px] font-mono font-bold">
                  <button onClick={() => handleAdjustFlow('o2', -1.0)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">-1</button>
                  <button onClick={() => handleAdjustFlow('o2', -0.2)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">-.2</button>
                  <button onClick={() => handleAdjustFlow('o2', 0.2)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">+.2</button>
                  <button onClick={() => handleAdjustFlow('o2', 1.0)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">+1</button>
                </div>
              </div>

              {/* Rotameter 2: Air Flowmeter (Yellow) */}
              <div className="p-2 rounded-lg bg-slate-900 border border-yellow-950 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[10px] font-mono text-yellow-400 font-bold uppercase">
                  <span>Air (Yellow)</span>
                  <span className="text-xs text-white">{vent.airFlowLpm} L</span>
                </div>
                {/* Visual Glass Tube Float */}
                <div className="h-14 bg-slate-950 rounded border border-yellow-900/60 relative my-1 overflow-hidden flex items-end justify-center">
                  <div
                    className="w-full bg-yellow-950/40 transition-all duration-150 relative"
                    style={{ height: `${Math.min(100, (vent.airFlowLpm / 10) * 100)}%` }}
                  >
                    <div className="w-4 h-2 rounded bg-yellow-400 mx-auto shadow-[0_0_6px_#facc15]" />
                  </div>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="10.0"
                  step="0.1"
                  value={vent.airFlowLpm}
                  onChange={(e) => onUpdateVent({ airFlowLpm: parseFloat(e.target.value) })}
                  className="w-full accent-yellow-500 my-1"
                />
                <div className="grid grid-cols-4 gap-0.5 text-[9px] font-mono font-bold">
                  <button onClick={() => handleAdjustFlow('air', -1.0)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">-1</button>
                  <button onClick={() => handleAdjustFlow('air', -0.2)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">-.2</button>
                  <button onClick={() => handleAdjustFlow('air', 0.2)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">+.2</button>
                  <button onClick={() => handleAdjustFlow('air', 1.0)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">+1</button>
                </div>
              </div>

              {/* Rotameter 3: N2O Flowmeter (Blue) */}
              <div className="p-2 rounded-lg bg-slate-900 border border-blue-950 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[10px] font-mono text-blue-400 font-bold uppercase">
                  <span>N2O (Blue)</span>
                  <span className="text-xs text-white">{vent.n2oFlowLpm} L</span>
                </div>
                {/* Visual Glass Tube Float */}
                <div className="h-14 bg-slate-950 rounded border border-blue-900/60 relative my-1 overflow-hidden flex items-end justify-center">
                  <div
                    className="w-full bg-blue-950/40 transition-all duration-150 relative"
                    style={{ height: `${Math.min(100, (vent.n2oFlowLpm / 10) * 100)}%` }}
                  >
                    <div className="w-4 h-2 rounded bg-blue-400 mx-auto shadow-[0_0_6px_#60a5fa]" />
                  </div>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="10.0"
                  step="0.1"
                  value={vent.n2oFlowLpm}
                  onChange={(e) => onUpdateVent({ n2oFlowLpm: parseFloat(e.target.value) })}
                  className="w-full accent-blue-500 my-1"
                />
                <div className="grid grid-cols-4 gap-0.5 text-[9px] font-mono font-bold">
                  <button onClick={() => handleAdjustFlow('n2o', -1.0)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">-1</button>
                  <button onClick={() => handleAdjustFlow('n2o', -0.2)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">-.2</button>
                  <button onClick={() => handleAdjustFlow('n2o', 0.2)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">+.2</button>
                  <button onClick={() => handleAdjustFlow('n2o', 1.0)} className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">+1</button>
                </div>
              </div>

            </div>

            {/* Calculated Delivered Gas Concentrations */}
            <div className="grid grid-cols-3 gap-1.5 pt-1 text-xs font-mono">
              <div className={`p-1.5 rounded flex flex-col items-center justify-center border ${
                deliveredFio2 < 21 ? 'bg-red-950/80 border-red-500 text-red-300 animate-pulse' : 'bg-slate-900 border-slate-800 text-emerald-400'
              }`}>
                <span className="text-[9px] text-slate-400 uppercase">Delivered FiO2</span>
                <span className="font-bold text-base">{deliveredFio2}%</span>
                {deliveredFio2 < 21 && <span className="text-[8px] font-black uppercase text-red-400">HYPOXIC MIX!</span>}
              </div>

              <div className="p-1.5 rounded bg-slate-900 border border-slate-800 text-blue-300 flex flex-col items-center justify-center">
                <span className="text-[9px] text-slate-400 uppercase">Delivered N2O</span>
                <span className="font-bold text-base">{deliveredFin2o}%</span>
                <span className="text-[8px] text-slate-500 font-normal">+{n2oMac} MAC</span>
              </div>

              <div className="p-1.5 rounded bg-slate-900 border border-slate-800 text-sky-300 flex flex-col items-center justify-center">
                <span className="text-[9px] text-slate-400 uppercase">Total FGF</span>
                <span className="font-bold text-base">{totalFgf} L/min</span>
                <span className="text-[8px] text-slate-500 font-normal">Circuit Flush</span>
              </div>
            </div>

          </div>

          {/* Card 3: Volatile Vaporizer */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-2">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-mono font-bold uppercase">
                <Flame className="w-3.5 h-3.5" />
                <span>Volatile Vaporizer: {vent.vaporizerAgent}</span>
              </div>
              <div className="flex items-center gap-1 text-xs font-mono font-bold">
                <span className="text-slate-400 text-[10px]">Total MAC:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] ${
                  currentTotalMac > 1.4 ? 'bg-amber-950 text-amber-300' : currentTotalMac < 0.6 ? 'bg-red-950 text-red-300' : 'bg-emerald-950 text-emerald-300'
                }`}>
                  {currentTotalMac} MAC
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex flex-col justify-between">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-400 text-[11px]">Dial Setting:</span>
                  <span className="font-bold text-amber-300 text-base">{vent.vaporizerDialPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.2"
                  value={vent.vaporizerDialPercent}
                  onChange={(e) => onUpdateVent({ 
                    vaporizerDialPercent: parseFloat(e.target.value),
                    liveEtAgent: Number((parseFloat(e.target.value) * 0.82).toFixed(1))
                  })}
                  className="w-full accent-amber-400 my-1"
                />
                <div className="flex gap-1 mt-1">
                  {[0, 1.0, 1.8, 2.5, 3.5].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => onUpdateVent({
                        vaporizerDialPercent: preset,
                        liveEtAgent: Number((preset * 0.82).toFixed(1))
                      })}
                      className={`flex-1 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
                        vent.vaporizerDialPercent === preset ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Gas Analysis Card */}
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex flex-col justify-between text-xs font-mono">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">FiAgent:</span>
                  <span className="font-bold text-slate-200">{vent.liveFiAgent}%</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">EtAgent:</span>
                  <span className="font-bold text-amber-300">{vent.liveEtAgent}%</span>
                </div>
                <div className="p-1 rounded bg-slate-950 text-[9px] text-slate-400 border border-slate-800 leading-tight">
                  Target: 1.0–1.2 MAC. Reduce in severe hemorrhage.
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Ventilator Settings & LIVE CLINICAL SETUP EVALUATION */}
        <div className="col-span-12 2xl:col-span-6 flex flex-col gap-2">
          
          {/* Mode Selector */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2">
            <span className="text-xs font-mono font-bold text-slate-300 uppercase block mb-1.5">
              Ventilation Mode Selection
            </span>
            <div className="grid grid-cols-5 gap-1.5">
              {(['Manual/Bag', 'VCV', 'PCV', 'SIMV', 'PSV'] as VentMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onUpdateVent({ mode, bagVentSwitch: mode === 'Manual/Bag' ? 'bag' : 'vent' })}
                  className={`py-1.5 px-1 rounded-lg text-xs font-mono font-bold transition-all border ${
                    vent.mode === mode
                      ? 'bg-sky-600 border-sky-400 text-white shadow-md'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Ventilator Setting Parameters (Editable by User) */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-2">
            <div className="text-xs font-mono font-bold text-slate-300 uppercase flex items-center justify-between">
              <span>Ventilator Setting Adjustments</span>
              <span className="text-[10px] text-slate-500 font-normal">Patient PBW: {patientWeightKg} kg</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Tidal Volume */}
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex flex-col justify-between">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-400 text-[11px]">Set Vt:</span>
                  <span className="font-bold text-sky-400 text-sm">{vent.setVt} mL</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="800"
                  step="20"
                  value={vent.setVt}
                  onChange={(e) => onUpdateVent({ setVt: parseInt(e.target.value) })}
                  className="w-full accent-sky-400 my-1"
                />
                <div className="flex justify-between text-[9px] font-mono text-slate-500">
                  <span>200 mL</span>
                  <span className="text-sky-300 font-bold">{vtPerKg} mL/kg</span>
                  <span>800 mL</span>
                </div>
              </div>

              {/* Respiratory Rate */}
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex flex-col justify-between">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-400 text-[11px]">Set Rate (RR):</span>
                  <span className="font-bold text-sky-400 text-sm">{vent.setRR} bpm</span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="35"
                  step="1"
                  value={vent.setRR}
                  onChange={(e) => onUpdateVent({ setRR: parseInt(e.target.value) })}
                  className="w-full accent-sky-400 my-1"
                />
                <div className="flex justify-between text-[9px] font-mono text-slate-500">
                  <span>6 bpm</span>
                  <span className="text-sky-300 font-bold">MV: {minuteVol} L</span>
                  <span>35 bpm</span>
                </div>
              </div>

              {/* PEEP */}
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex flex-col justify-between">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-400 text-[11px]">PEEP:</span>
                  <span className="font-bold text-emerald-400 text-sm">{vent.peep} cmH2O</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="16"
                  step="1"
                  value={vent.peep}
                  onChange={(e) => onUpdateVent({ peep: parseInt(e.target.value) })}
                  className="w-full accent-emerald-400 my-1"
                />
                <div className="flex gap-1 mt-1">
                  {[0, 5, 8, 10, 12].map((p) => (
                    <button
                      key={p}
                      onClick={() => onUpdateVent({ peep: p })}
                      className={`flex-1 py-0.5 rounded text-[9px] font-mono font-bold ${
                        vent.peep === p ? 'bg-emerald-500 text-black' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pmax Pressure Limit */}
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex flex-col justify-between">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-400 text-[11px]">Pmax Limit:</span>
                  <span className="font-bold text-amber-400 text-sm">{vent.pmax} cmH2O</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="60"
                  step="5"
                  value={vent.pmax}
                  onChange={(e) => onUpdateVent({ pmax: parseInt(e.target.value) })}
                  className="w-full accent-amber-400 my-1"
                />
                <div className="flex justify-between text-[9px] font-mono text-slate-500">
                  <span>20 cmH2O</span>
                  <span>Limit</span>
                  <span>60 cmH2O</span>
                </div>
              </div>
            </div>

            {/* I:E Ratio */}
            <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-slate-300">I:E Ratio:</span>
                <p className="text-[10px] text-slate-400 font-mono">
                  {isBronchospasm ? '⚠️ Bronchospasm active! Set 1:3 or 1:4 to allow expiration.' : 'Standard 1:2.'}
                </p>
              </div>

              <div className="flex gap-1.5">
                {(['1:1', '1:2', '1:3', '1:4'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => onUpdateVent({ ieRatio: ratio })}
                    className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all ${
                      vent.ieRatio === ratio
                        ? 'bg-amber-500 text-black shadow-md'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* NEW: LIVE CLINICAL VENTILATOR SETUP EVALUATION */}
          {/* ======================================================== */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase text-slate-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Live Ventilator Setup Evaluation</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase ${
                overallRating === 'Optimal'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                  : overallRating === 'Suboptimal'
                  ? 'bg-amber-950 text-amber-300 border border-amber-600'
                  : 'bg-red-950 text-red-300 border border-red-600 animate-pulse'
              }`}>
                {overallRating === 'Optimal' ? '⭐ LUNG-PROTECTIVE SETUP' : overallRating === 'Suboptimal' ? '⚠️ SUBOPTIMAL SETUP' : '🚨 CRITICAL VENT HAZARD'}
              </span>
            </div>

            {/* Checklist of Evaluated Parameters */}
            <div className="grid grid-cols-2 gap-1.5 text-[10.5px] font-mono">
              
              {/* Tidal Volume Evaluation */}
              <div className={`p-1.5 rounded border flex items-center gap-1.5 ${
                vtStatus === 'good' ? 'bg-emerald-950/30 border-emerald-900/60 text-emerald-300' :
                vtStatus === 'warn' ? 'bg-amber-950/40 border-amber-700 text-amber-300' :
                'bg-red-950/60 border-red-600 text-red-200 animate-pulse'
              }`}>
                {vtStatus === 'good' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />}
                <span className="leading-tight">{vtLabel}</span>
              </div>

              {/* Minute Ventilation Evaluation */}
              <div className={`p-1.5 rounded border flex items-center gap-1.5 ${
                mvStatus === 'good' ? 'bg-emerald-950/30 border-emerald-900/60 text-emerald-300' :
                mvStatus === 'warn' ? 'bg-amber-950/40 border-amber-700 text-amber-300' :
                'bg-red-950/60 border-red-600 text-red-200 animate-pulse'
              }`}>
                {mvStatus === 'good' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />}
                <span className="leading-tight">{mvLabel}</span>
              </div>

              {/* PEEP Evaluation */}
              <div className={`p-1.5 rounded border flex items-center gap-1.5 ${
                peepStatus === 'good' ? 'bg-emerald-950/30 border-emerald-900/60 text-emerald-300' :
                peepStatus === 'warn' ? 'bg-amber-950/40 border-amber-700 text-amber-300' :
                'bg-red-950/60 border-red-600 text-red-200 animate-pulse'
              }`}>
                {peepStatus === 'good' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />}
                <span className="leading-tight">{peepLabel}</span>
              </div>

              {/* I:E Ratio Evaluation */}
              <div className={`p-1.5 rounded border flex items-center gap-1.5 ${
                ieStatus === 'good' ? 'bg-emerald-950/30 border-emerald-900/60 text-emerald-300' :
                'bg-amber-950/40 border-amber-700 text-amber-300'
              }`}>
                {ieStatus === 'good' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />}
                <span className="leading-tight">{ieLabel}</span>
              </div>

            </div>

            {/* Attending Recommendations Bar */}
            <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono flex items-start gap-2">
              <Activity className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div className="text-slate-300 leading-relaxed">
                {!vent.powerOn ? (
                  <span className="text-red-400 font-bold">
                    Ventilator Power is currently OFF. Click "POWER: ON" in the header to activate mechanical ventilation.
                  </span>
                ) : overallRating === 'Optimal' ? (
                  <span className="text-emerald-300">
                    Current settings follow standard ARDSNet lung-protective guidelines (6-8 mL/kg PBW, physiologic PEEP). PaCO2 and oxygenation will remain stable.
                  </span>
                ) : vtStatus === 'crit' ? (
                  <span className="text-red-300 font-semibold">
                    Reduce Tidal Volume down to {Math.round(patientWeightKg * 7)} mL (7 mL/kg) to prevent alveolar shear stress and hypotension.
                  </span>
                ) : mvStatus === 'crit' ? (
                  <span className="text-amber-300 font-semibold">
                    Increase Respiratory Rate or Tidal Volume to reach at least 5.0 L/min minute volume to avoid severe respiratory acidosis.
                  </span>
                ) : peepStatus === 'warn' ? (
                  <span className="text-amber-300 font-semibold">
                    Set PEEP to 5 cmH2O to prevent end-expiratory atelectasis and shunt.
                  </span>
                ) : (
                  <span className="text-slate-300">
                    Titrate settings to maintain EtCO2 between 35-40 mmHg and PIP &lt; 30 cmH2O.
                  </span>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
