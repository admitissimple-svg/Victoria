import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Load Firebase configuration with environment variables / secrets override
// Resilient path lookup supporting both local runtime and Vercel serverless functions
let rawFirebaseConfig: any = null;
try {
  const cwdPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const parentPath = path.resolve(__dirname, '..', 'firebase-applet-config.json');
  const directPath = path.resolve(__dirname, 'firebase-applet-config.json');
  const resolvedPath = [cwdPath, parentPath, directPath].find((p) => fs.existsSync(p));

  if (resolvedPath) {
    rawFirebaseConfig = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not read firebase-applet-config.json:', e);
}

const activeFirebaseProjectId =
  (process.env.VITE_FIREBASE_PROJECT_ID && process.env.VITE_FIREBASE_PROJECT_ID.trim()) ||
  (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID.trim()) ||
  rawFirebaseConfig?.projectId ||
  'victoria-lar-residencial';

const activeFirebaseDatabaseId =
  (process.env.VITE_FIREBASE_DATABASE_ID && process.env.VITE_FIREBASE_DATABASE_ID.trim()) ||
  (process.env.FIREBASE_DATABASE_ID && process.env.FIREBASE_DATABASE_ID.trim()) ||
  rawFirebaseConfig?.firestoreDatabaseId ||
  '(default)';

const activeStorageBucket =
  (process.env.VITE_FIREBASE_STORAGE_BUCKET && process.env.VITE_FIREBASE_STORAGE_BUCKET.trim()) ||
  (process.env.FIREBASE_STORAGE_BUCKET && process.env.FIREBASE_STORAGE_BUCKET.trim()) ||
  rawFirebaseConfig?.storageBucket ||
  'victoria-lar-residencial.firebasestorage.app';

const isConfiguredFromSecrets = !!(
  process.env.VITE_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_API_KEY ||
  process.env.FIREBASE_API_KEY
);

import {
  OFFICIAL_GMAIL,
  OFFICIAL_SENDER_NAME,
  getTransporter,
  sendMeetingConfirmationEmail,
  buildSmtpConfig,
  verifySmtpConnection,
  sanitizeLog,
} from './mailer';
import {
  requireVerifiedOwner,
  requireActiveAdmin,
  requireActiveSuperAdmin,
  recordServerAuditLog,
} from './auth';
import {
  getServerFirestore,
  getFirebaseAdminStatus,
} from './firebaseAdmin';

/**
 * Registers an API route with both /api prefix (standard Express)
 * and without /api prefix (for Vercel serverless rewrites where prefix might be trimmed).
 * Keeps routes directly on app._router.stack for backwards-compatibility with test suites.
 */
function registerRoute(
  method: 'get' | 'post' | 'patch',
  apiPath: string,
  handler: (req: Request, res: Response) => any
) {
  (app as any)[method](apiPath, handler);
  const strippedPath = apiPath.startsWith('/api') ? apiPath.substring(4) : apiPath;
  if (strippedPath && strippedPath !== apiPath) {
    (app as any)[method](strippedPath, handler);
  }
}

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

// Health check endpoint
registerRoute('get', '/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    firebase: {
      configured: !!activeFirebaseProjectId,
      projectId: activeFirebaseProjectId,
      databaseId: activeFirebaseDatabaseId,
      storageBucket: activeStorageBucket,
      source: isConfiguredFromSecrets ? 'SECRETS_ENV' : 'APPLET_CONFIG_JSON',
      admin: getFirebaseAdminStatus(),
    },
    institution: 'Victoria Lar Residencial',
    platform: process.env.VERCEL ? 'VERCEL_SERVERLESS' : 'NODE_EXPRESS',
  });
});

// Bootstrap Status Query (Minimal safe state only, zero secret leakage)
registerRoute('get', '/api/bootstrap/status', async (_req: Request, res: Response) => {
  try {
    const serverDb = getServerFirestore();
    const bootstrapRef = serverDb.collection('system').doc('bootstrap');
    const bootstrapSnap = await bootstrapRef.get();

    let isCompleted = false;
    if (bootstrapSnap.exists) {
      const data = bootstrapSnap.data();
      isCompleted = Boolean(data && (data.lockedPermanently === true || data.status === 'COMPLETED'));
    }

    res.json({
      success: true,
      initialized: isCompleted,
      status: isCompleted ? 'COMPLETED' : 'UNINITIALIZED',
      lockedPermanently: isCompleted,
    });
  } catch {
    // Safe response during offline or initial bootstrapping queries
    res.json({
      success: true,
      initialized: false,
      status: 'UNINITIALIZED',
      lockedPermanently: false,
    });
  }
});

// Trusted Server-Side Initial Bootstrap Initiation Endpoint (Single-use, Concurrency-Safe, Cryptographically Verified)
registerRoute('post', '/api/bootstrap/initiate', async (req: Request, res: Response) => {
  try {
    // 1. Extract Bearer token from Authorization header or request body
    const authHeader = req.headers.authorization || '';
    let token = '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.body && typeof req.body.idToken === 'string') {
      token = req.body.idToken.trim();
    } else if (req.body && typeof req.body.token === 'string') {
      token = req.body.token.trim();
    }

    if (!token) {
      return res.status(401).json({
        error: 'TOKEN_REQUIRED: O token de autenticação Firebase ID Token é obrigatório para inicializar o sistema.',
      });
    }

    // 2. Cryptographically verify Firebase ID token, identity and email verification
    // STRICT: Never trusts unverified email or uid sent in the request body!
    const verifiedOwner = await requireVerifiedOwner(token, activeFirebaseProjectId);
    const ownerUid = verifiedOwner.uid;
    const ownerEmail = verifiedOwner.email;

    // Use server-authoritative Firestore connection (Firebase Admin SDK)
    const serverDb = getServerFirestore();
    const bootstrapRef = serverDb.collection('system').doc('bootstrap');
    const guardRef = serverDb.collection('system').doc('superAdminGuard');
    const adminRef = serverDb.collection('admins').doc(ownerUid);
    const logId = `log_boot_${Date.now()}`;
    const auditRef = serverDb.collection('auditLogs').doc(logId);

    const result = await serverDb.runTransaction(async (tx) => {
      const bootstrapSnap = await tx.get(bootstrapRef);
      const guardSnap = await tx.get(guardRef);

      if (bootstrapSnap.exists) {
        const data = bootstrapSnap.data();
        if (data && (data.lockedPermanently === true || data.status === 'COMPLETED')) {
          if (data.superAdminUid === ownerUid) {
            return {
              success: true,
              message: 'Sistema já inicializado para este superadministrador.',
              alreadyInitialized: true,
            };
          }
          throw new Error('SISTEMA_JA_INICIALIZADO: O bootstrap inicial já foi executado e permanentemente selado. Novas contas de administrador devem ser convidadas exclusivamente pelo painel interno.');
        }
      }

      if (guardSnap.exists) {
        const gData = guardSnap.data();
        if (gData && typeof gData.activeSuperAdminCount === 'number' && gData.activeSuperAdminCount >= 1) {
          throw new Error('SISTEMA_JA_INICIALIZADO: O sistema já possui superadministrador ativo configurado.');
        }
      }

      const nowIso = new Date().toISOString();

      // 1. Establish initial superadministrator with active: true
      tx.set(adminRef, {
        uid: ownerUid,
        email: ownerEmail,
        role: 'superadmin',
        active: true,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'SERVER_TRUSTED_BOOTSTRAP',
        bootstrapStatus: 'COMPLETED',
      });

      // 2. Set SuperAdminGuard with initial activeSuperAdminCount = 1
      tx.set(guardRef, {
        activeSuperAdminCount: 1,
        activeSuperAdminUids: [ownerUid],
        version: 1,
        updatedAt: nowIso,
      });

      // 3. Permanently seal bootstrap (minimal safe representation)
      tx.set(bootstrapRef, {
        status: 'COMPLETED',
        superAdminUid: ownerUid,
        completedAt: nowIso,
        lockedPermanently: true,
      });

      // 4. Generate trusted immutable audit log
      tx.set(auditRef, {
        id: logId,
        action: 'BOOTSTRAP_INITIAL_SEALED',
        performedByUid: ownerUid,
        performedByEmail: ownerEmail,
        targetResource: `/admins/${ownerUid}`,
        details: 'Initial superadmin account provisioned and permanent system bootstrap lock sealed by cryptographic server authority.',
        timestamp: nowIso,
      });

      return {
        success: true,
        message: 'Superadministrador inicial provisionado com sucesso e sistema selado.',
        alreadyInitialized: false,
      };
    });

    return res.status(200).json(result);
  } catch (err: any) {
    if (err?.message?.includes('SISTEMA_JA_INICIALIZADO')) {
      return res.status(409).json({ error: err.message });
    }
    if (
      err?.message?.includes('TOKEN_') ||
      err?.message?.includes('EMAIL_NOT_VERIFIED') ||
      err?.message?.includes('UNAUTHORIZED_OWNER')
    ) {
      return res.status(403).json({ error: err.message });
    }
    console.error('[Server Bootstrap Initiation Error]:', sanitizeLog(err?.message || err));
    return res.status(500).json({ error: 'Falha ao executar bootstrap no servidor.' });
  }
});

// Server-Side Authenticated Admin Creation Endpoint (SuperAdmin Only, Atomic Transaction)
registerRoute('post', '/api/admin/users', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'TOKEN_REQUIRED: Autenticação necessária.' });
    }

    // 1. Verify caller is active superadministrator with verified email
    const superAdmin = await requireActiveSuperAdmin(token, activeFirebaseProjectId);

    const { uid, email, role } = req.body || {};
    if (!uid || typeof uid !== 'string' || uid.length > 128 || !/^[a-zA-Z0-9_\-]+$/.test(uid)) {
      return res.status(400).json({ error: 'UID inválido fornecido para o administrador.' });
    }
    if (!email || typeof email !== 'string' || email.length > 160 || !email.includes('@')) {
      return res.status(400).json({ error: 'E-mail inválido fornecido para o administrador.' });
    }
    if (role !== 'admin' && role !== 'superadmin') {
      return res.status(400).json({ error: 'Função deve ser "admin" ou "superadmin".' });
    }

    const serverDb = getServerFirestore();
    const adminRef = serverDb.collection('admins').doc(uid);
    const guardRef = serverDb.collection('system').doc('superAdminGuard');

    await serverDb.runTransaction(async (tx) => {
      const existingDoc = await tx.get(adminRef);
      if (existingDoc.exists) {
        throw new Error('ADMIN_EXISTS: Já existe um administrador cadastrado com este UID.');
      }

      const guardSnap = await tx.get(guardRef);
      const guardData = guardSnap.exists ? guardSnap.data() : null;

      // Authoritative count of active superadmins derived from REAL records in Firestore
      const adminsSnap = await tx.get(serverDb.collection('admins'));
      const activeSuperAdminUids: string[] = [];
      adminsSnap.forEach((doc) => {
        const d = doc.data();
        if (d.role === 'superadmin' && d.active === true) {
          activeSuperAdminUids.push(doc.id);
        }
      });

      const nowIso = new Date().toISOString();
      const adminData = {
        uid,
        email: email.trim().toLowerCase(),
        role,
        active: true,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: superAdmin.uid,
        bootstrapStatus: 'COMPLETED',
      };

      tx.set(adminRef, adminData);

      if (role === 'superadmin') {
        const updatedList = Array.from(new Set([...activeSuperAdminUids, uid]));
        tx.set(guardRef, {
          activeSuperAdminCount: updatedList.length,
          activeSuperAdminUids: updatedList,
          version: ((guardData?.version || 1) + 1),
          updatedAt: nowIso,
        }, { merge: true });
      }
    });

    await recordServerAuditLog({
      action: 'ADMIN_CREATED',
      performedByUid: superAdmin.uid,
      performedByEmail: superAdmin.email,
      targetResource: `/admins/${uid}`,
      details: `Novo administrador (${email}, função: ${role}) provisionado com autoridade atômica do servidor.`,
    });

    return res.status(201).json({ success: true, message: 'Administrador cadastrado com sucesso.' });
  } catch (err: any) {
    if (err?.message?.includes('FORBIDDEN_') || err?.message?.includes('EMAIL_NOT_VERIFIED')) {
      return res.status(403).json({ error: err.message });
    }
    if (err?.message?.includes('ADMIN_EXISTS')) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[Create Admin Error]:', sanitizeLog(err?.message || err));
    return res.status(500).json({ error: err?.message || 'Falha ao cadastrar administrador.' });
  }
});

// Server-Side Authenticated Admin Status & Role Modification Endpoint (SuperAdmin Only, Atomic Transaction)
registerRoute('patch', '/api/admin/users/:uid', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'TOKEN_REQUIRED: Autenticação necessária.' });
    }

    // 1. Verify caller is active superadministrator
    const superAdmin = await requireActiveSuperAdmin(token, activeFirebaseProjectId);

    const targetUid = req.params.uid;
    if (!targetUid || typeof targetUid !== 'string' || targetUid.length > 128 || !/^[a-zA-Z0-9_\-]+$/.test(targetUid)) {
      return res.status(400).json({ error: 'UID inválido de administrador.' });
    }

    const { role, active } = req.body || {};
    if (role !== undefined && role !== 'admin' && role !== 'superadmin') {
      return res.status(400).json({ error: 'Função deve ser "admin" ou "superadmin".' });
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Campo active deve ser booleano.' });
    }
    if (role === undefined && active === undefined) {
      return res.status(400).json({ error: 'Nenhum campo para atualização fornecido.' });
    }

    const serverDb = getServerFirestore();
    const adminRef = serverDb.collection('admins').doc(targetUid);
    const guardRef = serverDb.collection('system').doc('superAdminGuard');

    await serverDb.runTransaction(async (tx) => {
      const targetSnap = await tx.get(adminRef);
      if (!targetSnap.exists) {
        throw new Error('ADMIN_NOT_FOUND: Administrador não encontrado.');
      }

      const currentAdmin = targetSnap.data() || {};
      const isCurrentlyActiveSuperAdmin = currentAdmin.role === 'superadmin' && currentAdmin.active === true;

      const targetRole = role !== undefined ? role : currentAdmin.role;
      const targetActive = active !== undefined ? active : currentAdmin.active;
      const willBeActiveSuperAdmin = targetRole === 'superadmin' && targetActive === true;

      const guardSnap = await tx.get(guardRef);
      const guardData = guardSnap.exists ? guardSnap.data() : null;

      // Authoritative count of active superadmins derived from REAL records in Firestore
      const adminsSnap = await tx.get(serverDb.collection('admins'));
      const activeSuperAdminUids: string[] = [];
      adminsSnap.forEach((doc) => {
        const d = doc.data();
        if (d.role === 'superadmin' && d.active === true) {
          activeSuperAdminUids.push(doc.id);
        }
      });

      const nowIso = new Date().toISOString();

      // If we are removing an active superadmin (via deactivation or demotion)
      if (isCurrentlyActiveSuperAdmin && !willBeActiveSuperAdmin) {
        if (activeSuperAdminUids.length <= 1) {
          throw new Error('PROTECAO_BLOQUEADA: Impossível desativar ou rebaixar o único superadministrador ativo remanescente. O sistema ficaria sem superadministrador.');
        }

        const remainingUids = activeSuperAdminUids.filter((u) => u !== targetUid);
        tx.set(guardRef, {
          activeSuperAdminCount: remainingUids.length,
          activeSuperAdminUids: remainingUids,
          version: ((guardData?.version || 1) + 1),
          updatedAt: nowIso,
        }, { merge: true });
      } else if (!isCurrentlyActiveSuperAdmin && willBeActiveSuperAdmin) {
        const updatedUids = Array.from(new Set([...activeSuperAdminUids, targetUid]));
        tx.set(guardRef, {
          activeSuperAdminCount: updatedUids.length,
          activeSuperAdminUids: updatedUids,
          version: ((guardData?.version || 1) + 1),
          updatedAt: nowIso,
        }, { merge: true });
      }

      const updateData: Record<string, any> = { updatedAt: nowIso };
      if (role !== undefined) updateData.role = role;
      if (active !== undefined) updateData.active = active;

      tx.update(adminRef, updateData);
    });

    await recordServerAuditLog({
      action: 'ADMIN_UPDATED',
      performedByUid: superAdmin.uid,
      performedByEmail: superAdmin.email,
      targetResource: `/admins/${targetUid}`,
      details: `Administrador ${targetUid} atualizado: ${JSON.stringify({ role, active })}.`,
    });

    return res.status(200).json({ success: true, message: 'Administrador atualizado com sucesso.' });
  } catch (err: any) {
    if (err?.message?.includes('FORBIDDEN_') || err?.message?.includes('EMAIL_NOT_VERIFIED')) {
      return res.status(403).json({ error: err.message });
    }
    if (err?.message?.includes('ADMIN_NOT_FOUND')) {
      return res.status(404).json({ error: err.message });
    }
    if (err?.message?.includes('PROTECAO_BLOQUEADA')) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[Update Admin Error]:', sanitizeLog(err?.message || err));
    return res.status(500).json({ error: err?.message || 'Falha ao atualizar administrador.' });
  }
});

// Server-Side Authenticated Admin Directory Query Endpoint
registerRoute('get', '/api/admin/users', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'TOKEN_REQUIRED: Autenticação necessária.' });
    }

    // Caller must be active admin
    await requireActiveAdmin(token, activeFirebaseProjectId);

    const serverDb = getServerFirestore();
    const snap = await serverDb.collection('admins').get();
    const users = snap.docs.map((d) => d.data());

    return res.json({ success: true, users });
  } catch (err: any) {
    if (err?.message?.includes('FORBIDDEN_') || err?.message?.includes('EMAIL_NOT_VERIFIED')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Falha ao consultar administradores.' });
  }
});

// Server-Side Authenticated Audit Logging Endpoint (Zero Client Forgery)
registerRoute('post', '/api/audit/log', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!token) {
      return res.status(401).json({ error: 'TOKEN_REQUIRED: Autenticação necessária.' });
    }

    // Authenticate token and verify live active admin status in Firestore
    const activeAdmin = await requireActiveAdmin(token, activeFirebaseProjectId);

    const { action, targetResource, details } = req.body || {};
    if (!action || typeof action !== 'string' || action.length > 80) {
      return res.status(400).json({ error: 'Ação de auditoria inválida.' });
    }

    await recordServerAuditLog({
      action: action.trim(),
      performedByUid: activeAdmin.uid,
      performedByEmail: activeAdmin.email,
      targetResource: typeof targetResource === 'string' ? targetResource.slice(0, 200) : 'general',
      details: typeof details === 'string' ? details.slice(0, 1000) : '',
    });

    return res.status(201).json({ success: true, message: 'Evento de auditoria registrado pelo servidor.' });
  } catch (err: any) {
    return res.status(403).json({ error: 'Falha na validação de auditoria.' });
  }
});

// Availability & Scheduling Endpoints
const bookedAppointments: Array<{ date: string; time: string }> = [];

let serverAvailabilityConfig = {
  dailyTimeSlots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
  activeDays: [1, 2, 3, 4, 5],
  blockedSlots: [],
  meetingDuration: '30 a 45 minutos',
  meetingLink: 'https://meet.google.com/vic-tori-lar',
};

registerRoute('get', '/api/schedule/availability', async (_req: Request, res: Response) => {
  let resolved = serverAvailabilityConfig;

  // In production / live server, check Firestore /content/scheduling doc for custom slots
  if (process.env.NODE_ENV !== 'test') {
    try {
      const serverDb = getServerFirestore();
      const snap = await serverDb.collection('content').doc('scheduling').get();
      if (snap.exists) {
        const data = snap.data();
        if (data && data.availableHours && typeof data.availableHours === 'string') {
          const slots = data.availableHours.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (slots.length > 0) {
            resolved = {
              ...serverAvailabilityConfig,
              dailyTimeSlots: slots,
              meetingDuration: data.meetingDuration || serverAvailabilityConfig.meetingDuration,
              meetingLink: data.meetingLink || serverAvailabilityConfig.meetingLink,
            };
          }
        }
      }
    } catch {
      // Graceful fallback to memory config
    }
  }

  res.json({
    success: true,
    availability: resolved,
  });
});

registerRoute('post', '/api/schedule/availability', (req: Request, res: Response) => {
  if (req.body && req.body.availability) {
    const incoming = req.body.availability;
    serverAvailabilityConfig = {
      ...serverAvailabilityConfig,
      dailyTimeSlots: Array.isArray(incoming.dailyTimeSlots) ? incoming.dailyTimeSlots : serverAvailabilityConfig.dailyTimeSlots,
      activeDays: Array.isArray(incoming.activeDays) ? incoming.activeDays : serverAvailabilityConfig.activeDays,
      blockedSlots: Array.isArray(incoming.blockedSlots) ? incoming.blockedSlots : serverAvailabilityConfig.blockedSlots,
      meetingDuration: typeof incoming.meetingDuration === 'string' ? incoming.meetingDuration : serverAvailabilityConfig.meetingDuration,
      meetingLink: typeof incoming.meetingLink === 'string' ? incoming.meetingLink : serverAvailabilityConfig.meetingLink,
    };
  }
  res.json({
    success: true,
    availability: serverAvailabilityConfig,
  });
});

registerRoute('get', '/api/schedule/booked-slots', async (req: Request, res: Response) => {
  const dateQuery = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  const bookedSlotsSet = new Set<string>();

  // In-memory fallback (local dev / tests)
  bookedAppointments
    .filter((a) => a.date === dateQuery)
    .forEach((a) => bookedSlotsSet.add(a.time));

  // Serverless persistence query: retrieve booked slots from Firestore /leads on this date
  if (dateQuery && process.env.NODE_ENV !== 'test') {
    try {
      const serverDb = getServerFirestore();
      const snap = await serverDb
        .collection('leads')
        .where('scheduledDate', '==', dateQuery)
        .get();

      snap.forEach((doc) => {
        const d = doc.data();
        if (d && d.scheduledTime && d.status !== 'archived') {
          bookedSlotsSet.add(d.scheduledTime);
        }
      });
    } catch {
      // Graceful fallback to memory
    }
  }

  res.json({
    success: true,
    date: dateQuery,
    bookedSlots: Array.from(bookedSlotsSet),
  });
});

// Meeting Scheduling Intake API (Dispara e-mail de confirmação ao cliente)
registerRoute('post', '/api/schedule-meeting', async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      phone,
      scheduledDate,
      scheduledTime,
      meetingLink,
      relationship,
      serviceInterest,
      message,
      honeypot,
      emailSubject,
      emailInstructions,
    } = req.body;

    // Honeypot anti-bot check
    if (honeypot) {
      return res.status(200).json({ success: true, message: 'Agendamento recebido.' });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 120) {
      return res.status(400).json({ error: 'Nome completo é obrigatório.' });
    }

    if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 160) {
      return res.status(400).json({ error: 'E-mail válido é obrigatório para envio da confirmação.' });
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length < 8 || phone.length > 30) {
      return res.status(400).json({ error: 'Telefone ou WhatsApp é obrigatório.' });
    }

    if (!scheduledDate || typeof scheduledDate !== 'string') {
      return res.status(400).json({ error: 'Selecione a data da reunião.' });
    }

    if (!scheduledTime || typeof scheduledTime !== 'string') {
      return res.status(400).json({ error: 'Selecione o horário da reunião.' });
    }

    // Formata a data para formato amigável brasileiro (DD/MM/AAAA)
    let formattedDate = scheduledDate.trim();
    if (formattedDate.includes('-')) {
      const [y, m, d] = formattedDate.split('-');
      formattedDate = `${d}/${m}/${y}`;
    }

    const resolvedMeetingLink = meetingLink || 'https://meet.google.com/vic-tori-lar';

    // 1. Reunião salva no agendamento do servidor
    const appointmentRecord = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      scheduledDate: scheduledDate.trim(),
      scheduledTime: scheduledTime.trim(),
      meetingLink: resolvedMeetingLink,
      relationship: relationship ? String(relationship).slice(0, 60) : 'Familiar',
      serviceInterest: serviceInterest ? String(serviceInterest).slice(0, 100) : 'Reunião de Apresentação',
      message: message ? message.trim() : '',
      status: 'scheduled',
      type: 'meeting',
      createdAt: new Date().toISOString(),
      notificationStatus: 'pending',
    };

    const alreadyBooked = bookedAppointments.some(
      (a) => a.date === scheduledDate.trim() && a.time === scheduledTime.trim()
    );

    if (!alreadyBooked) {
      bookedAppointments.push({
        date: scheduledDate.trim(),
        time: scheduledTime.trim(),
      });
    }

    // 2. Dispara e-mail de confirmação ao cliente de forma síncrona
    const emailResult = await sendMeetingConfirmationEmail({
      to: email.trim(),
      name: name.trim(),
      scheduledDate: scheduledDate.trim(),
      scheduledTime: scheduledTime.trim(),
      meetingLink: resolvedMeetingLink,
      serviceInterest,
      phone,
      subject: emailSubject,
      instructions: emailInstructions,
    });

    appointmentRecord.notificationStatus = emailResult.success ? 'sent' : 'failed';

    // 3. Monta resposta HTTP distinguindo reunião agendada de entrega do e-mail
    const emailSent = emailResult.success === true;
    const userMessage = emailSent
      ? `Reunião agendada com sucesso para ${formattedDate} às ${scheduledTime}! Um e-mail de confirmação com a sala do Google Meet e botão para registro no Google Calendar foi enviado para ${email.trim()} a partir de ${OFFICIAL_GMAIL}.`
      : `Reunião agendada com sucesso para ${formattedDate} às ${scheduledTime}! Não foi possível despachar o e-mail de confirmação automaticamente (${emailResult.error || 'instabilidade na conexão SMTP'}), mas seu horário com a direção está confirmado. Salve o link do Google Meet e adicione o compromisso ao seu calendário pelos botões abaixo.`;

    return res.status(201).json({
      success: true,
      appointmentScheduled: true,
      emailSent,
      emailError: emailSent ? null : (emailResult.error || 'Falha no envio de e-mail'),
      errorCode: emailSent ? null : (emailResult.errorCode || 'SEND_FAILED'),
      message: userMessage,
      data: appointmentRecord,
      meetingLink: resolvedMeetingLink,
      googleCalendarUrl: emailResult?.googleCalendarUrl || null,
      sender: OFFICIAL_GMAIL,
      previewUrl: emailResult?.previewUrl || null,
    });
  } catch (err: any) {
    console.error('Erro no agendamento de reunião:', sanitizeLog(err?.message || err));
    return res.status(500).json({ error: 'Falha ao processar agendamento. Tente novamente mais tarde.' });
  }
});

// Mailer Status & Health Endpoint
registerRoute('get', '/api/mail/status', async (req: Request, res: Response) => {
  const config = buildSmtpConfig();
  const shouldVerify = req.query.verify === 'true';

  let verificationResult: { ok: boolean; error?: string } | null = null;
  if (shouldVerify) {
    verificationResult = await verifySmtpConnection();
  }

  res.json({
    success: true,
    senderEmail: OFFICIAL_GMAIL,
    senderName: OFFICIAL_SENDER_NAME,
    configured: !config.isFallback,
    mode: config.isCustomHost
      ? 'CUSTOM_SMTP'
      : config.isDirectGmail
      ? 'GMAIL_OFFICIAL'
      : 'DEVELOPMENT_FALLBACK',
    connection: {
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTLS,
      hasAuth: !!config.pass,
      timeouts: {
        connection: config.connectionTimeout,
        greeting: config.greetingTimeout,
        socket: config.socketTimeout,
      },
    },
    verification: verificationResult,
    platform: process.env.VERCEL ? 'VERCEL_SERVERLESS' : 'NODE_CONTAINER',
    serverlessTips: [
      'Vercel bloqueia conexões SMTP na porta 25.',
      'Para Gmail no Vercel, recomenda-se porta 465 com SSL/TLS (SMTP_PORT=465 e SMTP_SECURE=true).',
      'Para porta 587, use STARTTLS (SMTP_PORT=587 e SMTP_SECURE=false).',
      'Timeouts ajustados para execução serverless (5s conexão / 5s saudação / 8s socket).',
    ],
  });
});

// Contact Intake API (Server-side validation and confirmation)
registerRoute('post', '/api/contact', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, relationship, serviceInterest, message, honeypot } = req.body;

    // Honeypot check: anti-bot protection
    if (honeypot) {
      return res.status(200).json({ success: true, message: 'Solicitação recebida com sucesso.' });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 120) {
      return res.status(400).json({ error: 'Nome é obrigatório e deve ter até 120 caracteres.' });
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length < 8 || phone.length > 30) {
      return res.status(400).json({ error: 'Telefone de contato válido é obrigatório.' });
    }

    if (email && (typeof email !== 'string' || email.length > 160 || !email.includes('@'))) {
      return res.status(400).json({ error: 'E-mail fornecido é inválido.' });
    }

    if (message && (typeof message !== 'string' || message.length > 2000)) {
      return res.status(400).json({ error: 'Mensagem excede o limite de 2000 caracteres.' });
    }

    // SERVERLESS COMPATIBLE:
    // Await confirmation email delivery within try/catch so function lifecycle
    // does not terminate/freeze before SMTP transmission finishes.
    if (email && email.includes('@')) {
      try {
        const transporter = await getTransporter();
        await transporter.sendMail({
          from: `"${OFFICIAL_SENDER_NAME}" <${OFFICIAL_GMAIL}>`,
          replyTo: OFFICIAL_GMAIL,
          to: email.trim(),
          bcc: OFFICIAL_GMAIL,
          subject: 'Recebemos sua mensagem - Victoria Lar Residencial',
          html: `
            <div style="font-family: sans-serif; background-color: #FAF9F5; padding: 24px; color: #173D2B;">
              <div style="max-width: 550px; background: #ffffff; padding: 24px; border-radius: 16px; border: 1px solid #B8954A; margin: 0 auto;">
                <h2 style="color: #173D2B; font-family: Georgia, serif;">Olá, ${name.trim()}!</h2>
                <p>Recebemos sua solicitação de contato e interesse em <strong>${serviceInterest || 'nossos cuidados'}</strong>.</p>
                <p>Nossa equipe entrará em contato prontamente pelo telefone <strong>${phone.trim()}</strong> para tirar todas as suas dúvidas e acolher sua família.</p>
                <p style="margin-top: 20px; font-weight: bold; color: #173D2B;">Victoria Lar Residencial</p>
                <p style="font-size: 11px; color: #718096; margin-top: 10px;">E-mail oficial: ${OFFICIAL_GMAIL}</p>
              </div>
            </div>
          `,
        });
      } catch (e: any) {
        console.warn('[Victoria Lar Mailer] Aviso no envio de e-mail de contato simples:', sanitizeLog(e?.message || e));
      }
    }

    const leadRecord = {
      name: name.trim(),
      email: email ? email.trim() : null,
      phone: phone.trim(),
      relationship: relationship ? String(relationship).slice(0, 60) : 'Familiar',
      serviceInterest: serviceInterest ? String(serviceInterest).slice(0, 100) : 'Geral',
      message: message ? message.trim() : '',
      status: 'unread',
      type: 'form',
      createdAt: new Date().toISOString(),
      origin: 'landing_page_form',
    };

    return res.status(201).json({
      success: true,
      message: 'Mensagem enviada com sucesso! Um e-mail de confirmação foi encaminhado e nossa equipe retornará rapidamente.',
      data: leadRecord,
    });
  } catch (err: any) {
    console.error('Erro no processamento de contato:', sanitizeLog(err?.message || err));
    return res.status(500).json({ error: 'Falha no envio da mensagem. Tente novamente mais tarde.' });
  }
});

export { app, bookedAppointments, serverAvailabilityConfig };
export default app;
