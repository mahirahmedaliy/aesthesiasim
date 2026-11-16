import React, { useState, useEffect, useRef } from 'react';
import {
  ClinicalCase,
  PerioperativePhase,
  DynamicPhysiology,
  VentilatorState,
  ActiveDrugEffect,
  MonitoringAttachments,
  NarratorMessage,
  ActionLogEntry,
  ComplicationTrigger,
  HeartRhythm,
  ClinicalMistake,
} from '../../types/simulator';
import { simulatePhysiologyTick } from '../../engine/physiologyEngine';
import { SimulatorDrug, SIMULATOR_DRUGS, checkIntubationReadiness } from '../../data/medications';
import { NarratorBar } from '../narrator/NarratorBar';
import { LivePatientMonitor } from '../monitor/LivePatientMonitor';
import { AnesthesiaMachineScreen } from '../machine/AnesthesiaMachineScreen';
import { ActionPanel } from '../actions/ActionPanel';
import { HintModal } from '../modals/HintModal';
import { DebriefModal } from '../modals/DebriefModal';
import { CodeBlueModal } from '../modals/CodeBlueModal';
import { PatientDiedModal } from '../modals/PatientDiedModal';
import {
  Play,
  Pause,
  Clock,
  Lightbulb,
  ArrowLeft,
  Award,
  Sparkles,
  Layers,
  ShieldAlert,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';
import { logSessionToSupabase } from '../../lib/supabase';
import { saveCaseCompletion } from '../../lib/authService';

interface PatientManagementPageProps {
  clinicalCase: ClinicalCase;
  onReturnToLobby: () => void;
}

export const PatientManagementPage: React.FC<PatientManagementPageProps> = ({
  clinicalCase,
  onReturnToLobby,
}) => {
  // Phase Progression
  const [phase, setPhase] = useState<PerioperativePhase>('preop_assessment');
  const [phaseStartTimeSec, setPhaseStartTimeSec] = useState<number>(0);
  const [completedRequiredActions, setCompletedRequiredActions] = useState<string[]>([]);

  // Anesthesia Machine Pre-Use Checkout & Leak Test
  const [isMachineLeakTestDone, setIsMachineLeakTestDone] = useState<boolean>(false);
  const [isLeakTesting, setIsLeakTesting] = useState<boolean>(false);

  // Simulation Clock
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [timeScale, setTimeScale] = useState<number>(1);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Core Physiology State
  const [phys, setPhys] = useState<DynamicPhysiology>(clinicalCase.initialPhysiology);

  // Ventilator & Anesthesia Workstation State (Starts in Standby / Power OFF)
  const [vent, setVent] = useState<VentilatorState>({
    powerOn: false,
    mode: 'Manual/Bag',
    bagVentSwitch: 'bag',
    setVt: Math.round(clinicalCase.patient.weightKg * 7),
    setRR: 12,
    peep: 5,
    ieRatio: '1:2',
    pmax: 40,
    aplValveCmH2o: 30,
    o2FlowLpm: 2.0,
    airFlowLpm: 2.0,
    n2oFlowLpm: 0,
    vaporizerAgent: 'Sevoflurane',
    vaporizerDialPercent: 0,
    livePip: 0,
    livePplat: 0,
    liveDeliveredVt: 0,
    liveMinuteVolume: 0,
    liveFio2: 21,
    liveEto2: 16,
    liveFiAgent: 0,
    liveEtAgent: 0,
    liveMac: 0,
    alarms: {
      highPressure: false,
      lowPressureDisconnect: false,
      lowFio2: false,
      apnea: false,
    },
  });

  // Monitoring Attachments
  const [monitoring, setMonitoring] = useState<MonitoringAttachments>({
    ecgAttached: true,
    spo2Attached: true,
    nibpAttached: true,
    etco2Attached: true,
    tempAttached: true,
    artLineAttached: false,
    bisAttached: false,
    tofAttached: false,
    nibpCyclingIntervalMinutes: 3,
    lastNibpTimeSec: 0,
    isNibpInflating: false,
  });

  // Pharmacokinetics Active Drugs
  const [activeDrugs, setActiveDrugs] = useState<ActiveDrugEffect[]>([]);

  // Scripted Complications
  const [complications, setComplications] = useState<ComplicationTrigger[]>(
    clinicalCase.scriptedComplications.map((c) => ({ ...c }))
  );

  // Narrator Event Feed
  const [narratorMessages, setNarratorMessages] = useState<NarratorMessage[]>([
    {
      id: 'm-0',
      timestampSec: 0,
      timeFormatted: '00:00',
      text: `Patient ${clinicalCase.patient.name} (${clinicalCase.patient.age}yo ${clinicalCase.patient.sex}, ${clinicalCase.patient.weightKg}kg, ${clinicalCase.patient.asaClass}) arrived in OR for ${clinicalCase.patient.procedure}. Begin Pre-Anesthesia Assessment.`,
      type: 'info',
      speaker: 'Attending',
    },
  ]);

  // Action Audit Trail & Vitals History for Debrief
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>([]);
  const [vitalsHistory, setVitalsHistory] = useState<{ timeSec: number; hr: number; map: number; spo2: number; etco2: number }[]>([]);

  // Clinical Mistakes & Real-Life Scoring System
  const [mistakes, setMistakes] = useState<ClinicalMistake[]>([]);
  const lastMistakeTimestampsRef = useRef<Record<string, number>>({});

  // Modals & UI Controls
  const [hintsUsedCount, setHintsUsedCount] = useState<number>(0);
  const [isHintModalOpen, setIsHintModalOpen] = useState<boolean>(false);
  const [isDebriefModalOpen, setIsDebriefModalOpen] = useState<boolean>(false);
  const [isCodeBlueOpen, setIsCodeBlueOpen] = useState<boolean>(false);
  const [codeBlueCause, setCodeBlueCause] = useState<string>('');
  const [isPatientDead, setIsPatientDead] = useState<boolean>(false);
  const [patientDeathCause, setPatientDeathCause] = useState<string>('');
  const [correctManagementPearls, setCorrectManagementPearls] = useState<string>('');
  const [isCPRActive, setIsCPRActive] = useState<boolean>(false);
  const [layoutMode, setLayoutMode] = useState<'split' | 'monitor' | 'machine'>('split');
  const [drawerHeight, setDrawerHeight] = useState<'compact' | 'normal' | 'expanded'>('normal');
  const [isDrawerCollapsed, setIsDrawerCollapsed] = useState<boolean>(false);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState<boolean>(false);

  // Pheochromocytoma Expert Simulation States
  const isPheoCase = clinicalCase.patient.id.includes('pheochromocytoma') || clinicalCase.patient.procedure.toLowerCase().includes('adrenal');
  const [displayedNibp, setDisplayedNibp] = useState<{ sbp: number; dbp: number; map: number }>({
    sbp: clinicalCase.initialPhysiology.sbp,
    dbp: clinicalCase.initialPhysiology.dbp,
    map: clinicalCase.initialPhysiology.map,
  });
  const [hasCheckedPreInductionArtLine, setHasCheckedPreInductionArtLine] = useState<boolean>(false);
  const [lastSurgeTriggerSec, setLastSurgeTriggerSec] = useState<number>(0);
  const [nextSurgeIntervalSec, setNextSurgeIntervalSec] = useState<number>(50);
  const [isSurgeonPausedUntilSec, setIsSurgeonPausedUntilSec] = useState<number>(0);
  const [hasTriggeredHiddenTwistVt, setHasTriggeredHiddenTwistVt] = useState<boolean>(false);
  const [veinClampWarningGiven, setVeinClampWarningGiven] = useState<boolean>(false);
  const [veinClampExecuted, setVeinClampExecuted] = useState<boolean>(false);
  const [postOpDisposition, setPostOpDisposition] = useState<'icu_hdu' | 'pacu' | null>(null);
  const [timeWithSbpOver200, setTimeWithSbpOver200] = useState<number>(0);
  const [timeWithSbpOver250, setTimeWithSbpOver250] = useState<number>(0);

  // Helper to add narrator message
  const addNarratorMessage = (
    text: string,
    type: NarratorMessage['type'] = 'info',
    speaker: NarratorMessage['speaker'] = 'Attending'
  ) => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const msg: NarratorMessage = {
      id: `narrator-${Date.now()}-${Math.random()}`,
      timestampSec: elapsedSeconds,
      timeFormatted,
      text,
      type,
      speaker,
    };

    setNarratorMessages((prev) => [msg, ...prev]);
  };

  // Helper to log action
  const logAction = (
    category: ActionLogEntry['category'],
    title: string,
    detail: string,
    scoreEffect: ActionLogEntry['scoreEffect'] = 'correct',
    pointsDelta: number = 10
  ) => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const logEntry: ActionLogEntry = {
      id: `action-${Date.now()}-${Math.random()}`,
      timestampSec: elapsedSeconds,
      timeFormatted,
      category,
      title,
      detail,
      scoreEffect,
      pointsDelta,
    };

    setActionLogs((prev) => [logEntry, ...prev]);
  };

  // Helper to record clinical mistakes and deduct points from the 100-point score
  const recordMistake = (
    category: ClinicalMistake['category'],
    severity: ClinicalMistake['severity'],
    title: string,
    description: string,
    realLifeConsequence: string,
    correction: string,
    pointsDeducted: number,
    overrideTimestampSec?: number
  ) => {
    const currentSec = overrideTimestampSec !== undefined ? overrideTimestampSec : elapsedSeconds;
    const lastRecorded = lastMistakeTimestampsRef.current[title] ?? -999;

    // Cooldown window: 25 seconds cooldown per exact mistake to prevent tick spam
    if (currentSec - lastRecorded < 25) {
      return;
    }
    lastMistakeTimestampsRef.current[title] = currentSec;

    const mins = Math.floor(currentSec / 60);
    const secs = currentSec % 60;
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const mistake: ClinicalMistake = {
      id: `mistake-${Date.now()}-${Math.random()}`,
      timestampSec: currentSec,
      timeFormatted,
      category,
      severity,
      title,
      description,
      realLifeConsequence,
      correction,
      pointsDeducted,
    };

    setMistakes((prev) => [mistake, ...prev]);

    // Also register in action log as harmful deduction
    const actionCategory: ActionLogEntry['category'] =
      category === 'Ventilation' ? 'ventilation' :
      category === 'Pharmacology & Safety' ? 'medication' :
      category === 'Hemodynamics & Fluids' ? 'fluids' :
      'airway';

    const logEntry: ActionLogEntry = {
      id: `action-${Date.now()}-${Math.random()}`,
      timestampSec: currentSec,
      timeFormatted,
      category: actionCategory,
      title: `⚠️ ${title} (-${pointsDeducted} pts)`,
      detail: description,
      scoreEffect: 'harmful',
      pointsDelta: -pointsDeducted,
    };
    setActionLogs((prev) => [logEntry, ...prev]);

    addNarratorMessage(
      `🚨 CLINICAL PENALTY (-${pointsDeducted} pts): ${title}! ${realLifeConsequence}`,
      severity === 'critical' ? 'critical' : 'warning',
      'Attending'
    );
    audioEngine.playCriticalAlarm();
  };

  // ==========================================
  // REAL-TIME 1-SECOND SIMULATION TICK LOOP
  // ==========================================
  useEffect(() => {
    if (isPaused || isPatientDead || phase === 'debrief') return;

    const interval = setInterval(() => {
      setElapsedSeconds((sec) => {
        const nextSec = sec + 1;

        // Run the central physiology engine
        const tickResult = simulatePhysiologyTick(
          phys,
          vent,
          clinicalCase.patient,
          phase,
          activeDrugs,
          complications,
          nextSec,
          isCPRActive
        );

        setPhys(tickResult.nextPhysiology);
        setVent(tickResult.nextVentilator);
        setActiveDrugs(tickResult.activeDrugs);

        // 1. Biological Death Check
        if (tickResult.isDead) {
          setIsPatientDead(true);
          setPatientDeathCause(tickResult.deathCause || 'Patient expired from uncorrected vital sign collapse.');
          setCorrectManagementPearls(tickResult.correctManagement || 'Immediate ACLS resuscitation required.');
          setIsCodeBlueOpen(false);
          setIsCPRActive(false);
          audioEngine.playFlatlineTone();
          return nextSec;
        }

        // 2. Cardiac Arrest / Resuscitation Phase Check
        if (tickResult.isCardiacArrest) {
          if (!isCodeBlueOpen) {
            setIsCodeBlueOpen(true);
            setCodeBlueCause(
              tickResult.arrestRhythm === 'Asystole'
                ? 'Profound hypoxic-ischemic respiratory failure resulting in Asystole.'
                : tickResult.arrestRhythm === 'Pulseless Electrical Activity (PEA)'
                ? 'Severe unresuscitated hypovolemic/hemorrhagic shock or massive overdose resulting in PEA.'
                : 'Malignant ventricular dysrhythmia (VT/VF) from myocardial ischemia or drug toxicity.'
            );
          }
        }

        // ==========================================
        // AUTOMATED REAL-TIME CLINICAL MISTAKE CHECKS
        // ==========================================
        const p = tickResult.nextPhysiology;
        const v = tickResult.nextVentilator;

        // NIBP cycling update (3-minute cycle if no arterial line, beat-to-beat if A-line attached)
        if (monitoring.artLineAttached || nextSec % 180 === 0) {
          setDisplayedNibp({ sbp: p.sbp, dbp: p.dbp, map: p.map });
        }

        // ==========================================
        // PHEOCHROMOCYTOMA EXPERT CASE DYNAMIC ENGINE
        // ==========================================
        if (isPheoCase) {
          // Pre-induction arterial line check if induction has started
          if ((phase === 'induction' || phase === 'airway' || phase === 'maintenance') && !hasCheckedPreInductionArtLine) {
            setHasCheckedPreInductionArtLine(true);
            if (!monitoring.artLineAttached) {
              recordMistake(
                'Hemodynamics & Fluids',
                'critical',
                'Induction Without Arterial Line in Pheochromocytoma',
                'General anesthesia induction was initiated without an arterial line for continuous beat-to-beat pressure monitoring in a high-risk pheochromocytoma case.',
                'Intermittent NIBP cycling (every 3 minutes) fails to detect rapid, life-threatening catecholamine spikes (>250 mmHg) or profound post-ligation vasoplegic collapse (<60 mmHg).',
                'Always cannulate an arterial line BEFORE induction in pheochromocytoma surgery so hemodynamic instability is recognized and treated beat-to-beat.',
                10,
                nextSec
              );
            }
          }

          // Phase 2 Pneumoperitoneum Insufflation compression & hypercarbia
          if (phase === 'maintenance') {
            const timeInMaint = nextSec - phaseStartTimeSec;
            const isSurgeonPaused = nextSec < isSurgeonPausedUntilSec;

            // Insufflation compression check:
            if (timeInMaint > 20 && timeInMaint < 70 && !veinClampExecuted) {
              if (v.setRR < 14 && v.setVt < 480 && p.etco2 > 50) {
                recordMistake(
                  'Ventilation',
                  'major',
                  'Permissive Hypercarbia During Pneumoperitoneum in Pheochromocytoma',
                  `EtCO2 climbed to ${p.etco2} mmHg during CO2 insufflation without compensatory increase in minute ventilation.`,
                  'Hypercarbia and respiratory acidosis stimulate endogenous catecholamine release from adrenergic nerve endings and tumor, exacerbating hypertension and ectopy.',
                  'Increase respiratory rate (14-18 bpm) or tidal volume (450-520 mL) to clear absorbed CO2 and maintain normocarbia (EtCO2 35-40 mmHg).',
                  10,
                  nextSec
                );
              }
            }

            // Unpredictable dynamic catecholamine surges during tumor manipulation
            if (!isSurgeonPaused && !veinClampExecuted && timeInMaint >= 50) {
              if (nextSec - lastSurgeTriggerSec >= nextSurgeIntervalSec) {
                const activeVasoPower = tickResult.activeDrugs
                  .filter((d) => ['phentolamine', 'sodium_nitroprusside', 'clevidipine', 'nicardipine', 'magnesium_sulfate'].includes(d.drugId))
                  .reduce((sum, d) => sum + (d.currentIntensity ?? 1), 0);

                const surgeSbp = Math.floor(240 + Math.random() * 41); // 240 to 280
                const surgeHr = Math.floor(130 + Math.random() * 29); // 130 to 158

                if (activeVasoPower > 1.2) {
                  // Vasodilator blunts surge
                  addNarratorMessage(
                    `Surgeon: "Manipulating adrenal mass." Active vasodilator infusion blunts the surge (BP maintained at ~${Math.round(p.sbp)} mmHg).`,
                    'info',
                    'Surgeon'
                  );
                } else {
                  // Massive unblunted surge
                  setPhys((cur) => ({
                    ...cur,
                    sbp: Math.max(cur.sbp, surgeSbp),
                    dbp: Math.max(cur.dbp, Math.round(surgeSbp * 0.58)),
                    map: Math.max(cur.map, Math.round(surgeSbp * 0.72)),
                    hr: Math.max(cur.hr, surgeHr),
                    rhythm: 'Premature Ventricular Contractions (PVCs)',
                  }));
                  audioEngine.playCriticalAlarm();
                  addNarratorMessage(
                    `⚠️ TUMOR MANIPULATION CATECHOLAMINE STORM! Direct capsular handling: Arterial line spiking to ${surgeSbp}/${Math.round(surgeSbp * 0.58)} mmHg, HR ${surgeHr} bpm with frequent PVCs! Push Phentolamine/Nitroprusside/Clevidipine and communicate with surgeon to pause manipulation!`,
                    'critical',
                    'Surgeon'
                  );
                }
                setNextSurgeIntervalSec(Math.floor(45 + Math.random() * 45)); // 45 to 90 seconds
                setLastSurgeTriggerSec(nextSec);
              }
            }

            // Hidden Twist: At ~8 minutes (~480s into maintenance), sudden surge + sustained VT!
            if (!hasTriggeredHiddenTwistVt && timeInMaint >= 480 && !veinClampExecuted) {
              setHasTriggeredHiddenTwistVt(true);
              setPhys((cur) => ({
                ...cur,
                sbp: 265,
                dbp: 140,
                map: 182,
                hr: 165,
                rhythm: 'Ventricular Tachycardia (VT)',
                stElevationMm: -2.5,
              }));
              audioEngine.playCriticalAlarm();
              addNarratorMessage(
                '🚨 MALIGNANT VENTRICULAR TACHYCARDIA! Deep retroperitoneal dissection off the inferior vena cava triggers explosive catecholamine discharge! Monomorphic VT at 165 bpm! Arterial line pulsatility diminished! Administer Amiodarone / Lidocaine STAT and order surgeon to pause manipulation!',
                'critical',
                'Attending'
              );
            }

            // Track Time with SBP > 200 & SBP > 250
            if (p.sbp > 200 && !veinClampExecuted) {
              setTimeWithSbpOver200((t) => t + 1);
            }
            if (p.sbp > 250 && !veinClampExecuted) {
              setTimeWithSbpOver250((t) => {
                const nextT = t + 1;
                if (nextT === 120) {
                  recordMistake(
                    'Hemodynamics & Fluids',
                    'critical',
                    'Sustained Severe Hypertensive Crisis (SBP > 250 for > 2 min)',
                    'Systolic blood pressure remained greater than 250 mmHg for over 2 minutes of surgical manipulation.',
                    'Acute left ventricular afterload mismatch, flash hydrostatic pulmonary edema, and high risk of intracranial hemorrhage.',
                    'Aggressively titrate Phentolamine boluses (1-5 mg), Sodium Nitroprusside, or Clevidipine, and order surgeon to pause manipulation.',
                    20,
                    nextSec
                  );
                  setPhys((cur) => ({
                    ...cur,
                    breathSounds: 'Crackles / Pulmonary Edema',
                    spo2: Math.max(0, cur.spo2 - 12),
                    airwayResistanceCmH2o: Math.max(cur.airwayResistanceCmH2o, 36),
                  }));
                  addNarratorMessage(
                    '🚨 CRITICAL AFTERLOAD CRISIS: SBP > 250 mmHg for over 2 minutes! Acute left ventricular failure! Pink frothy secretions in ETT! ST-segment depression -2.5mm on Lead II! High risk of hemorrhagic stroke!',
                    'critical',
                    'Attending'
                  );
                }
                return nextT;
              });
            }

            // Vein Clamping: 1 minute warning at ~660s (11 min)
            if (!veinClampWarningGiven && timeInMaint >= 660) {
              setVeinClampWarningGiven(true);
              addNarratorMessage(
                'Surgeon: "Main left adrenal vein is isolated. About to clamp and ligate in approximately 1 minute! Anesthesia team: discontinue all vasodilator infusions immediately and prepare for post-ligation vasoplegia!"',
                'warning',
                'Surgeon'
              );
            }

            // Vein Clamping: Execution at ~720s (12 min)
            if (!veinClampExecuted && timeInMaint >= 720) {
              setVeinClampExecuted(true);
              setComplications((currentComps) =>
                currentComps.map((comp) => (comp.id.includes('vein-clamp') ? { ...comp, active: true } : comp))
              );

              // Check if vasodilators are still running
              const vasodilatorsActive = tickResult.activeDrugs.some(
                (d) => ['sodium_nitroprusside', 'clevidipine', 'phentolamine'].includes(d.drugId) && (d.currentIntensity ?? 1) > 0.15
              );

              if (vasodilatorsActive) {
                // Catastrophic collapse!
                recordMistake(
                  'Hemodynamics & Fluids',
                  'critical',
                  'Failure to Discontinue Vasodilators at Vein Clamping',
                  'Potent vasodilator infusions (Nitroprusside/Clevidipine/Phentolamine) were left running as the main adrenal vein was clamped.',
                  'Instantaneous cessation of endogenous catecholamines combined with exogenous vasodilation causes catastrophic circulatory collapse (BP 55/28 mmHg) and PEA arrest.',
                  'Always turn off vasodilator infusions at least 1-2 minutes BEFORE adrenal vein clamping, and prepare fluid boluses and Norepinephrine/Vasopressin.',
                  15,
                  nextSec
                );
                setPhys((cur) => ({
                  ...cur,
                  sbp: 55,
                  dbp: 28,
                  map: 37,
                  rhythm: 'Pulseless Electrical Activity (PEA)',
                }));
                audioEngine.playCriticalAlarm();
                addNarratorMessage(
                  '🚨 CATASTROPHIC CIRCULATORY COLLAPSE: Adrenal vein clamped while vasodilators were still running! BP crashes to 55/28 mmHg! Immediate circulatory arrest! Discontinue all vasodilators! Push Epinephrine/Norepinephrine, Vasopressin, and rapid fluid boluses!',
                  'critical',
                  'Attending'
                );
              } else {
                // Expected post-ligation vasoplegia
                addNarratorMessage(
                  'Surgeon: "Main adrenal vein is CLAMPED and transected!" Endogenous catecholamines drop sharply. SVR is low from phenoxybenzamine. Administer fluid boluses, Norepinephrine, and Vasopressin.',
                  'success',
                  'Surgeon'
                );
                setPhys((cur) => ({
                  ...cur,
                  sbp: Math.min(cur.sbp, 80),
                  dbp: Math.min(cur.dbp, 48),
                  map: Math.min(cur.map, 59),
                }));
              }
            }
          }
        }

        // 1. Awake Paralysis (Devastating Locked-in State)
        const isMotorBlocked = p.tofCount < 4 || p.muscleTonePercent < 50;
        const isConsciousAware = p.consciousness === 'awake' || (p.bis > 75 && v.liveMac < 0.3);
        if (isMotorBlocked && isConsciousAware) {
          recordMistake(
            'Anesthetic Depth & Awareness',
            'critical',
            'Awake Paralysis / Locked-In State',
            `Patient has regained consciousness (BIS ${Math.round(p.bis)}, ${p.consciousness}) while still paralyzed under neuromuscular blockade (TOF ${p.tofCount}/4, motor tone ${p.muscleTonePercent}%) without adequate hypnotic depth.`,
            'Devastating psychological horror and PTSD. The patient is fully aware but locked in their body, unable to breathe or signal distress.',
            'Immediately administer an IV hypnotic bolus (e.g. Propofol 50-100 mg) or deepen volatile anesthetic depth before or while reversing muscle relaxation.',
            25,
            nextSec
          );
        }

        // 2. Intraoperative Awareness Under Anesthesia (AAGA) Mid-Surgery
        if (phase === 'maintenance') {
          const hasActiveHypnotic = tickResult.activeDrugs.some(
            (d) =>
              (d.category === 'Induction & Hypnotics' ||
                d.category.toLowerCase().includes('hypnotic') ||
                d.drugId === 'propofol' ||
                d.drugId === 'ketamine' ||
                d.drugId === 'etomidate') &&
              (d.currentIntensity ?? 1) > 0.35
          );
          if ((p.consciousness === 'awake' || (p.bis > 65 && v.liveMac < 0.5)) && !hasActiveHypnotic) {
            recordMistake(
              'Anesthetic Depth & Awareness',
              'critical',
              'Intraoperative Awareness Mid-Surgery',
              `Patient has inadequate anesthetic depth (BIS ${Math.round(p.bis)}, MAC ${v.liveMac.toFixed(2)}) during active surgery.`,
              'High risk of accidental awareness under general anesthesia (AAGA), explicit recall of surgical pain, and acute sympathetic distress.',
              'Increase inhalational volatile agent (maintain target MAC >= 0.8 - 1.0) or start/titrate IV Propofol TIVA infusion.',
              25,
              nextSec
            );
          }
        }

        // 3. Uncontrolled Severe Surgical Pain & Sympathetic Crisis
        if (phase === 'maintenance' && p.painScore > 40 && (p.hr > 105 || p.sbp > 155)) {
          recordMistake(
            'Pharmacology & Safety',
            'major',
            'Unmanaged Severe Surgical Pain',
            `Patient is experiencing severe surgical nociception (Pain Score ${Math.round(p.painScore)}/100) causing sympathetic surge (HR ${p.hr} bpm, BP ${p.sbp}/${p.dbp} mmHg) without adequate opioid analgesia.`,
            'Sympathetic storm drastically increases myocardial oxygen demand, predisposing to subendocardial ischemia, tachyarrhythmias, and postoperative hyperalgesia.',
            'Administer titrations of IV opioids (Fentanyl 50-100 mcg) or multimodal analgesia (Paracetamol, Ketamine) to control nociception.',
            10,
            nextSec
          );
        }

        // 4. Ventilator Volutrauma (Excessive Tidal Volume)
        if (v.powerOn && v.bagVentSwitch === 'vent') {
          const vtPerKg = v.setVt / clinicalCase.patient.weightKg;
          if (vtPerKg > 10.2) {
            recordMistake(
              'Ventilation',
              'major',
              'Ventilator Volutrauma (Excessive Tidal Volume)',
              `Delivering ${v.setVt} mL tidal volume (${vtPerKg.toFixed(1)} mL/kg PBW), exceeding safe lung-protective limits (> 10 mL/kg).`,
              'Alveolar overdistension, acute barotrauma/pneumothorax, and ventilator-induced lung injury (VILI) with inflammatory cytokine release.',
              `Target lung-protective ventilation: 6-8 mL/kg predicted body weight (~${Math.round(clinicalCase.patient.weightKg * 6)}-${Math.round(clinicalCase.patient.weightKg * 8)} mL).`,
              10,
              nextSec
            );
          } else if (((v.setVt * v.setRR) / 1000 < 3.5) || (vtPerKg < 4.5)) {
            recordMistake(
              'Ventilation',
              'major',
              'Severe Hypoventilation Ventilator Setup',
              `Minute volume setup is severely sub-physiological (${((v.setVt * v.setRR) / 1000).toFixed(1)} L/min), causing progressive hypercapnia and respiratory acidosis.`,
              'Hypercapnic cerebral vasodilation, intracranial pressure spikes, and profound respiratory acidosis (pH < 7.20) triggering dysrhythmias.',
              'Increase respiratory rate (10-14 bpm) and tidal volume to achieve minute ventilation of 5.0 - 7.5 L/min.',
              10,
              nextSec
            );
          }
        }

        // 5. Unrecognized Apnea in Paralyzed/Intubated Patient
        if (p.airwayDevice === 'ett' && (!v.powerOn || v.bagVentSwitch === 'bag') && (p.muscleTonePercent < 45 || p.bis < 55)) {
          recordMistake(
            'Ventilation',
            'critical',
            'Unrecognized Apnea in Intubated Patient',
            'Patient is intubated and paralyzed or deeply anesthetized, but the anesthesia machine is either powered OFF or left in Bag mode with no manual bagging.',
            'Rapid arterial desaturation, hypercapnic acidosis, acute bradycardia, and hypoxic cardiac arrest within minutes.',
            'Turn ON the anesthesia machine power switch and toggle the Bag/Vent selector switch to "Vent" mode immediately.',
            20,
            nextSec
          );
        }

        // 6. Hypoxic Fresh Gas Mixture (FiO2 < 21%)
        if (v.powerOn && v.liveFio2 < 21) {
          recordMistake(
            'Ventilation',
            'critical',
            'Hypoxic Fresh Gas Mixture (FiO2 < 21%)',
            `Workstation is delivering fresh gas with an inspired oxygen fraction of ${v.liveFio2}%, which is sub-atmospheric.`,
            'Severe systemic tissue hypoxia, rapid brain ischemia, loss of consciousness, and hypoxic cardiac arrest.',
            'Increase O2 flowmeter rate to ensure FiO2 is >= 30% (minimum safe inspired O2).',
            25,
            nextSec
          );
        }

        // Record vitals trend for debrief graph every 5 seconds
        if (nextSec % 5 === 0) {
          setVitalsHistory((hist) => [
            ...hist,
            {
              timeSec: nextSec,
              hr: tickResult.nextPhysiology.hr,
              map: tickResult.nextPhysiology.map,
              spo2: tickResult.nextPhysiology.spo2,
              etco2: tickResult.nextPhysiology.etco2,
            },
          ]);
        }

        // Trigger complications at their specified time delays within the current phase
        setComplications((currentComps) =>
          currentComps.map((comp) => {
            const timeInPhase = nextSec - phaseStartTimeSec;
            if (!comp.active && comp.triggerPhase === phase && timeInPhase >= comp.triggerDelaySec) {
              // Clinical safety check: surgical complications during maintenance (e.g. peritoneal insufflation,
              // surgical stimulation, bone cement, massive hemorrhage) require the patient to be induced and intubated!
              if (
                comp.triggerPhase === 'maintenance' &&
                (tickResult.nextPhysiology.consciousness === 'awake' ||
                  tickResult.nextPhysiology.airwayDevice === 'none')
              ) {
                return comp;
              }

              addNarratorMessage(comp.narratorWarning, 'critical', 'Surgeon');
              audioEngine.playCriticalAlarm();
              return { ...comp, active: true, triggeredAtSec: nextSec };
            }
            return comp;
          })
        );

        return nextSec;
      });
    }, 1000 / timeScale);

    return () => clearInterval(interval);
  }, [isPaused, isPatientDead, isCPRActive, phase, phys, vent, activeDrugs, complications, timeScale, clinicalCase.patient]);

  // ==========================================
  // PHASE TRANSITIONS & PROGRESSION
  // ==========================================
  // Live Score Calculation (Starts at 100, deductions for clinical errors and excessive hints)
  const totalMistakeDeductions = mistakes.reduce((sum, m) => sum + m.pointsDeducted, 0);
  const hintDeductions = Math.max(0, (hintsUsedCount - 2) * 5);
  const liveScore = Math.max(0, 100 - totalMistakeDeductions - hintDeductions);
  const scoreGrade =
    liveScore >= 90 ? 'A' :
    liveScore >= 80 ? 'B' :
    liveScore >= 70 ? 'C' :
    liveScore >= 60 ? 'D' : 'F';
  const scoreBadgeColor =
    liveScore >= 85
      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
      : liveScore >= 70
      ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
      : 'bg-rose-950/80 border-rose-500/50 text-rose-300';

  // Clinical accomplishment evaluation
  // Anesthesia case CANNOT be scored or marked completed if patient is unextubated or closed prematurely
  const checkCaseAccomplished = (): { accomplished: boolean; reason?: string } => {
    // 1. Must have reached PACU or Debrief
    if (phase !== 'pacu' && phase !== 'debrief') {
      return {
        accomplished: false,
        reason: 'Case incomplete: Simulation was closed before completing surgical maintenance, emergence, and PACU transfer.',
      };
    }

    // 2. Extubation Requirement:
    // If patient is still intubated with an artificial airway, case is NOT accomplished!
    const isStillIntubated = phys.airwayDevice === 'ett' || phys.airwayDevice === 'lma';
    if (isStillIntubated) {
      return {
        accomplished: false,
        reason: `Case unaccomplished: Patient is still intubated with an artificial airway (${phys.airwayDevice.toUpperCase()})! Tracheal extubation is required prior to PACU discharge.`,
      };
    }

    // 3. Neuromuscular Blockade Reversal:
    if (phys.muscleTonePercent < 80 || phys.tofCount < 4) {
      return {
        accomplished: false,
        reason: `Case unaccomplished: Patient still has residual neuromuscular paralysis (TOF ${phys.tofCount}/4, Tone ${phys.muscleTonePercent}%). Neuromuscular blockade must be fully reversed.`,
      };
    }

    // 4. Consciousness / Protective reflexes:
    if (phys.consciousness === 'deep' || phys.consciousness === 'unconscious' || phys.consciousness === 'coma') {
      return {
        accomplished: false,
        reason: `Case unaccomplished: Patient is still deeply anesthetized (BIS ${phys.bis}). Patient must awaken and regain protective airway reflexes.`,
      };
    }

    // 5. Pheochromocytoma Glycemic Control:
    if (isPheoCase && phys.glucoseMgDl < 81) {
      return {
        accomplished: false,
        reason: `Case unaccomplished: Patient is severely hypoglycemic (${phys.glucoseMgDl} mg/dL / ${(phys.glucoseMgDl / 18).toFixed(1)} mmol/L) from post-resection rebound hyperinsulinemia! Must administer Dextrose 50% to achieve safe glucose > 4.5 mmol/L.`,
      };
    }

    return { accomplished: true };
  };

  const recordCaseState = (forceCompleted = false) => {
    const status = checkCaseAccomplished();
    const isAccomplished = forceCompleted ? status.accomplished : (phase === 'debrief' && status.accomplished);

    // If not accomplished, do NOT give 100% or any passing score!
    if (!isAccomplished) {
      saveCaseCompletion({
        caseId: clinicalCase.patient.id,
        patientName: clinicalCase.patient.name,
        score: 0,
        grade: 'Incomplete',
        completed: false,
        timestampSec: elapsedSeconds,
        completedAt: new Date().toISOString(),
        mistakes,
        actionLogs,
        vitalsHistory,
      });
      return;
    }

    saveCaseCompletion({
      caseId: clinicalCase.patient.id,
      patientName: clinicalCase.patient.name,
      score: liveScore,
      grade: scoreGrade,
      completed: true,
      timestampSec: elapsedSeconds,
      completedAt: new Date().toISOString(),
      mistakes,
      actionLogs,
      vitalsHistory,
    });
  };

  const handleBackToLobby = () => {
    const status = checkCaseAccomplished();
    // If the case is running and unaccomplished, ask confirmation and do NOT score 100%
    if (!status.accomplished && phase !== 'debrief') {
      setIsPaused(true);
      setIsExitConfirmOpen(true);
    } else {
      if (status.accomplished) {
        recordCaseState(true);
      }
      onReturnToLobby();
    }
  };

  const phaseOrder: PerioperativePhase[] = [
    'preop_assessment',
    'preop_prep',
    'induction',
    'airway',
    'maintenance',
    'emergence',
    'pacu',
    'debrief',
  ];

  const currentPhaseIndex = phaseOrder.indexOf(phase);
  const nextPhase = phaseOrder[currentPhaseIndex + 1];

  // ==========================================
  // ANESTHESIA WORKSTATION LEAK TEST & CHECKOUT
  // ==========================================
  const handleRunMachineLeakTest = () => {
    if (isLeakTesting) return;
    setIsLeakTesting(true);
    audioEngine.playActionChime(true);
    addNarratorMessage(
      'Workstation: Initiating automated pre-use checkout. Occluding circuit Y-piece, pressurizing system to 30 cmH2O...',
      'info',
      'Workstation'
    );
    setTimeout(() => {
      setIsLeakTesting(false);
      setIsMachineLeakTestDone(true);
      setVent((v) => ({ ...v, powerOn: true }));
      setCompletedRequiredActions((prev) => Array.from(new Set([...prev, 'machine_check'])));
      logAction(
        'ventilation',
        'Automated Machine Leak Test Passed',
        'Breathing circuit pressurized to 30 cmH2O. Measured leak rate 12 mL/min (ISO standard < 150 mL/min). Internal compliance 2.1 mL/cmH2O verified.',
        'correct',
        15
      );
      addNarratorMessage(
        'Workstation: Self-test and high-pressure leak check completed: PASSED. Circuit leak: 12 mL/min (ISO standard < 150 mL/min). Internal compliance calibrated. Master Power is ON.',
        'success',
        'Workstation'
      );
      audioEngine.playActionChime(true);
    }, 2000);
  };

  const getPhaseReadiness = (): { canAdvance: boolean; reason: string } => {
    switch (phase) {
      case 'preop_assessment':
        return {
          canAdvance: true,
          reason: 'Proceed to Preop Setup & Preoxygenation',
        };
      case 'preop_prep':
        if (!vent.powerOn || !isMachineLeakTestDone) {
          return {
            canAdvance: false,
            reason: 'Run Automated Machine Leak Test on Workstation to proceed',
          };
        }
        return {
          canAdvance: true,
          reason: 'Proceed to Induction',
        };
      case 'induction':
        if (phys.consciousness === 'awake') {
          return {
            canAdvance: false,
            reason: 'Administer induction agent (e.g. Propofol) to induce hypnosis',
          };
        }
        return {
          canAdvance: true,
          reason: 'Proceed to Airway Management',
        };
      case 'airway':
        if (phys.airwayDevice !== 'ett' && phys.airwayDevice !== 'lma') {
          return {
            canAdvance: false,
            reason: 'Intubate trachea (ETT/LMA) & confirm EtCO2 before starting surgery',
          };
        }
        return {
          canAdvance: true,
          reason: 'Proceed to Surgical Maintenance',
        };
      case 'maintenance':
        return {
          canAdvance: true,
          reason: 'Conclude Surgery & Proceed to Emergence',
        };
      case 'emergence':
        if (isPheoCase && phys.glucoseMgDl < 81) {
          return {
            canAdvance: false,
            reason: 'Check glucose & treat severe hypoglycemia (< 4.5 mmol/L) with D50W before safe extubation!',
          };
        }
        if (isPheoCase && (phys.tofRatio < 0.9 || phys.tofCount < 4)) {
          return {
            canAdvance: false,
            reason: 'Fully reverse neuromuscular blockade (TOF >= 0.90) with Sugammadex before extubation!',
          };
        }
        if (phys.airwayDevice === 'ett' || phys.airwayDevice === 'lma') {
          return {
            canAdvance: false,
            reason: 'Reverse muscle relaxant & extubate patient safely prior to PACU',
          };
        }
        return {
          canAdvance: true,
          reason: 'Transfer Patient to PACU',
        };
      case 'pacu':
        if (isPheoCase && !postOpDisposition) {
          return {
            canAdvance: false,
            reason: 'Select Post-Operative Destination (ICU/HDU vs PACU) before concluding case',
          };
        }
        return {
          canAdvance: true,
          reason: 'Conclude Case & Review Debrief',
        };
      default:
        return { canAdvance: true, reason: 'Proceed' };
    }
  };

  const handleAdvancePhase = () => {
    if (!nextPhase) return;

    const readiness = getPhaseReadiness();
    if (!readiness.canAdvance) {
      audioEngine.playActionChime(false);
      addNarratorMessage(`⚠️ Cannot advance phase: ${readiness.reason}.`, 'warning', 'Attending');
      return;
    }

    if (nextPhase === 'debrief') {
      // Clinical consequence for arriving at PACU/debrief without extubation:
      if (phys.airwayDevice === 'ett' || phys.airwayDevice === 'lma') {
        recordMistake(
          'Airway',
          'critical',
          'Failure to Extubate Prior to PACU Sign-Off',
          `Patient arrived at debrief while still intubated with ${phys.airwayDevice.toUpperCase()} without medical indication for postoperative mechanical ventilation.`,
          'Iatrogenic prolonged intubation, ventilator-associated pneumonia, unnecessary ICU admission, and patient distress.',
          'Wean volatile anesthetics, verify full neuromuscular recovery (TOF 4/4), suction oral secretions, and safely extubate the trachea before concluding.',
          30
        );

        addNarratorMessage(
          `⚠️ FAILURE TO EXTUBATE: Patient is still intubated with ${phys.airwayDevice.toUpperCase()}! In routine surgical cases, the patient must be safely reversed and extubated before signing off in PACU.`,
          'critical',
          'Attending'
        );
      }

      setPhase('debrief');
      setIsPaused(true);
      setIsDebriefModalOpen(true);
      recordCaseState(true);
      return;
    }

    setPhase(nextPhase);
    setPhaseStartTimeSec(elapsedSeconds);
    audioEngine.playActionChime(true);
    logAction('phase_transition', `Advanced to ${nextPhase.replace('_', ' ').toUpperCase()}`, `Phase transition completed.`, 'correct', 15);
    
    addNarratorMessage(
      `Phase complete. Advancing to ${nextPhase.replace('_', ' ').toUpperCase()}: ${clinicalCase.phaseDescriptions[nextPhase]}`,
      'success',
      'Attending'
    );
  };

  // ==========================================
  // COMPLETE CASE RESET & RESTART
  // ==========================================
  const handleRestartCase = () => {
    audioEngine.stopFlatlineTone();
    setIsPatientDead(false);
    setPatientDeathCause('');
    setCorrectManagementPearls('');
    setIsCodeBlueOpen(false);
    setIsCPRActive(false);
    setPhys(clinicalCase.initialPhysiology);
    setVent({
      powerOn: false,
      mode: 'Manual/Bag',
      bagVentSwitch: 'bag',
      setVt: Math.round(clinicalCase.patient.weightKg * 7),
      setRR: 12,
      peep: 5,
      ieRatio: '1:2',
      pmax: 40,
      aplValveCmH2o: 30,
      o2FlowLpm: 2.0,
      airFlowLpm: 2.0,
      n2oFlowLpm: 0,
      vaporizerAgent: 'Sevoflurane',
      vaporizerDialPercent: 0,
      livePip: 0,
      livePplat: 0,
      liveDeliveredVt: 0,
      liveMinuteVolume: 0,
      liveFio2: 21,
      liveEto2: 16,
      liveFiAgent: 0,
      liveEtAgent: 0,
      liveMac: 0,
      alarms: {
        highPressure: false,
        lowPressureDisconnect: false,
        lowFio2: false,
        apnea: false,
      },
    });
    setActiveDrugs([]);
    setComplications(clinicalCase.scriptedComplications.map((c) => ({ ...c })));
    setPhase('preop_assessment');
    setPhaseStartTimeSec(0);
    setElapsedSeconds(0);
    setCompletedRequiredActions([]);
    setIsMachineLeakTestDone(false);
    setDisplayedNibp({
      sbp: clinicalCase.initialPhysiology.sbp,
      dbp: clinicalCase.initialPhysiology.dbp,
      map: clinicalCase.initialPhysiology.map,
    });
    setHasCheckedPreInductionArtLine(false);
    setLastSurgeTriggerSec(0);
    setNextSurgeIntervalSec(50);
    setIsSurgeonPausedUntilSec(0);
    setHasTriggeredHiddenTwistVt(false);
    setVeinClampWarningGiven(false);
    setVeinClampExecuted(false);
    setPostOpDisposition(null);
    setTimeWithSbpOver200(0);
    setTimeWithSbpOver250(0);
    setMistakes([]);
    lastMistakeTimestampsRef.current = {};
    setActionLogs([]);
    setVitalsHistory([]);
    setHintsUsedCount(0);
    setIsPaused(false);
    setNarratorMessages([
      {
        id: 'm-0',
        timestampSec: 0,
        timeFormatted: '00:00',
        text: `Patient ${clinicalCase.patient.name} (${clinicalCase.patient.age}yo ${clinicalCase.patient.sex}, ${clinicalCase.patient.weightKg}kg, ${clinicalCase.patient.asaClass}) arrived in OR for ${clinicalCase.patient.procedure}. Begin Pre-Anesthesia Assessment.`,
        type: 'info',
        speaker: 'Attending',
      },
    ]);
  };

  // ==========================================
  // DRUG ADMINISTRATION (GIVE MEDICATION)
  // ==========================================
  const handleAdministerDrug = (drug: SimulatorDrug, dose: number, route: string) => {
    // Check dose safety thresholds (do NOT block, but warn!)
    const weightKg = clinicalCase.patient.weightKg;
    let isOverdoseWarning = false;
    let safeMaxText = '';

    if (drug.mgPerKgMax && drug.unit === 'mg') {
      const maxRecommended = Math.round(drug.mgPerKgMax * weightKg * 10) / 10;
      if (dose > maxRecommended * 1.1) {
        isOverdoseWarning = true;
        safeMaxText = `${maxRecommended} mg (max recommended: ${drug.mgPerKgMax} mg/kg)`;
      }
    } else if (drug.mcgPerKgMax && drug.unit === 'mcg') {
      const maxRecommended = Math.round(drug.mcgPerKgMax * weightKg);
      if (dose > maxRecommended * 1.1) {
        isOverdoseWarning = true;
        safeMaxText = `${maxRecommended} mcg (max recommended: ${drug.mcgPerKgMax} mcg/kg)`;
      }
    } else if (drug.quickDoses && drug.quickDoses.length > 0) {
      const maxQuick = Math.max(...drug.quickDoses);
      if (dose > maxQuick * 1.5) {
        isOverdoseWarning = true;
        safeMaxText = `typical max ~${maxQuick} ${drug.unit}`;
      }
    }

    if (isOverdoseWarning) {
      addNarratorMessage(
        `⚠️ OVERDOSE WARNING: Administering ${dose} ${drug.unit} ${drug.name} exceeds recommended single therapeutic limit (${safeMaxText}). High risk of severe drug toxicity, hemodynamic collapse, or respiratory depression!`,
        'critical',
        'Nurse'
      );
      audioEngine.playCriticalAlarm();
    }

    // ----------------------------------------------------
    // PHEOCHROMOCYTOMA EXPERT CASE PHARMACOLOGY RULES
    // ----------------------------------------------------
    if (isPheoCase) {
      // 1. Mandatory Pre-Induction Arterial Line Check
      const isInductionDrug = drug.category === 'Induction & Hypnotics' || drug.category === 'Muscle Relaxants';
      if (isInductionDrug && !hasCheckedPreInductionArtLine) {
        setHasCheckedPreInductionArtLine(true);
        if (!monitoring.artLineAttached) {
          recordMistake(
            'Hemodynamics & Fluids',
            'critical',
            'Induction Without Arterial Line in Pheochromocytoma',
            'General anesthesia induction was initiated without an arterial line for continuous beat-to-beat hemodynamic monitoring in a high-risk pheochromocytoma case.',
            'Intermittent NIBP cycling (every 3 minutes) fails to detect rapid, life-threatening catecholamine spikes (>250 mmHg) or profound post-ligation vasoplegic collapse (<60 mmHg).',
            'Always cannulate an arterial line BEFORE induction in pheochromocytoma surgery so hemodynamic instability is recognized and treated beat-to-beat.',
            10
          );
          addNarratorMessage('🚨 CRITICAL SAFETY OMISSION: Initiated induction WITHOUT an arterial line in Pheochromocytoma! You will miss life-threatening beat-to-beat spikes and crashes on 3-minute NIBP cycling!', 'critical', 'Attending');
          audioEngine.playCriticalAlarm();
        } else {
          logAction('monitoring', 'Pre-Induction Arterial Line Confirmed', 'Beat-to-beat pressure active prior to induction agent delivery.', 'correct', 10);
        }
      }

      // 2. Dangerous / Contraindicated Drugs in Pheochromocytoma
      const contraindicatedPheoDrugs = ['ketamine', 'ephedrine', 'metoclopramide', 'droperidol', 'glucagon', 'morphine', 'atracurium', 'pancuronium'];
      if (contraindicatedPheoDrugs.includes(drug.id)) {
        recordMistake(
          'Pharmacology & Safety',
          'critical',
          `Administered Contraindicated Drug (${drug.name}) in Pheochromocytoma`,
          `Administered ${drug.name} (${dose} ${drug.unit}) to a patient with an active catecholamine-secreting pheochromocytoma.`,
          'Triggers explosive tumor degranulation / sympathomimetic storm, precipitating extreme hypertensive crisis (BP 260+/140 mmHg, VT), acute myocardial ischemia, and intracranial hemorrhage.',
          'Strictly avoid indirect sympathomimetics (ephedrine), catecholamine-releasing agents (metoclopramide, droperidol, glucagon), histamine-releasing drugs (morphine, atracurium), and sympathomimetic NMDA antagonists (ketamine). Use Propofol, Fentanyl/Remifentanil, and Rocuronium/Vecuronium.',
          15
        );
      } else if (drug.id === 'succinylcholine') {
        recordMistake(
          'Pharmacology & Safety',
          'major',
          'Succinylcholine Fasciculation Surge in Pheochromocytoma',
          'Succinylcholine was administered, causing uncoordinated skeletal muscle fasciculations that mechanically compressed the retroperitoneal adrenal tumor.',
          'Direct tumor compression squeezed catecholamines into the circulation, precipitating an acute hypertensive surge (BP +55 mmHg, HR +35 bpm).',
          'Use non-depolarizing relaxants (Rocuronium or Vecuronium) to avoid tumor compression from fasciculations.',
          10
        );
      } else if (drug.id === 'esmolol' || drug.id === 'labetalol') {
        const hasAlphaBlock = activeDrugs.some(d =>
          ['phentolamine', 'sodium_nitroprusside', 'clevidipine', 'nicardipine', 'magnesium_sulfate'].includes(d.drugId) &&
          (d.currentIntensity ?? 1) > 0.15
        );
        if (!hasAlphaBlock && (phys.sbp > 160 || phys.hr > 95)) {
          recordMistake(
            'Pharmacology & Safety',
            'critical',
            'Unopposed Alpha-1 Vasoconstriction from Pure Beta Blockade',
            'Administered beta-blocker during a hypertensive catecholamine surge without preceding alpha-adrenergic blockade or direct vasodilation.',
            'Abolishing vascular beta-2 vasodilation leaves massive circulating norepinephrine unopposed at vascular alpha-1 receptors, triggering catastrophic SVR surge, acute LV failure, and flash pulmonary edema.',
            'Always establish alpha-adrenergic blockade (Phentolamine, Nitroprusside, Clevidipine, or Nicardipine) BEFORE administering beta-blockers for rate control.',
            15
          );
        }
      }
    }

    const effect = drug.applyEffect(phys, dose, clinicalCase.patient, route, activeDrugs);

    // Apply immediate vitals shifts
    setPhys((prev) => ({ ...prev, ...effect.vitalsChanges }));

    // Append to active drug effects for pharmacokinetic duration decay
    const activeEffect: ActiveDrugEffect = {
      id: `effect-${Date.now()}-${Math.random()}`,
      drugId: drug.id,
      name: drug.name,
      category: drug.category,
      dose,
      unit: drug.unit,
      route,
      timestampSec: elapsedSeconds,
      onsetSec: drug.onsetSec,
      peakSec: drug.peakSec,
      durationSec: drug.durationSec,
      currentIntensity: 1.0,
    };

    setActiveDrugs((prev) => [activeEffect, ...prev]);

    // Check if this treats an active complication
    setComplications((currentComps) =>
      currentComps.map((comp) => {
        if (comp.active && !comp.treated) {
          if (
            (comp.id.includes('bronchospasm') && (drug.id === 'salbutamol' || drug.id === 'epinephrine')) ||
            (comp.id.includes('vagal') && (drug.id === 'atropine' || drug.id === 'glycopyrrolate')) ||
            (comp.id.includes('bcis') && (drug.id === 'phenylephrine' || drug.id === 'norepinephrine'))
          ) {
            addNarratorMessage(`Complication [${comp.title}] successfully resolved with ${drug.name}!`, 'success', 'Attending');
            return { ...comp, treated: true };
          }
        }
        return comp;
      })
    );

    addNarratorMessage(effect.narrative, 'info', 'Nurse');
    if (isOverdoseWarning) {
      logAction(
        'medication',
        `⚠️ High Dose Warning: ${dose} ${drug.unit} ${drug.name}`,
        `Route: ${route}. Dose exceeds recommended limit (${safeMaxText}). Drug toxicity risk.`,
        'harmful',
        -10
      );
    } else {
      logAction('medication', `Administered ${dose} ${drug.unit} ${drug.name}`, `Route: ${route}.`, 'correct', 10);
    }
  };

  // ==========================================
  // AIRWAY & BEDSIDE PROCEDURES
  // ==========================================
  const handleUpdateAirway = (updates: Partial<DynamicPhysiology>, actionTitle: string, actionDetail: string) => {
    // ----------------------------------------------------
    // CRITICAL CLINICAL CHECK: ENDOTRACHEAL INTUBATION
    // ----------------------------------------------------
    if (updates.airwayDevice === 'ett') {
      const readiness = checkIntubationReadiness(phys, clinicalCase.patient, activeDrugs);

      if (!readiness.canIntubate) {
        audioEngine.playCriticalAlarm();

        if (readiness.status === 'awake') {
          // Patient is awake! Severe catastrophe
          const hrSurge = 45;
          const sbpSurge = 55;
          const newSbp = phys.sbp + sbpSurge;
          const newDbp = phys.dbp + 30;
          const newMap = Math.round((newSbp + 2 * newDbp) / 3);

          setPhys((prev) => ({
            ...prev,
            hr: Math.min(170, prev.hr + hrSurge),
            sbp: newSbp,
            dbp: newDbp,
            map: newMap,
            airwayPatency: 'laryngospasm',
            airwayResistanceCmH2o: Math.max(prev.airwayResistanceCmH2o, 48),
            lungComplianceMlCmH2o: Math.min(prev.lungComplianceMlCmH2o, 18),
            spo2: Math.max(0, prev.spo2 - 12),
            rhythm: 'Sinus Tachycardia',
          }));

          recordMistake(
            'Airway',
            'critical',
            'Attempted Intubation on Awake Patient',
            `Attempted intubation on awake uninduced patient (BIS ${phys.bis}). Triggered severe laryngospasm and hypertensive surge.`,
            'Severe vocal cord trauma, emergency airway obstruction, extreme patient psychological horror, and acute hypertensive storm risking stroke or MI.',
            `Always confirm adequate hypnotic depth (BIS < 50) with induction agent (Propofol ${readiness.recommendedHypnoticDose} mg) and complete neuromuscular blockade before laryngoscopy.`,
            30
          );

          addNarratorMessage(
            `🚨 CRITICAL AIRWAY ERROR: Attempted intubation on an AWAKE patient (BIS ${phys.bis})! Patient gags violently, clenches teeth on the blade, and enters SEVERE LARYNGOSPASM with vocal cords clamped shut! Heart rate jumped to ${phys.hr + hrSurge} bpm, BP spiked to ${newSbp}/${newDbp} mmHg! Tube COULD NOT be inserted. Administer an induction agent (Propofol ${readiness.recommendedHypnoticDose}mg) and muscle relaxant (Rocuronium ${readiness.recommendedRelaxantDose}mg) immediately!`,
            'critical',
            'Attending'
          );
          return;
        } else if (readiness.status === 'subtherapeutic_hypnotic') {
          // Sub-therapeutic induction dose!
          const hrSurge = 25;
          const sbpSurge = 35;
          const newSbp = phys.sbp + sbpSurge;
          const newDbp = phys.dbp + 20;

          setPhys((prev) => ({
            ...prev,
            hr: Math.min(160, prev.hr + hrSurge),
            sbp: newSbp,
            dbp: newDbp,
            map: Math.round((newSbp + 2 * newDbp) / 3),
            airwayPatency: 'partially_obstructed',
            airwayResistanceCmH2o: Math.max(prev.airwayResistanceCmH2o, 35),
            spo2: Math.max(0, prev.spo2 - 8),
          }));

          recordMistake(
            'Airway',
            'major',
            'Failed Intubation (Sub-therapeutic Induction)',
            `Induction dose was sub-therapeutic (BIS ${phys.bis}). Patient entered Stage II Excitement with bucking, coughing, and cord spasm upon laryngoscopy.`,
            'Vocal cord trauma, regurgitation/aspiration risk, sympathetic hypertensive surge, and failed airway control.',
            `Administer an adequate therapeutic hypnotic dose (~${readiness.recommendedHypnoticDose} mg Propofol) and full neuromuscular blockade before instrumenting airway.`,
            15
          );

          addNarratorMessage(
            `🚨 INSUFFICIENT INDUCTION DOSE: The dose administered was sub-therapeutic for endotracheal intubation! Patient is in Stage II Excitement (BIS ${phys.bis}). Attempting laryngoscopy triggered violent bucking, coughing, and vocal cord spasm! Deepen anesthesia with a full induction dose (~${readiness.recommendedHypnoticDose}mg Propofol) and paralyze before re-attempting.`,
            'critical',
            'Attending'
          );
          return;
        } else if (readiness.status === 'no_muscle_relaxant' || readiness.status === 'partial_relaxation') {
          // No muscle relaxant given!
          setPhys((prev) => ({
            ...prev,
            hr: Math.min(145, prev.hr + 15),
            sbp: prev.sbp + 20,
            airwayPatency: 'laryngospasm',
            airwayResistanceCmH2o: Math.max(prev.airwayResistanceCmH2o, 38),
            spo2: Math.max(0, prev.spo2 - 6),
          }));

          recordMistake(
            'Airway',
            'major',
            'Failed Intubation (No Muscle Relaxant)',
            `Attempted intubation without muscle relaxation (TOF ${phys.trainOfFour}/4). Vocal cords adducted tightly shut.`,
            'Traumatic cord laceration, arytenoid dislocation, reactive vocal cord spasm, and prolonged hypoxemic apnea.',
            `Paralyze vocal cords with a neuromuscular blocker (Rocuronium ${readiness.recommendedRelaxantDose} mg or Succinylcholine ${Math.round(clinicalCase.patient.weightKg * 1.0)} mg) to guarantee an open glottic view.`,
            15
          );

          addNarratorMessage(
            `⚠️ INTUBATION FAILED / VOCAL CORDS CLOSED: Patient is unconscious, but NO muscle relaxant was administered! Vocal cords are mobile and clamped shut (TOF ${phys.trainOfFour}/4). Blade insertion caused vocal cord spasm and breath-holding. Administer a neuromuscular blocker (Rocuronium ${readiness.recommendedRelaxantDose}mg or Succinylcholine ${Math.round(clinicalCase.patient.weightKg * 1.0)}mg) to paralyze cords.`,
            'warning',
            'Attending'
          );
          return;
        }
      }

      // If we reach here, induction and muscle relaxation are ADEQUATE!
      if (isPheoCase) {
        const fentanylDose = activeDrugs
          .filter((d) => d.drugId === 'fentanyl' || d.drugId === 'remifentanil' || d.drugId === 'sufentanil')
          .reduce((sum, d) => sum + d.dose * (d.currentIntensity ?? 1), 0);
        const lidocaineDose = activeDrugs
          .filter((d) => d.drugId.includes('lidocaine'))
          .reduce((sum, d) => sum + d.dose * (d.currentIntensity ?? 1), 0);
        const mgDose = activeDrugs
          .filter((d) => d.drugId === 'magnesium_sulfate')
          .reduce((sum, d) => sum + d.dose * (d.currentIntensity ?? 1), 0);

        const isBlunted =
          (fentanylDose >= 180 || fentanylDose / clinicalCase.patient.weightKg >= 2.8) &&
          (lidocaineDose >= 60 || mgDose >= 2.0) &&
          phys.bis < 48;

        if (isBlunted) {
          setPhys((prev) => ({
            ...prev,
            ...updates,
            sbp: Math.min(160, prev.sbp + 15),
            dbp: Math.min(95, prev.dbp + 10),
            map: Math.min(115, prev.map + 12),
            hr: Math.min(100, prev.hr + 10),
            airwayDevice: 'ett',
            airwayPatency: updates.ettDepthCm && updates.ettDepthCm >= 24 ? 'endobronchial_intubated' : 'intubated',
            breathSounds: updates.ettDepthCm && updates.ettDepthCm >= 24 ? 'Absent Left / Endobronchial Right' : 'Normal Bilateral',
          }));
          logAction('airway', 'Blunted Laryngoscopy Response Achieved', 'Generous opioid, IV lidocaine, and deep hypnotic plane prevented catecholamine storm.', 'correct', 10);
          addNarratorMessage('Attending: Excellent intubation technique! Deep hypnotic plane and generous opioid/lidocaine blunting completely suppressed the reflex catecholamine surge during laryngoscopy.', 'success', 'Attending');
        } else {
          setPhys((prev) => ({
            ...prev,
            ...updates,
            sbp: 230,
            dbp: 130,
            map: 163,
            hr: 135,
            rhythm: 'Sinus Tachycardia',
            airwayDevice: 'ett',
            airwayPatency: updates.ettDepthCm && updates.ettDepthCm >= 24 ? 'endobronchial_intubated' : 'intubated',
            breathSounds: updates.ettDepthCm && updates.ettDepthCm >= 24 ? 'Absent Left / Endobronchial Right' : 'Normal Bilateral',
          }));
          recordMistake(
            'Airway',
            'major',
            'Unblunted Laryngoscopy Sympathetic Surge in Pheochromocytoma',
            'Laryngoscopy was attempted without adequate opioid (Fentanyl 3-5 mcg/kg), IV Lidocaine (1.5 mg/kg), or deep anesthesia.',
            'Direct mechanical laryngoscopy triggered massive reflex sympathetic discharge: BP surged to 230/130 mmHg and HR spiked to 135 bpm, stressing catecholamine cardiomyopathy.',
            'Ensure generous opioid dosing (Fentanyl 3-5 mcg/kg), IV Lidocaine 1.5 mg/kg, and deep hypnosis (BIS < 45) before laryngoscopy in pheochromocytoma.',
            10
          );
          addNarratorMessage('🚨 LARYNGOSCOPY CATECHOLAMINE SURGE: Inadequate opioid/blunting prior to laryngoscopy! BP spikes to 230/130 mmHg, HR 135 bpm! Deepen volatile anesthetic depth and titrate Phentolamine/Nitroprusside immediately!', 'critical', 'Attending');
          audioEngine.playCriticalAlarm();
        }
        setVent((v) => ({ ...v, bagVentSwitch: 'vent', powerOn: true }));
        return;
      }

      setPhys((prev) => ({
        ...prev,
        ...updates,
        airwayDevice: 'ett',
        airwayPatency: updates.ettDepthCm && updates.ettDepthCm >= 24 ? 'endobronchial_intubated' : 'intubated',
        breathSounds: updates.ettDepthCm && updates.ettDepthCm >= 24 ? 'Absent Left / Endobronchial Right' : 'Normal Bilateral',
      }));
      setVent((v) => ({ ...v, bagVentSwitch: 'vent', powerOn: true }));
      logAction('airway', actionTitle, `Intubation successful with ${updates.ettSize || 7.5}mm ETT at ${updates.ettDepthCm || 21}cm after adequate induction and muscle relaxation.`, 'correct', 25);
      addNarratorMessage(`✅ Intubation successful! Optimal intubation conditions with complete vocal cord paralysis. Size ${updates.ettSize || 7.5}mm ETT secured at ${updates.ettDepthCm || 21}cm at incisors. Square-wave EtCO2 and bilateral breath sounds confirmed. Automatic ventilator running.`, 'success', 'Attending');
      return;
    }

    // Non-intubation airway actions (e.g. face mask, OPA, LMA, suction, extubation)
    if (updates.airwayDevice === 'none') {
      // Extubation safety checks!
      if (isPheoCase && phys.glucoseMgDl < 81) {
        setPhys((prev) => ({
          ...prev,
          airwayDevice: 'none',
          consciousness: 'coma',
          airwayPatency: 'partially_obstructed',
          spo2: Math.max(0, prev.spo2 - 12),
        }));
        recordMistake(
          'Pharmacology & Safety',
          'critical',
          'Extubation Attempted with Uncorrected Hypoglycemia',
          `Tracheal extubation was attempted while the patient was severely hypoglycemic (${phys.glucoseMgDl} mg/dL / ${(phys.glucoseMgDl / 18).toFixed(1)} mmol/L) from post-resection rebound hyperinsulinemia.`,
          'Neuroglycopenic coma, loss of airway protective reflexes, immediate post-extubation hypoventilation/apnea, and irreversible hypoglycemic brain injury.',
          'Always check point-of-care blood glucose before emergence in pheochromocytoma; administer Dextrose 50% (25-50 mL) to maintain blood glucose > 4.5 mmol/L (81 mg/dL) before extubation.',
          10
        );
        addNarratorMessage(`🚨 EXTUBATION FAILURE: Patient is in neuroglycopenic coma (Blood Glucose ${phys.glucoseMgDl} mg/dL / ${(phys.glucoseMgDl / 18).toFixed(1)} mmol/L)! Patient cannot breathe spontaneously or obey commands. Push Dextrose 50% (25-50 mL) STAT!`, 'critical', 'Attending');
        audioEngine.playCriticalAlarm();
        return;
      }
      if (phys.tofCount < 4 || phys.muscleTonePercent < 75) {
        setPhys((prev) => ({
          ...prev,
          airwayDevice: 'none',
          airwayPatency: 'laryngospasm',
          breathSounds: 'Stridor / Laryngospasm',
          chestRise: 'Paradoxical / See-saw',
          spo2: Math.max(0, prev.spo2 - 16),
          airwayResistanceCmH2o: Math.max(prev.airwayResistanceCmH2o, 46),
        }));

        recordMistake(
          'Airway',
          'critical',
          'Tracheal Extubation with Residual Neuromuscular Blockade',
          `Extubated patient with residual neuromuscular blockade (TOF ${phys.tofCount}/4, motor tone ${phys.muscleTonePercent}%). Immediate pharyngeal collapse and post-extubation laryngospasm.`,
          'Acute post-extubation hypoxemic arrest, negative-pressure pulmonary edema (NPPE) from vigorous inspiratory effort against closed glottis, and emergent difficult re-intubation.',
          'Verify quantitative TOF ratio >= 0.90 and clinical recovery (sustained 5s head lift / strong hand grip). Administer Sugammadex or Neostigmine with Glycopyrrolate.',
          25
        );

        addNarratorMessage(
          `🚨 CATASTROPHIC EXTUBATION ERROR: Extubated with RESIDUAL PARALYSIS (TOF ${phys.tofCount}/4)! The pharyngeal dilator muscles and vocal cords have collapsed! Severe post-extubation laryngospasm with paradoxical see-saw respirations and rapidly plummeting SpO2! Administer Sugammadex or Neostigmine immediately, apply positive pressure mask ventilation, or re-intubate!`,
          'critical',
          'Attending'
        );
        return;
      } else if (phys.bis < 70) {
        setPhys((prev) => ({
          ...prev,
          airwayDevice: 'none',
          airwayPatency: 'partially_obstructed',
          breathSounds: 'Stridor / Laryngospasm',
          spo2: Math.max(0, prev.spo2 - 10),
        }));

        recordMistake(
          'Airway',
          'major',
          'Premature Extubation While Deep',
          `Extubated patient while still deeply anesthetized (BIS ${phys.bis}) before protective airway reflexes returned.`,
          'Upper airway soft-tissue collapse, hypoventilation, loss of protective airway reflexes, and silent aspiration of gastric contents.',
          'Ensure the patient is awake, opening eyes on command, maintaining adequate spontaneous tidal volume, and clearing secretions prior to extubation.',
          15
        );

        addNarratorMessage(
          `⚠️ PREMATURE EXTUBATION: Patient extubated while too deep (BIS ${phys.bis})! Airway reflexes are sluggish; soft tissue upper airway obstruction developing. Insert an oral airway (OPA) or jaw thrust!`,
          'warning',
          'Attending'
        );
        return;
      } else {
        // Safe extubation!
        setPhys((prev) => ({
          ...prev,
          ...updates,
          airwayPatency: 'patent',
          breathSounds: 'Normal Bilateral',
          chestRise: 'Symmetric',
        }));

        logAction('airway', 'Safe Tracheal Extubation', 'Patient awake, responsive, and fully reversed (TOF 4/4). ETT removed uneventfully.', 'correct', 20);
        addNarratorMessage(`✅ Successful tracheal extubation! Patient is awake, following commands, with full neuromuscular reversal (TOF 4/4, ratio > 0.9). Smooth transition to face mask supplemental O2.`, 'success', 'Attending');
        return;
      }
    }

    setPhys((prev) => ({ ...prev, ...updates }));
    logAction('airway', actionTitle, actionDetail, 'correct', 15);
    addNarratorMessage(`${actionTitle}: ${actionDetail}`, 'info', 'Attending');
  };

  // ==========================================
  // FLUID & BLOOD INFUSION
  // ==========================================
  const handleAdministerFluid = (type: string, volumeMl: number) => {
    const isBlood = type.includes('PRBC');
    const netBalance = (phys.fluidsAdministeredMl + volumeMl) - phys.bloodLossMl;
    const isAlreadyNormovolemic = phys.bloodVolumeMl >= 4900 && phys.map >= 75;

    setPhys((prev) => {
      let newHb = prev.hemoglobinGdl;
      let newVol = prev.bloodVolumeMl;
      let bpRise = 0;

      if (isBlood) {
        newHb = Number((prev.hemoglobinGdl + (volumeMl / 350)).toFixed(1));
        newVol = prev.bloodVolumeMl + volumeMl;
        bpRise = prev.map < 70 ? Math.round(volumeMl * 0.02) : Math.round(volumeMl * 0.005);
      } else {
        // Crystalloids: 1/3 stays intravascularly, remainder enters interstitium
        newVol = Math.min(5600, prev.bloodVolumeMl + Math.round(volumeMl * 0.35));
        // Hemodilution from crystalloid administration
        newHb = Math.max(5.5, Number((prev.hemoglobinGdl * (5000 / (5000 + volumeMl * 0.35))).toFixed(1)));
        // Frank-Starling plateau: if already normovolemic/hypervolemic, blood pressure does NOT rise!
        bpRise = prev.map < 70 ? Math.round(volumeMl * 0.015) : 0;
      }

      // Acute pulmonary edema threshold
      const isFluidOverloaded = netBalance > 1800;
      const newCompliance = isFluidOverloaded
        ? Math.max(16, prev.lungComplianceMlCmH2o - Math.round((volumeMl / 500) * 4))
        : prev.lungComplianceMlCmH2o;
      const newResistance = isFluidOverloaded
        ? Math.min(48, prev.airwayResistanceCmH2o + Math.round((volumeMl / 500) * 3))
        : prev.airwayResistanceCmH2o;
      const newSounds = isFluidOverloaded ? 'Crackles / Pulmonary Edema' : prev.breathSounds;
      const newSpo2 = isFluidOverloaded ? Math.max(0, prev.spo2 - 3) : prev.spo2;

      return {
        ...prev,
        bloodVolumeMl: newVol,
        hemoglobinGdl: newHb,
        fluidsAdministeredMl: prev.fluidsAdministeredMl + volumeMl,
        sbp: prev.sbp + bpRise,
        map: prev.map + Math.round(bpRise * 0.7),
        lungComplianceMlCmH2o: newCompliance,
        airwayResistanceCmH2o: newResistance,
        breathSounds: newSounds,
        spo2: newSpo2,
      };
    });

    if (isAlreadyNormovolemic && !isBlood && netBalance > 1800) {
      recordMistake(
        'Hemodynamics & Fluids',
        'major',
        'Iatrogenic Fluid Overload & Pulmonary Edema',
        `Excessive crystalloid administration (${volumeMl} mL ${type}, net balance +${netBalance} mL) in a normovolemic patient on the flat plateau of the Frank-Starling curve.`,
        'Hydrostatic capillary pulmonary edema, decreased lung compliance, impaired alveolar gas diffusion with desaturation, and dilutional coagulopathy/anemia.',
        'Adopt goal-directed fluid therapy (GDFT); rely on dynamic preload indices (pulse pressure variation, stroke volume variation) rather than empiric large crystalloid boluses in normovolemic patients.',
        15
      );

      addNarratorMessage(
        `⚠️ FLUID OVERLOAD CONSEQUENCE: Infused ${volumeMl} mL ${type}. On the flat portion of the Frank-Starling curve, excess crystalloid does NOT raise blood pressure further! Instead, it increases pulmonary capillary hydrostatic pressure, precipitating pulmonary edema (coarse crackles, compliance drop) and dilutional anemia!`,
        'warning',
        'Attending'
      );
    } else {
      logAction('fluids', `Infused ${volumeMl} mL ${type}`, `Volume expansion delivered.`, 'correct', 10);
      addNarratorMessage(`Infused ${volumeMl} mL ${type}. Intravascular volume expanded.`, 'info', 'Nurse');
    }

    // Treat hemorrhage complication
    setComplications((currentComps) =>
      currentComps.map((comp) => {
        if (comp.active && !comp.treated && (comp.id.includes('hemorrhage') || comp.id.includes('atony'))) {
          if (type.includes('PRBC')) {
            addNarratorMessage(`Blood transfusion stabilized hemorrhagic shock!`, 'success', 'Attending');
            return { ...comp, treated: true };
          }
        }
        return comp;
      })
    );
  };

  // Monitoring actions
  const handleTriggerMonitoring = (action: string) => {
    if (action === 'attach_art_line') {
      setMonitoring((m) => ({ ...m, artLineAttached: true }));
      logAction('monitoring', 'Radial Arterial Line Placed', 'Beat-to-beat pressure active.', 'correct', 10);
      addNarratorMessage('Radial arterial line successfully cannulated. Continuous arterial pulse contour displayed.', 'success', 'Attending');
    } else if (action === 'draw_stat_abg') {
      logAction('monitoring', 'STAT Arterial Blood Gas Drawn', 'Analyzing pH, PaO2, PaCO2, Lactate.', 'correct', 5);
      addNarratorMessage(`ABG Results: pH ${phys.ph}, PaO2 ${phys.pao2MmHg} mmHg, PaCO2 ${phys.paco2MmHg} mmHg, Lactate ${phys.lactateMmolL} mmol/L.`, 'info', 'Nurse');
    } else if (action === 'check_glucometer') {
      const glucoseMmol = Number((phys.glucoseMgDl / 18.0).toFixed(1));
      const isHypoglycemic = phys.glucoseMgDl < 81;
      logAction(
        'monitoring',
        'Point-of-Care Blood Glucose Checked',
        `${phys.glucoseMgDl} mg/dL (${glucoseMmol} mmol/L).`,
        isHypoglycemic ? 'harmful' : 'correct',
        5
      );
      if (isHypoglycemic) {
        addNarratorMessage(
          `🚨 Point-of-Care Glucometer: ${phys.glucoseMgDl} mg/dL (${glucoseMmol} mmol/L) - SEVERE REBOUND HYPOGLYCEMIA! Sudden loss of catecholamines triggered intense hyperinsulinemia. Administer Dextrose 50% (25-50 mL) STAT!`,
          'critical',
          'Nurse'
        );
        audioEngine.playCriticalAlarm();
      } else {
        addNarratorMessage(`Point-of-Care Glucometer: ${phys.glucoseMgDl} mg/dL (${glucoseMmol} mmol/L) - Glycemic level normal.`, 'info', 'Nurse');
      }
    } else if (action === 'check_tof_nerve') {
      logAction('monitoring', 'Train-of-Four Stimulator Tested', `Count: ${phys.tofCount}/4 twitches.`, 'correct', 5);
      addNarratorMessage(`TOF Nerve Stimulation: ${phys.tofCount} twitches detected out of 4 (Ratio: ${phys.tofRatio.toFixed(2)}).`, 'info', 'Nurse');
    }
  };

  // Safety actions
  const handleAskSurgeonPause = () => {
    logAction('safety', 'Asked Surgeon to Pause Stimulation', 'Temporary surgical pause requested.', 'correct', 10);
    if (isPheoCase) {
      setIsSurgeonPausedUntilSec(elapsedSeconds + 75);
      addNarratorMessage('Surgeon: "Understood! Releasing tumor traction and pausing dissection for 75 seconds while you control hemodynamics."', 'warning', 'Surgeon');
      setPhys((p) => ({
        ...p,
        rhythm: p.rhythm === 'Ventricular Tachycardia (VT)' ? 'Sinus Tachycardia' : p.rhythm,
        sbp: Math.max(0, p.sbp - 30),
        map: Math.max(0, p.map - 22),
        hr: Math.max(0, p.hr - 20),
      }));
    } else {
      addNarratorMessage('Surgeon: "Stopping insufflation and releasing traction while you stabilize the patient."', 'warning', 'Surgeon');
    }

    // Resolves vagal bradycardia
    setComplications((currentComps) =>
      currentComps.map((comp) => {
        if (comp.active && !comp.treated && comp.id.includes('vagal')) {
          return { ...comp, treated: true };
        }
        return comp;
      })
    );
  };

  const handleCallForHelp = () => {
    logAction('safety', 'Called for Senior Help / Attending', 'Second anesthesiologist arrived.', 'correct', 10);
    addNarratorMessage('Senior Anesthesia Attending: "I\'m here! Airway and resuscitation equipment ready. What do you need?"', 'success', 'Attending');
  };

  const handleO2Flush = () => {
    setVent((v) => ({ ...v, liveFio2: 100 }));
    setPhys((p) => ({ ...p, preoxygenationLevel: 100 }));
    addNarratorMessage('O2 Flush pressed: 100% O2 delivered at 45 L/min directly to circuit.', 'info', 'Workstation');
  };

  // Format Elapsed Time MM:SS
  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col min-h-screen lg:h-screen w-full bg-[#030712] text-slate-100 overflow-y-auto lg:overflow-hidden font-sans select-none">
      
      {/* Top Clinical Header Bar */}
      <header className="bg-slate-950 border-b border-slate-800 px-3 py-1.5 flex items-center justify-between shrink-0 z-30">
        
        {/* Left: Patient Demographics & Current Perioperative Phase */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleBackToLobby}
            title="Return to Case Selection Roster"
            className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-xs lg:text-sm">{clinicalCase.patient.name}</span>
              <span className="text-xs font-mono font-bold text-sky-400">{clinicalCase.patient.age}yo {clinicalCase.patient.sex}</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-red-950 text-red-300 border border-red-800">
                {clinicalCase.patient.asaClass}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">({clinicalCase.patient.weightKg} kg)</span>
            </div>
            <p className="text-[10px] text-slate-400 truncate max-w-xs">{clinicalCase.patient.procedure}</p>
          </div>

          {/* Current Phase Badge */}
          <div className="hidden md:flex px-2.5 py-0.5 rounded-xl bg-slate-900 border border-slate-700 items-center gap-1.5 text-[11px] font-mono font-bold text-sky-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="uppercase">{phase.replace('_', ' ')}</span>
            <span className="text-slate-500 font-normal">({currentPhaseIndex + 1}/8)</span>
          </div>
        </div>

        {/* Center: Timer, Speed Multiplier & HINT BUTTON */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-0.5 rounded-xl border border-slate-800 text-xs font-mono">
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="font-bold text-slate-200">{formatTimer(elapsedSeconds)}</span>
          </div>

          <div className="flex items-center gap-0.5 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`p-1 rounded-lg text-xs font-mono font-bold transition-all ${
                isPaused ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </button>

            <button
              onClick={() => setTimeScale(timeScale === 1 ? 2 : 1)}
              className="px-1.5 py-0.5 rounded-lg text-xs font-mono font-bold text-slate-300 hover:bg-slate-800"
            >
              {timeScale}x
            </button>
          </div>

          {/* Dedicated ON-DEMAND HINT BUTTON */}
          <button
            onClick={() => {
              setHintsUsedCount((h) => h + 1);
              setIsHintModalOpen(true);
            }}
            className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-mono font-black text-xs shadow-md shadow-amber-500/20 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
          >
            <Lightbulb className="w-3.5 h-3.5 fill-black" />
            <span>💡 HINT</span>
          </button>

          {/* Real-Time Score Badge */}
          <button
            onClick={() => {
              setIsPaused(true);
              setIsDebriefModalOpen(true);
            }}
            title="Real-time clinical performance score (Starts at 100. Deductions occur for harmful clinical actions)"
            className={`px-2.5 py-1 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm ${scoreBadgeColor}`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Score: {liveScore}/100 [{scoreGrade}]</span>
          </button>

          {/* Button to Review All Mistakes Made */}
          <button
            onClick={() => {
              setIsPaused(true);
              setIsDebriefModalOpen(true);
            }}
            title="Click to review all mistakes made and clinical penalties"
            className={`px-2.5 py-1 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              mistakes.length > 0
                ? 'bg-rose-950/80 text-rose-200 border-rose-600/70 hover:bg-rose-900/90 shadow-md shadow-rose-950 animate-pulse'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {mistakes.length > 0 ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>⚠️ {mistakes.length} Mistake{mistakes.length > 1 ? 's' : ''}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>0 Mistakes</span>
              </>
            )}
          </button>
        </div>

        {/* Right: End Case Debrief & Layout Switcher */}
        <div className="flex items-center gap-1.5">
          {/* Layout Split / Monitor / Machine */}
          <div className="flex items-center gap-0.5 bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setLayoutMode('split')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                layoutMode === 'split' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Split View
            </button>
            <button
              onClick={() => setLayoutMode('monitor')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                layoutMode === 'monitor' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Monitor
            </button>
            <button
              onClick={() => setLayoutMode('machine')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                layoutMode === 'machine' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Machine
            </button>
          </div>

          {/* Action Drawer Collapse & Height Controls */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-[10px] font-mono">
            <button
              onClick={() => setIsDrawerCollapsed(!isDrawerCollapsed)}
              className={`px-2 py-0.5 rounded font-bold flex items-center gap-1 transition-all ${
                isDrawerCollapsed
                  ? 'bg-teal-600/30 text-teal-300 border border-teal-500/40 hover:bg-teal-600/40'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
              title={isDrawerCollapsed ? 'Open lower action drawer' : 'Collapse lower panel for full-screen monitor'}
            >
              {isDrawerCollapsed ? (
                <>
                  <ChevronUp className="w-3 h-3 text-teal-300" />
                  <span>Show Actions</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                  <span>Hide Actions</span>
                </>
              )}
            </button>
            <div className="h-3 w-[1px] bg-slate-800" />
            {(['compact', 'normal', 'expanded'] as const).map((sz) => (
              <button
                key={sz}
                onClick={() => {
                  setDrawerHeight(sz);
                  if (isDrawerCollapsed) setIsDrawerCollapsed(false);
                }}
                className={`px-1.5 py-0.5 rounded font-bold capitalize transition-all ${
                  !isDrawerCollapsed && drawerHeight === sz ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Set drawer height: ${sz}`}
              >
                {sz === 'compact' ? 'Small' : sz === 'normal' ? 'Med' : 'Full'}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setIsPaused(true);
              setIsDebriefModalOpen(true);
              recordCaseState();
            }}
            className="px-2.5 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold shadow-md flex items-center gap-1"
          >
            <Award className="w-3.5 h-3.5" />
            <span>Debrief</span>
          </button>
        </div>
      </header>

      {/* TOP: Live Narrator / Event Bar Feed */}
      <NarratorBar messages={narratorMessages} />

      {/* Main Dual-Screen Viewport (Patient Monitor + Anesthesia Workstation) */}
      <div className="flex-1 min-h-[220px] lg:min-h-0 grid gap-1.5 lg:gap-2 p-1.5 lg:p-2 overflow-hidden">
        {layoutMode === 'split' ? (
          <div className="grid grid-cols-12 gap-1.5 lg:gap-2 h-full min-h-0">
            {/* Left: Live Patient Monitor */}
            <div className="col-span-12 lg:col-span-6 h-full min-h-[200px] lg:min-h-0">
              <LivePatientMonitor
                phys={phys}
                vent={vent}
                monitoring={monitoring}
                displayedNibp={displayedNibp}
                onTriggerNibp={() => {
                  setMonitoring((m) => ({ ...m, isNibpInflating: true }));
                  setDisplayedNibp({ sbp: phys.sbp, dbp: phys.dbp, map: phys.map });
                  setTimeout(() => setMonitoring((m) => ({ ...m, isNibpInflating: false })), 2000);
                  addNarratorMessage(`NIBP cycled: ${phys.sbp}/${phys.dbp} mmHg (MAP ${phys.map}).`, 'info', 'Monitor');
                }}
                isPaused={isPaused}
                timeScale={timeScale}
              />
            </div>

            {/* Right: Anesthesia Workstation */}
            <div className="col-span-12 lg:col-span-6 h-full min-h-[200px] lg:min-h-0">
              <AnesthesiaMachineScreen
                vent={vent}
                onUpdateVent={(updates) => setVent((v) => ({ ...v, ...updates }))}
                onO2Flush={handleO2Flush}
                patientAge={clinicalCase.patient.age}
                patientWeightKg={clinicalCase.patient.weightKg}
                phys={phys}
                isLeakTestDone={isMachineLeakTestDone}
                isLeakTesting={isLeakTesting}
                onRunLeakTest={handleRunMachineLeakTest}
              />
            </div>
          </div>
        ) : layoutMode === 'monitor' ? (
          <div className="h-full min-h-0">
            <LivePatientMonitor
              phys={phys}
              vent={vent}
              monitoring={monitoring}
              displayedNibp={displayedNibp}
              onTriggerNibp={() => {
                setMonitoring((m) => ({ ...m, isNibpInflating: true }));
                setDisplayedNibp({ sbp: phys.sbp, dbp: phys.dbp, map: phys.map });
                setTimeout(() => setMonitoring((m) => ({ ...m, isNibpInflating: false })), 2000);
                addNarratorMessage(`NIBP cycled: ${phys.sbp}/${phys.dbp} mmHg (MAP ${phys.map}).`, 'info', 'Monitor');
              }}
              isPaused={isPaused}
              timeScale={timeScale}
            />
          </div>
        ) : (
          <div className="h-full min-h-0">
            <AnesthesiaMachineScreen
              vent={vent}
              onUpdateVent={(updates) => setVent((v) => ({ ...v, ...updates }))}
              onO2Flush={handleO2Flush}
              patientAge={clinicalCase.patient.age}
              patientWeightKg={clinicalCase.patient.weightKg}
              phys={phys}
              isLeakTestDone={isMachineLeakTestDone}
              isLeakTesting={isLeakTesting}
              onRunLeakTest={handleRunMachineLeakTest}
            />
          </div>
        )}
      </div>

      {/* Patient Status Summary Ribbon */}
      <div className="bg-slate-950 border-t border-slate-800 px-3 py-1 flex items-center justify-between text-[10px] lg:text-[11px] font-mono text-slate-400 shrink-0">
        <div className="flex items-center gap-3 lg:gap-4 overflow-x-auto">
          <div>
            Consciousness: <span className="font-bold text-slate-200 uppercase">{phys.consciousness}</span>
          </div>
          <div>
            Airway: <span className="font-bold text-teal-300 uppercase">{phys.airwayDevice}</span> ({phys.airwayPatency})
          </div>
          <div>
            Tone: <span className="font-bold text-slate-200">{phys.muscleTonePercent}%</span> (TOF: {phys.tofCount}/4)
          </div>
          <div>
            Pain: <span className={`font-bold ${phys.painScore > 40 ? 'text-rose-400' : 'text-slate-200'}`}>{phys.painScore}/100</span>
          </div>
        </div>

        <div className="flex items-center gap-3 lg:gap-4 shrink-0">
          <div>
            Urine: <span className="font-bold text-amber-300">{Math.round(phys.urineOutputMl)} mL</span>
          </div>
          <div>
            EBL: <span className="font-bold text-rose-400">{Math.round(phys.bloodLossMl)} mL</span>
          </div>
          <div>
            Fluids: <span className="font-bold text-sky-400">{phys.fluidsAdministeredMl} mL</span>
          </div>
        </div>
      </div>

      {/* Pheochromocytoma Post-Op Destination Decision Bar (PACU Phase) */}
      {isPheoCase && phase === 'pacu' && (
        <div className="bg-slate-900 border-t-2 border-indigo-600 px-3 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 font-mono shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-300 uppercase">Post-Op Destination Decision:</span>
            <span className="text-[11px] text-slate-300 font-sans">Where will you admit this post-pheochromocytoma patient?</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPostOpDisposition('icu_hdu');
                logAction('safety', 'Admitted to Intensive Care Unit (ICU/HDU)', 'Appropriate disposition for continuous invasive arterial pressure and glucose monitoring.', 'correct', 10);
                addNarratorMessage('Attending: "Excellent decision. Admitting to Surgical ICU / HDU is standard of care. Continuous arterial line monitoring, vasopressor weaning, and hourly glucose checks are vital for the next 24-48 hours."', 'success', 'Attending');
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                postOpDisposition === 'icu_hdu'
                  ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-emerald-500'
              }`}
            >
              🏥 Intensive Care Unit (ICU / HDU)
            </button>
            <button
              onClick={() => {
                setPostOpDisposition('pacu');
                recordMistake(
                  'Pharmacology & Safety',
                  'major',
                  'Inappropriate Disposition to Standard PACU',
                  'Patient following laparoscopic left adrenalectomy for pheochromocytoma was discharged to standard PACU instead of ICU/HDU.',
                  'Post-pheochromocytoma patients carry extreme risks of delayed rebound hypoglycemia (peaking 2-4 hrs post-op) and severe vasoplegic collapse as phenoxybenzamine outlasts surgical vasopressors.',
                  'Admit all post-pheochromocytoma patients to ICU or HDU for continuous invasive arterial line monitoring, vasopressor titration, and hourly blood glucose surveillance for at least 24 hours.',
                  10
                );
                addNarratorMessage('🚨 INAPPROPRIATE POST-OP DISPOSITION: Standard PACU is inadequate! Post-pheochromocytoma patients require admission to ICU or HDU due to severe risks of delayed rebound hypoglycemia and sudden vasoplegic shock!', 'critical', 'Attending');
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                postOpDisposition === 'pacu'
                  ? 'bg-rose-600 border-rose-400 text-white shadow-lg'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-rose-500'
              }`}
            >
              🛌 Standard PACU / Floor
            </button>
          </div>
        </div>
      )}

      {/* Bottom Action Tabs Drawer (Collapsible and Height-Adjustable) */}
      <div className={`${
        isDrawerCollapsed ? 'h-10 lg:h-11' :
        drawerHeight === 'compact' ? 'h-48 lg:h-52' :
        drawerHeight === 'expanded' ? 'h-72 lg:h-80' :
        'h-56 lg:h-64'
      } shrink-0 border-t border-slate-800 bg-slate-900 transition-all duration-300 ease-in-out overflow-hidden`}>
        <ActionPanel
          phys={phys}
          vent={vent}
          patient={clinicalCase.patient}
          phase={phase}
          activeDrugs={activeDrugs}
          onAdministerDrug={handleAdministerDrug}
          onUpdateAirway={handleUpdateAirway}
          onUpdateVent={(updates) => setVent((v) => ({ ...v, ...updates }))}
          onAdministerFluid={handleAdministerFluid}
          onTriggerMonitoring={handleTriggerMonitoring}
          onAdvancePhase={handleAdvancePhase}
          onAskSurgeonPause={handleAskSurgeonPause}
          onCallForHelp={handleCallForHelp}
          canAdvancePhase={getPhaseReadiness().canAdvance}
          advancePhaseReason={getPhaseReadiness().reason}
          isLeakTestDone={isMachineLeakTestDone}
          isLeakTesting={isLeakTesting}
          onRunLeakTest={handleRunMachineLeakTest}
          isCollapsed={isDrawerCollapsed}
          onToggleCollapse={() => setIsDrawerCollapsed(!isDrawerCollapsed)}
          drawerHeight={drawerHeight}
          onSetDrawerHeight={(sz) => {
            setDrawerHeight(sz);
            if (isDrawerCollapsed) setIsDrawerCollapsed(false);
          }}
        />
      </div>

      {/* Modals */}
      <HintModal
        isOpen={isHintModalOpen}
        onClose={() => setIsHintModalOpen(false)}
        caseData={clinicalCase}
        phase={phase}
        phys={phys}
        vent={vent}
        monitoring={monitoring}
        activeDrugs={activeDrugs}
        actionLogs={actionLogs}
        hintsUsedCount={hintsUsedCount}
        isMachineLeakTestDone={isMachineLeakTestDone}
      />

      <CodeBlueModal
        isOpen={isCodeBlueOpen}
        onClose={() => setIsCodeBlueOpen(false)}
        rhythm={phys.rhythm}
        causeOfDeath={codeBlueCause}
        onAdministerEpi={() => {
          handleAdministerDrug(
            SIMULATOR_DRUGS.find((d) => d.id === 'epinephrine') || SIMULATOR_DRUGS[0],
            1000,
            'IV Bolus'
          );
        }}
        onDefibrillate={() => {
          audioEngine.playActionChime(true);
          // Shock restores rhythm if VT/VF
          if (phys.rhythm === 'Ventricular Fibrillation (VF)' || phys.rhythm === 'Ventricular Tachycardia (VT)') {
            setPhys((p) => ({
              ...p,
              rhythm: 'Sinus Tachycardia',
              hr: 110,
              sbp: 85,
              dbp: 50,
              map: 62,
              spo2: Math.max(p.spo2, 85),
            }));
            addNarratorMessage('⚡ Defibrillation delivered (200J Biphasic). ROSC ACHIEVED: Rhythm converted to Sinus Tachycardia!', 'success', 'Attending');
          } else {
            addNarratorMessage('⚡ Defibrillation delivered: Non-shockable rhythm. Continue CPR and Epinephrine!', 'warning', 'Attending');
          }
        }}
        onTurnOffGas={() => {
          setVent((v) => ({ ...v, vaporizerDialPercent: 0, liveEtAgent: 0 }));
          addNarratorMessage('Workstation: Vaporizer dialed to 0%. Volatile anesthetic wash-out initiated.', 'info', 'Workstation');
        }}
        onDeliver100O2={() => {
          setVent((v) => ({ ...v, liveFio2: 100, o2FlowLpm: 10, airFlowLpm: 0, n2oFlowLpm: 0 }));
          addNarratorMessage('Workstation: 100% FiO2 delivered with high fresh gas flows (10 L/min).', 'success', 'Workstation');
        }}
        onStartCPR={() => {
          setIsCPRActive(true);
          setPhys((p) => ({ ...p, sbp: 65, map: 45 }));
          addNarratorMessage('CPR: High-quality manual chest compressions initiated (rate 100-120/min). Artificial perfusion generated.', 'info', 'Nurse');
        }}
        onAdministerAntidote={(antidoteId) => {
          const targetId = antidoteId === 'intralipid' ? 'lipid_emulsion' : antidoteId;
          const antDrug = SIMULATOR_DRUGS.find((d) => d.id === targetId || d.id === antidoteId);
          if (antDrug) {
            let defaultDose = antDrug.fixedDoseDefault || 1;
            if (targetId === 'sugammadex') defaultDose = 200;
            else if (targetId === 'naloxone') defaultDose = 400;
            else if (targetId === 'flumazenil') defaultDose = 0.2;
            else if (targetId === 'lipid_emulsion') defaultDose = 100;
            else if (targetId === 'neostigmine_glyco') defaultDose = 3.5;
            handleAdministerDrug(antDrug, defaultDose, antDrug.defaultRoute);
          }
        }}
        onPatientDied={(reason) => {
          setIsPatientDead(true);
          setPatientDeathCause(reason);
          setCorrectManagementPearls(
            'Ensure early high-quality CPR, immediate defibrillation for VT/VF within 60-90s, prompt cessation of anesthetic agents, delivery of 100% O2, early Epinephrine 1mg IV every 3-5 minutes, and timely reversal of inciting causes (Sugammadex for relaxant, Naloxone for opioids, Lipid emulsion for local anesthetics).'
          );
          setIsCodeBlueOpen(false);
          setIsCPRActive(false);
          audioEngine.playFlatlineTone();
        }}
        onResetCase={handleRestartCase}
      />

      {/* Patient Biological Death Modal */}
      <PatientDiedModal
        isOpen={isPatientDead}
        deathCause={patientDeathCause}
        correctManagement={correctManagementPearls}
        actionLogs={actionLogs}
        elapsedSeconds={elapsedSeconds}
        patient={clinicalCase.patient}
        onRestartCase={handleRestartCase}
        onReturnToLobby={() => {
          audioEngine.stopFlatlineTone();
          onReturnToLobby();
        }}
      />

      <DebriefModal
        isOpen={isDebriefModalOpen}
        onClose={() => {
          setIsDebriefModalOpen(false);
          if (phase !== 'debrief') {
            setIsPaused(false);
          }
        }}
        caseData={clinicalCase}
        elapsedSeconds={elapsedSeconds}
        actionLogs={actionLogs}
        mistakes={mistakes}
        hintsUsedCount={hintsUsedCount}
        vitalsHistory={vitalsHistory}
        isMidCase={phase !== 'debrief'}
        isAccomplished={checkCaseAccomplished().accomplished}
        unaccomplishedReason={checkCaseAccomplished().reason}
        onRestartCase={() => {
          setIsDebriefModalOpen(false);
          handleRestartCase();
        }}
        onSelectAnotherCase={() => {
          setIsDebriefModalOpen(false);
          if (checkCaseAccomplished().accomplished) {
            recordCaseState(true);
          }
          onReturnToLobby();
        }}
      />

      {/* Exit Incomplete Simulation Early Confirmation Modal */}
      {isExitConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none">
          <div className="bg-slate-900 border-2 border-rose-600/60 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Exit Case Early?</h3>
                <p className="text-xs text-rose-400 font-mono">Case Unaccomplished / Incomplete</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              You are leaving before completing surgical management and safely extubating the patient.
            </p>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-rose-300 space-y-1">
              <div>⚠️ <strong>No score or completion credit will be awarded</strong> for this unfinished session.</div>
              {(phys.airwayDevice === 'ett' || phys.airwayDevice === 'lma') && (
                <div className="text-amber-300">⚠️ Patient is still intubated with an artificial airway ({phys.airwayDevice.toUpperCase()}).</div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  setIsExitConfirmOpen(false);
                  setIsPaused(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs transition-colors cursor-pointer shadow-md"
              >
                Resume Simulation
              </button>
              <button
                onClick={() => {
                  setIsExitConfirmOpen(false);
                  // Return to lobby WITHOUT saving an unaccomplished score!
                  onReturnToLobby();
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/80 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-700 font-mono font-bold text-xs transition-colors cursor-pointer"
              >
                Exit (No Score)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
