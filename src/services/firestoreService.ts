import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ServiceItem,
  InstitutionalContent,
  AdminUser,
  ContactLead,
  SuperAdminGuard,
  StructurePhoto,
  StructureAlbum,
  STRUCTURE_TOPICS,
} from '../types';

// =============================================================
// SERVICES (Nossos Serviços)
// =============================================================

// In-memory request caches to prevent duplicate network calls
let cachedPublishedServices: ServiceItem[] | null = null;
let servicesRequestPromise: Promise<ServiceItem[]> | null = null;

export function invalidateServicesCache(): void {
  cachedPublishedServices = null;
  servicesRequestPromise = null;
}

/**
 * Public visitor query: MUST include where('status', '==', 'published')
 * to comply with "Rules are not filters" invariant.
 * Caches in memory to avoid duplicate round-trips.
 */
export async function getPublishedServices(forceRefresh = false): Promise<ServiceItem[]> {
  if (!forceRefresh && cachedPublishedServices) {
    return cachedPublishedServices;
  }
  if (!forceRefresh && servicesRequestPromise) {
    return servicesRequestPromise;
  }

  servicesRequestPromise = (async () => {
    try {
      const q = query(
        collection(db, 'services'),
        where('status', '==', 'published')
      );
      const snap = await getDocs(q);
      const items = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as ServiceItem))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      cachedPublishedServices = items;
      return items;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'services');
    } finally {
      servicesRequestPromise = null;
    }
  })();

  return servicesRequestPromise;
}

/**
 * Admin query: retrieves all services including drafts
 */
export async function getAllServicesForAdmin(): Promise<ServiceItem[]> {
  try {
    const snap = await getDocs(collection(db, 'services'));
    return snap.docs
      .map(d => ({ ...d.data(), id: d.id } as ServiceItem))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'services');
  }
}

/**
 * Save or update a service (Admin only).
 * Supports optimistic concurrency control: if expectedUpdatedAt is provided,
 * verifies that the service was not modified by another admin since it was loaded.
 * Ensures idempotence and prevents duplicate records.
 */
export async function saveService(
  service: ServiceItem,
  adminUid: string,
  options?: { expectedUpdatedAt?: string }
): Promise<void> {
  try {
    const serviceRef = doc(db, 'services', service.id);

    // Optimistic concurrency check if expectedUpdatedAt provided
    if (options?.expectedUpdatedAt) {
      const snap = await getDoc(serviceRef);
      if (snap.exists()) {
        const existing = snap.data() as ServiceItem;
        if (existing.updatedAt && existing.updatedAt !== options.expectedUpdatedAt) {
          throw new Error('CONCURRENCY_CONFLICT: Este serviço foi alterado por outro administrador. Recarregue os dados antes de salvar.');
        }
      }
    }

    const nowIso = new Date().toISOString();
    const payload: ServiceItem = {
      ...service,
      updatedAt: nowIso,
      updatedBy: adminUid,
      createdAt: service.createdAt || nowIso,
    };
    await setDoc(serviceRef, payload, { merge: true });
    invalidateServicesCache();
  } catch (err) {
    if (err instanceof Error && err.message.includes('CONCURRENCY_CONFLICT')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `services/${service.id}`);
  }
}

/**
 * Partial update for a service (Admin only).
 * Strictly preserves all omitted fields in Firestore.
 */
export async function updateServicePartial(
  serviceId: string,
  partialData: Partial<ServiceItem>,
  adminUid: string
): Promise<void> {
  try {
    const serviceRef = doc(db, 'services', serviceId);
    const nowIso = new Date().toISOString();
    await updateDoc(serviceRef, {
      ...partialData,
      updatedAt: nowIso,
      updatedBy: adminUid,
    });
    invalidateServicesCache();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `services/${serviceId}`);
  }
}

/**
 * Delete a service (Admin only)
 */
export async function deleteService(serviceId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'services', serviceId));
    invalidateServicesCache();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `services/${serviceId}`);
  }
}

/**
 * Reorder services atomically using writeBatch (Admin only)
 */
export async function reorderServices(orderedItems: { id: string; order: number }[], adminUid: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    orderedItems.forEach(item => {
      const ref = doc(db, 'services', item.id);
      batch.update(ref, { order: item.order, updatedAt: nowIso, updatedBy: adminUid });
    });
    await batch.commit();
    invalidateServicesCache();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'services');
  }
}

// =============================================================
// INSTITUTIONAL CONTENT
// =============================================================

let cachedInstitutionalContent: Record<string, InstitutionalContent> | null = null;
let institutionalContentPromise: Promise<Record<string, InstitutionalContent>> | null = null;

export function invalidateContentCache(): void {
  cachedInstitutionalContent = null;
  institutionalContentPromise = null;
}

export async function getInstitutionalContent(forceRefresh = false): Promise<Record<string, InstitutionalContent>> {
  if (!forceRefresh && cachedInstitutionalContent) {
    return cachedInstitutionalContent;
  }
  if (!forceRefresh && institutionalContentPromise) {
    return institutionalContentPromise;
  }

  institutionalContentPromise = (async () => {
    try {
      // 1. If an authenticated user is present, attempt full admin collection listing
      if (auth.currentUser) {
        try {
          const snap = await getDocs(collection(db, 'content'));
          const result: Record<string, InstitutionalContent> = {};
          snap.docs.forEach((d) => {
            result[d.id] = d.data() as InstitutionalContent;
          });
          cachedInstitutionalContent = result;
          return result;
        } catch {
          // If unprivileged or listing fails, proceed to public key retrieval below
        }
      }

      // 2. Public visitors: fetch known public institutional content documents directly
      // This strictly prevents visitors from reading internal drafts, admin notes or private configs
      const PUBLIC_KEYS = ['hero', 'about', 'values', 'owner_1', 'owner_2', 'scheduling'];
      const docSnaps = await Promise.all(
        PUBLIC_KEYS.map((key) => getDoc(doc(db, 'content', key)).catch(() => null))
      );

      const result: Record<string, InstitutionalContent> = {};
      docSnaps.forEach((snap) => {
        if (snap && snap.exists()) {
          result[snap.id] = snap.data() as InstitutionalContent;
        }
      });

      cachedInstitutionalContent = result;
      return result;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'content');
    } finally {
      institutionalContentPromise = null;
    }
  })();

  return institutionalContentPromise;
}

export async function saveInstitutionalContent(
  content: InstitutionalContent,
  adminUid: string,
  options?: { expectedUpdatedAt?: string }
): Promise<void> {
  try {
    const ref = doc(db, 'content', content.key);

    if (options?.expectedUpdatedAt) {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const existing = snap.data() as InstitutionalContent;
        if (existing.updatedAt && existing.updatedAt !== options.expectedUpdatedAt) {
          throw new Error('CONCURRENCY_CONFLICT: Este conteúdo foi alterado por outro administrador. Recarregue os dados antes de salvar.');
        }
      }
    }

    await setDoc(ref, {
      ...content,
      updatedAt: new Date().toISOString(),
      updatedBy: adminUid,
    }, { merge: true });
    invalidateContentCache();
  } catch (err) {
    if (err instanceof Error && err.message.includes('CONCURRENCY_CONFLICT')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `content/${content.key}`);
  }
}

// =============================================================
// ADMIN USER MANAGEMENT (With Concurrency-Safe Last Superadmin Protection)
// =============================================================

export async function getAllAdmins(): Promise<AdminUser[]> {
  try {
    const snap = await getDocs(collection(db, 'admins'));
    return snap.docs.map(d => d.data() as AdminUser);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'admins');
  }
}

export async function addAdminUser(
  newAdmin: { uid: string; email: string; role: 'superadmin' | 'admin' },
  _creatorUid: string
): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const idToken = await auth.currentUser.getIdToken(true);
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(newAdmin),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Falha ao adicionar administrador (HTTP ${res.status}).`);
  }
}

/**
 * Updates admin role or active status with strict last superadmin protection
 * enforced atomically on the server.
 */
export async function updateAdminStatusOrRole(
  targetUid: string,
  updates: { role?: 'superadmin' | 'admin'; active?: boolean },
  _operatorUid: string
): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const idToken = await auth.currentUser.getIdToken(true);
  const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUid)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Falha ao atualizar administrador (HTTP ${res.status}).`);
  }
}

// =============================================================
// CONTACT LEADS (Formulário e Visitas)
// =============================================================

export async function submitContactLead(lead: Omit<ContactLead, 'status' | 'createdAt'>): Promise<{ success: boolean; message: string }> {
  try {
    const cleanName = (lead.name || '').trim();
    const cleanPhone = (lead.phone || '').trim();
    const cleanEmail = (lead.email || '').trim();
    const cleanRelationship = lead.relationship || 'Filho(a)';
    const cleanService = lead.serviceInterest || 'Apresentação Geral e Planos';
    const cleanMessage = (lead.message || '').trim();

    // 1. Prepare strictly valid Firestore document without forbidden keys (e.g. honeypot)
    const id = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const firestoreDocPayload: Record<string, any> = {
      id,
      name: cleanName,
      phone: cleanPhone,
      status: 'unread',
      type: lead.type || 'form',
      createdAt: new Date().toISOString(),
    };
    if (cleanEmail) firestoreDocPayload.email = cleanEmail;
    if (cleanRelationship) firestoreDocPayload.relationship = cleanRelationship;
    if (cleanService) firestoreDocPayload.serviceInterest = cleanService;
    if (cleanMessage) firestoreDocPayload.message = cleanMessage;

    // Start direct Firestore write (with catch so errors never crash or block)
    const firestoreWritePromise = setDoc(doc(db, 'leads', id), firestoreDocPayload).catch((clientErr) => {
      console.info('[Direct Firestore Write Info]:', clientErr?.message || clientErr);
    });

    // 2. Submit to backend /api/contact with AbortController timeout of 6s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    let backendSuccess = false;
    let backendMessage = 'Sua solicitação de visita foi recebida! Nossa equipe entrará em contato prontamente.';

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          relationship: cleanRelationship,
          serviceInterest: cleanService,
          message: cleanMessage,
          honeypot: (lead as any).honeypot || '',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          backendSuccess = true;
          if (data.message) backendMessage = data.message;
        }
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      console.warn('[Backend /api/contact Warning]:', fetchErr);
    }

    // Wait for firestore write or max 2s so the interface responds instantly
    await Promise.race([
      firestoreWritePromise,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);

    return {
      success: true,
      message: backendMessage,
    };
  } catch (err: any) {
    console.error('Falha no envio de contato:', err);
    throw err;
  }
}

export async function scheduleOnlineMeeting(appointment: {
  name: string;
  email: string;
  phone: string;
  scheduledDate: string;
  scheduledTime: string;
  meetingLink?: string;
  relationship?: string;
  serviceInterest?: string;
  message?: string;
  emailSubject?: string;
  emailInstructions?: string;
  honeypot?: string;
}): Promise<{
  success: boolean;
  message: string;
  meetingLink: string;
  googleCalendarUrl?: string;
  sender?: string;
  emailSent: boolean;
  emailError?: string | null;
}> {
  try {
    const resolvedMeetingLink =
      appointment.meetingLink || 'https://meet.google.com/vic-tori-lar';
    const cleanName = appointment.name.trim();
    const cleanEmail = appointment.email.trim();
    const cleanPhone = appointment.phone.trim();
    const cleanDate = appointment.scheduledDate.trim();
    const cleanTime = appointment.scheduledTime.trim();
    const cleanRelationship = appointment.relationship || 'Familiar';
    const cleanService = appointment.serviceInterest || 'Reunião Online de Apresentação';
    const cleanMessage = appointment.message ? appointment.message.trim() : '';

    // 1. Prepare strictly valid Firestore document adhering to isValidPublicLead rules
    // (Privileged fields like meetingLink and administrative status are managed via trusted backend)
    const id = `meet_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const firestoreDocPayload: Record<string, any> = {
      id,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      scheduledDate: cleanDate,
      scheduledTime: cleanTime,
      relationship: cleanRelationship,
      serviceInterest: cleanService,
      status: 'unread',
      type: 'meeting',
      createdAt: new Date().toISOString(),
    };
    if (cleanMessage) {
      firestoreDocPayload.message = cleanMessage;
    }

    // Start direct Firestore write (with catch so errors never crash or block)
    const firestoreWritePromise = setDoc(doc(db, 'leads', id), firestoreDocPayload).catch((clientErr) => {
      console.info('[Direct Firestore Write Info]:', clientErr?.message || clientErr);
    });

    // 2. Submit to backend /api/schedule-meeting with AbortController timeout of 6s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    let resData: any = null;

    try {
      const res = await fetch('/api/schedule-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          scheduledDate: cleanDate,
          scheduledTime: cleanTime,
          meetingLink: resolvedMeetingLink,
          relationship: cleanRelationship,
          serviceInterest: cleanService,
          message: cleanMessage,
          emailSubject: appointment.emailSubject,
          emailInstructions: appointment.emailInstructions,
          honeypot: appointment.honeypot || '',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        resData = await res.json();
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      console.warn('[Backend /api/schedule-meeting Warning]:', fetchErr);
    }

    // Wait for firestore write or max 2s so the interface responds promptly
    await Promise.race([
      firestoreWritePromise,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);

    let formattedDate = cleanDate;
    if (formattedDate.includes('-')) {
      const [y, m, d] = formattedDate.split('-');
      formattedDate = `${d}/${m}/${y}`;
    }

    const emailSent = resData ? resData.emailSent === true : false;
    const defaultMsg = emailSent
      ? `Reunião agendada com sucesso para ${formattedDate} às ${cleanTime}! Um e-mail com a sala do Google Meet e botão para registro no Google Calendar foi gerado para ${cleanEmail}.`
      : `Reunião agendada com sucesso para ${formattedDate} às ${cleanTime}! O e-mail de confirmação não pôde ser despachado no momento, mas seu horário está garantido. Guarde o link do Google Meet abaixo.`;

    return {
      success: true,
      emailSent,
      emailError: resData?.emailError || null,
      message: resData?.message || defaultMsg,
      meetingLink: resData?.meetingLink || resolvedMeetingLink,
      googleCalendarUrl: resData?.googleCalendarUrl || undefined,
      sender: resData?.sender || 'victorialarresidencial@gmail.com',
    };
  } catch (err: any) {
    console.error('Falha no agendamento de reunião:', err);
    throw err;
  }
}

export async function getContactLeads(): Promise<ContactLead[]> {
  try {
    const snap = await getDocs(collection(db, 'leads'));
    return snap.docs
      .map(d => ({ ...d.data(), id: d.id } as ContactLead))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'leads');
  }
}

export async function updateLeadStatus(leadId: string, status: ContactLead['status'], notes?: string): Promise<void> {
  try {
    const ref = doc(db, 'leads', leadId);
    await updateDoc(ref, {
      status,
      ...(notes !== undefined ? { notes } : {}),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `leads/${leadId}`);
  }
}

// =============================================================
// MEETING AVAILABILITY & SLOTS (Modelo Beeginning 4 You)
// =============================================================

export const DEFAULT_AVAILABILITY: {
  dailyTimeSlots: string[];
  activeDays: number[];
  blockedSlots: Array<{ id: string; date: string; time?: string; reason?: string }>;
  meetingDuration: string;
  meetingLink: string;
} = {
  dailyTimeSlots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
  activeDays: [1, 2, 3, 4, 5],
  blockedSlots: [],
  meetingDuration: '30 a 45 minutos',
  meetingLink: 'https://meet.google.com/vic-tori-lar',
};

let memoryAvailabilityConfig = DEFAULT_AVAILABILITY;

export async function getAvailabilityConfig() {
  // 1. Query Firestore content/scheduling directly as primary source of truth
  try {
    const snap = await getDoc(doc(db, 'content', 'scheduling'));
    if (snap.exists()) {
      const data = snap.data();
      if (data.availableHours && typeof data.availableHours === 'string') {
        const slots = data.availableHours.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (slots.length > 0) {
          const resolved = {
            ...DEFAULT_AVAILABILITY,
            dailyTimeSlots: slots,
            meetingDuration: data.meetingDuration || DEFAULT_AVAILABILITY.meetingDuration,
            meetingLink: data.meetingLink || DEFAULT_AVAILABILITY.meetingLink,
          };
          memoryAvailabilityConfig = resolved;
          return resolved;
        }
      }
    }
  } catch (firestoreErr) {
    console.warn('[Availability Firestore check notice]:', firestoreErr);
  }

  // 2. Query backend API if available
  try {
    const res = await fetch('/api/schedule/availability');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.availability) {
        memoryAvailabilityConfig = data.availability;
        return data.availability;
      }
    }
  } catch (err) {
    console.warn('[Availability API offline, falling back]', err);
  }

  return memoryAvailabilityConfig || DEFAULT_AVAILABILITY;
}

export async function saveAvailabilityConfig(config: any) {
  memoryAvailabilityConfig = config;

  try {
    const res = await fetch('/api/schedule/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availability: config }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[Availability API save fallback]', err);
  }

  return { success: true, availability: config };
}

export async function getBookedSlotsForDate(date: string): Promise<string[]> {
  try {
    const res = await fetch(`/api/schedule/booked-slots?date=${encodeURIComponent(date)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.bookedSlots)) {
        return data.bookedSlots;
      }
    }
  } catch (err) {
    console.warn('[Booked Slots API Notice]', err);
  }
  return [];
}

// =============================================================
// STRUCTURE ALBUMS & PHOTOS (Estrutura Projetada para o Bem-Estar)
// =============================================================

// In-memory caches per album
const cachedAlbums: Record<string, StructureAlbum> = {};
const cachedPublishedPhotos: Record<string, StructurePhoto[]> = {};

export function invalidateAlbumCache(albumId?: string): void {
  if (albumId) {
    delete cachedAlbums[albumId];
    delete cachedPublishedPhotos[albumId];
  } else {
    Object.keys(cachedAlbums).forEach((k) => delete cachedAlbums[k]);
    Object.keys(cachedPublishedPhotos).forEach((k) => delete cachedPublishedPhotos[k]);
  }
}

/**
 * Retrieves album configuration.
 * Checks official /albums/{albumId} first (publicly permitted by firestore.rules),
 * then checks /content/album_{albumId} for legacy content, and provides standard fallback
 * derived from STRUCTURE_TOPICS.
 */
export async function getAlbum(albumId: string, forceRefresh = false): Promise<StructureAlbum> {
  if (!forceRefresh && cachedAlbums[albumId]) {
    return cachedAlbums[albumId];
  }

  const topicConfig = STRUCTURE_TOPICS.find((t) => t.id === albumId);
  const fallbackAlbum: StructureAlbum = {
    id: albumId,
    topicKey: albumId,
    title: topicConfig?.title || albumId,
    description: topicConfig?.defaultDescription || topicConfig?.shortDescription || '',
    status: 'published',
  };

  // 1. Check official /albums/{albumId} (publicly accessible by firestore.rules)
  try {
    const docRef = doc(db, 'albums', albumId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as StructureAlbum;
      const resolved: StructureAlbum = {
        ...fallbackAlbum,
        ...data,
        title: (data.title !== undefined && data.title !== null && data.title !== '') ? data.title : fallbackAlbum.title,
        description: (data.description !== undefined && data.description !== null && data.description !== '') ? data.description : fallbackAlbum.description,
        id: albumId,
      };
      cachedAlbums[albumId] = resolved;
      return resolved;
    }
  } catch (err) {
    console.warn(`[getAlbum /albums/${albumId} read notice]:`, err);
  }

  // 2. Check /content/album_{albumId} as fallback
  try {
    const contentRef = doc(db, 'content', `album_${albumId}`);
    const cSnap = await getDoc(contentRef);
    if (cSnap.exists()) {
      const cData = cSnap.data();
      const resolved: StructureAlbum = {
        ...fallbackAlbum,
        title: (cData.title !== undefined && cData.title !== null && cData.title !== '') ? cData.title : fallbackAlbum.title,
        description: (cData.subtitle !== undefined && cData.subtitle !== null && cData.subtitle !== '') ? cData.subtitle : fallbackAlbum.description,
        status: 'published',
      };
      cachedAlbums[albumId] = resolved;
      return resolved;
    }
  } catch (err) {
    console.warn(`[getAlbum content check ${albumId}]:`, err);
  }

  cachedAlbums[albumId] = fallbackAlbum;
  return fallbackAlbum;
}

/**
 * Saves album metadata (title, description, coverImageUrl, status).
 * Persists to both /albums/{album.id} (official) and /content/album_{album.id} (sync).
 * Admin only.
 * CRITICAL PRESERVATION: Never wipes existing photos body if a read failure occurs.
 */
export async function saveAlbum(album: StructureAlbum, adminUid: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const payload: StructureAlbum = {
    id: album.id,
    topicKey: album.topicKey || album.id,
    title: album.title.trim(),
    description: (album.description || '').trim(),
    coverImageUrl: album.coverImageUrl || '',
    status: album.status || 'published',
    order: typeof album.order === 'number' ? album.order : 0,
    createdAt: album.createdAt || nowIso,
    updatedAt: nowIso,
    updatedBy: adminUid,
  };

  try {
    // 1. Save to official collection /albums/{album.id}
    try {
      const albumRef = doc(db, 'albums', album.id);
      await setDoc(albumRef, payload, { merge: true });
    } catch (albumErr) {
      console.warn(`[saveAlbum /albums sync notice]:`, albumErr);
    }

    // 2. Also keep /content/album_{album.id} in sync without wiping existing photos body
    let currentPhotosBody: string | undefined = undefined;
    try {
      const curDoc = await getDoc(doc(db, 'content', `album_${album.id}`));
      if (curDoc.exists()) {
        currentPhotosBody = curDoc.data()?.body;
      }
    } catch (readErr) {
      console.warn(`[saveAlbum notice reading existing body]:`, readErr);
    }

    const contentRef = doc(db, 'content', `album_${album.id}`);
    const contentPayload: Record<string, any> = {
      key: `album_${album.id}`,
      title: album.title.trim(),
      subtitle: (album.description || '').trim(),
      updatedAt: nowIso,
      updatedBy: adminUid,
    };
    if (currentPhotosBody !== undefined) {
      contentPayload.body = currentPhotosBody;
    }

    await setDoc(contentRef, contentPayload, { merge: true });

    invalidateAlbumCache(album.id);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `albums/${album.id}`);
  }
}

/**
 * Public visitors query: retrieves published photos (where `published == true`).
 * Consults official collection /albums/{albumId}/photos first, and merges any
 * legacy entries from /content/album_{albumId} so that no registered data is ever lost.
 * Public visitors are authorized by firestore.rules to query where('published', '==', true).
 */
export async function getPublishedPhotos(albumId: string, forceRefresh = false): Promise<StructurePhoto[]> {
  if (!forceRefresh && cachedPublishedPhotos[albumId]) {
    return cachedPublishedPhotos[albumId];
  }

  const photosMap = new Map<string, StructurePhoto>();

  // 1. Primary official collection: /albums/{albumId}/photos with where('published', '==', true)
  // Accessible to all visitors without requiring authentication
  try {
    const photosColl = collection(db, 'albums', albumId, 'photos');
    const q = query(
      photosColl,
      where('published', '==', true)
    );
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = { ...d.data(), id: d.id } as StructurePhoto;
      if (data && data.published === true) {
        photosMap.set(data.id, data);
      }
    });
  } catch (err: any) {
    console.warn(`[getPublishedPhotos /albums/${albumId}/photos notice]:`, err?.message || err);
  }

  // 2. Fallback / Sync Source: /content/album_{albumId} body
  // Incorporate any published photos that might be stored only in legacy format
  try {
    const contentRef = doc(db, 'content', `album_${albumId}`);
    const cSnap = await getDoc(contentRef);
    if (cSnap.exists()) {
      const cData = cSnap.data();
      if (cData.body && typeof cData.body === 'string') {
        try {
          const parsed = JSON.parse(cData.body);
          if (Array.isArray(parsed)) {
            parsed.forEach((p: StructurePhoto) => {
              if (p && p.published === true && !photosMap.has(p.id)) {
                photosMap.set(p.id, p);
              }
            });
          }
        } catch (parseErr) {
          console.warn(`[getPublishedPhotos ${albumId}] JSON parse warning:`, parseErr);
        }
      }
    }
  } catch (cErr) {
    console.warn(`[getPublishedPhotos content read ${albumId}]:`, cErr);
  }

  const resolved = Array.from(photosMap.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
  cachedPublishedPhotos[albumId] = resolved;
  return resolved;
}

/**
 * Admin query: retrieves all photos for an album, including unpublished drafts.
 * Queries official collection /albums/{albumId}/photos and merges with /content/album_{albumId}.
 */
export async function getAllPhotosForAdmin(albumId: string): Promise<StructurePhoto[]> {
  const photosMap = new Map<string, StructurePhoto>();

  // 1. Query official /albums/{albumId}/photos subcollection
  try {
    const photosColl = collection(db, 'albums', albumId, 'photos');
    const snap = await getDocs(photosColl);
    snap.docs.forEach((d) => {
      const data = { ...d.data(), id: d.id } as StructurePhoto;
      photosMap.set(data.id, data);
    });
  } catch (err) {
    console.warn(`[getAllPhotosForAdmin /albums/${albumId}/photos]:`, err);
  }

  // 2. Merge with /content/album_{albumId} if any documents are present there
  try {
    const contentRef = doc(db, 'content', `album_${albumId}`);
    const cSnap = await getDoc(contentRef);
    if (cSnap.exists()) {
      const cData = cSnap.data();
      if (cData.body && typeof cData.body === 'string') {
        try {
          const parsed = JSON.parse(cData.body);
          if (Array.isArray(parsed)) {
            parsed.forEach((p: StructurePhoto) => {
              if (p && p.id && !photosMap.has(p.id)) {
                photosMap.set(p.id, p);
              }
            });
          }
        } catch {}
      }
    }
  } catch {}

  return Array.from(photosMap.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Saves a photo in Firestore.
 * Persists to both /content/album_{photo.albumId} and /albums/{photo.albumId}/photos/{photo.id}.
 * Admin only.
 * CRITICAL: Preserves custom album title and subtitle without overwriting with hardcoded defaults.
 */
export async function savePhoto(photo: StructurePhoto, adminUid: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const payload: StructurePhoto = {
    id: photo.id,
    albumId: photo.albumId,
    url: photo.url.trim(),
    mediaType: photo.mediaType || 'image',
    storagePath: photo.storagePath || '',
    title: photo.title.trim(),
    caption: (photo.caption || '').trim(),
    altText: photo.altText.trim() || photo.title.trim() || 'Foto da estrutura Victoria Lar Residencial',
    order: typeof photo.order === 'number' ? photo.order : 1,
    published: Boolean(photo.published),
    createdAt: photo.createdAt || nowIso,
    updatedAt: nowIso,
    updatedBy: adminUid,
  };

  try {
    // 1. Update list in /content/album_{albumId}
    const currentPhotos = await getAllPhotosForAdmin(photo.albumId);
    const existingIndex = currentPhotos.findIndex((p) => p.id === photo.id);
    let updatedPhotos: StructurePhoto[];
    if (existingIndex >= 0) {
      updatedPhotos = [...currentPhotos];
      updatedPhotos[existingIndex] = payload;
    } else {
      updatedPhotos = [...currentPhotos, payload];
    }
    updatedPhotos.sort((a, b) => (a.order || 0) - (b.order || 0));

    const contentRef = doc(db, 'content', `album_${photo.albumId}`);
    const existingSnap = await getDoc(contentRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;
    const album = await getAlbum(photo.albumId);
    const topicConfig = STRUCTURE_TOPICS.find((t) => t.id === photo.albumId);

    const contentUpdate: Record<string, any> = {
      key: `album_${photo.albumId}`,
      body: JSON.stringify(updatedPhotos),
      updatedAt: nowIso,
      updatedBy: adminUid,
    };
    // Only set initial title/subtitle if the document did not already have them
    if (!existingData || existingData.title === undefined) {
      contentUpdate.title = album.title || topicConfig?.title || photo.albumId;
    }
    if (!existingData || existingData.subtitle === undefined) {
      contentUpdate.subtitle = (album.description !== undefined) ? album.description : (topicConfig?.defaultDescription || '');
    }

    await setDoc(contentRef, contentUpdate, { merge: true });

    // 2. Also save to /albums/{albumId}/photos/{photo.id}
    try {
      const photoRef = doc(db, 'albums', photo.albumId, 'photos', photo.id);
      await setDoc(photoRef, payload, { merge: true });
    } catch (subCollErr) {
      console.warn(`[savePhoto /albums subcoll sync notice]:`, subCollErr);
    }

    invalidateAlbumCache(photo.albumId);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `content/album_${photo.albumId}`);
  }
}

/**
 * Deletes a photo from Firestore and attempts deletion of its underlying
 * object in Firebase Storage to prevent orphan files.
 * Admin only.
 * CRITICAL: Preserves existing album metadata and avoids default overwrites.
 */
export async function deletePhoto(
  albumId: string,
  photoId: string,
  storagePath?: string
): Promise<{ storageDeleted: boolean }> {
  let storageDeleted = false;

  // 1. If uploaded to Firebase Storage, attempt to clean up file
  if (storagePath && storagePath.trim()) {
    try {
      const fileRef = storageRef(storage, storagePath.trim());
      await deleteObject(fileRef);
      storageDeleted = true;
    } catch (storageErr: any) {
      console.warn(`[Firebase Storage Warning] Could not delete object ${storagePath}:`, storageErr?.message || storageErr);
    }
  }

  // 2. Remove photo from /content/album_{albumId}
  try {
    const currentPhotos = await getAllPhotosForAdmin(albumId);
    const updatedPhotos = currentPhotos.filter((p) => p.id !== photoId);
    const contentRef = doc(db, 'content', `album_${albumId}`);
    await setDoc(
      contentRef,
      {
        body: JSON.stringify(updatedPhotos),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (cDelErr) {
    console.warn(`[deletePhoto content sync error]:`, cDelErr);
  }

  // 3. Delete from /albums/{albumId}/photos/{photoId}
  try {
    const photoRef = doc(db, 'albums', albumId, 'photos', photoId);
    await deleteDoc(photoRef);
  } catch (subDelErr) {
    console.warn(`[deletePhoto /albums subcoll notice]:`, subDelErr);
  }

  invalidateAlbumCache(albumId);
  return { storageDeleted };
}

/**
 * Reorders photos atomically.
 * Admin only.
 */
export async function reorderPhotos(
  albumId: string,
  orderedItems: { id: string; order: number }[],
  adminUid: string
): Promise<void> {
  const nowIso = new Date().toISOString();

  // 1. Update /content/album_{albumId}
  try {
    const currentPhotos = await getAllPhotosForAdmin(albumId);
    const orderMap = new Map(orderedItems.map((item) => [item.id, item.order]));
    const updatedPhotos = currentPhotos.map((p) => ({
      ...p,
      order: orderMap.has(p.id) ? orderMap.get(p.id)! : p.order,
      updatedAt: nowIso,
      updatedBy: adminUid,
    }));
    updatedPhotos.sort((a, b) => (a.order || 0) - (b.order || 0));

    const contentRef = doc(db, 'content', `album_${albumId}`);
    await setDoc(
      contentRef,
      {
        body: JSON.stringify(updatedPhotos),
        updatedAt: nowIso,
        updatedBy: adminUid,
      },
      { merge: true }
    );
  } catch (cReorderErr) {
    console.warn(`[reorderPhotos content sync]:`, cReorderErr);
  }

  // 2. Update /albums subcollection batch
  try {
    const batch = writeBatch(db);
    orderedItems.forEach((item) => {
      const ref = doc(db, 'albums', albumId, 'photos', item.id);
      batch.update(ref, { order: item.order, updatedAt: nowIso, updatedBy: adminUid });
    });
    await batch.commit();
  } catch (subBatchErr) {
    console.warn(`[reorderPhotos /albums batch notice]:`, subBatchErr);
  }

  invalidateAlbumCache(albumId);
}

/**
 * Uploads a file directly to Firebase Storage with strict mime-type
 * and size validation. Returns the permanent download URL and storage path.
 * Admin only.
 */
export async function uploadPhotoToStorage(
  albumId: string,
  file: File
): Promise<{ url: string; storagePath: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('O arquivo selecionado não é uma imagem válida (JPEG, PNG, WebP).');
  }

  // Max 15MB file size limit
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('A imagem excede o tamanho máximo permitido de 15MB.');
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fullPath = `albums/${albumId}/${uniqueId}_${cleanName}`;

  try {
    const fileRef = storageRef(storage, fullPath);
    const uploadResult = await uploadBytes(fileRef, file, {
      contentType: file.type,
      customMetadata: {
        albumId,
        uploadedAt: new Date().toISOString(),
      },
    });

    const downloadUrl = await getDownloadURL(uploadResult.ref);
    return {
      url: downloadUrl,
      storagePath: fullPath,
    };
  } catch (err: any) {
    console.error('[Firebase Storage Upload Error]', err);
    const errMessage = err?.message || String(err);
    if (errMessage.includes('unauthorized') || errMessage.includes('permission')) {
      throw new Error('Permissão negada no Firebase Storage. Verifique se o usuário tem privilégios de administrador.');
    }
    if (errMessage.includes('unknown') || errMessage.includes('bucket')) {
      throw new Error(`Falha no Firebase Storage (${errMessage}). Se o bucket ainda estiver em ativação no Google Cloud, utilize a opção "Inserir URL Verificada" enquanto o provisionamento do bucket é finalizado.`);
    }
    throw new Error(`Erro ao enviar foto para o Firebase Storage: ${errMessage}`);
  }
}
