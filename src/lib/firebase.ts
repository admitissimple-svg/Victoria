
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Helper seguro para leitura de variáveis em Vite (cliente) e Node (SSR/testes)
const getEnvVar = (key: string): string | undefined => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return String(import.meta.env[key]).trim();
    }
  } catch {
    // Ignore in non-Vite environments
  }
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return String(process.env[key]).trim();
    }
  } catch {
    // Ignore
  }
  return undefined;
};

// Carrega as credenciais com prioridade absoluta para variáveis de ambiente / Secrets (VITE_FIREBASE_*)
export const activeFirebaseConfig = {
  projectId:
    getEnvVar('VITE_FIREBASE_PROJECT_ID') ||
    getEnvVar('FIREBASE_PROJECT_ID') ||
    firebaseConfig.projectId,
  appId:
    getEnvVar('VITE_FIREBASE_APP_ID') ||
    getEnvVar('FIREBASE_APP_ID') ||
    firebaseConfig.appId,
  apiKey:
    getEnvVar('VITE_FIREBASE_API_KEY') ||
    getEnvVar('FIREBASE_API_KEY') ||
    firebaseConfig.apiKey,
  authDomain:
    getEnvVar('VITE_FIREBASE_AUTH_DOMAIN') ||
    getEnvVar('FIREBASE_AUTH_DOMAIN') ||
    firebaseConfig.authDomain ||
    (getEnvVar('VITE_FIREBASE_PROJECT_ID')
      ? `${getEnvVar('VITE_FIREBASE_PROJECT_ID')}.firebaseapp.com`
      : undefined),
  firestoreDatabaseId:
    (getEnvVar('VITE_FIREBASE_DATABASE_ID') && getEnvVar('VITE_FIREBASE_DATABASE_ID')!.trim()) ||
    (getEnvVar('FIREBASE_DATABASE_ID') && getEnvVar('FIREBASE_DATABASE_ID')!.trim()) ||
    (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId.trim()) ||
    '(default)',
  storageBucket:
    getEnvVar('VITE_FIREBASE_STORAGE_BUCKET') ||
    getEnvVar('FIREBASE_STORAGE_BUCKET') ||
    firebaseConfig.storageBucket,
  messagingSenderId:
    getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID') ||
    getEnvVar('FIREBASE_MESSAGING_SENDER_ID') ||
    firebaseConfig.messagingSenderId,
  measurementId:
    getEnvVar('VITE_FIREBASE_MEASUREMENT_ID') ||
    getEnvVar('FIREBASE_MEASUREMENT_ID') ||
    firebaseConfig.measurementId,
};

export const isFirebaseConfiguredFromSecrets = !!(
  getEnvVar('VITE_FIREBASE_PROJECT_ID') ||
  getEnvVar('FIREBASE_PROJECT_ID') ||
  getEnvVar('VITE_FIREBASE_API_KEY') ||
  getEnvVar('FIREBASE_API_KEY')
);

// Inicializa o Firebase uma única vez com as configurações resolvidas (Secrets ou arquivo padrão)
export const app =
  getApps().length === 0
    ? initializeApp(activeFirebaseConfig)
    : getApp();

// Garante que o cliente utilize getFirestore(app) quando o banco desejado for (default) ou omitido,
// e getFirestore(app, databaseId) apenas caso um banco customizado diferente de (default) seja especificado.
export const db =
  activeFirebaseConfig.firestoreDatabaseId &&
  activeFirebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, activeFirebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

// Inicializa autenticação.
export const auth = getAuth(app);

// Inicializa o Storage usando o bucket configurado.
export const storage = getStorage(
  app,
  activeFirebaseConfig.storageBucket
    ? (activeFirebaseConfig.storageBucket.startsWith('gs://')
        ? activeFirebaseConfig.storageBucket
        : `gs://${activeFirebaseConfig.storageBucket}`)
    : undefined
);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string;
      email?: string | null;
    }[];
  };
}

/**
 * Registra informações de diagnóstico e propaga o erro.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = auth.currentUser;

  const errInfo: FirestoreErrorInfo = {
    error:
      error instanceof Error
        ? error.message
        : String(error),
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo:
        currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };

  console.error(
    '[Firestore Security Error]',
    JSON.stringify(errInfo)
  );

  throw new Error(JSON.stringify(errInfo));
}

/**
 * Testa a conexão com o servidor Firestore informando o projeto e banco ativos.
 */
export async function testFirestoreConnection(): Promise<{
  connected: boolean;
  message: string;
  projectId?: string;
  databaseId?: string;
  source?: 'secrets' | 'default_config';
}> {
  const currentProjectId = activeFirebaseConfig.projectId;
  const currentDbId = activeFirebaseConfig.firestoreDatabaseId;
  const source: 'secrets' | 'default_config' = isFirebaseConfiguredFromSecrets
    ? 'secrets'
    : 'default_config';

  if (
    typeof process !== 'undefined' &&
    process.env &&
    process.env.NODE_ENV === 'test' &&
    !process.env.FIRESTORE_EMULATOR_HOST
  ) {
    throw new Error(
      'SEGURANÇA DE TESTES: Tentativa de acessar o Firestore de produção bloqueada. Nenhum teste pode acessar o Firestore de produção sem o emulador local configurado (FIRESTORE_EMULATOR_HOST).'
    );
  }

  try {
    const testDocRef = doc(db, 'system', 'bootstrap');

    await getDocFromServer(testDocRef);

    return {
      connected: true,
      message: `Conectado com sucesso ao Firestore (Projeto: ${currentProjectId}, Banco: ${currentDbId}) [Origem: ${
        source === 'secrets' ? 'Secrets / .env' : 'Arquivo padrão'
      }]`,
      projectId: currentProjectId,
      databaseId: currentDbId,
      source,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);

    if (
      message.toLowerCase().includes('client is offline') ||
      message.toLowerCase().includes('client is offline.')
    ) {
      return {
        connected: false,
        message: `Cliente Firestore offline (Projeto: ${currentProjectId}, Banco: ${currentDbId}). Verifique a conexão e as chaves em Secrets.`,
        projectId: currentProjectId,
        databaseId: currentDbId,
        source,
      };
    }

    // Erros de permissão indicam que o servidor respondeu,
    // confirmando que as credenciais e o banco existem!
    if (
      message.includes('permission-denied') ||
      message.includes('Missing or insufficient permissions')
    ) {
      return {
        connected: true,
        message: `Servidor Firestore acessível e respondendo (Projeto: ${currentProjectId}, Banco: ${currentDbId}) [Origem: ${
          source === 'secrets' ? 'Secrets / .env' : 'Arquivo padrão'
        }].`,
        projectId: currentProjectId,
        databaseId: currentDbId,
        source,
      };
    }

    console.error('[Firestore Connection Error]', message);

    return {
      connected: false,
      message: `Erro na conexão com o Firestore (${currentProjectId} / ${currentDbId}): ${message}`,
      projectId: currentProjectId,
      databaseId: currentDbId,
      source,
    };
  }
}
