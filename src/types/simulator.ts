// Comprehensive types for Anesthesia Clinical Simulator

export type PerioperativePhase =
  | 'preop_assessment'
  | 'preop_prep'
  | 'induction'
  | 'airway'
  | 'maintenance'
  | 'emergence'
  | 'pacu'
  | 'debrief';

export type HeartRhythm =
  | 'Normal Sinus Rhythm'
  | 'Sinus Tachycardia'
  | 'Sinus Bradycardia'
  | 'Supraventricular Tachycardia (SVT)'
  | 'Atrial Fibrillation'
  | 'Premature Ventricular Contractions (PVCs)'
  | 'Ventricular Tachycardia (VT)'
  | 'Ventricular Fibrillation (VF)'
  | 'Asystole'
  | 'Pulseless Electrical Activity (PEA)';

export type ConsciousnessLevel = 'awake' | 'drowsy' | 'sedated' | 'unconscious' | 'deep' | 'coma';

export type AirwayPatency =
  | 'patent'
  | 'partially_obstructed'
  | 'laryngospasm'
  | 'bronchospasm'
  | 'intubated'
  | 'esophageal_intubated'
  | 'endobronchial_intubated'
  | 'cant_intubate_cant_oxygenate';

export type AirwayDevice = 'none' | 'face_mask' | 'opa' | 'npa' | 'lma' | 'ett' | 'cricothyroidotomy';

export interface AirwayExam {
  mallampati: string;
  thyromentalDistanceCm: number;
  mouthOpeningCm: number;
  neckMobility: string;
  teethCondition: string;
}

export interface DynamicPhysiology {
  // Cardiovascular
  hr: number;
  sbp: number;
  dbp: number;
  map: number;
  cardiacOutputLpm: number;
  svrDynSecCm5: number;
  rhythm: HeartRhythm;
  stElevationMm: number;

  // Respiratory & Gas Exchange
  spo2: number;
  rr: number;
  etco2: number;
  pao2MmHg: number;
  paco2MmHg: number;
  ph: number;
  lungComplianceMlCmH2o: number;
  airwayResistanceCmH2o: number;
  preoxygenationLevel: number; // 0 to 100%
  frcCapacityMl: number;

  // Temperature & Homeostasis
  tempC: number;
  coreTempC?: number;
  bloodVolumeMl: number;
  hemoglobinGdl: number;
  potassiumMeqL: number;
  serumPotassiumMeq?: number;
  glucoseMgDl: number;
  glucoseMmol?: number;
  bloodGlucoseMgDl?: number;
  lactateMmolL: number;

  // Neurological & Depth of Anesthesia
  consciousness: ConsciousnessLevel;
  bis: number; // 0 to 100
  painScore: number; // 0 to 100
  muscleTonePercent: number; // 0 to 100
  muscleTone?: 'normal' | 'relaxed' | 'flaccid' | 'rigid';
  tofCount: number; // 0 to 4
  trainOfFour?: number; // 0 to 4 alias
  tofRatio: number; // 0 to 1.0
  macEquivalent?: number;
  movementDetected?: boolean;
  lacrimation?: boolean;

  // Airway & Mechanics
  airwayPatency: AirwayPatency;
  airwayDevice: AirwayDevice;
  ettSize?: number;
  ettDepthCm?: number;
  cuffPressureCmH2o: number;
  breathSounds: 
    | 'Normal Bilateral'
    | 'Bilateral Wheezing (Bronchospasm)'
    | 'Absent Left / Endobronchial Right'
    | 'Stridor / Laryngospasm'
    | 'Absent (Esophageal / Apnea)'
    | 'Crackles / Pulmonary Edema';
  chestRise: 'Symmetric' | 'Diminished Bilateral' | 'Asymmetric Right Only' | 'Paradoxical / See-saw' | 'None';
  gastricDistension: boolean;

  // Fluid & Output Balances
  urineOutputMl: number;
  bloodLossMl: number;
  fluidsAdministeredMl: number;

  // Environmental / Physical State
  position: 'supine' | 'trendelenburg' | 'reverse_trendelenburg' | 'lithotomy' | 'ramp';
  warmingBlanketOn: boolean;

  // Patient Death & Resuscitation Timers
  isDead?: boolean;
  deathCause?: string;
  timeInArrestSec?: number;
  timeInSevereHypoxiaSec?: number;
  timeInSevereHypotensionSec?: number;
}

export type VentMode = 'Manual/Bag' | 'VCV' | 'PCV' | 'SIMV' | 'PSV';
export type VolatileAgent = 'Sevoflurane' | 'Isoflurane' | 'Desflurane' | 'None';

export interface VentilatorState {
  powerOn: boolean;
  mode: VentMode;
  bagVentSwitch: 'bag' | 'vent';
  setVt: number;
  setRR: number;
  peep: number;
  ieRatio: '1:1' | '1:2' | '1:3' | '1:4';
  pmax: number;
  aplValveCmH2o: number; // 0 to 70

  // Flowmeters
  o2FlowLpm: number;
  airFlowLpm: number;
  n2oFlowLpm: number;

  // Vaporizer
  vaporizerAgent: VolatileAgent;
  vaporizerDialPercent: number;

  // Live delivered values
  livePip: number;
  livePplat: number;
  liveDeliveredVt: number;
  liveMinuteVolume: number;
  liveFio2: number;
  liveEto2: number;
  liveFiAgent: number;
  liveEtAgent: number;
  liveMac: number;

  // Alarms
  alarms: {
    highPressure: boolean;
    lowPressureDisconnect: boolean;
    lowFio2: boolean;
    apnea: boolean;
  };
}

export interface MonitoringAttachments {
  ecgAttached: boolean;
  spo2Attached: boolean;
  nibpAttached: boolean;
  etco2Attached: boolean;
  tempAttached: boolean;
  artLineAttached: boolean;
  bisAttached: boolean;
  tofAttached: boolean;
  nibpCyclingIntervalMinutes: number; // 3 or 5
  lastNibpTimeSec: number;
  isNibpInflating: boolean;
}

export interface ActiveDrugEffect {
  id: string;
  drugId: string;
  name: string;
  category: string;
  dose: number;
  unit: string;
  route: string;
  timestampSec: number;
  onsetSec: number;
  peakSec: number;
  durationSec: number;
  currentIntensity: number; // 0.0 to 1.0
}

export type NarratorMessageType = 'info' | 'warning' | 'critical' | 'success';

export interface NarratorMessage {
  id: string;
  timestampSec: number;
  timeFormatted: string;
  text: string;
  type: NarratorMessageType;
  speaker: 'Attending' | 'Nurse' | 'Surgeon' | 'Monitor' | 'Workstation' | 'System';
}

export type ActionScoreEffect = 'correct' | 'delayed' | 'unnecessary' | 'harmful';

export interface ActionLogEntry {
  id: string;
  timestampSec: number;
  timeFormatted: string;
  category: 'medication' | 'airway' | 'ventilation' | 'fluids' | 'monitoring' | 'assessment' | 'safety' | 'phase_transition';
  title: string;
  detail: string;
  scoreEffect: ActionScoreEffect;
  pointsDelta: number;
}

export interface ComplicationTrigger {
  id: string;
  title: string;
  description: string;
  active: boolean;
  triggeredAtSec?: number;
  treated: boolean;
  triggerPhase: PerioperativePhase;
  triggerDelaySec: number;
  narratorWarning: string;
  correctActionTags: string[];
  scientificMechanism: string;
}

export interface PatientProfile {
  id: string;
  name: string;
  age: number;
  sex: 'Male' | 'Female';
  weightKg: number;
  heightCm: number;
  bmi: number;
  asaClass: 'ASA I' | 'ASA II' | 'ASA III' | 'ASA IV' | 'ASA I E' | 'ASA II E' | 'ASA III E' | 'ASA IV E';
  procedure: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  keyComorbidities: string[];
  history: string;
  airwayExam: AirwayExam;
  allergies: string[];
  npoStatus: 'NPO > 8h' | 'NPO 2h (Full Stomach)' | 'Non-NPO (Emergency)';
  fastingHours: number;
  baselineVitals: Partial<DynamicPhysiology>;
  baselineLabs: {
    hb: number;
    wbc: number;
    plts: number;
    na: number;
    k: number;
    cl: number;
    hco3: number;
    bun: number;
    cr: number;
    glucose: number;
    inr: number;
  };
}

export interface ClinicalCase {
  patient: PatientProfile;
  initialPhysiology: DynamicPhysiology;
  scriptedComplications: ComplicationTrigger[];
  requiredPhaseActions: Record<PerioperativePhase, string[]>;
  phaseDescriptions: Record<PerioperativePhase, string>;
  teachingPoints: string[];
  caseHints: Record<string, string>;
}

export interface ClinicalMistake {
  id: string;
  timestampSec: number;
  timeFormatted: string;
  category: 'Airway' | 'Ventilation' | 'Anesthetic Depth & Awareness' | 'Hemodynamics & Fluids' | 'Pharmacology & Safety';
  severity: 'critical' | 'major' | 'minor';
  title: string;
  description: string;
  realLifeConsequence: string;
  correction: string;
  pointsDeducted: number;
}
