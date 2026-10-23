import React, { useState, useEffect } from 'react';
import {
  getPublishedServices,
  getInstitutionalContent,
  submitContactLead,
  scheduleOnlineMeeting,
} from '../services/firestoreService';
import { INITIAL_INSTITUTIONAL_CONTENT } from '../services/bootstrapService';
import { ServiceItem, InstitutionalContent } from '../types';
import { useAuth } from '../context/AuthContext';
import { VictoriaLogo, VictoriaEmblem } from './VictoriaLogo';
import { ContactLeadModal } from './ContactLeadModal';
import { MeetingScheduleModal } from './MeetingScheduleModal';
import { StructureGalleryModal } from './StructureGalleryModal';
import {
  HeartPulse,
  Heart,
  Stethoscope,
  Apple,
  Activity,
  Sparkles,
  Home,
  Music,
  ShieldCheck,
  Calendar,
  Clock,
  MapPin,
  Phone,
  Mail,
  CheckCircle2,
  ArrowRight,
  X,
  Send,
  Users,
  Sun,
  Shield,
  HelpCircle,
  Camera,
  Edit2,
  Plus,
  FileText,
  Video,
  MessageSquare,
  PhoneCall,
  MessageCircle,
  Copy,
  Check,
  ExternalLink,
  Image as ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import { resolvePhotoDisplayUrl } from '../utils/mediaUrlHelper';

interface LandingPageProps {
  onOpenAdminLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAdminLogin }) => {
  const { isAdmin } = useAuth();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [content, setContent] = useState<Record<string, InstitutionalContent>>({});
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingContent, setLoadingContent] = useState(true);
  const [servicesError, setServicesError] = useState(false);
  const [contentError, setContentError] = useState(false);
  const [heroPhotoError, setHeroPhotoError] = useState(false);
  const [heroPhotoUsingFallback, setHeroPhotoUsingFallback] = useState(false);
  const [ownerPhotoError, setOwnerPhotoError] = useState<Record<string, boolean>>({});
  const [ownerPhotoUsingFallback, setOwnerPhotoUsingFallback] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [activeServiceModal, setActiveServiceModal] = useState<ServiceItem | null>(null);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [leadModalService, setLeadModalService] = useState('Apresentação Geral e Planos');
  const [activeStructureTopic, setActiveStructureTopic] = useState<string | null>(null);

  // 3-Option Channel state: 'meeting' | 'form' | 'whatsapp'
  const [activeContactTab, setActiveContactTab] = useState<'meeting' | 'form' | 'whatsapp'>('meeting');

  // Form state (Classic lead form)
  const [leadForm, setLeadForm] = useState({
    name: '',
    email: '',
    phone: '',
    relationship: 'Filho(a)',
    serviceInterest: 'Apresentação Geral e Planos',
    message: '',
    honeypot: '',
  });
  const [submittingLead, setSubmittingLead] = useState(false);
  const [leadFeedback, setLeadFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Meeting Form state (Reunião via Google Meet)
  const [meetingForm, setMeetingForm] = useState({
    name: '',
    email: '',
    phone: '',
    date: '',
    time: '',
    relationship: 'Filho(a)',
    serviceInterest: 'Reunião de Apresentação e Planos',
    message: '',
    honeypot: '',
  });
  const [submittingMeeting, setSubmittingMeeting] = useState(false);
  const [meetingFeedback, setMeetingFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    meetingLink?: string;
    date?: string;
    time?: string;
    email?: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [customWhatsappMsg, setCustomWhatsappMsg] = useState('');

  useEffect(() => {
    loadPublicData();
  }, []);

  const loadPublicData = async (forceRefresh = false) => {
    try {
      setLoadingServices(true);
      setLoadingContent(true);
      setServicesError(false);
      setContentError(false);

      let loadedServices: ServiceItem[] | null = null;
      let loadedContent: Record<string, InstitutionalContent> | null = null;

      try {
        loadedServices = await getPublishedServices(forceRefresh);
      } catch (err) {
        console.warn('Erro ao carregar serviços publicados do Firestore:', err);
        setServicesError(true);
      }

      try {
        loadedContent = await getInstitutionalContent(forceRefresh);
      } catch (err) {
        console.warn('Erro ao carregar conteúdo institucional do Firestore:', err);
        setContentError(true);
      }

      // Only services registered and published by the ADM are displayed.
      const resolvedServices = loadedServices || [];
      setServices(resolvedServices);
      setContent(loadedContent || {});
    } catch (err) {
      console.warn('Erro ao carregar dados públicos:', err);
      setContentError(true);
    } finally {
      setLoadingServices(false);
      setLoadingContent(false);
    }
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeadFeedback(null);

    if (!leadForm.name || !leadForm.phone) {
      setLeadFeedback({ type: 'error', message: 'Por favor, preencha nome e telefone de contato.' });
      return;
    }

    const watchdogLead = setTimeout(() => {
      setSubmittingLead(false);
      setLeadFeedback({
        type: 'error',
        message: 'Tempo de resposta excedido. Verifique sua conexão e tente novamente.',
      });
    }, 9000);

    try {
      setSubmittingLead(true);
      const res = await submitContactLead(leadForm);
      setLeadFeedback({
        type: 'success',
        message: res.message || 'Sua solicitação de visita foi recebida! Nossa equipe entrará em contato prontamente.',
      });
      // Reset form
      setLeadForm({
        name: '',
        email: '',
        phone: '',
        relationship: 'Filho(a)',
        serviceInterest: 'Atendimento Geral e Planos Personalizados',
        message: '',
        honeypot: '',
      });
    } catch (err: any) {
      setLeadFeedback({
        type: 'error',
        message: err.message || 'Falha ao enviar mensagem. Por favor, tente novamente ou ligue para nós.',
      });
    } finally {
      clearTimeout(watchdogLead);
      setSubmittingLead(false);
    }
  };

  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMeetingFeedback(null);

    if (!meetingForm.name || !meetingForm.email || !meetingForm.phone) {
      setMeetingFeedback({
        type: 'error',
        message: 'Por favor, preencha nome, e-mail e telefone para receber a confirmação.',
      });
      return;
    }

    if (!meetingForm.date || !meetingForm.time) {
      setMeetingFeedback({
        type: 'error',
        message: 'Por favor, selecione uma data e um horário para a reunião.',
      });
      return;
    }

    const watchdogMeeting = setTimeout(() => {
      setSubmittingMeeting(false);
      setMeetingFeedback({
        type: 'error',
        message: 'Tempo de resposta excedido. Verifique sua conexão e tente novamente.',
      });
    }, 9000);

    try {
      setSubmittingMeeting(true);
      const schedulingConfig = content['scheduling'] || INITIAL_INSTITUTIONAL_CONTENT['scheduling'];
      const res = await scheduleOnlineMeeting({
        name: meetingForm.name,
        email: meetingForm.email,
        phone: meetingForm.phone,
        scheduledDate: meetingForm.date,
        scheduledTime: meetingForm.time,
        meetingLink: schedulingConfig?.meetingLink || 'https://meet.google.com/vic-tori-lar',
        relationship: meetingForm.relationship,
        serviceInterest: meetingForm.serviceInterest,
        message: meetingForm.message,
        emailSubject: schedulingConfig?.emailSubject,
        emailInstructions: schedulingConfig?.emailInstructions,
        honeypot: meetingForm.honeypot,
      });

      setMeetingFeedback({
        type: 'success',
        message: res.message || 'Reunião agendada com sucesso! Um e-mail com data, horário e link do Google Meet foi enviado.',
        meetingLink: res.meetingLink,
        date: meetingForm.date,
        time: meetingForm.time,
        email: meetingForm.email,
      });

      setMeetingForm({
        name: '',
        email: '',
        phone: '',
        date: '',
        time: '',
        relationship: 'Filho(a)',
        serviceInterest: 'Reunião de Apresentação e Planos',
        message: '',
        honeypot: '',
      });
    } catch (err: any) {
      setMeetingFeedback({
        type: 'error',
        message: err.message || 'Falha ao agendar reunião. Tente novamente ou nos chame no WhatsApp.',
      });
    } finally {
      clearTimeout(watchdogMeeting);
      setSubmittingMeeting(false);
    }
  };

  const renderIcon = (iconName?: string) => {
    const props = { className: 'w-6 h-6 text-[#B8954A]' };
    switch (iconName) {
      case 'Stethoscope':
        return <Stethoscope {...props} />;
      case 'Apple':
        return <Apple {...props} />;
      case 'Activity':
        return <Activity {...props} />;
      case 'Sparkles':
        return <Sparkles {...props} />;
      case 'Home':
        return <Home {...props} />;
      case 'Music':
        return <Music {...props} />;
      case 'ShieldCheck':
        return <ShieldCheck {...props} />;
      case 'HeartPulse':
      default:
        return <HeartPulse {...props} />;
    }
  };

  const filteredServices = services.filter((s) => {
    if (selectedCategory === 'todos') return true;
    return s.category === selectedCategory;
  });

  const heroContent = content['hero'];
  const aboutContent = content['about'];

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-neutral-800">
      {/* ----------------------------------------------------------- */}
      {/* 1. HERO SECTION */}
      {/* ----------------------------------------------------------- */}
      <section id="hero" className="relative pt-12 pb-24 md:pt-20 md:pb-32 overflow-hidden">
        {/* Decorative background aura with brand colors */}
        <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 rounded-full bg-[#E5A2AB]/20 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-0 -ml-40 w-96 h-96 rounded-full bg-[#B8954A]/10 blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column: Editorial Headline & Copy */}
            <div className="lg:col-span-6 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#173D2B]/8 border border-[#173D2B]/15 rounded-full text-[#173D2B] text-xs font-semibold tracking-wide">
                <span className="w-2 h-2 rounded-full bg-[#B8954A] animate-pulse" />
                <span>Residencial Geriátrico</span>
              </div>

              {loadingContent ? (
                <div className="space-y-4 py-2 animate-pulse" aria-busy="true" aria-label="Carregando informações institucionais">
                  <div className="h-10 sm:h-12 w-4/5 bg-[#173D2B]/15 rounded-xl" />
                  <div className="h-10 sm:h-12 w-3/5 bg-[#173D2B]/10 rounded-xl" />
                  <div className="pt-2 space-y-2">
                    <div className="h-4 w-full bg-neutral-300/60 rounded-md" />
                    <div className="h-4 w-5/6 bg-neutral-300/40 rounded-md" />
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-serif font-bold text-[#173D2B] leading-tight tracking-tight">
                    {heroContent?.title?.trim() || 'Victoria Lar Residencial'}
                  </h1>

                  <p className="text-base sm:text-lg text-neutral-600 leading-relaxed max-w-2xl">
                    {heroContent?.subtitle?.trim() ||
                      'No Victoria Lar Residencial, cada detalhe foi concebido para oferecer excelência em saúde, conforto e o calor de uma verdadeira família.'}
                  </p>
                </>
              )}

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <a
                  href="#servicos"
                  className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5 bg-[#173D2B] hover:bg-[#112d20] text-[#FAF9F5] font-semibold text-sm rounded-full shadow-md hover:shadow-lg transition-all hover:scale-[1.02] border border-[#B8954A]/50 cursor-pointer"
                >
                  <span>Conhecer Nossos Cuidados</span>
                  <ArrowRight className="w-4 h-4 text-[#DFC282]" />
                </a>

                <a
                  href="#contato"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-[#E5A2AB] hover:bg-[#DC939D] text-[#173D2B] font-semibold text-sm rounded-full shadow-md hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-[#173D2B]" />
                  <span>Agendar Visita</span>
                </a>
              </div>

              {/* Quick Info Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-6 border-t border-[#173D2B]/10 text-xs">
                <div className="flex items-center gap-2.5 text-neutral-700">
                  <div className="p-2 bg-[#E5A2AB]/30 text-[#173D2B] rounded-lg">
                    <HeartPulse className="w-4 h-4" />
                  </div>
                  
                    <div className="font-bold text-[#173D2B]">Enfermagem Especializada</div>
                    
                </div>

                <div className="flex items-center gap-2.5 text-neutral-700">
                  <div className="p-2 bg-[#B8954A]/20 text-[#B8954A] rounded-lg">
                    <Apple className="w-4 h-4 text-[#B8954A]" />
                  </div>
                  
                    <div className="font-bold text-[#173D2B]">Nutrição</div>
                  
                </div>

                <div className="flex items-center gap-2.5 text-neutral-700 col-span-2 sm:col-span-1">
                  <div className="p-2 bg-[#173D2B]/10 text-[#173D2B] rounded-lg">
                    <Sun className="w-4 h-4" />
                  </div>
                  
                    <div className="font-bold text-[#173D2B]">Áreas Verdes</div>
                  
                </div>
              </div>
            </div>

            {/* Right Column: Visual Showcase Frame (Foto inserida pelo ADM - ampliado em ~3cm / 114px) */}
            <div className="lg:col-span-6 relative">
              <div className="relative mx-auto max-w-[562px] lg:max-w-none">
                {/* Decorative aura glow */}
                <div className="absolute -top-6 -right-6 w-72 h-72 rounded-full bg-[#B8954A]/20 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-6 -left-6 w-72 h-72 rounded-full bg-[#173D2B]/15 blur-3xl pointer-events-none" />

                {/* Main Showcase Card: Foto Inserida pelo ADM */}
                <div className="relative rounded-3xl overflow-hidden shadow-xl border-2 border-[#B8954A]/40 bg-white group">
                  {/* Photo frame container */}
                  <div className="relative w-full h-[390px] sm:h-[460px] lg:h-[480px] overflow-hidden bg-gradient-to-br from-[#173D2B] via-[#123022] to-[#0d2218] flex items-center justify-center">
                    {loadingContent ? (
                      /* Discrete loading state: exact container dimensions preserved, no fake/mock images */
                      <div className="flex flex-col items-center justify-center text-center p-8 space-y-4 animate-pulse">
                        <div className="w-20 h-20 rounded-full bg-white/10 border-2 border-[#B8954A]/40 flex items-center justify-center p-3 shadow-inner">
                          <VictoriaEmblem variant="light" width={56} height={38} />
                        </div>
                        <div className="space-y-2">
                          <div className="h-2.5 w-32 bg-[#B8954A]/40 rounded-full mx-auto" />
                          <div className="h-3.5 w-48 bg-white/20 rounded-md mx-auto" />
                        </div>
                      </div>
                    ) : (() => {
                      const rawHeroUrl = heroContent?.imageUrl?.trim();
                      if (!rawHeroUrl) return null;
                      const parsed = resolvePhotoDisplayUrl(rawHeroUrl);
                      if (!parsed.isValid || heroPhotoError) return null;
                      const activeSrc = heroPhotoUsingFallback && parsed.fallbackUrl ? parsed.fallbackUrl : parsed.displayUrl;
                      return (
                        <img
                          key={activeSrc}
                          src={activeSrc}
                          alt={heroContent?.imageCaption || 'Victoria Lar Residencial - Estrutura e Jardins'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                          loading="eager"
                          fetchPriority="high"
                          decoding="async"
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
                    })() || (
                      /* Approved institutional fallback: dignified brand identity, no mock stock photos */
                      <div className="flex flex-col items-center justify-center text-center p-8 space-y-4 max-w-sm">
                        <div className="w-20 h-20 rounded-full bg-white/10 border-2 border-[#B8954A]/60 flex items-center justify-center p-3 shadow-inner">
                          <VictoriaEmblem variant="light" width={56} height={38} />
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-widest text-[#B8954A] block">
                            Victoria Lar Residencial
                          </span>
                          <h3 className="font-serif font-bold text-xl text-white">
                            Acolhimento & Bem-Estar
                          </h3>
                          <p className="text-xs text-white/75 leading-relaxed">
                            {heroContent?.imageCaption?.trim() ||
                              'Residencial geriátrico planejado para oferecer carinho, assistência integral e dignidade em cada detalhe.'}
                          </p>
                          {heroPhotoError && isAdmin && (
                            <span className="text-[10px] text-amber-300 bg-amber-950/70 px-2.5 py-1 rounded-md inline-flex items-center gap-1 border border-amber-500/40 mt-1">
                              <AlertTriangle className="w-3 h-3 text-amber-300 flex-shrink-0" />
                              Aviso ADM: Foto não carregou (verifique se o link do Drive está público)
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Efeito sutil ensolarado/dourado sem qualquer sombra ou tom acinzentado */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-amber-400/10 via-amber-200/5 to-transparent pointer-events-none mix-blend-screen" />
                    <div className="absolute inset-0 bg-gradient-to-b from-amber-100/10 via-transparent to-transparent pointer-events-none" />

                    {/* Top right luxury brand badge */}
                    <div className="absolute top-4 right-4 z-10 px-3 py-1.5 bg-[#173D2B]/85 backdrop-blur-md rounded-full border border-[#B8954A]/60 flex items-center gap-2 shadow-lg">
                      <span className="w-2 h-2 rounded-full bg-[#B8954A] animate-pulse" />
                      <span className="text-[11px] font-semibold text-[#FAF9F5] tracking-wide">
                        Ambiente Humanizado
                      </span>
                    </div>

                    {/* If Admin is logged in, show quick edit button */}
                    {isAdmin && (
                      <button
                        onClick={onOpenAdminLogin}
                        className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#173D2B]/90 hover:bg-[#173D2B] text-white rounded-full text-xs font-semibold shadow-lg border border-[#B8954A]/80 backdrop-blur-md transition-all hover:scale-105 cursor-pointer"
                        title="Alterar esta foto no Painel ADM"
                      >
                        <Camera className="w-3.5 h-3.5 text-[#B8954A]" />
                        <span>Editar foto no ADM</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Overlapping Warm Accent Tag */}
                <div className="absolute -bottom-5 -left-3 sm:-bottom-6 sm:-left-4 bg-[#FAF9F5] border-2 border-[#173D2B]/15 rounded-2xl p-3.5 sm:p-4 shadow-xl flex items-center gap-3 max-w-xs z-20">
                  <div className="w-10 h-10 rounded-full bg-[#E5A2AB] border border-[#DC939D] flex items-center justify-center text-[#173D2B] flex-shrink-0">
                    <HeartPulse className="w-5 h-5 text-[#173D2B]" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-[#173D2B]">Cuidado Especializado 24h</div>
                    <div className="text-[10px] text-neutral-500">Excelência e carinho em cada detalhe</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- */}
      {/* 2. SOBRE NÓS SECTION */}
      {/* ----------------------------------------------------------- */}
      <section id="sobre" className="py-20 bg-white border-y border-[#173D2B]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#E5A2AB]/25 border border-[#E5A2AB] rounded-full text-[#173D2B] text-xs font-semibold">
                <span>Nossa História e Princípios</span>
              </div>

              {loadingContent ? (
                <div className="space-y-4 py-1 animate-pulse" aria-busy="true">
                  <div className="h-8 sm:h-10 w-3/4 bg-[#173D2B]/15 rounded-xl" />
                  <div className="h-4 w-4/5 bg-neutral-300/50 rounded-md" />
                  <div className="pt-2 space-y-2">
                    <div className="h-3.5 w-full bg-neutral-300/40 rounded-md" />
                    <div className="h-3.5 w-full bg-neutral-300/40 rounded-md" />
                    <div className="h-3.5 w-2/3 bg-neutral-300/40 rounded-md" />
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-[#173D2B]">
                    {aboutContent?.title?.trim() || 'Nossa Vocação é o Cuidado com Amor'}
                  </h2>

                  <p className="text-base text-neutral-600 leading-relaxed">
                    {aboutContent?.subtitle?.trim() ||
                      'Uma história construída sobre respeito à trajetória e à dignidade de cada residente.'}
                  </p>

                  <div className="text-sm text-neutral-700 leading-relaxed space-y-4">
                    <p>
                      {aboutContent?.body?.trim() ||
                        'O Victoria Lar Residencial nasceu do desejo genuíno de redefinir a experiência de moradia para a terceira idade. Mais do que uma estrutura médica de ponta, oferecemos um ecossistema de afeto, acolhimento integral e valorização contínua da individualidade. Nossa arquitetura favorece a iluminação natural, a convivência e a segurança, enquanto nossa equipe multiprofissional atua com empatia e dedicação.'}
                    </p>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4 pt-4 text-xs">
                <div className="bg-[#FAF9F5] p-4 rounded-xl border border-neutral-200">
                  <div className="font-serif font-bold text-[#173D2B] text-lg mb-1">+15 Anos</div>
                  <div className="text-neutral-600">De dedicação e assistência à terceira idade.</div>
                </div>

                <div className="bg-[#FAF9F5] p-4 rounded-xl border border-neutral-200">
                  <div className="font-serif font-bold text-[#173D2B] text-lg mb-1">100% Adaptado</div>
                  <div className="text-neutral-600">Acessibilidade e áreas seguras.</div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="bg-[#FAF9F5] rounded-3xl p-8 border border-[#173D2B]/10 shadow-sm space-y-6">
                <h3 className="font-serif font-bold text-[#173D2B] text-xl">
                  O que torna o Victoria Lar Residencial singular?
                </h3>

                <div className="space-y-4 text-xs">
                  <div className="flex items-start gap-3.5">
                    <div className="p-2 bg-[#173D2B] text-white rounded-lg flex-shrink-0 mt-0.5">
                      <ShieldCheck className="w-4 h-4 text-[#B8954A]" />
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-900 text-sm">Segurança Clínica</h4>
                      <p className="text-neutral-600 mt-0.5">
                        Armazenamento rigoroso de prontuários, seriedade na administração de remédios e suporte de emergência.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="p-2 bg-[#B8954A] text-white rounded-lg flex-shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-900 text-sm">Estímulo Cognitivo e Lazer</h4>
                      <p className="text-neutral-600 mt-0.5">
                        Oficinas semanais de arteterapia, rodas de conversa, jogos de raciocínio e celebrações temáticas.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="p-2 bg-[#E5A2AB] text-[#173D2B] rounded-lg flex-shrink-0 mt-0.5">
                      <HeartPulse className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-900 text-sm">Acolhimento Familiar</h4>
                      <p className="text-neutral-600 mt-0.5">
                        Espaços confortáveis para receber netos, filhos e amigos.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ======================================================= */}
          {/* QUEM ESTÁ POR TRÁS (Dois Proprietários / Painéis Lado a Lado) */}
          {/* ======================================================= */}
          <div className="mt-20 pt-16 border-t border-[#173D2B]/10">
            <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#FAF9F5] border border-[#B8954A]/40 rounded-full text-[#173D2B] text-xs font-semibold shadow-2xs">
                <Users className="w-3.5 h-3.5 text-[#B8954A]" />
                <span className="uppercase tracking-wider font-bold text-[11px] text-[#173D2B]">Quem Está Por Trás</span>
              </div>
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-[#173D2B]">
                Presença Diária, Cuidado Próximo e Acolhimento sem Intermediários
              </h3>
              <p className="text-sm sm:text-base text-neutral-600 leading-relaxed">
                No Victoria Lar Residencial, os proprietários participam ativamente do dia a dia, garantindo atenção pessoal a cada residente e acolhimento contínuo para cada família.
              </p>
            </div>

            {/* Dois painéis lado a lado */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
              {/* PAINEL PROPRIETÁRIO 1 */}
              {(() => {
                const defaults = INITIAL_INSTITUTIONAL_CONTENT['owner_1'];
                const owner = content['owner_1'] || defaults;
                const title = owner?.title?.trim() || defaults?.title || 'Olá, sou a Olga.';
                const name = owner?.imageCaption?.trim() || defaults?.imageCaption || 'Olga';
                const role = owner?.role?.trim() || defaults?.role || 'Sócia-Proprietária & Gestora Humanizada';
                const tag = owner?.tag?.trim() || defaults?.tag || 'Atendimento direto, humano e sem intermediários';
                const imageUrl = owner?.imageUrl?.trim() || '';
                const bodyText = owner?.body?.trim() || defaults?.body || '';
                const quote = owner?.quote?.trim() || defaults?.quote || '';

                const paragraphs = bodyText.split('\n\n').filter(Boolean);
                const firstParagraph = paragraphs[0] || '';
                const otherParagraphs = paragraphs.slice(1);

                return (
                  <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-md hover:shadow-xl transition-all duration-300 p-6 sm:p-8 flex flex-col justify-between relative group text-left">
                    <div>
                      {/* Top Badges / Pills */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-100 border border-neutral-200 rounded-full text-neutral-800 text-[11px] font-bold uppercase tracking-wider">
                          <Users className="w-3.5 h-3.5 text-[#B8954A]" />
                          <span>QUEM ESTÁ POR TRÁS</span>
                        </div>

                        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-[#FAF9F5] border border-neutral-200 rounded-full text-neutral-600 text-[11px] font-medium">
                          <Heart className="w-3.5 h-3.5 text-[#E5A2AB]" />
                          <span>{tag}</span>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="w-full h-px bg-neutral-100 my-5" />

                      {/* Top Split: Photo + Greeting/Intro */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
                        {/* Portrait Photo with Overlay */}
                        <div className="sm:col-span-5 relative w-full aspect-square sm:aspect-[4/5] rounded-2xl overflow-hidden shadow-sm border border-neutral-200 bg-gradient-to-b from-[#173D2B] to-[#123022] flex items-center justify-center">
                          {loadingContent ? (
                            <div className="flex flex-col items-center justify-center p-4 text-center space-y-2.5 z-10 animate-pulse">
                              <div className="w-14 h-14 rounded-full bg-white/10 border border-[#B8954A]/30 flex items-center justify-center text-[#DFC282]">
                                <VictoriaEmblem variant="light" width={38} height={26} />
                              </div>
                              <div className="h-2.5 w-16 bg-white/20 rounded-md" />
                              <div className="h-2 w-24 bg-[#DFC282]/30 rounded-md" />
                            </div>
                          ) : (() => {
                            if (!imageUrl) return null;
                            const parsed = resolvePhotoDisplayUrl(imageUrl);
                            if (!parsed.isValid || ownerPhotoError['owner_1']) return null;
                            const isUsingFallback = ownerPhotoUsingFallback['owner_1'];
                            const activeSrc = isUsingFallback && parsed.fallbackUrl ? parsed.fallbackUrl : parsed.displayUrl;
                            return (
                              <img
                                key={activeSrc}
                                src={activeSrc}
                                alt={name}
                                className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onError={() => {
                                  if (parsed.fallbackUrl && !isUsingFallback) {
                                    setOwnerPhotoUsingFallback((prev) => ({ ...prev, owner_1: true }));
                                  } else {
                                    setOwnerPhotoError((prev) => ({ ...prev, owner_1: true }));
                                  }
                                }}
                                onLoad={() => {
                                  setOwnerPhotoError((prev) => ({ ...prev, owner_1: false }));
                                }}
                              />
                            );
                          })() || (
                            <div className="flex flex-col items-center justify-center p-4 text-center space-y-2 z-10">
                              <div className="w-16 h-16 rounded-full bg-white/10 border border-[#B8954A]/50 flex items-center justify-center text-[#DFC282]">
                                <VictoriaEmblem variant="light" width={42} height={30} />
                              </div>
                              <span className="text-xs font-serif font-bold text-white block">{name}</span>
                              <span className="text-[10px] text-[#DFC282] block">{role}</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
                          <div className="absolute bottom-3 left-3 right-3 text-left z-10">
                            <div className="font-serif font-bold text-white text-base sm:text-lg leading-tight drop-shadow-md">
                              {loadingContent ? <div className="h-4 w-20 bg-white/30 rounded-md animate-pulse" /> : name}
                            </div>
                            <div className="text-[11px] font-medium text-[#DFC282] leading-tight mt-0.5 drop-shadow-xs">
                              {loadingContent ? <div className="h-3 w-28 bg-[#DFC282]/40 rounded-md mt-1 animate-pulse" /> : role}
                            </div>
                          </div>
                        </div>

                        {/* Title & First Paragraph */}
                        {loadingContent ? (
                          <div className="sm:col-span-7 space-y-3 animate-pulse" aria-busy="true">
                            <div className="h-6 w-3/4 bg-neutral-200 rounded-md" />
                            <div className="space-y-2 pt-1">
                              <div className="h-3.5 w-full bg-neutral-200/80 rounded-md" />
                              <div className="h-3.5 w-full bg-neutral-200/80 rounded-md" />
                              <div className="h-3.5 w-4/5 bg-neutral-200/70 rounded-md" />
                            </div>
                          </div>
                        ) : (
                          <div className="sm:col-span-7 space-y-3">
                            <h4 className="text-xl sm:text-2xl font-serif font-bold text-neutral-900 leading-snug">
                              {title}
                            </h4>
                            <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed whitespace-pre-line">
                              {firstParagraph}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Other Paragraphs */}
                      {loadingContent ? null : otherParagraphs.length > 0 && (
                        <div className="space-y-3 mt-4 text-xs sm:text-sm text-neutral-700 leading-relaxed">
                          {otherParagraphs.map((para, idx) => (
                            <p key={idx} className="whitespace-pre-line">
                              {para}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom Highlight Callout Box with Gold Accent */}
                    {quote && (
                      <div className="mt-6 bg-[#FAF9F5] border-l-4 border-[#B8954A] rounded-r-2xl p-4 sm:p-5 text-xs sm:text-sm text-neutral-800 leading-relaxed shadow-2xs">
                        <p className="italic">{quote}</p>
                      </div>
                    )}

                    {/* Admin Quick Edit Button */}
                    {isAdmin && (
                      <button
                        onClick={onOpenAdminLogin}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 px-3 py-1 bg-[#173D2B] text-white rounded-full text-[10px] font-semibold border border-[#B8954A] shadow-md hover:bg-[#123022] cursor-pointer"
                        title="Editar dados deste proprietário no Painel ADM"
                      >
                        <Edit2 className="w-3 h-3 text-[#B8954A]" />
                        <span>Editar no ADM</span>
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* PAINEL PROPRIETÁRIO 2 */}
              {(() => {
                const defaults = INITIAL_INSTITUTIONAL_CONTENT['owner_2'];
                const owner = content['owner_2'] || defaults;
                const title = owner?.title?.trim() || defaults?.title || 'Olá, sou o Robson.';
                const name = owner?.imageCaption?.trim() || defaults?.imageCaption || 'Robson';
                const role = owner?.role?.trim() || defaults?.role || 'Sócio-Proprietário & Diretor de Cuidados';
                const tag = owner?.tag?.trim() || defaults?.tag || 'Presença diária e compromisso com a excelência';
                const imageUrl = owner?.imageUrl?.trim() || '';
                const bodyText = owner?.body?.trim() || defaults?.body || '';
                const quote = owner?.quote?.trim() || defaults?.quote || '';

                const paragraphs = bodyText.split('\n\n').filter(Boolean);
                const firstParagraph = paragraphs[0] || '';
                const otherParagraphs = paragraphs.slice(1);

                return (
                  <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-md hover:shadow-xl transition-all duration-300 p-6 sm:p-8 flex flex-col justify-between relative group text-left">
                    <div>
                      {/* Top Badges / Pills */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-100 border border-neutral-200 rounded-full text-neutral-800 text-[11px] font-bold uppercase tracking-wider">
                          <Users className="w-3.5 h-3.5 text-[#B8954A]" />
                          <span>QUEM ESTÁ POR TRÁS</span>
                        </div>

                        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-[#FAF9F5] border border-neutral-200 rounded-full text-neutral-600 text-[11px] font-medium">
                          <Heart className="w-3.5 h-3.5 text-[#E5A2AB]" />
                          <span>{tag}</span>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="w-full h-px bg-neutral-100 my-5" />

                      {/* Top Split: Photo + Greeting/Intro */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
                        {/* Portrait Photo with Overlay */}
                        <div className="sm:col-span-5 relative w-full aspect-square sm:aspect-[4/5] rounded-2xl overflow-hidden shadow-sm border border-neutral-200 bg-gradient-to-b from-[#173D2B] to-[#123022] flex items-center justify-center">
                          {loadingContent ? (
                            <div className="flex flex-col items-center justify-center p-4 text-center space-y-2.5 z-10 animate-pulse">
                              <div className="w-14 h-14 rounded-full bg-white/10 border border-[#B8954A]/30 flex items-center justify-center text-[#DFC282]">
                                <VictoriaEmblem variant="light" width={38} height={26} />
                              </div>
                              <div className="h-2.5 w-16 bg-white/20 rounded-md" />
                              <div className="h-2 w-24 bg-[#DFC282]/30 rounded-md" />
                            </div>
                          ) : (() => {
                            if (!imageUrl) return null;
                            const parsed = resolvePhotoDisplayUrl(imageUrl);
                            if (!parsed.isValid || ownerPhotoError['owner_2']) return null;
                            const isUsingFallback = ownerPhotoUsingFallback['owner_2'];
                            const activeSrc = isUsingFallback && parsed.fallbackUrl ? parsed.fallbackUrl : parsed.displayUrl;
                            return (
                              <img
                                key={activeSrc}
                                src={activeSrc}
                                alt={name}
                                className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onError={() => {
                                  if (parsed.fallbackUrl && !isUsingFallback) {
                                    setOwnerPhotoUsingFallback((prev) => ({ ...prev, owner_2: true }));
                                  } else {
                                    setOwnerPhotoError((prev) => ({ ...prev, owner_2: true }));
                                  }
                                }}
                                onLoad={() => {
                                  setOwnerPhotoError((prev) => ({ ...prev, owner_2: false }));
                                }}
                              />
                            );
                          })() || (
                            <div className="flex flex-col items-center justify-center p-4 text-center space-y-2 z-10">
                              <div className="w-16 h-16 rounded-full bg-white/10 border border-[#B8954A]/50 flex items-center justify-center text-[#DFC282]">
                                <VictoriaEmblem variant="light" width={42} height={30} />
                              </div>
                              <span className="text-xs font-serif font-bold text-white block">{name}</span>
                              <span className="text-[10px] text-[#DFC282] block">{role}</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
                          <div className="absolute bottom-3 left-3 right-3 text-left z-10">
                            <div className="font-serif font-bold text-white text-base sm:text-lg leading-tight drop-shadow-md">
                              {loadingContent ? <div className="h-4 w-20 bg-white/30 rounded-md animate-pulse" /> : name}
                            </div>
                            <div className="text-[11px] font-medium text-[#DFC282] leading-tight mt-0.5 drop-shadow-xs">
                              {loadingContent ? <div className="h-3 w-28 bg-[#DFC282]/40 rounded-md mt-1 animate-pulse" /> : role}
                            </div>
                          </div>
                        </div>

                        {/* Title & First Paragraph */}
                        {loadingContent ? (
                          <div className="sm:col-span-7 space-y-3 animate-pulse" aria-busy="true">
                            <div className="h-6 w-3/4 bg-neutral-200 rounded-md" />
                            <div className="space-y-2 pt-1">
                              <div className="h-3.5 w-full bg-neutral-200/80 rounded-md" />
                              <div className="h-3.5 w-full bg-neutral-200/80 rounded-md" />
                              <div className="h-3.5 w-4/5 bg-neutral-200/70 rounded-md" />
                            </div>
                          </div>
                        ) : (
                          <div className="sm:col-span-7 space-y-3">
                            <h4 className="text-xl sm:text-2xl font-serif font-bold text-neutral-900 leading-snug">
                              {title}
                            </h4>
                            <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed whitespace-pre-line">
                              {firstParagraph}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Other Paragraphs */}
                      {loadingContent ? null : otherParagraphs.length > 0 && (
                        <div className="space-y-3 mt-4 text-xs sm:text-sm text-neutral-700 leading-relaxed">
                          {otherParagraphs.map((para, idx) => (
                            <p key={idx} className="whitespace-pre-line">
                              {para}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom Highlight Callout Box with Gold Accent */}
                    {quote && (
                      <div className="mt-6 bg-[#FAF9F5] border-l-4 border-[#B8954A] rounded-r-2xl p-4 sm:p-5 text-xs sm:text-sm text-neutral-800 leading-relaxed shadow-2xs">
                        <p className="italic">{quote}</p>
                      </div>
                    )}

                    {/* Admin Quick Edit Button */}
                    {isAdmin && (
                      <button
                        onClick={onOpenAdminLogin}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 px-3 py-1 bg-[#173D2B] text-white rounded-full text-[10px] font-semibold border border-[#B8954A] shadow-md hover:bg-[#123022] cursor-pointer"
                        title="Editar dados deste proprietário no Painel ADM"
                      >
                        <Edit2 className="w-3 h-3 text-[#B8954A]" />
                        <span>Editar no ADM</span>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- */}
      {/* 3. NOSSOS SERVIÇOS (Dinamismo com Firestore) */}
      {/* ----------------------------------------------------------- */}
      <section id="servicos" className="py-24 bg-[#FAF9F5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#173D2B]/8 border border-[#173D2B]/15 rounded-full text-[#173D2B] text-xs font-semibold">
              <HeartPulse className="w-3.5 h-3.5 text-[#B8954A]" />
              <span>Cuidado Integral & Multidisciplinar</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-[#173D2B]">
              Nossos Serviços Especializados
            </h2>

            <p className="text-sm sm:text-base text-neutral-600 leading-relaxed">
              Planos de assistência desenhados para promover bem-estar físico, psicológico e social com acompanhamento humanizado 24 horas por dia.
            </p>

            {/* Category Filter Pills (Shown only when services are registered by ADM) */}
            {services.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
                {[
                  { id: 'todos', label: 'Todos os Cuidados' },
                  { id: 'saude', label: 'Saúde & Enfermagem' },
                  { id: 'hotelaria', label: 'Hotelaria & Nutrição' },
                  { id: 'lazer', label: 'Estímulo & Convivência' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-[#173D2B] text-[#FAF9F5] shadow-xs border border-[#B8954A]/50'
                        : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Services Content: Only ADM-inserted services are rendered */}
          {loadingServices ? (
            <div className="py-16 text-center text-xs text-neutral-500 animate-pulse">
              Carregando serviços atualizados do Victoria Lar...
            </div>
          ) : services.length === 0 ? (
            /* When no services have been inserted/published yet by ADM */
            <div className="bg-white rounded-3xl p-8 sm:p-12 border border-[#173D2B]/15 shadow-sm text-center max-w-2xl mx-auto space-y-6">
              <div className="w-16 h-16 rounded-full bg-[#173D2B]/10 border border-[#B8954A]/50 flex items-center justify-center mx-auto text-[#173D2B] shadow-inner">
                <VictoriaEmblem variant="color" width={42} height={30} />
              </div>

              <div className="space-y-3">
                <h3 className="font-serif font-bold text-2xl text-[#173D2B]">
                  Planos Assistenciais & Cuidados Personalizados
                </h3>
                <p className="text-sm text-neutral-600 leading-relaxed max-w-lg mx-auto">
                  No Victoria Lar Residencial, os serviços e planos de cuidados são estruturados sob medida para atender com carinho, técnica e excelência às necessidades singulares de cada residente.
                </p>
                <p className="text-xs text-neutral-500 max-w-md mx-auto">
                  Nossa equipe multidisciplinar e a direção participam ativamente do dia a dia, garantindo atenção pessoal e acolhimento contínuo para cada família.
                </p>
              </div>

              {/* If logged-in user is an administrator, show direct shortcut to insert services */}
              {isAdmin && (
                <div className="mt-6 pt-5 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-center gap-2.5 text-xs">
                  <span className="text-[11px] text-[#B8954A] font-bold uppercase tracking-wider">
                    Atalho ADM:
                  </span>
                  <span className="text-neutral-500 text-[11px]">
                    Nenhum serviço cadastrado na base ainda.
                  </span>
                  <button
                    onClick={onOpenAdminLogin}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#173D2B] hover:bg-[#123022] text-white text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#B8954A]" />
                    <span>Cadastrar Serviços no Painel ADM</span>
                  </button>
                </div>
              )}
            </div>
          ) : filteredServices.length === 0 ? (
            /* When category filter has 0 matches */
            <div className="bg-white rounded-2xl p-8 border border-neutral-200 text-center max-w-md mx-auto space-y-3">
              <p className="text-xs text-neutral-600">
                Nenhum serviço publicado nesta categoria no momento.
              </p>
              <button
                onClick={() => setSelectedCategory('todos')}
                className="px-4 py-2 bg-[#173D2B] text-white text-xs font-semibold rounded-lg hover:bg-[#123022] cursor-pointer transition-all"
              >
                Exibir Todos os Cuidados
              </button>
            </div>
          ) : (
            /* Grid with services registered by the ADM */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredServices.map((service) => (
                <div
                  key={service.id}
                  className="bg-white rounded-2xl p-6 border border-neutral-200 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between group hover:border-[#B8954A]/40"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="p-3 bg-[#FAF9F5] border border-neutral-200 rounded-xl group-hover:bg-[#E5A2AB]/20 transition-colors">
                        {renderIcon(service.icon)}
                      </div>

                      {service.highlight && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#173D2B] bg-[#E5A2AB] px-2.5 py-0.5 rounded-full border border-[#DC939D]">
                          Destaque
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="font-serif font-bold text-neutral-900 text-lg group-hover:text-[#173D2B] transition-colors">
                        {service.title}
                      </h3>
                      <p className="text-xs text-neutral-600 mt-2 leading-relaxed">
                        {service.summary}
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 mt-4 border-t border-neutral-100 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-neutral-400 capitalize">
                      {service.category || 'Assistencial'}
                    </span>

                    <button
                      onClick={() => setActiveServiceModal(service)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#173D2B] group-hover:text-[#B8954A] transition-colors cursor-pointer"
                    >
                      <span>Ver Detalhes</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Service Detail Modal */}
      {/* {activeServiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#FAF9F5] border border-[#173D2B]/20 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in">
            <div className="bg-[#173D2B] p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  {renderIcon(activeServiceModal.icon)}
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg">{activeServiceModal.title}</h3>
                  <span className="text-[11px] text-[#B8954A] font-semibold uppercase tracking-wider">
                    {activeServiceModal.category}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveServiceModal(null)}
                className="text-white/70 hover:text-white p-1 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-neutral-700 leading-relaxed">
              <div className="bg-white p-4 rounded-xl border border-neutral-200">
                <h4 className="font-semibold text-neutral-900 mb-1">Resumo Executivo:</h4>
                <p>{activeServiceModal.summary}</p>
              </div>

              {activeServiceModal.description && (
                <div>
                  <h4 className="font-semibold text-neutral-900 mb-1">Como Funciona o Cuidado:</h4>
                  <p className="whitespace-pre-line text-neutral-600">{activeServiceModal.description}</p>
                </div>
              )}

              <div className="pt-4 border-t border-neutral-200 flex justify-end gap-3">
                <button
                  onClick={() => setActiveServiceModal(null)}
                  className="px-5 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-100 cursor-pointer text-xs font-semibold"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )} */}

      {/* ----------------------------------------------------------- */}
      {/* 4. ESTRUTURA E DIFERENCIAIS */}
      {/* ----------------------------------------------------------- */}
      <section id="diferenciais" className="py-20 bg-white border-y border-[#173D2B]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-14">
            <span className="text-xs uppercase font-bold tracking-widest text-[#B8954A]">
              Ambiente Seguro e Inspirador
            </span>
            <h2 className="text-3xl font-serif font-bold text-[#173D2B]">
              Estrutura Projetada para o Bem-Estar
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600">
              Cada espaço foi pensado para oferecer autonomia, acessibilidade integral e conforto térmico e acústico.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-xs">
            {/* Card 1: Quartos seguros */}
            <button
              type="button"
              onClick={() => setActiveStructureTopic('quartos-seguros')}
              className="bg-[#FAF9F5] p-5 rounded-2xl border border-neutral-200 hover:border-[#B8954A] shadow-xs hover:shadow-lg transition-all duration-300 text-left cursor-pointer group hover:-translate-y-1 focus:outline-hidden focus:ring-2 focus:ring-[#B8954A] focus:ring-offset-2 flex flex-col justify-between"
              aria-haspopup="dialog"
              aria-label="Abrir galeria de fotos: Quartos seguros"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#173D2B] text-white flex items-center justify-center group-hover:bg-[#B8954A] transition-colors">
                    <Home className="w-5 h-5 text-[#B8954A] group-hover:text-[#173D2B] transition-colors" />
                  </div>
                  <span className="text-[10px] font-semibold text-[#173D2B] bg-[#E5A2AB]/25 px-2 py-0.5 rounded-full border border-[#E5A2AB]/40 group-hover:bg-[#E5A2AB]/60 transition-colors">
                    Ver Fotos
                  </span>
                </div>
                <h3 className="font-serif font-bold text-neutral-900 text-sm group-hover:text-[#173D2B] transition-colors">
                  Quartos seguros
                </h3>
                <p className="text-neutral-600 leading-relaxed">
                  Quartos adaptados conforme necessidade do paciente.
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-neutral-200/70 flex items-center justify-between text-[#173D2B] group-hover:text-[#B8954A] font-semibold text-[11px] transition-colors">
                <span className="inline-flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Álbum de fotos</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Card 2: Jardins & Área Verde */}
            <button
              type="button"
              onClick={() => setActiveStructureTopic('jardins-area-verde')}
              className="bg-[#FAF9F5] p-5 rounded-2xl border border-neutral-200 hover:border-[#B8954A] shadow-xs hover:shadow-lg transition-all duration-300 text-left cursor-pointer group hover:-translate-y-1 focus:outline-hidden focus:ring-2 focus:ring-[#B8954A] focus:ring-offset-2 flex flex-col justify-between"
              aria-haspopup="dialog"
              aria-label="Abrir galeria de fotos: Jardins & Área Verde"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#173D2B] text-white flex items-center justify-center group-hover:bg-[#B8954A] transition-colors">
                    <Sun className="w-5 h-5 text-[#B8954A] group-hover:text-[#173D2B] transition-colors" />
                  </div>
                  <span className="text-[10px] font-semibold text-[#173D2B] bg-[#E5A2AB]/25 px-2 py-0.5 rounded-full border border-[#E5A2AB]/40 group-hover:bg-[#E5A2AB]/60 transition-colors">
                    Ver Fotos
                  </span>
                </div>
                <h3 className="font-serif font-bold text-neutral-900 text-sm group-hover:text-[#173D2B] transition-colors">
                  Jardins & Area Verde
                </h3>
                <p className="text-neutral-600 leading-relaxed">
                  Área externa segura e convivência ao ar livre.
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-neutral-200/70 flex items-center justify-between text-[#173D2B] group-hover:text-[#B8954A] font-semibold text-[11px] transition-colors">
                <span className="inline-flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Álbum de fotos</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Card 3: Monitoramento 24h */}
            <button
              type="button"
              onClick={() => setActiveStructureTopic('monitoramento-24h')}
              className="bg-[#FAF9F5] p-5 rounded-2xl border border-neutral-200 hover:border-[#B8954A] shadow-xs hover:shadow-lg transition-all duration-300 text-left cursor-pointer group hover:-translate-y-1 focus:outline-hidden focus:ring-2 focus:ring-[#B8954A] focus:ring-offset-2 flex flex-col justify-between"
              aria-haspopup="dialog"
              aria-label="Abrir galeria de fotos: Monitoramento 24h"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#173D2B] text-white flex items-center justify-center group-hover:bg-[#B8954A] transition-colors">
                    <Shield className="w-5 h-5 text-[#B8954A] group-hover:text-[#173D2B] transition-colors" />
                  </div>
                  <span className="text-[10px] font-semibold text-[#173D2B] bg-[#E5A2AB]/25 px-2 py-0.5 rounded-full border border-[#E5A2AB]/40 group-hover:bg-[#E5A2AB]/60 transition-colors">
                    Ver Fotos
                  </span>
                </div>
                <h3 className="font-serif font-bold text-neutral-900 text-sm group-hover:text-[#173D2B] transition-colors">
                  Monitoramento 24h
                </h3>
                <p className="text-neutral-600 leading-relaxed">
                  Circuito interno de câmeras em áreas comuns e controle rigoroso para tranquilidade de todos.
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-neutral-200/70 flex items-center justify-between text-[#173D2B] group-hover:text-[#B8954A] font-semibold text-[11px] transition-colors">
                <span className="inline-flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Álbum de fotos</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Card 4: Salas de Atividades */}
            <button
              type="button"
              onClick={() => setActiveStructureTopic('salas-atividades')}
              className="bg-[#FAF9F5] p-5 rounded-2xl border border-neutral-200 hover:border-[#B8954A] shadow-xs hover:shadow-lg transition-all duration-300 text-left cursor-pointer group hover:-translate-y-1 focus:outline-hidden focus:ring-2 focus:ring-[#B8954A] focus:ring-offset-2 flex flex-col justify-between"
              aria-haspopup="dialog"
              aria-label="Abrir galeria de fotos: Salas de Atividades"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#173D2B] text-white flex items-center justify-center group-hover:bg-[#B8954A] transition-colors">
                    <Users className="w-5 h-5 text-[#B8954A] group-hover:text-[#173D2B] transition-colors" />
                  </div>
                  <span className="text-[10px] font-semibold text-[#173D2B] bg-[#E5A2AB]/25 px-2 py-0.5 rounded-full border border-[#E5A2AB]/40 group-hover:bg-[#E5A2AB]/60 transition-colors">
                    Ver Fotos
                  </span>
                </div>
                <h3 className="font-serif font-bold text-neutral-900 text-sm group-hover:text-[#173D2B] transition-colors">
                  Salas de Atividades
                </h3>
                <p className="text-neutral-600 leading-relaxed">
                  Ambientes multifuncionais convivência, música, jogos cognitivos e cinema.
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-neutral-200/70 flex items-center justify-between text-[#173D2B] group-hover:text-[#B8954A] font-semibold text-[11px] transition-colors">
                <span className="inline-flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Álbum de fotos</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- */}
      {/* 5. AGENDAMENTO & 3 OPÇÕES DE CONTATO (Estilo Beeginning 4 You) */}
      {/* ----------------------------------------------------------- */}
      {(() => {
        const schedulingDefaults = INITIAL_INSTITUTIONAL_CONTENT['scheduling'];
        const schedulingConfig = content['scheduling'] || schedulingDefaults;
        const owner1 = content['owner_1'] || INITIAL_INSTITUTIONAL_CONTENT['owner_1'];
        const owner2 = content['owner_2'] || INITIAL_INSTITUTIONAL_CONTENT['owner_2'];

        const rawHours = schedulingConfig?.availableHours || '09:00, 10:00, 11:00, 14:00, 15:00, 16:00, 17:00';
        const availableSlots = rawHours
          .split(',')
          .map((h: string) => h.trim())
          .filter(Boolean);

        const todayStr = new Date().toISOString().split('T')[0];

        const formatDateBR = (d: string) => {
          if (!d) return '';
          if (d.includes('-')) {
            const [y, m, day] = d.split('-');
            return `${day}/${m}/${y}`;
          }
          return d;
        };

        const rawWhatsapp = schedulingConfig?.whatsapp || heroContent?.whatsapp || '11987654321';
        const cleanWhatsapp = rawWhatsapp.replace(/\D/g, '');
        const defaultWhatsappMsg =
          schedulingConfig?.whatsappMessage ||
          'Olá! Gostaria de conversar com os diretores e saber mais sobre os cuidados e acomodações do Victoria Lar Residencial.';
        const activeWhatsappMsg = customWhatsappMsg || defaultWhatsappMsg;

        return (
          <section id="contato" className="py-24 bg-[#FAF9F5] border-t border-[#173D2B]/10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Section Header */}
              <div className="text-center max-w-3xl mx-auto space-y-4 mb-14 relative">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#173D2B]/8 border border-[#173D2B]/15 rounded-full text-[#173D2B] text-xs font-semibold">
                  <Calendar className="w-3.5 h-3.5 text-[#B8954A]" />
                  <span>Canais de Atendimento & Agendamentos</span>
                </div>

                <h2 className="text-3xl sm:text-4xl font-serif font-bold text-[#173D2B]">
                  {schedulingConfig?.title || 'Como você prefere conversar?'}
                </h2>

                <p className="text-sm sm:text-base text-neutral-600 leading-relaxed">
                  {schedulingConfig?.subtitle ||
                    'Escolha o canal mais prático para você. Atendimento direto com os sócios-proprietários e equipe clínica, com total transparência e acolhimento humano.'}
                </p>

                {/* Admin Quick Edit Button */}
                {isAdmin && (
                  <div className="pt-2">
                    <button
                      onClick={onOpenAdminLogin}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#173D2B] text-white rounded-full text-[11px] font-semibold border border-[#B8954A] shadow-xs hover:bg-[#123022] cursor-pointer"
                      title="Editar configurações de agendamento no Painel ADM"
                    >
                      <Edit2 className="w-3 h-3 text-[#B8954A]" />
                      <span>Editar Agendamento no Painel ADM</span>
                    </button>
                  </div>
                )}
              </div>

              {/* ========================================================= */}
              {/* 3 Canais de Contato & Agendamento (Modelo Beeginning 4 You) */}
              {/* ========================================================= */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1ª FORMA DE CONTATO: REUNIÃO VIA MEET */}
                <button
                  type="button"
                  onClick={() => setIsMeetingModalOpen(true)}
                  className="group relative p-7 rounded-3xl border border-neutral-200/90 bg-white hover:border-[#B8954A] shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between text-left hover:scale-[1.01]"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-13 h-13 rounded-2xl bg-purple-50 text-purple-700 group-hover:bg-[#173D2B] group-hover:text-[#DFC282] flex items-center justify-center transition-colors">
                        <Video className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-purple-100 text-purple-800 group-hover:bg-[#FAF9F5] group-hover:text-[#173D2B] border border-purple-200 transition-colors">
                        Google Meet
                      </span>
                    </div>

                    <div>
                      <h3 className="font-serif font-bold text-xl text-[#173D2B] group-hover:text-[#B8954A] transition-colors">
                        Reunião via Meet
                      </h3>
                      <p className="text-xs text-neutral-600 mt-2 leading-relaxed">
                        Agende uma conversa por vídeo com a gente. Escolha o melhor dia e horário na nossa grade interativa e receba a confirmação com o link da sala no seu e-mail.
                      </p>
                    </div>

                    <div className="pt-2 flex items-center gap-2 text-xs text-neutral-500">
                      <Clock className="w-3.5 h-3.5 text-[#B8954A]" />
                      <span>Sessão reservada de 30 a 45 min</span>
                    </div>
                  </div>

                  <div className="pt-5 mt-4 border-t border-neutral-100 flex items-center justify-between text-xs font-bold text-[#173D2B] group-hover:text-[#B8954A] transition-colors">
                    <span>Agendar Reunião via Meet</span>
                    <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* 2ª FORMA DE CONTATO: FORMULÁRIO DE CONTATO */}
                <button
                  type="button"
                  onClick={() => setIsLeadModalOpen(true)}
                  className="group relative p-7 rounded-3xl border border-neutral-200/90 bg-white hover:border-[#B8954A] shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between text-left hover:scale-[1.01]"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-13 h-13 rounded-2xl bg-[#173D2B]/10 text-[#173D2B] group-hover:bg-[#173D2B] group-hover:text-[#DFC282] flex items-center justify-center transition-colors">
                        <FileText className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200 transition-colors">
                        Mensagem Detalhada
                      </span>
                    </div>

                    <div>
                      <h3 className="font-serif font-bold text-xl text-[#173D2B] group-hover:text-[#B8954A] transition-colors">
                        Formulário de Contato
                      </h3>
                      <p className="text-xs text-neutral-600 mt-2 leading-relaxed">
                        Envie suas dúvidas específicas e histórico do familiar para receber retorno completo e personalizado por telefone ou e-mail com total sigilo clínico.
                      </p>
                    </div>

                    <div className="pt-2 flex items-center gap-2 text-xs text-neutral-500">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#B8954A]" />
                      <span>Retorno no mesmo dia com prioridade</span>
                    </div>
                  </div>

                  <div className="pt-5 mt-4 border-t border-neutral-100 flex items-center justify-between text-xs font-bold text-[#173D2B] group-hover:text-[#B8954A] transition-colors">
                    <span>Preencher Formulário</span>
                    <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* 3ª FORMA DE CONTATO: WHATSAPP DIRETO */}
                <a
                  href={`https://wa.me/55${cleanWhatsapp}?text=${encodeURIComponent(activeWhatsappMsg)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative p-7 rounded-3xl border border-neutral-200/90 bg-white hover:border-emerald-500 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between text-left hover:scale-[1.01]"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-13 h-13 rounded-2xl bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center transition-colors">
                        <MessageCircle className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5 transition-colors">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Online Agora
                      </span>
                    </div>

                    <div>
                      <h3 className="font-serif font-bold text-xl text-[#173D2B] group-hover:text-emerald-700 transition-colors">
                        WhatsApp Direto
                      </h3>
                      <p className="text-xs text-neutral-600 mt-2 leading-relaxed">
                        Converse em tempo real diretamente com os sócios-proprietários. Sem robôs, menus eletrônicos ou filas de espera.
                      </p>
                    </div>

                    <div className="pt-2 flex items-center gap-2 text-xs text-neutral-500">
                      <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{schedulingConfig?.whatsapp || heroContent?.whatsapp || '(11) 98765-4321'}</span>
                    </div>
                  </div>

                  <div className="pt-5 mt-4 border-t border-neutral-100 flex items-center justify-between text-xs font-bold text-emerald-700 group-hover:text-emerald-800 transition-colors">
                    <span>Conversar no WhatsApp</span>
                    <ExternalLink className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </a>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ----------------------------------------------------------- */}
      {/* 6. FOOTER */}
      {/* ----------------------------------------------------------- */}
      <footer className="bg-[#173D2B] text-white border-t-2 border-[#B8954A] pt-14 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-12 border-b border-white/10 text-xs">
            {/* Brand column */}
            <div className="md:col-span-2 space-y-4">
              <VictoriaLogo variant="light" size="md" layout="horizontal" />
              <p className="text-white/70 max-w-sm leading-relaxed">
                Residencial para a terceira idade dedicado a oferecer saúde integrada, conforto de alto padrão e acolhimento humano com dignidade e carinho.
              </p>
              <div className="inline-flex items-center gap-2 text-[11px] text-[#B8954A] bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5 text-[#B8954A]" />
                <span>Cuidado Humanizado & Assistência Multidisciplinar</span>
              </div>
            </div>

            {/* Quick links */}
            <div className="space-y-3">
              <h4 className="font-serif font-bold text-sm text-[#B8954A] uppercase tracking-wider">
                Navegação
              </h4>
              <ul className="space-y-2 text-white/80">
                <li>
                  <a href="#hero" className="hover:text-[#B8954A] transition-colors">
                    Início
                  </a>
                </li>
                <li>
                  <a href="#sobre" className="hover:text-[#B8954A] transition-colors">
                    Sobre Nós
                  </a>
                </li>
                <li>
                  <a href="#servicos" className="hover:text-[#B8954A] transition-colors">
                    Nossos Serviços
                  </a>
                </li>
                <li>
                  <a href="#diferenciais" className="hover:text-[#B8954A] transition-colors">
                    Estrutura & Cuidado
                  </a>
                </li>
                <li>
                  <a href="#contato" className="hover:text-[#B8954A] transition-colors">
                    Agende uma Visita
                  </a>
                </li>
              </ul>
            </div>

            {/* Contact & Hours */}
            <div className="space-y-3">
              <h4 className="font-serif font-bold text-sm text-[#B8954A] uppercase tracking-wider">
                Atendimento
              </h4>
              <div className="space-y-2 text-white/80">
                <p>
                  <strong className="text-white block font-medium">Horário de Visitas:</strong>
                  {heroContent?.visitingHours || 'Segunda a Domingo: 09h00 às 18h00'}
                </p>
                <p>
                  <strong className="text-white block font-medium">Telefone & WhatsApp:</strong>
                  {heroContent?.phone || '(11) 3456-7890'} / {heroContent?.whatsapp || '(11) 98765-4321'}
                </p>
                <p>
                  <strong className="text-white block font-medium">Localização:</strong>
                  {heroContent?.address || 'Alameda das Rosas, 450 - SP'}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-white/60 gap-4">
            <div>
              <button
                type="button"
                onClick={onOpenAdminLogin}
                className="hover:text-[#B8954A] cursor-pointer transition-colors inline-block select-none font-sans font-semibold px-0.5"
                title="Acesso Administrativo (Atalho: Ctrl+Shift+A ou clique no ©)"
                aria-label="Acesso Administrativo (Atalho: Ctrl+Shift+A ou clique no ©)"
              >
                ©
              </button>{' '}
              {new Date().getFullYear()} Victoria Lar Residencial. Todos os direitos reservados.
            </div>
            <div className="flex items-center gap-4">
              <span>Acolhimento, dignidade e respeito em cada detalhe.</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Dedicated Structure Gallery Modal */}
      <StructureGalleryModal
        isOpen={Boolean(activeStructureTopic)}
        topicId={activeStructureTopic}
        onClose={() => setActiveStructureTopic(null)}
      />

      {/* Dedicated Meeting Schedule Modal (Modelo Beeginning4you) */}
      <MeetingScheduleModal
        isOpen={isMeetingModalOpen}
        onClose={() => setIsMeetingModalOpen(false)}
        institutionalContent={content}
      />

      <ContactLeadModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        initialServiceInterest={leadModalService}
        institutionalContent={content}
        availableServices={services}
      />
    </div>
  );
};
