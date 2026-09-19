import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const DEV_HOST_IP = '10.43.176.127';
const DEV_PORT = '5000';

/**
 * Normalizes an API URL to ensure standard trailing /api/v1 path.
 */
const normalizeApiUrl = (url: string): string => {
  let clean = url.trim().replace(/\/+$/, '');
  if (!clean.endsWith('/api/v1')) {
    if (clean.endsWith('/api')) {
      clean = `${clean}/v1`;
    } else {
      clean = `${clean}/api/v1`;
    }
  }
  return clean;
};

/**
 * Dynamically resolves the Base API URL.
 * Priority order:
 * 1. process.env.EXPO_PUBLIC_API_URL (if provided and valid)
 * 2. Web development loopback (http://localhost:5000/api/v1)
 * 3. Metro Host URI (extracted from Expo Constants hostUri / debuggerHost)
 * 4. Configured DEV_HOST_IP fallback (10.43.176.127:5000/api/v1)
 */
export const getDefaultBaseUrl = (): string => {
  // 1. Explicit environment variable override
  if (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.trim().length > 0) {
    return normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
  }

  // 2. Web development
  if (Platform.OS === 'web') {
    return `http://localhost:${DEV_PORT}/api/v1`;
  }

  // 3. Extract active Metro bundler host if available
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).experienceUrl;

  if (typeof hostUri === 'string' && hostUri.includes(':')) {
    const rawHost = hostUri.split(':')[0].replace(/^[a-zA-Z]+:\/\//, '');
    if (rawHost && rawHost !== 'localhost' && rawHost !== '127.0.0.1') {
      return `http://${rawHost}:${DEV_PORT}/api/v1`;
    }
  }

  // 4. Android Emulator loopback check
  if (Platform.OS === 'android') {
    const debuggerHost = (Constants as any).manifest?.debuggerHost;
    if (debuggerHost === 'localhost' || debuggerHost === '127.0.0.1') {
      return `http://10.0.2.2:${DEV_PORT}/api/v1`;
    }
  }

  // 5. Default physical LAN fallback
  return `http://${DEV_HOST_IP}:${DEV_PORT}/api/v1`;
};

export const API_BASE_URL = getDefaultBaseUrl();
export const TOKEN_KEY = '@auth_jwt_token';

console.log(`[ApiService] Initialized with API_BASE_URL: ${API_BASE_URL}`);

// Create Axios Instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // 15s timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Inject JWT Token automatically + Debug Log
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const base = (config.baseURL || '').replace(/\/+$/, '');
    const path = (config.url || '').replace(/^\/+/, '');
    const fullUrl = `${base}/${path}`;
    console.log(`[API Request] ${config.method?.toUpperCase()} ${fullUrl}`);

    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error reading auth token from storage:', error);
    }
    return config;
  },
  (error: AxiosError) => {
    console.error('[API Request Config Error]', error);
    return Promise.reject(error);
  }
);

// Response Interceptor: Diagnostic Error Classification & Logging
apiClient.interceptors.response.use(
  (response: any) => {
    console.log(`[API Response] ${response.status} ${response.config?.url}`);
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest: any = error.config;
    const fullUrl = originalRequest
      ? `${(originalRequest.baseURL || '').replace(/\/+$/, '')}/${(originalRequest.url || '').replace(/^\/+/, '')}`
      : 'unknown';

    if (!error.response) {
      // Differentiate Network vs Timeout vs Host Unreachable
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.warn(`[API Timeout] Request timed out after 15s on ${originalRequest?.method?.toUpperCase()} ${fullUrl}`);
        console.warn(`Troubleshooting: Verify the backend at ${API_BASE_URL} is running and not hung.`);
      } else {
        console.warn(`[API Network Error] Could not reach backend on ${originalRequest?.method?.toUpperCase()} ${fullUrl}`);
        console.warn(`Troubleshooting Checklist:`);
        console.warn(`  1. Is the Express server running on port ${DEV_PORT}? ('npm run dev' in server/)`);
        console.warn(`  2. Are your phone and laptop connected to the SAME Wi-Fi network?`);
        console.warn(`  3. Is the configured API URL (${API_BASE_URL}) your laptop's current Wi-Fi IP?`);
        console.warn(`  4. Is Windows Firewall blocking port ${DEV_PORT}?`);
      }
    } else {
      console.warn(
        `[API Error ${error.response.status}] ${originalRequest?.method?.toUpperCase()} ${fullUrl}:`,
        error.response.data || error.message
      );

      // Handle 401 Unauthorized / Token Expiration
      if (error.response.status === 401) {
        console.warn('Authentication token expired or invalid. Clearing local session...');
        await AsyncStorage.removeItem(TOKEN_KEY);
        await AsyncStorage.removeItem('currentUserName');
        await AsyncStorage.removeItem('currentUserEmail');
      }
    }

    // Single automatic retry for transient network failure (once)
    if (!error.response && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      console.warn('Transient network failure, retrying API request once...');
      return apiClient(originalRequest);
    }

    return Promise.reject(error);
  }
);

/**
 * Startup Backend Health Check Diagnostics.
 * Pings the Express /health endpoint and logs reachability status.
 */
export const checkBackendHealth = async (): Promise<{ isReachable: boolean; status?: number; data?: any; error?: string }> => {
  const origin = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  const healthUrl = `${origin}/health`;

  console.log(`[ApiService] Running backend health diagnostic: GET ${healthUrl}`);
  try {
    const response = await axios.get(healthUrl, { timeout: 5000 });
    console.log(`[ApiService Diagnostic] Backend Health Check PASSED (HTTP ${response.status}):`, response.data);
    return { isReachable: true, status: response.status, data: response.data };
  } catch (err: any) {
    console.warn(`[ApiService Diagnostic] Backend Health Check FAILED at ${healthUrl}:`, err.message);
    return { isReachable: false, error: err.message };
  }
};

// Run health diagnostic automatically on load in development
if (__DEV__) {
  setTimeout(() => {
    checkBackendHealth().catch(() => {});
  }, 1000);
}

// Helper for saving/clearing JWT token
export const setAuthToken = async (token: string | null): Promise<void> => {
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
};

export const getAuthToken = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(TOKEN_KEY);
};

// Reusable API Service Methods
export const ApiService = {
  checkBackendHealth,

  // Authentication APIs
  auth: {
    register: async (payload: { name: string; email: string; password: string; phone?: string }) => {
      const res = await apiClient.post('/auth/register', payload);
      if (res.data?.data?.token) {
        await setAuthToken(res.data.data.token);
      }
      return res.data;
    },

    login: async (payload: { email: string; password: string }) => {
      const res = await apiClient.post('/auth/login', payload);
      if (res.data?.data?.token) {
        await setAuthToken(res.data.data.token);
      }
      return res.data;
    },

    googleLogin: async (payload: { idToken?: string; code?: string; codeVerifier?: string; redirectUri?: string }) => {
      const res = await apiClient.post('/auth/google', payload);
      if (res.data?.data?.token) {
        await setAuthToken(res.data.data.token);
      }
      return res.data;
    },

    firebaseVerify: async (payload: { idToken: string; name?: string }) => {
      const res = await apiClient.post('/auth/firebase-verify', payload);
      if (res.data?.data?.token) {
        await setAuthToken(res.data.data.token);
      }
      return res.data;
    },

    appleLogin: async (payload: { identityToken: string; name?: string }) => {
      const res = await apiClient.post('/auth/apple', payload);
      if (res.data?.data?.token) {
        await setAuthToken(res.data.data.token);
      }
      return res.data;
    },

    logout: async () => {
      try {
        await apiClient.post('/auth/logout');
      } catch (e) {
        // Ignore backend logout network errors
      } finally {
        await setAuthToken(null);
      }
    },

    getProfile: async () => {
      const res = await apiClient.get('/auth/profile');
      return res.data;
    },

    forgotPassword: async (email: string) => {
      const res = await apiClient.post('/auth/forgot-password', { email });
      return res.data;
    },

    resetPassword: async (payload: { email: string; token: string; newPassword: string }) => {
      const res = await apiClient.post('/auth/reset-password', payload);
      return res.data;
    },
  },

  // User Profile APIs
  user: {
    getMe: async () => {
      const res = await apiClient.get('/users/me');
      return res.data;
    },

    updateMe: async (payload: any) => {
      const res = await apiClient.put('/users/me', payload);
      return res.data;
    },
  },

  // Menstrual & Prediction APIs
  menstrual: {
    addCycle: async (payload: { last_period_date: string; cycle_length?: number; period_length?: number }) => {
      const res = await apiClient.post('/menstrual', payload);
      return res.data;
    },

    getCycles: async () => {
      const res = await apiClient.get('/menstrual');
      return res.data;
    },

    updateCycle: async (id: number, payload: any) => {
      const res = await apiClient.put(`/menstrual/${id}`, payload);
      return res.data;
    },

    deleteCycle: async (id: number) => {
      const res = await apiClient.delete(`/menstrual/${id}`);
      return res.data;
    },
  },

  // Symptoms APIs
  symptoms: {
    addSymptom: async (payload: { date: string; symptom: string; severity?: number; mood?: string; notes?: string }) => {
      const res = await apiClient.post('/symptoms', payload);
      return res.data;
    },

    getSymptoms: async (date?: string) => {
      const res = await apiClient.get('/symptoms', { params: { date } });
      return res.data;
    },

    updateSymptom: async (id: number, payload: any) => {
      const res = await apiClient.put(`/symptoms/${id}`, payload);
      return res.data;
    },

    deleteSymptom: async (id: number) => {
      const res = await apiClient.delete(`/symptoms/${id}`);
      return res.data;
    },
  },

  // Emergency Contact APIs
  emergency: {
    addContact: async (payload: { name: string; phone: string; relationship?: string; is_primary?: boolean }) => {
      const res = await apiClient.post('/emergency', payload);
      return res.data;
    },

    getContacts: async () => {
      const res = await apiClient.get('/emergency');
      return res.data;
    },

    updateContact: async (id: number, payload: any) => {
      const res = await apiClient.put(`/emergency/${id}`, payload);
      return res.data;
    },

    deleteContact: async (id: number) => {
      const res = await apiClient.delete(`/emergency/${id}`);
      return res.data;
    },
  },

  // SOS APIs
  sos: {
    triggerSOS: async (payload: { latitude: number; longitude: number; accuracy?: number; battery_level?: number }) => {
      const res = await apiClient.post('/sos', payload);
      return res.data;
    },

    getSOSLogs: async () => {
      const res = await apiClient.get('/sos');
      return res.data;
    },
  },

  // Assistant APIs
  assistant: {
    saveChat: async (payload: { role: 'user' | 'assistant'; message: string; timestamp?: number }) => {
      const res = await apiClient.post('/assistant/chat', payload);
      return res.data;
    },

    getHistory: async (limit: number = 50) => {
      const res = await apiClient.get('/assistant/history', { params: { limit } });
      return res.data;
    },

    deleteMessage: async (id: number) => {
      const res = await apiClient.delete(`/assistant/chat/${id}`);
      return res.data;
    },

    clearHistory: async () => {
      const res = await apiClient.delete('/assistant/history');
      return res.data;
    },
  },

  // Notifications APIs
  notifications: {
    getNotifications: async () => {
      const res = await apiClient.get('/notifications');
      return res.data;
    },

    markAsRead: async (id: number) => {
      const res = await apiClient.put(`/notifications/${id}/read`);
      return res.data;
    },
  },

  // Wellness APIs
  wellness: {
    getChallenges: async () => {
      const res = await apiClient.get('/wellness');
      return res.data;
    },

    createChallenge: async (payload: { title: string; status?: string }) => {
      const res = await apiClient.post('/wellness', payload);
      return res.data;
    },

    updateChallenge: async (id: number, status: string) => {
      const res = await apiClient.put(`/wellness/${id}`, { status });
      return res.data;
    },

    deleteChallenge: async (id: number) => {
      const res = await apiClient.delete(`/wellness/${id}`);
      return res.data;
    },
  },

  // Fitness APIs (FitMind)
  fitness: {
    getToday: async () => {
      const res = await apiClient.get('/fitness/today');
      return res.data;
    },

    getWeekTrend: async () => {
      const res = await apiClient.get('/fitness/week');
      return res.data;
    },

    saveDailyLog: async (payload: {
      date?: string;
      steps?: number;
      water_glasses?: number;
      heart_rate?: number;
      workout_completed?: boolean;
      journal?: string;
    }) => {
      const res = await apiClient.post('/fitness/log', payload);
      return res.data;
    },
  },

  // IoT Wearable APIs
  iot: {
    getDeviceStatus: async () => {
      const res = await apiClient.get('/iot/devices/status');
      return res.data;
    },

    pollEmergencies: async () => {
      const res = await apiClient.get('/iot/events/emergency-poll');
      return res.data;
    },

    acknowledgeEvent: async (eventId: number | string) => {
      const res = await apiClient.post(`/iot/events/${eventId}/ack`);
      return res.data;
    },

    pairDevice: async (payload: { deviceId: string; deviceName?: string; deviceApiKey?: string }) => {
      const res = await apiClient.post('/iot/devices/pair', payload);
      return res.data;
    },

    unpairDevice: async (deviceId: string) => {
      const res = await apiClient.delete(`/iot/devices/${deviceId}`);
      return res.data;
    },
  },
};
