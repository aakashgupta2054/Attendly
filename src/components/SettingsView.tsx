import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { UserSettings } from '../types';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Languages, 
  Moon, 
  Sun, 
  Save,
  Wallet,
  Clock
} from 'lucide-react';
import { motion } from 'motion/react';

interface SettingsViewProps {
  user: User | null;
  userSettings: UserSettings | null;
  onUpdateSettings: (settings: UserSettings) => void;
}

export default function SettingsView({
  user,
  userSettings,
  onUpdateSettings
}: SettingsViewProps) {
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language === 'hi';

  // Local state for form inputs to prevent re-renders/reloads on every keystroke
  const [localBasePay, setLocalBasePay] = useState<string | number>(userSettings?.basePay || 0);
  const [localSalaryType, setLocalSalaryType] = useState<'monthly' | 'daily'>(userSettings?.salaryType || 'monthly');
  const [localOvertimePay, setLocalOvertimePay] = useState<string | number>(userSettings?.overtimePayPerHour || 0);
  const [localStandardHours, setLocalStandardHours] = useState<string | number>(userSettings?.standardWorkingHours || 8);
  const [localBreakTime, setLocalBreakTime] = useState<string | number>(userSettings?.breakTimeMinutes || 0);
  const [localDeductBreak, setLocalDeductBreak] = useState<boolean>(userSettings?.deductBreak || false);
  const [localDefaultCheckIn, setLocalDefaultCheckIn] = useState<string>(userSettings?.defaultCheckIn || '09:00');
  const [localDefaultCheckOut, setLocalDefaultCheckOut] = useState<string>(userSettings?.defaultCheckOut || '18:00');

  const [isSaving, setIsSaving] = useState(false);

  // Sync local state when userSettings changes
  React.useEffect(() => {
    if (userSettings) {
      setLocalBasePay(prev => prev === userSettings.basePay ? prev : userSettings.basePay);
      setLocalSalaryType(prev => prev === userSettings.salaryType ? prev : (userSettings.salaryType || 'monthly'));
      setLocalOvertimePay(prev => prev === userSettings.overtimePayPerHour ? prev : userSettings.overtimePayPerHour);
      setLocalStandardHours(prev => prev === userSettings.standardWorkingHours ? prev : (userSettings.standardWorkingHours || 8));
      setLocalBreakTime(prev => prev === userSettings.breakTimeMinutes ? prev : userSettings.breakTimeMinutes);
      setLocalDeductBreak(prev => prev === userSettings.deductBreak ? prev : userSettings.deductBreak);
      setLocalDefaultCheckIn(prev => prev === (userSettings.defaultCheckIn || '09:00') ? prev : (userSettings.defaultCheckIn || '09:00'));
      setLocalDefaultCheckOut(prev => prev === (userSettings.defaultCheckOut || '18:00') ? prev : (userSettings.defaultCheckOut || '18:00'));
    }
  }, [userSettings]);

  const toHindiNumerals = (num: number | string) => {
    if (!isHindi) return num.toString();
    const hindiDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return num.toString().replace(/[0-9]/g, (w) => hindiDigits[+w]);
  };

  const normalizeNumerals = (val: string) => {
    const hindiDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return val.replace(/[०-९]/g, (w) => hindiDigits.indexOf(w).toString());
  };

  const updateSettings = async (updates: Partial<UserSettings>, silent = false) => {
    if (!silent) setIsSaving(true);
    try {
      const newSettings = {
        ...userSettings,
        ...updates,
        ownerId: user?.uid || 'local_user'
      } as UserSettings;

      // Optimistic update to local storage
      localStorage.setItem('local_settings', JSON.stringify(newSettings));
      
      // Update local state immediately via parent
      onUpdateSettings(newSettings);

      if (user) {
        // Fire and forget (let Firestore persistence handle it)
        setDoc(doc(db, 'userSettings', user.uid), newSettings, { merge: true })
          .catch(err => {
            console.error("Delayed Write Error:", err);
            toast.error("Cloud sync pending...");
          });
      }
      
      if (!silent) {
        toast.success(t('save') || "Settings updated");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'userSettings');
    } finally {
      if (!silent) setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-14 w-full max-w-4xl mx-auto px-1 sm:px-0">
      <div className="space-y-1 sm:space-y-1.5 mb-2">
        <div className="flex items-center gap-2">
          <span className="h-[2px] w-6 sm:w-8 bg-primary/40 rounded-full"></span>
          <span className="text-[11px] sm:text-xs uppercase tracking-[0.2em] font-bold text-primary">
            {t('settings')}
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold font-heading tracking-tight text-foreground">
          {t('preferences') || 'App Preferences'}
        </h2>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="bg-slate-100 dark:bg-slate-800/80 p-1 sm:p-1.5 rounded-2xl h-12 sm:h-14 w-full max-w-md mb-6 sm:mb-8">
          <TabsTrigger 
            value="general" 
            className="rounded-xl font-bold text-xs sm:text-sm h-10 sm:h-11 flex-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm transition-all"
          >
            {t('general')}
          </TabsTrigger>
          <TabsTrigger 
            value="payroll" 
            className="rounded-xl font-bold text-xs sm:text-sm h-10 sm:h-11 flex-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm transition-all"
          >
            {t('payroll_settings')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0 space-y-4 sm:space-y-6 outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Language Selector Card */}
            <div className="rounded-2xl sm:rounded-3xl p-4 sm:p-6 bg-card border border-border/50 shadow-xs flex flex-col justify-between gap-4">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Languages className="w-5 h-5 text-primary" />
                 </div>
                 <h3 className="text-base sm:text-lg font-bold font-heading">{t('language')}</h3>
              </div>
              <Select 
                value={i18n.language} 
                onValueChange={(val) => updateSettings({ language: val as 'en' | 'hi' })}
              >
                <SelectTrigger className="w-full h-11 sm:h-12 rounded-xl bg-white dark:bg-slate-900 border-border/40 shadow-xs font-semibold text-sm sm:text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/40">
                  <SelectItem value="en" className="rounded-lg">English</SelectItem>
                  <SelectItem value="hi" className="rounded-lg">हिन्दी (Hindi)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Appearance / Theme Card */}
            <div className="rounded-2xl sm:rounded-3xl p-4 sm:p-6 bg-card border border-border/50 shadow-xs flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl sm:rounded-2xl bg-secondary/15 flex items-center justify-center shrink-0">
                       {userSettings?.theme === 'dark' ? <Moon className="w-5 h-5 text-secondary" /> : <Sun className="w-5 h-5 text-amber-500" />}
                    </div>
                    <h3 className="text-base sm:text-lg font-bold font-heading">{t('appearance') || 'Appearance'}</h3>
                 </div>
                 <Switch 
                   id="theme-mode" 
                   checked={userSettings?.theme === 'dark'} 
                   onCheckedChange={(checked) => updateSettings({ theme: checked ? 'dark' : 'light' })}
                   className="scale-105"
                 />
              </div>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                {userSettings?.theme === 'dark' 
                  ? (isHindi ? 'डार्क मोड सक्रिय है। आंखों के लिए आरामदायक।' : 'Dark mode is active. Easy on the eyes.')
                  : (isHindi ? 'लाइट मोड सक्रिय है। क्रिस्प और क्लीन।' : 'Light mode is active. Crisp and clean.')
                }
              </p>
            </div>

            {/* Shift Timing Configuration */}
            <div className="col-span-1 md:col-span-2 rounded-2xl sm:rounded-3xl p-4 sm:p-7 bg-card border border-border/50 shadow-xs space-y-5 sm:space-y-6">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl sm:rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0">
                     <Clock className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold font-heading">{t('shift_config')}</h3>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('attendance_times_desc')}</p>
                  </div>
               </div>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                 <div className="space-y-2">
                   <Label className="text-xs font-bold text-muted-foreground ml-1">{t('default_check_in')}</Label>
                   <Input 
                     type="time" 
                     value={localDefaultCheckIn} 
                     onChange={(e) => setLocalDefaultCheckIn(e.target.value)}
                     className="h-11 sm:h-12 rounded-xl text-base sm:text-lg font-bold bg-white dark:bg-slate-900 shadow-xs px-3 sm:px-4 border border-border/40 focus:ring-2 ring-primary"
                   />
                   {isHindi && <p className="text-[10px] text-primary/60 font-medium ml-1">{toHindiNumerals(localDefaultCheckIn)}</p>}
                 </div>
                 <div className="space-y-2">
                   <Label className="text-xs font-bold text-muted-foreground ml-1">{t('default_check_out')}</Label>
                   <Input 
                     type="time" 
                     value={localDefaultCheckOut} 
                     onChange={(e) => setLocalDefaultCheckOut(e.target.value)}
                     className="h-11 sm:h-12 rounded-xl text-base sm:text-lg font-bold bg-white dark:bg-slate-900 shadow-xs px-3 sm:px-4 border border-border/40 focus:ring-2 ring-primary"
                   />
                   {isHindi && <p className="text-[10px] text-primary/60 font-medium ml-1">{toHindiNumerals(localDefaultCheckOut)}</p>}
                 </div>
               </div>
               
               <motion.div whileTap={{ scale: 0.98 }}>
                 <Button 
                   className="w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl text-sm sm:text-base font-bold shadow-lg shadow-primary/20 gap-2.5" 
                   disabled={isSaving}
                   onClick={() => updateSettings({
                     defaultCheckIn: localDefaultCheckIn,
                     defaultCheckOut: localDefaultCheckOut
                   })}
                 >
                   {isSaving ? (
                     <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                   ) : (
                     <Save className="w-5 h-5" />
                   )}
                   {isSaving ? (t('saving') || 'Saving...') : t('save')}
                 </Button>
               </motion.div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payroll" className="mt-0 space-y-6 outline-none">
          <div className="rounded-2xl sm:rounded-3xl p-4 sm:p-7 md:p-8 bg-card border border-border/50 shadow-xs space-y-6 sm:space-y-8">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-green-500/10 flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
               </div>
               <div>
                 <h3 className="text-lg sm:text-2xl font-bold font-heading">{t('payroll_settings')}</h3>
                 <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('payroll_reports_desc')}</p>
               </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground ml-1">{t('salary_type')}</Label>
                <Select 
                  value={localSalaryType} 
                  onValueChange={(val: any) => setLocalSalaryType(val)}
                >
                  <SelectTrigger className="h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-border/40 shadow-xs font-bold text-sm sm:text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/40">
                    <SelectItem value="monthly" className="rounded-lg font-bold">{t('monthly')}</SelectItem>
                    <SelectItem value="daily" className="rounded-lg font-bold">{t('daily')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground ml-1">
                   {localSalaryType === 'monthly' ? t('base_pay') : t('daily_wage') || 'Daily Wage'}
                </Label>
                <div className="relative">
                   <span className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 font-bold text-base sm:text-lg text-muted-foreground">₹</span>
                   <Input 
                     type="number" 
                     value={localBasePay} 
                     onChange={(e) => setLocalBasePay(normalizeNumerals(e.target.value))}
                     className="h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-border/40 shadow-xs pl-8 sm:pl-10 pr-3 sm:pr-4 text-lg sm:text-xl md:text-2xl font-bold font-heading"
                   />
                </div>
                {isHindi && <p className="text-[10px] text-primary/60 font-medium ml-1">₹{toHindiNumerals(Number(localBasePay).toLocaleString('en-IN'))}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground ml-1">{t('overtime_pay')} ({t('per_hour')})</Label>
                <div className="relative">
                   <span className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 font-bold text-base sm:text-lg text-muted-foreground">₹</span>
                   <Input 
                     type="number" 
                     value={localOvertimePay} 
                     onChange={(e) => setLocalOvertimePay(normalizeNumerals(e.target.value))}
                     className="h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-border/40 shadow-xs pl-8 sm:pl-10 pr-3 sm:pr-4 text-lg sm:text-xl md:text-2xl font-bold font-heading"
                   />
                </div>
                {isHindi && <p className="text-[10px] text-primary/60 font-medium ml-1">₹{toHindiNumerals(localOvertimePay)}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground ml-1">{t('standard_hours') || 'Standard Hours'}</Label>
                <div className="relative">
                   <span className="absolute right-3.5 sm:right-4 top-1/2 -translate-y-1/2 font-bold text-xs sm:text-sm text-muted-foreground">{t('hrs') || 'hrs'}</span>
                   <Input 
                     type="number" 
                     value={localStandardHours} 
                     onChange={(e) => setLocalStandardHours(normalizeNumerals(e.target.value))}
                     className="h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-border/40 shadow-xs pl-3 sm:pl-4 pr-12 text-lg sm:text-xl md:text-2xl font-bold font-heading"
                   />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground ml-1">{t('break_time')}</Label>
                <div className="relative">
                   <span className="absolute right-3.5 sm:right-4 top-1/2 -translate-y-1/2 font-bold text-xs sm:text-sm text-muted-foreground">{t('min') || 'min'}</span>
                   <Input 
                     type="number" 
                     value={localBreakTime} 
                     onChange={(e) => setLocalBreakTime(normalizeNumerals(e.target.value))}
                     className="h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-border/40 shadow-xs pl-3 sm:pl-4 pr-12 text-lg sm:text-xl md:text-2xl font-bold font-heading"
                   />
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-border/40 shadow-xs min-h-[3.25rem] sm:min-h-[3.5rem] gap-3">
                <Label htmlFor="deduct-break-user" className="text-xs sm:text-sm font-bold text-foreground cursor-pointer">{t('deduct_break')}</Label>
                <Switch 
                  id="deduct-break-user" 
                  checked={localDeductBreak} 
                  onCheckedChange={setLocalDeductBreak}
                />
              </div>
            </div>
            
            <Separator className="my-6 sm:my-8 bg-border/40" />
            
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button 
                className="w-full h-12 sm:h-15 rounded-xl sm:rounded-2xl text-base sm:text-lg font-bold shadow-xl shadow-primary/25 gap-3" 
                disabled={isSaving}
                onClick={() => updateSettings({
                  basePay: Number(localBasePay) || 0,
                  salaryType: localSalaryType,
                  overtimePayPerHour: Number(localOvertimePay) || 0,
                  standardWorkingHours: Number(localStandardHours) || 8,
                  breakTimeMinutes: Number(localBreakTime) || 0,
                  deductBreak: localDeductBreak
                })}
              >
                {isSaving ? (
                  <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 sm:border-3 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-5 h-5 sm:w-6 sm:h-6" />
                )}
                {isSaving ? (t('saving') || 'Saving...') : t('save')}
              </Button>
            </motion.div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
