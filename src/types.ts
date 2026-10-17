export type AttendanceStatus = 'present' | 'absent' | 'leave';

export interface Company {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  name: string;
  companyId: string;
  basePay: number;
  salaryType: 'monthly' | 'daily';
  overtimePayPerHour: number;
  breakTimeMinutes: number;
  deductBreak: boolean;
  lateThreshold: string; // HH:mm
  ownerId: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  companyId: string;
  date: string; // YYYY-MM-DD
  checkIn?: string;
  checkOut?: string;
  status: AttendanceStatus;
  ownerId: string;
}

export interface UserSettings {
  language: 'en' | 'hi';
  theme: 'light' | 'dark';
  ownerId: string;
  basePay: number;
  salaryType: 'monthly' | 'daily';
  overtimePayPerHour: number;
  standardWorkingHours: number;
  breakTimeMinutes: number;
  deductBreak: boolean;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
}
