import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  CheckCircle2,
  Phone,
  Mail,
  MapPin,
  Clock,
  ShieldCheck,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { submitContactLead } from '../services/firestoreService';
import { VictoriaEmblem } from './VictoriaLogo';
import { InstitutionalContent, ServiceItem } from '../types';

interface ContactLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialServiceInterest?: string;
  institutionalContent?: Record<string, InstitutionalContent>;
  availableServices?: ServiceItem[];
}

export const ContactLeadModal: React.FC<ContactLeadModalProps> = ({
  isOpen,
  onClose,
  initialServiceInterest = 'Apresentação Geral e Planos',
  institutionalContent = {},
  availableServices = [],
}) => {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    relationship: 'Filho(a)',
    serviceInterest: initialServiceInterest,
    message: '',
    honeypot: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sync initialServiceInterest when opened with a specific service
  useEffect(() => {
    if (initialServiceInterest) {
      setForm((prev) => ({ ...prev, serviceInterest: initialServiceInterest }));
    }
  }, [initialServiceInterest]);

  // Lock body scroll and listen for Escape key
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

  const heroContent = institutionalContent['hero'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!form.name.trim() || !form.phone.trim()) {
      setFeedback({
        type: 'error',
        message: 'Por favor, preencha seu nome e um telefone para contato.',
      });
      return;
    }

    const watchdog = setTimeout(() => {
      setSubmitting(false);
      setFeedback({
        type: 'error',
        message: 'Tempo de resposta excedido. Verifique sua conexão e tente novamente.',
      });
    }, 9000);

    try {
      setSubmitting(true);
      const res = await submitContactLead(form);
      setFeedback({
        type: 'success',
        message:
          res.message ||
          'Sua solicitação de visita foi recebida! Nossa equipe entrará em contato prontamente.',
      });

      // Clear form
      setForm({
        name: '',
        email: '',
        phone: '',
        relationship: 'Filho(a)',
        serviceInterest: initialServiceInterest || 'Apresentação Geral e Planos',
        message: '',
        honeypot: '',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err.message ||
          'Falha ao enviar mensagem. Por favor, tente novamente ou ligue diretamente para nossa equipe.',
      });
    } finally {
      clearTimeout(watchdog);
      setSubmitting(false);
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
      aria-labelledby="contact-modal-title"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="relative bg-[#FAF9F5] border border-[#173D2B]/20 rounded-3xl shadow-2xl max-w-2xl w-full my-6 overflow-hidden animate-in zoom-in-95 duration-200 text-neutral-800">
        {/* Header */}
        <div className="bg-[#173D2B] text-white p-6 sm:p-7 relative border-b-2 border-[#B8954A]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/10 border border-[#B8954A]/50 flex items-center justify-center flex-shrink-0 p-1">
                <VictoriaEmblem variant="light" width={34} height={24} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#B8954A] block mb-0.5">
                  Atendimento & Agendamento
                </span>
                <h3
                  id="contact-modal-title"
                  className="font-serif font-bold text-lg sm:text-2xl text-white leading-tight"
                >
                  Solicitar Informações ou Agendar Visita
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar formulário"
              className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-xs sm:text-sm text-white/80 mt-2.5 leading-relaxed max-w-xl">
            Preencha os dados abaixo. Nossa diretoria e equipe clínica responderão prontamente para esclarecer dúvidas e agendar sua visita presencial.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 max-h-[calc(85vh-140px)] overflow-y-auto">
          {feedback?.type === 'success' ? (
            <div className="text-center py-6 sm:py-8 space-y-5">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-300 rounded-full text-emerald-800 text-xs font-bold">
                  ✓ SOLICITAÇÃO ENVIADA COM SUCESSO
                </span>
                <h4 className="font-serif font-bold text-2xl text-[#173D2B]">
                  Obrigado pelo seu contato!
                </h4>
                <p className="text-xs sm:text-sm text-neutral-600 max-w-md mx-auto leading-relaxed">
                  {feedback.message}
                </p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-neutral-200 text-left text-xs max-w-md mx-auto space-y-2 text-neutral-700">
                <div className="flex items-center gap-2 text-[#173D2B] font-bold">
                  <ShieldCheck className="w-4 h-4 text-[#B8954A]" />
                  <span>Próximos Passos:</span>
                </div>
                <p className="text-neutral-600">
                  Nossa equipe entrará em contato via telefone ou WhatsApp no número informado para tirar todas as dúvidas e confirmar o melhor dia e horário para a sua visita.
                </p>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 bg-[#173D2B] hover:bg-[#123022] text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Concluir e Fechar
                </button>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="px-5 py-3 bg-white border border-neutral-300 hover:border-[#B8954A] text-neutral-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Enviar Outra Mensagem
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Honeypot field for bot protection */}
              <input
                type="text"
                name="honeypot"
                tabIndex={-1}
                value={form.honeypot}
                onChange={(e) => setForm({ ...form, honeypot: e.target.value })}
                className="hidden"
                autoComplete="off"
              />

              {feedback?.type === 'error' && (
                <div className="p-4 rounded-xl text-xs bg-red-50 border border-red-300 text-red-800 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
                  <span>{feedback.message}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Seu Nome Completo *
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Carlos Eduardo"
                    className="w-full p-3 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#173D2B] focus:border-transparent text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Telefone / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    maxLength={30}
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="(11) 99999-9999"
                    className="w-full p-3 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#173D2B] focus:border-transparent text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    E-mail para Retorno
                  </label>
                  <input
                    type="email"
                    maxLength={160}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="carlos@exemplo.com"
                    className="w-full p-3 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#173D2B] focus:border-transparent text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Grau de Parentesco com o Residente
                  </label>
                  <select
                    value={form.relationship}
                    onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                    className="w-full p-3 bg-white border border-neutral-300 rounded-xl text-xs"
                  >
                    <option value="Filho(a)">Filho(a)</option>
                    <option value="Neto(a)">Neto(a)</option>
                    <option value="Cônjuge">Cônjuge</option>
                    <option value="Próprio Residente">Próprio Residente</option>
                    <option value="Irmão / Irmã">Irmão / Irmã</option>
                    <option value="Outro">Outro Familiar / Cuidador</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Serviço ou Cuidado de Maior Interesse
                </label>
                <select
                  value={form.serviceInterest}
                  onChange={(e) => setForm({ ...form, serviceInterest: e.target.value })}
                  className="w-full p-3 bg-white border border-neutral-300 rounded-xl text-xs"
                >
                  <option value="Apresentação Geral e Planos">Apresentação Geral e Planos</option>
                  {availableServices && availableServices.length > 0 && (
                    <optgroup label="Serviços Oficiais Cadastrados">
                      {availableServices.map((s) => (
                        <option key={s.id} value={s.title}>
                          {s.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value="Agendamento de Visita Presencial">Agendamento de Visita Presencial</option>
                  <option value="Consulta sobre Vagas e Acomodações">Consulta sobre Vagas e Acomodações</option>
                  <option value="Desejo Conhecer Planos e Valores">Desejo Conhecer Planos e Valores</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Observações ou Necessidades Específicas
                </label>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Conte-nos um pouco sobre a rotina, mobilidade ou cuidados médicos que seu familiar necessita..."
                  className="w-full p-3 bg-white border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#173D2B] focus:border-transparent text-xs leading-relaxed"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3 items-center">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 py-3.5 px-6 bg-[#173D2B] hover:bg-[#123022] text-white font-bold text-xs rounded-xl shadow-md transition-all border border-[#B8954A] hover:scale-[1.01] cursor-pointer disabled:opacity-60"
                >
                  <Send className="w-4 h-4 text-[#B8954A]" />
                  <span>
                    {submitting ? 'Gravando e Confirmando Envio...' : 'Enviar Solicitação pelo Formulário'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-5 py-3.5 bg-white border border-neutral-300 hover:border-neutral-400 text-neutral-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div className="pt-2 text-[10px] text-neutral-400 text-center flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
                <span>
                  Garantia de confidencialidade: seus dados são processados com segurança e protegidos sob rigoroso sigilo.
                </span>
              </div>
            </form>
          )}

          {/* Quick Institutional Info footer strip inside modal */}
          <div className="mt-6 pt-5 border-t border-neutral-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-neutral-600 bg-white p-4 rounded-2xl border border-neutral-200">
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-[#B8954A] flex-shrink-0" />
              <span>
                <strong>Telefone:</strong> {heroContent?.phone || '(11) 3456-7890'} / {heroContent?.whatsapp || '(11) 98765-4321'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#B8954A] flex-shrink-0" />
              <span>
                <strong>Visitação:</strong> {heroContent?.visitingHours || 'Segunda a Domingo: 09h00 às 18h00'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
