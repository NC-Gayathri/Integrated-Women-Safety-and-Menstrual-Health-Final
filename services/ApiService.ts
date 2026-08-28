import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const DEV_HOST_IP = '10.197.106.127';
const DEV_PORT = '5000';

// Base API URL from environment or platform-based default
const getDefaultBaseUrl = () => {
  // 1. Explicit environment variable override takes highest priority
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // 2. Web development
  if (Platform.OS === 'web') {
    return `http://localhost:${DEV_PORT}/api/v1`;
  }

  // 3. Android platform (Physical device & Emulator)
  if (Platform.OS === 'android') {
    const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest?.debuggerHost;
    const debuggerHost = hostUri ? hostUri.split(':')[0] : null;

    if (debuggerHost === 'localhost' || debuggerHost === '127.0.0.1') {
      // Android Emulator host loopback
      return `http://10.0.2.2:${DEV_PORT}/api/v1`;
    }

    if (debuggerHost) {
      return `http://${debuggerHost}:${DEV_PORT}/api/v1`;
    }

    // Physical Android device fallback
    return `http://${DEV_HOST_IP}:${DEV_PORT}/api/v1`;
  }

  // 4. Fallback for iOS physical devices or other environments
  return `http://${DEV_HOST_IP}:${DEV_PORT}/api/v1`;
};

const API_BASE_URL = getDefaultBaseUrl();
export const TOKEN_KEY = '@auth_jwt_token';

// Create Axios Instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // 15 seconds global timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Inject JWT Token automatically
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
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
  (error: AxiosError) => Promise.reject(error)
);

// Response Interceptor: Handle Token Expiration & Transient Retries
apiClient.interceptors.response.use(
  (response: any) => response,
  async (error: AxiosError) => {
    const originalRequest: any = error.config;

    // Handle 401 Unauthorized / Token Expiration
    if (error.response?.status === 401) {
      console.warn('Authentication token expired or invalid. Clearing session...');
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem('currentUserName');
      await AsyncStorage.removeItem('currentUserEmail');
    }

    // Automatic single retry for transient network failure
    if (!error.response && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      console.warn('Transient network failure, retrying API request...');
      return apiClient(originalRequest);
    }

    return Promise.reject(error);
  }
);

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
  },
};
