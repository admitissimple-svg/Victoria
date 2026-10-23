import crypto from 'crypto';

interface DecodedTokenPayload {
  sub: string;
  uid: string;
  email?: string;
  email_verified?: boolean;
  aud?: string;
  iss?: string;
  exp?: number;
  iat?: number;
  auth_time?: number;
  [key: string]: any;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let cachedCerts: CertCache | null = null;

/**
 * Fetches Google's public x509 certificates used to sign Firebase ID Tokens.
 * Caches with TTL based on HTTP Cache-Control header or 1 hour default.
 */
async function getGooglePublicCertificates(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && cachedCerts.expiresAt > now) {
    return cachedCerts.certs;
  }

  try {
    const response = await fetch(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
    );

    if (!response.ok) {
      throw new Error(`Falha ao obter chaves públicas do Google (HTTP ${response.status})`);
    }

    const certs = (await response.json()) as Record<string, string>;

    // Calculate max-age from Cache-Control header
    let ttlMs = 3600 * 1000; // 1 hour default
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl) {
      const match = cacheControl.match(/max-age=(\d+)/);
      if (match && match[1]) {
        ttlMs = parseInt(match[1], 10) * 1000;
      }
    }

    cachedCerts = {
      certs,
      expiresAt: now + ttlMs,
    };

    return certs;
  } catch (err: any) {
    if (cachedCerts && Object.keys(cachedCerts.certs).length > 0) {
      // Use stale cache on network glitch
      return cachedCerts.certs;
    }
    throw new Error(`Não foi possível carregar as chaves de verificação do Google: ${err?.message || err}`);
  }
}

/**
 * Cryptographically verifies a Firebase Auth ID Token using Google's public x509 certs.
 * Enforces RS256 algorithm, expiration, issuance, audience, and issuer claims.
 */
export async function verifyFirebaseIdToken(
  token: string,
  expectedProjectId?: string | null
): Promise<DecodedTokenPayload> {
  if (!token || typeof token !== 'string') {
    throw new Error('TOKEN_MISSING: Token de autenticação Firebase não fornecido.');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new Error('TOKEN_MALFORMED: Formato do token JWT inválido (esperado 3 partes separadas por ponto).');
  }

  const [rawHeader, rawPayload, rawSignature] = parts;

  let header: { alg?: string; kid?: string; typ?: string };
  let payload: DecodedTokenPayload;

  try {
    header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('TOKEN_DECODE_ERROR: Não foi possível decodificar o cabeçalho ou payload do token JWT.');
  }

  if (header.alg !== 'RS256') {
    throw new Error(`TOKEN_ALGORITHM_INVALID: Algoritmo esperado RS256, obtido "${header.alg}".`);
  }

  if (!header.kid || typeof header.kid !== 'string') {
    throw new Error('TOKEN_KID_MISSING: Identificador de chave pública (kid) ausente no cabeçalho do token.');
  }

  // 1. Fetch public certificates
  let certs = await getGooglePublicCertificates();
  let cert = certs[header.kid];

  if (!cert) {
    // Force refresh cache once in case key rotation occurred
    cachedCerts = null;
    certs = await getGooglePublicCertificates();
    cert = certs[header.kid];
  }

  if (!cert) {
    throw new Error(`TOKEN_KEY_UNKNOWN: Chave pública com kid "${header.kid}" não encontrada entre os certificados válidos do Google.`);
  }

  // 2. Cryptographic signature check (RS256 with public cert)
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${rawHeader}.${rawPayload}`);
  const isSignatureValid = verifier.verify(cert, rawSignature, 'base64url');

  if (!isSignatureValid) {
    throw new Error('TOKEN_SIGNATURE_INVALID: Assinatura criptográfica do token Firebase inválida ou corrompida.');
  }

  // 3. Claims verification
  const nowInSeconds = Math.floor(Date.now() / 1000);

  // Check expiration (exp)
  if (!payload.exp || typeof payload.exp !== 'number' || payload.exp < nowInSeconds) {
    throw new Error('TOKEN_EXPIRED: O token Firebase expirou. É necessário renovar a autenticação.');
  }

  // Check issuance time (iat) - mandatory in Firebase ID Tokens
  if (!payload.iat || typeof payload.iat !== 'number') {
    throw new Error('TOKEN_IAT_MISSING: O token não possui o carimbo de emissão (iat) numérico obrigatório.');
  }

  const maxClockSkew = 300; // 5 minutes max clock skew
  if (payload.iat > nowInSeconds + maxClockSkew) {
    throw new Error('TOKEN_NOT_YET_VALID: O token foi emitido em data futura incompatível.');
  }

  if (payload.exp <= payload.iat) {
    throw new Error('TOKEN_EXPIRATION_INVALID: A data de expiração do token deve ser posterior à data de emissão.');
  }

  // Check auth_time if present
  if (payload.auth_time !== undefined) {
    if (typeof payload.auth_time !== 'number' || payload.auth_time > nowInSeconds + maxClockSkew) {
      throw new Error('TOKEN_AUTH_TIME_INVALID: Horário de autenticação informado é inválido.');
    }
  }

  // Strictly enforce audience (aud) and issuer (iss)
  let targetProjectId =
    expectedProjectId ||
    process.env.VITE_FIREBASE_PROJECT_ID?.trim() ||
    process.env.FIREBASE_PROJECT_ID?.trim();
  if (!targetProjectId) {
    try {
      const config = await import('../firebase-applet-config.json');
      targetProjectId = (config as any).default?.projectId || (config as any).projectId;
    } catch {
      // ignore
    }
  }
  if (!targetProjectId) {
    targetProjectId = 'victoria-lar-residencial';
  }

  if (targetProjectId) {
    if (payload.aud !== targetProjectId) {
      throw new Error(`TOKEN_AUDIENCE_MISMATCH: O token pertence ao projeto "${payload.aud}", mas o servidor espera "${targetProjectId}".`);
    }

    const expectedIssuer = `https://securetoken.google.com/${targetProjectId}`;
    if (payload.iss !== expectedIssuer) {
      throw new Error(`TOKEN_ISSUER_MISMATCH: O emissor do token "${payload.iss}" é diferente do esperado "${expectedIssuer}".`);
    }
  } else {
    throw new Error('CONFIG_ERROR: ID do projeto Firebase não definido para verificação de audiência e emissor do token.');
  }

  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim().length === 0 || payload.sub.length > 128) {
    throw new Error('TOKEN_SUBJECT_INVALID: Identificador de usuário (sub/uid) inválido no token.');
  }

  payload.uid = payload.sub;
  return payload;
}

/**
 * Validates that the token represents the verified official owner of Victoria Lar Residencial.
 * Enforces email_verified === true AND email === 'victorialarresidencial@gmail.com'.
 */
export async function requireVerifiedOwner(
  token: string,
  expectedProjectId?: string | null
): Promise<{ uid: string; email: string }> {
  const payload = await verifyFirebaseIdToken(token, expectedProjectId);

  const cleanEmail = (payload.email || '').trim().toLowerCase();
  const authorizedOwnerEmail = 'victorialarresidencial@gmail.com';

  if (!payload.email_verified) {
    throw new Error('EMAIL_NOT_VERIFIED: A conta conectada não possui e-mail verificado junto ao Google.');
  }

  if (cleanEmail !== authorizedOwnerEmail) {
    throw new Error(`UNAUTHORIZED_OWNER: O e-mail autenticado ("${cleanEmail}") não é a conta institucional proprietária oficial ("${authorizedOwnerEmail}").`);
  }

  return {
    uid: payload.sub,
    email: cleanEmail,
  };
}

/**
 * Validates that the token represents an active administrator.
 * Enforces email_verified === true AND active === true in the live Firestore /admins/{uid} document.
 * This guarantees immediate revocation of privileges upon deactivation even if the JWT has not expired.
 */
export async function requireActiveAdmin(
  token: string,
  expectedProjectId?: string | null
): Promise<{ uid: string; email: string; role: 'superadmin' | 'admin' }> {
  const payload = await verifyFirebaseIdToken(token, expectedProjectId);

  if (!payload.email_verified) {
    throw new Error('EMAIL_NOT_VERIFIED: A conta conectada não possui e-mail verificado.');
  }

  const cleanEmail = (payload.email || '').trim().toLowerCase();
  const uid = payload.sub;

  const { getServerFirestore } = await import('./firebaseAdmin');
  const serverDb = getServerFirestore();
  const adminSnap = await serverDb.collection('admins').doc(uid).get();

  if (!adminSnap.exists) {
    throw new Error('FORBIDDEN_NOT_ADMIN: Conta não cadastrada no diretório de administradores.');
  }

  const data = adminSnap.data();
  if (data?.active !== true) {
    throw new Error('FORBIDDEN_ADMIN_DEACTIVATED: Conta administrativa está inativa ou foi desativada.');
  }

  return {
    uid,
    email: cleanEmail,
    role: data.role === 'superadmin' ? 'superadmin' : 'admin',
  };
}

/**
 * Validates that the token represents an active superadministrator.
 * Enforces email_verified === true, active === true, and role === 'superadmin' in /admins/{uid}.
 */
export async function requireActiveSuperAdmin(
  token: string,
  expectedProjectId?: string | null
): Promise<{ uid: string; email: string }> {
  const admin = await requireActiveAdmin(token, expectedProjectId);

  if (admin.role !== 'superadmin') {
    throw new Error('FORBIDDEN_NOT_SUPERADMIN: Operação reservada exclusivamente para superadministradores ativos.');
  }

  return {
    uid: admin.uid,
    email: admin.email,
  };
}

/**
 * Records an official immutable server-side audit log directly into Firestore /auditLogs
 * using the server authority (Firebase Admin SDK).
 */
export async function recordServerAuditLog(params: {
  action: string;
  performedByUid: string;
  performedByEmail: string;
  targetResource: string;
  details: string;
}): Promise<void> {
  try {
    const { getServerFirestore } = await import('./firebaseAdmin');
    const serverDb = getServerFirestore();

    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const logRef = serverDb.collection('auditLogs').doc(logId);

    await logRef.set({
      id: logId,
      action: params.action,
      performedByUid: params.performedByUid,
      performedByEmail: params.performedByEmail,
      targetResource: params.targetResource,
      details: params.details,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Server Audit Logger Error]:', err?.message || err);
  }
}

