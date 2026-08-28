import { Request } from 'express';
import { SOSStatus, WellnessStatus, NotificationType } from '../constants/enums';

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash?: string | null;
  phone?: string | null;
  firebase_uid?: string | null;
  auth_provider?: string;
  provider_id?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface PasswordReset {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  used_at?: string | null;
  created_at?: string;
}

export interface UserProfile {
  id: number;
  user_id: number;
  date_of_birth?: string | null;
  height?: number | null;
  weight?: number | null;
  blood_group?: string | null;
  emergency_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MenstrualCycle {
  id: number;
  user_id: number;
  last_period_date: string;
  cycle_length: number;
  period_length: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CyclePrediction {
  id: number;
  user_id: number;
  predicted_period_date: string;
  fertile_window_start: string;
  fertile_window_end: string;
  ovulation_day: string;
  created_at?: string;
  updated_at?: string;
}

export interface Symptom {
  id: number;
  user_id: number;
  date: string;
  symptom: string;
  severity: number;
  mood?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmergencyContact {
  id: number;
  user_id: number;
  name: string;
  phone: string;
  relationship?: string | null;
  is_primary: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface SOSLog {
  id: number;
  user_id: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  battery_level?: number;
  status: SOSStatus;
  created_at?: string;
  updated_at?: string;
}

export interface AssistantChat {
  id: number;
  user_id: number;
  role: 'user' | 'assistant';
  message: string;
  timestamp: number;
  created_at?: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  title: string;
  body: string;
  type: NotificationType | string;
  is_read: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WellnessChallenge {
  id: number;
  user_id: number;
  title: string;
  status: WellnessStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
  };
  requestId?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: any[];
}
