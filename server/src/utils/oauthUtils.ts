import https from 'https';
import jwt from 'jsonwebtoken';
import { logger } from './logger';

export interface VerifiedGoogleUser {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

export interface VerifiedAppleUser {
  sub: string;
  email?: string;
}

/**
 * Exchanges authorization code and PKCE code_verifier for Google tokens.
 */
export async function exchangeGoogleAuthCode(
  code: string,
  codeVerifier?: string,
  redirectUri?: string
): Promise<string> {
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId) {
    throw { statusCode: 500, message: 'GOOGLE_CLIENT_ID is not configured on the backend.' };
  }

  const bodyParams = new URLSearchParams({
    code,
    client_id: clientId,
    grant_type: 'authorization_code',
  });

  if (redirectUri) {
    bodyParams.append('redirect_uri', redirectUri);
  }
  if (codeVerifier) {
    bodyParams.append('code_verifier', codeVerifier);
  }
  if (clientSecret) {
    bodyParams.append('client_secret', clientSecret);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString(),
  });

  const data: any = await response.json();

  if (!response.ok || !data.id_token) {
    logger.warn('Google code exchange failed:', data);
    throw {
      statusCode: 401,
      message: data.error_description || data.error || 'Failed to exchange Google authorization code.',
    };
  }

  return data.id_token;
}

/**
 * Verify Google ID Token against Google's tokeninfo endpoint.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleUser> {
  if (!idToken || typeof idToken !== 'string') {
    throw { statusCode: 400, message: 'Google ID token is required.' };
  }

  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            logger.warn('Google token verification failed:', data);
            return reject({ statusCode: 401, message: 'Invalid or expired Google authentication token.' });
          }

          const parsed = JSON.parse(data);

          if (!parsed.sub || !parsed.email) {
            return reject({ statusCode: 401, message: 'Google token does not contain required identity fields.' });
          }

          const isVerified = parsed.email_verified === 'true' || parsed.email_verified === true;
          if (!isVerified) {
            return reject({ statusCode: 401, message: 'Google email address is not verified.' });
          }

          // If GOOGLE_CLIENT_ID is configured, verify audience
          const configuredClientId = process.env.GOOGLE_CLIENT_ID;
          if (configuredClientId && parsed.aud !== configuredClientId) {
            logger.warn(`Google token aud (${parsed.aud}) does not match configured GOOGLE_CLIENT_ID (${configuredClientId})`);
            return reject({ statusCode: 401, message: 'Google token audience mismatch.' });
          }

          resolve({
            sub: parsed.sub,
            email: parsed.email.toLowerCase(),
            email_verified: isVerified,
            name: parsed.name || parsed.given_name || 'Google User',
          });
        } catch (err) {
          reject({ statusCode: 500, message: 'Failed to parse Google verification response.' });
        }
      });
    }).on('error', (err) => {
      logger.error('Network error contacting Google verification endpoint:', err);
      reject({ statusCode: 503, message: 'Unable to verify token with Google servers.' });
    });
  });
}

/**
 * Verify Apple Identity Token.
 * Decodes and verifies claims from Apple's issued JWT.
 */
export async function verifyAppleIdentityToken(identityToken: string): Promise<VerifiedAppleUser> {
  if (!identityToken || typeof identityToken !== 'string') {
    throw { statusCode: 400, message: 'Apple identity token is required.' };
  }

  try {
    // Decode token structure
    const decoded: any = jwt.decode(identityToken, { complete: true });
    if (!decoded || !decoded.payload) {
      throw { statusCode: 401, message: 'Malformed Apple identity token.' };
    }

    const payload = decoded.payload;

    // Verify standard Apple token claims
    if (payload.iss !== 'https://appleid.apple.com') {
      throw { statusCode: 401, message: 'Invalid Apple token issuer.' };
    }

    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw { statusCode: 401, message: 'Apple identity token has expired.' };
    }

    if (!payload.sub) {
      throw { statusCode: 401, message: 'Apple token missing subject identity.' };
    }

    const configuredAppleClientId = process.env.APPLE_CLIENT_ID;
    if (configuredAppleClientId && payload.aud !== configuredAppleClientId) {
      logger.warn(`Apple token aud (${payload.aud}) does not match configured APPLE_CLIENT_ID (${configuredAppleClientId})`);
      throw { statusCode: 401, message: 'Apple token audience mismatch.' };
    }

    return {
      sub: payload.sub,
      email: payload.email ? payload.email.toLowerCase() : undefined,
    };
  } catch (error: any) {
    if (error.statusCode) throw error;
    logger.error('Error verifying Apple identity token:', error);
    throw { statusCode: 401, message: 'Apple identity token verification failed.' };
  }
}
