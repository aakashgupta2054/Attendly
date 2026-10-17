import { useState, useEffect } from 'react';
import { auth, db, OperationType, handleFirestoreError } from './firebase';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut, User, getRedirectResult } from 'firebase/auth';
import { collection, onSnapshot, query, where, doc, getDocFromServer, setDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar as CalendarIcon, 
  BarChart3, 
  Settings as SettingsIcon, 
  Info, 
  Building2, 
  Users, 
  LogOut, 
  LogIn,
  Menu,
  X
} from 'lucide-react';

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import AttendanceView from './components/AttendanceView';
import ReportsView from './components/ReportsView';
import SettingsView from './components/SettingsView';
import AboutView from './components/AboutView';
import { Company, Employee, UserSettings } from './types';
import { toast } from 'sonner';

export default function App() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'attendance' | 'reports' | 'settings' | 'about'>('attendance');
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Handle browser back button and initial state
  useEffect(() => {
    // Detect initial state from history or default to attendance
    const initialState = window.history.state?.tab;
    if (initialState && ['attendance', 'reports', 'settings', 'about'].includes(initialState)) {
      setActiveTab(initialState);
    } else {
      // Replace initial state so the first back doesn't take us out of the app immediately if possible
      window.history.replaceState({ tab: 'attendance' }, '', '');
    }

    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.tab) {
        setActiveTab(event.state.tab);
      }
      // If we popped back and there's no menuOpen flag, close the menu
      setIsMenuOpen(!!event.state?.menuOpen);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Helper to change tab with history push
  const handleTabChange = (tab: typeof activeTab) => {
    if (tab !== activeTab) {
      window.history.pushState({ tab }, '', '');
      setActiveTab(tab);
    }
  };

  const toggleMenu = (open: boolean) => {
    if (open && !isMenuOpen) {
      window.history.pushState({ tab: activeTab, menuOpen: true }, '', '');
    } else if (!open && isMenuOpen) {
      if (window.history.state?.menuOpen) {
        window.history.back();
      }
    }
    setIsMenuOpen(open);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      // If we have local settings, we might already be "ready" enough
      setLoading(false);
      if (u) {
        testConnection();
      }
    });

    // Handle redirect result quietly
    getRedirectResult(auth).catch((error) => {
      if (error.code !== 'auth/web-storage-unsupported') {
        console.error("Redirect Login Error:", error);
      }
    });

    return () => unsubscribe();
  }, []);

  async function testConnection() {
    // Non-blocking connection check
    try {
      const { getDoc, doc } = await import('firebase/firestore');
      await getDoc(doc(db, 'test', 'connection'));
    } catch (error: any) {
      if (error.message?.includes('the client is offline')) {
        console.warn("Firestore is running in offline mode.");
      }
    }
  }

  useEffect(() => {
    // Stage 1: Initial local load
    if (!userSettings) {
      const localSettings = localStorage.getItem('local_settings');
      if (localSettings) {
        try {
          const settings = JSON.parse(localSettings) as UserSettings;
          setUserSettings(settings);
        } catch (e) {
          console.error("Failed to parse local settings", e);
        }
      }
    }

    if (!user) return;

    // Stage 2: Firestore sync
    const unsubscribe = onSnapshot(doc(db, 'userSettings', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const settings = docSnap.data() as UserSettings;
        setUserSettings(settings);
        localStorage.setItem('local_settings', JSON.stringify(settings));
      } else {
        const defaultSettings: UserSettings = {
          language: i18n.language.startsWith('hi') ? 'hi' : 'en',
          theme: (document.documentElement.classList.contains('dark') ? 'dark' : 'light') as 'light' | 'dark',
          ownerId: user.uid,
          basePay: 0,
          salaryType: 'monthly',
          overtimePayPerHour: 0,
          standardWorkingHours: 8,
          breakTimeMinutes: 0,
          deductBreak: false
        };
        setDoc(doc(db, 'userSettings', user.uid), defaultSettings);
      }
    }, (error) => {
      console.error("Settings Subscription Error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Handle Side Effects (Theme, Language) whenever settings change
  useEffect(() => {
    if (!userSettings) return;

    if (userSettings.theme) {
      document.documentElement.classList.toggle('dark', userSettings.theme === 'dark');
    }
    
    if (userSettings.language && i18n.language !== userSettings.language) {
      i18n.changeLanguage(userSettings.language);
    }
  }, [userSettings, i18n]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      // Check if we are in a mobile/WebView environment
      const isWebView = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      
      if (isWebView) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (error: any) {
      console.error("Login Error:", error);
      if (error?.code === 'auth/unauthorized-domain') {
        toast.info(
          isHindi 
            ? "Vercel domain abhi Firebase me add nahi hai. Par aap bina login ke local mode me poora app 100% use kar sakte hain!" 
            : "Domain not yet added in Firebase Auth. All app features work completely in local mode!"
        );
      } else if (error?.code === 'auth/popup-blocked') {
        toast.error(isHindi ? "Popup block ho gaya, kripya browser settings se allow karein" : "Popup was blocked by your browser. Please allow popups.");
      } else if (error?.code !== 'auth/popup-closed-by-user') {
        toast.error(`Login error: ${error.message || "Failed"}`);
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    handleTabChange('attendance');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  const navItems = [
    { id: 'attendance', label: t('attendance'), icon: CalendarIcon },
    { id: 'reports', label: t('reports'), icon: BarChart3 },
    { id: 'settings', label: t('settings'), icon: SettingsIcon },
    { id: 'about', label: t('about'), icon: Info },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row font-sans">
      {/* Sidebar / Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-card md:glass-card border-r border-border/50 md:m-4 md:rounded-3xl transition-transform duration-300 ease-in-out
        ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 flex flex-col shadow-2xl shadow-primary/5
      `}>
        <div className="flex items-center gap-3 p-8">
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 rotate-3 transform transition-transform hover:rotate-0">
            <CalendarIcon className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-xl leading-none">{t('app_name')}</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 font-semibold">{t('payroll_calculation')}</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-2 flex flex-col gap-1.5 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60 px-4 mb-2">Main Menu</div>
          {navItems.map((item) => (
            <motion.div key={item.id} whileTap={{ scale: 0.98 }}>
              <Button
                variant={activeTab === item.id ? 'default' : 'ghost'}
                className={`w-full justify-start h-12 rounded-2xl px-4 transition-all duration-300 ${
                  activeTab === item.id 
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]' 
                    : 'hover:bg-primary/5 text-muted-foreground'
                }`}
                onClick={() => {
                  handleTabChange(item.id as any);
                  toggleMenu(false);
                }}
              >
                <item.icon className={`mr-3 h-5 w-5 ${activeTab === item.id ? 'text-white' : 'text-primary/60'}`} />
                <span className="font-medium">{item.label}</span>
              </Button>
            </motion.div>
          ))}
          
          <div className="mt-auto pt-8 pb-4">
            {user ? (
              <div className="glass-card p-4 rounded-2xl flex items-center gap-3 mb-4 border-slate-200/50">
                <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-xl border-2 border-primary/10" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{user.displayName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                </div>
              </div>
            ) : (
              <div className="px-2 mb-4">
                <p className="text-[10px] text-muted-foreground text-center mb-3">{t('login_description')}</p>
              </div>
            )}

            {!user ? (
              <Button
                variant="outline"
                className="w-full justify-start h-14 rounded-2xl border border-primary/20 bg-white dark:bg-slate-900 text-primary hover:bg-primary/5 font-bold shadow-sm px-3 gap-3"
                onClick={() => {
                  handleLogin();
                  toggleMenu(false);
                }}
              >
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 ring-1 ring-black/5">
                  <GoogleIcon className="h-5 w-5" />
                </div>
                <span className="text-xs truncate flex-1 text-left">{t('get_started')}</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="w-full justify-start h-12 rounded-2xl text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors"
                onClick={() => {
                  handleLogout();
                  toggleMenu(false);
                }}
              >
                <LogOut className="mr-3 h-5 w-5" />
                <span className="text-sm font-medium">{t('LogOut')}</span>
              </Button>
            )}
          </div>
        </nav>
      </aside>

      {/* Mobile Header Overlay */}
      <div className="md:hidden flex items-center justify-between p-4 bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
             <CalendarIcon className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold">{t('app_name')}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => toggleMenu(!isMenuOpen)} className="rounded-xl bg-primary/5">
          {isMenuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col md:overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-10 scroll-smooth">
          <div className="max-w-6xl mx-auto w-full pb-24">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Section Title Header */}
                <header className="mb-10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="h-[1px] w-8 bg-primary/30"></span>
                    <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary/60">{activeTab}</span>
                  </div>
                  <h2 className="text-4xl font-bold font-heading capitalize text-foreground">
                    {navItems.find(i => i.id === activeTab)?.label}
                  </h2>
                </header>

                {activeTab === 'attendance' && (
                  <AttendanceView 
                    user={user} 
                    userSettings={userSettings}
                  />
                )}
                {activeTab === 'reports' && (
                  <ReportsView 
                    user={user} 
                    userSettings={userSettings}
                  />
                )}
                {activeTab === 'settings' && (
                  <div className="space-y-6">
                    {!user && (
                      <Card className="bento-card border-primary/20 bg-primary/5">
                        <CardHeader>
                          <CardTitle>{t('login_required')}</CardTitle>
                          <CardDescription>{t('login_description')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button 
                            onClick={handleLogin} 
                            className="h-16 px-5 rounded-2xl gap-3 bg-primary text-primary-foreground hover:opacity-90 shadow-xl shadow-primary/20 font-bold transition-all hover:scale-105 active:scale-95 w-full max-w-sm ml-0"
                          >
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md shrink-0">
                               <GoogleIcon className="w-6 h-6" /> 
                            </div>
                            <span className="text-base sm:text-lg truncate">{t('get_started')}</span>
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                    <SettingsView 
                      user={user} 
                      userSettings={userSettings}
                      onUpdateSettings={(newSettings) => setUserSettings(newSettings)}
                    />
                  </div>
                )}
                {activeTab === 'about' && <AboutView />}
              </motion.div>
            </AnimatePresence>
            
          </div>
        </div>
      </main>
    </div>
  );
}
