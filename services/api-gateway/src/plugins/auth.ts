/**
 * Compatibility shim — prefer firebase_auth.js
 */
export {
  getUserId,
  getFirebaseUid,
  type AuthUser,
} from './firebase_auth.js';
