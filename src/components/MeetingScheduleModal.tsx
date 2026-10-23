import React, { useState, useEffect } from 'react';
import {
  X,
  Video,
  Clock,
  Mail,
  Users,
  CheckCircle2,
  Calendar as CalendarIcon,
  Phone,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import {
  scheduleOnlineMeeting,
  getAvailabilityConfig,
  getBookedSlotsForDate,
} from '../services/firestoreService';
import { InstitutionalContent, AvailabilityConfig } from '../types';
import { INITIAL_INSTITUTIONAL_CONTENT } from '../services/bootstrapService';
import { resolvePhotoDisplayUrl } from '../utils/mediaUrlHelper';

interface MeetingScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionalContent?: Record<string, InstitutionalContent>;
}

export const MeetingScheduleModal: React.FC<MeetingScheduleModalProps> = ({
  isOpen,
  onClose,
  institutionalContent = {},
}) => {
  const schedulingConfig = institutionalContent['scheduling'] || INITIAL_INSTITUTIONAL_CONTENT['scheduling'];
  const owner1 = institutionalContent['owner_1'] || INITIAL_INSTITUTIONAL_CONTENT['owner_1'];
  const owner2 = institutionalContent['owner_2'] || INITIAL_INSTITUTIONAL_CONTENT['owner_2'];

  const todayStr = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState<string>(todayStr);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [relationship, setRelationship] = useState<string>('Filho(a)');
  const [serviceInterest, setServiceInterest] = useState<string>(
    'Reunião de Apresentação Geral e Planos'
  );
  const [message, setMessage] = useState<string>('');
  const [honeypot, setHoneypot] = useState<string>('');

  const [availability, setAvailability] = useState<AvailabilityConfig | null>(null);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    meetingLink?: string;
    googleCalendarUrl?: string;
    sender?: string;
    date?: string;
    time?: string;
    email?: string;
    emailSent?: boolean;
    emailError?: string | null;
  } | null>(null);

  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Phone masking helper
  const maskPhone = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 11);
    if (raw.length <= 2) return raw.length > 0 ? `(${raw}` : '';
    if (raw.length <= 6) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    if (raw.length <= 10) return `(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7, 11)}`;
  };

  // Load availability configuration
  useEffect(() => {
    if (!isOpen) return;
    const fetchAvail = async () => {
      const cfg = await getAvailabilityConfig();
      setAvailability(cfg);
    };
    fetchAvail();
  }, [isOpen]);

  // Load booked slots whenever date changes
  useEffect(() => {
    if (!isOpen || !date) return;
    const fetchBooked = async () => {
      try {
        setLoadingSlots(true);
        const booked = await getBookedSlotsForDate(date);
        setBookedSlots(booked);
      } catch (err) {
        console.warn('Erro ao verificar horários ocupados:', err);
      } finally {
        setLoadingSlots(false);
      }
    };
    fetchBooked();
  }, [isOpen, date]);

  // Lock body scroll and handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Active slots list: prioritize official hours configured in Firestore by the ADM
  const rawSlotsFromConfig =
    (schedulingConfig?.availableHours && schedulingConfig.availableHours.trim().length > 0)
      ? schedulingConfig.availableHours.split(',').map((s: string) => s.trim()).filter(Boolean)
      : (availability?.dailyTimeSlots && availability.dailyTimeSlots.length > 0)
          ? availability.dailyTimeSlots
          : ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

  // Check manual blocks
  const blockedSlotsForDate = (availability?.blockedSlots || []).filter((b) => b.date === date);
  const isDateCompletelyBlocked = blockedSlotsForDate.some(
    (b) => !b.time || b.time === 'ALL_DAY'
  );

  const formatDateBR = (d: string) => {
    if (!d) return '';
    if (d.includes('-')) {
      const [y, m, day] = d.split('-');
      return `${day}/${m}/${y}`;
    }
    return d;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!name.trim() || !email.trim() || !phone.trim()) {
      setFeedback({
        type: 'error',
        message: 'Por favor, preencha todos os campos obrigatórios (Nome, E-mail e Telefone).',
      });
      return;
    }

    if (!date) {
      setFeedback({
        type: 'error',
        message: 'Por favor, selecione uma data para a reunião.',
      });
      return;
    }

    if (!selectedSlot) {
      setFeedback({
        type: 'error',
        message: 'Por favor, selecione um dos horários disponíveis para atendimento.',
      });
      return;
    }

    const watchdog = setTimeout(() => {
      setIsSubmitting(false);
      setFeedback({
        type: 'error',
        message: 'Tempo de resposta excedido. Verifique sua conexão e tente novamente.',
      });
    }, 9000);

    try {
      setIsSubmitting(true);
      const res = await scheduleOnlineMeeting({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        scheduledDate: date,
        scheduledTime: selectedSlot,
        meetingLink: schedulingConfig?.meetingLink || 'https://meet.google.com/vic-tori-lar',
        relationship,
        serviceInterest,
        message,
        emailSubject: schedulingConfig?.emailSubject,
        emailInstructions: schedulingConfig?.emailInstructions,
        honeypot,
      });

      setFeedback({
        type: 'success',
        message:
          res.message ||
          'Reunião agendada com sucesso! Um e-mail com data, horário, sala do Google Meet e convite de calendário foi gerado para o seu endereço.',
        meetingLink: res.meetingLink,
        googleCalendarUrl: res.googleCalendarUrl,
        sender: res.sender || 'victorialarresidencial@gmail.com',
        date,
        time: selectedSlot,
        email: email.trim(),
        emailSent: res.emailSent,
        emailError: res.emailError,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err.message ||
          'Falha ao agendar reunião. O horário pode ter acabado de ser reservado ou nossa equipe está com alta demanda. Tente outro horário ou nos chame no WhatsApp.',
      });
    } finally {
      clearTimeout(watchdog);
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="meeting-modal-title"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="relative bg-[#FAF9F5] border border-[#173D2B]/20 rounded-3xl shadow-2xl max-w-5xl w-full my-6 overflow-hidden animate-in zoom-in-95 duration-200 text-neutral-800 flex flex-col max-h-[92vh]">
        {/* Top Bar with Close button */}
        <div className="bg-[#173D2B] text-white px-6 py-4 flex items-center justify-between border-b-2 border-[#B8954A] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#B8954A] flex items-center justify-center text-[#173D2B]">
              <Video className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#B8954A] block">
                Agendamento Oficial Online
              </span>
              <h2 id="meeting-modal-title" className="font-serif font-bold text-sm sm:text-base text-white">
                Victoria Lar Residencial • Reunião via Google Meet
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Container */}
        <div className="p-4 sm:p-8 overflow-y-auto flex-1">
          {feedback?.type === 'success' ? (
            /* ========================================================= */
            /* SUCCESS CONFIRMATION SCREEN                                */
            /* ========================================================= */
            <div className="bg-white rounded-3xl p-6 sm:p-10 border-2 border-[#B8954A] shadow-xl text-center space-y-6 max-w-2xl mx-auto my-4 animate-in fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                {feedback.emailSent !== false ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-300 rounded-full text-emerald-800 text-xs font-bold">
                    ✓ AGENDAMENTO CONFIRMADO • E-MAIL ENVIADO
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 rounded-full text-amber-900 text-xs font-bold">
                    ✓ AGENDAMENTO CONFIRMADO • ATENÇÃO AO LINK
                  </span>
                )}
                <h3 className="font-serif font-bold text-2xl sm:text-3xl text-[#173D2B]">
                  Sua Reunião foi Agendada com Sucesso!
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 max-w-lg mx-auto">
                  {feedback.message}
                </p>
              </div>

              {/* Meeting Details Summary Card */}
              <div className="bg-[#FAF9F5] border-l-4 border-[#B8954A] rounded-2xl p-6 text-left space-y-3.5 max-w-lg mx-auto text-xs sm:text-sm">
                <div>
                  <strong className="text-neutral-900">📅 Data Selecionada:</strong>{' '}
                  <span className="text-[#173D2B] font-bold">{formatDateBR(feedback.date || '')}</span>
                </div>
                <div>
                  <strong className="text-neutral-900">⏰ Horário da Reunião:</strong>{' '}
                  <span className="text-[#173D2B] font-bold">
                    {feedback.time} (Horário de Brasília)
                  </span>
                </div>
                <div>
                  <strong className="text-neutral-900">📹 Sala Virtual Google Meet:</strong>{' '}
                  <span className="font-mono text-purple-900 font-bold break-all block mt-0.5">
                    {feedback.meetingLink}
                  </span>
                </div>
                <div className="pt-2 border-t border-neutral-200/80 space-y-1">
                  <div>
                    <strong className="text-neutral-900">✉️ Remetente Oficial:</strong>{' '}
                    <span className="text-[#173D2B] font-bold">victorialarresidencial@gmail.com</span>
                  </div>
                  <div>
                    <strong className="text-neutral-900">👤 Destinatário:</strong>{' '}
                    <span className="text-neutral-700 font-medium">{feedback.email}</span>
                  </div>
                </div>
                {feedback.emailSent !== false ? (
                  <p className="text-[11px] text-emerald-700 pt-1 leading-relaxed font-medium">
                    ✓ Enviamos um e-mail com todas as orientações, link direto da sala e convite oficial (.ics) para sincronização automática.
                  </p>
                ) : (
                  <div className="pt-2 border-t border-amber-200/90 text-amber-900 text-[11px] bg-amber-50/80 rounded-xl p-3 space-y-1">
                    <strong className="block font-bold text-amber-950">⚠️ Observação sobre a notificação por e-mail:</strong>
                    <p className="leading-relaxed">
                      Não foi possível despachar o e-mail de confirmação automaticamente neste momento ({feedback.emailError || 'instabilidade na conexão SMTP'}), mas o seu agendamento está 100% garantido com a direção.
                    </p>
                    <p className="font-semibold text-emerald-900 pt-0.5">
                      👉 Por favor, utilize os botões abaixo para copiar o link da sala do Meet ou adicionar a reunião diretamente à sua agenda do Google Calendar.
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 pt-4">
                {/* 1. Entrar na Sala Meet */}
                {feedback.meetingLink && (
                  <a
                    href={feedback.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-3 px-5 bg-[#173D2B] hover:bg-[#123022] text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    <Video className="w-4 h-4 text-[#B8954A]" />
                    <span>Entrar na Sala do Meet</span>
                    <ExternalLink className="w-3.5 h-3.5 text-white/70" />
                  </a>
                )}

                {/* 2. Adicionar ao Google Calendar */}
                {(() => {
                  const calUrl =
                    feedback.googleCalendarUrl ||
                    (() => {
                      if (!feedback?.date || !feedback?.time) return null;
                      const [y, m, d] = feedback.date.split('-').map(Number);
                      const [h, min] = feedback.time.split(':').map(Number);
                      const start = new Date(Date.UTC(y, m - 1, d, h + 3, min, 0));
                      const end = new Date(start.getTime() + 45 * 60 * 1000);
                      const toCompact = (dt: Date) =>
                        dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                      const meet = feedback.meetingLink || 'https://meet.google.com/vic-tori-lar';
                      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
                        'Reunião Online - Victoria Lar Residencial'
                      )}&dates=${toCompact(start)}/${toCompact(end)}&details=${encodeURIComponent(
                        `Reunião com a direção da Victoria Lar Residencial (Olga & Robson).\n\nLink do Google Meet: ${meet}\nE-mail oficial: victorialarresidencial@gmail.com\nTelefone/WhatsApp: (11) 98765-4321`
                      )}&location=${encodeURIComponent(meet)}&ctz=America/Sao_Paulo`;
                    })();

                  if (!calUrl) return null;

                  return (
                    <a
                      href={calUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-3 px-5 bg-[#B8954A] hover:bg-[#A3833D] text-[#173D2B] font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      <CalendarIcon className="w-4 h-4 text-[#173D2B]" />
                      <span>Adicionar ao Google Calendar</span>
                      <ExternalLink className="w-3.5 h-3.5 text-[#173D2B]/80" />
                    </a>
                  );
                })()}

                {/* 3. Copiar Link da Sala */}
                <button
                  type="button"
                  onClick={() => {
                    if (feedback.meetingLink) {
                      navigator.clipboard.writeText(feedback.meetingLink);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 3000);
                    }
                  }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 py-3 px-4 bg-white border border-neutral-300 hover:border-[#B8954A] text-neutral-800 font-semibold text-xs rounded-xl shadow-2xs transition-all cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700">Link Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-neutral-500" />
                      <span>Copiar Link da Sala</span>
                    </>
                  )}
                </button>

                {/* 4. Fechar */}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto py-3 px-5 border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-semibold text-xs rounded-xl cursor-pointer"
                >
                  Concluir e Fechar
                </button>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* TWO-COLUMN SCHEDULER VIEW (Idêntico ao image.png)         */
            /* ========================================================= */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* LEFT COLUMN: Meeting Presentation & Features */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-neutral-200/90 shadow-md space-y-6 text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-50 border border-purple-200 rounded-full text-purple-800 text-xs font-bold">
                    <Video className="w-3.5 h-3.5" />
                    <span>Reunião Online via Google Meet</span>
                  </div>

                  <h3 className="text-2xl font-serif font-bold text-[#173D2B] leading-tight">
                    Conversa por Vídeo
                  </h3>

                  <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                    Sua família terá um momento reservado diretamente com quem idealizou e cuida pessoalmente do Victoria Lar Residencial. Tire dúvidas clínicas, converse sobre planos personalizados e conheça nossa filosofia de acolhimento.
                  </p>

                  <div className="space-y-3 pt-1 text-xs">
                    <div className="flex items-start gap-3 bg-[#FAF9F5] p-3.5 rounded-2xl border border-neutral-200">
                      <Clock className="w-4 h-4 text-[#B8954A] flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-neutral-900 block font-bold">Duração Estimada:</strong>
                        <span className="text-neutral-600">
                          {availability?.meetingDuration || schedulingConfig?.meetingDuration || '30 a 45 minutos'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 bg-[#FAF9F5] p-3.5 rounded-2xl border border-neutral-200">
                      <Video className="w-4 h-4 text-[#B8954A] flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-neutral-900 block font-bold">Plataforma Google Meet:</strong>
                        <span className="text-neutral-600">
                          Acesse facilmente pelo celular ou computador sem precisar instalar nada.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 bg-[#FAF9F5] p-3.5 rounded-2xl border border-neutral-200">
                      <Mail className="w-4 h-4 text-[#B8954A] flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-neutral-900 block font-bold">Disparo Automático de Confirmação:</strong>
                        <span className="text-neutral-600">
                          Ao confirmar seu agendamento, um e-mail oficial com o link da sala, data e horário é enviado instantaneamente.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 bg-[#FAF9F5] p-3.5 rounded-2xl border border-neutral-200">
                      <Users className="w-4 h-4 text-[#B8954A] flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-neutral-900 block font-bold">Atendimento Direto:</strong>
                        <span className="text-neutral-600">
                          Presença confirmada dos sócios-proprietários na videochamada.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Owners Bottom Mini Callout */}
                  <div className="pt-4 border-t border-neutral-100 flex items-center gap-3">
                    <div className="flex -space-x-2.5 overflow-hidden">
                      {(() => {
                        const parsed = resolvePhotoDisplayUrl(owner1?.imageUrl || '');
                        if (parsed.isValid && parsed.displayUrl) {
                          return (
                            <img
                              src={parsed.displayUrl}
                              alt={owner1?.imageCaption || 'Olga'}
                              className="inline-block h-10 w-10 rounded-full ring-2 ring-white object-cover"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                if (parsed.fallbackUrl && e.currentTarget.src !== parsed.fallbackUrl) {
                                  e.currentTarget.src = parsed.fallbackUrl;
                                } else {
                                  e.currentTarget.style.display = 'none';
                                }
                              }}
                            />
                          );
                        }
                        return (
                          <div className="inline-flex h-10 w-10 rounded-full ring-2 ring-white bg-[#173D2B] text-[#DFC282] items-center justify-center text-xs font-bold shadow-xs">
                            {owner1?.imageCaption?.charAt(0) || 'O'}
                          </div>
                        );
                      })()}
                      {(() => {
                        const parsed = resolvePhotoDisplayUrl(owner2?.imageUrl || '');
                        if (parsed.isValid && parsed.displayUrl) {
                          return (
                            <img
                              src={parsed.displayUrl}
                              alt={owner2?.imageCaption || 'Robson'}
                              className="inline-block h-10 w-10 rounded-full ring-2 ring-white object-cover"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                if (parsed.fallbackUrl && e.currentTarget.src !== parsed.fallbackUrl) {
                                  e.currentTarget.src = parsed.fallbackUrl;
                                } else {
                                  e.currentTarget.style.display = 'none';
                                }
                              }}
                            />
                          );
                        }
                        return (
                          <div className="inline-flex h-10 w-10 rounded-full ring-2 ring-white bg-[#B8954A] text-[#173D2B] items-center justify-center text-xs font-bold shadow-xs">
                            {owner2?.imageCaption?.charAt(0) || 'R'}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-left text-xs">
                      {/*<span className="font-serif font-bold text-neutral-900 block">
                        Fale com a gente
                      </span>*/}
                      <span className="text-neutral-500 text-[11px]">
                        Sócios-Proprietários à sua disposição
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Interactive Scheduler Form */}
              <div className="lg:col-span-7">
                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200/90 shadow-md space-y-6 text-left">
                  {/* Form Header */}
                  <div>
                    <h3 className="font-serif font-bold text-[#173D2B] text-xl sm:text-2xl">
                      Agendar Reunião via Google Meet
                    </h3>
                    <p className="text-xs sm:text-sm text-neutral-600 mt-1.5 leading-relaxed">
                      Escolha o melhor dia e horário. Ao finalizar, nosso sistema disparará a confirmação diretamente para o seu e-mail com o link de acesso.
                    </p>
                  </div>

                  {feedback?.type === 'error' && (
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                      <span>{feedback.message}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-6 text-xs">
                    {/* Bot honeypot */}
                    <input
                      type="text"
                      name="honeypot"
                      tabIndex={-1}
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                      className="hidden"
                      autoComplete="off"
                    />

                    {/* =================================================== */}
                    {/* STEP 1: Escolha a Data e o Horário                  */}
                    {/* =================================================== */}
                    <div className="space-y-4 pb-5 border-b border-neutral-100">
                      <div className="flex items-center gap-2">
                        <span className="font-serif font-bold text-sm text-[#173D2B]">
                          1. Escolha a Data e o Horário da Reunião
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Data Desejada */}
                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1.5">
                            Data Desejada *
                          </label>
                          <div className="relative">
                            <input
                              type="date"
                              min={todayStr}
                              required
                              value={date}
                              onChange={(e) => {
                                setDate(e.target.value);
                                setSelectedSlot(''); // Reset slot selection when date changes
                              }}
                              className="w-full p-3 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#173D2B] text-xs font-medium cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Horário Selecionado Display */}
                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1.5">
                            Horário Selecionado *
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={
                              selectedSlot
                                ? `${selectedSlot} (Horário Selecionado)`
                                : 'Selecione um dos horários abaixo'
                            }
                            className={`w-full p-3 border rounded-xl text-xs font-semibold cursor-default ${
                              selectedSlot
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Horários Disponíveis para Atendimento */}
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="block font-semibold text-neutral-700 text-xs">
                            Horários Disponíveis para Atendimento:
                          </label>
                          {loadingSlots && (
                            <span className="text-[11px] text-neutral-400 animate-pulse">
                              Verificando agenda...
                            </span>
                          )}
                        </div>

                        {isDateCompletelyBlocked ? (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                            🚫 A data selecionada ({formatDateBR(date)}) está sem horários de atendimento disponíveis (folga ou compromisso administrativo). Por favor, selecione outro dia.
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                            {rawSlotsFromConfig.map((slot: string) => {
                              const isBooked = bookedSlots.includes(slot);
                              const isBlocked = blockedSlotsForDate.some((b) => b.time === slot);
                              const isUnavailable = isBooked || isBlocked;
                              const isSelected = selectedSlot === slot;

                              return (
                                <button
                                  key={slot}
                                  type="button"
                                  disabled={isUnavailable}
                                  onClick={() => setSelectedSlot(slot)}
                                  className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#173D2B] text-[#DFC282] ring-2 ring-[#B8954A] shadow-md scale-[1.02]'
                                      : isUnavailable
                                      ? 'bg-neutral-100 text-neutral-400 border border-neutral-200 opacity-60 cursor-not-allowed line-through'
                                      : 'bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-800 hover:border-[#B8954A]'
                                  }`}
                                  title={
                                    isBooked
                                      ? 'Horário já reservado por outro interessado'
                                      : isBlocked
                                      ? 'Horário bloqueado pela administração'
                                      : `Selecionar ${slot}`
                                  }
                                >
                                  <span>{slot}</span>
                                  {isUnavailable && (
                                    <span className="text-[9px] no-underline font-normal text-neutral-500 mt-0.5">
                                      {isBooked ? 'Ocupado' : 'Bloqueado'}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* =================================================== */}
                    {/* STEP 2: Seus Dados para Envio do Link por E-mail    */}
                    {/* =================================================== */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="font-serif font-bold text-sm text-[#173D2B]">
                          2. Seus Dados para Envio do Link por E-mail
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Seu Nome Completo *
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={120}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Carlos Eduardo da Silva"
                            className="w-full p-3 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#173D2B] text-xs"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            E-mail para Receber o Link da Reunião *
                          </label>
                          <input
                            type="email"
                            required
                            maxLength={160}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="carlos@exemplo.com"
                            className="w-full p-3 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#173D2B] text-xs"
                          />
                          <span className="text-[10px] text-neutral-500 mt-1 block">
                            A confirmação oficial com o Google Meet será enviada para este endereço.
                          </span>
                        </div>

                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Telefone / WhatsApp com DDD *
                          </label>
                          <input
                            type="tel"
                            required
                            maxLength={16}
                            value={phone}
                            onChange={(e) => setPhone(maskPhone(e.target.value))}
                            placeholder="(11) 99999-9999"
                            className="w-full p-3 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#173D2B] text-xs"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-neutral-700 mb-1">
                            Grau de Parentesco com o Residente
                          </label>
                          <select
                            value={relationship}
                            onChange={(e) => setRelationship(e.target.value)}
                            className="w-full p-3 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#173D2B] text-xs cursor-pointer"
                          >
                            <option value="Filho(a)">Filho(a)</option>
                            <option value="Cônjuge">Cônjuge</option>
                            <option value="Neto(a)">Neto(a)</option>
                            <option value="Sobrinho(a)">Sobrinho(a)</option>
                            <option value="Próprio Idoso">Próprio Idoso</option>
                            <option value="Outro Familiar / Cuidador">Outro Familiar / Cuidador</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-neutral-700 mb-1">
                          Assunto Principal da Conversa
                        </label>
                        <select
                          value={serviceInterest}
                          onChange={(e) => setServiceInterest(e.target.value)}
                          className="w-full p-3 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#173D2B] text-xs cursor-pointer"
                        >
                          <option value="Reunião de Apresentação Geral e Planos">
                            Reunião de Apresentação Geral e Planos
                          </option>
                          <option value="Dúvidas Clínicas e Cuidados de Enfermagem">
                            Dúvidas Clínicas e Cuidados de Enfermagem
                          </option>
                          <option value="Conhecer Instalações, Jardins e Rotina">
                            Conhecer Instalações, Jardins e Rotina
                          </option>
                          <option value="Acolhimento Especializado Pós-Hospitalar">
                            Acolhimento Especializado Pós-Hospitalar
                          </option>
                          <option value="Outro Assunto Específico">Outro Assunto Específico</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-neutral-700 mb-1">
                          Observações ou Histórico do Familiar (Opcional)
                        </label>
                        <textarea
                          rows={3}
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="Conte brevemente sobre a rotina ou necessidades especiais do seu familiar para nos prepararmos melhor..."
                          className="w-full p-3 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#173D2B] text-xs leading-relaxed"
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2 space-y-3">
                      <button
                        type="submit"
                        disabled={isSubmitting || !selectedSlot || isDateCompletelyBlocked}
                        className="w-full inline-flex items-center justify-center gap-2.5 py-4 px-6 bg-[#173D2B] hover:bg-[#123022] text-white font-bold text-sm rounded-xl shadow-lg transition-all hover:scale-[1.01] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-[#B8954A]"
                      >
                        <Video className="w-5 h-5 text-[#B8954A]" />
                        <span>
                          {isSubmitting
                            ? 'Processando Agendamento...'
                            : 'Confirmar Agendamento & Receber E-mail com Link do Google Meet'}
                        </span>
                      </button>

                      <p className="text-[10px] text-neutral-400 text-center leading-relaxed">
                        ✓ Regra do sistema: ao confirmar, um e-mail é disparado imediatamente para o seu e-mail cadastrado contendo data, horário, orientações e o link de acesso ao Google Meet.
                      </p>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
