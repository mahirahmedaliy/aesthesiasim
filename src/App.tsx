import React, { useState, useEffect } from 'react';
import { ClinicalCase } from './types/simulator';
import { CLINICAL_CASES } from './data/cases';
import { CaseSelectionLobby } from './components/lobby/CaseSelectionLobby';
import { PatientManagementPage } from './components/management/PatientManagementPage';
import { AuthModal } from './components/modals/AuthModal';
import { WhopUpgradeModal } from './components/modals/WhopUpgradeModal';
import { CaseReviewModal } from './components/modals/CaseReviewModal';
import { AdminDashboardModal } from './components/admin/AdminDashboardModal';
import {
  getCurrentUser,
  getUserProgress,
  activateProWithToken,
  signOutUser,
  syncCurrentUserWithSupabase,
  UserAccount,
  CaseCompletionRecord,
} from './lib/authService';
import confetti from 'canvas-confetti';
import { Sparkles, X } from 'lucide-react';

export const App: React.FC = () => {
  const [selectedCase, setSelectedCase] = useState<ClinicalCase | null>(null);
  const [currentUser, setCurrentUserState] = useState<UserAccount | null>(() => getCurrentUser());
  const [userProgress, setUserProgress] = useState<Record<string, CaseCompletionRecord>>(() => getUserProgress());

  // Modals state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isWhopModalOpen, setIsWhopModalOpen] = useState<boolean>(false);
  const [isCaseReviewModalOpen, setIsCaseReviewModalOpen] = useState<boolean>(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);

  // Selected item states
  const [selectedReviewRecord, setSelectedReviewRecord] = useState<CaseCompletionRecord | null>(null);
  const [targetUpgradeCaseName, setTargetUpgradeCaseName] = useState<string | undefined>(undefined);
  const [proActivationNotice, setProActivationNotice] = useState<string | null>(null);

  // Check URL query parameters & routes on initial mount & listen to window events
  useEffect(() => {
    // 1. Check if visiting admin URL (e.g. /admin, ?admin=true, #admin)
    const checkAdminRoute = () => {
      const isAdminRoute =
        window.location.pathname.startsWith('/admin') ||
        new URLSearchParams(window.location.search).get('admin') === 'true' ||
        window.location.hash === '#admin';

      if (isAdminRoute) {
        setIsAdminModalOpen(true);
      }
    };

    checkAdminRoute();
    window.addEventListener('popstate', checkAdminRoute);
    window.addEventListener('hashchange', checkAdminRoute);

    // 2. Live Supabase Profile Sync (syncs Pro grant/revoke across all devices & browsers)
    const performLiveSync = async () => {
      const synced = await syncCurrentUserWithSupabase();
      if (synced) {
        setCurrentUserState(synced);
      }
    };

    performLiveSync();

    const handleFocus = () => {
      performLiveSync();
      setUserProgress(getUserProgress());
    };
    window.addEventListener('focus', handleFocus);

    // Periodic sync every 20 seconds while browsing
    const syncInterval = setInterval(performLiveSync, 20000);

    // 3. Secret keyboard shortcut: Ctrl+Shift+A (or Cmd+Shift+A) opens the Admin Portal
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        setIsAdminModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // 4. Handle Whop tokens & checkout redirects
    const handleUrlTokens = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const proToken = urlParams.get('pro_token') || urlParams.get('token');
        const whopSuccess = urlParams.get('whop_success');

        if (proToken || whopSuccess === 'true') {
          const tokenToUse = proToken || 'WHOP-PRO-2026';
          const res = await activateProWithToken(tokenToUse);
          if (res.success && res.user) {
            setCurrentUserState(res.user);
            setUserProgress(getUserProgress());
            setProActivationNotice('🎉 Pro Access Successfully Activated! All clinical suites are unlocked.');
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
          }

          // Clean up the URL query parameters so user doesn't re-trigger on refresh
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      } catch (err) {
        console.warn('Failed to parse URL token:', err);
      }
    };

    handleUrlTokens();

    return () => {
      window.removeEventListener('popstate', checkAdminRoute);
      window.removeEventListener('hashchange', checkAdminRoute);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('keydown', handleKeyDown);
      clearInterval(syncInterval);
    };
  }, []);

  const handleSelectCase = (caseItem: ClinicalCase) => {
    setSelectedCase(caseItem);
  };

  const handleReturnToLobby = () => {
    // Refresh user progress on return from case
    setUserProgress(getUserProgress());
    setSelectedCase(null);
  };

  const handleSignOut = () => {
    signOutUser();
    setCurrentUserState(null);
  };

  const handleAuthSuccess = (user: UserAccount) => {
    setCurrentUserState(user);
    setIsAuthModalOpen(false);
  };

  const handleProActivated = (user: UserAccount) => {
    setCurrentUserState(user);
    setUserProgress(getUserProgress());
    setIsWhopModalOpen(false);
  };

  const handleReplayCaseFromReview = (caseId: string) => {
    const target = CLINICAL_CASES.find((c) => c.patient.id === caseId);
    if (target) {
      setIsCaseReviewModalOpen(false);
      setSelectedCase(target);
    }
  };

  const handleRefreshAdminData = () => {
    setCurrentUserState(getCurrentUser());
    setUserProgress(getUserProgress());
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 font-sans">
      {/* Pro Activation Toast Notification */}
      {proActivationNotice && (
        <div className="fixed top-4 right-4 z-50 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <Sparkles className="w-5 h-5 fill-slate-950 shrink-0" />
          <span className="text-xs font-mono font-black">{proActivationNotice}</span>
          <button
            onClick={() => setProActivationNotice(null)}
            className="p-1 hover:bg-black/10 rounded-lg transition-colors ml-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {selectedCase ? (
        <PatientManagementPage
          clinicalCase={selectedCase}
          onReturnToLobby={handleReturnToLobby}
        />
      ) : (
        <CaseSelectionLobby
          cases={CLINICAL_CASES}
          onSelectCase={handleSelectCase}
          currentUser={currentUser}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onSignOut={handleSignOut}
          onOpenWhopUpgrade={(caseName) => {
            setTargetUpgradeCaseName(caseName);
            setIsWhopModalOpen(true);
          }}
          onOpenAdminDashboard={() => setIsAdminModalOpen(true)}
          onOpenCaseReview={(record) => {
            setSelectedReviewRecord(record);
            setIsCaseReviewModalOpen(true);
          }}
          userProgress={userProgress}
        />
      )}

      {/* User Authentication Modal (Sign In, Register, Forgot Password) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Whop Pro Upgrade Paywall Modal ($24.29 USD) */}
      <WhopUpgradeModal
        isOpen={isWhopModalOpen}
        onClose={() => setIsWhopModalOpen(false)}
        onProActivated={handleProActivated}
        targetCaseName={targetUpgradeCaseName}
      />

      {/* Detailed Case Debrief Review Modal (What they did Good vs Bad) */}
      <CaseReviewModal
        isOpen={isCaseReviewModalOpen}
        onClose={() => setIsCaseReviewModalOpen(false)}
        record={selectedReviewRecord}
        onReplayCase={handleReplayCaseFromReview}
      />

      {/* Protected Admin Portal (View Users, Pro/Basic list, Grant/Revoke Pro, Whop config) */}
      <AdminDashboardModal
        isOpen={isAdminModalOpen}
        onClose={() => {
          setIsAdminModalOpen(false);
          if (window.location.pathname.startsWith('/admin') || window.location.hash === '#admin') {
            window.history.pushState({}, '', '/');
          }
        }}
        currentUser={currentUser}
        onRefreshData={handleRefreshAdminData}
      />
    </div>
  );
};

export default App;
