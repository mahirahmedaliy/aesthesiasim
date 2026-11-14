import React, { useEffect, useState } from 'react';
import { ClinicalCase, ActionLogEntry, ClinicalMistake } from '../../types/simulator';
import {
  Award,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Home,
  Clock,
  Sparkles,
  BookOpen,
  Lightbulb,
  TrendingUp,
  ShieldAlert,
  ShieldCheck,
  ChevronRight,
  XCircle,
  FileText,
  Activity,
  X,
  Play,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface DebriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: ClinicalCase;
  elapsedSeconds: number;
  actionLogs: ActionLogEntry[];
  mistakes: ClinicalMistake[];
  hintsUsedCount: number;
  vitalsHistory: { timeSec: number; hr: number; map: number; spo2: number; etco2: number }[];
  isMidCase?: boolean;
  isAccomplished?: boolean;
  unaccomplishedReason?: string;
  onRestartCase: () => void;
  onSelectAnotherCase: () => void;
}

export const DebriefModal: React.FC<DebriefModalProps> = ({
  isOpen,
  onClose,
  caseData,
  elapsedSeconds,
  actionLogs,
  mistakes = [],
  hintsUsedCount,
  vitalsHistory,
  isMidCase = false,
  isAccomplished = true,
  unaccomplishedReason,
  onRestartCase,
  onSelectAnotherCase,
}) => {
  const isPheoCase = caseData.patient.id.includes('pheochromocytoma') || caseData.patient.procedure.toLowerCase().includes('adrenal');
  const [activeTab, setActiveTab] = useState<'mistakes' | 'audit' | 'vitals' | 'teaching' | 'pheo_rubric'>(
    isPheoCase ? 'pheo_rubric' : 'mistakes'
  );
  const [selectedMistake, setSelectedMistake] = useState<ClinicalMistake | null>(null);

  // Pheochromocytoma 100-Point Scoring Rubric (8 Competency Domains)
  const pheoRubric = [
    {
      title: '1. Arterial line placed before induction',
      points: 10,
      passed: !mistakes.some((m) => m.title.includes('Induction Without Arterial Line')),
      comment: 'Beat-to-beat arterial line cannulated prior to induction agent administration.',
      failComment: 'Anesthesia induced without an arterial line; intermittent NIBP misses rapid spikes and crashes.',
    },
    {
      title: '2. Avoided contraindicated drugs',
      points: 15,
      passed: !mistakes.some((m) => m.title.includes('Contraindicated Drug') || m.title.includes('Succinylcholine') || m.title.includes('Unopposed Alpha-1')),
      comment: 'Avoided indirect sympathomimetics, histamine releasers, and unblunted beta blockade.',
      failComment: 'Administered contraindicated agent (e.g. Ketamine, Ephedrine, Morphine, Atracurium, Glucagon, or Succinylcholine).',
    },
    {
      title: '3. Blunted intubation catecholamine response',
      points: 10,
      passed: !mistakes.some((m) => m.title.includes('Unblunted Laryngoscopy')),
      comment: 'Fentanyl (3-5 mcg/kg), IV Lidocaine (1.5 mg/kg), and deep hypnotic plane successfully blunted laryngoscopy.',
      failComment: 'Laryngoscopy provoked severe catecholamine storm (BP 230/130 mmHg, HR 135 bpm).',
    },
    {
      title: '4. Controlled crises during manipulation (SBP > 200 minimized)',
      points: 20,
      passed: !mistakes.some((m) => m.title.includes('Sustained Severe Hypertensive Crisis')),
      comment: 'Aggressively titrated Phentolamine/Nitroprusside/Clevidipine and paused manipulation to prevent LV afterload strain.',
      failComment: 'Sustained SBP > 250 mmHg for > 2 min precipitated acute left ventricular failure / pulmonary edema.',
    },
    {
      title: '5. Anticipated vein ligation & stopped vasodilators in time',
      points: 15,
      passed: !mistakes.some((m) => m.title.includes('Failure to Discontinue Vasodilators')),
      comment: 'Vasodilator infusions halted prior to clamping of the main adrenal vein.',
      failComment: 'Vasodilators remained running when vein was clamped, precipitating catastrophic circulatory collapse (BP 55/28).',
    },
    {
      title: '6. Treated post-ligation hypotension correctly',
      points: 10,
      passed: actionLogs.some((a) => a.title.toLowerCase().includes('norepinephrine') || a.title.toLowerCase().includes('vasopressin') || (a.category === 'fluids' && a.scoreEffect === 'correct')),
      comment: 'Supported systemic vascular resistance with Norepinephrine, Vasopressin (V1 receptor agonism), and fluid volume.',
      failComment: 'Inadequate vasopressor support for phenoxybenzamine-induced vasoplegia following catecholamine drop.',
    },
    {
      title: '7. Detected and treated hypoglycemia',
      points: 10,
      passed: !mistakes.some((m) => m.title.includes('Hypoglycemia')) && actionLogs.some((a) => a.title.toLowerCase().includes('dextrose') || a.title.toLowerCase().includes('glucose')),
      comment: 'Monitored glucometer and administered Dextrose 50% to counteract post-resection rebound hyperinsulinemia.',
      failComment: 'Failed to treat rebound hypoglycemia; blood glucose dropped below 4.5 mmol/L causing neuroglycopenic coma.',
    },
    {
      title: '8. Safe extubation & correct disposition to ICU/HDU',
      points: 10,
      passed: !mistakes.some((m) => m.title.includes('Inappropriate Disposition') || m.title.includes('Residual Neuromuscular Blockade')),
      comment: 'Extubated after satisfying hemodynamic, glycemic, and neuromuscular criteria; designated ICU/HDU admission.',
      failComment: 'Attempted extubation with residual weakness/hypoglycemia or assigned patient to standard PACU floor.',
    },
  ];

  // Compute scoring starting from 100
  const initialScore = 100;
  const totalMistakeDeductions = mistakes.reduce((sum, m) => sum + m.pointsDeducted, 0);
  const hintDeductions = Math.max(0, (hintsUsedCount - 2) * 2);
  const finalScore = Math.max(0, initialScore - totalMistakeDeductions - hintDeductions);

  const correctActionsCount = actionLogs.filter((a) => a.scoreEffect === 'correct').length;

  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  // Keyboard Escape listener to close & resume
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Confetti on triumphant case debrief (only if accomplished and scored >= 75)
  useEffect(() => {
    if (isOpen && !isMidCase && isAccomplished && finalScore >= 75) {
      confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
    }
  }, [isOpen, isMidCase, isAccomplished, finalScore]);

  if (!isOpen) return null;

  const getGrade = (s: number) => {
    if (!isAccomplished && !isMidCase) {
      return {
        letter: 'Incomplete',
        text: 'Case Unaccomplished / Extubation Criteria Not Met',
        color: 'text-rose-400 border-rose-500 bg-rose-950/60',
      };
    }
    if (s >= 90)
      return {
        letter: 'A',
        text: 'Mastery / Board-Certified Competence',
        color: 'text-emerald-400 border-emerald-500 bg-emerald-950/60',
      };
    if (s >= 75)
      return {
        letter: 'B',
        text: 'Proficient Perioperative Management',
        color: 'text-sky-400 border-sky-500 bg-sky-950/60',
      };
    if (s >= 60)
      return {
        letter: 'C',
        text: 'Marginal Competence / Suboptimal Safety Timing',
        color: 'text-amber-400 border-amber-500 bg-amber-950/60',
      };
    return {
      letter: 'F',
      text: 'Critical Clinical Failure / Unsafe Practice',
      color: 'text-red-400 border-red-500 bg-red-950/60',
    };
  };

  const grade = getGrade(finalScore);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-3 sm:p-5 animate-in fade-in duration-200 font-sans select-none"
    >
      <div className="bg-slate-900 border-2 border-slate-700 w-full max-w-5xl h-[92vh] max-h-[820px] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* ======================================================== */}
        {/* HEADER */}
        {/* ======================================================== */}
        <div className="bg-slate-950 px-6 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isMidCase
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
                  : 'bg-purple-600/20 border border-purple-500/40 text-purple-400'
              }`}
            >
              {isMidCase ? <AlertTriangle className="w-6 h-6" /> : <Award className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  {isMidCase ? 'Clinical Mistakes & In-Progress Audit' : 'Case Debrief & Competency Scoring'}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                    isMidCase
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
                      : 'bg-purple-950/80 text-purple-300 border border-purple-800/80'
                  }`}
                >
                  {isMidCase ? 'Simulation Paused' : 'Case Complete'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {caseData.patient.name} ({caseData.patient.age}yo, {caseData.patient.weightKg}kg) • {caseData.patient.procedure}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs font-mono">
            <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Time: {timeFormatted}</span>
            </span>
            <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-amber-300 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Hints: {hintsUsedCount}</span>
            </span>

            {/* Quick Resume Button in Header */}
            {isMidCase && (
              <button
                onClick={onClose}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                title="Resume simulation (Esc)"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Resume</span>
              </button>
            )}

            {/* Dedicated "X" Close Button */}
            <button
              onClick={onClose}
              title="Close and resume simulation (Esc)"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer border border-slate-700 active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Unaccomplished Warning Banner */}
        {!isAccomplished && !isMidCase && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-950/70 border border-rose-600/70 flex items-start gap-2.5 text-rose-200 text-xs font-mono">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-rose-300 font-bold uppercase text-[11px]">
                ⚠️ Case Not Accomplished — No Score Awarded
              </strong>
              <span>
                {unaccomplishedReason || 'Patient was not safely extubated or emerged before concluding simulation. In routine surgical anesthesia, safe tracheal extubation and PACU discharge criteria must be met to complete the case.'}
              </span>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TOP SCORE & AUDIT SUMMARY BANNER */}
        {/* ======================================================== */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="grid grid-cols-12 gap-4 items-center">
            
            {/* Score & Grade */}
            <div className={`col-span-12 md:col-span-7 p-4 rounded-xl border flex items-center justify-between ${grade.color}`}>
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-80">
                  {isMidCase ? 'Current Live Performance Score (Out of 100)' : !isAccomplished ? 'Status: Unaccomplished' : 'Performance Evaluation (Out of 100)'}
                </span>
                <h3 className="text-xl font-black">{grade.text}</h3>
                <p className="text-xs opacity-90 font-mono">
                  {correctActionsCount} appropriate actions • {mistakes.length} mistake{mistakes.length === 1 ? '' : 's'} penalized
                  {isMidCase && ' • Review details below and click Resume to return to the OR'}
                  {!isAccomplished && !isMidCase && ' • Replay case and satisfy safe extubation criteria to earn an accredited score'}
                </p>
              </div>

              <div className="text-right pl-4">
                <div className="text-5xl font-mono font-black tracking-tight">
                  {!isAccomplished && !isMidCase ? '0/100' : `${finalScore}/100`}
                </div>
                <span className="text-xs font-mono uppercase tracking-wider font-bold">
                  {!isAccomplished && !isMidCase ? 'Grade: Incomplete' : `Grade: ${grade.letter}`}
                </span>
              </div>
            </div>

            {/* Score Breakdown Cards */}
            <div className="col-span-12 md:col-span-5 grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[9px] text-slate-400 uppercase block">Starting</span>
                <span className="text-emerald-400 font-bold text-base">100 pts</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[9px] text-slate-400 uppercase block">Mistakes</span>
                <span className={`font-bold text-base ${totalMistakeDeductions > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                  -{totalMistakeDeductions} pts
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[9px] text-slate-400 uppercase block">Hint Penalty</span>
                <span className={`font-bold text-base ${hintDeductions > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  -{hintDeductions} pts
                </span>
              </div>
            </div>

          </div>

          {/* Navigation Bar: Mistakes Button + Audit Trail + Teaching Points */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800/80">
            {isPheoCase && (
              <button
                onClick={() => setActiveTab('pheo_rubric')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                  activeTab === 'pheo_rubric'
                    ? 'bg-amber-600 text-white border-amber-400 shadow-md'
                    : 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/60'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                <span>Pheo Expert Rubric (100 pts)</span>
              </button>
            )}

            {/* The primary requested "Review All Mistakes Made" button */}
            <button
              onClick={() => setActiveTab('mistakes')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all border ${
                activeTab === 'mistakes'
                  ? 'bg-red-600 text-white border-red-400 shadow-md'
                  : 'bg-red-950/40 text-red-300 border-red-800/60 hover:bg-red-900/60'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
              <span>Review All Mistakes Made ({mistakes.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                activeTab === 'audit'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Full Audit Trail ({actionLogs.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('vitals')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                activeTab === 'vitals'
                  ? 'bg-sky-600 text-white border-sky-400 shadow-md'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Vitals Graph</span>
            </button>

            <button
              onClick={() => setActiveTab('teaching')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                activeTab === 'teaching'
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Teaching Pearls ({caseData.teachingPoints.length})</span>
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* TAB CONTENT VIEWPORT */}
        {/* ======================================================== */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0 text-xs">
          
          {/* -------------------------------------------------------- */}
          {/* TAB 0: PHEOCHROMOCYTOMA EXPERT SCORING RUBRIC (100 PTS) */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'pheo_rubric' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/60 via-slate-950 to-slate-900 border border-amber-600/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h3 className="font-mono font-bold text-sm text-white">Pheochromocytoma Expert Evaluation Rubric</h3>
                  </div>
                  <p className="text-[11px] text-slate-300 font-sans mt-0.5">
                    Objective 8-domain scoring criteria for Laparoscopic Left Adrenalectomy in active catecholamine-secreting tumors.
                  </p>
                </div>
                <div className="text-right font-mono">
                  <span className="text-2xl font-black text-amber-300">
                    {pheoRubric.reduce((sum, item) => sum + (item.passed ? item.points : 0), 0)} / 100
                  </span>
                  <span className="text-[10px] text-slate-400 block">Rubric Score</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pheoRubric.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-2 transition-all ${
                      item.passed
                        ? 'bg-slate-950/90 border-emerald-700/60 text-slate-200'
                        : 'bg-rose-950/30 border-rose-700/60 text-rose-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-xs text-white flex items-center gap-1.5">
                          {item.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                          <span>{item.title}</span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                            item.passed
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-rose-950 text-rose-300 border border-rose-700'
                          }`}
                        >
                          {item.passed ? `+${item.points} pts` : `0 / ${item.points} pts`}
                        </span>
                      </div>
                      <p className="text-[11px] font-sans mt-2 leading-relaxed text-slate-300">
                        {item.passed ? item.comment : item.failComment}
                      </p>
                    </div>

                    <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/80">
                      Standard: {item.points} points allocated
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* TAB 1: ALL MISTAKES REVIEW */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'mistakes' && (
            <div className="space-y-3">
              {mistakes.length === 0 ? (
                <div className="p-8 rounded-2xl bg-emerald-950/40 border border-emerald-600/60 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/50">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-emerald-300">Flawless Clinical Execution — Zero Mistakes!</h3>
                  <p className="text-xs text-slate-300 max-w-lg mx-auto">
                    You navigated all perioperative phases with complete adherence to ASA standards, optimal lung-protective ventilation, continuous anesthetic depth, and safe airway management.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-1">
                    <span>Identified {mistakes.length} adverse safety actions or suboptimal decisions:</span>
                    <span className="text-red-400 font-bold">Total Penalty: -{totalMistakeDeductions} points</span>
                  </div>

                  {mistakes.map((m, idx) => (
                    <div
                      key={m.id || idx}
                      className="p-4 rounded-xl bg-slate-950 border border-red-900/50 hover:border-red-600/80 transition-all space-y-2.5 shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 font-mono text-[10px] font-bold border border-slate-800">
                            {m.timeFormatted}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase ${
                            m.severity === 'critical'
                              ? 'bg-red-950 text-red-300 border border-red-600'
                              : m.severity === 'major'
                              ? 'bg-amber-950 text-amber-300 border border-amber-600'
                              : 'bg-blue-950 text-blue-300 border border-blue-600'
                          }`}>
                            {m.severity} HAZARD
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                            {m.category}
                          </span>
                        </div>

                        <span className="px-2.5 py-1 rounded-lg bg-red-950/80 border border-red-600 font-mono font-black text-red-300 text-xs">
                          -{m.pointsDeducted} PTS
                        </span>
                      </div>

                      {/* Title & Description */}
                      <div>
                        <h4 className="text-sm font-bold text-red-200">{m.title}</h4>
                        <p className="text-slate-300 text-xs mt-0.5 leading-relaxed">{m.description}</p>
                      </div>

                      {/* Real Life Consequence Box */}
                      <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-900/60 text-xs space-y-0.5">
                        <span className="text-[10px] font-mono font-bold text-red-400 uppercase block">
                          Real-Life Operating Room Danger:
                        </span>
                        <p className="text-slate-200 leading-relaxed font-sans">{m.realLifeConsequence}</p>
                      </div>

                      {/* Standard Protocol Correction Box */}
                      <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs space-y-0.5">
                        <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase block">
                          Evidence-Based Best Practice Standard:
                        </span>
                        <p className="text-slate-300 leading-relaxed font-sans">{m.correction}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* TAB 2: FULL CHRONOLOGICAL AUDIT TRAIL */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'audit' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-1">
                <span>Complete event log ({actionLogs.length} events logged):</span>
              </div>

              <div className="space-y-1.5 divide-y divide-slate-800/80 font-mono text-[11px]">
                {actionLogs.map((log) => (
                  <div key={log.id} className="pt-2 flex items-center justify-between text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-[10px]">{log.timeFormatted}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                        log.scoreEffect === 'correct' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                        log.scoreEffect === 'harmful' ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {log.scoreEffect}
                      </span>
                      <span className="font-bold text-slate-100">{log.title}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 truncate max-w-sm">{log.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* TAB 3: VITALS TREND GRAPH */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'vitals' && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300 uppercase">
                  <span>Hemodynamic &amp; Oxygenation Trajectory Over Time</span>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-emerald-400 font-bold">• HR (bpm)</span>
                    <span className="text-rose-400 font-bold">• MAP (mmHg)</span>
                    <span className="text-cyan-400 font-bold">• SpO2 (%)</span>
                    <span className="text-yellow-400 font-bold">• EtCO2 (mmHg)</span>
                  </div>
                </div>

                {vitalsHistory.length > 2 ? (
                  <div className="w-full h-44 bg-slate-900/60 rounded-lg p-2 border border-slate-800/80 flex items-center justify-center">
                    <svg viewBox="0 0 500 120" className="w-full h-full">
                      <line x1="0" y1="30" x2="500" y2="30" stroke="#1e293b" strokeWidth="1" />
                      <line x1="0" y1="60" x2="500" y2="60" stroke="#1e293b" strokeWidth="1" />
                      <line x1="0" y1="90" x2="500" y2="90" stroke="#1e293b" strokeWidth="1" />
                      
                      {/* HR (Green) */}
                      <polyline
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2"
                        points={vitalsHistory.map((v, i) => `${(i / (vitalsHistory.length - 1)) * 500},${120 - (v.hr / 160) * 120}`).join(' ')}
                      />
                      {/* MAP (Red) */}
                      <polyline
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2"
                        points={vitalsHistory.map((v, i) => `${(i / (vitalsHistory.length - 1)) * 500},${120 - (v.map / 140) * 120}`).join(' ')}
                      />
                      {/* SpO2 (Cyan) */}
                      <polyline
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="2"
                        points={vitalsHistory.map((v, i) => `${(i / (vitalsHistory.length - 1)) * 500},${120 - (v.spo2 / 100) * 120}`).join(' ')}
                      />
                      {/* EtCO2 (Yellow) */}
                      <polyline
                        fill="none"
                        stroke="#eab308"
                        strokeWidth="2"
                        points={vitalsHistory.map((v, i) => `${(i / (vitalsHistory.length - 1)) * 500},${120 - (v.etco2 / 60) * 120}`).join(' ')}
                      />
                    </svg>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 font-mono">
                    Case too brief for vitals trend recording (&lt; 15 seconds).
                  </div>
                )}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* TAB 4: TEACHING PEARLS */}
          {/* -------------------------------------------------------- */}
          {activeTab === 'teaching' && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-sky-400" />
                <span>Evidence-Based Anesthetic Pearls for {caseData.patient.procedure}</span>
              </h4>

              <ul className="space-y-2 text-slate-300">
                {caseData.teachingPoints.map((point, idx) => (
                  <li key={idx} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-sky-950 text-sky-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-800">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed font-sans text-xs">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>

        {/* ======================================================== */}
        {/* FOOTER ACTIONS */}
        {/* ======================================================== */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onSelectAnotherCase}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-mono font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Select Another Case</span>
            </button>

            <button
              onClick={onRestartCase}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-purple-900/60 text-purple-300 text-xs font-mono font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Replay This Case</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className={`px-6 py-2.5 rounded-xl text-white text-xs font-mono font-black shadow-lg flex items-center gap-2 transition-all active:scale-95 cursor-pointer ${
                isMidCase
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-950/60'
                  : 'bg-slate-800 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              {isMidCase ? (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Resume Simulation</span>
                </>
              ) : (
                <>
                  <X className="w-4 h-4" />
                  <span>Close Debrief</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
