import React from 'react';
import { Lightbulb, X, ArrowRight, AlertTriangle, ShieldCheck, CheckCircle2, Clock, Activity, Zap } from 'lucide-react';
import {
  DynamicPhysiology,
  VentilatorState,
  ClinicalCase,
  PerioperativePhase,
  MonitoringAttachments,
  ActiveDrugEffect,
  ActionLogEntry,
} from '../../types/simulator';

interface HintModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: ClinicalCase;
  phase: PerioperativePhase;
  phys: DynamicPhysiology;
  vent: VentilatorState;
  monitoring?: MonitoringAttachments;
  activeDrugs?: ActiveDrugEffect[];
  actionLogs?: ActionLogEntry[];
  hintsUsedCount: number;
  isMachineLeakTestDone?: boolean;
}

export const HintModal: React.FC<HintModalProps> = ({
  isOpen,
  onClose,
  caseData,
  phase,
  phys,
  vent,
  monitoring,
  activeDrugs = [],
  actionLogs = [],
  hintsUsedCount,
  isMachineLeakTestDone = false,
}) => {
  if (!isOpen) return null;

  // Helper to check action history
  const hasLogged = (term: string) =>
    actionLogs.some(
      (a) =>
        a.title.toLowerCase().includes(term.toLowerCase()) ||
        a.detail.toLowerCase().includes(term.toLowerCase())
    );

  const hasDrug = (drugName: string) =>
    activeDrugs.some((d) => d.drugId.toLowerCase().includes(drugName.toLowerCase()) || d.name.toLowerCase().includes(drugName.toLowerCase()));

  // Patient & Device status
  const patient = caseData.patient;
  const isIntubated = phys.airwayDevice === 'ett' || phys.airwayDevice === 'lma';
  const hasMonitorsAttached =
    (monitoring?.ecgAttached ?? true) &&
    (monitoring?.spo2Attached ?? true) &&
    (monitoring?.nibpAttached ?? true);

  const hasHypnotic = hasDrug('propofol') || hasDrug('etomidate') || hasDrug('ketamine') || hasDrug('thiopental');
  const hasRelaxant = hasDrug('rocuronium') || hasDrug('vecuronium') || hasDrug('succinylcholine') || hasDrug('atracurium');
  const hasReversal = hasDrug('sugammadex') || hasDrug('neostigmine');

  const isParalyzed = phys.tofCount < 4 || phys.muscleTonePercent < 50;
  const isConsciousAwake = phys.consciousness === 'awake' || phys.bis > 75;
  const isLockedIn = isConsciousAwake && isParalyzed;

  // What the user has already accomplished
  const completedList: string[] = [];
  if (hasMonitorsAttached) completedList.push('Standard ASA Monitors Attached (ECG, SpO2, NIBP)');
  if (hasLogged('mallampati') || hasLogged('npo') || hasLogged('airway exam')) completedList.push('Pre-op Airway & NPO Assessment');
  if (phys.preoxygenationLevel > 65 || hasLogged('pre-oxygen') || hasLogged('preoxygen')) completedList.push('Pre-oxygenation with tight mask');
  if (vent.powerOn) completedList.push('Ventilator Workstation Power Active');
  if (hasHypnotic || phys.consciousness !== 'awake') completedList.push('Induction Hypnotic Administered');
  if (hasRelaxant || phys.tofCount === 0) completedList.push('Neuromuscular Blockade Induced');
  if (isIntubated) completedList.push(`Trachea Secured (${phys.airwayDevice.toUpperCase()} in situ)`);
  if (hasLogged('confirm') || hasLogged('auscultat') || hasLogged('breath sounds')) completedList.push('Tube Placement Verified');
  if (vent.powerOn && vent.bagVentSwitch === 'vent') completedList.push(`Automated Mechanical Ventilation (${vent.mode})`);
  if (vent.vaporizerDialPercent > 0 || vent.liveMac > 0.5) completedList.push(`Maintenance Anesthetic (${vent.vaporizerDialPercent}% ${vent.vaporizerAgent})`);
  if (hasReversal || (phys.tofCount === 4 && phys.muscleTonePercent > 80)) completedList.push('Neuromuscular Blockade Reversed');

  // Compute the single most urgent, medically accurate NEXT action
  let nextAction = '';
  let rationale = '';
  let urgencyLevel: 'critical' | 'warning' | 'normal' = 'normal';

  // =========================================================================
  // 1. LIFE-THREATENING EMERGENCY OVERRIDES
  // =========================================================================
  if (phys.rhythm === 'Asystole' || phys.hr === 0 || phys.rhythm === 'Ventricular Fibrillation (VF)') {
    urgencyLevel = 'critical';
    nextAction = 'ACLS CARDIAC ARREST: Push Epinephrine 1 mg IV STAT, turn Sevoflurane to 0%, deliver 100% O2, and begin chest compressions immediately.';
    rationale = 'Immediate coronary and cerebral perfusion pressure generation is required to restore spontaneous circulation.';
  } else if (isLockedIn) {
    urgencyLevel = 'critical';
    nextAction = 'AWAKE PARALYSIS (LOCKED-IN SYNDROME): Immediately push Propofol 100–150 mg IV or turn Sevoflurane to 2.5% to deepen anesthesia!';
    rationale = 'The patient has regained consciousness while pharmacologically paralyzed. This causes severe psychological trauma and autonomic storm.';
  } else if (vent.liveFio2 < 21) {
    urgencyLevel = 'critical';
    nextAction = 'HYPOXIC GAS MIXTURE: Increase O2 flow immediately on the rotameters (turn O2 to at least 2.0 L/min, turn off N2O/Air)!';
    rationale = 'Delivering FiO2 < 21% causes rapid alveolar hypoxia, arterial desaturation, and cardiac arrest within minutes.';
  } else if (phys.spo2 < 86) {
    urgencyLevel = 'critical';
    nextAction = `CRITICAL HYPOXEMIA (SpO2 ${phys.spo2}%): Turn FiO2 to 100% (O2 flush), check circuit connection, auscultate bilateral breath sounds, and check ETT depth.`;
    rationale = 'Rapid desaturation requires immediate 100% inspired oxygen, verification of airway patency, and rule-out of endobronchial intubation.';
  } else if (phys.airwayPatency === 'bronchospasm' || vent.livePip > 40) {
    urgencyLevel = 'critical';
    nextAction = `ACUTE BRONCHOSPASM (PIP ${vent.livePip} cmH2O, Shark-Fin): Administer Salbutamol 8-10 puffs in-line through ETT, increase Sevoflurane to 3.0%, change I:E ratio to 1:3 or 1:4, and deliver 100% O2.`;
    rationale = 'Severe bronchoconstriction causes dynamic hyperinflation; direct beta-2 bronchodilation, deep volatile anesthesia, and prolonged expiratory time are essential.';
  } else if (phys.airwayPatency === 'laryngospasm') {
    urgencyLevel = 'critical';
    nextAction = 'LARYNGOSPASM: Apply tight face mask with 100% O2, close APL to 30-40 cmH2O (positive pressure CPAP), and perform vigorous Larson jaw thrust. If hypoxemic, give Succinylcholine 20 mg IV.';
    rationale = 'Continuous positive airway pressure forces vocal cords apart and overcomes reflexive adductor spasm.';
  } else if (phys.map < 55) {
    urgencyLevel = 'critical';
    nextAction = `SEVERE HYPOTENSION (MAP ${phys.map} mmHg): Bolus Ephedrine 10 mg or Phenylephrine 100 mcg IV, run IV fluids wide open, and lighten volatile anesthetic dial.`;
    rationale = 'Restores mean arterial pressure above vital autoregulatory thresholds (coronary and cerebral perfusion).';
  } else if (phys.breathSounds.includes('Crackles') && phys.fluidsAdministeredMl > 2000) {
    urgencyLevel = 'warning';
    nextAction = `ACUTE HYDROSTATIC PULMONARY EDEMA: Administer Furosemide (Lasix) 20-40 mg IV, restrict fluid infusions, and increase PEEP to 8-10 cmH2O.`;
    rationale = 'Loop diuretics promote rapid venodilation and diuresis to clear alveolar fluid transudation; positive PEEP improves functional lung compliance.';
  }

  // =========================================================================
  // 2. CONTEXT-AWARE CLINICAL ADVANCEMENT (WHAT THE USER HAS/HASN'T DONE)
  // =========================================================================
  else if (phase === 'preop_assessment') {
    if (!hasMonitorsAttached) {
      nextAction = 'Attach standard ASA monitors (ECG, SpO2, NIBP) in the Monitoring tab to establish baseline hemodynamics.';
      rationale = 'Continuous standard monitoring is mandatory before administering any anesthetic drugs.';
    } else if (!hasLogged('npo') && !hasLogged('mallampati') && !hasLogged('airway exam')) {
      nextAction = 'Assess patient airway anatomy (Mallampati class, thyromental distance) and confirm NPO fasting status in Assessment tab.';
      rationale = 'Anticipates potential difficult intubation and quantifies pulmonary aspiration risk.';
    } else {
      nextAction = 'Pre-anesthesia assessment is complete! Click "Complete Phase Steps & Proceed" to advance to Pre-op Preparation.';
      rationale = 'All required ASA pre-anesthetic baseline assessments have been fulfilled.';
    }
  } else if (phase === 'preop_prep') {
    if (!vent.powerOn || !isMachineLeakTestDone) {
      nextAction = 'Click "RUN WORKSTATION LEAK TEST" on the Anesthesia Machine screen (or in the Action drawer) to perform the automated circuit leak check and power ON.';
      rationale = 'The anesthesia machine must be verified leak-free (< 150 mL/min at 30 cmH2O) and powered ON prior to inducing anesthesia.';
    } else if (phys.preoxygenationLevel < 80) {
      nextAction = 'Apply tight face mask with 100% O2 at 10–12 L/min in the Airway tab to denitrogenate functional residual capacity (FRC).';
      rationale = 'Pre-oxygenation builds an alveolar oxygen reservoir, extending safe apnea time from 1-2 minutes up to 8 minutes.';
    } else {
      nextAction = `Pre-oxygenation target achieved (${Math.round(phys.preoxygenationLevel)}% FRC)! Click "Complete Phase Steps & Proceed" to enter Induction.`;
      rationale = 'Alveolar denitrogenation is complete and patient is prepared for induction.';
    }
  } else if (phase === 'induction') {
    if (phys.consciousness === 'awake' && !hasHypnotic) {
      const propofolDose = Math.round(patient.weightKg * 2);
      nextAction = `Administer induction hypnotic: Propofol ${propofolDose} mg IV bolus (or Etomidate 20 mg if hemodynamically fragile).`;
      rationale = 'Produces rapid, smooth loss of consciousness and loss of eyelash reflex within 30-45 seconds.';
    } else if (phys.consciousness !== 'awake' && !hasRelaxant && phys.tofCount === 4) {
      const rocDose = Math.round(patient.weightKg * 0.6);
      nextAction = `Patient is unconscious. Administer Neuromuscular Blocker: Rocuronium ${rocDose} mg IV (or Succinylcholine 100 mg).`;
      rationale = 'Paralyzes the vocal cords and pharyngeal muscles for atraumatic endotracheal intubation.';
    } else if (hasRelaxant && phys.tofCount > 0) {
      nextAction = `Neuromuscular blocker administered. Wait ~30-40 seconds for vocal cord relaxation (train-of-four to reach 0/4 twitches) before attempting intubation.`;
      rationale = 'Intubating before vocal cord paralysis risks vocal cord trauma, coughing, laryngospasm, and hemodynamic surges.';
    } else {
      nextAction = 'Patient is fully induced and paralyzed (TOF 0/4)! Click "Complete Phase Steps & Proceed" to begin Airway Management & Intubation.';
      rationale = 'Optimal intubating conditions achieved.';
    }
  } else if (phase === 'airway') {
    if (!isIntubated) {
      nextAction = 'Perform laryngoscopy (Video Laryngoscope or Mac blade), insert cuffed ETT size 7.5 to 21 cm at the teeth, and inflate the cuff.';
      rationale = 'Secures definitive airway protection against aspiration and establishes an airway for mechanical ventilation.';
    } else if (!hasLogged('confirm') && !hasLogged('breath sounds')) {
      nextAction = 'Verify tube placement: Check bilateral breath sounds and confirm 5 sustained square-wave EtCO2 capnogram waves on the monitor.';
      rationale = 'Mandatory standard of care to exclude esophageal or endobronchial intubation.';
    } else if (!vent.powerOn || vent.bagVentSwitch === 'bag') {
      const targetVt = Math.round(patient.weightKg * 7);
      nextAction = `Turn ON Ventilator Power, switch to VENTILATOR AUTO, and set Tidal Volume to ${targetVt} mL (6-8 mL/kg PBW), RR 12, PEEP 5 cmH2O.`;
      rationale = 'Initiates automated positive-pressure lung-protective ventilation.';
    } else if (vent.vaporizerDialPercent === 0 && vent.liveEtAgent < 0.3) {
      nextAction = 'Turn ON Sevoflurane vaporizer dial to 1.8–2.0% (target 1.0 MAC) with O2/Air fresh gas flow to maintain depth of anesthesia.';
      rationale = 'Prevents intraoperative awareness as the single IV induction dose of Propofol redistributes and wears off.';
    } else {
      nextAction = 'Airway secured, mechanical ventilation active, and maintenance anesthesia dialed! Proceed to Surgical Maintenance.';
      rationale = 'All airway and ventilatory milestones successfully achieved.';
    }
  } else if (phase === 'maintenance') {
    if (vent.vaporizerDialPercent === 0 && vent.liveMac < 0.6) {
      nextAction = 'Increase Sevoflurane dial to 1.8–2.0% (1.0 MAC). Monitor BIS (target 40-55) to prevent accidental awareness under anesthesia.';
      rationale = 'Inadequate depth of anesthesia risks surgical recall, movement, and sympathetic stress surges.';
    } else if (phys.painScore > 35 || phys.hr > 105) {
      nextAction = 'Patient has sympathetic response to surgical stimulation (HR elevated/pain detected). Administer Fentanyl 50-100 mcg IV bolus.';
      rationale = 'Suppresses nociceptive transmission and stabilizes autonomic hemodynamics during incision.';
    } else if (phys.tofCount >= 3 && hasLogged('surgeon')) {
      nextAction = `Muscle relaxation is wearing off (TOF ${phys.tofCount}/4). Administer maintenance Rocuronium 5-10 mg IV if surgical relaxation is required.`;
      rationale = 'Prevents patient bucking or diaphragmatic movement during abdominal or cavity surgery.';
    } else {
      nextAction = 'Maintenance anesthesia is stable (EtCO2 35-40, MAP 70-90, SpO2 > 98%, MAC ~1.0). Monitor vitals until surgery concludes, then proceed to Emergence.';
      rationale = 'Steady-state physiological homeostasis maintained.';
    }
  } else if (phase === 'emergence') {
    if (vent.vaporizerDialPercent > 0) {
      nextAction = 'Turn Sevoflurane vaporizer dial to 0% and increase fresh gas flow to 6–8 L/min (100% O2) to wash out volatile agent.';
      rationale = 'Allows volatile anesthetic to wash out of blood and brain so the patient can regain consciousness.';
    } else if (phys.tofCount < 4 || !hasReversal) {
      nextAction = `Residual neuromuscular block present (TOF ${phys.tofCount}/4). Administer Sugammadex (2-4 mg/kg = 200 mg IV) or Neostigmine + Glycopyrrolate before extubating!`;
      rationale = 'CRITICAL SAFETY: Extubating with residual paralysis (TOF < 4/4) causes acute upper airway collapse, hypoventilation, and hypoxic arrest.';
    } else if (isIntubated && (phys.consciousness !== 'awake' || vent.bagVentSwitch === 'vent')) {
      nextAction = 'Switch to MANUAL/BAG mode. Confirm spontaneous breathing (Vt > 350 mL), eye opening, and following commands before removing the tube.';
      rationale = 'Patient must demonstrate spontaneous respiratory drive and protective airway reflexes before extubation.';
    } else if (isIntubated) {
      nextAction = 'Patient meets all extubation criteria (TOF 4/4, awake, Vt > 5 mL/kg). Suction pharynx, deflate cuff on inspiration, and extubate trachea!';
      rationale = 'Definitive emergence and smooth extubation.';
    } else {
      nextAction = 'Extubation complete! Apply face mask with 6 L/min O2 and advance to PACU.';
      rationale = 'Postoperative respiratory transition established.';
    }
  } else {
    nextAction = 'Assess PACU vital signs, Aldrete discharge criteria score, treat nausea/pain, and complete the debrief review.';
    rationale = 'Standard PACU recovery protocol.';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200 font-sans select-none">
      <div className="bg-slate-900 border-2 border-amber-500/80 w-full max-w-xl rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              urgencyLevel === 'critical' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
            }`}>
              <Lightbulb className={`w-5 h-5 ${urgencyLevel === 'critical' ? 'animate-bounce text-red-400' : 'animate-pulse text-amber-400'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm">Clinical Attending Advisor</h3>
                <span className={`text-[9px] font-mono px-2 py-0.2 rounded font-black uppercase ${
                  urgencyLevel === 'critical' ? 'bg-red-950 text-red-300 border border-red-600 animate-pulse' : 'bg-slate-800 text-amber-400'
                }`}>
                  {urgencyLevel === 'critical' ? 'CRITICAL PRIORITY' : 'NEXT STEP ADVICE'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Real-Time Dynamic Assessment • Consults: {hintsUsedCount}
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-3.5 text-xs overflow-y-auto max-h-[75vh]">
          
          {/* Patient Quick Vitals Ribbon */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 grid grid-cols-4 gap-2 text-center text-[11px] font-mono">
            <div>
              <span className="text-slate-500 block text-[9px] uppercase">State</span>
              <span className="font-bold text-slate-200 capitalize">{phys.consciousness}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] uppercase">Airway</span>
              <span className="font-bold text-teal-300 uppercase">{phys.airwayDevice}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] uppercase">Twitches (TOF)</span>
              <span className="font-bold text-purple-300">{phys.tofCount}/4 ({phys.muscleTonePercent}%)</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] uppercase">SpO2 / MAP</span>
              <span className={`font-bold ${phys.spo2 < 90 ? 'text-red-400' : 'text-emerald-400'}`}>{phys.spo2}% / {phys.map}</span>
            </div>
          </div>

          {/* Recommended Action Card */}
          <div className={`p-4 rounded-xl border space-y-1.5 ${
            urgencyLevel === 'critical'
              ? 'bg-red-950/40 border-red-600/80 shadow-lg shadow-red-950/50'
              : 'bg-amber-950/40 border-amber-600/80'
          }`}>
            <div className="flex items-center gap-1.5 font-bold uppercase text-[11px] font-mono">
              <Zap className={`w-3.5 h-3.5 ${urgencyLevel === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
              <span className={urgencyLevel === 'critical' ? 'text-red-300' : 'text-amber-300'}>
                {urgencyLevel === 'critical' ? 'Immediate Corrective Action Required:' : 'Single Most Correct Next Step:'}
              </span>
            </div>
            <p className="text-slate-100 font-semibold leading-relaxed text-[13px]">
              {nextAction}
            </p>
          </div>

          {/* Scientific Rationale Card */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-slate-300">
            <span className="font-bold text-sky-400 font-mono text-[10px] uppercase block">
              Scientific Physiological Rationale:
            </span>
            <p className="leading-relaxed text-[11.5px] text-slate-300">
              {rationale}
            </p>
          </div>

          {/* Already Completed Milestones */}
          {completedList.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
              <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Actions You Have Already Completed:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {completedList.map((item, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-800/50 text-[10px] text-emerald-300 font-mono flex items-center gap-1"
                  >
                    <span>✓</span>
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-mono">
            Phase: <span className="text-slate-300 font-bold uppercase">{phase.replace('_', ' ')}</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold font-mono text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95"
          >
            <span>Understood &amp; Apply</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
};
