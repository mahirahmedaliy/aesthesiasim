import {
  DynamicPhysiology,
  VentilatorState,
  PatientProfile,
  ActiveDrugEffect,
  PerioperativePhase,
  ComplicationTrigger,
  HeartRhythm,
} from '../types/simulator';

export interface PhysiologyTickResult {
  nextPhysiology: DynamicPhysiology;
  nextVentilator: VentilatorState;
  activeDrugs: ActiveDrugEffect[];
  narratorEvents: { speaker: 'Attending' | 'Nurse' | 'Surgeon' | 'Monitor' | 'Workstation'; text: string; type: 'info' | 'warning' | 'critical' | 'success' }[];
  isCardiacArrest: boolean;
  arrestRhythm?: HeartRhythm;
  isDead: boolean;
  deathCause?: string;
  correctManagement?: string;
}

export function simulatePhysiologyTick(
  currentPhys: DynamicPhysiology,
  currentVent: VentilatorState,
  patient: PatientProfile,
  phase: PerioperativePhase,
  activeDrugs: ActiveDrugEffect[],
  activeComplications: ComplicationTrigger[],
  elapsedSec: number,
  cprActive: boolean = false
): PhysiologyTickResult {
  const p = { ...currentPhys };
  const v = { ...currentVent };
  const narratorEvents: PhysiologyTickResult['narratorEvents'] = [];

  // Initialize continuous death & decompensation timers if undefined
  p.timeInArrestSec = p.timeInArrestSec || 0;
  p.timeInSevereHypoxiaSec = p.timeInSevereHypoxiaSec || 0;
  p.timeInSevereHypotensionSec = p.timeInSevereHypotensionSec || 0;

  // If already declared dead, freeze everything at flatline zero
  if (p.isDead) {
    p.hr = 0;
    p.sbp = 0;
    p.dbp = 0;
    p.map = 0;
    p.spo2 = 0;
    p.etco2 = 0;
    p.rr = 0;
    p.cardiacOutputLpm = 0;
    p.rhythm = 'Asystole';
    p.consciousness = 'coma';
    p.bis = 0;
    p.painScore = 0;
    return {
      nextPhysiology: p,
      nextVentilator: v,
      activeDrugs,
      narratorEvents,
      isCardiacArrest: true,
      arrestRhythm: 'Asystole',
      isDead: true,
      deathCause: p.deathCause || 'Irreversible Biological Death',
    };
  }

  // =========================================================================
  // 1. PATIENT SPECIFIC VULNERABILITY MODIFIERS
  // =========================================================================
  const isElderly = patient.age >= 65;
  const isPediatric = patient.age < 12;
  const isSevereASA = patient.asaClass.includes('III') || patient.asaClass.includes('IV');
  const isHypovolemic = p.bloodVolumeMl < 4000;

  // Frailty multiplier for drug sensitivity and cardiovascular depression
  let frailtyMultiplier = 1.0;
  if (isElderly) frailtyMultiplier *= 1.45;
  if (isSevereASA) frailtyMultiplier *= 1.35;
  if (isHypovolemic) frailtyMultiplier *= (4500 / Math.max(1500, p.bloodVolumeMl));

  // =========================================================================
  // 2. DRUG PHARMACOKINETICS & CUMULATIVE CONCENTRATIONS
  // =========================================================================
  const updatedDrugs: ActiveDrugEffect[] = [];

  let activePropofolMg = 0;
  let activeKetamineMg = 0;
  let activeEtomidateMg = 0;
  let activeThiopentalMg = 0;
  let activeFentanylMcg = 0;
  let activeRemifentanilMcg = 0;
  let activeSufentanilMcg = 0;
  let activeMorphineMg = 0;
  let activeMidazolamMg = 0;
  let activeDexmedetomidineMcg = 0;
  let activeRelaxantIntensity = 0;
  let activeLidocaineMg = 0;
  let activeBupivacaineMg = 0;
  let activePressorScore = 0;
  let activeAtropineMg = 0;
  let activePhentolamineMg = 0;
  let activeNitroprussideMcg = 0;
  let activeClevidipineMg = 0;
  let activeNicardipineMg = 0;
  let activeMagnesiumG = 0;
  let activeEsmololMg = 0;

  // Reversal Antidotes
  let activeNaloxoneMg = 0;
  let activeFlumazenilMg = 0;
  let activeSugammadexMg = 0;
  let activeIntralipidMl = 0;

  for (const drug of activeDrugs) {
    const ageSec = Math.max(0, elapsedSec - drug.timestampSec);
    const key = (drug.drugId || drug.id).toLowerCase();

    // Clinical redistribution and duration curves
    const onset = drug.onsetSec || 30;
    const peak = drug.peakSec || (onset * 2);
    const duration = drug.durationSec || 600;

    let intensity = 1.0;
    if (ageSec < peak) {
      // Onset phase (ramping up to peak)
      intensity = 0.5 + 0.5 * (ageSec / Math.max(1, peak));
    } else if (ageSec <= duration) {
      // Redistribution / Alpha phase decay
      const decayFraction = (ageSec - peak) / Math.max(1, duration - peak);
      // Bolus hypnotics redistribute rapidly (exponential curve)
      if (drug.category === 'Induction & Hypnotics') {
        intensity = Math.max(0.04, Math.exp(-2.2 * decayFraction));
      } else if (drug.category === 'Opioids') {
        intensity = Math.max(0.05, Math.exp(-1.5 * decayFraction));
      } else {
        intensity = Math.max(0.05, 1.0 - decayFraction * 0.95);
      }
    } else {
      // Elimination / Beta phase
      const postDuration = ageSec - duration;
      intensity = Math.max(0, Math.exp(-3.0 * (postDuration / 120)));
    }

    // Keep active drugs until cleared (< 0.03 intensity)
    if (intensity > 0.02) {
      updatedDrugs.push({ ...drug, currentIntensity: intensity });

      const effectiveDose = drug.dose * intensity;

      // Map to cumulative active pools
      if (key === 'propofol') activePropofolMg += effectiveDose;
      else if (key === 'ketamine') activeKetamineMg += effectiveDose;
      else if (key === 'etomidate') activeEtomidateMg += effectiveDose;
      else if (key === 'thiopental') activeThiopentalMg += effectiveDose;
      else if (key === 'fentanyl') activeFentanylMcg += effectiveDose;
      else if (key === 'remifentanil') activeRemifentanilMcg += effectiveDose;
      else if (key === 'sufentanil') activeSufentanilMcg += effectiveDose;
      else if (key === 'morphine') activeMorphineMg += effectiveDose;
      else if (key === 'midazolam') activeMidazolamMg += effectiveDose;
      else if (key === 'dexmedetomidine') activeDexmedetomidineMcg += effectiveDose;
      else if (key === 'rocuronium') activeRelaxantIntensity += (effectiveDose / (patient.weightKg * 0.6));
      else if (key === 'succinylcholine') activeRelaxantIntensity += (effectiveDose / (patient.weightKg * 1.0));
      else if (key === 'vecuronium') activeRelaxantIntensity += (effectiveDose / (patient.weightKg * 0.08));
      else if (key === 'cisatracurium') activeRelaxantIntensity += (effectiveDose / (patient.weightKg * 0.15));
      else if (key === 'pancuronium') activeRelaxantIntensity += (effectiveDose / (patient.weightKg * 0.10));
      else if (key.includes('lidocaine')) activeLidocaineMg += effectiveDose;
      else if (key.includes('bupivacaine')) activeBupivacaineMg += effectiveDose;
      else if (key === 'phenylephrine') activePressorScore += (effectiveDose / 100) * 1.2;
      else if (key === 'norepinephrine') activePressorScore += (effectiveDose / 8) * 2.8;
      else if (key === 'vasopressin') activePressorScore += (effectiveDose / 2.0) * 3.2;
      else if (key === 'epinephrine') activePressorScore += (effectiveDose / 100) * 3.5;
      else if (key === 'ephedrine') activePressorScore += (effectiveDose / 10) * 1.0;
      else if (key === 'phentolamine') activePhentolamineMg += effectiveDose;
      else if (key === 'sodium_nitroprusside') activeNitroprussideMcg += effectiveDose;
      else if (key === 'clevidipine') activeClevidipineMg += effectiveDose;
      else if (key === 'nicardipine') activeNicardipineMg += effectiveDose;
      else if (key === 'magnesium_sulfate') activeMagnesiumG += effectiveDose;
      else if (key === 'esmolol') activeEsmololMg += effectiveDose;
      else if (key === 'atropine') activeAtropineMg += effectiveDose;
      else if (key === 'glycopyrrolate') activeAtropineMg += effectiveDose * 1.8;
      else if (key === 'naloxone') activeNaloxoneMg += effectiveDose;
      else if (key === 'flumazenil') activeFlumazenilMg += effectiveDose;
      else if (key === 'sugammadex') activeSugammadexMg += effectiveDose;
      else if (key.includes('lipid')) activeIntralipidMl += effectiveDose;
    }
  }

  // =========================================================================
  // 3. ANTIDOTE REVERSALS (COMPETITIVE ANTAGONISM & SCAVENGING)
  // =========================================================================
  // Naloxone reverses opioids
  if (activeNaloxoneMg > 0.04) {
    const opioidReversalPower = (activeNaloxoneMg / 0.4) * 250; // 0.4mg Naloxone neutralizes ~250mcg fentanyl
    activeFentanylMcg = Math.max(0, activeFentanylMcg - opioidReversalPower);
    activeMorphineMg = Math.max(0, activeMorphineMg - (opioidReversalPower / 25));
    activeSufentanilMcg = Math.max(0, activeSufentanilMcg - (opioidReversalPower / 10));
  }

  // Flumazenil reverses benzodiazepines
  if (activeFlumazenilMg > 0.1) {
    const benzoReversalPower = (activeFlumazenilMg / 0.2) * 3.0; // 0.2mg Flumazenil neutralizes 3mg Midazolam
    activeMidazolamMg = Math.max(0, activeMidazolamMg - benzoReversalPower);
  }

  // Sugammadex reverses steroidal neuromuscular blockers (Rocuronium / Vecuronium)
  if (activeSugammadexMg >= 100) {
    activeRelaxantIntensity = 0;
  }

  // Intralipid (20% Lipid Emulsion) scavenges local anesthetics (reverses LAST)
  if (activeIntralipidMl >= 50) {
    activeLidocaineMg = Math.max(0, activeLidocaineMg - 200);
    activeBupivacaineMg = Math.max(0, activeBupivacaineMg - 100);
  }

  // =========================================================================
  // 4. MULTI-DRUG SYNERGY & TOXICITY THRESHOLDS
  // =========================================================================
  const propofolMgPerKg = activePropofolMg / patient.weightKg;
  const fentanylMcgPerKg = activeFentanylMcg / patient.weightKg;
  const ketamineMgPerKg = activeKetamineMg / patient.weightKg;
  const midazolamMgPerKg = activeMidazolamMg / patient.weightKg;

  // Synergistic Multipliers (Opioid + Benzo + Propofol supra-additive depression)
  let synergyDepression = 1.0;
  const hasOpioid = fentanylMcgPerKg > 0.5 || activeMorphineMg > 2;
  const hasBenzo = midazolamMgPerKg > 0.015;
  const hasPropofol = propofolMgPerKg > 0.5;

  if (hasOpioid && hasBenzo && hasPropofol) {
    synergyDepression = 2.2; // Severe triple-synergy
  } else if ((hasOpioid && hasBenzo) || (hasOpioid && hasPropofol)) {
    synergyDepression = 1.6; // Double-synergy
  }

  // Local Anesthetic Systemic Toxicity (LAST)
  const isLAST =
    (activeBupivacaineMg > (isElderly ? 75 : 125)) ||
    (activeLidocaineMg > (isElderly ? 250 : 400));

  // =========================================================================
  // 5. MUSCLE TONE & NEUROMUSCULAR PARALYSIS
  // =========================================================================
  if (activeRelaxantIntensity >= 0.7) {
    p.muscleTone = 'flaccid';
    p.muscleTonePercent = 0;
    p.tofCount = 0;
    p.tofRatio = 0;
  } else if (activeRelaxantIntensity >= 0.4) {
    p.muscleTone = 'relaxed';
    p.muscleTonePercent = 15;
    p.tofCount = 1;
    p.tofRatio = 0.15;
  } else if (activeRelaxantIntensity >= 0.2) {
    p.muscleTone = 'relaxed';
    p.muscleTonePercent = 40;
    p.tofCount = 2;
    p.tofRatio = 0.4;
  } else if (activeRelaxantIntensity >= 0.08) {
    p.muscleTone = 'normal';
    p.muscleTonePercent = 70;
    p.tofCount = 3;
    p.tofRatio = 0.65;
  } else {
    p.muscleTone = 'normal';
    p.muscleTonePercent = 100;
    p.tofCount = 4;
    p.tofRatio = 0.95;
  }

  // =========================================================================
  // 6. DEPTH OF ANESTHESIA & BIS
  // =========================================================================
  const sevoMac40 = 2.0;
  const ageFactor = 1 - (patient.age - 40) * 0.005;
  const target1Mac = Math.max(1.1, sevoMac40 * ageFactor);

  if (v.vaporizerDialPercent > 0) {
    const dialTarget = v.vaporizerDialPercent * 0.85;
    v.liveEtAgent = Number((v.liveEtAgent + (dialTarget - v.liveEtAgent) * 0.12).toFixed(2));
    v.liveFiAgent = Number((v.vaporizerDialPercent * 0.95).toFixed(1));
    v.liveMac = Number((v.liveEtAgent / target1Mac).toFixed(2));
  } else {
    v.liveEtAgent = Number(Math.max(0, (v.liveEtAgent || 0) * 0.94).toFixed(2));
    v.liveFiAgent = Number(Math.max(0, (v.liveFiAgent || 0) * 0.90).toFixed(2));
    v.liveMac = Number(((v.liveEtAgent || 0) / target1Mac).toFixed(2));
  }

  const hypnoticDepth = (propofolMgPerKg / 2.0) + (activeEtomidateMg / (0.25 * patient.weightKg)) + (ketamineMgPerKg / 1.5) * 0.8;
  const totalAnestheticDepth = (v.liveMac + hypnoticDepth) * synergyDepression;

  if (totalAnestheticDepth >= 2.5) {
    p.consciousness = 'deep';
    p.bis = Math.max(0, Math.round(20 - (totalAnestheticDepth - 2.5) * 8)); // Burst suppression
  } else if (totalAnestheticDepth >= 1.2) {
    p.consciousness = 'deep';
    p.bis = Math.max(0, Math.round(35 - (totalAnestheticDepth - 1.2) * 12));
  } else if (totalAnestheticDepth >= 0.7) {
    p.consciousness = 'unconscious';
    p.bis = Math.round(42 + (1.2 - totalAnestheticDepth) * 18);
  } else if (totalAnestheticDepth >= 0.35) {
    p.consciousness = 'sedated';
    p.bis = Math.round(60 + (0.7 - totalAnestheticDepth) * 28);
  } else if (totalAnestheticDepth >= 0.15) {
    p.consciousness = 'drowsy';
    p.bis = Math.round(75 + (0.35 - totalAnestheticDepth) * 35);
  } else {
    p.consciousness = 'awake';
    p.bis = Math.min(98, Math.round(88 + (0.15 - totalAnestheticDepth) * 60));
  }

  // =========================================================================
  // 7. RESPIRATORY RATE & APNEA MECHANICS (ZERO FLOORS)
  // =========================================================================
  const isParalyzed = p.muscleTonePercent < 35 || activeRelaxantIntensity > 0.2;
  const isVentilated = v.powerOn && v.bagVentSwitch === 'vent' && (p.airwayDevice === 'ett' || p.airwayDevice === 'lma');

  // Central respiratory depression score
  const centralRespDepression = (
    (fentanylMcgPerKg / 1.8) +
    (propofolMgPerKg / 2.0) +
    (midazolamMgPerKg / 0.04) * 0.5 +
    (v.liveMac * 0.6)
  ) * synergyDepression;

  if (isParalyzed || centralRespDepression >= 1.0) {
    // COMPLETE APNEA! Patient cannot draw a single breath
    p.rr = 0;
  } else if (centralRespDepression > 0.4) {
    // Severe central hypoventilation
    p.rr = Math.max(0, Math.round(14 * (1 - centralRespDepression)));
  } else {
    // Spontaneous ventilation drive responds to PaCO2
    p.rr = Math.max(0, Math.round(12 + (p.paco2MmHg - 40) * 0.35));
  }

  // Fresh gas delivered FiO2
  const totalFgf = v.o2FlowLpm + v.airFlowLpm + v.n2oFlowLpm;
  if (totalFgf > 0.1) {
    v.liveFio2 = Math.min(100, Math.max(0, Math.round(((v.o2FlowLpm * 1.0 + v.airFlowLpm * 0.21) / totalFgf) * 100)));
  } else {
    v.liveFio2 = 21;
  }

  // =========================================================================
  // 8. OXYGENATION & GAS EXCHANGE DYNAMICS (ZERO FLOORS)
  // =========================================================================
  if (!isVentilated) {
    // Patient is NOT on ventilator
    if (p.rr === 0) {
      // APNEIC PATIENT WITHOUT MECHANICAL VENTILATION
      p.etco2 = 0; // Flatline capnogram (no air movement)
      p.paco2MmHg = Math.min(140, p.paco2MmHg + 0.22); // +13 mmHg/min respiratory acidosis
      p.ph = Number((7.40 - 0.008 * (p.paco2MmHg - 40)).toFixed(2));

      // Oxygen reservoir depletion
      if (p.preoxygenationLevel > 0) {
        // Burn through FRC pre-oxygenation reserve
        p.preoxygenationLevel = Math.max(0, p.preoxygenationLevel - 0.7);
        p.spo2 = Math.max(0, Math.round((p.spo2 - 0.05) * 10) / 10);
      } else {
        // FRC is exhausted: steep drop along oxyhemoglobin curve!
        let dropRate = 0.5;
        if (p.spo2 < 85) dropRate = 2.2;
        if (p.spo2 < 65) dropRate = 4.0;
        if (p.spo2 < 40) dropRate = 5.5;

        // Positive feedback hypoxia acceleration!
        p.spo2 = Math.max(0, Math.round((p.spo2 - dropRate) * 10) / 10);
      }
    } else {
      // Spontaneous breathing
      if (p.rr < 7) {
        // Hypoventilating room air
        p.paco2MmHg = Math.min(110, p.paco2MmHg + 0.12);
        p.etco2 = Math.max(0, Math.round(p.paco2MmHg - 3));
        p.ph = Number((7.40 - 0.008 * (p.paco2MmHg - 40)).toFixed(2));
        p.spo2 = Math.max(0, Math.round((p.spo2 - 0.4) * 10) / 10);
      } else {
        // Normoventilating
        const targetPaCO2 = 40;
        p.paco2MmHg += (targetPaCO2 - p.paco2MmHg) * 0.05;
        p.etco2 = Math.max(0, Math.round(p.paco2MmHg - 3));
        p.ph = Number((7.40 - 0.008 * (p.paco2MmHg - 40)).toFixed(2));
        // Recover SpO2 if breathing room air/O2
        p.spo2 = Math.min(100, Math.round((p.spo2 + 0.3) * 10) / 10);
      }
    }
  } else {
    // Mechanical Ventilation is ACTIVE
    p.rr = v.setRR;
    const deadSpaceMl = Math.round(patient.weightKg * 2.2);
    const deliveredVt = v.setVt;
    const alveolarVt = Math.max(0, deliveredVt - deadSpaceMl);
    const minuteVolLpm = (deliveredVt * v.setRR) / 1000;
    const alveolarMvLpm = (alveolarVt * v.setRR) / 1000;

    v.liveDeliveredVt = deliveredVt;
    v.liveMinuteVolume = Number(minuteVolLpm.toFixed(1));
    v.livePip = Math.round(v.peep + (deliveredVt / Math.max(10, p.lungComplianceMlCmH2o)) + 4);
    v.livePplat = Math.round(v.peep + (deliveredVt / Math.max(10, p.lungComplianceMlCmH2o)));

    if (v.liveFio2 < 21) {
      // Hypoxic gas delivery!
      p.spo2 = Math.max(0, Math.round((p.spo2 - 3.0) * 10) / 10);
    } else if (alveolarMvLpm < 1.2) {
      // Hypoventilation on vent
      p.paco2MmHg = Math.min(120, p.paco2MmHg + 0.16);
      p.etco2 = Math.max(0, Math.round(p.paco2MmHg - 2));
      p.ph = Number((7.40 - 0.008 * (p.paco2MmHg - 40)).toFixed(2));
    } else {
      // Adequate mechanical minute ventilation: clears PaCO2 towards normal
      const targetPaCO2 = Math.round(40 / Math.max(0.4, alveolarMvLpm / 3.5));
      p.paco2MmHg += (targetPaCO2 - p.paco2MmHg) * 0.08;
      p.etco2 = Math.max(0, Math.round(p.paco2MmHg - 2));
      p.ph = Number((7.40 - 0.008 * (p.paco2MmHg - 40)).toFixed(2));

      // Oxygenation recovers based on FiO2 & PEEP
      const targetSpo2 = v.liveFio2 >= 80 ? 100 : v.liveFio2 >= 40 ? 99 : 97;
      if (p.spo2 < targetSpo2) {
        p.spo2 = Math.min(100, Math.round((p.spo2 + 1.2) * 10) / 10);
      }
    }
  }

  // =========================================================================
  // 9. HEMODYNAMICS & BLOOD PRESSURE (CONTINUOUS, ZERO AUTOMATIC DRIFT)
  // =========================================================================
  // Calculate continuous drug vasodilatory / myocardial depression impact
  let drugBpPenalty = 0;
  // Propofol: Therapeutic drop (15-25%), Overdose drop (40-80%)
  if (propofolMgPerKg > 0.3) {
    const propDrop = propofolMgPerKg > 3.5
      ? (35 + (propofolMgPerKg - 3.5) * 18) // Severe overdose!
      : (12 + propofolMgPerKg * 7);
    drugBpPenalty += propDrop * frailtyMultiplier;
  }
  // Inhalational Volatiles: ~12 mmHg per MAC
  drugBpPenalty += (v.liveMac * 12);
  // Dexmedetomidine / Opioids
  if (activeDexmedetomidineMcg > 10) drugBpPenalty += 10;

  // Vasodilators (Phentolamine, Nitroprusside, Clevidipine, Nicardipine, Magnesium)
  const vasodilatorDrop =
    (activePhentolamineMg / 2.0) * 25 +
    (activeNitroprussideMcg / 50) * 32 +
    (activeClevidipineMg / 2.0) * 22 +
    (activeNicardipineMg / 1.0) * 18 +
    (activeMagnesiumG / 2.0) * 8;
  drugBpPenalty += vasodilatorDrop;

  // Local Anesthetic Systemic Toxicity (LAST) cardiotoxicity
  if (isLAST) {
    drugBpPenalty += 45; // Profound cardiogenic shock!
  }

  // Vasopressors & Inotropes (Direct MAP increase)
  const pressorBoost = activePressorScore * 22;

  // Intravascular Volume Deficit (Hemorrhage)
  const volumeDeficit = Math.max(0, 5000 - p.bloodVolumeMl);
  const hemorrhagePenalty = (volumeDeficit / 2500) * 45;

  // Ventilator intrathoracic pressure penalty (high PIP / high PEEP)
  let ventPressurePenalty = 0;
  if (isVentilated && (v.setVt / patient.weightKg > 10 || v.peep > 12)) {
    ventPressurePenalty = Math.round((v.peep > 12 ? (v.peep - 12) * 3 : 0) + (v.livePip > 35 ? (v.livePip - 35) * 0.8 : 0));
  }

  // =========================================================================
  // 10. POSITIVE FEEDBACK LOOPS (CORONARY PERFUSION & MYOCARDIAL DECOMPENSATION)
  // =========================================================================
  // Notice: We DO NOT drift back to baseline!
  // MAP changes only based on drug decay, treatments, and positive feedback worsening:
  let netMapDelta = 0;

  // 1. Drug clearance recovery: As drugs wear off, the penalty reduces
  // 2. Active treatments: Fluids increase volume, pressors increase tone
  // 3. Ongoing insults: Hemorrhage, untreated complications

  // Positive feedback coronary ischemia spiral:
  if (p.map < 50 && p.map > 0) {
    // Low MAP reduces coronary perfusion pressure (CPP = DBP - LVEDP), worsening myocardial contractility
    const ischemiaSpeed = p.map < 30 ? 0.9 : p.map < 40 ? 0.45 : 0.2;
    netMapDelta -= ischemiaSpeed;
  }

  // Positive feedback hypovolemic drain:
  if (hemorrhagePenalty > 15) {
    netMapDelta -= 0.35; // Ongoing unresuscitated hemorrhagic shock
  }

  // Pressor treatment active:
  if (pressorBoost > 5) {
    netMapDelta += Math.min(2.5, pressorBoost * 0.1);
  }

  // CPR effect if active: Generates artificial MAP 45-55 mmHg
  if (cprActive) {
    p.map = Math.round(p.map + (50 - p.map) * 0.2);
    p.sbp = Math.round(p.map * 1.3);
    p.dbp = Math.round(p.map * 0.7);
    p.etco2 = Math.max(p.etco2, 18); // CPR clears minimal EtCO2
  } else {
    // Continuous MAP integration (Zero lower limit)
    // Dynamic target calculated from baseline minus active insults plus active treatments
    const dynamicTargetMap = Math.max(
      0,
      (patient.baselineVitals.map || 90) - drugBpPenalty - hemorrhagePenalty - ventPressurePenalty + pressorBoost
    );

    // Continuous smooth transition towards dynamic state (NO preset snapping)
    p.map = Math.max(0, Math.round((p.map + (dynamicTargetMap - p.map) * 0.08 + netMapDelta) * 10) / 10);
    p.sbp = Math.max(0, Math.round(p.map * 1.35));
    p.dbp = Math.max(0, Math.round(p.map * 0.75));
  }

  // =========================================================================
  // 11. HEART RATE DYNAMICS & HYPOXIC/ISCHEMIC BRADYCARDIA (ZERO FLOORS)
  // =========================================================================
  let targetHr = patient.baselineVitals.hr || 75;

  // Atropine treatment:
  if (activeAtropineMg > 0.2) {
    targetHr += Math.min(45, (activeAtropineMg / 0.5) * 30);
  }

  // Esmolol beta-1 blockade:
  if (activeEsmololMg > 5) {
    targetHr -= Math.min(35, (activeEsmololMg / 20) * 22);
  }

  // Ketamine:
  if (ketamineMgPerKg > 0.4 && ketamineMgPerKg <= 3.5) {
    targetHr += Math.min(30, ketamineMgPerKg * 15);
  }

  // Compensatory tachycardia from moderate hypotension / pain
  if (p.map < 65 && p.map >= 45 && p.spo2 > 70) {
    targetHr += Math.round((65 - p.map) * 1.2);
  }

  // Pain tachycardia
  if (p.painScore > 30 && p.consciousness !== 'deep' && p.map > 50) {
    targetHr += Math.round((p.painScore - 30) * 0.4);
  }

  // Hypoxic Bradycardia Spiral:
  // When SpO2 < 70%, carotid body hypoxia triggers profound vagal cardio-inhibition!
  if (p.spo2 < 70 && p.spo2 > 0) {
    const hypoxiaDrop = p.spo2 < 45 ? 4.0 : p.spo2 < 60 ? 2.5 : 1.2;
    p.hr = Math.max(0, Math.round(p.hr - hypoxiaDrop));
  } else if (p.map < 35 && p.map > 0) {
    // Severe myocardial ischemia bradycardia
    p.hr = Math.max(0, Math.round(p.hr - 2.0));
  } else if (propofolMgPerKg > 4.0) {
    // Massive propofol overdose direct SA node & myocardial depression
    p.hr = Math.max(0, Math.round(p.hr - 2.5));
  } else {
    // Smooth physiological HR transition
    p.hr = Math.max(0, Math.round(p.hr + (targetHr - p.hr) * 0.06));
  }

  // =========================================================================
  // 12. SCRIPTED COMPLICATION TICKS (ZERO FLOORS, CONTINUOUS WORSENING)
  // =========================================================================
  for (const comp of activeComplications) {
    if (comp.active && !comp.treated) {
      // Bronchospasm: Progressive resistance rise, SpO2 drop
      if (comp.id.includes('bronchospasm')) {
        p.airwayResistanceCmH2o = Math.min(60, p.airwayResistanceCmH2o + 1.2);
        p.breathSounds = 'Bilateral Wheezing (Bronchospasm)';
        p.airwayPatency = 'bronchospasm';
        p.spo2 = Math.max(0, p.spo2 - 0.8);
      }
      // Vagal Bradycardia (Insufflation): Heart rate plummets until 0 if untreated!
      if (comp.id.includes('vagal')) {
        p.hr = Math.max(0, p.hr - 2.5); // Plummets without floor!
        p.sbp = Math.max(0, p.sbp - 2.0);
        p.map = Math.max(0, Math.round((p.sbp + 2 * p.dbp) / 3));
        p.rhythm = p.hr < 30 ? 'Sinus Bradycardia' : p.rhythm;
      }
      // BCIS cement shock: Severe pulmonary vasoconstriction & right heart failure
      if (comp.id.includes('bcis')) {
        p.map = Math.max(0, p.map - 2.2);
        p.etco2 = Math.max(0, p.etco2 - 0.8);
        p.sbp = Math.max(0, Math.round(p.map * 1.3));
        p.dbp = Math.max(0, Math.round(p.map * 0.7));
      }
      // Pheochromocytoma Adrenal Vein Clamping: Rebound Hyperinsulinemia
      if (comp.id.includes('vein-clamp') && comp.active) {
        if (p.glucoseMgDl > 35) {
          p.glucoseMgDl = Math.max(30, Math.round((p.glucoseMgDl - 0.35) * 10) / 10);
          p.glucoseMmol = Number((p.glucoseMgDl / 18.0).toFixed(1));
        }
        if (p.glucoseMgDl < 55) {
          p.consciousness = 'coma';
          p.bis = Math.min(p.bis, 36);
        }
      }
      // Hemorrhage: Unchecked bleeding drains blood volume
      if (comp.id.includes('hemorrhage') || comp.id.includes('atony')) {
        p.bloodVolumeMl = Math.max(0, p.bloodVolumeMl - 25);
        p.bloodLossMl += 25;
      }
    }
  }

  // =========================================================================
  // 13. DYNAMIC ECG RHYTHM PROGRESSION & CARDIAC ARREST
  // =========================================================================
  let isCardiacArrest = false;
  let arrestRhythm: HeartRhythm | undefined;

  // A. Local Anesthetic Toxicity (LAST) or Severe Hyperkalemia -> Ventricular Fibrillation (VF)
  if (isLAST || p.potassiumMeqL >= 6.8) {
    p.rhythm = 'Ventricular Fibrillation (VF)';
    p.hr = 0;
    p.sbp = 0;
    p.dbp = 0;
    p.map = 0;
    isCardiacArrest = true;
    arrestRhythm = 'Ventricular Fibrillation (VF)';
  }
  // B. Profound Hypoxia (SpO2 < 50%) -> Malignant Arrhythmia / Asystole
  else if (p.spo2 <= 30 || p.hr <= 15) {
    if (p.hr <= 10 || p.spo2 <= 15) {
      p.rhythm = 'Asystole';
      p.hr = 0;
      p.sbp = 0;
      p.dbp = 0;
      p.map = 0;
    } else {
      p.rhythm = 'Ventricular Tachycardia (VT)';
    }
    isCardiacArrest = true;
    arrestRhythm = p.rhythm;
  }
  // C. Exsanguination / Hemorrhagic Shock / Overdose -> PEA
  else if (p.map <= 25 || p.bloodVolumeMl < 2400) {
    p.rhythm = 'Pulseless Electrical Activity (PEA)';
    p.sbp = Math.min(25, p.sbp);
    p.map = Math.min(20, p.map);
    isCardiacArrest = true;
    arrestRhythm = 'Pulseless Electrical Activity (PEA)';
  }
  // D. Severe Bradycardia
  else if (p.hr < 45) {
    p.rhythm = 'Sinus Bradycardia';
  }
  // E. Severe Tachycardia
  else if (p.hr > 125) {
    p.rhythm = 'Sinus Tachycardia';
  } else {
    p.rhythm = 'Normal Sinus Rhythm';
  }

  // =========================================================================
  // 14. PATIENT DEATH CRITERIA & TIMERS (NO SAFETY NETS)
  // =========================================================================
  let isDead = false;
  let deathCause: string | undefined;
  let correctManagement: string | undefined;

  // 1. Cardiac Arrest Timer: > 75 seconds without effective CPR/defibrillation
  if (isCardiacArrest) {
    if (!cprActive) {
      p.timeInArrestSec = (p.timeInArrestSec || 0) + 1;
    }
    if (p.timeInArrestSec >= 75) {
      isDead = true;
      if (isLAST) {
        deathCause = 'Refractory Cardiac Arrest from Local Anesthetic Systemic Toxicity (LAST).';
        correctManagement = 'Stop local anesthetic injection immediately, call for help, initiate CPR, and administer 20% Lipid Emulsion (Intralipid 1.5 mL/kg bolus).';
      } else if (propofolMgPerKg > 4.0) {
        deathCause = `Fatal Cardiovascular Collapse from Propofol Overdose (${Math.round(activePropofolMg)} mg, ${propofolMgPerKg.toFixed(1)} mg/kg).`;
        correctManagement = 'Avoid massive induction boluses. In fragile or elderly patients, titrate Propofol in 20-40 mg increments and support blood pressure with Phenylephrine / Ephedrine.';
      } else if (p.spo2 < 40) {
        deathCause = 'Hypoxic Asystolic Cardiac Arrest secondary to uncorrected airway obstruction / apnea.';
        correctManagement = 'Maintain continuous oxygenation and positive pressure ventilation. When administering paralytics or opioids, immediately verify bilateral chest rise, breath sounds, and sustained EtCO2.';
      } else {
        deathCause = `Irreversible Biological Death following ${p.rhythm} lasting > 75 seconds without effective resuscitation.`;
        correctManagement = 'Initiate high-quality CPR (100-120 compressions/min), push Epinephrine 1 mg IV STAT, discontinue volatile anesthetics, and deliver 100% FiO2.';
      }
    }
  } else {
    // If not in arrest, arrest timer slowly recovers
    p.timeInArrestSec = Math.max(0, (p.timeInArrestSec || 0) - 2);
  }

  // 2. Severe Hypoxia Timer: SpO2 < 50% for > 120 seconds (2 minutes)
  if (p.spo2 < 50 && p.spo2 > 0) {
    p.timeInSevereHypoxiaSec = (p.timeInSevereHypoxiaSec || 0) + 1;
    if (p.timeInSevereHypoxiaSec >= 120) {
      isDead = true;
      deathCause = 'Irreversible Anoxic Brainstem Death from Prolonged Severe Hypoxemia (SpO2 < 50% for > 2 minutes).';
      correctManagement = 'Recognize desaturation early. Pre-oxygenate adequately to 100% FRC, confirm tracheal tube placement with capnography, switch ventilator to auto, and suction secretions.';
    }
  } else if (p.spo2 >= 75) {
    p.timeInSevereHypoxiaSec = Math.max(0, (p.timeInSevereHypoxiaSec || 0) - 2);
  }

  // 3. Severe Hypotension Timer: MAP < 40 mmHg for > 180 seconds (3 minutes)
  if (p.map < 40 && p.map > 0) {
    p.timeInSevereHypotensionSec = (p.timeInSevereHypotensionSec || 0) + 1;
    if (p.timeInSevereHypotensionSec >= 180) {
      isDead = true;
      deathCause = 'Irreversible Ischemic Multi-Organ Failure & Shock (MAP < 40 mmHg for > 3 minutes).';
      correctManagement = 'Treat profound hypotension immediately with IV fluid boluses, reduce or turn off volatile anesthetics, and titrate vasopressors (Phenylephrine 100 mcg, Norepinephrine, or Ephedrine).';
    }
  } else if (p.map >= 60) {
    p.timeInSevereHypotensionSec = Math.max(0, (p.timeInSevereHypotensionSec || 0) - 2);
  }

  // If patient died on this tick, flatline all vitals
  if (isDead) {
    p.isDead = true;
    p.deathCause = deathCause;
    p.hr = 0;
    p.sbp = 0;
    p.dbp = 0;
    p.map = 0;
    p.spo2 = 0;
    p.etco2 = 0;
    p.rr = 0;
    p.rhythm = 'Asystole';
    p.consciousness = 'coma';
    p.bis = 0;
    p.painScore = 0;
  }

  return {
    nextPhysiology: p,
    nextVentilator: v,
    activeDrugs: updatedDrugs,
    narratorEvents,
    isCardiacArrest,
    arrestRhythm,
    isDead,
    deathCause,
    correctManagement,
  };
}
