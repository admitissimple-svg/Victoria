export type Role = 'superadmin' | 'admin';

export interface AdminUser {
  uid: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  bootstrapStatus?: 'PENDING_CLAIMS' | 'COMPLETED';
}

export interface SuperAdminGuard {
  activeSuperAdminCount: number;
  activeSuperAdminUids: string[];
  version: number;
  updatedAt?: string;
}

export type BootstrapStatus = 'UNINITIALIZED' | 'IN_PROGRESS' | 'COMPLETED';

export interface BootstrapRecord {
  status: BootstrapStatus;
  bootstrapId?: string;
  superAdminUid?: string;
  startedAt?: number;
  expiresAt?: number;
  completedAt?: number;
  lockedPermanently: boolean;
}

export type ServiceStatus = 'draft' | 'published';

export interface ServiceItem {
  id: string;
  title: string;
  summary: string;
  description?: string;
  icon?: string;
  category?: 'assistencial' | 'saude' | 'hotelaria' | 'lazer' | string;
  order: number;
  status: ServiceStatus;
  highlight?: boolean;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface InstitutionalContent {
  key: string;
  title: string;
  subtitle?: string;
  body?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  visitingHours?: string;
  imageUrl?: string;
  imageCaption?: string;
  role?: string;
  quote?: string;
  tag?: string;
  meetingLink?: string;
  availableHours?: string;
  meetingDuration?: string;
  whatsappMessage?: string;
  emailSubject?: string;
  emailInstructions?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type LeadStatus = 'unread' | 'read' | 'contacted' | 'scheduled' | 'archived';

export interface ContactLead {
  id?: string;
  name: string;
  email?: string;
  phone: string;
  relationship?: string;
  serviceInterest?: string;
  message?: string;
  status: LeadStatus;
  notes?: string;
  createdAt: string;
  scheduledDate?: string;
  scheduledTime?: string;
  meetingLink?: string;
  type?: 'meeting' | 'form' | 'whatsapp';
}

export interface BlockedSlot {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // '' or 'ALL_DAY' or '09:00'
  reason?: string;
  createdAt?: string;
}

export interface AvailabilityConfig {
  dailyTimeSlots: string[];
  activeDays?: number[]; // [0,1,2,3,4,5,6] (1=Seg ... 0=Dom)
  blockedSlots: BlockedSlot[];
  slotDurationMinutes?: number;
  meetingLink?: string;
  meetingDuration?: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  performedByUid: string;
  performedByEmail?: string;
  targetResource?: string;
  details?: string;
  timestamp: string;
}

export type StructureMediaType = 'image' | 'video';

export interface StructurePhoto {
  id: string;
  albumId: string;
  url: string;
  mediaType?: StructureMediaType;
  storagePath?: string;
  title: string;
  caption?: string;
  altText: string;
  order: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export type StructureMediaItem = StructurePhoto;

export interface StructureAlbum {
  id: string;
  topicKey: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  order?: number;
  status?: 'draft' | 'published';
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
  photos?: StructurePhoto[];
}

export interface StructureTopicConfig {
  id: string;
  title: string;
  shortDescription: string;
  defaultDescription: string;
  iconName: 'Home' | 'Sun' | 'Shield' | 'Users';
}

export const STRUCTURE_TOPICS: StructureTopicConfig[] = [
  {
    id: 'quartos-seguros',
    title: 'Quartos seguros',
    shortDescription: 'Quartos adaptados conforme necessidade do paciente.',
    defaultDescription: 'Acomodações privativas e semi-privativas.',
    iconName: 'Home',
  },
  {
    id: 'jardins-area-verde',
    title: 'Jardins & Área Verde',
    shortDescription: 'Área externa segura e convivência ao ar livre.',
    defaultDescription: 'Área externa segura com vegetação, caminhos acessíveis e espaços de descanso ao ar livre.',
    iconName: 'Sun',
  },
  {
    id: 'monitoramento-24h',
    title: 'Monitoramento 24h',
    shortDescription: 'Circuito interno de câmeras em áreas comuns e controle rigoroso para tranquilidade de todos.',
    defaultDescription: 'Circuito interno e acompanhamento ininterrupto por equipe especializada com protocolos rigorosos de segurança preventiva.',
    iconName: 'Shield',
  },
  {
    id: 'salas-atividades',
    title: 'Salas de Atividades',
    shortDescription: 'Ambientes multifuncionais convivência, música, jogos cognitivos e cinema.',
    defaultDescription: 'Espaços amplos e climatizados para oficinas de estimulação cognitiva, musicoterapia, cinema e convivência social.',
    iconName: 'Users',
  },
];
