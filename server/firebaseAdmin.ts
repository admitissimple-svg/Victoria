import { initializeApp, getApps, getApp, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read applet config if present (checks cwd for serverless and relative path for local)
let rawConfig: any = null;
try {
  const cwdPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const relPath = path.resolve(__dirname, '..', 'firebase-applet-config.json');
  const directPath = path.resolve(__dirname, 'firebase-applet-config.json');
  const finalPath = [cwdPath, relPath, directPath].find((p) => fs.existsSync(p));
  if (finalPath) {
    rawConfig = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
  }
} catch {
  // Ignore
}

export const activeFirebaseProjectId: string =
  (process.env.VITE_FIREBASE_PROJECT_ID && process.env.VITE_FIREBASE_PROJECT_ID.trim()) ||
  (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID.trim()) ||
  rawConfig?.projectId ||
  'victoria-lar-residencial';

export const activeFirebaseDatabaseId: string =
  (process.env.VITE_FIREBASE_DATABASE_ID && process.env.VITE_FIREBASE_DATABASE_ID.trim()) ||
  (process.env.FIREBASE_DATABASE_ID && process.env.FIREBASE_DATABASE_ID.trim()) ||
  (rawConfig?.firestoreDatabaseId && String(rawConfig.firestoreDatabaseId).trim()) ||
  '(default)';

let adminApp: App | null = null;
let serverFirestoreInstance: Firestore | null = null;
let resolvedCredentialSource: 'SERVICE_ACCOUNT_JSON' | 'SERVICE_ACCOUNT_PEM' | 'SERVICE_ACCOUNT_BASE64' | 'APPLICATION_DEFAULT' | 'NONE' = 'NONE';
let credentialParsingError: string | null = null;

/**
 * Retorna o status de configuração e integridade das credenciais do Firebase Admin SDK
 * sem expor nenhuma informação sensível ou valor de chave privada.
 */
export function getFirebaseAdminStatus() {
  const hasSecret = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY && process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim());
  const clientEmail = (
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL ||
    rawConfig?.clientEmail ||
    ''
  ).trim();

  return {
    configured: resolvedCredentialSource !== 'NONE',
    credentialSource: resolvedCredentialSource,
    hasSecretKey: hasSecret,
    clientEmailConfigured: Boolean(clientEmail),
    projectId: activeFirebaseProjectId,
    databaseId: activeFirebaseDatabaseId,
    isProductionReady: resolvedCredentialSource === 'SERVICE_ACCOUNT_JSON' || resolvedCredentialSource === 'SERVICE_ACCOUNT_PEM' || resolvedCredentialSource === 'SERVICE_ACCOUNT_BASE64',
    errorReason: credentialParsingError,
  };
}

/**
 * Initializes and returns the Firebase Admin App instance.
 * Credentials hierarchy:
 * 1. FIREBASE_SERVICE_ACCOUNT_KEY (supports Full JSON, Base64 JSON, or raw PEM private key)
 * 2. GOOGLE_APPLICATION_CREDENTIALS (env var file path)
 * 3. Application Default Credentials (Cloud Run, GCP metadata server)
 * 4. Fallback projectId-only app (for emulator or read-only public token verification)
 */
export function getFirebaseAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    return adminApp;
  }

  let credential: any = null;
  resolvedCredentialSource = 'NONE';
  credentialParsingError = null;

  // 1. Check for service account in FIREBASE_SERVICE_ACCOUNT_KEY
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountRaw && serviceAccountRaw.trim()) {
    try {
      const trimmed = serviceAccountRaw.trim();

      // Case A: Full Service Account JSON object
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const parsed = JSON.parse(trimmed);
        if (parsed.private_key && typeof parsed.private_key === 'string') {
          parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
        }
        credential = cert(parsed);
        resolvedCredentialSource = 'SERVICE_ACCOUNT_JSON';
      }
      // Case B: Raw PEM Private Key string directly (common when pasting PEM in Secret manager)
      else if (trimmed.includes('BEGIN PRIVATE KEY') || trimmed.includes('BEGIN RSA PRIVATE KEY')) {
        const normalizedKey = trimmed.replace(/\\n/g, '\n');
        const clientEmail = (
          process.env.FIREBASE_CLIENT_EMAIL ||
          process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL ||
          rawConfig?.clientEmail ||
          `firebase-adminsdk@${activeFirebaseProjectId}.iam.gserviceaccount.com`
        ).trim();

        credential = cert({
          projectId: activeFirebaseProjectId,
          clientEmail,
          privateKey: normalizedKey,
        });
        resolvedCredentialSource = 'SERVICE_ACCOUNT_PEM';
      }
      // Case C: Base64-encoded string
      else {
        let decoded = '';
        try {
          decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
        } catch {
          decoded = '';
        }

        if (decoded.startsWith('{') && decoded.endsWith('}')) {
          const parsed = JSON.parse(decoded);
          if (parsed.private_key && typeof parsed.private_key === 'string') {
            parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
          }
          credential = cert(parsed);
          resolvedCredentialSource = 'SERVICE_ACCOUNT_BASE64';
        } else if (decoded.includes('BEGIN PRIVATE KEY')) {
          const normalizedKey = decoded.replace(/\\n/g, '\n');
          const clientEmail = (
            process.env.FIREBASE_CLIENT_EMAIL ||
            process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL ||
            rawConfig?.clientEmail ||
            `firebase-adminsdk@${activeFirebaseProjectId}.iam.gserviceaccount.com`
          ).trim();

          credential = cert({
            projectId: activeFirebaseProjectId,
            clientEmail,
            privateKey: normalizedKey,
          });
          resolvedCredentialSource = 'SERVICE_ACCOUNT_BASE64';
        } else {
          credentialParsingError = 'INVALID_FORMAT: Secret FIREBASE_SERVICE_ACCOUNT_KEY não corresponde a JSON nem chave PEM.';
          console.warn('[Firebase Admin Warning]: Formato de FIREBASE_SERVICE_ACCOUNT_KEY não reconhecido (deve ser JSON da conta de serviço ou chave privada PEM).');
        }
      }
    } catch {
      // STRICT ZERO-LEAKAGE: Never log e.message as JSON.parse could include secret characters in error snippets
      credentialParsingError = 'PARSE_ERROR: Falha ao interpretar a credencial fornecida.';
      console.warn('[Firebase Admin Warning]: Falha na interpretação sintática de FIREBASE_SERVICE_ACCOUNT_KEY. Nenhum detalhe confidencial foi gravado em log.');
    }
  }

  // 2. Check for GOOGLE_APPLICATION_CREDENTIALS file path
  if (!credential && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      credential = applicationDefault();
      resolvedCredentialSource = 'APPLICATION_DEFAULT';
    } catch {
      console.warn('[Firebase Admin Warning]: Falha ao carregar credenciais de GOOGLE_APPLICATION_CREDENTIALS.');
    }
  }

  // 3. Fallback to applicationDefault() if in GCP / Cloud Run environment
  if (!credential) {
    try {
      credential = applicationDefault();
      resolvedCredentialSource = 'APPLICATION_DEFAULT';
    } catch {
      // Running locally without service account credentials
      credential = undefined;
      resolvedCredentialSource = 'NONE';
    }
  }

  adminApp = initializeApp({
    projectId: activeFirebaseProjectId,
    ...(credential ? { credential } : {}),
  });

  return adminApp;
}

/**
 * Retorna a instância do Cloud Firestore gerenciada pelo Firebase Admin SDK.
 * - Garante que o Admin SDK utilize getFirestore(app) quando o banco for `(default)` ou omitido.
 * - Utiliza getFirestore(app, activeFirebaseDatabaseId) apenas quando um banco customizado diferente de `(default)` for especificado.
 * - SEGURANÇA DE TESTES: Quando em ambiente de teste (NODE_ENV=test), bloqueia sumariamente qualquer tentativa de conexão se o emulador local (FIRESTORE_EMULATOR_HOST) não estiver configurado.
 */
export function getServerFirestore(): Firestore {
  if (process.env.NODE_ENV === 'test' && !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'SEGURANÇA DE TESTES: Tentativa de acessar o Firestore de produção bloqueada. Nenhum teste pode acessar o Firestore de produção sem o emulador local configurado (FIRESTORE_EMULATOR_HOST).'
    );
  }

  if (serverFirestoreInstance) {
    return serverFirestoreInstance;
  }

  const app = getFirebaseAdminApp();
  if (activeFirebaseDatabaseId && activeFirebaseDatabaseId !== '(default)') {
    serverFirestoreInstance = getFirestore(app, activeFirebaseDatabaseId);
  } else {
    serverFirestoreInstance = getFirestore(app);
  }
  return serverFirestoreInstance;
}

/**
 * Reseta a instância interna de Firestore para isolamento de testes unitários/integração.
 */
export function resetServerFirestoreInstanceForTesting(): void {
  serverFirestoreInstance = null;
  adminApp = null;
}
