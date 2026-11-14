import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Lock,
  Unlock,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  CreditCard,
  Key,
  X,
  AlertCircle,
  Loader2,
  Award,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  getWhopConfig,
  fetchWhopConfigFromSupabase,
  activateProWithToken,
  UserAccount,
  WhopConfig,
} from '../../lib/authService';

interface WhopUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProActivated: (user: UserAccount) => void;
  targetCaseName?: string;
}

export const WhopUpgradeModal: React.FC<WhopUpgradeModalProps> = ({
  isOpen,
  onClose,
  onProActivated,
  targetCaseName,
}) => {
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [whopConfig, setWhopConfig] = useState<WhopConfig>(() => getWhopConfig());

  useEffect(() => {
    if (isOpen) {
      setWhopConfig(getWhopConfig());
      fetchWhopConfigFromSupabase().then((cfg) => {
        if (cfg) setWhopConfig(cfg);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleActivateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setErrorMsg('Please enter your Whop order ID or license key.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await activateProWithToken(tokenInput);
      if (res.success && res.user) {
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
        setSuccessMsg(res.message);
        setTimeout(() => {
          onProActivated(res.user!);
          onClose();
        }, 1200);
      } else {
        setErrorMsg(res.message || 'Invalid activation token.');
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to activate token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none font-sans"
    >
      <div className="bg-slate-900 border-2 border-amber-500/50 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100 shadow-amber-500/10">
        
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 p-6 text-slate-950 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-black/20 hover:bg-black/30 text-slate-950 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-slate-950 text-amber-300 text-[10px] font-mono font-black uppercase tracking-wider">
              WHOP PRO PASS
            </span>
            <span className="text-xs font-mono font-bold opacity-80">Lifetime License</span>
          </div>

          <h2 className="text-2xl font-black tracking-tight text-white">
            Unlock All 6 Clinical Anesthesia Suites
          </h2>
          <p className="text-xs text-amber-950 font-semibold mt-1">
            {targetCaseName
              ? `Case "${targetCaseName}" is locked. Upgrade to Pro for instant lifetime access to all patients.`
              : 'Complete perioperative operating room simulation with board-level debriefs.'}
          </p>

          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-white font-mono">${whopConfig.priceUsd.toFixed(2)}</span>
            <span className="text-xs font-mono text-amber-950 font-bold uppercase">USD • One-Time Payment</span>
          </div>
        </div>

        {/* Benefits List */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 gap-2.5 text-xs text-slate-300">
            {[
              'Instant access to all 6 clinical suites (Pediatric, Obstetric Emergency, Trauma, CAD)',
              'Multi-lead ECG, Radial Arterial Line, Capnography & BIS monitor waveforms',
              'Real-life clinical mistake scoring & 100-point performance audit',
              'Advanced crisis scenarios: Malignant hyperthermia, anaphylaxis, bronchospasm & PEA',
              'Unlimited simulation repeats & permanent audit trail history',
            ].map((benefit, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{benefit}</span>
              </div>
            ))}
          </div>

          {/* Whop Gateway Checkout Button (Direct Anchor Link) */}
          <div className="pt-2">
            <a
              href={whopConfig.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-mono font-black text-sm shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer text-center"
            >
              <CreditCard className="w-4 h-4" />
              <span>Unlock on Whop (${whopConfig.priceUsd.toFixed(2)} USD)</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
            <p className="text-[10px] text-center text-slate-400 mt-1.5 font-mono">
              Secure checkout powered by Whop • Instant access upon completion
            </p>
          </div>

          {/* Whop Activation Token / Order ID Input Form */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>Already paid on Whop? Enter Token:</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">(Order ID / Token)</span>
            </div>

            {errorMsg && (
              <div className="mb-2 p-2 rounded-xl bg-rose-950/70 border border-rose-700/60 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-2 p-2 rounded-xl bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleActivateToken} className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. WHOP-PRO-2026 or Order ID"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 uppercase"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-mono font-bold text-xs flex items-center gap-1.5 transition-colors active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5 text-amber-400" />}
                <span>Activate</span>
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
};
