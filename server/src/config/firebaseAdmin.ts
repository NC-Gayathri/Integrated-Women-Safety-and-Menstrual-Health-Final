import { getApps, initializeApp, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { logger } from '../utils/logger';

let adminApp: App | null = null;
let adminAuth: Auth | null = null;

/**
 * Initializes Firebase Admin SDK using environment variables or service account.
 */
export function initFirebaseAdmin(): { app: App | null; auth: Auth | null } {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    adminAuth = getAuth(adminApp);
    return { app: adminApp, auth: adminAuth };
  }

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && rawPrivateKey) {
      const privateKey = rawPrivateKey.replace(/\\n/g, '\n');
      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      adminAuth = getAuth(adminApp);
      logger.info('Firebase Admin SDK initialized successfully with service account credentials.');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      adminApp = initializeApp({
        credential: applicationDefault(),
      });
      adminAuth = getAuth(adminApp);
      logger.info('Firebase Admin SDK initialized using GOOGLE_APPLICATION_CREDENTIALS.');
    } else {
      logger.warn(
        'Firebase Admin SDK is not fully configured. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in server/.env.'
      );
    }
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK:', { error });
  }

  return { app: adminApp, auth: adminAuth };
}

const initialized = initFirebaseAdmin();
export const firebaseAuth = initialized.auth;
export const firebaseApp = initialized.app;

