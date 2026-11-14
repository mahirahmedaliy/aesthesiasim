import React from 'react';
import { Activity, Mail, ArrowUpRight, Heart, ShieldCheck, Sparkles, ExternalLink, Stethoscope } from 'lucide-react';

interface AppFooterProps {
  onNavigateHome?: () => void;
  onNavigateCases?: () => void;
  onNavigateHowItWorks?: () => void;
  onNavigateAbout?: () => void;
}

export const AppFooter: React.FC<AppFooterProps> = ({
  onNavigateHome,
  onNavigateCases,
  onNavigateHowItWorks,
  onNavigateAbout,
}) => {
  const handleScrollTo = (id: string, fallbackAction?: () => void) => {
    if (fallbackAction) {
      fallbackAction();
      return;
    }
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <footer id="contact-section" className="w-full bg-slate-950 border-t border-slate-800/80 text-slate-400 font-sans select-none relative z-20">
      {/* Top Border Glow Accent */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-sky-500/40 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
        {/* Main 3-Column Responsive Grid: side by side on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          
          {/* COLUMN 1: About */}
          <div className="space-y-4">
            {/* Website Name & Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 shrink-0">
                <Activity className="w-5 h-5 text-sky-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-black tracking-tight text-white font-mono">AESTHESIASIM</span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-400 border border-sky-800/60">
                    OR SIM
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono block">Clinical Simulation Workstation</span>
              </div>
            </div>

            {/* Short Line */}
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              A realistic anesthesia simulator for students, residents and practitioners to practice case management from induction to extubation.
            </p>

            {/* Clinical highlights pill */}
            <div className="pt-1 flex flex-wrap gap-2 text-[11px] font-mono text-slate-400">
              <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-sky-400">
                7 Clinical Suites
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-emerald-400">
                Dynamic PK/PD
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-purple-400">
                Multi-Lead ECG
              </span>
            </div>
          </div>

          {/* COLUMN 2: Quick Links */}
          <div className="space-y-3 md:pl-6 lg:pl-10">
            <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              Quick Links
            </h3>

            <ul className="space-y-2 text-xs sm:text-sm font-medium">
              <li>
                <button
                  onClick={() => handleScrollTo('top', onNavigateHome)}
                  className="hover:text-sky-400 transition-colors flex items-center gap-1.5 text-slate-300 hover:translate-x-1 duration-150 cursor-pointer"
                >
                  <span className="text-slate-600">›</span> Home
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleScrollTo('cases-section', onNavigateCases)}
                  className="hover:text-sky-400 transition-colors flex items-center gap-1.5 text-slate-300 hover:translate-x-1 duration-150 cursor-pointer"
                >
                  <span className="text-slate-600">›</span> Cases
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleScrollTo('how-it-works', onNavigateHowItWorks)}
                  className="hover:text-sky-400 transition-colors flex items-center gap-1.5 text-slate-300 hover:translate-x-1 duration-150 cursor-pointer"
                >
                  <span className="text-slate-600">›</span> How It Works
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleScrollTo('about-section', onNavigateAbout)}
                  className="hover:text-sky-400 transition-colors flex items-center gap-1.5 text-slate-300 hover:translate-x-1 duration-150 cursor-pointer"
                >
                  <span className="text-slate-600">›</span> About
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleScrollTo('contact-section')}
                  className="hover:text-sky-400 transition-colors flex items-center gap-1.5 text-slate-300 hover:translate-x-1 duration-150 cursor-pointer"
                >
                  <span className="text-slate-600">›</span> Contact
                </button>
              </li>
            </ul>
          </div>

          {/* COLUMN 3: Contact & Support */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Need help or have feedback?
            </h3>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Found a bug, have a case suggestion, or need help using the simulator? Get in touch.
            </p>

            <div className="pt-1">
              <a
                href="mailto:aesthesiasim@gmail.com"
                className="inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-900/90 hover:bg-sky-950/80 border border-slate-800 hover:border-sky-500/60 text-sky-400 hover:text-sky-300 transition-all font-mono text-xs font-bold shadow-sm group cursor-pointer"
              >
                <Mail className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform shrink-0" />
                <span>aesthesiasim@gmail.com</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 transition-colors" />
              </a>
            </div>

            <p className="text-[11px] text-slate-500 font-mono">
              Direct developer &amp; medical author inbox. Replies within 24 hours.
            </p>
          </div>

        </div>

        {/* Bottom Sub-Footer Bar */}
        <div className="mt-10 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span>&copy; {new Date().getFullYear()} Aesthesiasim. All rights reserved.</span>
          </div>

          <div className="text-center sm:text-right text-amber-500/80 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500/80 shrink-0" />
            <span>For educational simulation only. Not for actual clinical decision-making or patient care.</span>
          </div>
        </div>

      </div>
    </footer>
  );
};
