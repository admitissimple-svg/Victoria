import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { VictoriaLogo, VictoriaEmblem } from './VictoriaLogo';
import {
  getAllServicesForAdmin,
  saveService,
  deleteService,
  reorderServices,
  getInstitutionalContent,
  saveInstitutionalContent,
  getAllAdmins,
  addAdminUser,
  updateAdminStatusOrRole,
  getContactLeads,
  updateLeadStatus,
  getAlbum,
  saveAlbum,
  getAllPhotosForAdmin,
  savePhoto,
  deletePhoto,
  reorderPhotos,
  uploadPhotoToStorage,
  invalidateAlbumCache,
} from '../services/firestoreService';
import { INITIAL_INSTITUTIONAL_CONTENT } from '../services/bootstrapService';
import {
  testFirestoreConnection,
  activeFirebaseConfig,
  isFirebaseConfiguredFromSecrets,
} from '../lib/firebase';
import {
  ServiceItem,
  InstitutionalContent,
  AdminUser,
  ContactLead,
  StructurePhoto,
  StructureAlbum,
  STRUCTURE_TOPICS,
} from '../types';
import { StructureGalleryModal } from './StructureGalleryModal';
import {
  Shield,
  Layers,
  FileText,
  Users,
  Inbox,
  LogOut,
  Plus,
  Edit2,
  Trash2,
  Save,
  CheckCircle,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Camera,
  Upload,
  Heart,
  Home,
  Sun,
  Image as ImageIcon,
  Calendar,
  Video,
  MessageSquare,
  MessageCircle,
  Phone,
  Mail,
  Clock,
  CheckCircle2,
  X,
  Copy,
  Check,
  Search,
  ArrowUpDown,
  Download,
  Play,
} from 'lucide-react';
import {
  parseMediaUrl,
  resolveMediaDisplayUrl,
  parsePhotoUrl,
  resolvePhotoDisplayUrl,
  MediaType,
} from '../utils/mediaUrlHelper';

interface AdminPanelProps {
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const { user, adminProfile, isAdmin, isSuperAdmin, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<
    'services' | 'albums' | 'content' | 'users' | 'leads' | 'form_leads' | 'meet_leads' | 'audit'
  >('services');
  const [leadSubTab, setLeadSubTab] = useState<'form' | 'meet'>('form');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Services state
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [isNewService, setIsNewService] = useState(false);

  // Structure Albums & Photos state
  const [selectedTopicId, setSelectedTopicId] = useState<string>('quartos-seguros');
  const [albumMetadata, setAlbumMetadata] = useState<StructureAlbum | null>(null);
  const [albumPhotos, setAlbumPhotos] = useState<StructurePhoto[]>([]);
  const [loadingAlbumData, setLoadingAlbumData] = useState(false);
  const [savingAlbumData, setSavingAlbumData] = useState(false);
  const [showPhotoForm, setShowPhotoForm] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<StructurePhoto | null>(null);
  const [photoForm, setPhotoForm] = useState<{
    title: string;
    altText: string;
    caption: string;
    url: string;
    mediaType: 'image' | 'video';
    storagePath: string;
    published: boolean;
  }>({
    title: '',
    altText: '',
    caption: '',
    url: '',
    mediaType: 'image',
    storagePath: '',
    published: true,
  });
  const [photoPreviewError, setPhotoPreviewError] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [isGalleryPreviewOpen, setIsGalleryPreviewOpen] = useState(false);

  // Content state
  const [contentMap, setContentMap] = useState<Record<string, InstitutionalContent>>({});
  const [savingContentKey, setSavingContentKey] = useState<string | null>(null);
  const [activeOwnerTab, setActiveOwnerTab] = useState<'owner_1' | 'owner_2'>('owner_1');
  const [newSlotInput, setNewSlotInput] = useState('');
  const [heroPhotoError, setHeroPhotoError] = useState(false);
  const [heroPhotoUsingFallback, setHeroPhotoUsingFallback] = useState(false);
  const [ownerPhotoError, setOwnerPhotoError] = useState<Record<string, boolean>>({});
  const [ownerPhotoUsingFallback, setOwnerPhotoUsingFallback] = useState<Record<string, boolean>>({});

  // Admins state
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'admin' | 'superadmin'>('admin');

  // Leads separated state
  const [leads, setLeads] = useState<ContactLead[]>([]);
  const [formFilter, setFormFilter] = useState<string>('all');
  const [meetFilter, setMeetFilter] = useState<string>('all');
  const [copiedMeetId, setCopiedMeetId] = useState<string | null>(null);
  const [formSearch, setFormSearch] = useState<string>('');
  const [formSortOrder, setFormSortOrder] = useState<'desc' | 'asc'>('desc');
  const [meetSearch, setMeetSearch] = useState<string>('');
  const [meetSortOrder, setMeetSortOrder] = useState<'asc' | 'desc'>('asc');
  const [meetSortField, setMeetSortField] = useState<'scheduled' | 'created'>('scheduled');
  const [selectedLeadModal, setSelectedLeadModal] = useState<ContactLead | null>(null);

  // Connection test
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

  // Always prefetch leads once so header count badges are accurate immediately
  useEffect(() => {
    getContactLeads()
      .then((data) => setLeads(data || []))
      .catch((err) => console.warn('Falha ao pré-carregar leads:', err));
  }, []);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'albums') {
      loadAlbumData(selectedTopicId);
    }
  }, [selectedTopicId, activeTab]);

  const loadAlbumData = async (topicId: string) => {
    try {
      setLoadingAlbumData(true);
      const [albumRes, photosRes] = await Promise.all([
        getAlbum(topicId, true),
        getAllPhotosForAdmin(topicId),
      ]);
      setAlbumMetadata(albumRes);
      setAlbumPhotos(photosRes || []);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao carregar dados do álbum.' });
    } finally {
      setLoadingAlbumData(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      if (activeTab === 'services') {
        const data = await getAllServicesForAdmin();
        setServices(data || []);
      } else if (activeTab === 'albums') {
        await loadAlbumData(selectedTopicId);
      } else if (activeTab === 'content') {
        const data = await getInstitutionalContent(true);
        setContentMap({ ...INITIAL_INSTITUTIONAL_CONTENT, ...(data || {}) });
      } else if (activeTab === 'users') {
        const data = await getAllAdmins();
        setAdminUsers(data || []);
      } else if (
        activeTab === 'leads' ||
        activeTab === 'form_leads' ||
        activeTab === 'meet_leads'
      ) {
        const data = await getContactLeads();
        setLeads(data || []);
      } else if (activeTab === 'audit') {
        const testRes = await testFirestoreConnection();
        setConnectionStatus(testRes.message);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao carregar dados' });
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Services Operations
  // -------------------------------------------------------------
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService || !user) return;

    if (!editingService.id || !editingService.title || !editingService.summary) {
      setFeedback({ type: 'error', message: 'Preencha todos os campos obrigatórios (ID, Título, Resumo).' });
      return;
    }

    try {
      setLoading(true);
      await saveService(editingService, user.uid, {
        expectedUpdatedAt: isNewService ? undefined : editingService.updatedAt,
      });
      setFeedback({
        type: 'success',
        message: `Serviço "${editingService.title}" salvo com sucesso no Firestore!`,
      });
      setEditingService(null);
      setIsNewService(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao salvar serviço' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteService = async (id: string, title: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o serviço "${title}"?`)) return;
    try {
      setLoading(true);
      await deleteService(id);
      setFeedback({ type: 'success', message: `Serviço "${title}" excluído com sucesso.` });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao excluir serviço' });
    } finally {
      setLoading(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= services.length || !user) return;

    const updated = [...services];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    // Recalculate order values
    const payload = updated.map((item, idx) => ({ id: item.id, order: idx + 1 }));
    setServices(updated.map((item, idx) => ({ ...item, order: idx + 1 })));

    try {
      await reorderServices(payload, user.uid);
      setFeedback({ type: 'success', message: 'Ordem dos serviços reestruturada com sucesso.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao reordenar' });
      await loadData();
    }
  };

  // -------------------------------------------------------------
  // Structure Albums & Photos Operations
  // -------------------------------------------------------------
  const handleSaveAlbumMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!albumMetadata || !user) return;
    if (!albumMetadata.title.trim()) {
      setFeedback({ type: 'error', message: 'O título do álbum não pode ser vazio.' });
      return;
    }

    try {
      setSavingAlbumData(true);
      await saveAlbum(albumMetadata, user.uid);
      setFeedback({
        type: 'success',
        message: `Configurações do álbum "${albumMetadata.title}" salvas com sucesso no Firestore!`,
      });
      await loadAlbumData(selectedTopicId);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao salvar álbum.' });
    } finally {
      setSavingAlbumData(false);
    }
  };

  const handlePhotoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingPhoto(true);
      setPhotoUploadError(null);
      setPhotoPreviewError(false);
      const res = await uploadPhotoToStorage(selectedTopicId, file);
      setPhotoForm((prev) => ({
        ...prev,
        url: res.url,
        mediaType: 'image',
        storagePath: res.storagePath,
        title: prev.title || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        altText: prev.altText || `Fotografia de ${albumMetadata?.title || 'estrutura'} do Victoria Lar Residencial`,
      }));
      setFeedback({
        type: 'success',
        message: 'Foto enviada com sucesso para o Firebase Storage!',
      });
    } catch (err: any) {
      console.error('[Upload Failed]', err);
      const msg = err.message || 'Erro no upload para o Firebase Storage.';
      setPhotoUploadError(msg);
      setFeedback({ type: 'error', message: msg });
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handlePhotoUrlChange = (newUrl: string) => {
    setPhotoPreviewError(false);
    const parsed = parseMediaUrl(newUrl, photoForm.mediaType);
    let autoType: 'image' | 'video' = photoForm.mediaType;
    if (parsed.provider === 'youtube' || parsed.provider === 'vimeo' || parsed.provider === 'direct-video') {
      autoType = 'video';
    } else if (parsed.provider === 'direct-image') {
      autoType = 'image';
    }
    setPhotoForm((prev) => ({
      ...prev,
      url: newUrl,
      mediaType: autoType,
    }));
  };

  const handleSavePhotoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!photoForm.url.trim()) {
      setFeedback({ type: 'error', message: 'Por favor, informe a URL da foto/vídeo ou envie um arquivo para o Storage.' });
      return;
    }

    if (!photoForm.title.trim()) {
      setFeedback({ type: 'error', message: 'O título ou legenda da mídia é obrigatório.' });
      return;
    }

    const parsed = parseMediaUrl(photoForm.url, photoForm.mediaType);
    if (!parsed.isValid) {
      setFeedback({ type: 'error', message: parsed.errorMessage || 'A URL informada não é válida para incorporação ou reprodução.' });
      return;
    }

    if (photoForm.mediaType === 'image' && !photoForm.altText.trim()) {
      setFeedback({ type: 'error', message: 'O texto alternativo (acessibilidade) é obrigatório para imagens.' });
      return;
    }

    try {
      setLoading(true);
      const photoId = editingPhoto ? editingPhoto.id : `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const payload: StructurePhoto = {
        id: photoId,
        albumId: selectedTopicId,
        url: photoForm.url.trim(),
        mediaType: photoForm.mediaType,
        storagePath: photoForm.storagePath || '',
        title: photoForm.title.trim(),
        caption: photoForm.caption.trim(),
        altText: (photoForm.altText.trim() || photoForm.title.trim()),
        order: editingPhoto ? editingPhoto.order : albumPhotos.length + 1,
        published: photoForm.published,
        createdAt: editingPhoto ? editingPhoto.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };

      await savePhoto(payload, user.uid);
      setFeedback({
        type: 'success',
        message: `${payload.mediaType === 'video' ? 'Vídeo' : 'Foto'} "${payload.title}" salvo com sucesso no álbum!`,
      });

      // Reset form
      setShowPhotoForm(false);
      setEditingPhoto(null);
      setPhotoForm({
        title: '',
        altText: '',
        caption: '',
        url: '',
        mediaType: 'image',
        storagePath: '',
        published: true,
      });
      setPhotoUploadError(null);
      setPhotoPreviewError(false);
      await loadAlbumData(selectedTopicId);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao persistir mídia no banco de dados.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePhotoConfirm = async (photo: StructurePhoto) => {
    if (!window.confirm(`Tem certeza que deseja excluir a foto "${photo.title}"? Esta ação removerá o registro e seu arquivo do Firebase Storage.`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await deletePhoto(selectedTopicId, photo.id, photo.storagePath);
      setFeedback({
        type: 'success',
        message: res.storageDeleted
          ? `Foto "${photo.title}" e arquivo no Storage excluídos com sucesso!`
          : `Foto "${photo.title}" removida com sucesso.`,
      });
      await loadAlbumData(selectedTopicId);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao excluir foto.' });
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePhotoPublish = async (photo: StructurePhoto) => {
    if (!user) return;
    const newStatus = !photo.published;
    try {
      await savePhoto({ ...photo, published: newStatus }, user.uid);
      setFeedback({
        type: 'success',
        message: `Status da foto alterado para: ${newStatus ? 'Publicada (visível no site)' : 'Rascunho (privada ao ADM)'}.`,
      });
      await loadAlbumData(selectedTopicId);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao alternar publicação da foto.' });
    }
  };

  const handleMovePhotoOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= albumPhotos.length || !user) return;

    const updated = [...albumPhotos];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    const payload = updated.map((item, idx) => ({ id: item.id, order: idx + 1 }));
    setAlbumPhotos(updated.map((item, idx) => ({ ...item, order: idx + 1 })));

    try {
      await reorderPhotos(selectedTopicId, payload, user.uid);
      setFeedback({ type: 'success', message: 'Ordem das fotos atualizada com sucesso.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao reordenar fotos.' });
      await loadAlbumData(selectedTopicId);
    }
  };

  const handleStartEditPhoto = (photo: StructurePhoto) => {
    setEditingPhoto(photo);
    setPhotoPreviewError(false);
    setPhotoForm({
      title: photo.title,
      altText: photo.altText,
      caption: photo.caption || '',
      url: photo.url,
      mediaType: photo.mediaType || 'image',
      storagePath: photo.storagePath || '',
      published: photo.published,
    });
    setPhotoUploadError(null);
    setShowPhotoForm(true);
  };

  // -------------------------------------------------------------
  // Content Operations
  // -------------------------------------------------------------
  const handleSaveContent = async (key: string) => {
    const item = contentMap[key] || INITIAL_INSTITUTIONAL_CONTENT[key];
    if (!item || !user) return;

    // Do NOT spread ...fallback: preserve exactly what the admin configured or cleared
    const payload: InstitutionalContent = {
      ...item,
      key,
    };

    try {
      setSavingContentKey(key);
      await saveInstitutionalContent(payload, user.uid, {
        expectedUpdatedAt: item.updatedAt,
      });
      setFeedback({ type: 'success', message: `Dados de "${payload.title || payload.imageCaption || key}" salvos com sucesso no banco!` });
      // Update local state with fresh timestamp
      setContentMap((prev) => ({
        ...prev,
        [key]: { ...payload, updatedAt: new Date().toISOString(), updatedBy: user.uid },
      }));
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao salvar conteúdo' });
    } finally {
      setSavingContentKey(null);
    }
  };

  // -------------------------------------------------------------
  // User Operations (Superadmin only)
  // -------------------------------------------------------------
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newAdminEmail || !newAdminUid) {
      setFeedback({ type: 'error', message: 'E-mail e UID do novo administrador são obrigatórios.' });
      return;
    }

    try {
      setLoading(true);
      await addAdminUser(
        {
          uid: newAdminUid.trim(),
          email: newAdminEmail.trim(),
          role: newAdminRole,
        },
        user.uid
      );
      setFeedback({ type: 'success', message: `Administrador ${newAdminEmail} adicionado com sucesso.` });
      setNewAdminEmail('');
      setNewAdminUid('');
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao adicionar administrador' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdminStatus = async (targetAdmin: AdminUser) => {
    if (!user) return;
    const newActiveState = !targetAdmin.active;

    try {
      setLoading(true);
      await updateAdminStatusOrRole(
        targetAdmin.uid,
        { active: newActiveState },
        user.uid
      );
      setFeedback({
        type: 'success',
        message: `Status de ${targetAdmin.email} alterado para ${newActiveState ? 'Ativo' : 'Inativo'}.`,
      });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro na operação de segurança' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdminRole = async (targetAdmin: AdminUser) => {
    if (!user) return;
    const newRole = targetAdmin.role === 'superadmin' ? 'admin' : 'superadmin';

    try {
      setLoading(true);
      await updateAdminStatusOrRole(
        targetAdmin.uid,
        { role: newRole },
        user.uid
      );
      setFeedback({
        type: 'success',
        message: `Função de ${targetAdmin.email} alterada para ${newRole}.`,
      });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro na alteração de função' });
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Leads Operations & Separation (Formulário vs. Meet)
  // -------------------------------------------------------------
  const handleUpdateLead = async (leadId: string, status: ContactLead['status']) => {
    try {
      await updateLeadStatus(leadId, status);
      setFeedback({ type: 'success', message: `Status do lead atualizado para "${status}".` });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao atualizar lead' });
    }
  };

  // Distinct separation predicates:
  // Reunião Google Meet: Possui tipo 'meeting' ou data agendada (scheduledDate)
  // Agendamento via Formulário: Enviado pelo formulário de contato do site
  const isMeetingLead = (l: ContactLead) => l.type === 'meeting' || Boolean(l.scheduledDate);
  const isFormLead = (l: ContactLead) => !isMeetingLead(l);

  const formLeads = leads.filter(isFormLead);
  const meetLeads = leads.filter(isMeetingLead);

  const unreadFormCount = formLeads.filter(l => l.status === 'unread').length;
  const unreadMeetCount = meetLeads.filter(l => l.status === 'unread').length;

  const formatDateTimeBR = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const sortedAndFilteredFormLeads = formLeads
    .filter(l => {
      if (formFilter !== 'all' && l.status !== formFilter) return false;
      if (!formSearch.trim()) return true;
      const q = formSearch.toLowerCase();
      return (
        (l.name && l.name.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.phone && l.phone.toLowerCase().includes(q)) ||
        (l.relationship && l.relationship.toLowerCase().includes(q)) ||
        (l.serviceInterest && l.serviceInterest.toLowerCase().includes(q)) ||
        (l.message && l.message.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return formSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

  const getMeetTimestamp = (lead: ContactLead): number => {
    if (lead.scheduledDate) {
      const timeStr = lead.scheduledTime || '00:00';
      const dateTimeStr = `${lead.scheduledDate}T${timeStr}:00`;
      const t = new Date(dateTimeStr).getTime();
      if (!isNaN(t)) return t;
    }
    return lead.createdAt ? new Date(lead.createdAt).getTime() : 0;
  };

  const sortedAndFilteredMeetLeads = meetLeads
    .filter(l => {
      if (meetFilter !== 'all' && l.status !== meetFilter) return false;
      if (!meetSearch.trim()) return true;
      const q = meetSearch.toLowerCase();
      return (
        (l.name && l.name.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.phone && l.phone.toLowerCase().includes(q)) ||
        (l.relationship && l.relationship.toLowerCase().includes(q)) ||
        (l.serviceInterest && l.serviceInterest.toLowerCase().includes(q)) ||
        (l.message && l.message.toLowerCase().includes(q)) ||
        (l.scheduledDate && l.scheduledDate.toLowerCase().includes(q)) ||
        (l.scheduledTime && l.scheduledTime.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (meetSortField === 'scheduled') {
        const timeA = getMeetTimestamp(a);
        const timeB = getMeetTimestamp(b);
        return meetSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      } else {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return meetSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }
    });

  const exportToCSV = (data: ContactLead[], filename: string, isMeet: boolean) => {
    const headers = isMeet
      ? ['Data da Reunião', 'Horário Marcado', 'Data da Solicitação', 'Nome', 'Telefone', 'Email', 'Parentesco', 'Interesse', 'Link do Meet', 'Status', 'Mensagem']
      : ['Data e Hora de Envio', 'Nome', 'Telefone', 'Email', 'Parentesco', 'Interesse', 'Status', 'Mensagem'];

    const rows = data.map(l => {
      if (isMeet) {
        return [
          `"${formatScheduledDateBR(l.scheduledDate)}"`,
          `"${l.scheduledTime || ''}"`,
          `"${formatDateTimeBR(l.createdAt)}"`,
          `"${(l.name || '').replace(/"/g, '""')}"`,
          `"${(l.phone || '').replace(/"/g, '""')}"`,
          `"${(l.email || '').replace(/"/g, '""')}"`,
          `"${(l.relationship || '').replace(/"/g, '""')}"`,
          `"${(l.serviceInterest || '').replace(/"/g, '""')}"`,
          `"${(l.meetingLink || '').replace(/"/g, '""')}"`,
          `"${l.status}"`,
          `"${(l.message || '').replace(/"/g, '""')}"`,
        ];
      } else {
        return [
          `"${formatDateTimeBR(l.createdAt)}"`,
          `"${(l.name || '').replace(/"/g, '""')}"`,
          `"${(l.phone || '').replace(/"/g, '""')}"`,
          `"${(l.email || '').replace(/"/g, '""')}"`,
          `"${(l.relationship || '').replace(/"/g, '""')}"`,
          `"${(l.serviceInterest || '').replace(/"/g, '""')}"`,
          `"${l.status}"`,
          `"${(l.message || '').replace(/"/g, '""')}"`,
        ];
      }
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleCopyMeetLink = (id: string, link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedMeetId(id);
    setTimeout(() => setCopiedMeetId(null), 2500);
  };

  const formatScheduledDateBR = (d?: string) => {
    if (!d) return '';
    if (d.includes('-')) {
      const [y, m, day] = d.split('-');
      return `${day}/${m}/${y}`;
    }
    return d;
  };

  const getCleanPhoneDigits = (rawPhone: string) => rawPhone.replace(/\D/g, '');

  const buildWhatsAppLink = (phone: string, text: string) => {
    const digits = getCleanPhoneDigits(phone);
    const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`;
  };

  if (!user || !isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
        <div className="bg-white border border-red-200 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <Shield className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-serif font-bold text-neutral-900">Acesso Administrativo Não Autorizado</h3>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Sua conta não possui permissões ativas de administrador ou seu acesso foi revogado pela diretoria.
          </p>
          <div className="pt-2 flex gap-2">
            <button
              onClick={logout}
              className="flex-1 py-2 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded-lg transition-colors"
            >
              Encerrar Sessão
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-[#173D2B] hover:bg-[#123022] text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Voltar ao Início
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-neutral-800">
      {/* Top Header */}
      <header className="bg-[#173D2B] text-white border-b-2 border-[#B8954A] shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-4">
              <VictoriaLogo variant="light" size="sm" layout="horizontal" />
              <div className="hidden sm:block border-l border-white/20 pl-4 py-1">
                <span className="text-xs uppercase tracking-wider text-[#B8954A] font-semibold">
                  Painel de Gestão e Segurança
                </span>
                <div className="text-xs text-white/80">
                  {user?.email} • {isSuperAdmin ? 'Superadministrador' : 'Administrador'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#173D2B] bg-[#FAF9F5] hover:bg-white rounded-lg transition-all shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ver Landing Page</span>
              </button>

              <button
                onClick={logout}
                className="p-2 text-white/70 hover:text-red-300 hover:bg-white/10 rounded-lg transition-colors"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto gap-2 py-2 border-t border-white/10 text-xs">
          <button
            onClick={() => setActiveTab('services')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'services'
                ? 'bg-[#B8954A] text-white font-semibold shadow-xs'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Nossos Serviços ({services.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('albums')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'albums'
                ? 'bg-[#B8954A] text-white font-semibold shadow-xs'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Álbuns da Estrutura</span>
          </button>

          <button
            onClick={() => setActiveTab('content')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'content'
                ? 'bg-[#B8954A] text-white font-semibold shadow-xs'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Conteúdo Institucional</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('form_leads');
              setLeadSubTab('form');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'form_leads' || (activeTab === 'leads' && leadSubTab === 'form')
                ? 'bg-[#B8954A] text-white font-semibold shadow-xs'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Agendamentos Formulário ({formLeads.length})</span>
            {unreadFormCount > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-400 text-neutral-900 rounded-full text-[10px] font-bold">
                {unreadFormCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('meet_leads');
              setLeadSubTab('meet');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'meet_leads' || (activeTab === 'leads' && leadSubTab === 'meet')
                ? 'bg-[#B8954A] text-white font-semibold shadow-xs'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>Reuniões Google Meet ({meetLeads.length})</span>
            {unreadMeetCount > 0 && (
              <span className="px-1.5 py-0.2 bg-purple-300 text-purple-950 rounded-full text-[10px] font-bold">
                {unreadMeetCount}
              </span>
            )}
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'users'
                  ? 'bg-[#B8954A] text-white font-semibold shadow-xs'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Gestão de Usuários</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'audit'
                ? 'bg-[#B8954A] text-white font-semibold shadow-xs'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Segurança & Invariantes</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mb-6 p-4 rounded-xl flex items-center justify-between text-sm shadow-xs ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs uppercase font-semibold opacity-70 hover:opacity-100 ml-4"
            >
              Fechar
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: SERVIÇOS */}
        {/* ========================================================= */}
        {activeTab === 'services' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-serif font-bold text-[#173D2B]">
                  Gestão da Seção “Nossos Serviços”
                </h1>
                <p className="text-xs text-neutral-600 mt-1">
                  Cadastre, edite, publique, reordene e exclua serviços. Apenas serviços marcados como <strong>Publicado</strong> são acessíveis a visitantes.
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingService({
                    id: `serv-${Date.now()}`,
                    title: '',
                    summary: '',
                    description: '',
                    icon: 'HeartPulse',
                    category: 'saude',
                    order: services.length + 1,
                    status: 'draft',
                    highlight: false,
                  });
                  setIsNewService(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#173D2B] hover:bg-[#123022] text-[#FAF9F5] text-xs font-semibold rounded-xl shadow-xs transition-all border border-[#B8954A]/40"
              >
                <Plus className="w-4 h-4 text-[#B8954A]" />
                <span>Novo Serviço</span>
              </button>
            </div>

            {/* Service Edit / Creation Modal / Form */}
            {editingService && (
              <div className="bg-white border-2 border-[#B8954A]/30 rounded-2xl p-6 shadow-lg mb-8">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-4 mb-5">
                  <h3 className="font-serif font-bold text-[#173D2B] text-lg">
                    {isNewService ? 'Cadastrar Novo Serviço de Cuidado' : `Editar: ${editingService.title}`}
                  </h3>
                  <button
                    onClick={() => setEditingService(null)}
                    className="text-xs text-neutral-500 hover:text-neutral-800 font-medium"
                  >
                    Cancelar
                  </button>
                </div>

                <form onSubmit={handleSaveService} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      Identificador Único (ID) *
                    </label>
                    <input
                      type="text"
                      disabled={!isNewService}
                      value={editingService.id}
                      onChange={(e) => setEditingService({ ...editingService, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-') })}
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-[#173D2B]"
                      required
                    />
                    <span className="text-[10px] text-neutral-500">Ex: fisioterapia-geriatrica (imutável após criação)</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      Título do Serviço *
                    </label>
                    <input
                      type="text"
                      maxLength={150}
                      value={editingService.title}
                      onChange={(e) => setEditingService({ ...editingService, title: e.target.value })}
                      placeholder="Ex: Fisioterapia e Reabilitação Motora"
                      className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-[#173D2B]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      Categoria
                    </label>
                    <select
                      value={editingService.category || 'saude'}
                      onChange={(e) => setEditingService({ ...editingService, category: e.target.value })}
                      className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs"
                    >
                      <option value="saude">Saúde & Cuidados Clínicos</option>
                      <option value="assistencial">Assistência & Enfermagem</option>
                      <option value="hotelaria">Hotelaria & Alimentação</option>
                      <option value="lazer">Lazer, Cultura & Convivência</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      Ícone Visual
                    </label>
                    <select
                      value={editingService.icon || 'HeartPulse'}
                      onChange={(e) => setEditingService({ ...editingService, icon: e.target.value })}
                      className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs"
                    >
                      <option value="HeartPulse">Coração / Pulso Clínico (HeartPulse)</option>
                      <option value="Stethoscope">Estetoscópio Médico (Stethoscope)</option>
                      <option value="Apple">Nutrição Saudável (Apple)</option>
                      <option value="Activity">Atividade Motora (Activity)</option>
                      <option value="Sparkles">Estímulo Cognitivo (Sparkles)</option>
                      <option value="Home">Hotelaria & Aconchego (Home)</option>
                      <option value="Music">Musicoterapia & Arte (Music)</option>
                      <option value="ShieldCheck">Segurança e Prevenção (ShieldCheck)</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block font-semibold text-neutral-700 mb-1">
                      Resumo para o Cartão Público * (até 300 caracteres)
                    </label>
                    <textarea
                      rows={2}
                      maxLength={300}
                      value={editingService.summary}
                      onChange={(e) => setEditingService({ ...editingService, summary: e.target.value })}
                      placeholder="Breve descrição em destaque apresentada na landing page..."
                      className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-[#173D2B]"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block font-semibold text-neutral-700 mb-1">
                      Descrição Detalhada do Cuidado
                    </label>
                    <textarea
                      rows={4}
                      maxLength={3000}
                      value={editingService.description || ''}
                      onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                      placeholder="Detalhes completos sobre protocolos, equipe responsável, periodicidade e benefícios aos residentes..."
                      className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-[#173D2B]"
                    />
                  </div>

                  <div className="flex items-center gap-6 md:col-span-2 pt-2">
                    <div>
                      <label className="block font-semibold text-neutral-700 mb-1">
                        Estado de Publicação *
                      </label>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="status"
                            checked={editingService.status === 'published'}
                            onChange={() => setEditingService({ ...editingService, status: 'published' })}
                            className="text-[#173D2B]"
                          />
                          <span className="font-medium text-emerald-800">Publicado (Visível a todos)</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="status"
                            checked={editingService.status === 'draft'}
                            onChange={() => setEditingService({ ...editingService, status: 'draft' })}
                            className="text-[#173D2B]"
                          />
                          <span className="font-medium text-amber-800">Rascunho (Privado à ADM)</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                      <input
                        type="checkbox"
                        id="highlight"
                        checked={!!editingService.highlight}
                        onChange={(e) => setEditingService({ ...editingService, highlight: e.target.checked })}
                        className="rounded-sm text-[#173D2B]"
                      />
                      <label htmlFor="highlight" className="font-medium text-neutral-700 cursor-pointer">
                        Destacar com selo na página principal
                      </label>
                    </div>
                  </div>

                  <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t border-neutral-100">
                    <button
                      type="button"
                      onClick={() => setEditingService(null)}
                      className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-5 py-2 bg-[#173D2B] hover:bg-[#123022] text-white font-semibold rounded-lg shadow-sm"
                    >
                      <Save className="w-4 h-4 text-[#B8954A]" />
                      <span>{isNewService ? 'Cadastrar e Salvar' : 'Salvar Alterações'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Services List Table */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-neutral-700">
                  <thead className="bg-[#FAF9F5] border-b border-neutral-200 text-neutral-600 uppercase font-semibold text-[11px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4 text-center w-16">Ordem</th>
                      <th className="py-3 px-4">Serviço</th>
                      <th className="py-3 px-4">Categoria</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {services.map((serv, index) => (
                      <tr key={serv.id} className="hover:bg-neutral-50/70 transition-colors">
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1 font-mono font-bold text-neutral-500">
                            <span>#{serv.order}</span>
                            <div className="flex flex-col ml-1">
                              <button
                                disabled={index === 0}
                                onClick={() => handleMoveOrder(index, 'up')}
                                className="p-0.5 hover:text-[#173D2B] disabled:opacity-20"
                                title="Mover para cima"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                disabled={index === services.length - 1}
                                onClick={() => handleMoveOrder(index, 'down')}
                                className="p-0.5 hover:text-[#173D2B] disabled:opacity-20"
                                title="Mover para baixo"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-neutral-900 text-sm">{serv.title}</div>
                          <div className="text-neutral-500 line-clamp-1 text-xs mt-0.5">{serv.summary}</div>
                          {serv.highlight && (
                            <span className="inline-block mt-1 text-[10px] bg-[#E5A2AB] text-[#173D2B] font-semibold px-2 py-0.2 rounded-full border border-[#DC939D]">
                              ★ Destaque
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="capitalize bg-neutral-100 px-2 py-1 rounded-md text-neutral-600 font-medium">
                            {serv.category || 'Geral'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {serv.status === 'published' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-semibold text-[11px]">
                              <Eye className="w-3 h-3 text-emerald-600" />
                              Publicado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full font-semibold text-[11px]">
                              <EyeOff className="w-3 h-3 text-amber-600" />
                              Rascunho
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingService(serv);
                                setIsNewService(false);
                              }}
                              className="p-1.5 text-neutral-600 hover:text-[#173D2B] hover:bg-neutral-100 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteService(serv.id, serv.title)}
                              className="p-1.5 text-neutral-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {services.length === 0 && !loading && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-neutral-500">
                          Nenhum serviço cadastrado ainda. Clique em "Novo Serviço" acima para iniciar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB: ÁLBUNS DE FOTOS DA ESTRUTURA */}
        {/* ========================================================= */}
        {activeTab === 'albums' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-serif font-bold text-[#173D2B]">
                  Álbuns de Fotos por Item da Estrutura
                </h1>
                <p className="text-xs text-neutral-600 mt-1 max-w-3xl">
                  Gerencie as galerias de fotos dos 4 tópicos da seção <strong>“Estrutura Projetada para o Bem-Estar”</strong>. Cada tópico possui álbum independente. As fotos publicadas aparecem instantaneamente para os visitantes no modal da landing page.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsGalleryPreviewOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-[#FAF9F5] text-[#173D2B] text-xs font-semibold rounded-xl border border-[#B8954A] shadow-xs transition-all cursor-pointer"
                  title="Abrir pré-visualização do álbum exatamente como o visitante o verá"
                >
                  <Eye className="w-4 h-4 text-[#B8954A]" />
                  <span>Pré-visualizar Álbum</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingPhoto(null);
                    setPhotoForm({
                      title: '',
                      altText: '',
                      caption: '',
                      url: '',
                      mediaType: 'image',
                      storagePath: '',
                      published: true,
                    });
                    setPhotoUploadError(null);
                    setPhotoPreviewError(false);
                    setShowPhotoForm(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#173D2B] hover:bg-[#123022] text-[#FAF9F5] text-xs font-semibold rounded-xl shadow-xs transition-all border border-[#B8954A]/40 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#B8954A]" />
                  <span>Nova Mídia (Foto / Vídeo)</span>
                </button>
              </div>
            </div>

            {/* 4 Topic Selector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {STRUCTURE_TOPICS.map((topic) => {
                const isSelected = selectedTopicId === topic.id;
                const renderIcon = () => {
                  switch (topic.iconName) {
                    case 'Home':
                      return <Home className="w-5 h-5" />;
                    case 'Sun':
                      return <Sun className="w-5 h-5" />;
                    case 'Shield':
                      return <Shield className="w-5 h-5" />;
                    case 'Users':
                    default:
                      return <Users className="w-5 h-5" />;
                  }
                };

                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => {
                      setSelectedTopicId(topic.id);
                      setShowPhotoForm(false);
                      setEditingPhoto(null);
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-white border-[#B8954A] shadow-md ring-2 ring-[#B8954A]/40'
                        : 'bg-[#FAF9F5] border-neutral-200 hover:border-neutral-300 hover:bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            isSelected
                              ? 'bg-[#173D2B] text-[#DFC282]'
                              : 'bg-neutral-200/80 text-neutral-600'
                          }`}
                        >
                          {renderIcon()}
                        </div>
                        {isSelected ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#173D2B] bg-[#E5A2AB] px-2 py-0.5 rounded-full border border-[#DC939D]">
                            Selecionado
                          </span>
                        ) : (
                          <span className="text-[10px] text-neutral-400">Tópico</span>
                        )}
                      </div>
                      <h4 className="font-serif font-bold text-sm text-[#173D2B]">{topic.title}</h4>
                      <p className="text-[11px] text-neutral-500 line-clamp-1 mt-0.5">
                        {topic.shortDescription}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-neutral-200/60 flex items-center justify-between text-[11px] text-neutral-500">
                      <span>Álbum independente</span>
                      {isSelected && (
                        <span className="font-bold text-[#173D2B]">
                          {albumPhotos.length} foto{albumPhotos.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Current Album Header Banner */}
            <div className="bg-[#173D2B] rounded-2xl p-5 sm:p-6 text-white border-2 border-[#B8954A]/50 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#B8954A]">
                    Álbum Ativo
                  </span>
                  <span className="text-white/40">•</span>
                  <span className="text-[11px] text-neutral-300">
                    ID no Firestore: <code className="bg-white/10 px-1.5 py-0.5 rounded-md font-mono text-white text-[10px]">{selectedTopicId}</code>
                  </span>
                </div>
                <h2 className="font-serif font-bold text-xl sm:text-2xl text-white">
                  {albumMetadata?.title || STRUCTURE_TOPICS.find(t => t.id === selectedTopicId)?.title}
                </h2>
                <p className="text-xs text-neutral-300 max-w-2xl leading-relaxed">
                  {albumMetadata?.description || STRUCTURE_TOPICS.find(t => t.id === selectedTopicId)?.defaultDescription}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-center">
                  <div className="text-lg font-bold text-[#DFC282]">{albumPhotos.length}</div>
                  <div className="text-[10px] text-white/70 uppercase">Total de Fotos</div>
                </div>

                <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-center">
                  <div className="text-lg font-bold text-emerald-400">
                    {albumPhotos.filter((p) => p.published).length}
                  </div>
                  <div className="text-[10px] text-white/70 uppercase">Publicadas</div>
                </div>
              </div>
            </div>

            {/* Album Metadata Editor (Title & Description) */}
            <div className="bg-white rounded-2xl p-6 border border-neutral-200 shadow-xs">
              <form onSubmit={handleSaveAlbumMeta} className="space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-[#B8954A]" />
                    <h3 className="font-serif font-bold text-[#173D2B] text-base">
                      Editar Título e Descrição do Álbum
                    </h3>
                  </div>
                  <button
                    type="submit"
                    disabled={savingAlbumData}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#173D2B] hover:bg-[#123022] text-white text-xs font-semibold rounded-lg shadow-2xs transition-all cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-[#B8954A]" />
                    <span>{savingAlbumData ? 'Salvando...' : 'Salvar Informações do Álbum'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-4">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Título do Álbum *
                    </label>
                    <input
                      type="text"
                      maxLength={150}
                      value={albumMetadata?.title || ''}
                      onChange={(e) =>
                        setAlbumMetadata((prev) => (prev ? { ...prev, title: e.target.value } : null))
                      }
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-[#173D2B]"
                      placeholder="Ex: Quartos seguros"
                      required
                    />
                  </div>

                  <div className="md:col-span-8">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Descrição Editorial do Espaço (exibida no cabeçalho do modal)
                    </label>
                    <input
                      type="text"
                      maxLength={1000}
                      value={albumMetadata?.description || ''}
                      onChange={(e) =>
                        setAlbumMetadata((prev) => (prev ? { ...prev, description: e.target.value } : null))
                      }
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-[#173D2B]"
                      placeholder="Ex: Acomodações privativas e semi-privativas adaptadas com barras de apoio..."
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Media Creation / Edit Form */}
            {showPhotoForm && (
              <div className="bg-white border-2 border-[#B8954A]/50 rounded-2xl p-6 shadow-xl space-y-5 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-[#FAF9F5] border border-neutral-200 rounded-lg">
                      {photoForm.mediaType === 'video' ? (
                        <Play className="w-4 h-4 text-[#B8954A]" />
                      ) : (
                        <Camera className="w-4 h-4 text-[#B8954A]" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-serif font-bold text-[#173D2B] text-base">
                        {editingPhoto
                          ? `Editar Mídia: ${editingPhoto.title}`
                          : `Adicionar Nova Mídia (${photoForm.mediaType === 'video' ? 'Vídeo' : 'Foto'})`}
                      </h3>
                      <span className="text-[11px] text-neutral-500">
                        Álbum: {albumMetadata?.title || selectedTopicId}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPhotoForm(false);
                      setEditingPhoto(null);
                      setPhotoUploadError(null);
                      setPhotoPreviewError(false);
                    }}
                    className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSavePhotoSubmit} className="space-y-4 text-xs">
                  {/* Media Type Toggle Selector */}
                  <div className="bg-[#FAF9F5] p-3 rounded-xl border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="font-bold text-[#173D2B] text-xs block">Tipo de Mídia *</span>
                      <span className="text-[11px] text-neutral-500">
                        Detectado automaticamente ao colar links de vídeo ou foto, mas você pode alternar manualmente.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPhotoForm((prev) => ({ ...prev, mediaType: 'image' }))}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          photoForm.mediaType === 'image'
                            ? 'bg-[#173D2B] text-white shadow-xs border border-[#B8954A]'
                            : 'bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50'
                        }`}
                      >
                        <Camera className="w-3.5 h-3.5 text-[#B8954A]" />
                        <span>Foto / Imagem</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhotoForm((prev) => ({ ...prev, mediaType: 'video' }))}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          photoForm.mediaType === 'video'
                            ? 'bg-[#173D2B] text-white shadow-xs border border-[#B8954A]'
                            : 'bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 text-[#B8954A]" />
                        <span>Vídeo</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                    {/* Left Form Column */}
                    <div className="md:col-span-7 space-y-4">
                      <div>
                        <label className="block font-semibold text-neutral-700 mb-1">
                          Título ou Legenda Principal *
                        </label>
                        <input
                          type="text"
                          maxLength={150}
                          value={photoForm.title}
                          onChange={(e) => setPhotoForm({ ...photoForm, title: e.target.value })}
                          placeholder={
                            photoForm.mediaType === 'video'
                              ? 'Ex: Tour guiado pelos jardins e solário'
                              : 'Ex: Suíte Adaptada com Barras de Apoio'
                          }
                          className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-[#173D2B]"
                          required
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-neutral-700 mb-1">
                          Texto Alternativo (Alt Text) {photoForm.mediaType === 'image' ? '*' : '(opcional para vídeos)'}
                        </label>
                        <input
                          type="text"
                          maxLength={200}
                          value={photoForm.altText}
                          onChange={(e) => setPhotoForm({ ...photoForm, altText: e.target.value })}
                          placeholder={
                            photoForm.mediaType === 'video'
                              ? 'Ex: Vídeo demonstrando a rotina de convivência no solário'
                              : 'Ex: Quarto amplo e ensolarado com cama hospitalar regulável e piso antiderrapante'
                          }
                          className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-[#173D2B]"
                          required={photoForm.mediaType === 'image'}
                        />
                        <span className="text-[10px] text-neutral-500 mt-0.5 block">
                          Fundamental para conformidade com acessibilidade digital e leitores de tela.
                        </span>
                      </div>

                      <div>
                        <label className="block font-semibold text-neutral-700 mb-1">
                          Descrição / Detalhe Adicional (opcional)
                        </label>
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={photoForm.caption}
                          onChange={(e) => setPhotoForm({ ...photoForm, caption: e.target.value })}
                          placeholder="Ex: Espaço planejado para autonomia, com ventilação natural e campainha de chamada rápida."
                          className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-[#173D2B]"
                        />
                      </div>

                      {/* Source Section: URL or Storage */}
                      <div className="bg-[#FAF9F5] p-4 rounded-xl border border-neutral-200/90 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#173D2B] block">
                            Origem do Link ou Arquivo
                          </span>
                          <span className="text-[10px] text-neutral-500">
                            YouTube, Vimeo, Google Drive, MP4 ou Imagem Direta
                          </span>
                        </div>

                        {/* Direct URL Input */}
                        <div>
                          <label className="block font-medium text-neutral-700 mb-1">
                            Link da Mídia (URL pública):
                          </label>
                          <input
                            type="url"
                            value={photoForm.url}
                            onChange={(e) => handlePhotoUrlChange(e.target.value)}
                            placeholder={
                              photoForm.mediaType === 'video'
                                ? 'https://www.youtube.com/watch?v=... ou Vimeo ou link do Google Drive / MP4'
                                : 'https://exemplo.com/foto.jpg ou link público do Google Drive'
                            }
                            className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#173D2B]"
                            required
                          />
                        </div>

                        {/* Live Parser Feedback */}
                        {(() => {
                          if (!photoForm.url.trim()) return null;
                          const parsed = parseMediaUrl(photoForm.url, photoForm.mediaType);
                          return (
                            <div className="space-y-2 pt-1 text-xs">
                              {/* Provider Badge */}
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-neutral-600">Provedor Detectado:</span>
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#173D2B] text-white">
                                  {parsed.providerLabel}
                                </span>
                              </div>

                              {/* Warning Callout */}
                              {parsed.warning && (
                                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-start gap-2">
                                  <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-semibold block">Atenção sobre este link:</span>
                                    <span>{parsed.warning}</span>
                                  </div>
                                </div>
                              )}

                              {/* Error Callout */}
                              {!parsed.isValid && (
                                <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-red-900 text-xs flex items-start gap-2">
                                  <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-semibold block">URL Incompatível:</span>
                                    <span>{parsed.errorMessage || 'Link inválido para exibição ou incorporação.'}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* File Upload to Firebase Storage for images */}
                        <div className="pt-2 border-t border-neutral-200">
                          <label className="block font-medium text-neutral-700 mb-1">
                            Ou enviar foto do Computador/Celular (Firebase Storage):
                          </label>
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-semibold shadow-2xs transition-all hover:border-[#B8954A]">
                              <Upload className="w-3.5 h-3.5 text-[#B8954A]" />
                              <span>{isUploadingPhoto ? 'Enviando...' : 'Escolher Foto do Arquivo...'}</span>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                disabled={isUploadingPhoto}
                                className="hidden"
                                onChange={handlePhotoFileUpload}
                              />
                            </label>
                            {isUploadingPhoto && (
                              <span className="text-xs text-neutral-500 animate-pulse flex items-center gap-1.5">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#B8954A]" />
                                Enviando para o Firebase Storage...
                              </span>
                            )}
                          </div>

                          {photoUploadError && (
                            <div className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs">
                              <div className="font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                                <span>Aviso de Upload:</span>
                              </div>
                              <p className="mt-0.5">{photoUploadError}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Publication State */}
                      <div className="pt-2">
                        <label className="block font-semibold text-neutral-700 mb-1.5">
                          Status de Publicação *
                        </label>
                        <div className="flex items-center gap-4">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="photoStatus"
                              checked={photoForm.published === true}
                              onChange={() => setPhotoForm({ ...photoForm, published: true })}
                              className="text-[#173D2B]"
                            />
                            <span className="font-medium text-emerald-800 flex items-center gap-1">
                              <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              Publicada (visível a visitantes na Landing Page)
                            </span>
                          </label>

                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="photoStatus"
                              checked={photoForm.published === false}
                              onChange={() => setPhotoForm({ ...photoForm, published: false })}
                              className="text-[#173D2B]"
                            />
                            <span className="font-medium text-amber-800 flex items-center gap-1">
                              <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                              Oculta / Rascunho (apenas para ADM)
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Right Form Column: Live Preview */}
                    <div className="md:col-span-5 flex flex-col items-center">
                      <div className="flex items-center justify-between w-full mb-1.5">
                        <span className="text-[11px] font-semibold text-neutral-700">
                          Pré-visualização em Tempo Real:
                        </span>
                        {photoForm.url.trim() && (
                          <span className="text-[10px] text-neutral-500 font-mono">
                            {photoForm.mediaType === 'video' ? 'Player de Vídeo' : 'Visualizador'}
                          </span>
                        )}
                      </div>

                      <div className="w-full h-64 rounded-xl overflow-hidden border-2 border-[#B8954A]/40 bg-neutral-900 flex items-center justify-center relative shadow-inner">
                        {(() => {
                          if (!photoForm.url.trim()) {
                            return (
                              <div className="text-center p-6 space-y-2 text-neutral-400">
                                {photoForm.mediaType === 'video' ? (
                                  <Play className="w-10 h-10 mx-auto text-neutral-600" />
                                ) : (
                                  <Camera className="w-10 h-10 mx-auto text-neutral-600" />
                                )}
                                <p className="text-xs">
                                  Informe o link da mídia acima para visualizar a prévia aqui
                                </p>
                              </div>
                            );
                          }

                          const parsed = parseMediaUrl(photoForm.url, photoForm.mediaType);

                          if (!parsed.isValid || photoPreviewError) {
                            return (
                              <div className="p-4 text-center space-y-2 text-neutral-300 max-w-xs">
                                <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                                <div className="text-xs font-semibold text-amber-300">
                                  Pré-visualização Indisponível
                                </div>
                                <p className="text-[11px] text-neutral-400 leading-relaxed">
                                  {parsed.errorMessage || 'Não foi possível carregar a prévia deste link. Verifique se o endereço é público e compatível.'}
                                </p>
                              </div>
                            );
                          }

                          if (parsed.mediaType === 'video') {
                            if (parsed.embedUrl) {
                              return (
                                <iframe
                                  src={parsed.embedUrl}
                                  title="Pré-visualização do vídeo"
                                  className="w-full h-full border-0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                  onError={() => setPhotoPreviewError(true)}
                                />
                              );
                            }
                            if (parsed.isDirectVideo) {
                              return (
                                <video
                                  src={parsed.streamUrl || parsed.directUrl || photoForm.url}
                                  controls
                                  className="w-full h-full object-contain bg-black"
                                  onError={() => setPhotoPreviewError(true)}
                                >
                                  Seu navegador não suporta reprodução direta.
                                </video>
                              );
                            }
                          }

                          // Image
                          return (
                            <img
                              src={parsed.streamUrl || parsed.directUrl || photoForm.url}
                              alt={photoForm.altText || photoForm.title || 'Prévia'}
                              className="w-full h-full object-contain"
                              onError={() => setPhotoPreviewError(true)}
                              onLoad={() => setPhotoPreviewError(false)}
                            />
                          );
                        })()}

                        {photoForm.url.trim() && !photoPreviewError && (
                          <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-xs p-2 rounded-lg text-white text-[11px] pointer-events-none">
                            <div className="font-semibold truncate">
                              {photoForm.title || (photoForm.mediaType === 'video' ? 'Título do Vídeo' : 'Título da Foto')}
                            </div>
                            <div className="text-neutral-300 text-[10px] truncate">
                              {photoForm.altText || photoForm.caption || 'Sem descrição adicional'}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPhotoForm(false);
                        setEditingPhoto(null);
                        setPhotoUploadError(null);
                        setPhotoPreviewError(false);
                      }}
                      className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading || isUploadingPhoto}
                      className="inline-flex items-center gap-2 px-5 py-2 bg-[#173D2B] hover:bg-[#123022] text-white font-semibold rounded-lg shadow-sm cursor-pointer"
                    >
                      <Save className="w-4 h-4 text-[#B8954A]" />
                      <span>{editingPhoto ? 'Atualizar Mídia' : 'Salvar Mídia no Álbum'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Media List Grid */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#B8954A]" />
                  <h3 className="font-serif font-bold text-[#173D2B] text-base">
                    Mídias do Álbum ({albumPhotos.length})
                  </h3>
                </div>
                <span className="text-xs text-neutral-500">
                  Use as setas para reordenar a sequência de exibição na galeria
                </span>
              </div>

              {loadingAlbumData ? (
                <div className="py-12 text-center text-xs text-neutral-500 animate-pulse">
                  Carregando mídias do álbum no Firestore...
                </div>
              ) : albumPhotos.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center p-6 space-y-3 bg-[#FAF9F5] rounded-xl border border-dashed border-neutral-300">
                  <div className="w-12 h-12 rounded-full bg-neutral-200/60 flex items-center justify-center text-neutral-500">
                    <Camera className="w-6 h-6 text-[#B8954A]" />
                  </div>
                  <div>
                    <h4 className="font-serif font-bold text-neutral-800 text-sm">
                      Nenhuma mídia cadastrada neste álbum ainda
                    </h4>
                    <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                      Clique em "Nova Mídia" acima para cadastrar fotos ou vídeos deste espaço da estrutura.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPhoto(null);
                      setPhotoForm({
                        title: '',
                        altText: '',
                        caption: '',
                        url: '',
                        mediaType: 'image',
                        storagePath: '',
                        published: true,
                      });
                      setPhotoUploadError(null);
                      setPhotoPreviewError(false);
                      setShowPhotoForm(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#173D2B] text-white rounded-lg text-xs font-semibold shadow-2xs hover:bg-[#123022] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#B8954A]" />
                    <span>Adicionar Primeira Mídia</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {albumPhotos.map((photo, index) => {
                    const parsed = parseMediaUrl(photo.url, photo.mediaType);
                    const isVideo = parsed.mediaType === 'video';

                    return (
                      <div
                        key={photo.id}
                        className="bg-neutral-50/70 border border-neutral-200 hover:border-[#B8954A]/60 rounded-2xl overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
                      >
                        {/* Media Thumbnail */}
                        <div className="relative w-full h-44 bg-neutral-900 overflow-hidden flex items-center justify-center">
                          {isVideo ? (
                            parsed.thumbnailUrl ? (
                              <div className="relative w-full h-full">
                                <img
                                  src={parsed.thumbnailUrl}
                                  alt={photo.altText || photo.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                  <div className="w-12 h-12 rounded-full bg-white/90 text-[#173D2B] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                    <Play className="w-5 h-5 fill-current ml-0.5 text-[#173D2B]" />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center text-neutral-400 space-y-1.5 p-4 text-center">
                                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-[#DFC282]">
                                  <Play className="w-6 h-6 fill-current ml-0.5" />
                                </div>
                                <span className="text-[10px] font-semibold text-neutral-300">
                                  {parsed.providerLabel}
                                </span>
                              </div>
                            )
                          ) : (
                            <img
                              src={parsed.streamUrl || photo.url}
                              alt={photo.altText || photo.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const parent = e.currentTarget.parentElement;
                                if (parent && !parent.querySelector('.media-err-placeholder')) {
                                  const errDiv = document.createElement('div');
                                  errDiv.className = 'media-err-placeholder flex flex-col items-center justify-center p-3 text-neutral-400 text-center text-xs';
                                  errDiv.innerHTML = '<span class="text-[11px] font-semibold text-neutral-300">Imagem Indisponível</span>';
                                  parent.appendChild(errDiv);
                                }
                              }}
                            />
                          )}

                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

                          {/* Top badges */}
                          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                            <span className="bg-black/70 backdrop-blur-xs text-white font-mono font-bold text-[10px] px-2 py-0.5 rounded-md border border-white/20">
                              #{photo.order}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border backdrop-blur-xs ${
                                isVideo
                                  ? 'bg-[#B8954A]/90 text-white border-[#B8954A]'
                                  : 'bg-black/70 text-neutral-200 border-white/20'
                              }`}
                            >
                              {isVideo ? 'Vídeo' : 'Foto'}
                            </span>
                          </div>

                          <div className="absolute top-2.5 right-2.5">
                            {photo.published ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-full shadow-2xs">
                                <Eye className="w-3 h-3 text-emerald-700" />
                                Publicada
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-full shadow-2xs">
                                <EyeOff className="w-3 h-3 text-amber-700" />
                                Oculta
                              </span>
                            )}
                          </div>

                          {/* Order controls */}
                          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 bg-black/60 backdrop-blur-xs rounded-lg p-0.5 border border-white/20">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => handleMovePhotoOrder(index, 'up')}
                              className="p-1 text-white hover:text-[#DFC282] disabled:opacity-20 cursor-pointer"
                              title="Mover mídia para cima / esquerda"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={index === albumPhotos.length - 1}
                              onClick={() => handleMovePhotoOrder(index, 'down')}
                              className="p-1 text-white hover:text-[#DFC282] disabled:opacity-20 cursor-pointer"
                              title="Mover mídia para baixo / direita"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Media details */}
                        <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-serif font-bold text-neutral-900 text-sm line-clamp-1">
                                {photo.title}
                              </h4>
                              <span className="text-[10px] font-mono text-neutral-400 flex-shrink-0">
                                {parsed.providerLabel}
                              </span>
                            </div>
                            {photo.caption && (
                              <p className="text-xs text-neutral-500 line-clamp-2 mt-1">
                                {photo.caption}
                              </p>
                            )}
                            <div className="text-[10px] text-neutral-400 mt-2 line-clamp-1 italic">
                              Alt: {photo.altText}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="pt-3 border-t border-neutral-200/80 flex items-center justify-between text-xs">
                            <button
                              type="button"
                              onClick={() => handleTogglePhotoPublish(photo)}
                              className="inline-flex items-center gap-1 text-neutral-600 hover:text-[#173D2B] font-medium cursor-pointer"
                              title="Alternar visibilidade no site"
                            >
                              {photo.published ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5 text-neutral-500" />
                                  <span>Ocultar</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Publicar</span>
                                </>
                              )}
                            </button>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEditPhoto(photo)}
                                className="p-1.5 text-neutral-600 hover:text-[#173D2B] hover:bg-white rounded-lg transition-colors cursor-pointer"
                                title="Editar mídia"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeletePhotoConfirm(photo)}
                                className="p-1.5 text-neutral-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Excluir mídia"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: CONTEÚDO INSTITUCIONAL */}
        {/* ========================================================= */}

        {activeTab === 'content' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-serif font-bold text-[#173D2B]">
                Gestão de Conteúdo Institucional
              </h1>
              <p className="text-xs text-neutral-600 mt-1">
                Textos, canais de contato, telefones oficiais e horários de visitação da Victoria Lar.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* HERO SECTION */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
                  <h3 className="font-serif font-bold text-neutral-900 text-base">
                    1. Cabeçalho Principal (Hero) & Contatos Rápidos
                  </h3>
                  <button
                    onClick={() => handleSaveContent('hero')}
                    disabled={savingContentKey === 'hero'}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#173D2B] hover:bg-[#123022] text-white text-xs font-semibold rounded-lg shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5 text-[#B8954A]" />
                    <span>{savingContentKey === 'hero' ? 'Salvando...' : 'Salvar Seção Hero'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {/* HERO PHOTO MANAGER (Foto inserida pelo ADM) */}
                  <div className="sm:col-span-2 bg-[#FAF9F5] border-2 border-[#B8954A]/30 rounded-xl p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#173D2B]/10 pb-3">
                      <div className="flex items-center gap-2">
                        <Camera className="w-5 h-5 text-[#B8954A]" />
                        <span className="font-serif font-bold text-sm text-[#173D2B]">
                          Foto de Destaque da Capa (Painel Hero)
                        </span>
                      </div>
                      <span className="text-[11px] text-neutral-500 font-medium">
                        Foto exibida no painel de abertura da página inicial
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                      {/* Left side: Upload & URL with Live Parser */}
                      <div className="md:col-span-7 space-y-3.5">
                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Link da Imagem (URL da Foto) *
                          </label>
                          <input
                            type="text"
                            placeholder="https://drive.google.com/file/d/... ou link direto https://exemplo.com/foto.jpg"
                            value={contentMap['hero']?.imageUrl || ''}
                            onChange={(e) => {
                              setHeroPhotoError(false);
                              setHeroPhotoUsingFallback(false);
                              setContentMap({
                                ...contentMap,
                                hero: { ...(contentMap['hero'] || { key: 'hero', title: 'Victoria Lar Residencial' }), imageUrl: e.target.value },
                              });
                            }}
                            className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#173D2B]"
                          />
                        </div>

                        {/* Live Parser Feedback */}
                        {(() => {
                          const currentHeroUrl = contentMap['hero']?.imageUrl || '';
                          if (!currentHeroUrl.trim()) return null;
                          const parsed = parsePhotoUrl(currentHeroUrl);
                          return (
                            <div className="space-y-1.5 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-neutral-600">Provedor Detectado:</span>
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                    parsed.isValid ? 'bg-[#173D2B] text-white' : 'bg-red-800 text-white'
                                  }`}
                                >
                                  {parsed.providerLabel}
                                </span>
                              </div>

                              {parsed.warning && (
                                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-start gap-2">
                                  <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                                  <span>{parsed.warning}</span>
                                </div>
                              )}

                              {!parsed.isValid && (
                                <div className="p-2.5 bg-red-50 border border-red-300 rounded-lg text-red-900 text-xs flex items-start gap-2">
                                  <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
                                  <span>{parsed.errorMessage || 'Link inválido para exibição como foto.'}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Legenda / Descrição da Foto
                          </label>
                          <input
                            type="text"
                            placeholder="ex: Jardins ensolarados e espaços de convivência planejados"
                            value={contentMap['hero']?.imageCaption || ''}
                            onChange={(e) =>
                              setContentMap({
                                ...contentMap,
                                hero: { ...(contentMap['hero'] || { key: 'hero', title: 'Victoria Lar Residencial' }), imageCaption: e.target.value },
                              })
                            }
                            className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs"
                          />
                        </div>

                        {/* File Upload from PC / Phone */}
                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Ou Carregar Foto do Computador ou Celular
                          </label>
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-semibold shadow-2xs transition-all hover:border-[#B8954A]">
                              <Upload className="w-3.5 h-3.5 text-[#B8954A]" />
                              <span>Escolher Foto do Arquivo...</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = (readerEvent) => {
                                    const img = new Image();
                                    img.onload = () => {
                                      const canvas = document.createElement('canvas');
                                      let width = img.width;
                                      let height = img.height;
                                      const maxDim = 1000;
                                      if (width > maxDim || height > maxDim) {
                                        if (width > height) {
                                          height = Math.round((height * maxDim) / width);
                                          width = maxDim;
                                        } else {
                                          width = Math.round((width * maxDim) / height);
                                          height = maxDim;
                                        }
                                      }
                                      canvas.width = width;
                                      canvas.height = height;
                                      const ctx = canvas.getContext('2d');
                                      ctx?.drawImage(img, 0, 0, width, height);
                                      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                                      setHeroPhotoError(false);
                                      setHeroPhotoUsingFallback(false);
                                      setContentMap({
                                        ...contentMap,
                                        hero: {
                                          ...(contentMap['hero'] || { key: 'hero', title: 'Victoria Lar Residencial' }),
                                          imageUrl: compressedDataUrl,
                                        },
                                      });
                                    };
                                    img.src = readerEvent.target?.result as string;
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                            </label>

                            {contentMap['hero']?.imageUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  setHeroPhotoError(false);
                                  setHeroPhotoUsingFallback(false);
                                  setContentMap({
                                    ...contentMap,
                                    hero: { ...(contentMap['hero'] || { key: 'hero', title: 'Victoria Lar Residencial' }), imageUrl: '' },
                                  });
                                }}
                                className="text-neutral-500 hover:text-red-600 text-xs flex items-center gap-1 px-2 py-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remover Foto</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right side: Live Preview Frame with Exact Public Logic */}
                      <div className="md:col-span-5 flex flex-col items-center">
                        <span className="text-[11px] font-semibold text-neutral-600 mb-1.5 self-start">
                          Pré-visualização do Painel da Capa:
                        </span>
                        <div className="w-full h-56 rounded-xl overflow-hidden border-2 border-[#B8954A]/40 shadow-sm relative bg-neutral-900 flex items-center justify-center">
                          {(() => {
                            const rawHeroUrl = contentMap['hero']?.imageUrl || '';
                            if (!rawHeroUrl.trim()) {
                              return (
                                <div className="w-full h-full bg-[#173D2B] flex flex-col items-center justify-center p-4 text-center">
                                  <VictoriaEmblem variant="light" width={48} height={32} />
                                  <span className="text-[11px] text-white/90 mt-2 font-serif font-bold">Victoria Lar Residencial</span>
                                  <span className="text-[9px] text-[#DFC282]">Nenhuma foto cadastrada (Exibindo Brasão Oficial)</span>
                                </div>
                              );
                            }

                            const parsed = resolvePhotoDisplayUrl(rawHeroUrl);

                            if (!parsed.isValid || heroPhotoError) {
                              return (
                                <div className="w-full h-full bg-[#173D2B]/95 flex flex-col items-center justify-center p-4 text-center text-white space-y-1">
                                  <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 mx-auto">
                                    <AlertTriangle className="w-4 h-4 text-amber-300" />
                                  </div>
                                  <span className="text-xs font-serif font-bold text-white block">
                                    Não foi possível carregar a imagem
                                  </span>
                                  <p className="text-[10px] text-amber-200/90 max-w-xs leading-relaxed">
                                    {parsed.provider === 'google-drive'
                                      ? 'Verifique se o compartilhamento no Google Drive está definido como "Qualquer pessoa com o link pode ver".'
                                      : parsed.errorMessage || 'Verifique se o link da foto está acessível publicamente (JPG, PNG ou WebP).'}
                                  </p>
                                  <span className="text-[9px] text-white/50 pt-1 block">
                                    A URL cadastrada continua salva normalmente.
                                  </span>
                                </div>
                              );
                            }

                            const activeSrc = heroPhotoUsingFallback && parsed.fallbackUrl ? parsed.fallbackUrl : parsed.displayUrl;

                            return (
                              <img
                                key={activeSrc}
                                src={activeSrc}
                                alt="Prévia da foto da capa"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={() => {
                                  if (parsed.fallbackUrl && !heroPhotoUsingFallback) {
                                    setHeroPhotoUsingFallback(true);
                                  } else {
                                    setHeroPhotoError(true);
                                  }
                                }}
                                onLoad={() => {
                                  setHeroPhotoError(false);
                                }}
                              />
                            );
                          })()}

                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                          <div className="absolute top-2 right-2 px-2 py-0.5 bg-[#173D2B]/90 text-white rounded-full text-[9px] font-semibold border border-[#B8954A]/40">
                            Ambiente Humanizado
                          </div>
                          <div className="absolute bottom-2 left-2.5 right-2.5 text-white text-[10px] space-y-0.5">
                            <span className="bg-[#B8954A] text-black text-[9px] font-bold px-1.5 py-0.2 rounded-xs inline-block">
                              Estrutura & Convivência
                            </span>
                            <div className="font-medium line-clamp-2 drop-shadow-xs">
                              {contentMap['hero']?.imageCaption ||
                                'Jardins ensolarados, solário e áreas de convivência planejadas para acolher com amor.'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-neutral-700 mb-1">Título de Impacto</label>
                    <input
                      type="text"
                      value={contentMap['hero']?.title || ''}
                      onChange={(e) =>
                        setContentMap({
                          ...contentMap,
                          hero: { ...(contentMap['hero'] || { key: 'hero' }), title: e.target.value },
                        })
                      }
                      className="w-full p-2.5 border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-neutral-700 mb-1">Subtítulo / Missão</label>
                    <textarea
                      rows={2}
                      value={contentMap['hero']?.subtitle || ''}
                      onChange={(e) =>
                        setContentMap({
                          ...contentMap,
                          hero: { ...(contentMap['hero'] || { key: 'hero' }), subtitle: e.target.value },
                        })
                      }
                      className="w-full p-2.5 border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Telefone Fixo</label>
                    <input
                      type="text"
                      value={contentMap['hero']?.phone || ''}
                      onChange={(e) =>
                        setContentMap({
                          ...contentMap,
                          hero: { ...(contentMap['hero'] || { key: 'hero' }), phone: e.target.value },
                        })
                      }
                      className="w-full p-2.5 border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">WhatsApp de Atendimento</label>
                    <input
                      type="text"
                      value={contentMap['hero']?.whatsapp || ''}
                      onChange={(e) =>
                        setContentMap({
                          ...contentMap,
                          hero: { ...(contentMap['hero'] || { key: 'hero' }), whatsapp: e.target.value },
                        })
                      }
                      className="w-full p-2.5 border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">E-mail Institucional</label>
                    <input
                      type="text"
                      value={contentMap['hero']?.email || ''}
                      onChange={(e) =>
                        setContentMap({
                          ...contentMap,
                          hero: { ...(contentMap['hero'] || { key: 'hero' }), email: e.target.value },
                        })
                      }
                      className="w-full p-2.5 border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Horário de Visitação</label>
                    <input
                      type="text"
                      value={contentMap['hero']?.visitingHours || ''}
                      onChange={(e) =>
                        setContentMap({
                          ...contentMap,
                          hero: { ...(contentMap['hero'] || { key: 'hero' }), visitingHours: e.target.value },
                        })
                      }
                      className="w-full p-2.5 border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-neutral-700 mb-1">Endereço Completo</label>
                    <input
                      type="text"
                      value={contentMap['hero']?.address || ''}
                      onChange={(e) =>
                        setContentMap({
                          ...contentMap,
                          hero: { ...(contentMap['hero'] || { key: 'hero' }), address: e.target.value },
                        })
                      }
                      className="w-full p-2.5 border border-neutral-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* ABOUT SECTION */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
                  <h3 className="font-serif font-bold text-neutral-900 text-base">
                    2. Seção "Sobre Nós / Vocação"
                  </h3>
                  <button
                    onClick={() => handleSaveContent('about')}
                    disabled={savingContentKey === 'about'}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#173D2B] hover:bg-[#123022] text-white text-xs font-semibold rounded-lg shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5 text-[#B8954A]" />
                    <span>{savingContentKey === 'about' ? 'Salvando...' : 'Salvar Seção Sobre'}</span>
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Título</label>
                    <input
                      type="text"
                      value={contentMap['about']?.title || ''}
                      onChange={(e) =>
                        setContentMap({
                          ...contentMap,
                          about: { ...(contentMap['about'] || { key: 'about' }), title: e.target.value },
                        })
                      }
                      className="w-full p-2.5 border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">História & Filosofia</label>
                    <textarea
                      rows={5}
                      value={contentMap['about']?.body || ''}
                      onChange={(e) =>
                        setContentMap({
                          ...contentMap,
                          about: { ...(contentMap['about'] || { key: 'about' }), body: e.target.value },
                        })
                      }
                      className="w-full p-2.5 border border-neutral-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* =================================================== */}
              {/* 3. QUEM ESTÁ POR TRÁS (Dois Proprietários) */}
              {/* =================================================== */}
              <div className="bg-white border-2 border-[#B8954A]/40 rounded-2xl p-6 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#173D2B]/10 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-[#B8954A]" />
                      <h3 className="font-serif font-bold text-neutral-900 text-base">
                        3. Painel "Quem está por trás..." (Dois Proprietários)
                      </h3>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      Gerencie as fotos, nomes, cargos, saudações, trajetórias e citações dos dois sócios-proprietários exibidos lado a lado na aba Sobre Nós.
                    </p>
                  </div>

                  <button
                    onClick={() => handleSaveContent(activeOwnerTab)}
                    disabled={savingContentKey === activeOwnerTab}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#173D2B] hover:bg-[#123022] text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-all hover:scale-105"
                  >
                    <Save className="w-3.5 h-3.5 text-[#B8954A]" />
                    <span>
                      {savingContentKey === activeOwnerTab
                        ? 'Gravando no Banco...'
                        : `Salvar ${activeOwnerTab === 'owner_1' ? 'Proprietário 1' : 'Proprietário 2'}`}
                    </span>
                  </button>
                </div>

                {/* Sub-Tabs Switcher */}
                <div className="flex gap-2 p-1.5 bg-[#FAF9F5] border border-[#173D2B]/10 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveOwnerTab('owner_1')}
                    className={`flex-1 py-2.5 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      activeOwnerTab === 'owner_1'
                        ? 'bg-[#173D2B] text-white shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-[#B8954A]" />
                    <span>Proprietário 1 ({contentMap['owner_1']?.imageCaption || 'Olga'})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveOwnerTab('owner_2')}
                    className={`flex-1 py-2.5 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      activeOwnerTab === 'owner_2'
                        ? 'bg-[#173D2B] text-white shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-[#B8954A]" />
                    <span>Proprietário 2 ({contentMap['owner_2']?.imageCaption || 'Robson'})</span>
                  </button>
                </div>

                {/* Active Owner Form & Preview */}
                {(() => {
                  const fallback = INITIAL_INSTITUTIONAL_CONTENT[activeOwnerTab];
                  const current = contentMap[activeOwnerTab] || fallback;

                  const updateField = (field: keyof InstitutionalContent, val: string) => {
                    setContentMap({
                      ...contentMap,
                      [activeOwnerTab]: {
                        ...fallback,
                        ...current,
                        key: activeOwnerTab,
                        [field]: val,
                      },
                    });
                  };

                  return (
                    <div className="space-y-6">
                      {/* Photo Management Box */}
                      <div className="bg-[#FAF9F5] border border-neutral-200 rounded-xl p-4 sm:p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#173D2B]/10 pb-3">
                          <div className="flex items-center gap-2">
                            <Camera className="w-4 h-4 text-[#B8954A]" />
                            <span className="font-serif font-bold text-sm text-[#173D2B]">
                              Foto do {activeOwnerTab === 'owner_1' ? 'Proprietário 1' : 'Proprietário 2'}
                            </span>
                          </div>
                          <span className="text-[11px] text-neutral-500 font-medium">
                            Foto em formato retrato com selo de nome e cargo sobreposto
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                          <div className="md:col-span-8 space-y-3.5 text-xs">
                            <div>
                              <label className="block font-semibold text-neutral-700 mb-1">
                                Link Direto da Foto (URL) *
                              </label>
                              <input
                                type="text"
                                placeholder="https://drive.google.com/file/d/... ou link direto https://exemplo.com/foto.jpg"
                                value={current?.imageUrl || ''}
                                onChange={(e) => {
                                  setOwnerPhotoError((prev) => ({ ...prev, [activeOwnerTab]: false }));
                                  setOwnerPhotoUsingFallback((prev) => ({ ...prev, [activeOwnerTab]: false }));
                                  updateField('imageUrl', e.target.value);
                                }}
                                className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#173D2B]"
                              />
                            </div>

                            {/* Live Parser Feedback */}
                            {(() => {
                              const currentOwnerUrl = current?.imageUrl || '';
                              if (!currentOwnerUrl.trim()) return null;
                              const parsed = parsePhotoUrl(currentOwnerUrl);
                              return (
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-neutral-600">Provedor Detectado:</span>
                                    <span
                                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                        parsed.isValid ? 'bg-[#173D2B] text-white' : 'bg-red-800 text-white'
                                      }`}
                                    >
                                      {parsed.providerLabel}
                                    </span>
                                  </div>

                                  {parsed.warning && (
                                    <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-start gap-2">
                                      <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                                      <span>{parsed.warning}</span>
                                    </div>
                                  )}

                                  {!parsed.isValid && (
                                    <div className="p-2.5 bg-red-50 border border-red-300 rounded-lg text-red-900 text-xs flex items-start gap-2">
                                      <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
                                      <span>{parsed.errorMessage || 'Link inválido para exibição como foto.'}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            <div>
                              <label className="block font-semibold text-neutral-700 mb-1">
                                Ou Enviar Foto do Computador ou Celular
                              </label>
                              <div className="flex items-center gap-2 flex-wrap">
                                <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-semibold shadow-2xs transition-all hover:border-[#B8954A]">
                                  <Upload className="w-3.5 h-3.5 text-[#B8954A]" />
                                  <span>Escolher Foto do Arquivo...</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const reader = new FileReader();
                                      reader.onload = (readerEvent) => {
                                        const img = new Image();
                                        img.onload = () => {
                                          const canvas = document.createElement('canvas');
                                          let width = img.width;
                                          let height = img.height;
                                          const maxDim = 800;
                                          if (width > maxDim || height > maxDim) {
                                            if (width > height) {
                                              height = Math.round((height * maxDim) / width);
                                              width = maxDim;
                                            } else {
                                              width = Math.round((width * maxDim) / height);
                                              height = maxDim;
                                            }
                                          }
                                          canvas.width = width;
                                          canvas.height = height;
                                          const ctx = canvas.getContext('2d');
                                          ctx?.drawImage(img, 0, 0, width, height);
                                          const compressed = canvas.toDataURL('image/jpeg', 0.82);
                                          setOwnerPhotoError((prev) => ({ ...prev, [activeOwnerTab]: false }));
                                          setOwnerPhotoUsingFallback((prev) => ({ ...prev, [activeOwnerTab]: false }));
                                          updateField('imageUrl', compressed);
                                        };
                                        img.src = readerEvent.target?.result as string;
                                      };
                                      reader.readAsDataURL(file);
                                    }}
                                  />
                                </label>

                                {current?.imageUrl && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOwnerPhotoError((prev) => ({ ...prev, [activeOwnerTab]: false }));
                                      setOwnerPhotoUsingFallback((prev) => ({ ...prev, [activeOwnerTab]: false }));
                                      updateField('imageUrl', '');
                                    }}
                                    className="text-neutral-500 hover:text-red-600 text-xs flex items-center gap-1 px-2 py-1 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Remover Foto</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Live Thumbnail Preview with Exact Public Logic */}
                          <div className="md:col-span-4 flex flex-col items-center">
                            <span className="text-[11px] font-semibold text-neutral-600 mb-1.5 self-start">
                              Foto com Selo Sobreposto:
                            </span>
                            <div className="w-full aspect-[4/5] rounded-xl overflow-hidden border border-neutral-300 shadow-sm relative bg-neutral-900 flex items-center justify-center">
                              {(() => {
                                const rawOwnerUrl = current?.imageUrl || '';
                                if (!rawOwnerUrl.trim()) {
                                  return (
                                    <div className="w-full h-full bg-[#173D2B] flex flex-col items-center justify-center p-4 text-center">
                                      <VictoriaEmblem variant="light" width={40} height={28} />
                                      <span className="text-[10px] text-white/90 mt-2 font-serif font-bold">
                                        {current?.imageCaption || 'Proprietário'}
                                      </span>
                                      <span className="text-[9px] text-[#DFC282]">Nenhuma foto (Exibindo Brasão Oficial)</span>
                                    </div>
                                  );
                                }

                                const parsed = resolvePhotoDisplayUrl(rawOwnerUrl);
                                const isCurrentError = ownerPhotoError[activeOwnerTab];

                                if (!parsed.isValid || isCurrentError) {
                                  return (
                                    <div className="w-full h-full bg-[#173D2B]/95 flex flex-col items-center justify-center p-3 text-center text-white space-y-1">
                                      <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 mx-auto">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
                                      </div>
                                      <span className="text-xs font-serif font-bold text-white block">
                                        Foto Indisponível
                                      </span>
                                      <p className="text-[9px] text-amber-200/90 leading-tight">
                                        {parsed.provider === 'google-drive'
                                          ? 'Verifique se o compartilhamento no Google Drive está público ("Qualquer pessoa com o link pode ver").'
                                          : parsed.errorMessage || 'Verifique se o link da foto está acessível publicamente.'}
                                      </p>
                                      <span className="text-[8px] text-white/50 pt-1 block">
                                        Os dados deste sócio continuam salvos.
                                      </span>
                                    </div>
                                  );
                                }

                                const isUsingFallback = ownerPhotoUsingFallback[activeOwnerTab];
                                const activeSrc = isUsingFallback && parsed.fallbackUrl ? parsed.fallbackUrl : parsed.displayUrl;

                                return (
                                  <img
                                    key={activeSrc}
                                    src={activeSrc}
                                    alt="Prévia do proprietário"
                                    className="w-full h-full object-cover object-top"
                                    referrerPolicy="no-referrer"
                                    onError={() => {
                                      if (parsed.fallbackUrl && !isUsingFallback) {
                                        setOwnerPhotoUsingFallback((prev) => ({ ...prev, [activeOwnerTab]: true }));
                                      } else {
                                        setOwnerPhotoError((prev) => ({ ...prev, [activeOwnerTab]: true }));
                                      }
                                    }}
                                    onLoad={() => {
                                      setOwnerPhotoError((prev) => ({ ...prev, [activeOwnerTab]: false }));
                                    }}
                                  />
                                );
                              })()}

                              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
                              <div className="absolute bottom-2.5 left-2.5 right-2.5 text-left text-white">
                                <div className="font-serif font-bold text-sm leading-tight drop-shadow-md">
                                  {current?.imageCaption || 'Nome'}
                                </div>
                                <div className="text-[10px] text-[#DFC282] font-medium leading-tight mt-0.5">
                                  {current?.role || 'Cargo'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Text Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Nome no Selo da Foto
                          </label>
                          <input
                            type="text"
                            placeholder="ex: Olga"
                            value={current?.imageCaption || ''}
                            onChange={(e) => updateField('imageCaption', e.target.value)}
                            className="w-full p-2.5 border border-neutral-300 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Cargo / Função no Selo da Foto
                          </label>
                          <input
                            type="text"
                            placeholder="ex: Sócia-Proprietária & Gestora Humanizada"
                            value={current?.role || ''}
                            onChange={(e) => updateField('role', e.target.value)}
                            className="w-full p-2.5 border border-neutral-300 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Título de Saudação
                          </label>
                          <input
                            type="text"
                            placeholder="ex: Olá, sou a Olga."
                            value={current?.title || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            className="w-full p-2.5 border border-neutral-300 rounded-lg font-medium"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Selo Superior (Tag / Badge)
                          </label>
                          <input
                            type="text"
                            placeholder="ex: Atendimento direto, humano e sem intermediários"
                            value={current?.tag || ''}
                            onChange={(e) => updateField('tag', e.target.value)}
                            className="w-full p-2.5 border border-neutral-300 rounded-lg"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Trajetória, História & Biografia
                          </label>
                          <p className="text-[10px] text-neutral-500 mb-1.5">
                            Dica: Pressione Enter duas vezes para criar parágrafos separados, exatamente como no modelo de referência.
                          </p>
                          <textarea
                            rows={6}
                            placeholder="Conte a história, os anos de experiência, os valores e a dedicação ao acolhimento dos idosos..."
                            value={current?.body || ''}
                            onChange={(e) => updateField('body', e.target.value)}
                            className="w-full p-2.5 border border-neutral-300 rounded-lg leading-relaxed"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Frase de Destaque / Caixa Dourada (Citação Inferior)
                          </label>
                          <p className="text-[10px] text-neutral-500 mb-1.5">
                            Texto que aparece no box com a borda dourada lateral na parte inferior do painel.
                          </p>
                          <textarea
                            rows={3}
                            placeholder="ex: O Victoria Lar Residencial nasceu daí. Da vontade de usar toda essa experiência para criar um espaço onde o acolhimento humano..."
                            value={current?.quote || ''}
                            onChange={(e) => updateField('quote', e.target.value)}
                            className="w-full p-2.5 border border-neutral-300 rounded-lg"
                          />
                        </div>
                      </div>

                      {/* Save Button for active owner */}
                      <div className="flex justify-end pt-3 border-t border-neutral-200">
                        <button
                          type="button"
                          onClick={() => handleSaveContent(activeOwnerTab)}
                          disabled={savingContentKey === activeOwnerTab}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#173D2B] hover:bg-[#123022] text-white font-semibold text-xs rounded-xl shadow-sm transition-all hover:scale-105 cursor-pointer"
                        >
                          <Save className="w-4 h-4 text-[#B8954A]" />
                          <span>
                            {savingContentKey === activeOwnerTab
                              ? 'Salvando no Banco...'
                              : `Salvar Alterações de ${current?.imageCaption || 'Proprietário'}`}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ======================================================= */}
              {/* 4. AGENDAMENTO & 3 OPÇÕES DE CONTATO (Meeting, Form, WhatsApp) */}
              {/* ======================================================= */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-[#B8954A]" />
                      <h3 className="font-serif font-bold text-neutral-900 text-base">
                        4. Agendamento & 3 Opções de Contato (Meeting, Formulário e WhatsApp)
                      </h3>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      Configure as 3 opções de atendimento idênticas à Beeginning 4 You: Reunião online com link do Google Meet e e-mail automático, Formulário detalhado e WhatsApp direto.
                    </p>
                  </div>

                  <button
                    onClick={() => handleSaveContent('scheduling')}
                    disabled={savingContentKey === 'scheduling'}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#173D2B] hover:bg-[#123022] text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-all hover:scale-105"
                  >
                    <Save className="w-3.5 h-3.5 text-[#B8954A]" />
                    <span>
                      {savingContentKey === 'scheduling'
                        ? 'Gravando no Banco...'
                        : 'Salvar Configurações de Agendamento'}
                    </span>
                  </button>
                </div>

                {(() => {
                  const fallback = INITIAL_INSTITUTIONAL_CONTENT['scheduling'];
                  const current = contentMap['scheduling'] || fallback;

                  const updateField = (field: keyof InstitutionalContent, val: string) => {
                    setContentMap({
                      ...contentMap,
                      scheduling: {
                        ...fallback,
                        ...current,
                        key: 'scheduling',
                        [field]: val,
                      },
                    });
                  };

                  return (
                    <div className="space-y-6">
                      {/* Top Titles */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Título da Seção de Agendamentos
                          </label>
                          <input
                            type="text"
                            placeholder="ex: Como você prefere conversar?"
                            value={current?.title || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            className="w-full p-2.5 border border-neutral-300 rounded-lg font-medium"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Subtítulo / Instrução Inicial
                          </label>
                          <input
                            type="text"
                            placeholder="ex: Escolha o canal mais prático para você. Atendimento direto com os proprietários..."
                            value={current?.subtitle || ''}
                            onChange={(e) => updateField('subtitle', e.target.value)}
                            className="w-full p-2.5 border border-neutral-300 rounded-lg"
                          />
                        </div>
                      </div>

                      {/* Option 1: Reunião via Meeting */}
                      <div className="bg-[#FAF9F5] border border-neutral-200 rounded-xl p-4 sm:p-5 space-y-4">
                        <div className="flex items-center gap-2 border-b border-[#173D2B]/10 pb-2.5">
                          <Video className="w-4 h-4 text-purple-700" />
                          <span className="font-serif font-bold text-sm text-[#173D2B]">
                            Opção 1: Reunião Online via Google Meet
                          </span>
                          <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-semibold">
                            Dispara e-mail de confirmação automático
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div>
                            <label className="block font-semibold text-neutral-700 mb-1">
                              Link da Sala do Google Meet
                            </label>
                            <input
                              type="text"
                              placeholder="https://meet.google.com/vic-tori-lar"
                              value={current?.meetingLink || ''}
                              onChange={(e) => updateField('meetingLink', e.target.value)}
                              className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-xs"
                            />
                            <span className="text-[10px] text-neutral-500 mt-0.5 block">
                              Link que será entregue ao cliente e enviado por e-mail.
                            </span>
                          </div>

                          <div>
                            <label className="block font-semibold text-neutral-700 mb-1">
                              Duração Estimada da Reunião
                            </label>
                            <input
                              type="text"
                              placeholder="ex: 30 a 45 minutos"
                              value={current?.meetingDuration || ''}
                              onChange={(e) => updateField('meetingDuration', e.target.value)}
                              className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs"
                            />
                          </div>

                          {/* Controle Avançado de Horários Disponíveis */}
                          <div className="sm:col-span-2 bg-white p-4 rounded-xl border border-neutral-200 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
                              <div>
                                <label className="block font-semibold text-neutral-800 text-xs">
                                  Controle de Horários Disponíveis para Reunião via Meet
                                </label>
                                <p className="text-[11px] text-neutral-500">
                                  Estes horários alimentam a grade interativa do modal &quot;Reunião via Meet&quot;. O visitante só poderá agendar nos horários definidos aqui.
                                </p>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 self-start sm:self-auto">
                                Sincronização em Tempo Real
                              </span>
                            </div>

                            {/* Active Time Slot Chips */}
                            <div>
                              <span className="text-[11px] font-semibold text-neutral-600 block mb-1.5">
                                Horários Ativos Atualmente ({
                                  (current?.availableHours || '')
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean).length
                                } horários configurados):
                              </span>

                              <div className="flex flex-wrap gap-1.5 min-h-[38px] p-2 bg-[#FAF9F5] border border-neutral-200 rounded-lg items-center">
                                {(() => {
                                  const slots = (current?.availableHours || '')
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean);

                                  if (slots.length === 0) {
                                    return (
                                      <span className="text-xs text-neutral-400 italic">
                                        Nenhum horário cadastrado. Adicione abaixo ou clique em um modelo pré-definido.
                                      </span>
                                    );
                                  }

                                  return slots.map((slot) => (
                                    <span
                                      key={slot}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#173D2B]/20 text-[#173D2B] rounded-lg text-xs font-bold shadow-2xs group hover:border-red-300 transition-colors"
                                    >
                                      <Clock className="w-3 h-3 text-[#B8954A]" />
                                      <span>{slot}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = slots.filter((s) => s !== slot).join(', ');
                                          updateField('availableHours', next);
                                        }}
                                        className="text-neutral-400 hover:text-red-600 p-0.5 rounded hover:bg-red-50 transition-colors cursor-pointer"
                                        title={`Remover horário ${slot}`}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  ));
                                })()}
                              </div>
                            </div>

                            {/* Add New Slot Input & Action */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                              <div className="flex items-center gap-2 flex-1">
                                <input
                                  type="text"
                                  placeholder="Novo horário (ex: 10:30 ou 16:30)"
                                  value={newSlotInput}
                                  onChange={(e) => setNewSlotInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const trimmed = newSlotInput.trim();
                                      if (trimmed) {
                                        const slots = (current?.availableHours || '')
                                          .split(',')
                                          .map((s) => s.trim())
                                          .filter(Boolean);
                                        if (!slots.includes(trimmed)) {
                                          const next = [...slots, trimmed].sort().join(', ');
                                          updateField('availableHours', next);
                                        }
                                        setNewSlotInput('');
                                      }
                                    }
                                  }}
                                  className="flex-1 p-2 bg-white border border-neutral-300 rounded-lg text-xs font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const trimmed = newSlotInput.trim();
                                    if (trimmed) {
                                      const slots = (current?.availableHours || '')
                                        .split(',')
                                        .map((s) => s.trim())
                                        .filter(Boolean);
                                      if (!slots.includes(trimmed)) {
                                        const next = [...slots, trimmed].sort().join(', ');
                                        updateField('availableHours', next);
                                      }
                                      setNewSlotInput('');
                                    }
                                  }}
                                  className="px-3.5 py-2 bg-[#173D2B] hover:bg-[#123022] text-[#DFC282] rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
                                >
                                  + Adicionar Horário
                                </button>
                              </div>

                              {/* Presets */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-neutral-400 font-medium">Modelos:</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateField('availableHours', '09:00, 10:00, 11:00, 14:00, 15:00, 16:00, 17:00')
                                  }
                                  className="text-[10px] px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                                  title="Aplicar modelo Comercial Padrão"
                                >
                                  Comercial Padrão
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateField('availableHours', '09:00, 09:45, 10:30, 11:15')
                                  }
                                  className="text-[10px] px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                                  title="Aplicar modelo Manhã"
                                >
                                  Manhã
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateField('availableHours', '14:00, 15:00, 16:00, 17:00, 18:00')
                                  }
                                  className="text-[10px] px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                                  title="Aplicar modelo Tarde"
                                >
                                  Tarde
                                </button>
                              </div>
                            </div>

                            {/* Raw text input for manual comma-separated editing */}
                            <div className="pt-2 border-t border-neutral-100">
                              <label className="block text-[11px] font-medium text-neutral-500 mb-1">
                                Edição Direta em Texto (separados por vírgula):
                              </label>
                              <input
                                type="text"
                                placeholder="09:00, 10:00, 11:00, 14:00, 15:00, 16:00, 17:00"
                                value={current?.availableHours || ''}
                                onChange={(e) => updateField('availableHours', e.target.value)}
                                className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono text-neutral-700"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block font-semibold text-neutral-700 mb-1">
                              Assunto do E-mail de Confirmação
                            </label>
                            <input
                              type="text"
                              placeholder="Confirmação de Agendamento: Reunião - Victoria Lar Residencial"
                              value={current?.emailSubject || ''}
                              onChange={(e) => updateField('emailSubject', e.target.value)}
                              className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs"
                            />
                          </div>

                          <div>
                            <label className="block font-semibold text-neutral-700 mb-1">
                              Instruções Adicionais no E-mail
                            </label>
                            <input
                              type="text"
                              placeholder="Recomendamos acessar o link com 5 minutos de antecedência..."
                              value={current?.emailInstructions || ''}
                              onChange={(e) => updateField('emailInstructions', e.target.value)}
                              className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs"
                            />
                          </div>

                          {/* Caixa Informativa do E-mail e Google Calendar */}
                          <div className="sm:col-span-2 bg-[#FAF9F5] border-2 border-[#B8954A]/40 rounded-xl p-4 text-xs space-y-2">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-[#173D2B]" />
                              <span className="font-bold text-[#173D2B]">
                                Remetente Oficial: victorialarresidencial@gmail.com
                              </span>
                            </div>
                            <p className="text-neutral-600 leading-relaxed text-[11px]">
                              ✓ Todo agendamento pelo Google Meet dispara automaticamente um e-mail para o cliente informando data, horário, link da sala do Meet e botão de 1 clique para adicionar ao Google Calendar, além de anexo .ics compatível com smartphone, Apple Calendar e Outlook.
                            </p>
                            <p className="text-neutral-600 leading-relaxed text-[11px]">
                              🔐 <strong>Senha de App (Secret AI Studio):</strong> O envio utiliza autenticação segura do Gmail. Registre o segredo <code className="bg-neutral-200 px-1 py-0.5 rounded font-mono text-[#173D2B]">GMAIL_APP_PASSWORD</code> no painel Secrets do AI Studio com a senha de aplicativo de 16 dígitos gerada em <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="text-[#173D2B] underline font-semibold">myaccount.google.com/security</a> &gt; Verificação em 2 etapas &gt; Senhas de app.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Option 2: Formulário */}
                      <div className="bg-[#FAF9F5] border border-neutral-200 rounded-xl p-4 sm:p-5 space-y-4">
                        <div className="flex items-center gap-2 border-b border-[#173D2B]/10 pb-2.5">
                          <FileText className="w-4 h-4 text-[#B8954A]" />
                          <span className="font-serif font-bold text-sm text-[#173D2B]">
                            Opção 2: Formulário de Mensagem Detalhada
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div>
                            <label className="block font-semibold text-neutral-700 mb-1">
                              E-mail Institucional de Recebimento
                            </label>
                            <input
                              type="email"
                              placeholder="contato@victorialar.com.br"
                              value={current?.email || ''}
                              onChange={(e) => updateField('email', e.target.value)}
                              className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs"
                            />
                          </div>

                          <div>
                            <label className="block font-semibold text-neutral-700 mb-1">
                              Telefone Fixo de Apoio
                            </label>
                            <input
                              type="text"
                              placeholder="(11) 3456-7890"
                              value={current?.phone || ''}
                              onChange={(e) => updateField('phone', e.target.value)}
                              className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Option 3: WhatsApp Direto */}
                      <div className="bg-[#FAF9F5] border border-neutral-200 rounded-xl p-4 sm:p-5 space-y-4">
                        <div className="flex items-center gap-2 border-b border-[#173D2B]/10 pb-2.5">
                          <MessageCircle className="w-4 h-4 text-emerald-700" />
                          <span className="font-serif font-bold text-sm text-[#173D2B]">
                            Opção 3: WhatsApp Direto com os Proprietários
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div>
                            <label className="block font-semibold text-neutral-700 mb-1">
                              Número do WhatsApp (com DDD, ex: 11987654321)
                            </label>
                            <input
                              type="text"
                              placeholder="11987654321"
                              value={current?.whatsapp || ''}
                              onChange={(e) => updateField('whatsapp', e.target.value)}
                              className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-xs"
                            />
                          </div>

                          <div>
                            <label className="block font-semibold text-neutral-700 mb-1">
                              Mensagem Padrão Pré-preenchida
                            </label>
                            <input
                              type="text"
                              placeholder="Olá! Gostaria de tirar dúvidas sobre as acomodações do Victoria Lar..."
                              value={current?.whatsappMessage || ''}
                              onChange={(e) => updateField('whatsappMessage', e.target.value)}
                              className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Final Save Button */}
                      <div className="flex justify-end pt-3 border-t border-neutral-200">
                        <button
                          type="button"
                          onClick={() => handleSaveContent('scheduling')}
                          disabled={savingContentKey === 'scheduling'}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#173D2B] hover:bg-[#123022] text-white font-semibold text-xs rounded-xl shadow-sm transition-all hover:scale-105 cursor-pointer"
                        >
                          <Save className="w-4 h-4 text-[#B8954A]" />
                          <span>
                            {savingContentKey === 'scheduling'
                              ? 'Salvando no Banco...'
                              : 'Salvar Configurações de Agendamento'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* ABA: AGENDAMENTOS VIA FORMULÁRIO */}
        {/* ========================================================= */}
        {(activeTab === 'form_leads' || (activeTab === 'leads' && leadSubTab === 'form')) && (
          <div className="space-y-5">
            {/* Dual-Tab Subnav Switcher */}
            <div className="flex items-center gap-2 p-1.5 bg-neutral-200/70 rounded-2xl w-fit">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('form_leads');
                  setLeadSubTab('form');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-white text-[#173D2B] shadow-xs cursor-pointer"
              >
                <FileText className="w-4 h-4 text-[#B8954A]" />
                <span>Agendamentos Formulário ({formLeads.length})</span>
                {unreadFormCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[10px] font-bold">
                    {unreadFormCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('meet_leads');
                  setLeadSubTab('meet');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all text-neutral-600 hover:text-neutral-900 hover:bg-white/50 cursor-pointer"
              >
                <Video className="w-4 h-4 text-purple-700" />
                <span>Reuniões Google Meet ({meetLeads.length})</span>
                {unreadMeetCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 border border-purple-200 rounded-full text-[10px] font-bold">
                    {unreadMeetCount}
                  </span>
                )}
              </button>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-serif font-bold text-[#173D2B]">
                  Contatos & Agendamentos via Formulário
                </h1>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Tabela simplificada e minimalista com todas as informações por linha e ordenação cronológica.
                </p>
              </div>

              {/* Quick KPI Counters */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-700 shadow-2xs font-medium">
                  Total: <strong className="text-[#173D2B]">{formLeads.length}</strong>
                </span>
                <span className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 shadow-2xs font-medium">
                  Não Lidos: <strong>{unreadFormCount}</strong>
                </span>
                <span className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 shadow-2xs font-medium">
                  Contatados: <strong>{formLeads.filter(l => l.status === 'contacted').length}</strong>
                </span>
                <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 shadow-2xs font-medium">
                  Agendados: <strong>{formLeads.filter(l => l.status === 'scheduled').length}</strong>
                </span>
              </div>
            </div>

            {/* Filter, Search & Chronological Sort Toolbar */}
            <div className="bg-white border border-neutral-200 rounded-xl p-3 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={formSearch}
                    onChange={(e) => setFormSearch(e.target.value)}
                    placeholder="Buscar por nome, telefone, e-mail, parentesco..."
                    className="w-full pl-8 pr-7 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs placeholder-neutral-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#173D2B]"
                  />
                  {formSearch && (
                    <button
                      type="button"
                      onClick={() => setFormSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <select
                  value={formFilter}
                  onChange={(e) => setFormFilter(e.target.value)}
                  className="py-1.5 px-3 border border-neutral-200 rounded-lg bg-neutral-50 text-neutral-700 text-xs font-medium focus:bg-white focus:outline-hidden"
                >
                  <option value="all">Status: Todos ({formLeads.length})</option>
                  <option value="unread">Status: Não Lidos ({unreadFormCount})</option>
                  <option value="contacted">Status: Contatados</option>
                  <option value="scheduled">Status: Agendados</option>
                  <option value="read">Status: Lidos</option>
                  <option value="archived">Status: Arquivados</option>
                </select>
              </div>

              <div className="flex items-center gap-2 justify-end flex-wrap">
                <button
                  type="button"
                  onClick={() => setFormSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-neutral-700 font-medium cursor-pointer transition-colors"
                  title="Inverter ordem cronológica"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#B8954A]" />
                  <span>
                    Cronológico: {formSortOrder === 'desc' ? 'Mais Recentes ↓' : 'Mais Antigos ↑'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => exportToCSV(sortedAndFilteredFormLeads, 'contatos_formulario_victoria', false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-600 font-medium cursor-pointer transition-colors shadow-2xs"
                  title="Exportar dados visíveis para planilha CSV"
                >
                  <Download className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Exportar CSV</span>
                </button>

                <span className="text-[11px] text-neutral-400 pl-1">
                  ({sortedAndFilteredFormLeads.length} {sortedAndFilteredFormLeads.length === 1 ? 'registro' : 'registros'})
                </span>
              </div>
            </div>

            {/* Minimalist Single-Line Table */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FAF9F5] border-b border-neutral-200 text-neutral-600 font-semibold text-[11px] uppercase tracking-wider select-none">
                      <th className="py-3 px-3.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setFormSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                          className="inline-flex items-center gap-1 hover:text-[#173D2B] font-semibold cursor-pointer"
                          title="Clique para alternar ordem cronológica"
                        >
                          <span>Data / Hora</span>
                          <ArrowUpDown className="w-3 h-3 text-[#B8954A]" />
                        </button>
                      </th>
                      <th className="py-3 px-3.5 whitespace-nowrap">Nome</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">Telefone</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">E-mail</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">Parentesco</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">Interesse</th>
                      <th className="py-3 px-3.5 whitespace-nowrap min-w-[200px]">Mensagem</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">Status</th>
                      <th className="py-3 px-3.5 whitespace-nowrap text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {sortedAndFilteredFormLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className={`hover:bg-[#FAF9F5]/70 transition-colors whitespace-nowrap ${
                          lead.status === 'unread' ? 'bg-amber-50/25 font-medium' : ''
                        }`}
                      >
                        {/* 1. Data/Hora */}
                        <td className="py-2.5 px-3.5 text-neutral-600 font-mono text-[11px] whitespace-nowrap">
                          {formatDateTimeBR(lead.createdAt)}
                        </td>

                        {/* 2. Nome */}
                        <td className="py-2.5 px-3.5 text-neutral-900 font-medium whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {lead.status === 'unread' && (
                              <span
                                className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"
                                title="Novo contato não lido"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedLeadModal(lead)}
                              className="text-left font-semibold text-[#173D2B] hover:underline cursor-pointer"
                              title="Ver ficha completa"
                            >
                              {lead.name}
                            </button>
                          </div>
                        </td>

                        {/* 3. Telefone */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${getCleanPhoneDigits(lead.phone)}`}
                              className="text-neutral-700 hover:text-[#173D2B] font-mono hover:underline"
                              title="Ligar para o contato"
                            >
                              {lead.phone}
                            </a>
                            <a
                              href={buildWhatsAppLink(
                                lead.phone,
                                `Olá ${lead.name}, tudo bem? Aqui é da equipe do Victoria Lar Residencial. Recebemos sua mensagem enviada através do nosso formulário de contato e gostaríamos de tirar suas dúvidas sobre nossos cuidados e acomodações.`
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="Abrir conversa no WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>

                        {/* 4. E-mail */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          {lead.email ? (
                            <a
                              href={`mailto:${lead.email}?subject=Retorno de Contato - Victoria Lar Residencial`}
                              className="text-neutral-600 hover:text-[#173D2B] hover:underline"
                              title="Enviar e-mail direto"
                            >
                              {lead.email}
                            </a>
                          ) : (
                            <span className="text-neutral-300 italic">-</span>
                          )}
                        </td>

                        {/* 5. Parentesco */}
                        <td className="py-2.5 px-3.5 text-neutral-600 whitespace-nowrap">
                          {lead.relationship || <span className="text-neutral-300 italic">Não informado</span>}
                        </td>

                        {/* 6. Interesse */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-[11px] font-normal border border-neutral-200">
                            {lead.serviceInterest || 'Geral'}
                          </span>
                        </td>

                        {/* 7. Mensagem (1 linha truncada com clique para ver completa) */}
                        <td className="py-2.5 px-3.5 max-w-[220px] whitespace-nowrap">
                          {lead.message ? (
                            <button
                              type="button"
                              onClick={() => setSelectedLeadModal(lead)}
                              className="text-left text-neutral-600 italic hover:text-neutral-900 truncate block w-full cursor-pointer hover:underline"
                              title={`Clique para ler a mensagem completa:\n"${lead.message}"`}
                            >
                              "{lead.message}"
                            </button>
                          ) : (
                            <span className="text-neutral-300 italic">Sem mensagem adicional</span>
                          )}
                        </td>

                        {/* 8. Status */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <select
                            value={lead.status}
                            onChange={(e) => handleUpdateLead(lead.id!, e.target.value as any)}
                            className={`text-[11px] font-medium py-1 px-2 rounded-md border cursor-pointer focus:outline-hidden ${
                              lead.status === 'unread'
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : lead.status === 'scheduled'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : lead.status === 'contacted'
                                ? 'bg-blue-50 text-blue-800 border-blue-300'
                                : 'bg-neutral-50 text-neutral-600 border-neutral-200'
                            }`}
                          >
                            <option value="unread">Não Lido</option>
                            <option value="read">Lido</option>
                            <option value="contacted">Contatado</option>
                            <option value="scheduled">Agendado</option>
                            <option value="archived">Arquivado</option>
                          </select>
                        </td>

                        {/* 9. Ações */}
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() => setSelectedLeadModal(lead)}
                              className="p-1 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded transition-colors cursor-pointer"
                              title="Ver detalhes completos"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <a
                              href={buildWhatsAppLink(
                                lead.phone,
                                `Olá ${lead.name}, tudo bem? Aqui é da equipe do Victoria Lar Residencial. Recebemos sua mensagem enviada através do nosso formulário de contato e gostaríamos de tirar suas dúvidas sobre nossos cuidados e acomodações.`
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                              title="Conversar no WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>

                            {lead.email && (
                              <a
                                href={`mailto:${lead.email}?subject=Retorno de Contato - Victoria Lar Residencial`}
                                className="p-1 text-neutral-500 hover:text-[#173D2B] hover:bg-neutral-100 rounded transition-colors"
                                title="Enviar e-mail"
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </a>
                            )}

                            {lead.status === 'unread' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateLead(lead.id!, 'read')}
                                className="p-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                                title="Marcar como lido"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {sortedAndFilteredFormLeads.length === 0 && (
                <div className="py-12 px-4 text-center text-neutral-500 text-xs space-y-1 bg-white">
                  <FileText className="w-6 h-6 mx-auto text-neutral-300 mb-2" />
                  <div className="font-semibold text-neutral-700 text-sm">
                    Nenhum contato encontrado na tabela.
                  </div>
                  <p className="text-neutral-400">
                    {formSearch || formFilter !== 'all'
                      ? 'Tente ajustar os filtros ou termo de busca acima.'
                      : 'Nenhum agendamento via formulário registrado até o momento.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* ABA: REUNIÕES AGENDADAS PELO GOOGLE MEET */}
        {/* ========================================================= */}
        {(activeTab === 'meet_leads' || (activeTab === 'leads' && leadSubTab === 'meet')) && (
          <div className="space-y-5">
            {/* Dual-Tab Subnav Switcher */}
            <div className="flex items-center gap-2 p-1.5 bg-neutral-200/70 rounded-2xl w-fit">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('form_leads');
                  setLeadSubTab('form');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all text-neutral-600 hover:text-neutral-900 hover:bg-white/50 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-[#B8954A]" />
                <span>Agendamentos Formulário ({formLeads.length})</span>
                {unreadFormCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[10px] font-bold">
                    {unreadFormCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('meet_leads');
                  setLeadSubTab('meet');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-[#173D2B] text-white shadow-xs cursor-pointer"
              >
                <Video className="w-4 h-4 text-purple-300" />
                <span>Reuniões Google Meet ({meetLeads.length})</span>
                {unreadMeetCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-purple-200 text-purple-900 rounded-full text-[10px] font-bold">
                    {unreadMeetCount}
                  </span>
                )}
              </button>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-serif font-bold text-[#173D2B]">
                  Reuniões Agendadas via Google Meet
                </h1>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Tabela simplificada e minimalista com todas as informações por reunião em uma única linha e organizadas por ordem cronológica.
                </p>
              </div>

              {/* Quick KPI Counters */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-700 shadow-2xs font-medium">
                  Total: <strong className="text-purple-900">{meetLeads.length}</strong>
                </span>
                <span className="px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-purple-900 shadow-2xs font-medium">
                  Agendadas: <strong>{meetLeads.filter(l => l.status === 'scheduled').length}</strong>
                </span>
                <span className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 shadow-2xs font-medium">
                  Não Lidas: <strong>{unreadMeetCount}</strong>
                </span>
                <span className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 shadow-2xs font-medium">
                  Realizadas: <strong>{meetLeads.filter(l => l.status === 'contacted').length}</strong>
                </span>
              </div>
            </div>

            {/* Filter, Search & Chronological Sort Toolbar */}
            <div className="bg-white border border-neutral-200 rounded-xl p-3 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={meetSearch}
                    onChange={(e) => setMeetSearch(e.target.value)}
                    placeholder="Buscar por nome, telefone, e-mail, data..."
                    className="w-full pl-8 pr-7 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs placeholder-neutral-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#173D2B]"
                  />
                  {meetSearch && (
                    <button
                      type="button"
                      onClick={() => setMeetSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <select
                  value={meetFilter}
                  onChange={(e) => setMeetFilter(e.target.value)}
                  className="py-1.5 px-3 border border-neutral-200 rounded-lg bg-neutral-50 text-neutral-700 text-xs font-medium focus:bg-white focus:outline-hidden"
                >
                  <option value="all">Status: Todas ({meetLeads.length})</option>
                  <option value="scheduled">Status: Agendadas</option>
                  <option value="unread">Status: Não Lidas ({unreadMeetCount})</option>
                  <option value="contacted">Status: Realizadas / Contatadas</option>
                  <option value="archived">Status: Arquivadas</option>
                </select>
              </div>

              <div className="flex items-center gap-2 justify-end flex-wrap">
                <div className="inline-flex items-center bg-neutral-50 border border-neutral-200 rounded-lg p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setMeetSortField('scheduled')}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium ${
                      meetSortField === 'scheduled'
                        ? 'bg-white text-purple-900 shadow-2xs font-semibold'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                    title="Ordenar por data da reunião marcada"
                  >
                    Data da Reunião
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeetSortField('created')}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-medium ${
                      meetSortField === 'created'
                        ? 'bg-white text-[#173D2B] shadow-2xs font-semibold'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                    title="Ordenar por data de solicitação"
                  >
                    Data Solicitação
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setMeetSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-neutral-700 font-medium cursor-pointer transition-colors"
                  title="Inverter ordem cronológica"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-purple-700" />
                  <span>
                    {meetSortOrder === 'asc' ? 'Cronológica: Próximas ↑' : 'Cronológica: Recentes ↓'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => exportToCSV(sortedAndFilteredMeetLeads, 'reunioes_meet_victoria', true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-600 font-medium cursor-pointer transition-colors shadow-2xs"
                  title="Exportar reuniões visíveis para planilha CSV"
                >
                  <Download className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Exportar CSV</span>
                </button>

                <span className="text-[11px] text-neutral-400 pl-1">
                  ({sortedAndFilteredMeetLeads.length} {sortedAndFilteredMeetLeads.length === 1 ? 'reunião' : 'reuniões'})
                </span>
              </div>
            </div>

            {/* Minimalist Single-Line Table */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FAF9F5] border-b border-neutral-200 text-neutral-600 font-semibold text-[11px] uppercase tracking-wider select-none">
                      <th className="py-3 px-3.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setMeetSortField('scheduled');
                            setMeetSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                          }}
                          className="inline-flex items-center gap-1 hover:text-purple-900 font-semibold cursor-pointer"
                          title="Clique para alternar ordem cronológica pela data da reunião"
                        >
                          <Calendar className="w-3 h-3 text-[#B8954A]" />
                          <span>Data & Horário Marcado</span>
                          <ArrowUpDown className="w-3 h-3 text-purple-700" />
                        </button>
                      </th>
                      <th className="py-3 px-3.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setMeetSortField('created');
                            setMeetSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                          }}
                          className="inline-flex items-center gap-1 hover:text-[#173D2B] font-semibold cursor-pointer"
                          title="Clique para ordenar por data de envio da solicitação"
                        >
                          <span>Solicitação</span>
                        </button>
                      </th>
                      <th className="py-3 px-3.5 whitespace-nowrap">Nome</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">Telefone</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">E-mail</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">Parentesco</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">Interesse</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">Google Meet</th>
                      <th className="py-3 px-3.5 whitespace-nowrap min-w-[180px]">Mensagem / Obs</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">Status</th>
                      <th className="py-3 px-3.5 whitespace-nowrap text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {sortedAndFilteredMeetLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className={`hover:bg-purple-50/20 transition-colors whitespace-nowrap ${
                          lead.status === 'unread'
                            ? 'bg-amber-50/25 font-medium'
                            : lead.status === 'scheduled'
                            ? 'bg-purple-50/15'
                            : ''
                        }`}
                      >
                        {/* 1. Data & Horário Marcado */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-semibold text-[#173D2B]">
                            <Calendar className="w-3.5 h-3.5 text-[#B8954A] flex-shrink-0" />
                            <span>{formatScheduledDateBR(lead.scheduledDate)}</span>
                            {lead.scheduledTime && (
                              <>
                                <span className="text-neutral-400 font-normal">às</span>
                                <span className="text-purple-900 font-mono bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 text-[11px]">
                                  {lead.scheduledTime}
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* 2. Data da Solicitação */}
                        <td className="py-2.5 px-3.5 text-neutral-500 font-mono text-[11px] whitespace-nowrap">
                          {formatDateTimeBR(lead.createdAt)}
                        </td>

                        {/* 3. Nome */}
                        <td className="py-2.5 px-3.5 text-neutral-900 font-medium whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {lead.status === 'unread' && (
                              <span
                                className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"
                                title="Nova reunião não lida"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedLeadModal(lead)}
                              className="text-left font-semibold text-[#173D2B] hover:underline cursor-pointer"
                              title="Ver ficha completa da reunião"
                            >
                              {lead.name}
                            </button>
                          </div>
                        </td>

                        {/* 4. Telefone */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${getCleanPhoneDigits(lead.phone)}`}
                              className="text-neutral-700 hover:text-[#173D2B] font-mono hover:underline"
                              title="Ligar para o telefone"
                            >
                              {lead.phone}
                            </a>
                            <a
                              href={buildWhatsAppLink(
                                lead.phone,
                                `Olá ${lead.name}, tudo bem? Aqui é da equipe do Victoria Lar Residencial! Confirmamos sua reunião online via Google Meet agendada para ${formatScheduledDateBR(
                                  lead.scheduledDate
                                )} às ${lead.scheduledTime}. Segue o link de acesso da nossa sala: ${
                                  lead.meetingLink || 'https://meet.google.com/vic-tori-lar'
                                }`
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="Confirmar via WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>

                        {/* 5. E-mail */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          {lead.email ? (
                            <a
                              href={`mailto:${lead.email}?subject=Confirmação de Reunião Google Meet - Victoria Lar Residencial`}
                              className="text-neutral-600 hover:text-[#173D2B] hover:underline"
                              title="Enviar e-mail de confirmação"
                            >
                              {lead.email}
                            </a>
                          ) : (
                            <span className="text-neutral-300 italic">-</span>
                          )}
                        </td>

                        {/* 6. Parentesco */}
                        <td className="py-2.5 px-3.5 text-neutral-600 whitespace-nowrap">
                          {lead.relationship || <span className="text-neutral-300 italic">Não informado</span>}
                        </td>

                        {/* 7. Interesse */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-900 border border-purple-200 text-[11px] font-normal">
                            {lead.serviceInterest || 'Planos e Valores'}
                          </span>
                        </td>

                        {/* 8. Google Meet Link */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyMeetLink(
                                  lead.id!,
                                  lead.meetingLink || 'https://meet.google.com/vic-tori-lar'
                                )
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded cursor-pointer transition-colors"
                              title="Copiar link da reunião para a área de transferência"
                            >
                              {copiedMeetId === lead.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-700 font-semibold">Copiado</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-purple-600" />
                                  <span>Copiar</span>
                                </>
                              )}
                            </button>

                            <a
                              href={lead.meetingLink || 'https://meet.google.com/vic-tori-lar'}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-purple-700 hover:bg-purple-100 rounded transition-colors inline-flex items-center"
                              title="Entrar na sala do Google Meet"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>

                        {/* 9. Mensagem/Obs */}
                        <td className="py-2.5 px-3.5 max-w-[180px] whitespace-nowrap">
                          {lead.message ? (
                            <button
                              type="button"
                              onClick={() => setSelectedLeadModal(lead)}
                              className="text-left text-neutral-600 italic hover:text-neutral-900 truncate block w-full cursor-pointer hover:underline"
                              title={`Clique para ler a observação completa:\n"${lead.message}"`}
                            >
                              "{lead.message}"
                            </button>
                          ) : (
                            <span className="text-neutral-300 italic">-</span>
                          )}
                        </td>

                        {/* 10. Status */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <select
                            value={lead.status}
                            onChange={(e) => handleUpdateLead(lead.id!, e.target.value as any)}
                            className={`text-[11px] font-medium py-1 px-2 rounded-md border cursor-pointer focus:outline-hidden ${
                              lead.status === 'scheduled'
                                ? 'bg-purple-50 text-purple-900 border-purple-300'
                                : lead.status === 'unread'
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : lead.status === 'contacted'
                                ? 'bg-blue-50 text-blue-800 border-blue-300'
                                : 'bg-neutral-50 text-neutral-600 border-neutral-200'
                            }`}
                          >
                            <option value="scheduled">Agendada</option>
                            <option value="unread">Não Lido</option>
                            <option value="contacted">Realizada / Contatada</option>
                            <option value="read">Lido</option>
                            <option value="archived">Arquivado</option>
                          </select>
                        </td>

                        {/* 11. Ações */}
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() => setSelectedLeadModal(lead)}
                              className="p-1 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded transition-colors cursor-pointer"
                              title="Ver detalhes completos da reunião"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <a
                              href={buildWhatsAppLink(
                                lead.phone,
                                `Olá ${lead.name}, tudo bem? Aqui é da equipe do Victoria Lar Residencial! Confirmamos sua reunião online via Google Meet agendada para ${formatScheduledDateBR(
                                  lead.scheduledDate
                                )} às ${lead.scheduledTime}. Segue o link de acesso da nossa sala: ${
                                  lead.meetingLink || 'https://meet.google.com/vic-tori-lar'
                                }`
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                              title="Confirmar via WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>

                            {lead.email && (
                              <a
                                href={`mailto:${lead.email}?subject=Confirmação de Reunião Google Meet - Victoria Lar Residencial`}
                                className="p-1 text-neutral-500 hover:text-[#173D2B] hover:bg-neutral-100 rounded transition-colors"
                                title="Enviar e-mail"
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {sortedAndFilteredMeetLeads.length === 0 && (
                <div className="py-12 px-4 text-center text-neutral-500 text-xs space-y-1 bg-white">
                  <Video className="w-6 h-6 mx-auto text-neutral-300 mb-2" />
                  <div className="font-semibold text-neutral-700 text-sm">
                    Nenhuma reunião encontrada na tabela.
                  </div>
                  <p className="text-neutral-400">
                    {meetSearch || meetFilter !== 'all'
                      ? 'Tente ajustar os filtros ou termo de busca acima.'
                      : 'Nenhuma reunião pelo Google Meet registrada até o momento.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: GESTÃO DE USUÁRIOS (Superadmin) */}
        {/* ========================================================= */}
        {activeTab === 'users' && isSuperAdmin && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-serif font-bold text-[#173D2B]">
                Gestão Administrativa & Controle de Acesso (RBAC)
              </h1>
              <p className="text-xs text-neutral-600 mt-1">
                Adicione administradores, defina funções e gerencie permissões. A proteção de concorrência impede a exclusão ou desativação do último superadministrador ativo.
              </p>
            </div>

            {/* Add New Admin Form */}
            <div className="bg-white border border-[#B8954A]/30 rounded-2xl p-5 shadow-xs">
              <h3 className="font-serif font-bold text-[#173D2B] text-sm mb-3">
                Conceder Acesso Administrativo
              </h3>
              <form onSubmit={handleAddAdmin} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-neutral-700 mb-1">E-mail do Usuário</label>
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="usuario@dominio.com"
                    className="w-full p-2 border border-neutral-300 rounded-lg text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Firebase UID</label>
                  <input
                    type="text"
                    value={newAdminUid}
                    onChange={(e) => setNewAdminUid(e.target.value)}
                    placeholder="UID do Firebase Auth"
                    className="w-full p-2 border border-neutral-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Função</label>
                  <select
                    value={newAdminRole}
                    onChange={(e) => setNewAdminRole(e.target.value as any)}
                    className="w-full p-2 border border-neutral-300 rounded-lg text-xs bg-white"
                  >
                    <option value="admin">Administrador (Gestão de Serviços/Conteúdo)</option>
                    <option value="superadmin">Superadministrador (Acesso Total)</option>
                  </select>
                </div>
                <div className="sm:col-span-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#173D2B] hover:bg-[#123022] text-white font-semibold rounded-lg text-xs shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#B8954A]" />
                    <span>Cadastrar Administrador</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Admin Users Table */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs text-neutral-700">
                <thead className="bg-[#FAF9F5] border-b border-neutral-200 text-neutral-600 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Usuário / E-mail</th>
                    <th className="py-3 px-4">Função</th>
                    <th className="py-3 px-4">Status no Banco</th>
                    <th className="py-3 px-4 text-right">Ações de Segurança</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {adminUsers.map((adm) => (
                    <tr key={adm.uid} className="hover:bg-neutral-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-neutral-900">{adm.email}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">{adm.uid}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase tracking-wider ${
                            adm.role === 'superadmin'
                              ? 'bg-[#B8954A]/20 text-[#173D2B] border border-[#B8954A]'
                              : 'bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          {adm.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {adm.active ? (
                          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                            Ativo
                          </span>
                        ) : (
                          <span className="text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleAdminRole(adm)}
                            className="px-2.5 py-1 text-xs border border-neutral-300 rounded-lg hover:bg-neutral-100 text-neutral-700 font-medium"
                            title="Alternar entre Superadmin e Admin"
                          >
                            Alternar Função
                          </button>
                          <button
                            onClick={() => handleToggleAdminStatus(adm)}
                            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                              adm.active
                                ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            }`}
                          >
                            {adm.active ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: AUDITORIA & SEGURANÇA */}
        {/* ========================================================= */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-serif font-bold text-[#173D2B]">
                Arquitetura de Segurança & Invariantes Inegociáveis
              </h1>
              <p className="text-xs text-neutral-600 mt-1">
                Conformidade com os 8 pilares de regras endurecidas do Firestore e requisitos do projeto.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Zero Storage */}
              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-2">
                <div className="flex items-center gap-2 text-[#173D2B] font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4 text-[#B8954A]" />
                  <span>Zero LocalStorage / SessionStorage / IndexedDB</span>
                </div>
                <p className="text-neutral-600 leading-relaxed">
                  A autenticação do Firebase está configurada com <code>inMemoryPersistence</code>. Nenhuma credencial privilegiada, token JWT ou rascunho é persistido no armazenamento permanente do navegador.
                </p>
                <div className="pt-2 text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>100% em conformidade com o requisito inegociável</span>
                </div>
              </div>

              {/* Firestore Connection & Secrets Source */}
              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#173D2B] font-semibold text-sm">
                    <RefreshCw className="w-4 h-4 text-[#B8954A]" />
                    <span>Conexão Cloud Firestore & Secrets</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isFirebaseConfiguredFromSecrets
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                    }`}
                  >
                    {isFirebaseConfiguredFromSecrets ? 'Via Secrets / .env' : 'Configuração Padrão'}
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] text-neutral-600 bg-[#FAF9F5] p-3 rounded-xl border border-neutral-200/80">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-neutral-700">Project ID:</span>
                    <span className="font-mono text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200">
                      {activeFirebaseConfig.projectId || 'Não definido'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-neutral-700">Database ID:</span>
                    <span className="font-mono text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200 font-bold">
                      {activeFirebaseConfig.firestoreDatabaseId || '(default)'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-neutral-700">Storage Bucket:</span>
                    <span className="font-mono text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200">
                      {activeFirebaseConfig.storageBucket || 'Não configurado'}
                    </span>
                  </div>
                </div>

                <div className="pt-1 text-neutral-800 font-mono bg-neutral-50 p-2.5 rounded-lg text-[11px] border border-neutral-200/60">
                  <div className="text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-500 mb-1">
                    Diagnóstico getDocFromServer (/system/bootstrap):
                  </div>
                  {connectionStatus || 'Verificando conexão com o banco...'}
                </div>
              </div>

              {/* Rules Are Not Filters */}
              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-2">
                <div className="flex items-center gap-2 text-[#173D2B] font-semibold text-sm">
                  <EyeOff className="w-4 h-4 text-[#B8954A]" />
                  <span>Isolamento Estrito de Rascunhos ("Rules Are Not Filters")</span>
                </div>
                <p className="text-neutral-600 leading-relaxed">
                  As consultas públicas na coleção <code>services</code> exigem a restrição <code>where('status', '==', 'published')</code>. Qualquer consulta não filtrada executada por visitantes é sumariamente rejeitada pelo motor de regras.
                </p>
                <div className="pt-2 text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Testes 18/18 e Dirty Dozen validados</span>
                </div>
              </div>

              {/* Last Superadmin OCC Protection */}
              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-2">
                <div className="flex items-center gap-2 text-[#173D2B] font-semibold text-sm">
                  <Shield className="w-4 h-4 text-[#B8954A]" />
                  <span>Proteção contra Desativação do Último Superadmin</span>
                </div>
                <p className="text-neutral-600 leading-relaxed">
                  O documento de guarda <code>/system/superAdminGuard</code> com controle de versão otimista garante que tentativas de desativar ou rebaixar o único superadministrador ativo remanescente sejam abortadas no servidor.
                </p>
                <div className="pt-2 text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Bloqueio transacional ativo</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dedicated Admin Preview Modal */}
        <StructureGalleryModal
          isOpen={isGalleryPreviewOpen}
          topicId={selectedTopicId}
          onClose={() => setIsGalleryPreviewOpen(false)}
          isAdminPreview={true}
        />

        {/* Contact / Meeting Detail Modal */}
        {selectedLeadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-xl w-full border border-neutral-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-4 sm:p-5 bg-[#FAF9F5] border-b border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`p-2 rounded-xl ${
                      selectedLeadModal.type === 'meeting' || selectedLeadModal.scheduledDate
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-amber-100 text-[#173D2B]'
                    }`}
                  >
                    {selectedLeadModal.type === 'meeting' || selectedLeadModal.scheduledDate ? (
                      <Video className="w-5 h-5 text-purple-700" />
                    ) : (
                      <FileText className="w-5 h-5 text-[#B8954A]" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-base text-[#173D2B]">
                      {selectedLeadModal.name}
                    </h3>
                    <div className="text-[11px] text-neutral-500">
                      {selectedLeadModal.type === 'meeting' || selectedLeadModal.scheduledDate
                        ? 'Reunião Agendada Google Meet'
                        : 'Formulário de Contato'}{' '}
                      • Enviado em {formatDateTimeBR(selectedLeadModal.createdAt)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedLeadModal(null)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 overflow-y-auto space-y-4 text-xs">
                {/* Status bar */}
                <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                  <span className="font-semibold text-neutral-700">Status do Registro:</span>
                  <select
                    value={selectedLeadModal.status}
                    onChange={(e) => {
                      const newStatus = e.target.value as any;
                      handleUpdateLead(selectedLeadModal.id!, newStatus);
                      setSelectedLeadModal((prev) => (prev ? { ...prev, status: newStatus } : null));
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-neutral-300 bg-white cursor-pointer focus:ring-1 focus:ring-[#173D2B]"
                  >
                    <option value="unread">Não Lido</option>
                    <option value="read">Lido</option>
                    <option value="contacted">Contatado</option>
                    <option value="scheduled">Agendado</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </div>

                {/* Meeting details if applicable */}
                {(selectedLeadModal.scheduledDate || selectedLeadModal.type === 'meeting') && (
                  <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900">
                        Horário da Reunião
                      </span>
                      <div className="flex items-center gap-1.5 font-bold text-purple-950 text-xs">
                        <Calendar className="w-3.5 h-3.5 text-purple-700" />
                        <span>{formatScheduledDateBR(selectedLeadModal.scheduledDate)}</span>
                        {selectedLeadModal.scheduledTime && (
                          <>
                            <span className="text-purple-600 font-normal">às</span>
                            <Clock className="w-3.5 h-3.5 text-purple-700" />
                            <span>{selectedLeadModal.scheduledTime}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-purple-200/60">
                      <span className="font-mono text-[11px] text-purple-900 truncate flex-1">
                        {selectedLeadModal.meetingLink || 'https://meet.google.com/vic-tori-lar'}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyMeetLink(
                              selectedLeadModal.id!,
                              selectedLeadModal.meetingLink || 'https://meet.google.com/vic-tori-lar'
                            )
                          }
                          className="px-2 py-1 bg-white hover:bg-purple-100 text-purple-800 border border-purple-200 rounded text-[11px] font-medium cursor-pointer"
                        >
                          {copiedMeetId === selectedLeadModal.id ? 'Copiado!' : 'Copiar'}
                        </button>
                        <a
                          href={selectedLeadModal.meetingLink || 'https://meet.google.com/vic-tori-lar'}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded text-[11px] font-medium flex items-center gap-1"
                        >
                          <span>Entrar</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-neutral-700">
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                    <span className="text-[10px] text-neutral-500 uppercase font-semibold block mb-0.5">
                      Telefone
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-neutral-900">{selectedLeadModal.phone}</span>
                      <a
                        href={`tel:${getCleanPhoneDigits(selectedLeadModal.phone)}`}
                        className="text-xs text-[#173D2B] font-semibold hover:underline"
                      >
                        Ligar
                      </a>
                    </div>
                  </div>

                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                    <span className="text-[10px] text-neutral-500 uppercase font-semibold block mb-0.5">
                      E-mail
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-neutral-900 truncate max-w-[180px]">
                        {selectedLeadModal.email || 'Não informado'}
                      </span>
                      {selectedLeadModal.email && (
                        <a
                          href={`mailto:${selectedLeadModal.email}`}
                          className="text-xs text-[#173D2B] font-semibold hover:underline"
                        >
                          Enviar
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                    <span className="text-[10px] text-neutral-500 uppercase font-semibold block mb-0.5">
                      Grau de Parentesco
                    </span>
                    <span className="font-medium text-neutral-900">
                      {selectedLeadModal.relationship || 'Não informado'}
                    </span>
                  </div>

                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                    <span className="text-[10px] text-neutral-500 uppercase font-semibold block mb-0.5">
                      Serviço / Interesse
                    </span>
                    <span className="font-medium text-neutral-900">
                      {selectedLeadModal.serviceInterest || 'Geral'}
                    </span>
                  </div>
                </div>

                {/* Full Message */}
                <div className="p-4 bg-[#FAF9F5] rounded-xl border border-neutral-200 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-neutral-800">
                    <MessageSquare className="w-3.5 h-3.5 text-[#B8954A]" />
                    <span>Mensagem / Observação do Contato:</span>
                  </div>
                  <p className="text-neutral-700 whitespace-pre-wrap leading-relaxed text-xs pl-5">
                    {selectedLeadModal.message || '(Nenhuma mensagem adicional informada)'}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between gap-2">
                <a
                  href={buildWhatsAppLink(
                    selectedLeadModal.phone,
                    selectedLeadModal.type === 'meeting' || selectedLeadModal.scheduledDate
                      ? `Olá ${selectedLeadModal.name}, tudo bem? Aqui é da equipe do Victoria Lar Residencial! Confirmamos sua reunião online via Google Meet agendada para ${formatScheduledDateBR(
                          selectedLeadModal.scheduledDate
                        )} às ${selectedLeadModal.scheduledTime}. Segue o link de acesso: ${
                          selectedLeadModal.meetingLink || 'https://meet.google.com/vic-tori-lar'
                        }`
                      : `Olá ${selectedLeadModal.name}, tudo bem? Aqui é da equipe do Victoria Lar Residencial. Recebemos seu contato através do formulário do site e gostaríamos de tirar suas dúvidas sobre nossos cuidados e acomodações.`
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Conversar no WhatsApp</span>
                </a>

                <button
                  type="button"
                  onClick={() => setSelectedLeadModal(null)}
                  className="px-4 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 rounded-lg text-neutral-700 font-semibold text-xs cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

