import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { auth } from '../config/firebase';
import { ApiService, setAuthToken, getAuthToken } from './ApiService';

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  height?: number;
  weight?: number;
  blood_group?: string;
  emergency_enabled?: boolean;
}

let isGoogleSigninConfigured = false;

function ensureGoogleSigninConfigured() {
  if (Platform.OS !== 'web' && !isGoogleSigninConfigured) {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    GoogleSignin.configure({
      webClientId: webClientId || undefined,
      scopes: ['profile', 'email'],
    });
    isGoogleSigninConfigured = true;
  }
}

/**
 * Maps Firebase Auth and Google Sign-In error codes to user-friendly messages.
 */
export function getFriendlyAuthErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'The email address is invalid. Please enter a valid email.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Invalid email or password. Please verify your credentials.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'The password is too weak. Please use at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please check your internet connection.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few moments and try again.';
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is currently not enabled in Firebase Console.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case statusCodes.SIGN_IN_CANCELLED:
    case '12501':
      return 'Sign-in window was closed before completing.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups for this site.';
    case statusCodes.IN_PROGRESS:
      return 'Sign-in is already in progress.';
    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
      return 'Google Play Services are not available or out of date on this device.';
    default:
      return (
        error?.response?.data?.message ||
        error?.message ||
        'Authentication failed. Please check your connection and try again.'
      );
  }
}

export const AuthService = {
  /**
   * Register a new user with Firebase Auth, then sync with the backend to obtain Naari Kavach JWT.
   */
  register: async (name: string, email: string, password: string) => {
    // 1. Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    // 2. Set user display name in Firebase if provided
    if (name && userCredential.user) {
      try {
        await updateProfile(userCredential.user, { displayName: name });
      } catch (profileErr) {
        console.warn('Failed to update Firebase user displayName:', profileErr);
      }
    }

    // 3. Obtain Firebase ID token
    const idToken = await userCredential.user.getIdToken(true);

    // 4. Verify with backend & synchronize MySQL user
    const response = await ApiService.auth.firebaseVerify({ idToken, name });
    const user = response?.data?.user;

    // 5. Store session information locally
    if (user?.name || name) {
      await AsyncStorage.setItem('currentUserName', user?.name || name);
    }
    if (user?.email || email) {
      await AsyncStorage.setItem('currentUserEmail', user?.email || email);
    }

    return response;
  },

  /**
   * Log in user with Firebase Auth, then verify token with backend to obtain Naari Kavach JWT.
   */
  login: async (email: string, password: string) => {
    // 1. Sign in with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    // 2. Obtain Firebase ID token
    const idToken = await userCredential.user.getIdToken(true);

    // 3. Verify with backend & synchronize MySQL user
    const response = await ApiService.auth.firebaseVerify({
      idToken,
      name: userCredential.user.displayName || undefined,
    });
    const user = response?.data?.user;

    // 4. Store user session information locally
    if (user?.name || userCredential.user.displayName) {
      await AsyncStorage.setItem('currentUserName', user?.name || userCredential.user.displayName || 'User');
    }
    if (user?.email || email) {
      await AsyncStorage.setItem('currentUserEmail', user?.email || email);
    }

    return response;
  },

  /**
   * Authenticate with Google on Web using Firebase Web SDK signInWithPopup.
   */
  loginWithGoogleWeb: async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');

    // 1. Sign in with Firebase popup
    const userCredential = await signInWithPopup(auth, provider);

    // 2. Obtain verified Firebase ID token
    const firebaseIdToken = await userCredential.user.getIdToken(true);

    // 3. Verify with backend & sync MySQL user
    const response = await ApiService.auth.firebaseVerify({
      idToken: firebaseIdToken,
      name: userCredential.user.displayName || undefined,
    });
    const user = response?.data?.user;

    if (user?.name || userCredential.user.displayName) {
      await AsyncStorage.setItem('currentUserName', user?.name || userCredential.user.displayName || 'Google User');
    }
    if (user?.email || userCredential.user.email) {
      await AsyncStorage.setItem('currentUserEmail', user?.email || userCredential.user.email || '');
    }

    return response;
  },

  /**
   * Cross-platform Google Sign-In:
   * - Web: Uses Firebase Web SDK signInWithPopup
   * - Android/iOS: Uses @react-native-google-signin/google-signin to obtain Google ID Token, then signs into Firebase with credential
   */
  loginWithGoogle: async (providedGoogleIdToken?: string) => {
    // 1. Web Platform
    if (Platform.OS === 'web') {
      return await AuthService.loginWithGoogleWeb();
    }

    // 2. If token is directly passed
    let googleIdToken = providedGoogleIdToken;

    // 3. Otherwise sign in via native GoogleSignin
    if (!googleIdToken) {
      ensureGoogleSigninConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();

      if (response.type === 'cancelled') {
        return null;
      }

      googleIdToken = response.data?.idToken || undefined;
    }

    if (!googleIdToken) {
      throw new Error('Google ID token is required.');
    }

    // 4. Create Google credential & sign in with Firebase
    const credential = GoogleAuthProvider.credential(googleIdToken);
    const userCredential = await signInWithCredential(auth, credential);

    // 5. Obtain Firebase ID token
    const firebaseIdToken = await userCredential.user.getIdToken(true);

    // 6. Verify with backend & sync MySQL user
    const response = await ApiService.auth.firebaseVerify({
      idToken: firebaseIdToken,
      name: userCredential.user.displayName || undefined,
    });
    const user = response?.data?.user;

    if (user?.name || userCredential.user.displayName) {
      await AsyncStorage.setItem('currentUserName', user?.name || userCredential.user.displayName || 'Google User');
    }
    if (user?.email || userCredential.user.email) {
      await AsyncStorage.setItem('currentUserEmail', user?.email || userCredential.user.email || '');
    }

    return response;
  },

  /**
   * Authenticate with Apple Identity Token via Firebase OAuthProvider('apple.com').
   */
  loginWithApple: async (identityToken: string, rawName?: string) => {
    if (!identityToken) {
      throw new Error('Apple identity token is required.');
    }

    // 1. Create Apple credential & sign in with Firebase
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({ idToken: identityToken });
    const userCredential = await signInWithCredential(auth, credential);

    // 2. Obtain Firebase ID token
    const firebaseIdToken = await userCredential.user.getIdToken(true);

    // 3. Verify with backend & sync MySQL user
    const response = await ApiService.auth.firebaseVerify({
      idToken: firebaseIdToken,
      name: rawName || userCredential.user.displayName || undefined,
    });
    const user = response?.data?.user;

    if (user?.name || rawName) {
      await AsyncStorage.setItem('currentUserName', user?.name || rawName || 'Apple User');
    }
    if (user?.email || userCredential.user.email) {
      await AsyncStorage.setItem('currentUserEmail', user?.email || userCredential.user.email || '');
    }

    return response;
  },

  /**
   * Send password reset email directly via Firebase.
   */
  forgotPassword: async (email: string) => {
    await sendPasswordResetEmail(auth, email);
    return {
      success: true,
      message: 'Password reset link has been sent to your email address.',
    };
  },

  /**
   * Log out user from Firebase and backend, clearing all local tokens and state.
   */
  logout: async (): Promise<void> => {
    try {
      if (Platform.OS !== 'web') {
        ensureGoogleSigninConfigured();
        await GoogleSignin.signOut();
      }
    } catch (e) {
      console.warn('GoogleSignin signOut error:', e);
    }

    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Firebase signOut error:', e);
    }

    try {
      await ApiService.auth.logout();
    } catch (e) {
      console.warn('Backend logout error:', e);
    } finally {
      await setAuthToken(null);
      await AsyncStorage.multiRemove(['currentUserName', 'currentUserEmail']);
    }
  },

  /**
   * Get authenticated user profile from backend.
   */
  getProfile: async (): Promise<UserProfile | null> => {
    const response = await ApiService.auth.getProfile();
    const user = response?.data?.user || response?.data;

    if (user?.name) {
      await AsyncStorage.setItem('currentUserName', user.name);
    }
    if (user?.email) {
      await AsyncStorage.setItem('currentUserEmail', user.email);
    }

    return user || null;
  },

  /**
   * Check if a JWT token is present in AsyncStorage.
   */
  isLoggedIn: async (): Promise<boolean> => {
    const token = await getAuthToken();
    return !!token;
  },

  /**
   * Retrieve current stored JWT token.
   */
  getToken: async (): Promise<string | null> => {
    return await getAuthToken();
  },

  /**
   * Validate token on app boot via GET /auth/profile.
   */
  checkAutoLogin: async (): Promise<UserProfile | null> => {
    try {
      const token = await getAuthToken();
      if (!token) {
        return null;
      }

      const profile = await AuthService.getProfile();
      return profile;
    } catch (error) {
      console.warn('Auto-login token validation failed:', error);
      await setAuthToken(null);
      await AsyncStorage.multiRemove(['currentUserName', 'currentUserEmail']);
      return null;
    }
  },
};
