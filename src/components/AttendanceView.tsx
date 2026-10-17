import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { Company, Employee, Attendance, AttendanceStatus, UserSettings } from '../types';
import { useTranslation } from 'react-i18next';
import { format, startOfMonth, endOfMonth, isSameDay, parseISO, isSameMonth } from 'date-fns';
import { hi, enUS } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Palmtree, 
  CalendarDays,
  Plus,
  Trash2,
  AlertCircle,
  Moon,
  Instagram,
  ExternalLink
} from 'lucide-react';
import { motion } from 'motion/react';

interface AttendanceViewProps {
  user: User | null;
  userSettings: UserSettings | null;
}

export default function AttendanceView({
  user,
  userSettings
}: AttendanceViewProps) {
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language === 'hi';
  const currentLocale = isHindi ? hi : enUS;

  const toHindiNumerals = (num: number | string) => {
    if (!isHindi) return num.toString();
    const hindiDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return num.toString().replace(/[0-9]/g, (w) => hindiDigits[+w]);
  };

  const [date, setDate] = useState<Date>(new Date());
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [currentRecord, setCurrentRecord] = useState<Attendance | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Back button closes dialog
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isDialogOpen) {
        setIsDialogOpen(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDialogOpen]);

  const handleOpenDialog = (d: Date) => {
    setDate(d);
    setIsDialogOpen(true);
    window.history.pushState({ dialogOpen: true }, '');
  };

  const handleCloseDialog = (open: boolean) => {
    if (!open && isDialogOpen) {
      if (window.history.state?.dialogOpen) {
        window.history.back();
      }
      setIsDialogOpen(false);
    }
  };

  const monthlyStats = React.useMemo(() => {
    const records = attendanceRecords.filter(r => isSameMonth(parseISO(r.date), date));
    const presentDays = records.filter(r => r.status === 'present').length;
    
    let totalOvertimeMinutes = 0;
    records.forEach(r => {
      if (r.status === 'present' && r.checkIn && r.checkOut) {
        const [inH, inM] = r.checkIn.split(':').map(Number);
        const [outH, outM] = r.checkOut.split(':').map(Number);
        let duration = (outH * 60 + outM) - (inH * 60 + inM);
        if (duration < 0) duration += 24 * 60; // Handle overnight shifts
        
        const recordBreak = (userSettings?.deductBreak ? userSettings.breakTimeMinutes : 0) ?? 0;
        const effectiveDuration = duration - recordBreak;
        const standardMinutes = (userSettings?.standardWorkingHours || 8) * 60;
        const overtime = Math.max(0, effectiveDuration - standardMinutes);
        totalOvertimeMinutes += overtime;
      }
    });

    return {
      presentDays,
      overtimeHours: (totalOvertimeMinutes / 60).toLocaleString('en-IN', {
        minimumFractionDigits: (totalOvertimeMinutes / 60) % 1 === 0 ? 0 : 1,
        maximumFractionDigits: 1
      })
    };
  }, [attendanceRecords, date, userSettings]);

  useEffect(() => {
    if (!user) {
      const localData = localStorage.getItem('local_attendance');
      if (localData) {
        setAttendanceRecords(JSON.parse(localData));
      } else {
        setAttendanceRecords([]);
      }
      return;
    }

    const q = query(
      collection(db, 'attendance'),
      where('ownerId', '==', user.uid),
      where('employeeId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
      setAttendanceRecords(records);
      // Sync to local storage for offline use
      localStorage.setItem('local_attendance', JSON.stringify(records));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'attendance'));

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (isDialogOpen) {
      window.history.pushState({ dialogOpen: true }, '');
    }

    const handlePopState = () => {
      if (isDialogOpen) {
        setIsDialogOpen(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDialogOpen]);

  useEffect(() => {
    const formattedDate = format(date, 'yyyy-MM-dd');
    const record = attendanceRecords.find(r => r.date === formattedDate);
    if (record) {
      setCurrentRecord(record);
      setCheckIn(record.checkIn || userSettings?.defaultCheckIn || '09:00');
      setCheckOut(record.checkOut || userSettings?.defaultCheckOut || '18:00');
      setStatus(record.status);
    } else {
      setCurrentRecord(null);
      setCheckIn(userSettings?.defaultCheckIn || '09:00');
      setCheckOut(userSettings?.defaultCheckOut || '18:00');
      setStatus('present');
    }
  }, [date, attendanceRecords, isDialogOpen]);

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveAttendance = async () => {
    const formattedDate = format(date, 'yyyy-MM-dd');
    setIsSaving(true);
    
    const data: any = {
      employeeId: user?.uid || 'local_user',
      companyId: 'personal',
      date: formattedDate,
      checkIn: status === 'present' ? (checkIn || null) : null,
      checkOut: status === 'present' ? (checkOut || null) : null,
      status,
      ownerId: user?.uid || 'local_user'
    };

    try {
      if (user) {
        if (currentRecord) {
          await updateDoc(doc(db, 'attendance', currentRecord.id), data);
          toast.success("Attendance updated");
        } else {
          await addDoc(collection(db, 'attendance'), data);
          toast.success("Attendance marked");
        }
      } else {
        const newRecords = [...attendanceRecords];
        if (currentRecord) {
          const index = newRecords.findIndex(r => r.id === currentRecord.id);
          newRecords[index] = { ...data, id: currentRecord.id };
          toast.success("Attendance updated (Local)");
        } else {
          const newRecord = { ...data, id: Date.now().toString() };
          newRecords.push(newRecord);
          toast.success("Attendance marked (Local)");
        }
        setAttendanceRecords(newRecords);
        localStorage.setItem('local_attendance', JSON.stringify(newRecords));
      }
      handleCloseDialog(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'attendance');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAttendance = async () => {
    if (!currentRecord) return;
    setIsSaving(true);
    try {
      if (user) {
        await deleteDoc(doc(db, 'attendance', currentRecord.id));
        toast.success("Attendance record deleted");
      } else {
        const newRecords = attendanceRecords.filter(r => r.id !== currentRecord.id);
        setAttendanceRecords(newRecords);
        localStorage.setItem('local_attendance', JSON.stringify(newRecords));
        toast.success("Attendance record deleted (Local)");
      }
      handleCloseDialog(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'attendance');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusIcon = (status: AttendanceStatus) => {
    switch (status) {
      case 'present': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'absent': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'leave': return <Palmtree className="w-4 h-4 text-sky-500" />;
    }
  };

  const modifiers = React.useMemo(() => ({
    present: (d: Date) => attendanceRecords.some(r => r.date === format(d, 'yyyy-MM-dd') && r.status === 'present'),
    absent: (d: Date) => attendanceRecords.some(r => r.date === format(d, 'yyyy-MM-dd') && r.status === 'absent'),
    leave: (d: Date) => attendanceRecords.some(r => r.date === format(d, 'yyyy-MM-dd') && r.status === 'leave'),
  }), [attendanceRecords]);

  const modifierStyles = React.useMemo(() => ({
    present: { 
      backgroundColor: 'rgba(34, 197, 94, 0.16)', 
      border: '1.5px solid rgba(34, 197, 94, 0.7)', 
      fontWeight: '600'
    },
    absent: { 
      backgroundColor: 'rgba(239, 68, 68, 0.16)', 
      border: '1.5px solid rgba(239, 68, 68, 0.7)', 
      fontWeight: '600'
    },
    leave: { 
      backgroundColor: 'rgba(14, 165, 233, 0.16)', 
      border: '1.5px solid rgba(14, 165, 233, 0.7)', 
      fontWeight: '600'
    },
  }), []);

  return (
    <div className="space-y-6 sm:space-y-8 pb-12 w-full max-w-5xl mx-auto">
      {/* Monthly Stats Bento Highlight */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bento-card col-span-1 p-4 sm:p-5 border-green-500/20 bg-green-500/[0.03]">
          <div className="flex items-center justify-between mb-3">
             <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
             </div>
             <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('present')}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <h3 className="text-2xl sm:text-3xl font-bold font-heading">{toHindiNumerals(monthlyStats.presentDays)}</h3>
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">{t('days')}</span>
          </div>
        </div>

        <div className="bento-card col-span-1 p-4 sm:p-5 border-amber-500/20 bg-amber-500/[0.03]">
          <div className="flex items-center justify-between mb-3">
             <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
             </div>
             <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('overtime') || 'Overtime'}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <h3 className="text-2xl sm:text-3xl font-bold font-heading">{toHindiNumerals(monthlyStats.overtimeHours)}</h3>
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">{t('hrs_ot')}</span>
          </div>
        </div>

        <div className="bento-card col-span-2 p-4 sm:p-5 border-primary/15 bg-primary/[0.03] flex flex-col justify-between">
           <div>
             <div className="flex items-center gap-2 mb-1.5">
               <CalendarDays className="w-4 h-4 text-primary" />
               <span className="text-[10px] font-bold text-primary/70 uppercase tracking-wider">{t('monthly_summary')}</span>
             </div>
             <h4 className="text-lg sm:text-xl font-bold font-heading">
                {isHindi 
                  ? `${format(date, 'MMMM', { locale: hi })} ${toHindiNumerals(format(date, 'yyyy'))}`
                  : format(date, 'MMMM yyyy', { locale: enUS })
                }
             </h4>
           </div>
           <div className="flex gap-6 mt-3">
              <div>
                 <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t('absent')}</p>
                 <p className="text-lg sm:text-xl font-bold text-red-500">{toHindiNumerals(attendanceRecords.filter(r => isSameMonth(parseISO(r.date), date) && r.status === 'absent').length)}</p>
              </div>
              <div className="border-l pl-6 border-border/40">
                 <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t('leave')}</p>
                 <p className="text-lg sm:text-xl font-bold text-sky-500">{toHindiNumerals(attendanceRecords.filter(r => isSameMonth(parseISO(r.date), date) && r.status === 'leave').length)}</p>
              </div>
           </div>
        </div>
      </div>

      {/* Main Calendar View */}
      <Card className="glass-card rounded-2xl sm:rounded-3xl overflow-hidden border-border/40 shadow-sm">
        <CardContent className="p-3 sm:p-6 md:p-8">
          <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-start">
            <div className="flex-1 w-full min-w-0">
              <Calendar
                mode="single"
                selected={isDialogOpen ? date : undefined}
                onSelect={(d) => {
                  if (d) {
                    handleOpenDialog(d);
                  }
                }}
                month={date}
                onMonthChange={setDate}
                captionLayout="dropdown"
                startMonth={new Date(2020, 0)}
                endMonth={new Date(2030, 11)}
                locale={currentLocale}
                formatters={{
                  formatDay: (d) => toHindiNumerals(d.getDate()),
                  formatCaption: (d) => {
                    const month = format(d, 'LLLL', { locale: currentLocale });
                    const year = toHindiNumerals(format(d, 'yyyy'));
                    return `${month} ${year}`;
                  },
                  formatMonthDropdown: (date) => format(date, 'MMMM', { locale: currentLocale }),
                  formatYearDropdown: (date) => toHindiNumerals(format(date, 'yyyy'))
                }}
                className="w-full max-w-none 
                  [&_.rdp-month]:w-full 
                  [&_.rdp-table]:w-full [&_.rdp-table]:border-collapse
                  [&_.rdp-weekdays]:flex [&_.rdp-weekdays]:w-full [&_.rdp-weekdays]:mb-2
                  [&_.rdp-weekday]:flex-1 [&_.rdp-weekday]:text-center [&_.rdp-weekday]:text-xs sm:[&_.rdp-weekday]:text-sm [&_.rdp-weekday]:font-semibold [&_.rdp-weekday]:font-heading [&_.rdp-weekday]:text-muted-foreground [&_.rdp-weekday]:uppercase [&_.rdp-weekday]:tracking-wider [&_.rdp-weekday]:py-2
                  [&_.rdp-weeks]:flex [&_.rdp-weeks]:flex-col [&_.rdp-weeks]:gap-1 sm:[&_.rdp-weeks]:gap-1.5
                  [&_.rdp-week]:flex [&_.rdp-week]:w-full [&_.rdp-week]:gap-1 sm:[&_.rdp-week]:gap-1.5
                  [&_.rdp-cell]:flex-1 [&_.rdp-cell]:p-0
                  [&_.rdp-day]:w-full [&_.rdp-day]:h-10 sm:[&_.rdp-day]:h-13 md:[&_.rdp-day]:h-14 [&_.rdp-day]:rounded-xl sm:[&_.rdp-day]:rounded-2xl [&_.rdp-day]:font-sans [&_.rdp-day]:font-semibold [&_.rdp-day]:text-sm sm:[&_.rdp-day]:text-base md:[&_.rdp-day]:text-lg [&_.rdp-day]:tabular-nums [&_.rdp-day]:transition-all [&_.rdp-day]:duration-150 [&_.rdp-day]:border [&_.rdp-day]:border-transparent hover:[&_.rdp-day]:border-border/60 hover:[&_.rdp-day]:bg-primary/5
                  [&_.rdp-caption_label]:font-heading [&_.rdp-caption_label]:font-bold [&_.rdp-caption_label]:text-base sm:[&_.rdp-caption_label]:text-lg
                  [&_.rdp-nav]:mb-3 sm:[&_.rdp-nav]:mb-4"
                modifiers={modifiers}
                modifiersStyles={modifierStyles}
              />
            </div>
            
            <div className="w-full lg:w-56 xl:w-64 shrink-0 space-y-5 pt-2">
               <div>
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Legend</h4>
                  <div className="grid grid-cols-3 lg:grid-cols-1 gap-2 sm:gap-3">
                    <div className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-green-500/5 border border-green-500/20">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                      <span className="text-xs font-semibold">{t('present')}</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-red-500/5 border border-red-500/20">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                      <span className="text-xs font-semibold">{t('absent')}</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-sky-500/5 border border-sky-500/20">
                      <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
                      <span className="text-xs font-semibold">{t('leave')}</span>
                    </div>
                  </div>
               </div>
               
               <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-primary/5 border border-primary/10">
                  <p className="text-[10px] font-bold text-primary/70 uppercase mb-1.5 tracking-wider">{t('tip') || 'Quick Tip'}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                    {isHindi 
                      ? 'हाजिरी लगाने के लिए कैलेंडर पर किसी भी तारीख पर क्लिक करें।' 
                      : 'Tap on any date in the calendar to mark your attendance.'}
                  </p>
               </div>

               {/* Creator & Instagram Connect Card */}
               <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-pink-500/5 via-primary/5 to-amber-500/5 border border-pink-500/20 space-y-3">
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                    Connect with the developer on Instagram for updates and support.
                  </p>

                  <a 
                    href="https://www.instagram.com/aakashgupta2054"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 text-white text-xs font-bold shadow-xs hover:shadow-md hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Instagram className="w-3.5 h-3.5" />
                    <span>Follow on Instagram</span>
                    <ExternalLink className="w-3 h-3 opacity-75" />
                  </a>
               </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lotus & Hare Krishna blessing */}
      <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground/75 font-medium">
        <span className="text-base select-none" role="img" aria-label="Lotus">🪷</span>
        <span className="tracking-wide">Hare Krishna</span>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-[480px] rounded-3xl border-border/40 glass-card p-5 sm:p-6">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-2xl sm:text-3xl font-bold font-heading">
              {toHindiNumerals(format(date, 'd MMMM', { locale: currentLocale }))}
              <span className="text-muted-foreground ml-2 text-base sm:text-lg font-normal">{toHindiNumerals(format(date, 'yyyy'))}</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm font-medium">{t('attendance')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div className="space-y-3">
              <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground ml-1">{t('status')}</Label>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {(['present', 'absent', 'leave'] as AttendanceStatus[]).map((s) => (
                  <motion.div key={s} whileTap={{ scale: 0.97 }} className="w-full">
                    <Button
                      variant={status === s ? 'default' : 'outline'}
                      className={`w-full justify-center gap-2 h-12 rounded-xl sm:rounded-2xl border transition-all duration-200 text-xs sm:text-sm ${
                        status === s 
                         ? 'shadow-lg shadow-primary/20 border-primary font-bold' 
                         : 'hover:bg-primary/5 border-border/40 bg-slate-100/50 dark:bg-slate-800/50 font-medium'
                      }`}
                      onClick={() => setStatus(s)}
                    >
                      {getStatusIcon(s)}
                      <span className="truncate">{t(s)}</span>
                    </Button>
                  </motion.div>
                ))}
              </div>
            </div>

            {(status === 'present') && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 sm:p-5 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border border-border/20"
              >
                <div className="space-y-3">
                  <Label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <Clock className="w-4 h-4 text-primary/60" /> {t('check_in')}
                  </Label>
                  <Input 
                    type="time" 
                    value={checkIn} 
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="h-12 rounded-xl text-lg font-bold border-none bg-white dark:bg-slate-900 shadow-sm px-4 focus:ring-2 ring-primary"
                  />
                  {checkIn && isHindi && <p className="text-[10px] text-primary/60 font-medium">{toHindiNumerals(checkIn)}</p>}
                </div>
                <div className="space-y-3">
                  <Label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <Clock className="w-4 h-4 text-primary/60" /> {t('check_out')}
                  </Label>
                  <Input 
                    type="time" 
                    value={checkOut} 
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="h-12 rounded-xl text-lg font-bold border-none bg-white dark:bg-slate-900 shadow-sm px-4 focus:ring-2 ring-primary"
                  />
                  {checkOut && isHindi && <p className="text-[10px] text-primary/60 font-medium">{toHindiNumerals(checkOut)}</p>}
                </div>
              </motion.div>
            )}

            {currentRecord?.isLate && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-4 text-amber-900 dark:text-amber-200">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-6 h-6 text-amber-500" />
                </div>
                <span className="text-sm font-bold">{t('late')}</span>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-4 mt-8">
            {currentRecord && (
              <motion.div whileTap={{ scale: 0.95 }} className="w-full sm:w-auto">
                <Button 
                  variant="ghost" 
                  onClick={handleDeleteAttendance} 
                  disabled={isSaving}
                  className="w-full text-destructive hover:bg-destructive/10 rounded-2xl h-14 px-6 transition-colors"
                >
                  <Trash2 className="mr-2 h-5 w-5" /> {t('cancel')}
                </Button>
              </motion.div>
            )}
            <motion.div whileTap={{ scale: 0.95 }} className="flex-1">
              <Button 
                onClick={handleSaveAttendance} 
                className="w-full h-14 text-lg font-bold rounded-2xl shadow-2xl shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                disabled={isSaving}
              >
                {isSaving ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full" />
                  </motion.div>
                ) : (
                  <CheckCircle2 className="mr-2 h-6 w-6" />
                )}
                <span className="ml-2">{isSaving ? (t('saving') || 'Saving...') : t('mark_done')}</span>
              </Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
