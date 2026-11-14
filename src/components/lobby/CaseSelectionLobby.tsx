import React from 'react';
import { ClinicalCase } from '../../types/simulator';
import {
  Activity,
  User,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Shield,
  Heart,
  CheckCircle2,
  Lock,
  Unlock,
  RotateCcw,
  FileText,
  CreditCard,
  KeyRound,
  LogOut,
  LogIn,
  Stethoscope,
  Cpu,
  Award,
  Zap,
} from 'lucide-react';
import {
  UserAccount,
  CaseCompletionRecord,
  isCaseUnlocked,
} from '../../lib/authService';
import { AppFooter } from '../common/AppFooter';

interface CaseSelectionLobbyProps {
  cases: ClinicalCase[];
  onSelectCase: (selectedCase: ClinicalCase) => void;
  onOpenSupabaseConfig?: () => void;
  currentUser: UserAccount | null;
  onOpenAuthModal: () => void;
  onSignOut: () => void;
  onOpenWhopUpgrade: (caseName?: string) => void;
  onOpenAdminDashboard: () => void;
  onOpenCaseReview: (record: CaseCompletionRecord) => void;
  userProgress: Record<string, CaseCompletionRecord>;
}

export const CaseSelectionLobby: React.FC<CaseSelectionLobbyProps> = ({
  cases,
  onSelectCase,
  currentUser,
  onOpenAuthModal,
  onSignOut,
  onOpenWhopUpgrade,
  onOpenAdminDashboard,
  onOpenCaseReview,
  userProgress,
}) => {
  const isPro = Boolean(currentUser?.isPro);

  const getDifficultyBadge = (diff: ClinicalCase['patient']['difficulty']) => {
    switch (diff) {
      case 'Beginner':
        return 'bg-emerald-950 text-emerald-300 border-emerald-700';
      case 'Intermediate':
        return 'bg-sky-950 text-sky-300 border-sky-700';
      case 'Advanced':
        return 'bg-amber-950 text-amber-300 border-amber-700';
      case 'Expert':
        return 'bg-red-950 text-red-300 border-red-700';
    }
  };

  return (
    <div id="top" className="min-h-screen bg-[#030712] text-slate-100 flex flex-col font-sans select-none">
      
      {/* Top Header Bar */}
      <header className="bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
        
        {/* Left: Logo & Branding */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white">AESTHESIASIM</h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                CLINICAL OR SIMULATOR
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Interactive physiological workstation &amp; multi-lead patient monitor
            </p>
          </div>
        </div>

        {/* Right: Account, Pro Status, Admin & Supabase Sync */}
        <div className="flex items-center gap-2.5">
          
          {/* Whop Pro Plan Pill / Upgrade Button */}
          {isPro ? (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/50 text-amber-300 text-xs font-mono font-black shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>PRO UNLOCKED</span>
            </div>
          ) : (
            <button
              onClick={() => onOpenWhopUpgrade()}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-mono font-black flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
              <span>UNLOCK ALL ($24.29)</span>
            </button>
          )}

          {/* User Account / Sign In */}
          {currentUser ? (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs font-mono">
              <div className="flex items-center gap-1.5 px-2 text-slate-300">
                <User className="w-3.5 h-3.5 text-sky-400" />
                <span className="max-w-[120px] truncate font-bold">{currentUser.name}</span>
              </div>

              {currentUser.role === 'admin' && (
                <button
                  onClick={onOpenAdminDashboard}
                  className="px-2 py-1 rounded-lg bg-amber-950 text-amber-300 border border-amber-700/60 font-bold hover:bg-amber-900 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Open Admin Portal"
                >
                  <Shield className="w-3 h-3 text-amber-400" />
                  <span>Admin</span>
                </button>
              )}

              <button
                onClick={onSignOut}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenAuthModal}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-sky-400" />
                <span>Sign In</span>
              </button>

              <button
                onClick={onOpenAdminDashboard}
                className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Admin Access Portal"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
              </button>
            </div>
          )}

        </div>
      </header>

      {/* Hero Banner & Progression Explanation */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        
        <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-sky-950 border border-sky-800 text-sky-300 text-xs font-mono font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {isPro
                  ? 'All 6 Clinical Suites Unlocked (Pro Member)'
                  : 'Score >80% on each case to unlock the next, or upgrade to Pro to unlock all'}
              </span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Evidence-Based Anesthesia Simulation Suites
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every clinical decision shifts physiology, gas exchange, and hemodynamics in real-time. Manage cases through Pre-op, Induction, Airway, Maintenance, Emergence, and PACU. Deductions occur for real-life hazards.
            </p>
          </div>

          {!isPro && (
            <button
              onClick={() => onOpenWhopUpgrade()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-mono font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 shrink-0 cursor-pointer active:scale-95"
            >
              <CreditCard className="w-4 h-4" />
              <span>Unlock All Cases ($24.29 USD)</span>
            </button>
          )}
        </div>

        {/* 7 Patient Case Cards Grid */}
        <div id="cases-section" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 scroll-mt-20">
          {cases.map((c, index) => {
            const p = c.patient;
            const completion = userProgress[p.id];
            const isCompleted = Boolean(completion?.completed);
            const unlockInfo = isCaseUnlocked(p.id, index, cases, userProgress, isPro);
            const isUnlocked = unlockInfo.unlocked;

            // Card Styling based on state:
            // 1. Completed: Highlighted in rich Emerald Green
            // 2. Locked: Dimmed with lock badge
            // 3. Unlocked: Standard active
            const cardBg = isCompleted
              ? 'bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950/25 border-2 border-emerald-500/70 shadow-xl shadow-emerald-950/30'
              : !isUnlocked
              ? 'bg-slate-950/50 border border-slate-800 opacity-80 hover:opacity-100 hover:border-amber-500/50'
              : 'bg-slate-950/80 border border-slate-800 hover:border-sky-500 hover:bg-slate-900 shadow-xl hover:shadow-sky-500/10';

            return (
              <div
                key={p.id}
                className={`p-5 rounded-2xl flex flex-col justify-between transition-all group ${cardBg}`}
              >
                <div className="space-y-3">
                  
                  {/* Top Status Badges */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {isCompleted ? (
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>COMPLETED</span>
                        </span>
                      ) : !isUnlocked ? (
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-amber-400" />
                          <span>LOCKED</span>
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${getDifficultyBadge(p.difficulty)}`}>
                          Case {index + 1}
                        </span>
                      )}

                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${getDifficultyBadge(p.difficulty)}`}>
                        {p.difficulty}
                      </span>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-300 border border-red-800">
                      {p.asaClass}
                    </span>
                  </div>

                  {/* Patient Name & Demographics */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg transition-colors shrink-0 ${
                        isCompleted
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : !isUnlocked
                          ? 'bg-slate-900 text-slate-500 border border-slate-800'
                          : 'bg-slate-800 group-hover:bg-sky-600 group-hover:text-white text-slate-300'
                      }`}
                    >
                      {!isUnlocked ? <Lock className="w-6 h-6 text-amber-400" /> : <User className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3
                        className={`text-lg font-bold transition-colors ${
                          isCompleted
                            ? 'text-emerald-300'
                            : !isUnlocked
                            ? 'text-slate-300'
                            : 'text-white group-hover:text-sky-300'
                        }`}
                      >
                        {p.name}
                      </h3>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        {p.age}yo {p.sex} • {p.weightKg}kg • BMI {p.bmi}
                      </div>
                    </div>
                  </div>

                  {/* Score Badge if completed */}
                  {completion && isCompleted && (
                    <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-mono ${
                      completion.score >= 80
                        ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                        : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                    }`}>
                      <span className="font-bold">Score: {completion.score}/100 [{completion.grade}]</span>
                      <span className="text-[10px] opacity-80">{completion.mistakes.length} mistakes</span>
                    </div>
                  )}

                  {/* Notice if attempted but unaccomplished / exited prematurely */}
                  {completion && !isCompleted && (
                    <div className="p-2.5 rounded-xl border border-rose-900/60 bg-rose-950/30 text-rose-300 flex items-center justify-between text-xs font-mono">
                      <span className="font-bold">⚠️ INCOMPLETE RUN</span>
                      <span className="text-[10px] opacity-80">No Score (Not Finished)</span>
                    </div>
                  )}

                  {/* Scheduled Surgical Procedure */}
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-xs">
                    <span className="text-slate-400 block text-[10px] uppercase font-mono font-bold">Procedure:</span>
                    <span className="text-slate-100 font-semibold">{p.procedure}</span>
                  </div>

                  {/* Key Comorbidities */}
                  <div>
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1">
                      Key Comorbidities:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {p.keyComorbidities.map((item, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom Actions based on state */}
                <div className="pt-4 mt-4 border-t border-slate-800/80">
                  {isCompleted ? (
                    // Completed Case: Two options -> Review Mistakes & What they did good, or Replay
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCaseReview(completion);
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-700/70 text-purple-200 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Review what you did good and bad"
                      >
                        <FileText className="w-3.5 h-3.5 text-purple-300" />
                        <span>Review Debrief</span>
                      </button>

                      <button
                        onClick={() => onSelectCase(c)}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/60 transition-all active:scale-95 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Replay Case</span>
                      </button>
                    </div>
                  ) : !isUnlocked ? (
                    // Locked Case: Explains lock requirement & offers Whop Pro unlock
                    <button
                      onClick={() => onOpenWhopUpgrade(p.name)}
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Unlock via Pro Pass ($24.29)</span>
                      </div>
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    </button>
                  ) : (
                    // Unlocked Case: Direct Start
                    <button
                      onClick={() => onSelectCase(c)}
                      className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-sky-600 border border-slate-700 hover:border-sky-500 text-sky-400 hover:text-white text-xs font-mono font-bold flex items-center justify-between transition-all cursor-pointer group"
                    >
                      <span>Start Patient Management</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>

        {/* HOW IT WORKS SECTION */}
        <section id="how-it-works" className="pt-8 border-t border-slate-800/80 space-y-6 scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-950/80 border border-sky-800 text-sky-400 text-xs font-mono font-bold uppercase mb-2">
                <Stethoscope className="w-3.5 h-3.5" />
                <span>Simulation Workflow</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                How It Works — From Induction to Extubation
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              6-Phase Perioperative Management Loop
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="text-sky-400">PHASE 01</span>
                <span className="text-slate-500">PRE-OP</span>
              </div>
              <h4 className="font-bold text-white text-sm">Assessment & Leak Test</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Review airway Mallampati score, NPO fasting compliance, baseline labs, and perform the automated workstation leak test.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="text-indigo-400">PHASE 02</span>
                <span className="text-slate-500">INDUCTION</span>
              </div>
              <h4 className="font-bold text-white text-sm">Blunted Induction & Airway</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pre-oxygenate to 100% FiO2, titrate IV hypnotics and opioids, secure the trachea, verify bilateral breath sounds and square-wave EtCO2.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="text-amber-400">PHASE 03</span>
                <span className="text-slate-500">MAINTENANCE</span>
              </div>
              <h4 className="font-bold text-white text-sm">Workstation & Crisis Control</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Maintain 0.8–1.0 MAC, adjust lung-protective ventilation, manage pneumoperitoneum, blood loss, and treat real-time physiological complications.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="text-emerald-400">PHASE 04</span>
                <span className="text-slate-500">EMERGENCE</span>
              </div>
              <h4 className="font-bold text-white text-sm">Reversal & PACU Handover</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Reverse neuromuscular blockade (TOF &ge; 0.9), extubate on spontaneous ventilation, transfer to recovery, and review an unsparing debrief scorecard.
              </p>
            </div>
          </div>
        </section>

        {/* ABOUT SECTION */}
        <section id="about-section" className="pt-6 pb-4 border-t border-slate-800/80 scroll-mt-20">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                <Cpu className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-black text-white tracking-tight">
                About Aesthesiasim
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Aesthesiasim is an advanced intraoperative clinical workstation built for anesthesia residents, CRNAs, medical students, and attending physicians. Unlike simple question banks or preset state jump simulators, Aesthesiasim computes multi-compartment pharmacokinetics, positive feedback cardiovascular collapse, continuous respiratory gas exchange, and real-time multi-lead ECG rhythm generation on every single clock tick.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs font-mono text-slate-400">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <span className="text-sky-400 font-bold block mb-1">Zero Artificial Floors</span>
                Vitals do not clamp at arbitrary minimums. Untreated severe hypotension or hypoxia triggers true cardiac arrest and death.
              </div>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <span className="text-emerald-400 font-bold block mb-1">Dose-Dependent PK/PD</span>
                Drug effects scale with mg/kg, onset, peak, and duration. Overdosing or drug stacking produces real toxicological collapse.
              </div>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <span className="text-purple-400 font-bold block mb-1">Rigorous Clinical Scoring</span>
                100-point rubric assessing airway blunting, drug selections, ventilator settings, and crisis decision timing.
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Professional Responsive Footer */}
      <AppFooter />

    </div>
  );
};
