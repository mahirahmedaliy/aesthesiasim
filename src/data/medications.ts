import { DynamicPhysiology, PatientProfile } from '../types/simulator';

export interface SimulatorDrug {
  id: string;
  name: string;
  category: 
    | 'Induction & Hypnotics'
    | 'Opioids'
    | 'Muscle Relaxants'
    | 'Reversal Agents'
    | 'Benzodiazepines'
    | 'Vasopressors & Inotropes'
    | 'Antihypertensives & Antiarrhythmics'
    | 'Anticholinergics'
    | 'Antiemetics'
    | 'Emergency & Resuscitation'
    | 'Analgesics'
    | 'Local Anesthetics';
  unit: 'mg' | 'mcg' | 'g' | 'mL' | 'puffs';
  mgPerKgMin?: number;
  mgPerKgMax?: number;
  mcgPerKgMin?: number;
  mcgPerKgMax?: number;
  fixedDoseDefault?: number;
  quickDoses: number[];
  routes: ('IV Bolus' | 'IV Infusion' | 'IM' | 'Inhaled / ETT')[];
  defaultRoute: 'IV Bolus' | 'IV Infusion' | 'IM' | 'Inhaled / ETT';
  onsetSec: number;
  peakSec: number;
  durationSec: number;
  description: string;
  patientWarning?: (patient: PatientProfile) => string | null;
  applyEffect: (
    phys: DynamicPhysiology,
    dose: number,
    patient: PatientProfile,
    route: string,
    activeDrugs?: { drugId: string; category: string; dose: number; currentIntensity?: number }[]
  ) => { narrative: string; vitalsChanges: Partial<DynamicPhysiology> };
}

// ==========================================
// CUMULATIVE PHARMACOKINETICS & SYNERGY HELPERS
// ==========================================
export interface ActiveDrugRef {
  drugId: string;
  category: string;
  dose: number;
  currentIntensity?: number;
}

/**
 * Calculates the current active dose of a specific drug still in the patient's body
 */
export function getActiveDrugDose(
  activeDrugs: ActiveDrugRef[] | undefined,
  drugId: string
): number {
  if (!activeDrugs || activeDrugs.length === 0) return 0;
  return activeDrugs
    .filter((d) => d.drugId === drugId && (d.currentIntensity === undefined || d.currentIntensity > 0.05))
    .reduce((sum, d) => sum + d.dose * (d.currentIntensity ?? 1.0), 0);
}

/**
 * Evaluates cumulative induction status, including single repeat doses and
 * supra-additive co-induction techniques (e.g. Ketofol, Midazolam priming, Opioid synergy)
 */
export function calculateCumulativeInductionStatus(
  patient: PatientProfile,
  activeDrugs: ActiveDrugRef[] | undefined,
  currentDrugId: string = '',
  newDose: number = 0
) {
  const isElderly = patient.age >= 65;
  const isPediatric = patient.age < 12;
  const minPropofolDose = Math.round((isElderly ? 1.2 : isPediatric ? 2.5 : 1.7) * patient.weightKg);

  let activePropofol = getActiveDrugDose(activeDrugs, 'propofol');
  let activeKetamine = getActiveDrugDose(activeDrugs, 'ketamine');
  let activeEtomidate = getActiveDrugDose(activeDrugs, 'etomidate');
  let activeThiopental = getActiveDrugDose(activeDrugs, 'thiopental');
  let activeMethohexital = getActiveDrugDose(activeDrugs, 'methohexital');
  const activeMidazolam = getActiveDrugDose(activeDrugs, 'midazolam');
  const activeFentanyl = getActiveDrugDose(activeDrugs, 'fentanyl');

  if (currentDrugId === 'propofol') activePropofol += newDose;
  else if (currentDrugId === 'ketamine') activeKetamine += newDose;
  else if (currentDrugId === 'etomidate') activeEtomidate += newDose;
  else if (currentDrugId === 'thiopental') activeThiopental += newDose;
  else if (currentDrugId === 'methohexital') activeMethohexital += newDose;

  const propofolFraction = activePropofol / minPropofolDose;
  const ketamineFraction = activeKetamine / (1.4 * patient.weightKg);
  const etomidateFraction = activeEtomidate / (0.25 * patient.weightKg);
  const thiopentalFraction = activeThiopental / (4.0 * patient.weightKg);
  const methohexitalFraction = activeMethohexital / (1.5 * patient.weightKg);

  const rawFraction = propofolFraction + ketamineFraction + etomidateFraction + thiopentalFraction + methohexitalFraction;

  // Multi-modal synergistic co-induction
  // 1. Ketofol: Ketamine + Propofol (Dissociative NMDA-block + Cortical GABA-A activation)
  const isKetofol = activeKetamine >= 15 && activePropofol >= 25;
  // 2. Benzodiazepine priming: Midazolam >= 1.5mg reduces required induction dose by 30%
  const isBenzoSynergy = activeMidazolam >= 1.5 && (activePropofol >= 25 || rawFraction >= 0.25);
  // 3. Opioid blunting synergy: Fentanyl >= 75mcg reduces required induction dose by 20%
  const isOpioidSynergy = activeFentanyl >= 75 && rawFraction >= 0.25;

  let synergyMultiplier = 1.0;
  if (isKetofol) {
    synergyMultiplier = 1.35; // 35% supra-additive synergy
  } else if (isBenzoSynergy) {
    synergyMultiplier = 1.30;
  } else if (isOpioidSynergy) {
    synergyMultiplier = 1.20;
  }

  const totalEquivalentFraction = rawFraction * synergyMultiplier;
  const isTherapeuticInduction = totalEquivalentFraction >= 0.75;

  return {
    totalEquivalentFraction,
    isTherapeuticInduction,
    activePropofolMg: Math.round(activePropofol),
    activeKetamineMg: Math.round(activeKetamine),
    activeEtomidateMg: Math.round(activeEtomidate),
    activeMidazolamMg: Math.round(activeMidazolam),
    activeFentanylMcg: Math.round(activeFentanyl),
    isCoInduction: isKetofol || isBenzoSynergy || isOpioidSynergy,
    isKetofol,
  };
}

// ==========================================
// INTUBATION READINESS ASSESSMENT HELPER
// ==========================================
export interface IntubationCheckResult {
  canIntubate: boolean;
  status: 'ready' | 'awake' | 'subtherapeutic_hypnotic' | 'no_muscle_relaxant' | 'partial_relaxation';
  title: string;
  message: string;
  hypnoticOk: boolean;
  relaxantOk: boolean;
  preoxOk: boolean;
  recommendedHypnoticDose: number;
  recommendedRelaxantDose: number;
}

export function checkIntubationReadiness(
  phys: DynamicPhysiology,
  patient: PatientProfile,
  activeDrugs: { drugId: string; category: string; dose: number; currentIntensity?: number }[]
): IntubationCheckResult {
  const isElderly = patient.age >= 65;
  const isPediatric = patient.age < 12;

  // 1. Check Hypnotic / Induction Adequacy (including cumulative repeat dosing and Ketofol / co-induction synergy)
  const minPropofolDose = Math.round((isElderly ? 1.2 : isPediatric ? 2.5 : 1.7) * patient.weightKg);
  const minRocDose = Math.round(0.6 * patient.weightKg);

  const inductionStatus = calculateCumulativeInductionStatus(patient, activeDrugs, '', 0);

  let hypnoticOk = false;
  let hypnoticStatus: 'awake' | 'subtherapeutic_hypnotic' | 'adequate' = 'awake';

  if (inductionStatus.isTherapeuticInduction || phys.consciousness === 'unconscious' || phys.consciousness === 'deep') {
    hypnoticOk = true;
    hypnoticStatus = 'adequate';
  } else if (inductionStatus.totalEquivalentFraction > 0.15 || phys.consciousness === 'sedated' || phys.consciousness === 'drowsy') {
    hypnoticOk = false;
    hypnoticStatus = 'subtherapeutic_hypnotic';
  } else {
    hypnoticOk = false;
    hypnoticStatus = 'awake';
  }

  // 2. Check Neuromuscular Blockade / Muscle Relaxation
  const activeNMBAs = activeDrugs.filter(
    (d) =>
      ['rocuronium', 'succinylcholine', 'vecuronium', 'cisatracurium', 'atracurium'].includes(d.drugId) &&
      (d.currentIntensity === undefined || d.currentIntensity > 0.02)
  );

  let relaxantOk = false;
  let relaxantStatus: 'no_muscle_relaxant' | 'partial_relaxation' | 'adequate' = 'no_muscle_relaxant';
  const currentTOF = typeof phys.trainOfFour === 'number' ? phys.trainOfFour : (phys.tofCount ?? 4);
  const isFlaccid = phys.muscleTone === 'flaccid' || (phys.muscleTonePercent ?? 100) <= 25 || currentTOF <= 1;

  if (activeNMBAs.length === 0 && currentTOF >= 3 && !isFlaccid) {
    relaxantOk = false;
    relaxantStatus = 'no_muscle_relaxant';
  } else {
    let totalNMBAFraction = 0;
    activeNMBAs.forEach((d) => {
      const drugKey = d.drugId;
      const intensity = d.currentIntensity ?? 1.0;
      if (drugKey === 'rocuronium') {
        totalNMBAFraction += (d.dose / (0.6 * patient.weightKg)) * intensity;
      } else if (drugKey === 'succinylcholine') {
        totalNMBAFraction += (d.dose / (1.0 * patient.weightKg)) * intensity;
      } else if (drugKey === 'vecuronium') {
        totalNMBAFraction += (d.dose / (0.08 * patient.weightKg)) * intensity;
      } else if (drugKey === 'cisatracurium') {
        totalNMBAFraction += (d.dose / (0.15 * patient.weightKg)) * intensity;
      } else if (drugKey === 'atracurium') {
        totalNMBAFraction += (d.dose / (0.45 * patient.weightKg)) * intensity;
      }
    });

    if (totalNMBAFraction >= 0.7 || currentTOF <= 1 || isFlaccid) {
      relaxantOk = true;
      relaxantStatus = 'adequate';
    } else if (totalNMBAFraction > 0 || currentTOF === 2) {
      relaxantOk = false;
      relaxantStatus = 'partial_relaxation';
    } else {
      relaxantOk = false;
      relaxantStatus = 'no_muscle_relaxant';
    }
  }

  // 3. Pre-oxygenation check
  const preoxOk = phys.preoxygenationLevel >= 75;

  // Synthesis
  if (!hypnoticOk) {
    if (hypnoticStatus === 'awake') {
      return {
        canIntubate: false,
        status: 'awake',
        title: 'Patient is Awake',
        message: `Patient is awake (BIS ${phys.bis}). Intubation without induction is strictly contraindicated and triggers severe laryngospasm, bucking, and hypertensive crisis!`,
        hypnoticOk: false,
        relaxantOk,
        preoxOk,
        recommendedHypnoticDose: minPropofolDose,
        recommendedRelaxantDose: minRocDose,
      };
    } else {
      return {
        canIntubate: false,
        status: 'subtherapeutic_hypnotic',
        title: 'Sub-Therapeutic Induction Dose',
        message: `Induction dose is sub-therapeutic (BIS ${phys.bis}). Patient is in Stage II Excitement. Airway reflexes are hyperactive; attempting intubation causes vocal cord spasm!`,
        hypnoticOk: false,
        relaxantOk,
        preoxOk,
        recommendedHypnoticDose: minPropofolDose,
        recommendedRelaxantDose: minRocDose,
      };
    }
  }

  if (!relaxantOk) {
    return {
      canIntubate: false,
      status: relaxantStatus === 'partial_relaxation' ? 'partial_relaxation' : 'no_muscle_relaxant',
      title: 'Neuromuscular Blockade Required',
      message: `Patient is unconscious, but vocal cords are active (TOF ${phys.trainOfFour ?? phys.tofCount}/4). Intubating without muscle relaxation causes vocal cord injury, coughing, and laryngospasm.`,
      hypnoticOk: true,
      relaxantOk: false,
      preoxOk,
      recommendedHypnoticDose: minPropofolDose,
      recommendedRelaxantDose: minRocDose,
    };
  }

  return {
    canIntubate: true,
    status: 'ready',
    title: 'Ready for Intubation',
    message: `Optimal intubation conditions: Patient is unconscious (BIS ${phys.bis}) with complete neuromuscular blockade (TOF ${phys.trainOfFour}/4, flaccid cords).`,
    hypnoticOk: true,
    relaxantOk: true,
    preoxOk,
    recommendedHypnoticDose: minPropofolDose,
    recommendedRelaxantDose: minRocDose,
  };
}

export const SIMULATOR_DRUGS: SimulatorDrug[] = [
  // ========================================================
  // 1. INDUCTION & HYPNOTICS
  // ========================================================
  {
    id: 'propofol',
    name: 'Propofol (Diprivan)',
    category: 'Induction & Hypnotics',
    unit: 'mg',
    mgPerKgMin: 1.5,
    mgPerKgMax: 2.5,
    quickDoses: [20, 50, 100, 140, 180, 200],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 30,
    peakSec: 60,
    durationSec: 480,
    description: 'GABA-A agonist. Rapid induction. Causes dose-dependent vasodilation, drop in SVR, myocardial depression, and apnea.',
    patientWarning: (p) => {
      if (p.age >= 65 || p.asaClass.includes('III') || p.asaClass.includes('IV')) {
        return 'Elderly or fragile hemodynamics: High risk of profound hypotension (MAP < 55). Reduce dose by 30-50%!';
      }
      return null;
    },
    applyEffect: (phys, dose, p, route, activeDrugs) => {
      const isElderlyOrShock = p.age >= 65 || phys.bloodVolumeMl < 4000;
      const priorPropofol = getActiveDrugDose(activeDrugs, 'propofol');
      const totalPropofol = priorPropofol + dose;
      const totalMgPerKg = totalPropofol / p.weightKg;

      // Check cumulative and co-induction status (e.g. Ketofol, Midazolam priming, Opioid synergy)
      const coInduction = calculateCumulativeInductionStatus(p, activeDrugs, 'propofol', dose);

      const isToxicOverdose = totalMgPerKg > (isElderlyOrShock ? 2.8 : 3.8);
      const isFatalOverdose = totalMgPerKg > (isElderlyOrShock ? 4.2 : 5.2);

      if (isFatalOverdose) {
        const bpDropPercent = Math.min(95, 75 + totalMgPerKg * 4);
        const newSbp = Math.max(0, Math.round(phys.sbp * (1 - bpDropPercent / 100)));
        const newDbp = Math.max(0, Math.round(phys.dbp * (1 - bpDropPercent / 100)));
        const newMap = Math.round((newSbp + 2 * newDbp) / 3);
        const newHr = Math.max(0, Math.round(phys.hr - 45));

        return {
          narrative: `🚨 FATAL PROPOFOL OVERDOSE (${dose}mg IV, Total active: ${Math.round(totalPropofol)}mg / ${totalMgPerKg.toFixed(1)} mg/kg)! Catastrophic cardiovascular collapse! Profound myocardial depression & total peripheral vasodilation: BP crashed to ${newSbp}/${newDbp} mmHg (MAP ${newMap})! Severe sinus bradycardia (${newHr} bpm) degenerating to arrest!`,
          vitalsChanges: {
            sbp: newSbp,
            dbp: newDbp,
            map: newMap,
            hr: newHr,
            consciousness: 'coma',
            bis: 5,
            rr: phys.airwayDevice === 'ett' ? phys.rr : 0,
            rhythm: newMap < 25 ? 'Pulseless Electrical Activity (PEA)' : 'Sinus Bradycardia',
          },
        };
      } else if (isToxicOverdose) {
        const bpDropPercent = Math.min(78, 48 + totalMgPerKg * 7);
        const newSbp = Math.max(0, Math.round(phys.sbp * (1 - bpDropPercent / 100)));
        const newDbp = Math.max(0, Math.round(phys.dbp * (1 - bpDropPercent / 100)));
        const newMap = Math.round((newSbp + 2 * newDbp) / 3);
        const newHr = Math.max(0, Math.round(phys.hr - 25));

        return {
          narrative: `⚠️ SEVERE PROPOFOL OVERDOSE (${dose}mg IV, Total active: ${Math.round(totalPropofol)}mg / ${totalMgPerKg.toFixed(1)} mg/kg)! Severe hypotension and myocardial depression! BP collapsed to ${newSbp}/${newDbp} mmHg (MAP ${newMap}) with marked bradycardia (${newHr} bpm)! Prepare vasopressors immediately!`,
          vitalsChanges: {
            sbp: newSbp,
            dbp: newDbp,
            map: newMap,
            hr: newHr,
            consciousness: 'deep',
            bis: 18,
            rr: phys.airwayDevice === 'ett' ? phys.rr : 0,
          },
        };
      }

      if (coInduction.isTherapeuticInduction) {
        let bpDropPercent = isElderlyOrShock ? Math.min(50, 22 + totalMgPerKg * 8) : Math.min(35, 14 + totalMgPerKg * 5);

        // If Ketamine is on board (Ketofol), sympathetic stimulation blunts propofol hypotension!
        if (coInduction.activeKetamineMg > 15) {
          bpDropPercent = Math.max(5, bpDropPercent - 15);
        }

        const newSbp = Math.max(0, Math.round(phys.sbp * (1 - bpDropPercent / 100)));
        const newDbp = Math.max(0, Math.round(phys.dbp * (1 - bpDropPercent / 100)));
        const newMap = Math.round((newSbp + 2 * newDbp) / 3);

        let narrativeText = '';
        if (coInduction.isKetofol) {
          narrativeText = `Propofol ${dose}mg IV given with ${coInduction.activeKetamineMg}mg active Ketamine on board (Ketofol Co-Induction). Potent NMDA-antagonist and GABA-A agonist synergy! Balanced co-induction induces deep general anesthesia (BIS 40) with stable hemodynamics. Patient is unconscious and ready for airway management.`;
        } else if (priorPropofol > 10) {
          narrativeText = `Propofol ${dose}mg IV added (Total cumulative active: ${Math.round(totalPropofol)}mg, ${totalMgPerKg.toFixed(2)} mg/kg). Full therapeutic induction achieved through cumulative dosing! Patient loses eyelash reflex, becomes apneic and deeply unconscious (BIS 36).`;
        } else {
          narrativeText = `Propofol ${dose}mg IV administered (${totalMgPerKg.toFixed(2)} mg/kg). Patient rapidly loses eyelash reflex and becomes apneic. SBP falls by ${Math.round(bpDropPercent)}% to ${newSbp}/${newDbp} (MAP ${newMap}). General anesthesia induced.`;
        }

        return {
          narrative: narrativeText,
          vitalsChanges: {
            sbp: newSbp,
            dbp: newDbp,
            map: newMap,
            consciousness: 'unconscious',
            bis: Math.max(0, 40 - Math.round(coInduction.totalEquivalentFraction * 8)),
            rr: phys.airwayDevice === 'ett' ? phys.rr : 0, // Apnea
          },
        };
      } else if (totalMgPerKg < 0.6) {
        // Minimal sub-therapeutic sedation
        const bpDrop = Math.round(phys.sbp * 0.05);
        return {
          narrative: `Propofol ${dose}mg IV given (Total active: ${Math.round(totalPropofol)}mg, ${totalMgPerKg.toFixed(2)} mg/kg). Sub-therapeutic sedation dose. Patient feels light-headed and drowsy, but airway reflexes and breathing remain fully intact (BIS 82).`,
          vitalsChanges: {
            sbp: Math.max(0, phys.sbp - bpDrop),
            map: Math.max(0, phys.map - Math.round(bpDrop * 0.7)),
            consciousness: 'drowsy',
            bis: 82,
          },
        };
      } else {
        // Moderate sedation (Stage II excitement risk)
        const bpDrop = Math.round(phys.sbp * 0.15);
        return {
          narrative: `Propofol ${dose}mg IV given (Total active: ${Math.round(totalPropofol)}mg, ${totalMgPerKg.toFixed(2)} mg/kg). Moderate sedation achieved, but insufficient alone for tracheal intubation. Patient is in Stage II with reactive vocal cords and slurred speech (BIS 66).`,
          vitalsChanges: {
            sbp: Math.max(0, phys.sbp - bpDrop),
            map: Math.max(0, phys.map - Math.round(bpDrop * 0.7)),
            consciousness: 'sedated',
            bis: 66,
          },
        };
      }
    },
  },
  {
    id: 'ketamine',
    name: 'Ketamine (Ketalar)',
    category: 'Induction & Hypnotics',
    unit: 'mg',
    mgPerKgMin: 1.0,
    mgPerKgMax: 2.0,
    quickDoses: [25, 50, 100, 150],
    routes: ['IV Bolus', 'IM', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 45,
    peakSec: 90,
    durationSec: 900,
    description: 'NMDA receptor antagonist. Dissociative anesthesia, sympathetic stimulation (↑HR, ↑BP), preserved airway reflexes and potent bronchodilation.',
    patientWarning: (p) => {
      if (p.keyComorbidities.some(c => c.toLowerCase().includes('coronary') || c.toLowerCase().includes('ischemic'))) {
        return 'CAD/Ischemia: Sympathetic surge increases myocardial oxygen consumption and may trigger ischemia!';
      }
      return null;
    },
    applyEffect: (phys, dose, p, route, activeDrugs) => {
      const priorKetamine = getActiveDrugDose(activeDrugs, 'ketamine');
      const totalKetamine = priorKetamine + dose;
      const totalMgPerKg = totalKetamine / p.weightKg;
      const hrRise = Math.round(Math.min(25, totalKetamine * 0.15));
      const bpRise = Math.round(Math.min(30, totalKetamine * 0.2));

      // Check co-induction status (e.g. Ketofol if Propofol is already active)
      const coInduction = calculateCumulativeInductionStatus(p, activeDrugs, 'ketamine', dose);

      if (coInduction.isTherapeuticInduction) {
        const narrativeText = coInduction.isKetofol
          ? `Ketamine ${dose}mg IV added with ${coInduction.activePropofolMg}mg Propofol on board (Ketofol Co-Induction). Potent neuro-pharmacologic synergy: cataleptic dissociative state + GABAergic cortical suppression. Patient is deeply unconscious (BIS 42) with stable hemodynamics and bronchodilation.`
          : `Ketamine ${dose}mg IV given (Total active: ${Math.round(totalKetamine)}mg, ${totalMgPerKg.toFixed(2)} mg/kg). Cataleptic dissociative state induced with nystagmus. Sympathetic stimulation: HR +${hrRise} bpm, BP +${bpRise} mmHg. Potent bronchial smooth muscle relaxation.`;

        return {
          narrative: narrativeText,
          vitalsChanges: {
            hr: phys.hr + Math.round(hrRise * 0.7),
            sbp: phys.sbp + bpRise,
            dbp: phys.dbp + Math.round(bpRise * 0.6),
            map: Math.round((phys.sbp + bpRise + 2 * (phys.dbp + bpRise * 0.6)) / 3),
            consciousness: 'unconscious',
            bis: 45,
            painScore: 0,
            airwayResistanceCmH2o: Math.max(12, phys.airwayResistanceCmH2o - 8),
            rr: phys.airwayDevice === 'ett' ? phys.rr : 0,
          },
        };
      } else if (totalMgPerKg < 0.6) {
        return {
          narrative: `Ketamine ${dose}mg IV given (Low analgesic/pre-induction dose: ${totalMgPerKg.toFixed(2)} mg/kg). Profound somatic analgesia produced with preserved airway reflexes. Patient is calm and drowsy.`,
          vitalsChanges: {
            hr: phys.hr + Math.round(hrRise * 0.5),
            sbp: phys.sbp + Math.round(bpRise * 0.5),
            map: phys.map + Math.round(bpRise * 0.4),
            consciousness: 'drowsy',
            bis: 82,
            painScore: 0,
          },
        };
      } else {
        return {
          narrative: `Ketamine ${dose}mg IV given (Total active: ${Math.round(totalKetamine)}mg, ${totalMgPerKg.toFixed(2)} mg/kg). Cataleptic dissociative sedation. Nystagmus present, airway reflexes active.`,
          vitalsChanges: {
            hr: phys.hr + hrRise,
            sbp: phys.sbp + bpRise,
            dbp: phys.dbp + Math.round(bpRise * 0.6),
            map: Math.round((phys.sbp + bpRise + 2 * (phys.dbp + bpRise * 0.6)) / 3),
            consciousness: 'sedated',
            bis: 62,
            painScore: 0,
          },
        };
      }
    },
  },
  {
    id: 'etomidate',
    name: 'Etomidate (Amidate)',
    category: 'Induction & Hypnotics',
    unit: 'mg',
    mgPerKgMin: 0.2,
    mgPerKgMax: 0.3,
    quickDoses: [10, 14, 18, 20],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 25,
    peakSec: 45,
    durationSec: 420,
    description: 'Imidazoline derivative GABA-A agonist. Outstanding cardiovascular stability with minimal change in MAP, HR, or cardiac output. Causes transient adrenal steroidogenesis suppression.',
    patientWarning: (p) => {
      if (p.history.toLowerCase().includes('septic') || p.keyComorbidities.some(c => c.toLowerCase().includes('adrenal'))) {
        return 'Sepsis/Adrenal Insufficiency: Inhibits 11-beta-hydroxylase, suppressing cortisol production for 24 hours.';
      }
      return null;
    },
    applyEffect: (phys, dose, p) => {
      const mgPerKg = dose / p.weightKg;
      if (mgPerKg < 0.15) {
        return {
          narrative: `Etomidate ${dose}mg IV given (sub-therapeutic dose: ${mgPerKg.toFixed(2)} mg/kg). Mild sedation achieved, but patient remains conscious.`,
          vitalsChanges: { consciousness: 'sedated', bis: 72 },
        };
      }
      return {
        narrative: `Etomidate ${dose}mg IV given (${mgPerKg.toFixed(2)} mg/kg). Rapid induction with exceptional hemodynamic stability (SBP ${phys.sbp}, HR ${phys.hr}). Patient is unconscious and apneic with transient myoclonus.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - 4),
          map: Math.max(0, phys.map - 3),
          consciousness: 'unconscious',
          bis: 36,
          rr: phys.airwayDevice === 'ett' ? phys.rr : 0,
        },
      };
    },
  },
  {
    id: 'thiopental',
    name: 'Thiopental (Sodium Pentothal)',
    category: 'Induction & Hypnotics',
    unit: 'mg',
    mgPerKgMin: 3.0,
    mgPerKgMax: 5.0,
    quickDoses: [100, 200, 250, 350, 500],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 25,
    peakSec: 45,
    durationSec: 600,
    description: 'Ultra-short acting barbiturate. Rapid induction, potent neuroprotection by decreasing CMRO2 and ICP. Causes venodilation and histamine release; strictly contraindicated in porphyria.',
    applyEffect: (phys, dose, p) => {
      const mgPerKg = dose / p.weightKg;
      const bpDrop = Math.round(phys.sbp * (0.10 + mgPerKg * 0.03));
      const hrComp = Math.round(bpDrop * 0.3);
      return {
        narrative: `Thiopental ${dose}mg IV given (${mgPerKg.toFixed(1)} mg/kg). Rapid smooth induction in one arm-brain circulation time (~25s). Patient becomes apneic and unconscious. Mild histamine-mediated vasodilation.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - bpDrop),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.7)),
          hr: phys.hr + hrComp,
          consciousness: 'unconscious',
          bis: 32,
          rr: phys.airwayDevice === 'ett' ? phys.rr : 0,
        },
      };
    },
  },
  {
    id: 'methohexital',
    name: 'Methohexital (Brevital)',
    category: 'Induction & Hypnotics',
    unit: 'mg',
    mgPerKgMin: 1.0,
    mgPerKgMax: 1.5,
    quickDoses: [50, 75, 100, 150],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 25,
    peakSec: 45,
    durationSec: 420,
    description: 'Oxybarbiturate hypnotic. Lowers seizure threshold (ideal for ECT), rapid hepatic clearance. Apnea, moderate vasodilation.',
    applyEffect: (phys, dose, p) => {
      const mgPerKg = dose / p.weightKg;
      const bpDrop = Math.round(phys.sbp * 0.15);
      return {
        narrative: `Methohexital ${dose}mg IV given (${mgPerKg.toFixed(1)} mg/kg). Rapid induction with prominent burst suppression on EEG.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - bpDrop),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.7)),
          consciousness: 'unconscious',
          bis: 35,
          rr: phys.airwayDevice === 'ett' ? phys.rr : 0,
        },
      };
    },
  },
  {
    id: 'dexmedetomidine',
    name: 'Dexmedetomidine (Precedex)',
    category: 'Induction & Hypnotics',
    unit: 'mcg',
    mcgPerKgMin: 0.5,
    mcgPerKgMax: 1.0,
    quickDoses: [20, 50, 75, 100],
    routes: ['IV Infusion', 'IV Bolus'],
    defaultRoute: 'IV Infusion',
    onsetSec: 120,
    peakSec: 300,
    durationSec: 1800,
    description: 'Selective alpha-2 adrenoreceptor agonist. Provides "cooperative sedation", anxiolysis, and analgesia WITHOUT respiratory depression. Causes bradycardia and hypotension.',
    patientWarning: (p) => {
      if ((p.baselineVitals?.hr ?? 75) < 55) {
        return 'Bradycardia alert: Alpha-2 agonism decreases central sympathetic outflow, risking severe bradycardia or heart block.';
      }
      return null;
    },
    applyEffect: (phys, dose) => {
      const hrDrop = Math.round(Math.min(20, dose * 0.2));
      const bpDrop = Math.round(Math.min(22, dose * 0.25));
      return {
        narrative: `Dexmedetomidine ${dose}mcg IV administered. Patient enters cooperative sedation, easily arousable. Respiratory drive completely preserved. HR decreased by ${hrDrop} bpm.`,
        vitalsChanges: {
          hr: Math.max(0, phys.hr - hrDrop),
          sbp: Math.max(0, phys.sbp - bpDrop),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.7)),
          consciousness: 'sedated',
          bis: 65,
          painScore: Math.max(0, phys.painScore - 3),
        },
      };
    },
  },

  // ========================================================
  // 2. OPIOIDS
  // ========================================================
  {
    id: 'fentanyl',
    name: 'Fentanyl (Sublimaze)',
    category: 'Opioids',
    unit: 'mcg',
    mcgPerKgMin: 1.0,
    mcgPerKgMax: 3.0,
    quickDoses: [25, 50, 100, 150, 250],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 180,
    durationSec: 1800,
    description: 'Potent synthetic mu-opioid agonist (100x morphine). Blunts sympathetic surge during laryngoscopy and incision. High doses risk chest wall rigidity.',
    applyEffect: (phys, dose, p, route, activeDrugs) => {
      const priorFent = getActiveDrugDose(activeDrugs, 'fentanyl');
      const totalFent = priorFent + dose;
      const mcgPerKg = totalFent / p.weightKg;

      if (mcgPerKg > 4.5) {
        return {
          narrative: `🚨 SEVERE OPIOID OVERDOSE: Fentanyl ${dose}mcg IV administered (Total active: ${Math.round(totalFent)}mcg / ${mcgPerKg.toFixed(1)} mcg/kg)! Complete central respiratory arrest (APNEA) and chest wall rigidity ("wooden chest syndrome")! Bag-mask ventilation is severely impaired! Administer Naloxone immediately or deliver positive pressure ventilation!`,
          vitalsChanges: {
            hr: Math.max(0, phys.hr - 22),
            rr: phys.airwayDevice === 'ett' ? phys.rr : 0,
            painScore: 0,
            consciousness: phys.consciousness === 'awake' ? 'sedated' : phys.consciousness,
          },
        };
      }

      const hrDrop = Math.round(Math.min(18, totalFent * 0.08));
      const rrDrop = Math.round(Math.min(8, totalFent * 0.04));
      const painReduction = Math.min(10, Math.round(totalFent * 0.06));

      return {
        narrative: priorFent > 10
          ? `Fentanyl ${dose}mcg IV added (Total cumulative active: ${Math.round(totalFent)}mcg). Enhanced analgesia and sympathetic blunting. Respiratory drive suppressed.`
          : `Fentanyl ${dose}mcg IV given. Laryngeal and surgical sympathetic reflexes blunted. Respiratory rate slowed, analgesia established.`,
        vitalsChanges: {
          hr: Math.max(0, phys.hr - hrDrop),
          rr: phys.airwayDevice === 'ett' ? phys.rr : Math.max(0, phys.rr - rrDrop),
          painScore: Math.max(0, phys.painScore - painReduction),
        },
      };
    },
  },
  {
    id: 'remifentanil',
    name: 'Remifentanil (Ultiva)',
    category: 'Opioids',
    unit: 'mcg',
    mcgPerKgMin: 0.5,
    mcgPerKgMax: 2.0,
    quickDoses: [50, 100, 150, 200],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Infusion',
    onsetSec: 45,
    peakSec: 90,
    durationSec: 300,
    description: 'Ultra-short acting mu-opioid with ester linkage. Metabolized by non-specific plasma and tissue esterases (context-sensitive half-time ~3-4 min regardless of infusion length).',
    applyEffect: (phys, dose) => {
      const hrDrop = Math.round(Math.min(22, dose * 0.12));
      const bpDrop = Math.round(Math.min(20, dose * 0.1));
      return {
        narrative: `Remifentanil ${dose}mcg IV administered. Rapid, profound opioid suppression of airway reflexes. Heart rate and MAP decrease. Clearance will occur in ~5 minutes upon stopping.`,
        vitalsChanges: {
          hr: Math.max(0, phys.hr - hrDrop),
          sbp: Math.max(0, phys.sbp - bpDrop),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.8)),
          painScore: 0,
        },
      };
    },
  },
  {
    id: 'sufentanil',
    name: 'Sufentanil (Sufenta)',
    category: 'Opioids',
    unit: 'mcg',
    mcgPerKgMin: 0.1,
    mcgPerKgMax: 0.5,
    quickDoses: [5, 10, 20, 30],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 150,
    durationSec: 2400,
    description: 'Extremely potent synthetic opioid (5-10x more potent than fentanyl). Used in cardiac surgery and major abdominal cases for prolonged hemodynamic stability.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Sufentanil ${dose}mcg IV administered. Intense analgesia and hemodynamic blunting. Respiratory drive suppressed.`,
        vitalsChanges: {
          hr: Math.max(0, phys.hr - 12),
          sbp: Math.max(0, phys.sbp - 14),
          map: Math.max(0, phys.map - 10),
          painScore: 0,
        },
      };
    },
  },
  {
    id: 'alfentanil',
    name: 'Alfentanil (Alfenta)',
    category: 'Opioids',
    unit: 'mcg',
    mcgPerKgMin: 10,
    mcgPerKgMax: 20,
    quickDoses: [250, 500, 1000],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 30,
    peakSec: 60,
    durationSec: 900,
    description: 'Rapid-onset opioid (low pKa 6.5 means 90% non-ionized at physiologic pH, crossing blood-brain barrier almost instantaneously). Short duration.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Alfentanil ${dose}mcg IV given. Near-immediate suppression of airway and cough reflexes.`,
        vitalsChanges: {
          hr: Math.max(0, phys.hr - 10),
          painScore: Math.max(0, phys.painScore - 5),
        },
      };
    },
  },
  {
    id: 'morphine',
    name: 'Morphine Sulfate',
    category: 'Opioids',
    unit: 'mg',
    mgPerKgMin: 0.05,
    mgPerKgMax: 0.15,
    quickDoses: [2, 4, 6, 8, 10],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 300,
    peakSec: 900,
    durationSec: 14400,
    description: 'Natural phenanthrene opioid alkaloid. Slower onset (low lipid solubility) but long post-op duration. Causes histamine release and active metabolite M6G accumulation in renal failure.',
    patientWarning: (p) => {
      if (p.baselineLabs && p.baselineLabs.cr > 1.4) {
        return 'Renal insufficiency: Morphine-6-glucuronide (M6G) accumulates, causing delayed, refractory respiratory depression!';
      }
      return null;
    },
    applyEffect: (phys, dose) => {
      return {
        narrative: `Morphine ${dose}mg IV given. Onset takes 5-10 min; provides prolonged post-op analgesia. Mild histamine venodilation.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - 6),
          painScore: Math.max(0, phys.painScore - 5),
        },
      };
    },
  },
  {
    id: 'hydromorphone',
    name: 'Hydromorphone (Dilaudid)',
    category: 'Opioids',
    unit: 'mg',
    mgPerKgMin: 0.01,
    mgPerKgMax: 0.02,
    quickDoses: [0.5, 1.0, 1.5, 2.0],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 180,
    peakSec: 480,
    durationSec: 10800,
    description: 'Semi-synthetic opioid (5-7x potency of morphine). No active neurotoxic metabolites, no significant histamine release; preferred in renal dysfunction.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Hydromorphone ${dose}mg IV administered. Potent, clean analgesia without histamine release.`,
        vitalsChanges: {
          painScore: Math.max(0, phys.painScore - 6),
          rr: phys.airwayDevice === 'ett' ? phys.rr : Math.max(0, phys.rr - 4),
        },
      };
    },
  },
  {
    id: 'meperidine',
    name: 'Meperidine (Demerol)',
    category: 'Opioids',
    unit: 'mg',
    quickDoses: [25, 50, 75],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 120,
    peakSec: 300,
    durationSec: 7200,
    description: 'Synthetic opioid with atropine-like structure and kappa-receptor agonism. Gold standard for treating post-anesthetic shivering (reduces shivering threshold). Normeperidine metabolite is neurotoxic.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Meperidine ${dose}mg IV administered. Postoperative shivering abolished via kappa-receptor modulation. Mild vagolytic tachycardia.`,
        vitalsChanges: {
          hr: phys.hr + 6,
          painScore: Math.max(0, phys.painScore - 4),
        },
      };
    },
  },

  // ========================================================
  // 3. MUSCLE RELAXANTS (NMBAS)
  // ========================================================
  {
    id: 'succinylcholine',
    name: 'Succinylcholine (Anectine)',
    category: 'Muscle Relaxants',
    unit: 'mg',
    mgPerKgMin: 1.0,
    mgPerKgMax: 1.5,
    quickDoses: [50, 80, 100, 140],
    routes: ['IV Bolus', 'IM'],
    defaultRoute: 'IV Bolus',
    onsetSec: 45,
    peakSec: 75,
    durationSec: 480,
    description: 'Depolarizing neuromuscular blocker. Ultra-rapid onset (~45s) and short duration (~6-10 min, plasma butyrylcholinesterase metabolism). Causes generalized fasciculations, ↑K+ by 0.5-1.0 mEq/L, and triggers Malignant Hyperthermia.',
    patientWarning: (p) => {
      if (p.baselineLabs && p.baselineLabs.k >= 5.0) {
        return 'CONTRAINDICATION: Pre-existing hyperkalemia (K >= 5.0). Succinylcholine raises serum potassium by 0.5-1.0 mEq/L and can induce fatal ventricular fibrillation / asystole!';
      }
      if (p.keyComorbidities.some(c => c.toLowerCase().includes('burn') || c.toLowerCase().includes('crush') || c.toLowerCase().includes('denervation'))) {
        return 'CONTRAINDICATION: Proliferation of extrajunctional acetylcholine receptors. Lethal hyperkalemic cardiac arrest risk!';
      }
      return null;
    },
    applyEffect: (phys, dose, p, route, activeDrugs) => {
      const priorSux = getActiveDrugDose(activeDrugs, 'succinylcholine');
      const totalSux = priorSux + dose;
      const totalMgPerKg = totalSux / p.weightKg;
      const kRise = 0.6;
      const currentK = phys.serumPotassiumMeq ?? phys.potassiumMeqL ?? 4.0;
      const newK = Number((currentK + kRise).toFixed(1));

      if (newK >= 6.5) {
        return {
          narrative: `SUCCINYLCHOLINE DISASTER: ${dose}mg given to hyperkalemic patient. Serum K+ spiked to ${newK} mEq/L! Monitor shows peaked T-waves, widening QRS, and degenerate Ventricular Tachycardia!`,
          vitalsChanges: {
            serumPotassiumMeq: newK,
            rhythm: 'Ventricular Tachycardia (VT)',
            sbp: 50,
            dbp: 25,
            map: 33,
            muscleTone: 'flaccid',
            trainOfFour: 0,
            tofRatio: 0,
          },
        };
      }

      if (totalMgPerKg < 0.6) {
        return {
          narrative: `Succinylcholine ${dose}mg IV given (Total active: ${Math.round(totalSux)}mg, ${totalMgPerKg.toFixed(2)} mg/kg). Transient muscle twitching observed, but inadequate motor block for intubation alone (TOF 2/4).`,
          vitalsChanges: {
            serumPotassiumMeq: newK,
            muscleTone: 'relaxed',
            muscleTonePercent: 40,
            trainOfFour: 2,
            tofCount: 2,
            tofRatio: 0.4,
          },
        };
      }

      return {
        narrative: priorSux > 10
          ? `Succinylcholine ${dose}mg IV added (Total cumulative active: ${Math.round(totalSux)}mg, ${totalMgPerKg.toFixed(2)} mg/kg). Complete motor flaccidity in 45s (TOF 0/4 twitches). Vocal cords widely abducted and motionless.`
          : `Succinylcholine ${dose}mg IV given (${totalMgPerKg.toFixed(2)} mg/kg). Rapid generalized fasciculations followed by complete motor flaccidity in 45s. Train-of-Four 0/4. Vocal cords widely abducted and motionless.`,
        vitalsChanges: {
          serumPotassiumMeq: newK,
          muscleTone: 'flaccid',
          muscleTonePercent: 0,
          trainOfFour: 0,
          tofCount: 0,
          tofRatio: 0,
          rr: phys.airwayDevice === 'ett' ? phys.rr : 0,
        },
      };
    },
  },
  {
    id: 'rocuronium',
    name: 'Rocuronium (Zemuron)',
    category: 'Muscle Relaxants',
    unit: 'mg',
    mgPerKgMin: 0.6,
    mgPerKgMax: 1.2,
    quickDoses: [30, 50, 70, 100, 120],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 120,
    durationSec: 2400,
    description: 'Non-depolarizing steroidal neuromuscular blocker. Rapid onset (60-90s at 0.6 mg/kg; 60s at RSI dose 1.2 mg/kg). Intermediate duration (~35-50 min). Easily and rapidly reversed with Sugammadex.',
    applyEffect: (phys, dose, p, route, activeDrugs) => {
      const priorRoc = getActiveDrugDose(activeDrugs, 'rocuronium');
      const totalRoc = priorRoc + dose;
      const totalMgPerKg = totalRoc / p.weightKg;

      if (totalMgPerKg < 0.35) {
        return {
          narrative: `Rocuronium ${dose}mg IV administered (Total active: ${Math.round(totalRoc)}mg, ${totalMgPerKg.toFixed(2)} mg/kg). Priming/partial neuromuscular block achieved (TOF 3/4). Vocal cords remain active.`,
          vitalsChanges: {
            muscleTone: 'relaxed',
            muscleTonePercent: 65,
            trainOfFour: 3,
            tofCount: 3,
            tofRatio: 0.6,
          },
        };
      }

      return {
        narrative: priorRoc > 5
          ? `Rocuronium ${dose}mg IV added (Total cumulative active: ${Math.round(totalRoc)}mg, ${totalMgPerKg.toFixed(2)} mg/kg). Complete flaccid neuromuscular paralysis in 60 seconds (TOF 0/4 twitches). Optimal intubation conditions established.`
          : `Rocuronium ${dose}mg IV administered (${totalMgPerKg.toFixed(2)} mg/kg). Complete flaccid neuromuscular paralysis in 60-75 seconds. Train-of-Four 0/4 twitches. Optimal intubation conditions established.`,
        vitalsChanges: {
          muscleTone: 'flaccid',
          muscleTonePercent: 0,
          trainOfFour: 0,
          tofCount: 0,
          tofRatio: 0,
          rr: phys.airwayDevice === 'ett' ? phys.rr : 0,
        },
      };
    },
  },
  {
    id: 'vecuronium',
    name: 'Vecuronium (Norcuron)',
    category: 'Muscle Relaxants',
    unit: 'mg',
    mgPerKgMin: 0.08,
    mgPerKgMax: 0.12,
    quickDoses: [4, 6, 8, 10],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 120,
    peakSec: 180,
    durationSec: 2400,
    description: 'Intermediate non-depolarizing steroidal NMBA. Devoid of cardiovascular side effects (no tachycardia or histamine release). Hepatic and renal clearance.',
    applyEffect: (phys, dose, p, route, activeDrugs) => {
      const priorVec = getActiveDrugDose(activeDrugs, 'vecuronium');
      const totalVec = priorVec + dose;
      const totalMgPerKg = totalVec / p.weightKg;

      if (totalMgPerKg < 0.06) {
        return {
          narrative: `Vecuronium ${dose}mg IV given (Total active: ${totalVec.toFixed(1)}mg, ${totalMgPerKg.toFixed(3)} mg/kg). Partial block (TOF 2/4). Inadequate relaxation for intubation alone.`,
          vitalsChanges: {
            muscleTone: 'relaxed',
            muscleTonePercent: 35,
            trainOfFour: 2,
            tofCount: 2,
            tofRatio: 0.35,
          },
        };
      }

      return {
        narrative: priorVec > 1
          ? `Vecuronium ${dose}mg IV added (Total cumulative active: ${totalVec.toFixed(1)}mg, ${totalMgPerKg.toFixed(2)} mg/kg). Complete motor flaccidity established with excellent hemodynamic stability. TOF 0/4 twitches.`
          : `Vecuronium ${dose}mg IV given (${totalMgPerKg.toFixed(2)} mg/kg). Complete motor relaxation in 2.5 minutes with perfect hemodynamic stability. TOF 0/4.`,
        vitalsChanges: {
          muscleTone: 'flaccid',
          muscleTonePercent: 0,
          trainOfFour: 0,
          tofCount: 0,
          tofRatio: 0,
          rr: phys.airwayDevice === 'ett' ? phys.rr : 0,
        },
      };
    },
  },
  {
    id: 'cisatracurium',
    name: 'Cisatracurium (Nimbex)',
    category: 'Muscle Relaxants',
    unit: 'mg',
    mgPerKgMin: 0.15,
    mgPerKgMax: 0.2,
    quickDoses: [8, 10, 14, 18],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 150,
    peakSec: 240,
    durationSec: 2700,
    description: 'Benzylisoquinolinium NMBA. Undergoes organ-independent Hofmann elimination (pH and temperature dependent). Zero histamine release. Ideal for patients with severe renal or liver failure.',
    applyEffect: (phys, dose, p, route, activeDrugs) => {
      const priorCis = getActiveDrugDose(activeDrugs, 'cisatracurium');
      const totalCis = priorCis + dose;
      const totalMgPerKg = totalCis / p.weightKg;

      if (totalMgPerKg < 0.08) {
        return {
          narrative: `Cisatracurium ${dose}mg IV given (Total active: ${totalCis.toFixed(1)}mg, ${totalMgPerKg.toFixed(3)} mg/kg). Partial block (TOF 2/4).`,
          vitalsChanges: {
            muscleTone: 'relaxed',
            muscleTonePercent: 40,
            trainOfFour: 2,
            tofCount: 2,
            tofRatio: 0.4,
          },
        };
      }

      return {
        narrative: priorCis > 2
          ? `Cisatracurium ${dose}mg IV added (Total cumulative active: ${totalCis.toFixed(1)}mg, ${totalMgPerKg.toFixed(2)} mg/kg). Complete neuromuscular flaccidity achieved. TOF 0/4 twitches.`
          : `Cisatracurium ${dose}mg IV given (${totalMgPerKg.toFixed(2)} mg/kg). Spontaneous Hofmann degradation in plasma ensures predictable duration even in renal failure. Flaccidity achieved. TOF 0/4.`,
        vitalsChanges: {
          muscleTone: 'flaccid',
          muscleTonePercent: 0,
          trainOfFour: 0,
          tofCount: 0,
          tofRatio: 0,
          rr: phys.airwayDevice === 'ett' ? phys.rr : 0,
        },
      };
    },
  },
  {
    id: 'atracurium',
    name: 'Atracurium (Tracrium)',
    category: 'Muscle Relaxants',
    unit: 'mg',
    mgPerKgMin: 0.4,
    mgPerKgMax: 0.5,
    quickDoses: [20, 30, 40, 50],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 120,
    peakSec: 180,
    durationSec: 2400,
    description: 'Benzylisoquinolinium NMBA cleared by ester hydrolysis and Hofmann elimination. Rapid bolus injection may cause histamine release (flushing, transient hypotension; in pheochromocytoma precipitates catecholamine release).',
    patientWarning: (p) => {
      if (p.procedure.toLowerCase().includes('adrenal') || p.keyComorbidities.some(c => c.toLowerCase().includes('pheo'))) {
        return 'CONTRAINDICATED in Pheochromocytoma: Histamine release triggers chromaffin tumor catecholamine release!';
      }
      return null;
    },
    applyEffect: (phys, dose, p) => {
      const isPheo = p?.procedure?.toLowerCase().includes('adrenal') || p?.keyComorbidities?.some(c => c.toLowerCase().includes('pheo'));
      if (isPheo) {
        return {
          narrative: `🚨 HISTAMINE CATASTROPHE: Atracurium ${dose}mg IV given in Pheochromocytoma! Histamine degranulation directly triggers explosive adrenal catecholamine release: SBP surges to 255/135 mmHg, HR spikes to 145 bpm!`,
          vitalsChanges: {
            sbp: 255,
            dbp: 135,
            map: 175,
            hr: 145,
            rhythm: 'Sinus Tachycardia',
            muscleTone: 'flaccid',
            muscleTonePercent: 0,
            tofCount: 0,
            tofRatio: 0,
          },
        };
      }
      const bpDrop = Math.round(phys.sbp * 0.08);
      return {
        narrative: `Atracurium ${dose}mg IV given. Hofmann elimination active. Mild transient histamine flushing observed. TOF 0/4.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - bpDrop),
          muscleTone: 'flaccid',
          muscleTonePercent: 0,
          trainOfFour: 0,
          tofCount: 0,
          tofRatio: 0,
        },
      };
    },
  },
  {
    id: 'pancuronium',
    name: 'Pancuronium (Pavulon)',
    category: 'Muscle Relaxants',
    unit: 'mg',
    mgPerKgMin: 0.08,
    mgPerKgMax: 0.12,
    quickDoses: [4, 6, 8],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 180,
    peakSec: 300,
    durationSec: 5400,
    description: 'Long-acting aminosteroid neuromuscular blocker. Possesses cardiac muscarinic (M2) vagolytic and sympathetic noradrenaline-reuptake-blocking properties. CONTRAINDICATED in pheochromocytoma (causes severe tachycardia and hypertension).',
    patientWarning: (p) => {
      if (p.procedure.toLowerCase().includes('adrenal') || p.keyComorbidities.some(c => c.toLowerCase().includes('pheo'))) {
        return 'CONTRAINDICATED in Pheochromocytoma: Vagolytic and sympathetic properties cause severe tachycardic hypertensive crises!';
      }
      return null;
    },
    applyEffect: (phys, dose, p) => {
      const isPheo = p?.procedure?.toLowerCase().includes('adrenal') || p?.keyComorbidities?.some(c => c.toLowerCase().includes('pheo'));
      if (isPheo) {
        return {
          narrative: `🚨 CONTRAINDICATED DRUG: Pancuronium ${dose}mg given in Pheochromocytoma! Strong vagolytic M2 blockade and inhibition of catecholamine reuptake trigger severe tachycardic surge (HR 150 bpm) and hypertensive crisis (SBP 250 mmHg)!`,
          vitalsChanges: {
            hr: 150,
            sbp: 250,
            dbp: 135,
            map: 173,
            rhythm: 'Sinus Tachycardia',
            muscleTone: 'flaccid',
            muscleTonePercent: 0,
            tofCount: 0,
            tofRatio: 0,
          },
        };
      }
      return {
        narrative: `Pancuronium ${dose}mg IV given. Complete neuromuscular blockade established (TOF 0/4). Vagolytic effect produces mild chronotropic acceleration (+15 bpm).`,
        vitalsChanges: {
          hr: phys.hr + 15,
          muscleTone: 'flaccid',
          muscleTonePercent: 0,
          tofCount: 0,
          tofRatio: 0,
        },
      };
    },
  },

  // ========================================================
  // 4. REVERSAL AGENTS
  // ========================================================
  {
    id: 'sugammadex',
    name: 'Sugammadex (Bridion)',
    category: 'Reversal Agents',
    unit: 'mg',
    mgPerKgMin: 2.0,
    mgPerKgMax: 16.0,
    fixedDoseDefault: 200,
    quickDoses: [100, 200, 400, 800, 1200],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 120,
    durationSec: 7200,
    description: 'Modified gamma-cyclodextrin. Selectively encapsulates steroidal NDNMBs (rocuronium, vecuronium) in a 1:1 molecular complex, terminating receptor binding. Reverses moderate block (TOF 2/4) at 2 mg/kg, deep block (PTC 1-2) at 4 mg/kg, and immediate rescue reversal at 16 mg/kg. NOTE: Has ZERO affinity for benzylisoquinolines (Cisatracurium) or Succinylcholine.',
    applyEffect: (phys, dose, p, route, activeDrugs) => {
      const mgPerKg = p ? dose / p.weightKg : 2.0;
      const activeList = activeDrugs || [];

      const hasSteroidal = activeList.some(
        (d) => ['rocuronium', 'vecuronium', 'pancuronium'].includes(d.drugId.toLowerCase()) && (d.currentIntensity === undefined || d.currentIntensity > 0.02)
      );
      const hasBenzylisoquinoline = activeList.some(
        (d) => ['cisatracurium', 'atracurium'].includes(d.drugId.toLowerCase()) && (d.currentIntensity === undefined || d.currentIntensity > 0.02)
      );
      const hasSuccinylcholine = activeList.some(
        (d) => d.drugId.toLowerCase() === 'succinylcholine' && (d.currentIntensity === undefined || d.currentIntensity > 0.02)
      );

      // Inappropriate Reversal Check: Sugammadex CANNOT reverse Cisatracurium!
      if (hasBenzylisoquinoline && !hasSteroidal) {
        return {
          narrative: `⚠️ Sugammadex ${dose}mg IV given (${mgPerKg.toFixed(1)} mg/kg). CLINICAL PHARMACOLOGY ALERT: Sugammadex selectively encapsulates STEROIDAL relaxants (Rocuronium / Vecuronium) and has ZERO affinity for benzylisoquinolines (Cisatracurium / Atracurium)! Neuromuscular blockade remains unchanged (TOF ${phys.tofCount}/4). Administer Neostigmine + Glycopyrrolate to reverse Cisatracurium!`,
          vitalsChanges: {},
        };
      }

      // Inappropriate Reversal Check: Sugammadex CANNOT reverse Succinylcholine!
      if (hasSuccinylcholine && !hasSteroidal) {
        return {
          narrative: `⚠️ Sugammadex ${dose}mg IV administered. Sugammadex has no affinity for depolarizing blockers (Succinylcholine). Blockade remains unchanged (TOF ${phys.tofCount}/4). Succinylcholine terminates spontaneously via plasma pseudocholinesterase.`,
          vitalsChanges: {},
        };
      }

      // Subtherapeutic dose check (< 1.5 mg/kg and < 80 mg)
      if (mgPerKg < 1.5 && dose < 80) {
        return {
          narrative: `Sugammadex ${dose}mg IV administered (${mgPerKg.toFixed(1)} mg/kg). Subtherapeutic dose for full reversal (< 2.0 mg/kg). Partial recovery observed: TOF 2/4. Consider an additional dose to ensure TOF ratio >= 0.90 before extubation.`,
          vitalsChanges: {
            muscleTone: 'relaxed',
            muscleTonePercent: 50,
            trainOfFour: 2,
            tofCount: 2,
            tofRatio: 0.45,
          },
        };
      }

      // Successful appropriate reversal of steroidal NDNMB
      return {
        narrative: `Sugammadex ${dose}mg IV administered (${mgPerKg.toFixed(1)} mg/kg). Rapid 1:1 molecular encapsulation of steroidal neuromuscular blocker. Blockade completely reversed! TOF 4/4 with ratio > 0.95. Strong spontaneous respiratory efforts and full motor tone restored.`,
        vitalsChanges: {
          muscleTone: 'normal',
          muscleTonePercent: 100,
          trainOfFour: 4,
          tofCount: 4,
          tofRatio: 0.98,
          rr: phys.airwayDevice === 'ett' ? phys.rr : 14,
        },
      };
    },
  },
  {
    id: 'neostigmine_glyco',
    name: 'Neostigmine + Glycopyrrolate',
    category: 'Reversal Agents',
    unit: 'mg',
    mgPerKgMin: 0.04,
    mgPerKgMax: 0.07,
    fixedDoseDefault: 3.5,
    quickDoses: [2.5, 3.5, 5.0],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 180,
    durationSec: 3600,
    description: 'Acetylcholinesterase inhibitor (Neostigmine 0.05 mg/kg) paired with quaternary muscarinic anticholinergic (Glycopyrrolate 0.01 mg/kg) to prevent profound muscarinic bradycardia, salivation, and bronchoconstriction. Effectively reverses ALL non-depolarizing neuromuscular blockers (Cisatracurium, Vecuronium, Rocuronium, Atracurium, Pancuronium).',
    patientWarning: (p) => {
      return null;
    },
    applyEffect: (phys, dose, p, route, activeDrugs) => {
      const mgPerKg = p ? dose / p.weightKg : 0.05;
      const activeList = activeDrugs || [];

      const hasSuccinylcholine = activeList.some(
        (d) => d.drugId.toLowerCase() === 'succinylcholine' && (d.currentIntensity === undefined || d.currentIntensity > 0.02)
      );

      if (hasSuccinylcholine) {
        return {
          narrative: `🚨 CONTRAINDICATION: Neostigmine administered during depolarizing block (Succinylcholine)! Anticholinesterase activity inhibits plasma pseudocholinesterase and prolongs succinylcholine paralysis. Never use neostigmine for depolarizing block!`,
          vitalsChanges: {
            muscleTone: 'flaccid',
            muscleTonePercent: 0,
            trainOfFour: 0,
            tofCount: 0,
            tofRatio: 0,
          },
        };
      }

      // Successful appropriate reversal of non-depolarizing neuromuscular blockade
      return {
        narrative: `Neostigmine ${dose}mg + Glycopyrrolate co-administered IV (${mgPerKg.toFixed(3)} mg/kg). Acetylcholinesterase enzyme inhibited, leading to acetylcholine accumulation at the neuromuscular junction and competitive reversal of non-depolarizing block (Rocuronium, Vecuronium, Cisatracurium). Muscarinic bradycardia and secretions neutralized by glycopyrrolate. Full motor strength restored: Train-of-Four 4/4 (ratio 0.94)!`,
        vitalsChanges: {
          muscleTone: 'normal',
          muscleTonePercent: 100,
          trainOfFour: 4,
          tofCount: 4,
          tofRatio: 0.94,
          rr: phys.airwayDevice === 'ett' ? phys.rr : 14,
        },
      };
    },
  },
  {
    id: 'naloxone',
    name: 'Naloxone (Narcan)',
    category: 'Reversal Agents',
    unit: 'mcg',
    fixedDoseDefault: 400,
    quickDoses: [40, 80, 100, 200, 400],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 120,
    durationSec: 2400,
    description: 'Competitive pure mu-opioid receptor antagonist. Reverses opioid-induced respiratory depression and sedation. Rapid high-dose reversal risks acute pulmonary edema, severe pain crisis, and sympathetic hypertensive storm.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Naloxone ${dose}mcg IV administered. Opioid receptors competitively blocked. Spontaneous respiratory drive vigorously stimulated; pupils dilate. Pain and sympathetic tone acutely return.`,
        vitalsChanges: {
          rr: Math.max(16, phys.rr + 8),
          hr: phys.hr + 18,
          sbp: phys.sbp + 25,
          map: phys.map + 20,
          painScore: 8,
          consciousness: 'awake',
          bis: 92,
        },
      };
    },
  },
  {
    id: 'flumazenil',
    name: 'Flumazenil (Romazicon)',
    category: 'Reversal Agents',
    unit: 'mg',
    fixedDoseDefault: 0.2,
    quickDoses: [0.2, 0.4, 0.6, 1.0],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 180,
    durationSec: 3600,
    description: 'Competitive antagonist at the benzodiazepine binding site on the GABA-A receptor. Reverses sedation from midazolam or lorazepam. Shorter half-life than midazolam (watch for resedation); contraindicated in chronic benzo dependence (seizures).',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Flumazenil ${dose}mg IV given. Benzodiazepine receptor antagonism achieved. Patient awakens promptly, oriented and cooperative.`,
        vitalsChanges: {
          consciousness: 'awake',
          bis: 94,
          rr: Math.max(14, phys.rr + 4),
        },
      };
    },
  },

  // ========================================================
  // 5. BENZODIAZEPINES
  // ========================================================
  {
    id: 'midazolam',
    name: 'Midazolam (Versed)',
    category: 'Benzodiazepines',
    unit: 'mg',
    mgPerKgMin: 0.02,
    mgPerKgMax: 0.05,
    quickDoses: [1, 2, 3, 5],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 90,
    peakSec: 240,
    durationSec: 5400,
    description: 'Short-acting water-soluble benzodiazepine. Potent anxiolysis, anterograde amnesia, and anticonvulsant activity. Synergistic respiratory depression when combined with opioids.',
    patientWarning: (p) => {
      if (p.age >= 65) {
        return 'Elderly patient: Increased sensitivity, prolonged elimination half-life, and high risk of postoperative delirium (POCD). Use 0.5-1.0 mg max!';
      }
      return null;
    },
    applyEffect: (phys, dose) => {
      return {
        narrative: `Midazolam ${dose}mg IV given. Anterograde amnesia and calm sedation established. Preoperative anxiety resolved.`,
        vitalsChanges: {
          consciousness: 'sedated',
          bis: Math.max(0, phys.bis - 15),
          hr: Math.max(0, phys.hr - 5),
        },
      };
    },
  },
  {
    id: 'lorazepam',
    name: 'Lorazepam (Ativan)',
    category: 'Benzodiazepines',
    unit: 'mg',
    quickDoses: [0.5, 1.0, 2.0],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 300,
    peakSec: 900,
    durationSec: 21600,
    description: 'Intermediate-acting benzodiazepine. Long duration of sedation (6-8 hours). Direct glucuronidation without active metabolites.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Lorazepam ${dose}mg IV administered. Sustained anxiolysis and sedation established.`,
        vitalsChanges: { consciousness: 'sedated', bis: 68 },
      };
    },
  },

  // ========================================================
  // 6. VASOPRESSORS & INOTROPES
  // ========================================================
  {
    id: 'phenylephrine',
    name: 'Phenylephrine (Neo-Synephrine)',
    category: 'Vasopressors & Inotropes',
    unit: 'mcg',
    quickDoses: [50, 100, 150, 200],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 20,
    peakSec: 45,
    durationSec: 600,
    description: 'Pure selective alpha-1 adrenergic agonist. Increases SVR and blood pressure through direct arteriolar vasoconstriction. May cause reflex baroreceptor bradycardia and decreased cardiac output.',
    applyEffect: (phys, dose, p, route, activeDrugs) => {
      const priorPhen = getActiveDrugDose(activeDrugs, 'phenylephrine');
      const totalPhen = priorPhen + dose;
      const bpRise = Math.round(Math.min(50, (totalPhen / 100) * 22));
      const hrDrop = Math.round(Math.min(18, (totalPhen / 100) * 8));
      return {
        narrative: priorPhen > 10
          ? `Phenylephrine ${dose}mcg IV added (Total active: ${Math.round(totalPhen)}mcg). Alpha-1 vasoconstriction: SBP elevated by ${bpRise} mmHg, reflex HR slowing (-${hrDrop} bpm).`
          : `Phenylephrine ${dose}mcg IV administered. Pure alpha-1 vasoconstriction increases SVR. SBP rises by ${bpRise} mmHg with reflex baroreceptor slowing of HR (-${hrDrop} bpm).`,
        vitalsChanges: {
          sbp: phys.sbp + Math.round((dose / 100) * 20),
          dbp: phys.dbp + Math.round((dose / 100) * 14),
          map: phys.map + Math.round((dose / 100) * 16),
          hr: Math.max(0, phys.hr - Math.round((dose / 100) * 7)),
          svrDynSecCm5: phys.svrDynSecCm5 + Math.round(dose * 2.5),
        },
      };
    },
  },
  {
    id: 'ephedrine',
    name: 'Ephedrine',
    category: 'Vasopressors & Inotropes',
    unit: 'mg',
    quickDoses: [5, 10, 15, 25],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 30,
    peakSec: 90,
    durationSec: 1800,
    description: 'Mixed indirect and direct sympathomimetic (releases endogenous norepinephrine + direct alpha/beta stimulation). Increases HR, contractility, and SVR. Exhibits tachyphylaxis with repeated doses.',
    applyEffect: (phys, dose, p, route, activeDrugs) => {
      const priorEph = getActiveDrugDose(activeDrugs, 'ephedrine');
      const totalEph = priorEph + dose;
      const bpRise = Math.round(Math.min(40, totalEph * 2.2));
      const hrRise = Math.round(Math.min(25, totalEph * 1.4));
      return {
        narrative: priorEph > 2
          ? `Ephedrine ${dose}mg IV added (Total active: ${Math.round(totalEph)}mg). Sympathetic inotropic/chronotropic stimulation: HR +${hrRise} bpm, SBP +${bpRise} mmHg.`
          : `Ephedrine ${dose}mg IV given. Sympathetic discharge stimulated: HR increased by ${hrRise} bpm, SBP increased by ${bpRise} mmHg.`,
        vitalsChanges: {
          hr: phys.hr + Math.round(dose * 1.2),
          sbp: phys.sbp + Math.round(dose * 2.0),
          dbp: phys.dbp + Math.round(dose * 1.2),
          map: phys.map + Math.round(dose * 1.5),
        },
      };
    },
  },
  {
    id: 'norepinephrine',
    name: 'Norepinephrine (Levophed)',
    category: 'Vasopressors & Inotropes',
    unit: 'mcg',
    quickDoses: [4, 8, 16, 32],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 15,
    peakSec: 40,
    durationSec: 300,
    description: 'Potent alpha-1 and beta-1 adrenergic agonist (alpha-1 > beta-1). First-line vasopressor for distributive, vasodilatory, and septic shock. Powerful vasoconstriction with modest inotropy.',
    applyEffect: (phys, dose) => {
      const bpRise = Math.round(Math.min(55, dose * 3.5));
      return {
        narrative: `Norepinephrine ${dose}mcg IV administered. Potent alpha-1 vasoconstriction restores perfusion pressure in vasodilated shock. MAP increased by ${Math.round(bpRise * 0.8)} mmHg.`,
        vitalsChanges: {
          sbp: phys.sbp + bpRise,
          dbp: phys.dbp + Math.round(bpRise * 0.7),
          map: phys.map + Math.round(bpRise * 0.8),
          svrDynSecCm5: phys.svrDynSecCm5 + Math.round(dose * 20),
        },
      };
    },
  },
  {
    id: 'epinephrine',
    name: 'Epinephrine (Adrenaline)',
    category: 'Vasopressors & Inotropes',
    unit: 'mcg',
    quickDoses: [10, 50, 100, 500, 1000],
    routes: ['IV Bolus', 'IV Infusion', 'IM', 'Inhaled / ETT'],
    defaultRoute: 'IV Bolus',
    onsetSec: 15,
    peakSec: 30,
    durationSec: 300,
    description: 'Non-selective direct alpha and beta adrenergic agonist. Low dose (10-50 mcg): beta-1 inotropy and beta-2 bronchodilation. High dose (100-1000 mcg): intense alpha-1 vasoconstriction for anaphylaxis and ACLS cardiac arrest.',
    applyEffect: (phys, dose) => {
      if (dose >= 500) {
        // ACLS Code Dose
        return {
          narrative: `ACLS Epinephrine ${dose}mcg IV administered! Intense coronary and cerebral vasoconstriction. Potent inotropy and chronotropy.`,
          vitalsChanges: {
            hr: Math.min(160, phys.hr + 35),
            sbp: Math.min(220, phys.sbp + 50),
            dbp: Math.min(120, phys.dbp + 30),
            map: Math.min(150, phys.map + 38),
            airwayResistanceCmH2o: Math.max(10, phys.airwayResistanceCmH2o - 12),
          },
        };
      }
      const bpRise = Math.round(Math.min(45, (dose / 10) * 8));
      const hrRise = Math.round(Math.min(30, (dose / 10) * 6));
      return {
        narrative: `Epinephrine ${dose}mcg IV bolus administered. Powerful beta-1 inotropic boost and bronchodilation. HR +${hrRise} bpm, SBP +${bpRise} mmHg.`,
        vitalsChanges: {
          hr: phys.hr + hrRise,
          sbp: phys.sbp + bpRise,
          dbp: phys.dbp + Math.round(bpRise * 0.5),
          map: phys.map + Math.round(bpRise * 0.7),
          airwayResistanceCmH2o: Math.max(10, phys.airwayResistanceCmH2o - 10),
        },
      };
    },
  },
  {
    id: 'vasopressin',
    name: 'Vasopressin (Pitressin)',
    category: 'Vasopressors & Inotropes',
    unit: 'mg',
    fixedDoseDefault: 1, // Units in clinical, represented in mg
    quickDoses: [1, 2, 4, 20],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 30,
    peakSec: 60,
    durationSec: 1200,
    description: 'V1 receptor agonist on vascular smooth muscle. Non-adrenergic vasoconstrictor effective even in severe acidemia where catecholamines lose responsiveness. Essential in ACE-inhibitor refractory hypotension and septic shock.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Vasopressin administered. V1 receptor activation causes non-adrenergic vasoconstriction, restoring MAP without increasing heart rate.`,
        vitalsChanges: {
          sbp: phys.sbp + 25,
          dbp: phys.dbp + 18,
          map: phys.map + 20,
          svrDynSecCm5: phys.svrDynSecCm5 + 250,
        },
      };
    },
  },
  {
    id: 'dopamine',
    name: 'Dopamine',
    category: 'Vasopressors & Inotropes',
    unit: 'mcg',
    quickDoses: [100, 200, 400],
    routes: ['IV Infusion'],
    defaultRoute: 'IV Infusion',
    onsetSec: 60,
    peakSec: 180,
    durationSec: 600,
    description: 'Dose-dependent adrenergic agonist: low-dose DA1 (renal vasodilation), medium-dose beta-1 (inotropic/chronotropic), high-dose alpha-1 (vasoconstriction).',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Dopamine infusion active. Cardiac contractility and heart rate augmented via beta-1 stimulation.`,
        vitalsChanges: {
          hr: phys.hr + 14,
          sbp: phys.sbp + 18,
          map: phys.map + 12,
        },
      };
    },
  },
  {
    id: 'dobutamine',
    name: 'Dobutamine',
    category: 'Vasopressors & Inotropes',
    unit: 'mcg',
    quickDoses: [100, 250, 500],
    routes: ['IV Infusion'],
    defaultRoute: 'IV Infusion',
    onsetSec: 60,
    peakSec: 180,
    durationSec: 600,
    description: 'Direct beta-1 inotrope with mild beta-2 vasodilation ("inodilator"). Increases cardiac contractility and stroke volume with minimal change in SVR. Drug of choice in cardiogenic shock with elevated filling pressures.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Dobutamine infusion active. Strong positive inotropic response increases cardiac output and stroke volume.`,
        vitalsChanges: {
          hr: phys.hr + 8,
          sbp: phys.sbp + 12,
          map: phys.map + 6,
          cardiacOutputLpm: Number((phys.cardiacOutputLpm + 1.2).toFixed(1)),
        },
      };
    },
  },
  {
    id: 'milrinone',
    name: 'Milrinone (Primacor)',
    category: 'Vasopressors & Inotropes',
    unit: 'mg',
    quickDoses: [2.5, 5.0],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 180,
    peakSec: 600,
    durationSec: 10800,
    description: 'Phosphodiesterase-3 (PDE3) inhibitor. Prevents cAMP breakdown in myocardium (positive inotropy) and vascular smooth muscle (systemic and pulmonary vasodilation). Lowers right ventricular afterload.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Milrinone administered. PDE3 inhibition enhances biventricular contractility while reducing systemic and pulmonary vascular resistance.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - 6),
          map: Math.max(0, phys.map - 4),
          cardiacOutputLpm: Number((phys.cardiacOutputLpm + 1.4).toFixed(1)),
        },
      };
    },
  },

  // ========================================================
  // 7. ANTIHYPERTENSIVES & ANTIARRHYTHMICS
  // ========================================================
  {
    id: 'esmolol',
    name: 'Esmolol (Brevibloc)',
    category: 'Antihypertensives & Antiarrhythmics',
    unit: 'mg',
    mgPerKgMin: 0.5,
    mgPerKgMax: 1.0,
    quickDoses: [10, 20, 30, 50],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 30,
    peakSec: 90,
    durationSec: 540,
    description: 'Ultra-short acting cardioselective beta-1 blocker. Metabolized by red blood cell esterases (elimination half-life ~9 min). Rapidly blunts tachycardia and hypertension from laryngoscopy or surgical incision.',
    applyEffect: (phys, dose, patient, route, activeDrugs) => {
      const isPheo = patient?.procedure?.toLowerCase().includes('adrenal') || patient?.keyComorbidities?.some(c => c.toLowerCase().includes('pheo'));
      const hasAlphaBlock = activeDrugs?.some(d => 
        ['phentolamine', 'sodium_nitroprusside', 'clevidipine', 'nicardipine', 'magnesium_sulfate'].includes(d.drugId) && (d.currentIntensity ?? 1) > 0.15
      );
      if (isPheo && !hasAlphaBlock && (phys.sbp > 160 || phys.hr > 95)) {
        const sbpSurge = 40;
        const dbpSurge = 25;
        return {
          narrative: `🚨 UNOPPOSED ALPHA CRISIS: Esmolol ${dose}mg IV administered during catecholamine surge WITHOUT preceding alpha blockade! Beta-2 vasodilation abolished while alpha-1 vasoconstriction remains rampant! SBP surges to ${phys.sbp + sbpSurge} mmHg, precipitating acute left ventricular failure and pulmonary edema!`,
          vitalsChanges: {
            sbp: phys.sbp + sbpSurge,
            dbp: phys.dbp + dbpSurge,
            map: Math.round(((phys.sbp + sbpSurge) + 2 * (phys.dbp + dbpSurge)) / 3),
            hr: Math.max(0, phys.hr - 12),
            breathSounds: 'Crackles / Pulmonary Edema',
            spo2: Math.max(0, phys.spo2 - 10),
            stElevationMm: -2.0,
          },
        };
      }

      const hrDrop = Math.round(Math.min(30, dose * 0.7));
      const bpDrop = Math.round(Math.min(25, dose * 0.5));
      return {
        narrative: `Esmolol ${dose}mg IV given. RBC esterases will clear drug in ~9 min. Rapid beta-1 blockade: HR drops by ${hrDrop} bpm, SBP drops by ${bpDrop} mmHg. Myocardial oxygen consumption reduced.`,
        vitalsChanges: {
          hr: Math.max(0, phys.hr - hrDrop),
          sbp: Math.max(0, phys.sbp - bpDrop),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.7)),
        },
      };
    },
  },
  {
    id: 'labetalol',
    name: 'Labetalol (Trandate)',
    category: 'Antihypertensives & Antiarrhythmics',
    unit: 'mg',
    quickDoses: [5, 10, 20, 25],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 120,
    peakSec: 300,
    durationSec: 14400,
    description: 'Combined non-selective beta and selective alpha-1 adrenergic antagonist (1:7 alpha-to-beta ratio IV). Lowers systemic vascular resistance without causing reflex tachycardia. Long duration (~4-6 hrs).',
    applyEffect: (phys, dose, patient, route, activeDrugs) => {
      const isPheo = patient?.procedure?.toLowerCase().includes('adrenal') || patient?.keyComorbidities?.some(c => c.toLowerCase().includes('pheo'));
      const hasAlphaBlock = activeDrugs?.some(d => 
        ['phentolamine', 'sodium_nitroprusside', 'clevidipine', 'nicardipine', 'magnesium_sulfate'].includes(d.drugId) && (d.currentIntensity ?? 1) > 0.15
      );
      if (isPheo && !hasAlphaBlock && phys.sbp > 175) {
        return {
          narrative: `⚠️ Labetalol ${dose}mg given during pheochromocytoma crisis: 1:7 alpha-to-beta ratio provides predominantly beta-blockade, leaving relative unopposed alpha tone. Modest or paradoxical blood pressure response with continued high afterload.`,
          vitalsChanges: {
            hr: Math.max(0, phys.hr - 15),
            sbp: Math.max(0, phys.sbp - 6),
            map: Math.max(0, phys.map - 4),
          },
        };
      }
      const bpDrop = Math.round(Math.min(35, dose * 1.2));
      const hrDrop = Math.round(Math.min(18, dose * 0.5));
      return {
        narrative: `Labetalol ${dose}mg IV administered. Combined alpha and beta blockade produces steady reduction in blood pressure (-${bpDrop} mmHg) with mild chronotropic slowing (-${hrDrop} bpm).`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - bpDrop),
          dbp: Math.max(0, phys.dbp - Math.round(bpDrop * 0.7)),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.8)),
          hr: Math.max(0, phys.hr - hrDrop),
        },
      };
    },
  },
  {
    id: 'phentolamine',
    name: 'Phentolamine (Regitine)',
    category: 'Antihypertensives & Antiarrhythmics',
    unit: 'mg',
    quickDoses: [1, 2, 5],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 20,
    peakSec: 60,
    durationSec: 900,
    description: 'Non-selective competitive alpha-1 and alpha-2 adrenergic receptor antagonist. Gold-standard rescue vasodilator for acute pheochromocytoma hypertensive surges and extravasation necrosis. Rapid onset (~1-2 min).',
    applyEffect: (phys, dose) => {
      const isSurge = phys.sbp > 180;
      const bpDrop = isSurge ? Math.round(Math.min(75, dose * 18)) : Math.round(Math.min(35, dose * 10));
      return {
        narrative: `Phentolamine ${dose}mg IV push administered. Competitive alpha-1 and alpha-2 blockade rapidly relieves intense peripheral vasoconstriction. SBP drops by ${bpDrop} mmHg. Peripheral perfusion restored.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - bpDrop),
          dbp: Math.max(0, phys.dbp - Math.round(bpDrop * 0.6)),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.75)),
          svrDynSecCm5: Math.max(500, phys.svrDynSecCm5 - 400),
        },
      };
    },
  },
  {
    id: 'sodium_nitroprusside',
    name: 'Sodium Nitroprusside (Nipride)',
    category: 'Antihypertensives & Antiarrhythmics',
    unit: 'mcg',
    quickDoses: [25, 50, 100],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Infusion',
    onsetSec: 15,
    peakSec: 45,
    durationSec: 180,
    description: 'Direct inorganic nitric oxide (NO) donor providing ultra-potent, immediate arteriolar and venous vasodilation. Elimination half-life ~2 min. First-line for intraoperative pheochromocytoma tumor manipulation surges. MUST be stopped prior to adrenal vein clamping.',
    applyEffect: (phys, dose) => {
      const bpDrop = Math.round(Math.min(70, (dose / 50) * 28));
      return {
        narrative: `Sodium Nitroprusside ${dose}mcg IV administered. Direct NO release stimulates guanylyl cyclase, generating immediate arteriolar and venular relaxation. SBP falls rapidly by ${bpDrop} mmHg. (Warning: Discontinue prior to vein ligation to prevent catastrophic circulatory collapse!).`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - bpDrop),
          dbp: Math.max(0, phys.dbp - Math.round(bpDrop * 0.65)),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.75)),
          svrDynSecCm5: Math.max(450, phys.svrDynSecCm5 - 350),
        },
      };
    },
  },
  {
    id: 'clevidipine',
    name: 'Clevidipine (Cleviprex)',
    category: 'Antihypertensives & Antiarrhythmics',
    unit: 'mg',
    quickDoses: [1, 2, 4],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Infusion',
    onsetSec: 45,
    peakSec: 120,
    durationSec: 600,
    description: 'Ultra-short acting third-generation dihydropyridine L-type calcium channel blocker. Rapidly hydrolyzed by blood and tissue esterases (half-life ~1 min). Pure arteriolar vasodilation with fast titratability and minimal reflex tachycardia.',
    applyEffect: (phys, dose) => {
      const bpDrop = Math.round(Math.min(55, dose * 15));
      return {
        narrative: `Clevidipine ${dose}mg IV given. Rapid arteriolar calcium channel blockade lowers afterload smoothly by ${bpDrop} mmHg without venous pooling or organ hypoperfusion.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - bpDrop),
          dbp: Math.max(0, phys.dbp - Math.round(bpDrop * 0.6)),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.7)),
          svrDynSecCm5: Math.max(550, phys.svrDynSecCm5 - 300),
        },
      };
    },
  },
  {
    id: 'nicardipine',
    name: 'Nicardipine (Cardene)',
    category: 'Antihypertensives & Antiarrhythmics',
    unit: 'mg',
    quickDoses: [0.5, 1.0, 2.0],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 180,
    durationSec: 1800,
    description: 'Second-generation dihydropyridine calcium channel blocker. Potent arterial vasodilator with minimal negative inotropic or chronotropic effect. Ideal for neurosurgical and cardiac hypertensive crises.',
    applyEffect: (phys, dose) => {
      const bpDrop = Math.round(Math.min(40, dose * 22));
      return {
        narrative: `Nicardipine ${dose}mg IV bolus given. Direct arteriolar smooth muscle relaxation drops SVR without depressing cardiac contractility. SBP -${bpDrop} mmHg.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - bpDrop),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.8)),
          svrDynSecCm5: Math.max(600, phys.svrDynSecCm5 - 250),
        },
      };
    },
  },
  {
    id: 'hydralazine',
    name: 'Hydralazine (Apresoline)',
    category: 'Antihypertensives & Antiarrhythmics',
    unit: 'mg',
    quickDoses: [5, 10, 20],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 600,
    peakSec: 1800,
    durationSec: 21600,
    description: 'Direct arteriolar vasodilator. Delayed onset (15-20 min) and long duration (6-12 hrs). Frequently triggers reflex sympathetic tachycardia. Safe in pregnancy/preeclampsia.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Hydralazine ${dose}mg IV given. Onset begins in 10-15 minutes. Arteriolar dilation will lower systemic pressure with mild reflex tachycardia.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - 18),
          map: Math.max(0, phys.map - 14),
          hr: phys.hr + 10,
        },
      };
    },
  },
  {
    id: 'nitroglycerin',
    name: 'Nitroglycerin (NTG)',
    category: 'Antihypertensives & Antiarrhythmics',
    unit: 'mcg',
    quickDoses: [50, 100, 200],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 30,
    peakSec: 60,
    durationSec: 600,
    description: 'Potent organic nitrate venodilator (reduces preload and ventricular wall tension) and epicardial coronary vasodilator. First-line treatment for intraoperative myocardial ischemia and ST depression.',
    applyEffect: (phys, dose) => {
      const bpDrop = Math.round(Math.min(30, (dose / 100) * 16));
      return {
        narrative: `Nitroglycerin ${dose}mcg IV administered. Venodilation decreases LV preload and myocardial oxygen demand; epicardial coronary arteries dilate. ST depression resolving.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - bpDrop),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.8)),
          rhythm: phys.rhythm.includes('ST') ? 'Normal Sinus Rhythm' : phys.rhythm,
        },
      };
    },
  },
  {
    id: 'amiodarone',
    name: 'Amiodarone (Cordarone)',
    category: 'Antihypertensives & Antiarrhythmics',
    unit: 'mg',
    quickDoses: [150, 300],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 120,
    peakSec: 300,
    durationSec: 86400,
    description: 'Class III antiarrhythmic (blocks K+, Na+, Ca2+ channels and non-competitively blocks alpha and beta receptors). First-line ACLS agent for pulseless VT / VF and stable ventricular tachycardia.',
    applyEffect: (phys, dose) => {
      const isArrest = phys.rhythm === 'Ventricular Fibrillation (VF)' || phys.rhythm === 'Ventricular Tachycardia (VT)';
      const nextRhythm = isArrest ? 'Normal Sinus Rhythm' : phys.rhythm;
      return {
        narrative: `Amiodarone ${dose}mg IV administered. Refractory period of ventricular myocardium prolonged. Ventricular ectopy suppressed.`,
        vitalsChanges: {
          rhythm: nextRhythm,
          hr: Math.min(100, phys.hr),
          sbp: isArrest ? 110 : Math.max(0, phys.sbp - 8),
          dbp: isArrest ? 70 : phys.dbp,
          map: isArrest ? 83 : phys.map,
        },
      };
    },
  },
  {
    id: 'adenosine',
    name: 'Adenosine (Adenocard)',
    category: 'Antihypertensives & Antiarrhythmics',
    unit: 'mg',
    quickDoses: [6, 12],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 5,
    peakSec: 10,
    durationSec: 20,
    description: 'Agonist at A1 receptors on AV node. Causes profound AV nodal conduction block (ultra-short half-life < 10s). First-line for terminating paroxysmal supraventricular tachycardia (PSVT / SVT). Must be given rapid IV push followed by immediate 20mL saline flush.',
    applyEffect: (phys, dose) => {
      const isSVT = phys.rhythm === 'Supraventricular Tachycardia (SVT)' || phys.hr > 150;
      return {
        narrative: `Adenosine ${dose}mg rapid IV push with flush! Transient 3-second asystolic pause on monitor, followed by successful conversion to normal sinus rhythm!`,
        vitalsChanges: {
          rhythm: 'Normal Sinus Rhythm',
          hr: isSVT ? 78 : Math.max(0, phys.hr - 30),
        },
      };
    },
  },
  {
    id: 'lidocaine_iv',
    name: 'Lidocaine 2% IV (Xylocaine)',
    category: 'Antihypertensives & Antiarrhythmics',
    unit: 'mg',
    mgPerKgMin: 1.0,
    mgPerKgMax: 1.5,
    quickDoses: [50, 70, 100],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 45,
    peakSec: 90,
    durationSec: 1800,
    description: 'Class Ib antiarrhythmic and sodium channel blocker. Suppresses ventricular arrhythmias, blunts ICP and airway responses to intubation, and provides systemic analgesic/anti-inflammatory adjunct.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Lidocaine 2% IV ${dose}mg administered. Airway sensory irritability suppressed; blunts hemodynamic cough response during laryngoscopy.`,
        vitalsChanges: {
          painScore: Math.max(0, phys.painScore - 2),
          airwayResistanceCmH2o: Math.max(10, phys.airwayResistanceCmH2o - 4),
        },
      };
    },
  },

  // ========================================================
  // 8. ANTICHOLINERGICS
  // ========================================================
  {
    id: 'atropine',
    name: 'Atropine Sulfate',
    category: 'Anticholinergics',
    unit: 'mg',
    quickDoses: [0.4, 0.5, 0.6, 1.0],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 30,
    peakSec: 60,
    durationSec: 3600,
    description: 'Tertiary amine competitive muscarinic acetylcholine receptor antagonist. Crosses blood-brain barrier. Treats severe sinus bradycardia, AV block, and vagal reflexes (e.g. peritoneal insufflation, strabismus traction).',
    applyEffect: (phys, dose) => {
      const hrRise = Math.round(Math.min(45, (dose / 0.5) * 25));
      return {
        narrative: `Atropine ${dose}mg IV given. Muscarinic vagal blockade at SA node. Heart rate increased by ${hrRise} bpm to ${phys.hr + hrRise} bpm. Salivary and bronchial secretions dried.`,
        vitalsChanges: {
          hr: Math.min(150, phys.hr + hrRise),
          sbp: phys.sbp + Math.round(hrRise * 0.4),
          map: phys.map + Math.round(hrRise * 0.3),
          rhythm: phys.rhythm === 'Sinus Bradycardia' ? 'Normal Sinus Rhythm' : phys.rhythm,
        },
      };
    },
  },
  {
    id: 'glycopyrrolate',
    name: 'Glycopyrrolate (Robinul)',
    category: 'Anticholinergics',
    unit: 'mg',
    quickDoses: [0.1, 0.2, 0.4],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 180,
    durationSec: 7200,
    description: 'Quaternary amine antimuscarinic agent. DOES NOT cross the blood-brain barrier (no central anticholinergic syndrome). Potent antisialagogue and treats moderate bradycardia with less extreme tachycardia than atropine.',
    applyEffect: (phys, dose) => {
      const hrRise = Math.round(Math.min(30, (dose / 0.2) * 16));
      return {
        narrative: `Glycopyrrolate ${dose}mg IV administered. Secretions dried; heart rate increased by ${hrRise} bpm without central anticholinergic effects.`,
        vitalsChanges: {
          hr: Math.min(130, phys.hr + hrRise),
          rhythm: phys.rhythm === 'Sinus Bradycardia' ? 'Normal Sinus Rhythm' : phys.rhythm,
        },
      };
    },
  },

  // ========================================================
  // 9. ANTIEMETICS
  // ========================================================
  {
    id: 'ondansetron',
    name: 'Ondansetron (Zofran)',
    category: 'Antiemetics',
    unit: 'mg',
    quickDoses: [4, 8],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 300,
    peakSec: 900,
    durationSec: 14400,
    description: 'Competitive 5-HT3 serotonin receptor antagonist acting centrally in the chemoreceptor trigger zone (CTZ) and peripherally on vagal nerve terminals in the gut. Gold standard for PONV prophylaxis.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Ondansetron ${dose}mg IV administered. 5-HT3 receptors blocked in CTZ. Postoperative nausea and vomiting risk reduced by 40-50%.`,
        vitalsChanges: {},
      };
    },
  },
  {
    id: 'dexamethasone',
    name: 'Dexamethasone (Decadron)',
    category: 'Antiemetics',
    unit: 'mg',
    quickDoses: [4, 8, 10],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 600,
    peakSec: 3600,
    durationSec: 86400,
    description: 'Glucocorticoid with potent antiemetic, anti-inflammatory, and airway anti-edema properties. Best administered at induction for maximal PONV efficacy.',
    patientWarning: (p) => {
      if (p.baselineLabs && p.baselineLabs.glucose > 180) {
        return 'Caution: Corticosteroid causes mild transient postoperative hyperglycemia.';
      }
      return null;
    },
    applyEffect: (phys, dose) => {
      return {
        narrative: `Dexamethasone ${dose}mg IV administered at induction. Antiemetic synergy and laryngeal edema reduction established.`,
        vitalsChanges: {
          bloodGlucoseMgDl: (phys.bloodGlucoseMgDl ?? phys.glucoseMgDl ?? 110) + 20,
        },
      };
    },
  },
  {
    id: 'metoclopramide',
    name: 'Metoclopramide (Reglan)',
    category: 'Antiemetics',
    unit: 'mg',
    quickDoses: [10, 20],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 180,
    peakSec: 600,
    durationSec: 7200,
    description: 'Dopamine D2 receptor antagonist with peripheral prokinetic activity. Increases lower esophageal sphincter (LES) tone and accelerates gastric emptying. Contraindicated in bowel obstruction.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Metoclopramide ${dose}mg IV given. LES tone increased and gastric emptying accelerated, reducing pulmonary aspiration risk.`,
        vitalsChanges: {},
      };
    },
  },
  {
    id: 'droperidol',
    name: 'Droperidol (Inapsine)',
    category: 'Antiemetics',
    unit: 'mg',
    quickDoses: [0.625, 1.25],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 180,
    peakSec: 600,
    durationSec: 14400,
    description: 'Butyrophenone D2 antagonist. Highly effective low-dose (0.625 mg) antiemetic and sedative. Black-box warning for QT prolongation at high doses.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Droperidol ${dose}mg IV administered. Highly potent CTZ dopamine antagonism established.`,
        vitalsChanges: { consciousness: 'sedated' },
      };
    },
  },

  // ========================================================
  // 10. EMERGENCY & CRITICAL RESUSCITATION
  // ========================================================
  {
    id: 'salbutamol',
    name: 'Salbutamol / Albuterol (MDI)',
    category: 'Emergency & Resuscitation',
    unit: 'puffs',
    quickDoses: [4, 6, 8, 10],
    routes: ['Inhaled / ETT'],
    defaultRoute: 'Inhaled / ETT',
    onsetSec: 30,
    peakSec: 120,
    durationSec: 7200,
    description: 'Selective short-acting beta-2 adrenergic agonist delivered through the breathing circuit adapter. Relaxes bronchial smooth muscle. First-line for intraoperative bronchospasm (shark-fin capnogram).',
    applyEffect: (phys, dose) => {
      const dropResist = Math.round(Math.min(25, dose * 2.8));
      const hrRise = Math.round(dose * 1.5);
      return {
        narrative: `Salbutamol ${dose} puffs delivered in-line via circuit elbow adapter with ventilator breaths. Beta-2 stimulation relaxes bronchial smooth muscle. Airway resistance decreased by ${dropResist} cmH2O/L/s. Peak airway pressures normalizing; capnogram shark-fin resolving.`,
        vitalsChanges: {
          airwayResistanceCmH2o: Math.max(10, phys.airwayResistanceCmH2o - dropResist),
          lungComplianceMlCmH2o: Math.min(50, phys.lungComplianceMlCmH2o + 10),
          hr: phys.hr + hrRise,
          airwayPatency: phys.airwayPatency === 'bronchospasm' ? 'intubated' : phys.airwayPatency,
          spo2: Math.min(100, phys.spo2 + 6),
        },
      };
    },
  },
  {
    id: 'dantrolene',
    name: 'Dantrolene (Ryanodex)',
    category: 'Emergency & Resuscitation',
    unit: 'mg',
    mgPerKgMin: 2.5,
    mgPerKgMax: 10.0,
    quickDoses: [150, 200, 250, 500],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 180,
    durationSec: 18000,
    description: 'Ryanodine receptor 1 (RYR1) channel antagonist. Blocks abnormal sarcoplasmic reticulum calcium release in skeletal muscle. Life-saving antidote for Malignant Hyperthermia crisis.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `DANTROLENE ${dose}mg IV administered rapidly! RYR1 channels blocked. Uncontrolled intracellular calcium release arrested. Muscle hypermetabolism terminates: EtCO2 and core temperature reversing toward normal.`,
        vitalsChanges: {
          coreTempC: Math.max(37.0, (phys.coreTempC ?? phys.tempC ?? 37.0) - 1.2),
          etco2: Math.max(0, phys.etco2 - 18),
          hr: Math.max(0, phys.hr - 25),
          muscleTone: 'normal',
        },
      };
    },
  },
  {
    id: 'lipid_emulsion',
    name: '20% Lipid Emulsion (Intralipid)',
    category: 'Emergency & Resuscitation',
    unit: 'mL',
    fixedDoseDefault: 100,
    quickDoses: [100, 250, 500],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 180,
    durationSec: 7200,
    description: 'Lipid sink and metabolic rescue for Local Anesthetic Systemic Toxicity (LAST). Administer 1.5 mL/kg bolus over 1 min, followed by 0.25 mL/kg/min infusion.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `20% Lipid Emulsion ${dose}mL IV bolus given. "Lipid sink" partitions lipophilic local anesthetic molecules from myocardial tissue. Cardiac conduction restored; refractory arrest responding.`,
        vitalsChanges: {
          rhythm: 'Normal Sinus Rhythm',
          sbp: 100,
          dbp: 65,
          map: 77,
          hr: 82,
        },
      };
    },
  },
  {
    id: 'calcium_chloride',
    name: 'Calcium Chloride 10%',
    category: 'Emergency & Resuscitation',
    unit: 'g',
    quickDoses: [1, 2],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 30,
    peakSec: 60,
    durationSec: 1800,
    description: 'Provides 3x more elemental calcium than calcium gluconate. Stabilizes cardiac membranes in acute hyperkalemia, reverses citrate toxicity hypocalcemia from massive PRBC transfusion, and increases myocardial contractility.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Calcium Chloride ${dose}g IV administered via central/large bore line. Cardiac myocyte resting membrane threshold restored, counteracting hyperkalemic arrhythmia risk. Myocardial contractility strengthened.`,
        vitalsChanges: {
          sbp: phys.sbp + 14,
          map: phys.map + 10,
          rhythm: phys.rhythm.includes('VT') ? 'Normal Sinus Rhythm' : phys.rhythm,
        },
      };
    },
  },
  {
    id: 'sodium_bicarbonate',
    name: 'Sodium Bicarbonate 8.4%',
    category: 'Emergency & Resuscitation',
    unit: 'mg', // mEq in clinical
    fixedDoseDefault: 50,
    quickDoses: [50, 100],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 180,
    durationSec: 3600,
    description: '1 mEq/mL hypertonic alkalizing agent. Buffers acute metabolic acidosis (pH < 7.15), shifts potassium intracellularly in hyperkalemia, and alkalinizes urine in rhabdomyolysis.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Sodium Bicarbonate ${dose} mEq IV given. Severe metabolic acidosis buffered; shifts potassium into cells. Transient increase in PaCO2 from bicarbonate buffering.`,
        vitalsChanges: {
          serumPotassiumMeq: Math.max(3.5, (phys.serumPotassiumMeq ?? phys.potassiumMeqL ?? 4.2) - 0.4),
          etco2: phys.etco2 + 4,
          map: phys.map + 5,
        },
      };
    },
  },
  {
    id: 'magnesium_sulfate',
    name: 'Magnesium Sulfate',
    category: 'Emergency & Resuscitation',
    unit: 'g',
    quickDoses: [1, 2, 4],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 300,
    durationSec: 7200,
    description: 'Inorganic magnesium salt. First-line therapy for Torsades de Pointes, severe refractory bronchospasm, and pre-eclampsia seizure prevention.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Magnesium Sulfate ${dose}g IV infused. Direct bronchial smooth muscle relaxation and stabilization of myocardial cellular membranes.`,
        vitalsChanges: {
          airwayResistanceCmH2o: Math.max(10, phys.airwayResistanceCmH2o - 8),
          sbp: Math.max(0, phys.sbp - 8),
        },
      };
    },
  },
  {
    id: 'tranexamic_acid',
    name: 'Tranexamic Acid (TXA)',
    category: 'Emergency & Resuscitation',
    unit: 'g',
    quickDoses: [1, 2],
    routes: ['IV Bolus', 'IV Infusion'],
    defaultRoute: 'IV Bolus',
    onsetSec: 180,
    peakSec: 600,
    durationSec: 14400,
    description: 'Synthetic lysine analogue antifibrinolytic. Reversibly binds plasminogen lysine sites, preventing plasmin conversion and clot breakdown. Reduces blood loss in trauma, orthopedic, and obstetric hemorrhage.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Tranexamic Acid (TXA) ${dose}g IV administered slowly over 10 min. Microvascular clot breakdown inhibited, stabilizing hemostasis.`,
        vitalsChanges: {},
      };
    },
  },
  {
    id: 'oxytocin',
    name: 'Oxytocin (Pitocin)',
    category: 'Emergency & Resuscitation',
    unit: 'mg', // Units in clinical
    fixedDoseDefault: 3,
    quickDoses: [3, 5, 10, 20],
    routes: ['IV Infusion', 'IV Bolus'],
    defaultRoute: 'IV Infusion',
    onsetSec: 30,
    peakSec: 90,
    durationSec: 3600,
    description: 'Nonapeptide uterotonic hormone. Stimulates rhythmic uterine contractions to prevent and treat postpartum hemorrhage. Rapid IV bolus causes profound transient systemic hypotension, tachycardia, and coronary vasoconstriction!',
    patientWarning: (p) => {
      return 'CRITICAL: Never give rapid IV bolus! Causes marked systemic vasodilation, hypotension, and reflex tachycardia. Administer as slow titration!';
    },
    applyEffect: (phys, dose) => {
      const bpDrop = Math.round(phys.sbp * 0.18);
      return {
        narrative: `Oxytocin ${dose} units IV administered. Uterine tone improves markedly; hemostasis achieved at placental bed. Vasodilatory effect causes transient drop in blood pressure.`,
        vitalsChanges: {
          sbp: Math.max(0, phys.sbp - bpDrop),
          map: Math.max(0, phys.map - Math.round(bpDrop * 0.7)),
          hr: phys.hr + 12,
        },
      };
    },
  },
  {
    id: 'furosemide',
    name: 'Furosemide (Lasix)',
    category: 'Emergency & Resuscitation',
    unit: 'mg',
    mgPerKgMin: 0.25,
    mgPerKgMax: 0.5,
    quickDoses: [20, 40, 80],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 180,
    peakSec: 600,
    durationSec: 14400,
    description: 'Potent loop diuretic. Rapidly promotes venodilation (within 5 minutes) to decrease left ventricular filling pressure, followed by brisk natriuresis and diuresis. First-line therapy for acute hydrostatic pulmonary edema and hypervolemic fluid overload.',
    applyEffect: (phys, dose) => {
      const urineRise = Math.round(dose * 25);
      return {
        narrative: `Furosemide (Lasix) ${dose}mg IV administered. Rapid systemic venodilation reduces LV preload and pulmonary capillary wedge pressure. Brisk diuresis initiated (+${urineRise} mL urine output). Hydrostatic pulmonary alveolar flooding resolving; lung compliance and oxygenation improving.`,
        vitalsChanges: {
          urineOutputMl: phys.urineOutputMl + urineRise,
          lungComplianceMlCmH2o: Math.min(50, phys.lungComplianceMlCmH2o + 14),
          airwayResistanceCmH2o: Math.max(12, phys.airwayResistanceCmH2o - 8),
          breathSounds: 'Normal Bilateral',
          spo2: Math.min(100, phys.spo2 + 6),
        },
      };
    },
  },
  {
    id: 'dextrose_50',
    name: 'Dextrose 50% (D50W)',
    category: 'Emergency & Resuscitation',
    unit: 'mL',
    quickDoses: [25, 50],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 45,
    peakSec: 180,
    durationSec: 3600,
    description: 'Hypertonic 50% dextrose solution (0.5 g/mL glucose; 25 mL = 12.5g, 50 mL = 25g). Immediate treatment for severe acute hypoglycemia, rebound hyperinsulinemia following pheochromocytoma resection, and delayed emergence.',
    applyEffect: (phys, dose) => {
      const glucoseRiseMgDl = Math.round(dose * 2.2);
      const newGlucose = Math.round(phys.glucoseMgDl + glucoseRiseMgDl);
      const newGlucoseMmol = Number((newGlucose / 18.0).toFixed(1));
      return {
        narrative: `Dextrose 50% ${dose}mL (${(dose * 0.5).toFixed(1)}g glucose) IV bolus given. Blood glucose rises by +${glucoseRiseMgDl} mg/dL (+${(glucoseRiseMgDl / 18).toFixed(1)} mmol/L) to ${newGlucose} mg/dL (${newGlucoseMmol} mmol/L). Neuroglycopenia reversed; central nervous system recovery supported.`,
        vitalsChanges: {
          glucoseMgDl: newGlucose,
          glucoseMmol: newGlucoseMmol,
          consciousness: newGlucose > 70 && phys.consciousness === 'coma' ? 'sedated' : phys.consciousness,
        },
      };
    },
  },
  {
    id: 'glucagon',
    name: 'Glucagon',
    category: 'Emergency & Resuscitation',
    unit: 'mg',
    quickDoses: [1, 2],
    routes: ['IV Bolus', 'IM'],
    defaultRoute: 'IV Bolus',
    onsetSec: 60,
    peakSec: 300,
    durationSec: 1800,
    description: 'Pancreatic alpha-cell peptide hormone. Inotropic rescue in beta-blocker overdose and treatment for hypoglycemia. STRICTLY CONTRAINDICATED in pheochromocytoma (directly stimulates chromaffin tumor cells to release massive catecholamines).',
    patientWarning: (p) => {
      if (p.procedure.toLowerCase().includes('adrenal') || p.keyComorbidities.some(c => c.toLowerCase().includes('pheo'))) {
        return 'CRITICAL CONTRAINDICATION in Pheochromocytoma: Directly stimulates explosive catecholamine dump from tumor!';
      }
      return null;
    },
    applyEffect: (phys, dose, patient) => {
      const isPheo = patient?.procedure?.toLowerCase().includes('adrenal') || patient?.keyComorbidities?.some(c => c.toLowerCase().includes('pheo'));
      if (isPheo) {
        return {
          narrative: `🚨 FATAL PHARMACOLOGICAL DISASTER: Glucagon ${dose}mg given in Pheochromocytoma! Glucagon binds secretin/glucagon receptors directly on chromaffin tumor tissue, causing explosive catecholamine degranulation! SBP spikes to 275 mmHg, triggering acute hypertensive storm, subendocardial ischemia, and malignant Ventricular Tachycardia!`,
          vitalsChanges: {
            sbp: 275,
            dbp: 145,
            map: 188,
            hr: 155,
            rhythm: 'Ventricular Tachycardia (VT)',
            stElevationMm: -2.5,
          },
        };
      }
      return {
        narrative: `Glucagon ${dose}mg IV administered. Hepatic glycogenolysis stimulated; cardiac inotropy enhanced via non-beta receptor Gs pathways. Blood glucose increases.`,
        vitalsChanges: {
          glucoseMgDl: Math.min(300, phys.glucoseMgDl + 45),
          glucoseMmol: Number(((phys.glucoseMgDl + 45) / 18.0).toFixed(1)),
          hr: Math.min(130, phys.hr + 12),
          sbp: phys.sbp + 8,
          map: phys.map + 6,
        },
      };
    },
  },

  // ========================================================
  // 11. ANALGESICS (MULTIMODAL NON-OPIOID)
  // ========================================================
  {
    id: 'paracetamol',
    name: 'Paracetamol IV (Ofirmev)',
    category: 'Analgesics',
    unit: 'mg',
    mgPerKgMin: 15,
    mgPerKgMax: 15,
    quickDoses: [500, 1000],
    routes: ['IV Infusion'],
    defaultRoute: 'IV Infusion',
    onsetSec: 300,
    peakSec: 900,
    durationSec: 14400,
    description: 'Centrally-acting non-opioid analgesic and antipyretic. Inhibits central prostaglandin synthesis. Spares opioid consumption by 20-30% without respiratory depression or platelet dysfunction.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Paracetamol IV ${dose}mg infused over 15 minutes. Central pain sensitization reduced. Baseline opioid-sparing analgesia established.`,
        vitalsChanges: {
          painScore: Math.max(0, phys.painScore - 3),
        },
      };
    },
  },
  {
    id: 'ketorolac',
    name: 'Ketorolac (Toradol)',
    category: 'Analgesics',
    unit: 'mg',
    quickDoses: [15, 30],
    routes: ['IV Bolus'],
    defaultRoute: 'IV Bolus',
    onsetSec: 600,
    peakSec: 1800,
    durationSec: 21600,
    description: 'Parenteral non-steroidal anti-inflammatory drug (NSAID). Potent non-selective COX-1 and COX-2 inhibitor. Contraindicated in acute renal failure, active hemorrhage, or history of GI ulcers.',
    patientWarning: (p) => {
      if (p.baselineLabs && p.baselineLabs.cr > 1.3) {
        return 'Renal insufficiency: NSAID blocks renal prostaglandin-mediated afferent arteriolar vasodilation, precipitating acute renal failure!';
      }
      return null;
    },
    applyEffect: (phys, dose) => {
      return {
        narrative: `Ketorolac ${dose}mg IV given. Potent peripheral anti-inflammatory analgesia active. Excellent somatic pain control established.`,
        vitalsChanges: {
          painScore: Math.max(0, phys.painScore - 4),
        },
      };
    },
  },

  // ========================================================
  // 12. LOCAL ANESTHETICS
  // ========================================================
  {
    id: 'bupivacaine',
    name: 'Bupivacaine 0.5% (Marcaine)',
    category: 'Local Anesthetics',
    unit: 'mg',
    quickDoses: [25, 50, 75, 100],
    routes: ['IM', 'IV Bolus'], // Regional/Infiltration or accidental IV
    defaultRoute: 'IM',
    onsetSec: 60,
    peakSec: 180,
    durationSec: 28800,
    description: 'Long-acting amide local anesthetic (6-12 hrs duration). Highly lipid soluble with strong myocardial binding. Accidental intravascular injection causes refractory cardiotoxicity and ventricular fibrillation.',
    patientWarning: (p) => {
      return 'Max safe dose: 2 mg/kg. High risk of cardiac arrest if injected intravascularly! Keep Intralipid immediately available.';
    },
    applyEffect: (phys, dose, p, route) => {
      const isIV = route === 'IV Bolus' || route === 'IV Infusion';
      const mgPerKg = dose / p.weightKg;

      if (isIV || mgPerKg > 2.0) {
        return {
          narrative: `🚨 CATASTROPHIC LOCAL ANESTHETIC SYSTEMIC TOXICITY (LAST)! Bupivacaine ${dose}mg ${isIV ? 'injected INTRAVENOUSLY' : 'exceeds toxic threshold'} (${mgPerKg.toFixed(2)} mg/kg)! Severe cardiac sodium channel blockade: QRS widened, Ventricular Fibrillation (VF) and refractory cardiovascular collapse! Administer 20% Lipid Emulsion (Intralipid), Defibrillate, and initiate CPR STAT!`,
          vitalsChanges: {
            rhythm: 'Ventricular Fibrillation (VF)',
            hr: 0,
            sbp: 0,
            dbp: 0,
            map: 0,
            consciousness: 'unconscious',
            bis: 10,
          },
        };
      }

      return {
        narrative: `Bupivacaine 0.5% ${dose}mg infiltrated. Long-duration somatic sensory blockade established for post-op wound analgesia.`,
        vitalsChanges: {
          painScore: Math.max(0, phys.painScore - 5),
        },
      };
    },
  },
  {
    id: 'ropivacaine',
    name: 'Ropivacaine 0.5% (Naropin)',
    category: 'Local Anesthetics',
    unit: 'mg',
    quickDoses: [50, 75, 100, 150],
    routes: ['IM'],
    defaultRoute: 'IM',
    onsetSec: 300,
    peakSec: 900,
    durationSec: 28800,
    description: 'Pure S-enantiomer amide local anesthetic. Similar duration to bupivacaine with significantly greater margin of safety against cardiotoxicity and CNS toxicity.',
    applyEffect: (phys, dose) => {
      return {
        narrative: `Ropivacaine 0.5% ${dose}mg administered for surgical field infiltration. Extended postoperative analgesia established.`,
        vitalsChanges: {
          painScore: Math.max(0, phys.painScore - 5),
        },
      };
    },
  },
];
