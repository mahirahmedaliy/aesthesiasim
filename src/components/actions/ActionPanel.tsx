import React, { useState } from 'react';
import {
  DynamicPhysiology,
  VentilatorState,
  PatientProfile,
  PerioperativePhase,
  AirwayDevice,
  ActiveDrugEffect,
  VentMode,
} from '../../types/simulator';
import { SIMULATOR_DRUGS, SimulatorDrug, checkIntubationReadiness } from '../../data/medications';
import {
  Syringe,
  Wind,
  Droplets,
  Activity,
  ClipboardList,
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ArrowRight,
  Flame,
  Stethoscope,
  Heart,
  Sliders,
  Gauge,
  ChevronDown,
  ChevronUp,
  Power,
} from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

interface ActionPanelProps {
  phys: DynamicPhysiology;
  vent: VentilatorState;
  patient: PatientProfile;
  phase: PerioperativePhase;
  activeDrugs?: ActiveDrugEffect[];
  onAdministerDrug: (drug: SimulatorDrug, dose: number, route: string) => void;
  onUpdateAirway: (updates: Partial<DynamicPhysiology>, actionTitle: string, actionDetail: string) => void;
  onUpdateVent?: (updates: Partial<VentilatorState>) => void;
  onAdministerFluid: (type: string, volumeMl: number) => void;
  onTriggerMonitoring: (action: string) => void;
  onAdvancePhase: () => void;
  onAskSurgeonPause: () => void;
  onCallForHelp: () => void;
  canAdvancePhase: boolean;
  advancePhaseReason?: string;
  isLeakTestDone?: boolean;
  isLeakTesting?: boolean;
  onRunLeakTest?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  drawerHeight?: 'compact' | 'normal' | 'expanded';
  onSetDrawerHeight?: (height: 'compact' | 'normal' | 'expanded') => void;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  phys,
  vent,
  patient,
  phase,
  activeDrugs = [],
  onAdministerDrug,
  onUpdateAirway,
  onUpdateVent,
  onAdministerFluid,
  onTriggerMonitoring,
  onAdvancePhase,
  onAskSurgeonPause,
  onCallForHelp,
  canAdvancePhase,
  advancePhaseReason,
  isLeakTestDone = false,
  isLeakTesting = false,
  onRunLeakTest,
  isCollapsed = false,
  onToggleCollapse,
  drawerHeight = 'normal',
  onSetDrawerHeight,
}) => {
  const [activeTab, setActiveTab] = useState<
    'medications' | 'airway' | 'fluids' | 'monitoring' | 'assessment' | 'safety'
  >('medications');
  const [airwaySubTab, setAirwaySubTab] = useState<'devices' | 'ventilator'>('devices');

  const handleTabClick = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (isCollapsed && onToggleCollapse) {
      onToggleCollapse();
    }
  };

  const intubationReadiness = checkIntubationReadiness(phys, patient, activeDrugs);

  // Medication Tab State
  const [selectedDrug, setSelectedDrug] = useState<SimulatorDrug>(SIMULATOR_DRUGS[0]);
  const [selectedDose, setSelectedDose] = useState<number>(SIMULATOR_DRUGS[0].quickDoses[0] || 100);
  const [customDose, setCustomDose] = useState<string>('');
  const [selectedRoute, setSelectedRoute] = useState<string>(SIMULATOR_DRUGS[0].defaultRoute);
  const [drugSearch, setDrugSearch] = useState<string>('');
  const [drugCategoryFilter, setDrugCategoryFilter] = useState<string>('All');
  const [medSuccessFeedback, setMedSuccessFeedback] = useState<string | null>(null);

  // Airway Tab State
  const [ettSize, setEttSize] = useState<number>(7.5);
  const [ettDepth, setEttDepth] = useState<number>(21);

  // Fluids Tab State
  const [fluidType, setFluidType] = useState<string>('Normal Saline');
  const [fluidVolume, setFluidVolume] = useState<number>(500);

  // Drugs filtered
  const filteredDrugs = SIMULATOR_DRUGS.filter((d) => {
    const matchesCat = drugCategoryFilter === 'All' || d.category === drugCategoryFilter;
    const matchesSearch = d.name.toLowerCase().includes(drugSearch.toLowerCase()) ||
                          d.description.toLowerCase().includes(drugSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleSelectDrug = (drug: SimulatorDrug) => {
    setSelectedDrug(drug);
    setSelectedDose(drug.quickDoses[0] || 100);
    setCustomDose('');
    setSelectedRoute(drug.defaultRoute);
  };

  const handleGiveDrug = () => {
    const finalDose = customDose ? parseFloat(customDose) : selectedDose;
    if (isNaN(finalDose) || finalDose <= 0) return;

    onAdministerDrug(selectedDrug, finalDose, selectedRoute);
    audioEngine.playActionChime(true);

    setMedSuccessFeedback(`GIVEN: ${finalDose} ${selectedDrug.unit} ${selectedDrug.name} (${selectedRoute})`);
    setTimeout(() => setMedSuccessFeedback(null), 2500);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-2 border-slate-800 rounded-xl shadow-2xl overflow-hidden font-sans select-none">
      
      {/* Top Action Tabs */}
      <div className="bg-slate-950 px-2 lg:px-3 py-1.5 border-b border-slate-800 flex items-center justify-between shrink-0 overflow-x-auto gap-2">
        <div className="flex items-center gap-1 shrink-0">
          {/* Quick Collapse / Expand Toggle Button */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0 ${
                isCollapsed
                  ? 'bg-teal-600/30 text-teal-300 border-teal-500/50 hover:bg-teal-600/40 animate-pulse'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
              title={isCollapsed ? 'Expand Actions drawer' : 'Collapse panel to maximize Patient Monitor display'}
            >
              {isCollapsed ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-teal-300" />
                  <span className="hidden sm:inline">Actions</span>
                  <span className="text-[9px] bg-teal-500 text-slate-950 px-1 py-0.2 rounded font-extrabold uppercase">Open</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Collapse</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => handleTabClick('medications')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'medications' && !isCollapsed
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Syringe className="w-3.5 h-3.5" />
            <span>Medications</span>
          </button>

          <button
            onClick={() => handleTabClick('airway')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'airway' && !isCollapsed
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Wind className="w-3.5 h-3.5" />
            <span>Airway &amp; Vent</span>
          </button>

          <button
            onClick={() => handleTabClick('fluids')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'fluids' && !isCollapsed
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>Fluids &amp; Blood</span>
          </button>

          <button
            onClick={() => handleTabClick('monitoring')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'monitoring' && !isCollapsed
                ? 'bg-sky-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Monitoring &amp; Labs</span>
          </button>

          <button
            onClick={() => handleTabClick('assessment')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'assessment' && !isCollapsed
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Assessment &amp; NPO</span>
          </button>

          <button
            onClick={() => handleTabClick('safety')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'safety' && !isCollapsed
                ? 'bg-amber-600 text-black shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Safety &amp; CPR</span>
          </button>
        </div>

        {/* Right side controls: Drawer Size + Advance Phase */}
        <div className="flex items-center gap-2 shrink-0">
          {!isCollapsed && onSetDrawerHeight && drawerHeight && (
            <div className="hidden lg:flex items-center gap-0.5 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px] font-mono">
              <span className="text-slate-500 px-1 font-bold">Height:</span>
              {(['compact', 'normal', 'expanded'] as const).map((sz) => (
                <button
                  key={sz}
                  onClick={() => onSetDrawerHeight(sz)}
                  className={`px-1.5 py-0.5 rounded font-bold capitalize transition-all ${
                    drawerHeight === sz ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`${sz} drawer height`}
                >
                  {sz === 'compact' ? 'S' : sz === 'normal' ? 'M' : 'L'}
                </button>
              ))}
            </div>
          )}

          {/* Phase Progression Trigger */}
          <button
            onClick={onAdvancePhase}
            disabled={!canAdvancePhase}
            title={canAdvancePhase ? 'Proceed to next perioperative phase' : advancePhaseReason || 'Complete required phase actions first'}
            className={`px-3 py-1 rounded-lg font-mono text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              canAdvancePhase
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950 animate-pulse'
                : 'bg-slate-800 text-slate-400 border border-slate-700/80 cursor-not-allowed opacity-90'
            }`}
          >
            <span className="hidden sm:inline">
              {canAdvancePhase ? 'Complete Phase Steps & Proceed' : advancePhaseReason || 'Phase Incomplete'}
            </span>
            <span className="sm:hidden">
              {canAdvancePhase ? 'Next Phase' : 'Locked'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className={`flex-1 min-h-0 overflow-y-auto p-2 lg:p-3 ${isCollapsed ? 'hidden' : ''}`}>
        
        {/* ======================================================== */}
        {/* TAB 1: MEDICATIONS */}
        {/* ======================================================== */}
        {activeTab === 'medications' && (
          <div className="grid grid-cols-12 gap-3 h-full min-h-0">
            {/* Left 5 Cols: Drug List */}
            <div className="col-span-5 flex flex-col bg-slate-950/60 rounded-xl border border-slate-800 p-2 min-h-0">
              {/* Category Pills Filter */}
              <div className="flex gap-1 overflow-x-auto pb-1.5 mb-1.5 text-[10px] font-mono">
                {[
                  'All',
                  'Induction & Hypnotics',
                  'Opioids',
                  'Muscle Relaxants',
                  'Reversal Agents',
                  'Vasopressors & Inotropes',
                  'Antihypertensives & Antiarrhythmics',
                  'Anticholinergics',
                  'Antiemetics',
                  'Emergency & Resuscitation',
                  'Analgesics',
                  'Local Anesthetics',
                  'Benzodiazepines',
                ].map((cat) => {
                  const label =
                    cat === 'All'
                      ? 'ALL'
                      : cat === 'Induction & Hypnotics'
                      ? 'Induction'
                      : cat === 'Muscle Relaxants'
                      ? 'Relaxants'
                      : cat === 'Reversal Agents'
                      ? 'Reversal'
                      : cat === 'Vasopressors & Inotropes'
                      ? 'Vasopressors'
                      : cat === 'Antihypertensives & Antiarrhythmics'
                      ? 'Anti-HTN'
                      : cat === 'Emergency & Resuscitation'
                      ? 'Emergency'
                      : cat === 'Local Anesthetics'
                      ? 'Local'
                      : cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setDrugCategoryFilter(cat)}
                      className={`px-2 py-0.5 rounded whitespace-nowrap transition-all border cursor-pointer ${
                        drugCategoryFilter === cat
                          ? 'bg-purple-600 border-purple-400 text-white font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search drug..."
                  value={drugSearch}
                  onChange={(e) => setDrugSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                {filteredDrugs.map((d) => {
                  const isSelected = selectedDrug.id === d.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => handleSelectDrug(d)}
                      className={`w-full text-left p-2 rounded-lg text-xs font-mono transition-all border flex items-center justify-between ${
                        isSelected
                          ? 'bg-purple-950/80 border-purple-400 text-purple-200 font-bold shadow-md'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{d.name}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-purple-300">
                        {d.category.split('&')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right 7 Cols: Dosing & Pharmacodynamics */}
            <div className="col-span-7 flex flex-col justify-between bg-slate-950/60 rounded-xl border border-slate-800 p-2 lg:p-2.5 min-h-0 h-full overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm lg:text-base font-bold text-purple-300">{selectedDrug.name}</h3>
                    <p className="text-[10px] text-slate-400 font-mono">{selectedDrug.category}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 text-[10px] font-mono border border-purple-800">
                    Onset: {selectedDrug.onsetSec}s | Duration: {Math.round(selectedDrug.durationSec / 60)}m
                  </span>
                </div>

                <p className="text-[11px] lg:text-xs text-slate-300 leading-relaxed font-sans">
                  {selectedDrug.description}
                </p>

                {/* Patient Specific Warning */}
                {selectedDrug.patientWarning && selectedDrug.patientWarning(patient) && (
                  <div className="p-1.5 rounded-lg bg-amber-950/60 border border-amber-600/80 text-[10px] text-amber-200 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{selectedDrug.patientWarning(patient)}</span>
                  </div>
                )}

                {/* Weight-Based Calculation Helper */}
                {selectedDrug.mgPerKgMin && (
                  <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300 flex items-center justify-between">
                    <span>Recommended for {patient.name} ({patient.weightKg} kg):</span>
                    <span className="font-bold text-purple-300">
                      {Math.round(selectedDrug.mgPerKgMin * patient.weightKg)} - {Math.round((selectedDrug.mgPerKgMax || selectedDrug.mgPerKgMin) * patient.weightKg)} {selectedDrug.unit}
                    </span>
                  </div>
                )}

                {/* Quick Dose Presets */}
                <div>
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1">
                    Select Dose ({selectedDrug.unit}):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {selectedDrug.quickDoses.map((dose) => (
                      <button
                        key={dose}
                        onClick={() => {
                          setSelectedDose(dose);
                          setCustomDose('');
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border transition-all ${
                          selectedDose === dose && !customDose
                            ? 'bg-purple-600 border-purple-300 text-white shadow-md'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {dose} {selectedDrug.unit}
                      </button>
                    ))}
                  </div>

                  {/* Custom Dose */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-400">Custom:</span>
                    <input
                      type="number"
                      step="any"
                      placeholder={`Amount...`}
                      value={customDose}
                      onChange={(e) => setCustomDose(e.target.value)}
                      className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                    />
                    <span className="text-xs font-mono text-slate-400">{selectedDrug.unit}</span>
                  </div>
                </div>

                {/* Route */}
                <div>
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1">Route:</span>
                  <div className="flex gap-1.5">
                    {selectedDrug.routes.map((rt) => (
                      <button
                        key={rt}
                        onClick={() => setSelectedRoute(rt)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all ${
                          selectedRoute === rt
                            ? 'bg-purple-700 border-purple-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {rt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* GIVE MEDICATION BUTTON (PINNED AT BOTTOM) */}
              <div className="pt-2 border-t border-slate-800 shrink-0">
                {medSuccessFeedback ? (
                  <div className="w-full py-2 rounded-xl bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-lg animate-bounce">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{medSuccessFeedback}</span>
                  </div>
                ) : (
                  <button
                    onClick={handleGiveDrug}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs font-mono shadow-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border border-purple-400 cursor-pointer"
                  >
                    <Syringe className="w-4 h-4" />
                    <span>
                      GIVE {customDose || selectedDose} {selectedDrug.unit} {selectedDrug.name.toUpperCase()} ({selectedRoute})
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ======================================================== */}
        {/* TAB 2: AIRWAY & VENTILATION */}
        {/* ======================================================== */}
        {activeTab === 'airway' && (
          <div className="space-y-3 font-mono text-xs">
            {/* Airway Sub-Navigation */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <button
                onClick={() => setAirwaySubTab('devices')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  airwaySubTab === 'devices'
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Wind className="w-3.5 h-3.5" />
                <span>1. Airway Devices &amp; Intubation</span>
              </button>

              <button
                onClick={() => setAirwaySubTab('ventilator')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  airwaySubTab === 'ventilator'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>2. Ventilator Setup &amp; Parameters</span>
                {phys.airwayDevice === 'ett' && vent.bagVentSwitch === 'bag' && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping ml-1" />
                )}
              </button>
            </div>

            {/* SUB-TAB A: AIRWAY DEVICES & INTUBATION */}
            {airwaySubTab === 'devices' && (
              <div className="space-y-3">
                {/* Airway Device Control Grid */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="font-bold text-teal-400 uppercase block">Non-Invasive Airway Devices:</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => onUpdateAirway({ airwayDevice: 'face_mask', preoxygenationLevel: 100 }, 'Pre-oxygenate 100% O2', 'Tight face mask applied with 100% FiO2 at 12 L/min.')}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-teal-500 text-left"
                    >
                      <span className="font-bold text-teal-300 block">Tight Face Mask 100% O2</span>
                      <span className="text-[10px] text-slate-400">Denitrogenate FRC</span>
                    </button>

                    <button
                      onClick={() => onUpdateAirway({ airwayDevice: 'opa' }, 'Insert Oral Airway (Guedel)', 'Relieves tongue soft-tissue obstruction in unconscious patient.')}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-teal-500 text-left"
                    >
                      <span className="font-bold text-teal-300 block">Oral Airway (OPA)</span>
                      <span className="text-[10px] text-slate-400">Size 90-100mm Guedel</span>
                    </button>

                    <button
                      onClick={() => onUpdateAirway({ airwayDevice: 'lma', airwayPatency: 'patent' }, 'Insert Laryngeal Mask (LMA)', 'Supraglottic airway seated over larynx.')}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-teal-500 text-left"
                    >
                      <span className="font-bold text-teal-300 block">LMA (Size 4/5)</span>
                      <span className="text-[10px] text-slate-400">Supraglottic seal</span>
                    </button>
                  </div>
                </div>

                {/* Tracheal Intubation */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-teal-400 uppercase">Endotracheal Intubation (ETT):</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                      intubationReadiness.canIntubate
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                        : 'bg-red-950 text-red-300 border-red-600 animate-pulse'
                    }`}>
                      {intubationReadiness.canIntubate ? '✅ READY FOR INTUBATION' : '⚠️ INDUCTION & RELAXANT REQUIRED'}
                    </span>
                  </div>

                  {/* Real-Time Induction & Relaxation Checklist */}
                  <div className="p-2.5 rounded-lg border bg-slate-900/90 space-y-1.5 text-[11px] font-mono">
                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                      {/* Check 1: Hypnotic */}
                      <div className={`p-1.5 rounded border flex flex-col justify-between ${
                        intubationReadiness.hypnoticOk
                          ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300'
                          : 'bg-red-950/40 border-red-700 text-red-300'
                      }`}>
                        <span className="font-bold flex items-center gap-1">
                          {intubationReadiness.hypnoticOk ? '✅' : '❌'} 1. Hypnotic Depth
                        </span>
                        <span className="truncate">
                          {intubationReadiness.hypnoticOk
                            ? `BIS ${phys.bis} (Unconscious)`
                            : phys.bis > 75
                            ? `Awake (BIS ${phys.bis})`
                            : `Sub-therapeutic (${phys.bis})`}
                        </span>
                      </div>

                      {/* Check 2: Muscle Relaxation */}
                      <div className={`p-1.5 rounded border flex flex-col justify-between ${
                        intubationReadiness.relaxantOk
                          ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300'
                          : 'bg-red-950/40 border-red-700 text-red-300'
                      }`}>
                        <span className="font-bold flex items-center gap-1">
                          {intubationReadiness.relaxantOk ? '✅' : '❌'} 2. Muscle Relaxant
                        </span>
                        <span className="truncate">
                          {intubationReadiness.relaxantOk
                            ? `Paralyzed (TOF ${phys.tofCount ?? phys.trainOfFour ?? 0}/4)`
                            : `TOF ${phys.tofCount ?? phys.trainOfFour ?? 4}/4 (Active)`}
                        </span>
                      </div>

                      {/* Check 3: Preoxygenation */}
                      <div className={`p-1.5 rounded border flex flex-col justify-between ${
                        intubationReadiness.preoxOk
                          ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300'
                          : 'bg-amber-950/40 border-amber-700 text-amber-300'
                      }`}>
                        <span className="font-bold flex items-center gap-1">
                          {intubationReadiness.preoxOk ? '✅' : '⚠️'} 3. Pre-oxygenation
                        </span>
                        <span>{phys.preoxygenationLevel}% Denitrogenated</span>
                      </div>
                    </div>

                    {!intubationReadiness.canIntubate && (
                      <div className="p-1.5 rounded bg-amber-950/40 border border-amber-700/60 text-[10px] text-amber-300 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{intubationReadiness.message}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-slate-400 block mb-1">ETT Size (ID mm):</label>
                      <select
                        value={ettSize}
                        onChange={(e) => setEttSize(parseFloat(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                      >
                        {[5.0, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5].map((s) => (
                          <option key={s} value={s}>{s} mm</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Depth at Teeth (cm):</label>
                      <select
                        value={ettDepth}
                        onChange={(e) => setEttDepth(parseInt(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                      >
                        {[18, 19, 20, 21, 22, 23, 24, 25].map((d) => (
                          <option key={d} value={d}>{d} cm (teeth)</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => onUpdateAirway({
                        airwayDevice: 'ett',
                        airwayPatency: ettDepth >= 24 ? 'endobronchial_intubated' : 'intubated',
                        ettSize,
                        ettDepthCm: ettDepth,
                        cuffPressureCmH2o: 24,
                        breathSounds: ettDepth >= 24 ? 'Absent Left / Endobronchial Right' : 'Normal Bilateral',
                      }, 'Video Laryngoscopy Intubation', `Intubation attempted with ${ettSize}mm ETT at ${ettDepth}cm.`)}
                      className={`p-2.5 rounded-xl font-bold flex flex-col items-center justify-center gap-0.5 shadow-md active:scale-95 cursor-pointer transition-all ${
                        intubationReadiness.canIntubate
                          ? 'bg-teal-600 hover:bg-teal-500 text-white shadow-teal-900/30'
                          : 'bg-red-950/80 hover:bg-red-900 border border-red-600 text-red-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-amber-300" />
                        <span>Video Laryngoscopy (GlideScope)</span>
                      </div>
                      {!intubationReadiness.canIntubate && (
                        <span className="text-[9px] text-red-400 font-normal">⚠️ Attempt will fail & trigger laryngospasm</span>
                      )}
                    </button>

                    <button
                      onClick={() => onUpdateAirway({
                        airwayDevice: 'ett',
                        airwayPatency: 'intubated',
                        ettSize,
                        ettDepthCm: ettDepth,
                        cuffPressureCmH2o: 24,
                      }, 'Direct Mac 3 Laryngoscopy', `Intubation attempted with ${ettSize}mm ETT at ${ettDepth}cm.`)}
                      className={`p-2.5 rounded-xl font-bold flex flex-col items-center justify-center gap-0.5 border cursor-pointer transition-all ${
                        intubationReadiness.canIntubate
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                          : 'bg-red-950/50 hover:bg-red-900/60 text-red-300 border-red-800'
                      }`}
                    >
                      <span className="text-xs">Direct Mac 3 Blade</span>
                      {!intubationReadiness.canIntubate && (
                        <span className="text-[9px] text-red-400 font-normal">⚠️ Uninduced / Active cords</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Prompt to configure ventilator when intubated */}
                {phys.airwayDevice === 'ett' && (
                  <div className="p-2.5 rounded-xl bg-gradient-to-r from-sky-950/80 to-blue-950/80 border border-sky-600/60 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-sky-400" />
                      <div>
                        <span className="font-bold text-sky-200 block text-xs">Patient Intubated! Next Step: Ventilator Setup</span>
                        <span className="text-[10px] text-sky-300/80">Configure Tidal Volume (6-8 mL/kg), RR, and PEEP.</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setAirwaySubTab('ventilator')}
                      className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1 shadow-md"
                    >
                      <span>Open Setup</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Suction & Extubation */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onUpdateAirway({}, 'Deep Tracheal & Pharyngeal Suction', 'Catheter evacuated secretions.')}
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 font-bold"
                  >
                    Pass Yankauer / Tracheal Suction
                  </button>

                  <button
                    onClick={() => {
                      onUpdateAirway({ airwayDevice: 'none' }, 'Tracheal Extubation', 'Tracheal extubation performed.');
                    }}
                    className={`p-2.5 rounded-xl border font-bold transition-all ${
                      phys.tofCount === 4 && phys.muscleTonePercent >= 75
                        ? 'bg-purple-900/60 border-purple-700 hover:bg-purple-800 text-purple-200'
                        : 'bg-red-950/80 border-red-600 hover:bg-red-900 text-red-200'
                    }`}
                  >
                    <span>Extubate Trachea</span>
                    {phys.tofCount < 4 && (
                      <span className="block text-[9px] text-red-300 font-normal">⚠️ TOF {phys.tofCount}/4 (Paralyzed! Reverse with Sugammadex/Neostigmine)</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* SUB-TAB B: MECHANICAL VENTILATOR SETUP & PARAMETERS */}
            {airwaySubTab === 'ventilator' && (
              <div className="space-y-3">
                {/* 1. Real-Time Physiological Ventilator Impact Banner */}
                {(() => {
                  const mlPerKg = vent.setVt / Math.max(15, patient.weightKg);
                  const deadSpaceMl = Math.round(patient.weightKg * 2.2);
                  const mv = (vent.setVt * vent.setRR) / 1000;

                  if (!vent.powerOn) {
                    return (
                      <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-600 text-red-200 flex items-start gap-2 shadow-lg animate-pulse">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-xs uppercase block text-red-300">
                            🚨 VENTILATOR MASTER POWER IS OFF (STANDBY)!
                          </span>
                          <span className="text-[11px] text-red-200">
                            The ventilator is currently powered off. No mechanical breaths are delivered. Click "POWER: ON" below or on the machine workstation to activate ventilation.
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (vent.bagVentSwitch === 'bag' && phys.airwayDevice === 'ett') {
                    return (
                      <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-600 text-red-200 flex items-start gap-2 shadow-lg animate-pulse">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-xs uppercase block text-red-300">
                            🚨 APNEA ALARM: Ventilator is in MANUAL/BAG Mode!
                          </span>
                          <span className="text-[11px] text-red-200">
                            Patient is intubated but ventilator auto-delivery is off (Delivered Vt = 0 mL, Minute Volume = 0 L/min). EtCO2 will drop to 0 and SpO2 will crash. Switch to VENTILATOR AUTO immediately!
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (vent.liveFio2 < 21) {
                    return (
                      <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-600 text-red-200 flex items-start gap-2 shadow-lg animate-pulse">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-xs uppercase block text-red-300">
                            🚨 HYPOXIC GAS MIXTURE ALARM (FiO2 {vent.liveFio2}%)!
                          </span>
                          <span className="text-[11px] text-red-200">
                            Delivered oxygen is sub-atmospheric! Patient will suffer hypoxic arrest within minutes. Increase O2 flow immediately!
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (mlPerKg > 10.0 || vent.livePip > 38) {
                    return (
                      <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-600 text-red-200 flex items-start gap-2 shadow-lg">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-xs uppercase block text-red-300">
                            🚨 VOLUTRAUMA &amp; VENOUS RETURN COMPRESSION ({mlPerKg.toFixed(1)} mL/kg, PIP {vent.livePip} cmH2O)!
                          </span>
                          <span className="text-[11px] text-red-200">
                            Excessive tidal volume creates dangerous intrathoracic pressure, collapsing the vena cava, dropping cardiac preload and inducing hypotension (MAP {Math.round(phys.map)} mmHg). Reduce Vt to 6-8 mL/kg!
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (vent.setVt <= deadSpaceMl + 50) {
                    return (
                      <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-600 text-red-200 flex items-start gap-2 shadow-lg">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-xs uppercase block text-red-300">
                            🚨 SEVERE ALVEOLAR HYPOVENTILATION (Vt {vent.setVt} mL ≤ Dead Space {deadSpaceMl} mL)!
                          </span>
                          <span className="text-[11px] text-red-200">
                            Delivered volume barely clears anatomical dead space! Alveolar minute ventilation is near zero. Patient is in acute respiratory acidosis (EtCO2 {phys.etco2} mmHg, pH {phys.ph}). Increase Vt or RR!
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (mv > 11.0) {
                    return (
                      <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-600 text-amber-200 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-xs uppercase block text-amber-300">
                            ⚠️ SEVERE HYPERVENTILATION (Minute Volume {mv.toFixed(1)} L/min)!
                          </span>
                          <span className="text-[11px] text-amber-200">
                            Patient is blowing off too much CO2 (EtCO2 {phys.etco2} mmHg, pH {phys.ph}), inducing respiratory alkalosis and cerebral vasoconstriction. Decrease RR or Tidal Volume.
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (vent.peep < 4 && (patient.bmi > 30 || phase === 'maintenance')) {
                    return (
                      <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-600 text-amber-200 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-xs uppercase block text-amber-300">
                            ⚠️ ATELECTASIS / SHUNT RISK (PEEP is {vent.peep} cmH2O)!
                          </span>
                          <span className="text-[11px] text-amber-200">
                            Inadequate PEEP for {patient.bmi > 30 ? 'obesity (BMI ' + patient.bmi + ')' : 'surgical positioning'}. Dependent airways collapse, causing intrapulmonary shunt and desaturation (SpO2 {Math.round(phys.spo2)}%). Increase PEEP to 6-10 cmH2O.
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (vent.peep > 12) {
                    return (
                      <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-600 text-amber-200 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-xs uppercase block text-amber-300">
                            ⚠️ HIGH PEEP WARNING ({vent.peep} cmH2O)
                          </span>
                          <span className="text-[11px] text-amber-200">
                            PEEP &gt; 12 cmH2O increases mean intrathoracic pressure, impeding venous return and lowering cardiac output. Monitor blood pressure closely.
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-600 text-emerald-200 flex items-start gap-2 shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-xs uppercase block text-emerald-300">
                          ✅ LUNG-PROTECTIVE VENTILATION ACTIVE ({mlPerKg.toFixed(1)} mL/kg, PEEP {vent.peep} cmH2O)
                        </span>
                        <span className="text-[11px] text-emerald-200">
                          Parameters are in the protective range for {patient.name} ({patient.weightKg} kg). Alveoli recruited without barotrauma or dead-space acidosis.
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* 2. Master Switch & Mode Control Grid */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1.5">
                    <span className="font-bold text-sky-400 uppercase">Master Workstation Power &amp; Mode</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {onRunLeakTest && (
                        <button
                          onClick={onRunLeakTest}
                          disabled={isLeakTesting}
                          className={`px-2 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all ${
                            isLeakTesting
                              ? 'bg-amber-600 text-white animate-pulse'
                              : isLeakTestDone
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400 animate-pulse'
                          }`}
                          title="Run automated pre-use workstation leak check"
                        >
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>{isLeakTesting ? 'Testing (30 cmH2O)...' : isLeakTestDone ? '✓ Leak Test: Pass' : '▶ Run Leak Test'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          const nextPower = !vent.powerOn;
                          onUpdateVent?.({
                            powerOn: nextPower,
                            ...(nextPower ? {} : { liveDeliveredVt: 0, liveMinuteVolume: 0, livePip: 0, livePplat: 0 }),
                          });
                          audioEngine.playActionChime(nextPower);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all ${
                          vent.powerOn
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'bg-red-950 text-red-300 border border-red-700 animate-pulse'
                        }`}
                        title={vent.powerOn ? 'Click to turn OFF ventilator' : 'Click to turn ON ventilator'}
                      >
                        <Power className="w-3 h-3" />
                        <span>{vent.powerOn ? 'POWER: ON' : 'POWER: OFF'}</span>
                      </button>

                      <button
                        onClick={() => onUpdateVent?.({ bagVentSwitch: 'bag' })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                          vent.bagVentSwitch === 'bag'
                            ? 'bg-amber-600 text-black shadow-md'
                            : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        BAG / MANUAL
                      </button>
                      <button
                        onClick={() => onUpdateVent?.({ bagVentSwitch: 'vent', powerOn: true })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                          vent.bagVentSwitch === 'vent'
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        VENT AUTO
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {(['VCV', 'PCV', 'SIMV', 'PSV'] as VentMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => onUpdateVent?.({ mode: m, bagVentSwitch: 'vent', powerOn: true })}
                        className={`py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                          vent.mode === m && vent.bagVentSwitch === 'vent'
                            ? 'bg-sky-600 border-sky-400 text-white shadow-md'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Tidal Volume (Vt) Settings with Live mL/kg and Dead Space Warning */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sky-300 block">Set Tidal Volume (Vt):</span>
                      <span className="text-[10px] text-slate-400">
                        Target 6-8 mL/kg = {Math.round(patient.weightKg * 6)} - {Math.round(patient.weightKg * 8)} mL for {patient.name} ({patient.weightKg}kg)
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black text-sky-400">{vent.setVt} mL</span>
                      <span className="text-[10px] font-bold text-slate-400 block">
                        ({(vent.setVt / patient.weightKg).toFixed(1)} mL/kg)
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="150"
                    max="900"
                    step="25"
                    value={vent.setVt}
                    onChange={(e) => onUpdateVent?.({ setVt: parseInt(e.target.value) })}
                    className="w-full accent-sky-400"
                  />

                  {/* Quick Vt Presets */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 self-center mr-1">Presets:</span>
                    {[200, 350, 450, 500, 600, 750, 900].map((vtVal) => (
                      <button
                        key={vtVal}
                        onClick={() => onUpdateVent?.({ setVt: vtVal })}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-all ${
                          vent.setVt === vtVal
                            ? 'bg-sky-600 border-sky-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {vtVal} mL
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Respiratory Rate (RR) and Minute Volume */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sky-300 block">Set Respiratory Rate (RR):</span>
                      <span className="text-[10px] text-slate-400">
                        Calculated Minute Volume: {((vent.setVt * vent.setRR) / 1000).toFixed(1)} L/min (Target: ~5.0 - 7.5 L/min)
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black text-sky-400">{vent.setRR} bpm</span>
                      <span className="text-[10px] font-bold text-slate-400 block">
                        MV: {((vent.setVt * vent.setRR) / 1000).toFixed(1)} L/min
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="4"
                    max="35"
                    step="1"
                    value={vent.setRR}
                    onChange={(e) => onUpdateVent?.({ setRR: parseInt(e.target.value) })}
                    className="w-full accent-sky-400"
                  />

                  {/* Quick RR Presets */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 self-center mr-1">Presets:</span>
                    {[6, 8, 10, 12, 14, 18, 24, 30].map((rrVal) => (
                      <button
                        key={rrVal}
                        onClick={() => onUpdateVent?.({ setRR: rrVal })}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-all ${
                          vent.setRR === rrVal
                            ? 'bg-sky-600 border-sky-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {rrVal} bpm
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. PEEP & FiO2 Row */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* PEEP */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400 block">PEEP (cmH2O):</span>
                      <span className="text-base font-black text-emerald-300">{vent.peep}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="18"
                      step="1"
                      value={vent.peep}
                      onChange={(e) => onUpdateVent?.({ peep: parseInt(e.target.value) })}
                      className="w-full accent-emerald-400"
                    />
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {[0, 4, 6, 8, 10, 12, 15].map((peepVal) => (
                        <button
                          key={peepVal}
                          onClick={() => onUpdateVent?.({ peep: peepVal })}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            vent.peep === peepVal
                              ? 'bg-emerald-600 border-emerald-400 text-white'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          {peepVal}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* FiO2 & Gas Flow Presets */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sky-400 block">Delivered FiO2:</span>
                      <span className="text-base font-black text-sky-300">{vent.liveFio2}%</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      O2: {vent.o2FlowLpm} L/min | Air: {vent.airFlowLpm} L/min
                    </div>
                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                      <button
                        onClick={() => onUpdateVent?.({ o2FlowLpm: 0.8, airFlowLpm: 3.2 })}
                        className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-sky-500 text-[10px] font-bold text-slate-300"
                      >
                        40% O2 Mix
                      </button>
                      <button
                        onClick={() => onUpdateVent?.({ o2FlowLpm: 2.0, airFlowLpm: 2.0 })}
                        className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-sky-500 text-[10px] font-bold text-slate-300"
                      >
                        60% O2 Mix
                      </button>
                      <button
                        onClick={() => onUpdateVent?.({ o2FlowLpm: 5.0, airFlowLpm: 0 })}
                        className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-sky-500 text-[10px] font-bold text-emerald-300"
                      >
                        100% Pure O2
                      </button>
                      <button
                        onClick={() => onUpdateVent?.({ o2FlowLpm: 0, airFlowLpm: 4.0 })}
                        className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-red-500 text-[10px] font-bold text-amber-300"
                      >
                        21% Air Only
                      </button>
                    </div>
                  </div>
                </div>

                {/* 6. Pressure Ceiling & I:E Ratio */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="font-bold text-amber-400 block">Pmax Limit: {vent.pmax} cmH2O</span>
                      <span className="text-[10px] text-slate-400">Barotrauma ceiling (truncates breath if exceeded)</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="60"
                      step="5"
                      value={vent.pmax}
                      onChange={(e) => onUpdateVent?.({ pmax: parseInt(e.target.value) })}
                      className="w-28 accent-amber-400"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold">I:E:</span>
                    {(['1:1', '1:2', '1:3', '1:4'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => onUpdateVent?.({ ieRatio: r })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                          vent.ieRatio === r
                            ? 'bg-amber-500 border-amber-400 text-black'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: FLUIDS & BLOOD */}
        {/* ======================================================== */}
        {activeTab === 'fluids' && (
          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="font-bold text-blue-400 uppercase block">Intravenous Fluids &amp; Blood Products</span>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Select Fluid / Product:</label>
                  <select
                    value={fluidType}
                    onChange={(e) => setFluidType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                  >
                    <option value="Normal Saline (0.9% NaCl)">Normal Saline (0.9% NaCl)</option>
                    <option value="Lactated Ringer's (LR)">Lactated Ringer's (LR)</option>
                    <option value="Packed Red Blood Cells (PRBC)">Packed Red Blood Cells (PRBC - 350mL/U)</option>
                    <option value="Fresh Frozen Plasma (FFP)">Fresh Frozen Plasma (FFP)</option>
                    <option value="Platelets (Single Donor)">Platelets (Single Donor Unit)</option>
                    <option value="5% Albumin Colloid">5% Albumin Colloid (250mL)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Volume (mL):</label>
                  <select
                    value={fluidVolume}
                    onChange={(e) => setFluidVolume(parseInt(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                  >
                    <option value={250}>250 mL</option>
                    <option value={500}>500 mL (Standard Bolus)</option>
                    <option value={1000}>1000 mL (Rapid Infusion)</option>
                    <option value={700}>700 mL (2 Units Blood)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={() => {
                  onAdministerFluid(fluidType, fluidVolume);
                  audioEngine.playActionChime(true);
                }}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md active:scale-95 flex items-center justify-center gap-1.5 mt-2"
              >
                <Droplets className="w-4 h-4" />
                <span>Infuse {fluidVolume} mL {fluidType} under pressure</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: MONITORING & LABS */}
        {/* ======================================================== */}
        {activeTab === 'monitoring' && (
          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="font-bold text-sky-400 uppercase block">Diagnostic &amp; Hemodynamic Monitors</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onTriggerMonitoring('attach_art_line')}
                  className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-sky-500 text-left"
                >
                  <span className="font-bold text-sky-300 block">Radial Arterial Line</span>
                  <span className="text-[10px] text-slate-400">Continuous beat-to-beat pressure</span>
                </button>

                <button
                  onClick={() => onTriggerMonitoring('draw_stat_abg')}
                  className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-sky-500 text-left"
                >
                  <span className="font-bold text-sky-300 block">STAT Arterial Blood Gas (ABG)</span>
                  <span className="text-[10px] text-slate-400">pH, PaO2, PaCO2, Lactate</span>
                </button>

                <button
                  onClick={() => onTriggerMonitoring('check_glucometer')}
                  className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-sky-500 text-left"
                >
                  <span className="font-bold text-sky-300 block">Point-of-Care Glucose</span>
                  <span className="text-[10px] text-slate-400">Fingerstick blood sugar</span>
                </button>

                <button
                  onClick={() => onTriggerMonitoring('check_tof_nerve')}
                  className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-sky-500 text-left"
                >
                  <span className="font-bold text-sky-300 block">Train-of-Four Stimulator</span>
                  <span className="text-[10px] text-slate-400">Ulnar nerve adductor pollicis</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: ASSESSMENT & NPO */}
        {/* ======================================================== */}
        {activeTab === 'assessment' && (
          <div className="space-y-3 text-xs font-mono">
            {/* Pre-Anesthetic Workstation Leak Test Card */}
            {onRunLeakTest && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-sky-400 uppercase text-xs flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Automated Workstation Pre-Use Leak Test</span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-sans mt-0.5">
                    Occludes Y-piece, pressurizes circuit to 30 cmH2O, and validates leak rate &lt; 150 mL/min and compliance.
                  </div>
                </div>
                <button
                  onClick={onRunLeakTest}
                  disabled={isLeakTesting}
                  className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-all shrink-0 ${
                    isLeakTesting
                      ? 'bg-amber-600 text-white animate-pulse'
                      : isLeakTestDone
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg ring-2 ring-indigo-400/50 animate-pulse'
                  }`}
                >
                  {isLeakTesting
                    ? 'Testing (30 cmH2O)...'
                    : isLeakTestDone
                    ? '✓ Leak Test Passed (12 mL/min)'
                    : '▶ Run Automated Leak Test'}
                </button>
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="font-bold text-indigo-400 uppercase block">Preoperative Patient Dossier</span>
              <div className="space-y-1.5 text-slate-300 font-sans">
                <div><span className="font-bold text-slate-400 font-mono">NPO Status:</span> {patient.npoStatus} ({patient.fastingHours}h fasting)</div>
                <div><span className="font-bold text-slate-400 font-mono">Airway Exam:</span> Mallampati {patient.airwayExam.mallampati}, Thyromental {patient.airwayExam.thyromentalDistanceCm}cm, Mouth Opening {patient.airwayExam.mouthOpeningCm}cm, Neck: {patient.airwayExam.neckMobility}</div>
                <div><span className="font-bold text-slate-400 font-mono">History:</span> {patient.history}</div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 6: SAFETY, CPR & ADJUNCTS */}
        {/* ======================================================== */}
        {activeTab === 'safety' && (
          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="font-bold text-amber-400 uppercase block">Safety Adjuncts &amp; Crisis Management</span>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onAskSurgeonPause}
                  className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500 text-left transition-colors"
                >
                  <span className="font-bold text-amber-300 block">
                    {patient.procedure.toLowerCase().includes('adrenal') || patient.keyComorbidities?.some(c => c.toLowerCase().includes('pheo'))
                      ? 'Communicate with Surgeon: Pause Manipulation'
                      : 'Ask Surgeon to Stop/Pause'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {patient.procedure.toLowerCase().includes('adrenal')
                      ? 'Halt capsular dissection and tumor traction to control surges'
                      : 'Release insufflation or stop stimulation'}
                  </span>
                </button>

                <button
                  onClick={onCallForHelp}
                  className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500 text-left"
                >
                  <span className="font-bold text-amber-300 block">Call for Senior Help / Attending</span>
                  <span className="text-[10px] text-slate-400">Emergency second pair of hands</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
