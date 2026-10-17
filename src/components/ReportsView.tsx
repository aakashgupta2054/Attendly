import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { Company, Employee, Attendance, UserSettings } from '../types';
import { useTranslation } from 'react-i18next';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  parseISO,
  differenceInMinutes
} from 'date-fns';
import { hi, enUS } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { 
  Download, 
  FileSpreadsheet, 
  PieChart as PieChartIcon, 
  Table as TableIcon, 
  Wallet,
  ChevronDown,
  Calendar,
  Clock,
  Layers,
  Printer,
  Copy,
  CheckCircle2,
  X,
  FileText,
  Building,
  UserCheck,
  Share2
} from 'lucide-react';
import { toast } from 'sonner';

interface ReportsViewProps {
  user: User | null;
  userSettings: UserSettings | null;
}

export default function ReportsView({
  user,
  userSettings
}: ReportsViewProps) {
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language === 'hi';

  const toHindiNumerals = (num: number | string) => {
    if (!isHindi) return num.toString();
    const hindiDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return num.toString().replace(/[0-9]/g, (w) => hindiDigits[+w]);
  };

  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

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

  const formatCurrency = (amount: number) => {
    const formatted = amount.toLocaleString('en-IN', {
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
    return `₹${toHindiNumerals(formatted)}`;
  };

  const currentMonthRecords = useMemo(() => {
    return attendanceRecords.filter(r => isSameMonth(parseISO(r.date), selectedMonth));
  }, [attendanceRecords, selectedMonth]);

  const stats = useMemo(() => {
    const counts = { present: 0, absent: 0, leave: 0 };
    const daysInMonthForCalculation = 30;
    
    // Calculate daily base rate based on salary type
    const dailyBaseRate = userSettings?.salaryType === 'daily' 
      ? (userSettings?.basePay || 0) 
      : (userSettings?.basePay || 0) / daysInMonthForCalculation;

    const standardMinutes = (userSettings?.standardWorkingHours || 8) * 60;
    let totalOvertimeMinutes = 0;

    const dailyBreakdown = currentMonthRecords.map(r => {
      let overtimeMinutes = 0;
      let duration = 0;
      if (r.status === 'present' && r.checkIn && r.checkOut) {
        const [inH, inM] = r.checkIn.split(':').map(Number);
        const [outH, outM] = r.checkOut.split(':').map(Number);
        duration = (outH * 60 + outM) - (inH * 60 + inM);
        if (duration < 0) duration += 24 * 60; // Handle overnight shifts
        
        const recordBreak = (userSettings?.deductBreak ? userSettings.breakTimeMinutes : 0) ?? 0;
        const effectiveDuration = duration - recordBreak;
        overtimeMinutes = Math.max(0, effectiveDuration - standardMinutes);
        totalOvertimeMinutes += overtimeMinutes;
      }

      // Calculate pay for this specific record
      const isPaid = r.status === 'present' || r.status === 'leave';
      const dailyBase = isPaid ? dailyBaseRate : 0;
      const dailyOvertime = (overtimeMinutes / 60) * (userSettings?.overtimePayPerHour || 0);

      return {
        ...r,
        durationMinutes: duration,
        overtimeMinutes,
        dailyBase: Number(dailyBase.toFixed(2)),
        dailyOvertime: Number(dailyOvertime.toFixed(2)),
        dailyTotal: Number((dailyBase + dailyOvertime).toFixed(2))
      };
    });

    currentMonthRecords.forEach(r => {
      if (counts.hasOwnProperty(r.status)) {
        counts[r.status as keyof typeof counts]++;
      }
    });

    // Totals should be the sum of daily values for consistency
    const totalBasePay = dailyBreakdown.reduce((acc, curr) => acc + curr.dailyBase, 0);
    const totalOvertimePayFromBreakdown = dailyBreakdown.reduce((acc, curr) => acc + curr.dailyOvertime, 0);
    const totalPay = totalBasePay + totalOvertimePayFromBreakdown;
    const paidDays = counts.present + counts.leave;

    return { 
      counts, 
      overtimePay: Number(totalOvertimePayFromBreakdown.toFixed(2)), 
      basePay: Number(totalBasePay.toFixed(2)), 
      totalPay: Number(totalPay.toFixed(2)), 
      paidDays,
      totalOvertimeHours: totalOvertimeMinutes / 60,
      dailyBreakdown 
    };
  }, [currentMonthRecords, userSettings, selectedMonth]);

  const pieData = [
    { name: t('present'), value: stats.counts.present, color: '#22c55e' },
    { name: t('absent'), value: stats.counts.absent, color: '#ef4444' },
    { name: t('leave'), value: stats.counts.leave, color: '#0ea5e9' }, // Updated to blue as per previous UX change
  ].filter(d => d.value > 0);

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExportMenuOpen(false);
        setShowPrintModal(false);
      }
    };
    if (isExportMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportMenuOpen]);

  const downloadBlob = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 1. Full Audit Payroll & Attendance CSV
  const exportFullPayrollCSV = () => {
    const employeeName = user?.displayName || 'Personal Account';
    const monthStr = format(selectedMonth, 'MMMM yyyy');
    const generatedAt = new Date().toLocaleString();

    const metadata = [
      ["ATTENDLY WORKFORCE PLATFORM", "OFFICIAL PAYROLL & ATTENDANCE RECORD"],
      ["Account Name", `"${employeeName}"`],
      ["Reporting Period", `"${monthStr}"`],
      ["Generated At", `"${generatedAt}"`],
      ["Salary Type", `"${userSettings?.salaryType === 'daily' ? 'Daily Wage' : 'Monthly Salary'}"`],
      ["Base Salary / Rate (INR)", userSettings?.basePay || 0],
      ["Overtime Rate (INR/hour)", userSettings?.overtimePayPerHour || 0],
      ["Standard Daily Hours", userSettings?.standardWorkingHours || 8],
      []
    ];

    const headers = [
      "Date",
      "Day",
      "Attendance Status",
      "Check-In",
      "Check-Out",
      "Gross Work (HH:MM)",
      "Break Deducted (Mins)",
      "Net Active Work (HH:MM)",
      "Overtime (HH:MM)",
      "Daily Base Pay (INR)",
      "Daily Overtime Pay (INR)",
      "Net Daily Compensation (INR)"
    ];

    const rows = stats.dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date)).map(r => {
      const recordDate = parseISO(r.date);
      const dayName = format(recordDate, 'EEEE');
      const grossH = Math.floor(r.durationMinutes / 60);
      const grossM = r.durationMinutes % 60;
      const breakM = (userSettings?.deductBreak ? (userSettings.breakTimeMinutes || 0) : 0);
      const activeM = Math.max(0, r.durationMinutes - breakM);
      const actH = Math.floor(activeM / 60);
      const actRemM = activeM % 60;
      const otH = Math.floor(r.overtimeMinutes / 60);
      const otM = r.overtimeMinutes % 60;

      return [
        `"${r.date}"`,
        `"${dayName}"`,
        `"${t(r.status)}"`,
        `"${r.checkIn || '-'}"`,
        `"${r.checkOut || '-'}"`,
        r.durationMinutes > 0 ? `"${grossH}h ${grossM}m"` : `"-"`,
        userSettings?.deductBreak ? breakM : 0,
        activeM > 0 ? `"${actH}h ${actRemM}m"` : `"-"`,
        r.overtimeMinutes > 0 ? `"${otH}h ${otM}m"` : `"-"`,
        r.dailyBase.toFixed(2),
        r.dailyOvertime.toFixed(2),
        r.dailyTotal.toFixed(2)
      ];
    });

    const totalRow = [
      `"TOTAL SUMMARY"`,
      `"-"`,
      `"Present: ${stats.counts.present} | Absent: ${stats.counts.absent} | Leave: ${stats.counts.leave}"`,
      `"-"`,
      `"-"`,
      `"-"`,
      `"-"`,
      `"-"`,
      `"${stats.totalOvertimeHours.toFixed(1)} hrs"`,
      stats.basePay.toFixed(2),
      stats.overtimePay.toFixed(2),
      stats.totalPay.toFixed(2)
    ];

    const csvContent = metadata.map(m => m.join(",")).join("\n") +
      headers.join(",") + "\n" +
      rows.map(e => e.join(",")).join("\n") + "\n" +
      totalRow.join(",");

    downloadBlob(csvContent, `attendly_payroll_statement_${format(selectedMonth, 'MMM_yyyy')}.csv`, 'text/csv;charset=utf-8;');
    toast.success(isHindi ? "विस्तृत पेरोल रिपोर्ट सफलतापूर्वक डाउनलोड हो गई" : "Full payroll report downloaded successfully");
  };

  // 2. Shift Audit & Timestamp Log CSV
  const exportShiftAuditCSV = () => {
    const headers = [
      "Date",
      "Day",
      "Status",
      "Shift Start",
      "Shift End",
      "Duration (Minutes)",
      "Break Deduction (Minutes)",
      "Net Work (Minutes)",
      "Overtime Logged (Minutes)",
      "Compliance Note"
    ];

    const rows = stats.dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date)).map(r => {
      const recordDate = parseISO(r.date);
      const dayName = format(recordDate, 'EEEE');
      const breakM = (userSettings?.deductBreak ? (userSettings.breakTimeMinutes || 0) : 0);
      const netM = Math.max(0, r.durationMinutes - breakM);
      const note = r.status === 'present' 
        ? (r.overtimeMinutes > 0 ? 'Overtime Completed' : 'Standard Shift')
        : (r.status === 'leave' ? 'Approved Leave' : 'Absence Logged');

      return [
        `"${r.date}"`,
        `"${dayName}"`,
        `"${t(r.status)}"`,
        `"${r.checkIn || '-'}"`,
        `"${r.checkOut || '-'}"`,
        r.durationMinutes,
        breakM,
        netM,
        r.overtimeMinutes,
        `"${note}"`
      ];
    });

    const csvContent = headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    downloadBlob(csvContent, `attendly_shift_audit_log_${format(selectedMonth, 'MMM_yyyy')}.csv`, 'text/csv;charset=utf-8;');
    toast.success(isHindi ? "शिफ्ट ऑडिट लॉग डाउनलोड हो गया" : "Shift audit log downloaded successfully");
  };

  // 3. Monthly Performance KPI Summary CSV
  const exportMonthlySummaryCSV = () => {
    const totalLogged = currentMonthRecords.length;
    const complianceRate = totalLogged > 0 
      ? ((stats.counts.present / totalLogged) * 100).toFixed(1) 
      : '0';

    const lines = [
      ["EXECUTIVE MONTHLY KPI SUMMARY", "ATTENDLY ENTERPRISE"],
      ["Reporting Period", `"${format(selectedMonth, 'MMMM yyyy')}"`],
      ["Account / Employee", `"${user?.displayName || 'Personal'}"`],
      [],
      ["Performance Metric", "Value", "Notes / Unit"],
      ["Total Logged Days", totalLogged, "Calendar work days recorded"],
      ["Days Present", stats.counts.present, "Physically present shifts"],
      ["Days Absent", stats.counts.absent, "Unexcused non-attendance"],
      ["Approved Leaves", stats.counts.leave, "Official leaves"],
      ["Attendance Compliance Rate", `${complianceRate}%`, "Present / Total recorded"],
      ["Total Overtime Hours", stats.totalOvertimeHours.toFixed(1), "Hours logged beyond standard"],
      ["Configured Salary Basis", userSettings?.salaryType === 'daily' ? "Daily Wage" : "Monthly Salary", "Payroll model"],
      ["Earned Base Pay", `INR ${stats.basePay.toFixed(2)}`, "Base compensation"],
      ["Overtime Compensation", `INR ${stats.overtimePay.toFixed(2)}`, "Overtime earnings"],
      ["Total Net Compensation", `INR ${stats.totalPay.toFixed(2)}`, "Gross net payable amount"]
    ];

    const csvContent = lines.map(l => l.join(",")).join("\n");
    downloadBlob(csvContent, `attendly_monthly_kpi_summary_${format(selectedMonth, 'MMM_yyyy')}.csv`, 'text/csv;charset=utf-8;');
    toast.success(isHindi ? "कार्यकारी मासिक KPI सारांश डाउनलोड हो गया" : "Executive monthly summary downloaded successfully");
  };

  // 4. Copy Formatted Summary to Clipboard
  const copySummaryToClipboard = async () => {
    const monthName = format(selectedMonth, 'MMMM yyyy');
    const totalLogged = currentMonthRecords.length;
    const complianceRate = totalLogged > 0 
      ? ((stats.counts.present / totalLogged) * 100).toFixed(1) 
      : '0';

    const text = `📊 ATTENDLY EXECUTIVE MONTHLY REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Account: ${user?.displayName || 'Personal'}
📅 Period: ${monthName}

📈 ATTENDANCE METRICS
• Total Recorded Days: ${totalLogged}
• Present Days: ${stats.counts.present}
• Absent Days: ${stats.counts.absent}
• On Leave Days: ${stats.counts.leave}
• Attendance Rate: ${complianceRate}%
• Total Overtime: ${stats.totalOvertimeHours.toFixed(1)} hrs

💰 PAYROLL & COMPENSATION
• Earned Base Pay: ₹${stats.basePay.toLocaleString('en-IN')}
• Overtime Pay: ₹${stats.overtimePay.toLocaleString('en-IN')}
• Net Total Payable: ₹${stats.totalPay.toLocaleString('en-IN')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated via Attendly • ${new Date().toLocaleDateString()}`;

    try {
      await navigator.clipboard.writeText(text);
      toast.success(isHindi ? "मासिक सारांश क्लिपबोर्ड पर कॉपी किया गया" : "Executive summary copied to clipboard");
    } catch {
      toast.error("Failed to copy summary to clipboard");
    }
  };

  // 5. Download Standalone HTML Statement
  const downloadHTMLStatement = () => {
    const monthStr = format(selectedMonth, 'MMMM yyyy');
    const accountName = user?.displayName || 'Personal Account';
    const issueDate = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Attendly Statement - ${monthStr}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #0f172a; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px; }
    .title { font-size: 24px; font-weight: 800; color: #2563eb; }
    .subtitle { font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 30px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
    .card-title { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px; }
    .card-value { font-size: 20px; font-weight: 800; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 12px; }
    th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-weight: 700; color: #475569; border-bottom: 2px solid #cbd5e1; }
    td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; }
    .text-right { text-align: right; }
    .status-badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 10px; text-transform: uppercase; }
    .status-present { background: #dcfce7; color: #166534; }
    .status-absent { background: #fee2e2; color: #991b1b; }
    .status-leave { background: #e0f2fe; color: #075985; }
    .signatures { display: flex; justify-content: space-between; margin-top: 60px; padding-top: 20px; border-top: 1px dashed #cbd5e1; }
    .sign-box { width: 200px; text-align: center; border-top: 1px solid #0f172a; padding-top: 8px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">ATTENDLY</div>
      <div class="subtitle">Official Attendance & Payroll Statement</div>
    </div>
    <div style="text-align: right;">
      <div style="font-weight: 700;">Period: ${monthStr}</div>
      <div style="font-size: 12px; color: #64748b;">Issued on: ${issueDate}</div>
    </div>
  </div>

  <div style="margin-bottom: 20px;">
    <strong>Account / Employee:</strong> ${accountName} &nbsp;|&nbsp; 
    <strong>Salary Model:</strong> ${userSettings?.salaryType === 'daily' ? 'Daily Wage' : 'Monthly Salary'} &nbsp;|&nbsp; 
    <strong>Base Salary:</strong> ₹${(userSettings?.basePay || 0).toLocaleString('en-IN')}
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Days Present</div>
      <div class="card-value">${stats.counts.present}</div>
    </div>
    <div class="card">
      <div class="card-title">Total Overtime</div>
      <div class="card-value">${stats.totalOvertimeHours.toFixed(1)} hrs</div>
    </div>
    <div class="card">
      <div class="card-title">Earned Base Pay</div>
      <div class="card-value">₹${stats.basePay.toLocaleString('en-IN')}</div>
    </div>
    <div class="card" style="background: #eff6ff; border-color: #bfdbfe;">
      <div class="card-title" style="color: #1d4ed8;">Net Total Payable</div>
      <div class="card-value" style="color: #1d4ed8;">₹${stats.totalPay.toLocaleString('en-IN')}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Status</th>
        <th>Check-In</th>
        <th>Check-Out</th>
        <th>Work Duration</th>
        <th class="text-right">Base Pay</th>
        <th class="text-right">Overtime Pay</th>
        <th class="text-right">Total Pay</th>
      </tr>
    </thead>
    <tbody>
      ${stats.dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date)).map(r => `
        <tr>
          <td><strong>${r.date}</strong></td>
          <td><span class="status-badge status-${r.status}">${r.status}</span></td>
          <td>${r.checkIn || '--:--'}</td>
          <td>${r.checkOut || '--:--'}</td>
          <td>${r.durationMinutes > 0 ? `${Math.floor(r.durationMinutes/60)}h ${r.durationMinutes%60}m` : '--'}</td>
          <td class="text-right">₹${r.dailyBase.toFixed(2)}</td>
          <td class="text-right">₹${r.dailyOvertime.toFixed(2)}</td>
          <td class="text-right"><strong>₹${r.dailyTotal.toFixed(2)}</strong></td>
        </tr>
      `).join('')}
      <tr style="background: #f8fafc; font-weight: 800; border-top: 2px solid #cbd5e1;">
        <td colspan="5">TOTAL NET PAYABLE</td>
        <td class="text-right">₹${stats.basePay.toFixed(2)}</td>
        <td class="text-right">₹${stats.overtimePay.toFixed(2)}</td>
        <td class="text-right">₹${stats.totalPay.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="signatures">
    <div class="sign-box">Employee Signature</div>
    <div class="sign-box">Authorized Signatory / HR</div>
  </div>
</body>
</html>`;

    downloadBlob(htmlContent, `attendly_statement_${format(selectedMonth, 'MMM_yyyy')}.html`, 'text/html;charset=utf-8;');
    toast.success(isHindi ? "HTML स्टेटमेंट डाउनलोड हो गया" : "HTML Statement downloaded");
  };

  // Generate a clean, stable list of past months (24 months)
  const monthOptions = useMemo(() => {
    const list: { key: string; label: string; date: Date }[] = [];
    const now = new Date();
    const currentKey = format(selectedMonth, 'yyyy-MM');
    let hasSelected = false;

    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = format(d, 'yyyy-MM');
      if (key === currentKey) hasSelected = true;
      const label = isHindi 
        ? `${format(d, 'MMMM', { locale: hi })} ${toHindiNumerals(format(d, 'yyyy'))}`
        : format(d, 'MMMM yyyy', { locale: enUS });
      list.push({ key, label, date: d });
    }

    if (!hasSelected) {
      const label = isHindi 
        ? `${format(selectedMonth, 'MMMM', { locale: hi })} ${toHindiNumerals(format(selectedMonth, 'yyyy'))}`
        : format(selectedMonth, 'MMMM yyyy', { locale: enUS });
      list.unshift({ key: currentKey, label, date: selectedMonth });
    }

    return list;
  }, [isHindi, selectedMonth]);

  const selectedMonthKey = format(selectedMonth, 'yyyy-MM');
  const selectedMonthDisplay = isHindi 
    ? `${format(selectedMonth, 'MMMM', { locale: hi })} ${toHindiNumerals(format(selectedMonth, 'yyyy'))}`
    : format(selectedMonth, 'MMMM yyyy', { locale: enUS });

  return (
    <div className="space-y-8 pb-10">
      {/* Header with Professional Reporting Period & Export Dropdown */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
           <div className="flex items-center gap-3 mb-2">
              <span className="h-[1px] w-8 bg-primary/30"></span>
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary/60">{user?.displayName || 'Personal'}</span>
           </div>
           <h2 className="text-3xl font-bold font-heading">{t('reports')}</h2>
        </div>
        
        {/* Professional Controls: Reporting Period & Export Dropdown */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          {/* Month Selector */}
          <div className="flex-1 sm:flex-initial min-w-[200px]">
            <Select 
              value={selectedMonthKey} 
              onValueChange={(val) => {
                if (!val) return;
                const [yearStr, monthStr] = val.split('-');
                setSelectedMonth(new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1));
              }}
            >
              <SelectTrigger className="w-full sm:w-[230px] h-12 rounded-2xl bg-white dark:bg-slate-900 border-border/50 shadow-xs font-semibold px-4 flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Calendar className="w-4 h-4 text-primary shrink-0" />
                  <SelectValue>
                    {selectedMonthDisplay}
                  </SelectValue>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-border/50 shadow-xl max-h-72">
                {monthOptions.map(({ key, label }) => (
                  <SelectItem key={key} value={key} className="rounded-xl py-2 cursor-pointer font-medium">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Professional Export Dropdown Menu with Categorized Sections */}
          <div className="relative flex-1 sm:flex-initial" ref={exportMenuRef}>
            <Button 
              onClick={() => setIsExportMenuOpen(prev => !prev)}
              className="h-12 w-full sm:w-auto px-5 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 flex items-center justify-between sm:justify-center gap-2.5 transition-all active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 shrink-0" />
                <span>{t('export_reports')}</span>
              </div>
              <ChevronDown className={`w-4 h-4 opacity-80 transition-transform duration-200 ${isExportMenuOpen ? 'rotate-180' : ''}`} />
            </Button>

            {/* Categorized Dropdown Menu */}
            {isExportMenuOpen && (
              <div className="absolute right-0 sm:right-0 left-0 sm:left-auto mt-2 w-full sm:w-[400px] rounded-3xl bg-white dark:bg-slate-900 border border-border/60 shadow-2xl shadow-black/15 dark:shadow-black/40 z-50 p-3.5 backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-150">
                {/* Dropdown Header Badge */}
                <div className="px-3.5 py-2.5 mb-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-border/30 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      {t('export_format')}
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      {isHindi 
                        ? `${format(selectedMonth, 'MMMM', { locale: hi })} ${toHindiNumerals(format(selectedMonth, 'yyyy'))}`
                        : format(selectedMonth, 'MMMM yyyy')
                      }
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                    {toHindiNumerals(currentMonthRecords.length)} {isHindi ? 'रिकॉर्ड' : 'records'}
                  </span>
                </div>

                {/* Section 1: Spreadsheet Formats */}
                <div className="mb-2.5">
                  <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">
                    {t('spreadsheet_exports')}
                  </span>
                  <div className="space-y-1.5 mt-1">
                    <button
                      onClick={() => {
                        exportFullPayrollCSV();
                        setIsExportMenuOpen(false);
                      }}
                      className="w-full text-left p-2.5 rounded-2xl hover:bg-emerald-500/10 dark:hover:bg-emerald-500/15 transition-all group flex items-start gap-3 cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {t('full_payroll_csv')}
                          </span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            .CSV
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {t('full_payroll_csv_desc')}
                        </p>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        exportShiftAuditCSV();
                        setIsExportMenuOpen(false);
                      }}
                      className="w-full text-left p-2.5 rounded-2xl hover:bg-blue-500/10 dark:hover:bg-blue-500/15 transition-all group flex items-start gap-3 cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {t('shift_audit_csv')}
                          </span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            .CSV
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {t('shift_audit_csv_desc')}
                        </p>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        exportMonthlySummaryCSV();
                        setIsExportMenuOpen(false);
                      }}
                      className="w-full text-left p-2.5 rounded-2xl hover:bg-purple-500/10 dark:hover:bg-purple-500/15 transition-all group flex items-start gap-3 cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                            {t('monthly_summary_csv')}
                          </span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                            .CSV
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {t('monthly_summary_csv_desc')}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border/40 my-2" />

                {/* Section 2: Documents & Summaries */}
                <div>
                  <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">
                    {t('document_exports')}
                  </span>
                  <div className="space-y-1.5 mt-1">
                    <button
                      onClick={() => {
                        setShowPrintModal(true);
                        setIsExportMenuOpen(false);
                      }}
                      className="w-full text-left p-2.5 rounded-2xl hover:bg-amber-500/10 dark:hover:bg-amber-500/15 transition-all group flex items-start gap-3 cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Printer className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                            {t('print_pdf_report')}
                          </span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            .PDF
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {t('print_pdf_desc')}
                        </p>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        copySummaryToClipboard();
                        setIsExportMenuOpen(false);
                      }}
                      className="w-full text-left p-2.5 rounded-2xl hover:bg-indigo-500/10 dark:hover:bg-indigo-500/15 transition-all group flex items-start gap-3 cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Copy className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {t('copy_summary')}
                          </span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            COPY
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {t('copy_summary_desc')}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bento-grid">
        <Card className="bento-card border-none bg-emerald-500/5 dark:bg-emerald-500/10 col-span-2 md:col-span-1">
           <p className="text-[10px] font-bold text-emerald-600/60 uppercase tracking-[0.2em] mb-4">{t('earned_base_pay') || 'Earned Base Pay'}</p>
           <h3 className="text-3xl font-bold font-heading mb-1 text-emerald-700 dark:text-emerald-400">{formatCurrency(stats.basePay)}</h3>
           <div className="flex flex-col gap-1 mt-2">
              <span className="text-[10px] text-emerald-600/70 font-medium">
                {t('based_on_salary') || 'Configured:'} {formatCurrency(userSettings?.basePay || 0)} 
                {userSettings?.salaryType === 'monthly' ? ` (${t('monthly')})` : ` (${t('daily')})`}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[10px] font-bold inline-block w-fit">
                {toHindiNumerals(stats.paidDays)} {t('paid_days') || 'Paid Days'}
              </span>
           </div>
        </Card>
        
        <Card className="bento-card border-none bg-orange-500/5 dark:bg-orange-500/10 col-span-2 md:col-span-1">
           <p className="text-[10px] font-bold text-orange-600/60 uppercase tracking-[0.2em] mb-4">{t('overtime_pay')}</p>
           <h3 className="text-3xl font-bold font-heading mb-1 text-orange-600">{formatCurrency(stats.overtimePay)}</h3>
           <div className="flex flex-col gap-1 mt-2">
              <span className="text-[10px] text-orange-600/70 font-medium">
                {t('rate') || 'Rate'}: {formatCurrency(userSettings?.overtimePayPerHour || 0)}/{t('hr') || 'hr'}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 text-[10px] font-bold inline-block w-fit">
                {toHindiNumerals(stats.totalOvertimeHours.toFixed(1))} {t('hrs') || 'hrs'} {t('overtime') || 'Overtime'}
              </span>
           </div>
        </Card>
        
        <Card className="bento-card md:col-span-2 lg:col-span-2 bg-primary dark:bg-primary/80 text-primary-foreground border-none shadow-2xl shadow-primary/20 overflow-hidden relative group">
           <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
              <Wallet className="w-24 h-24 rotate-12" />
           </div>
           <div className="relative z-10">
              <p className="text-[10px] font-bold opacity-70 uppercase tracking-[0.2em] mb-4">{t('total_pay')}</p>
              <h3 className="text-5xl font-bold font-heading mb-2">{formatCurrency(stats.totalPay)}</h3>
              <p className="text-xs opacity-70 font-medium mt-4 max-w-md leading-relaxed">
                {isHindi 
                   ? `पेरोल विवरण: ${toHindiNumerals(stats.paidDays)} दिन × ₹${toHindiNumerals((userSettings?.salaryType === 'daily' ? (userSettings?.basePay || 0) : (userSettings?.basePay || 0) / 30).toFixed(2))} + ओवरटाइम`
                   : `Calculation: ${stats.paidDays} days × ${formatCurrency(userSettings?.salaryType === 'daily' ? (userSettings?.basePay || 0) : (userSettings?.basePay || 0) / 30)} + Overtime`
                }
              </p>
           </div>
        </Card>
      </div>

      <Tabs defaultValue="graphical" className="w-full">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl h-14 w-full max-w-[440px] mb-8">
          <TabsTrigger value="graphical" className="rounded-xl font-bold text-sm h-12 gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
            <BarChart className="w-4 h-4" /> {t('graphical_view') || 'Charts'}
          </TabsTrigger>
          <TabsTrigger value="tabular" className="rounded-xl font-bold text-sm h-12 gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
            <TableIcon className="w-4 h-4" /> {t('tabular_view') || 'Table'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="graphical" className="mt-0 space-y-8 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <Card className="lg:col-span-2 glass-card rounded-[2.5rem] p-8 border-border/40">
              <CardHeader className="p-0 mb-6">
                <CardTitle className="text-xl font-bold font-heading">{t('status')}</CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[300px]">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={105}
                        paddingAngle={8}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
                        formatter={(value: any) => [toHindiNumerals(value), '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground font-medium">
                    {isHindi ? 'इस महीने के लिए कोई डेटा नहीं' : 'No data for this month'}
                  </div>
                )}
              </CardContent>
              <div className="flex justify-center gap-6 mt-4">
                 {pieData.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                       <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{item.name}</span>
                    </div>
                 ))}
              </div>
            </Card>

            <Card className="lg:col-span-3 glass-card rounded-[2.5rem] p-8 border-border/40">
              <CardHeader className="p-0 mb-6">
                <CardTitle className="text-xl font-bold font-heading">{t('monthly_report')}</CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[330px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pieData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                      tickFormatter={(val) => toHindiNumerals(val)} 
                    />
                    <Tooltip 
                       contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
                       formatter={(value: any) => [toHindiNumerals(value), '']}
                    />
                    <Bar dataKey="value" radius={[12, 12, 12, 12]} barSize={40}>
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tabular" className="mt-0 outline-none">
          <Card className="glass-card rounded-[2.5rem] border-border/40 overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
                    <TableRow className="hover:bg-transparent border-border/40">
                      <TableHead className="font-bold text-[10px] uppercase tracking-widest h-14 pl-8">{t('date')}</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-widest h-14">{t('status')}</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-widest h-14">{t('active_time') || 'Active'}</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-widest h-14">{t('check_in')}</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-widest h-14">{t('check_out')}</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-widest h-14 text-right">{t('base_pay')}</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-widest h-14 text-right">{t('overtime')}</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-widest h-14 text-right pr-8">{t('total_pay')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.dailyBreakdown.sort((a, b) => b.date.localeCompare(a.date)).map((r) => (
                      <TableRow key={r.id} className="hover:bg-primary/2 border-border/40 transition-colors">
                        <TableCell className="font-bold whitespace-nowrap pl-8 h-12">{toHindiNumerals(format(parseISO(r.date), 'dd MMM yyyy'))}</TableCell>
                        <TableCell>
                          <span className={`px-4 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider
                            ${r.status === 'present' ? 'bg-green-500/10 text-green-600' : ''}
                            ${r.status === 'absent' ? 'bg-red-500/10 text-red-600' : ''}
                            ${r.status === 'leave' ? 'bg-sky-500/10 text-sky-600' : ''}
                          `}>
                            {t(r.status)}
                          </span>
                        </TableCell>
                        <TableCell className="font-bold text-[10px] text-muted-foreground whitespace-nowrap">
                          {r.durationMinutes > 0 ? (
                            <div className="flex flex-col">
                               <span>{toHindiNumerals(Math.floor(r.durationMinutes / 60))}{t('h')} {toHindiNumerals(r.durationMinutes % 60)}{t('m')}</span>
                               {userSettings?.deductBreak && (
                                 <span className="text-[8px] text-red-400">-{toHindiNumerals(userSettings.breakTimeMinutes)}{t('m')} {t('break')}</span>
                               )}
                            </div>
                          ) : '--'}
                        </TableCell>
                        <TableCell className="font-medium text-xs">{r.checkIn ? toHindiNumerals(r.checkIn) : '--:--'}</TableCell>
                        <TableCell className="font-medium text-xs">{r.checkOut ? toHindiNumerals(r.checkOut) : '--:--'}</TableCell>
                        <TableCell className="text-right font-medium text-xs">{formatCurrency(r.dailyBase)}</TableCell>
                        <TableCell className="text-right font-medium text-xs text-orange-600">
                          {r.overtimeMinutes > 0 ? (
                            <div className="flex flex-col items-end">
                               <span>{formatCurrency(r.dailyOvertime)}</span>
                               <span className="text-[8px] opacity-60">({toHindiNumerals(Math.floor(r.overtimeMinutes / 60))}h {toHindiNumerals(r.overtimeMinutes % 60)}m)</span>
                            </div>
                          ) : formatCurrency(0)}
                        </TableCell>
                        <TableCell className="text-right font-bold pr-8 text-sm">{formatCurrency(r.dailyTotal)}</TableCell>
                      </TableRow>
                    ))}
                    {stats.dailyBreakdown.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-20 text-muted-foreground font-medium">
                          {isHindi ? 'इस महीने के लिए कोई रिकॉर्ड नहीं मिला' : 'No records found for this month'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {/* Official Attendance & Payroll Statement Modal (Print & PDF) */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl border border-border/80 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
            {/* Modal Controls Bar (Hidden during actual print) */}
            <div className="no-print p-4 sm:p-6 border-b border-border/60 bg-slate-50 dark:bg-slate-800/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg text-foreground">
                    {t('print_pdf_report')}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {format(selectedMonth, 'MMMM yyyy')} • {user?.displayName || 'Personal Account'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={downloadHTMLStatement}
                  variant="outline"
                  className="rounded-xl h-10 px-3.5 text-xs font-semibold gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .html</span>
                </Button>
                <Button
                  onClick={() => window.print()}
                  className="rounded-xl h-10 px-4 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / Save PDF</span>
                </Button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="w-10 h-10 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="p-6 sm:p-10 overflow-y-auto bg-white text-slate-900" id="printable-statement">
              {/* Document Header */}
              <div className="flex justify-between items-start border-b-2 border-slate-200 pb-6 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-2xl tracking-tight text-blue-600 font-heading">ATTENDLY</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 uppercase tracking-widest">
                      Official Audit Statement
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Enterprise Attendance & Payroll Ledger</p>
                  <p className="text-xs text-slate-400 mt-1">Ref ID: ATND-{format(selectedMonth, 'yyyyMM')}-{user?.uid?.slice(0, 6) || 'LOCAL'}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-800">
                    Period: {format(selectedMonth, 'MMMM yyyy')}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Date of Issue: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="text-xs font-semibold text-emerald-600 mt-1">
                    Status: Verified & Audit-Ready
                  </div>
                </div>
              </div>

              {/* Employee & Account Metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 mb-6 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Account / Employee</span>
                  <span className="font-bold text-slate-800 text-sm">{user?.displayName || 'Personal Account'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Salary Model</span>
                  <span className="font-semibold text-slate-700">{userSettings?.salaryType === 'daily' ? 'Daily Wage' : 'Monthly Salary'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Base Pay Configured</span>
                  <span className="font-semibold text-slate-700">₹{(userSettings?.basePay || 0).toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Overtime Rate</span>
                  <span className="font-semibold text-slate-700">₹{(userSettings?.overtimePayPerHour || 0).toLocaleString('en-IN')}/hr</span>
                </div>
              </div>

              {/* Metric Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                <div className="p-4 rounded-xl border border-slate-200 bg-emerald-50/50">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">Present Days</span>
                  <div className="text-2xl font-black text-emerald-800">{stats.counts.present} <span className="text-xs font-normal text-emerald-600">days</span></div>
                  <span className="text-[10px] text-emerald-600 font-medium">({stats.counts.leave} leaves, {stats.counts.absent} abs.)</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-orange-50/50">
                  <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wider block mb-1">Overtime Logged</span>
                  <div className="text-2xl font-black text-orange-800">{stats.totalOvertimeHours.toFixed(1)} <span className="text-xs font-normal text-orange-600">hrs</span></div>
                  <span className="text-[10px] text-orange-600 font-medium">Earned: ₹{stats.overtimePay.toFixed(2)}</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Earned Base Pay</span>
                  <div className="text-2xl font-black text-slate-800">₹{stats.basePay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  <span className="text-[10px] text-slate-500 font-medium">{stats.paidDays} eligible paid days</span>
                </div>

                <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50/60">
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block mb-1">Net Compensation</span>
                  <div className="text-2xl font-black text-blue-800">₹{stats.totalPay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  <span className="text-[10px] text-blue-600 font-medium">Grand net payable</span>
                </div>
              </div>

              {/* Itemized Records Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-8">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-2">Status</th>
                      <th className="py-2.5 px-2">Shift</th>
                      <th className="py-2.5 px-2">Duration</th>
                      <th className="py-2.5 px-2 text-right">Base Pay</th>
                      <th className="py-2.5 px-2 text-right">Overtime</th>
                      <th className="py-2.5 px-3 text-right">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date)).map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-800">{r.date}</td>
                        <td className="py-2 px-2">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase
                            ${r.status === 'present' ? 'bg-emerald-100 text-emerald-800' : ''}
                            ${r.status === 'absent' ? 'bg-rose-100 text-rose-800' : ''}
                            ${r.status === 'leave' ? 'bg-sky-100 text-sky-800' : ''}
                          `}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-slate-600">
                          {r.checkIn ? `${r.checkIn} - ${r.checkOut || 'Active'}` : '--:--'}
                        </td>
                        <td className="py-2 px-2 text-slate-600">
                          {r.durationMinutes > 0 ? `${Math.floor(r.durationMinutes / 60)}h ${r.durationMinutes % 60}m` : '--'}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-600 font-medium">₹{r.dailyBase.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right text-orange-600 font-medium">₹{r.dailyOvertime.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">₹{r.dailyTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                      <td colSpan={4} className="py-3 px-3 uppercase text-[11px] tracking-wider">Total Net Compensation</td>
                      <td className="py-3 px-2 text-right">₹{stats.basePay.toFixed(2)}</td>
                      <td className="py-3 px-2 text-right text-orange-600">₹{stats.overtimePay.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right text-blue-700 text-sm">₹{stats.totalPay.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Signatures & Certification Block */}
              <div className="grid grid-cols-2 gap-12 pt-8 border-t border-dashed border-slate-300 text-xs">
                <div>
                  <div className="h-12 border-b border-slate-400 mb-2"></div>
                  <span className="font-bold text-slate-800 block">Employee / Candidate Signature</span>
                  <span className="text-[10px] text-slate-400">I hereby certify that the hours and records above are accurate.</span>
                </div>
                <div className="text-right">
                  <div className="h-12 border-b border-slate-400 mb-2"></div>
                  <span className="font-bold text-slate-800 block">Authorized Signatory / Approver</span>
                  <span className="text-[10px] text-slate-400">Validated for payroll processing and disbursement.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
