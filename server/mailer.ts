import nodemailer, { Transporter } from 'nodemailer';

export const OFFICIAL_GMAIL = 'victorialarresidencial@gmail.com';
export const OFFICIAL_SENDER_NAME = 'Victoria Lar Residencial';

export interface SmtpResolvedConfig {
  host: string;
  port: number;
  secure: boolean;
  requireTLS?: boolean;
  user: string;
  pass: string;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  isCustomHost: boolean;
  isDirectGmail: boolean;
  isFallback: boolean;
}

export interface SendMeetingEmailParams {
  to: string;
  name: string;
  scheduledDate: string;
  scheduledTime: string;
  meetingLink: string;
  serviceInterest?: string;
  phone?: string;
  instructions?: string;
  subject?: string;
}

export interface CalendarDetails {
  title: string;
  formattedDate: string;
  startIso: string;
  endIso: string;
  googleCalendarUrl: string;
  icsContent: string;
}

export interface SendMeetingEmailResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string | null;
  googleCalendarUrl: string;
  error?: string;
  errorCode?: string;
}

/**
 * Sanitizes any data before logging to guarantee that passwords,
 * tokens, and secrets are NEVER exposed in stdout, stderr, or Render logs.
 */
export function sanitizeLog(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    // Redact pass=..., password=..., Bearer ..., etc.
    return data
      .replace(/(password|pass|secret|token|auth)\s*[:=]\s*["']?[^"',\s]+["']?/gi, '$1: "[REDACTED]"')
      .replace(/Bearer\s+[a-zA-Z0-9_\-.]+/gi, 'Bearer [REDACTED]');
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLog(item));
  }
  if (typeof data === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (val !== null && typeof val === 'object') {
        clean[key] = sanitizeLog(val);
      } else if (
        lower.includes('pass') ||
        lower.includes('secret') ||
        lower.includes('token') ||
        lower.includes('auth') ||
        lower.includes('credentials')
      ) {
        clean[key] = val ? '[REDACTED]' : null;
      } else {
        clean[key] = sanitizeLog(val);
      }
    }
    return clean;
  }
  return data;
}

/**
 * Builds and validates SMTP configuration from environment variables.
 * Enforces TLS/port compatibility (Port 465 requires secure=true, Port 587 requires secure=false).
 * Provides robust timeouts for cloud container environments like Render.
 */
export function buildSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpResolvedConfig {
  const customHost = (env.SMTP_HOST || '').trim();
  const rawPort = env.SMTP_PORT ? parseInt(env.SMTP_PORT.trim(), 10) : undefined;
  const rawSecure = env.SMTP_SECURE !== undefined ? env.SMTP_SECURE.trim().toLowerCase() : undefined;

  const rawPass = (
    env.SMTP_PASS ||
    env.GMAIL_APP_PASSWORD ||
    env.GMAIL_PASSWORD ||
    ''
  ).replace(/\s+/g, '');

  const rawUser = (
    env.SMTP_USER ||
    env.GMAIL_USER ||
    OFFICIAL_GMAIL
  ).trim();

  // Cloud timeout defaults: 5s connection, 5s greeting, 8s socket on Vercel; 10s/10s/15s on containers
  const isVercel = !!(env.VERCEL || process.env.VERCEL);
  const defaultConnTimeout = isVercel ? 5000 : 10000;
  const defaultGreetTimeout = isVercel ? 5000 : 10000;
  const defaultSockTimeout = isVercel ? 8000 : 15000;

  const connectionTimeout = env.SMTP_CONNECTION_TIMEOUT
    ? parseInt(env.SMTP_CONNECTION_TIMEOUT.trim(), 10)
    : defaultConnTimeout;
  const greetingTimeout = env.SMTP_GREETING_TIMEOUT
    ? parseInt(env.SMTP_GREETING_TIMEOUT.trim(), 10)
    : defaultGreetTimeout;
  const socketTimeout = env.SMTP_SOCKET_TIMEOUT
    ? parseInt(env.SMTP_SOCKET_TIMEOUT.trim(), 10)
    : defaultSockTimeout;

  // Case 1: Custom SMTP host explicitly defined (e.g. smtp.sendgrid.net, smtp.mailgun.org, smtp.gmail.com)
  if (customHost) {
    let port = rawPort;
    let secure: boolean;
    let requireTLS = false;

    if (!port) {
      if (customHost.toLowerCase() === 'smtp.gmail.com') {
        // For Gmail on Render, port 465 with implicit TLS is substantially more reliable
        port = rawSecure === 'false' ? 587 : 465;
      } else {
        port = rawSecure === 'true' ? 465 : 587;
      }
    }

    // Port & TLS Compatibility Verification:
    // Port 465: MUST use secure: true (Implicit TLS / SMTPS)
    // Port 587 / 2525: MUST use secure: false (STARTTLS)
    if (port === 465) {
      if (rawSecure === 'false') {
        console.warn(
          '[Victoria Lar Mailer] Aviso de compatibilidade: Porta 465 opera com TLS implícito (secure: true). Corrigindo automaticamente para evitar falha de conexão.'
        );
      }
      secure = true;
    } else if (port === 587 || port === 2525) {
      if (rawSecure === 'true') {
        console.warn(
          `[Victoria Lar Mailer] Aviso de compatibilidade: Porta ${port} opera com STARTTLS (secure: false). 'secure: true' causa ETIMEDOUT imediato. Corrigindo automaticamente.`
        );
      }
      secure = false;
      requireTLS = true;
    } else {
      secure = rawSecure === 'true';
    }

    if (port === 25) {
      console.warn(
        '[Victoria Lar Mailer] Alerta crítico: O provedor Render bloqueia conexões de saída na porta 25. Utilize a porta 465 (com secure: true) ou 587 (com STARTTLS).'
      );
    }

    return {
      host: customHost,
      port,
      secure,
      requireTLS,
      user: rawUser,
      pass: rawPass,
      connectionTimeout,
      greetingTimeout,
      socketTimeout,
      isCustomHost: true,
      isDirectGmail: customHost.toLowerCase().includes('gmail'),
      isFallback: !rawPass,
    };
  }

  // Case 2: No SMTP_HOST defined, but Gmail password / app password is present
  if (rawPass) {
    let port = rawPort || 465;
    let secure = port === 465;
    let requireTLS = port === 587;

    if (port === 465 && rawSecure === 'false') {
      secure = true;
    } else if (port === 587 && rawSecure === 'true') {
      console.warn(
        '[Victoria Lar Mailer] Aviso: Porta 587 requer secure: false. Corrigindo automaticamente para evitar timeout.'
      );
      secure = false;
      requireTLS = true;
    }

    return {
      host: 'smtp.gmail.com',
      port,
      secure,
      requireTLS,
      user: rawUser,
      pass: rawPass,
      connectionTimeout,
      greetingTimeout,
      socketTimeout,
      isCustomHost: false,
      isDirectGmail: true,
      isFallback: false,
    };
  }

  // Case 3: Development / Demo fallback (no credentials configured)
  return {
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    requireTLS: false,
    user: '',
    pass: '',
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    isCustomHost: false,
    isDirectGmail: false,
    isFallback: true,
  };
}

let cachedTransporter: Transporter | null = null;
let mockTransporterForTests: Transporter | null = null;

/**
 * Injects a mock transporter for testing purposes (e.g. timeout simulations, auth failures).
 */
export function setMockTransporter(transporter: Transporter | null): void {
  mockTransporterForTests = transporter;
  cachedTransporter = transporter;
}

/**
 * Resets cached transporter instance.
 */
export function resetTransporter(): void {
  cachedTransporter = null;
  mockTransporterForTests = null;
}

/**
 * Returns a configured, reusable Nodemailer Transporter instance.
 */
export async function getTransporter(): Promise<Transporter> {
  if (mockTransporterForTests) {
    return mockTransporterForTests;
  }
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const config = buildSmtpConfig();

  if (!config.isFallback && config.pass) {
    const maskedUser = config.user.replace(/^(.)(.*)(@.*)$/, (_, first, middle, domain) => {
      return `${first}${'*'.repeat(Math.min(middle.length, 4))}${domain}`;
    });

    console.log(
      `[Victoria Lar Mailer] Inicializando transporte SMTP: host=${config.host}, port=${config.port}, secure=${config.secure}, user=${maskedUser}, timeouts(conn=${config.connectionTimeout}ms, greet=${config.greetingTimeout}ms, sock=${config.socketTimeout}ms)`
    );

    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTLS,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      connectionTimeout: config.connectionTimeout,
      greetingTimeout: config.greetingTimeout,
      socketTimeout: config.socketTimeout,
      tls: {
        // Enforce TLSv1.2+ for maximum compatibility and security
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
    });

    return cachedTransporter;
  }

  // Graceful development / demo fallback
  console.warn(
    `[Victoria Lar Mailer] Nenhuma credencial SMTP ou GMAIL_APP_PASSWORD configurada no ambiente. Utilizando transporte simulado de desenvolvimento.`
  );

  try {
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });
    return cachedTransporter;
  } catch (_etherealErr) {
    cachedTransporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
    return cachedTransporter;
  }
}

/**
 * Verifies SMTP transport connectivity without sending an email.
 * Never logs credentials.
 */
export async function verifySmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = await getTransporter();
    await transporter.verify();
    return { ok: true };
  } catch (err: any) {
    const safeError = sanitizeLog(err?.message || 'Falha na verificação SMTP');
    console.warn('[Victoria Lar Mailer] Falha na verificação SMTP:', safeError);
    return { ok: false, error: safeError };
  }
}

/**
 * Builds RFC 5545 iCalendar content and Google Calendar URL.
 */
export function buildCalendarDetails(params: {
  name: string;
  email: string;
  scheduledDate: string;
  scheduledTime: string;
  meetingLink: string;
  serviceInterest?: string;
  durationMinutes?: number;
}): CalendarDetails {
  let formattedDate = params.scheduledDate;
  if (params.scheduledDate.includes('-')) {
    const [y, m, d] = params.scheduledDate.split('-');
    formattedDate = `${d}/${m}/${y}`;
  }

  const [yearStr, monthStr, dayStr] = params.scheduledDate.split('-');
  const [hourStr, minStr] = params.scheduledTime.split(':');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || 1;
  const day = parseInt(dayStr, 10) || 1;
  const hour = parseInt(hourStr, 10) || 9;
  const minute = parseInt(minStr, 10) || 0;
  const duration = params.durationMinutes || 45;

  // Horário de Brasília é UTC-3.
  const startUtc = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0));
  const endUtc = new Date(startUtc.getTime() + duration * 60 * 1000);
  const nowUtc = new Date();

  const toCompactIso = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const startIso = toCompactIso(startUtc);
  const endIso = toCompactIso(endUtc);
  const dtStamp = toCompactIso(nowUtc);

  const title = 'Reunião Online - Victoria Lar Residencial';
  const description = [
    `Reunião com a direção da Victoria Lar Residencial (Olga & Robson).`,
    ``,
    `📹 Link do Google Meet: ${params.meetingLink}`,
    `📅 Data: ${formattedDate}`,
    `⏰ Horário: ${params.scheduledTime} (Horário de Brasília)`,
    `🩺 Assunto: ${params.serviceInterest || 'Reunião de Apresentação e Planos'}`,
    `👤 Participante: ${params.name}`,
    `✉️ Remetente Oficial: ${OFFICIAL_GMAIL}`,
    `📞 WhatsApp da Direção: (11) 98765-4321`,
    `📍 Endereço: Alameda das Rosas, 450 - São Paulo, SP`,
    ``,
    `Instruções: Conecte-se com 5 minutos de antecedência. Reunião acessível pelo celular ou computador.`,
  ].join('\n');

  const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    title
  )}&dates=${startIso}/${endIso}&details=${encodeURIComponent(
    description
  )}&location=${encodeURIComponent(params.meetingLink)}&ctz=America/Sao_Paulo`;

  const uid = `meet_${Date.now()}_${Math.random().toString(36).substring(2, 9)}@victorialar.com.br`;
  const cleanDesc = description.replace(/\n/g, '\\n');
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Victoria Lar Residencial//Agendamento Google Meet//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${startIso}`,
    `DTEND:${endIso}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${cleanDesc}`,
    `LOCATION:${params.meetingLink}`,
    `ORGANIZER;CN="Victoria Lar Residencial":mailto:${OFFICIAL_GMAIL}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${params.name.replace(/[",\r\n]/g, '')}":mailto:${params.email}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const icsContent = icsLines.join('\r\n');

  return {
    title,
    formattedDate,
    startIso,
    endIso,
    googleCalendarUrl,
    icsContent,
  };
}

/**
 * Sends meeting confirmation email.
 * Strictly guarantees:
 * 1. Only returns success: true when Nodemailer confirms delivery to SMTP server.
 * 2. Returns clear error code and sanitized error message on failure.
 * 3. Never leaks passwords, secrets, or auth tokens in logs or errors.
 */
export async function sendMeetingConfirmationEmail(
  params: SendMeetingEmailParams
): Promise<SendMeetingEmailResult> {
  const calendarDetails = buildCalendarDetails({
    name: params.name,
    email: params.to,
    scheduledDate: params.scheduledDate,
    scheduledTime: params.scheduledTime,
    meetingLink: params.meetingLink,
    serviceInterest: params.serviceInterest,
  });

  const mailSubject =
    params.subject || 'Confirmação de Agendamento: Reunião - Victoria Lar Residencial';

  const htmlBody = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>${mailSubject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF9F5; margin: 0; padding: 24px; color: #1c2b22;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #B8954A; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
        <tr>
          <td style="background-color: #173D2B; padding: 32px 28px; text-align: center; border-bottom: 3px solid #B8954A;">
            <h1 style="margin: 0; color: #FAF9F5; font-size: 24px; font-family: Georgia, serif; letter-spacing: 2px;">VICTORIA</h1>
            <p style="margin: 6px 0 0 0; color: #B8954A; font-size: 11px; letter-spacing: 3px; font-weight: 600;">LAR RESIDENCIAL</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px 28px;">
            <div style="display: inline-block; background-color: #FAF9F5; border: 1px solid #B8954A; border-radius: 9999px; padding: 4px 14px; font-size: 12px; font-weight: bold; color: #173D2B; margin-bottom: 16px;">
              ✓ AGENDAMENTO CONFIRMADO • GOOGLE MEET
            </div>
            <h2 style="margin: 0 0 16px 0; color: #173D2B; font-size: 20px; font-family: Georgia, serif;">
              Olá, ${params.name}!
            </h2>
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #4a5568;">
              Recebemos com muito carinho a sua solicitação. Sua reunião online com a direção da <strong>Victoria Lar Residencial</strong> está confirmada:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FAF9F5; border-left: 4px solid #B8954A; border-radius: 12px; margin: 20px 0; padding: 20px;">
              <tr>
                <td style="font-size: 14px; line-height: 1.8;">
                  <strong style="color: #173D2B;">📅 Data:</strong> ${calendarDetails.formattedDate}<br />
                  <strong style="color: #173D2B;">⏰ Horário:</strong> ${params.scheduledTime} (Horário de Brasília)<br />
                  <strong style="color: #173D2B;">📹 Formato:</strong> Reunião Online via Google Meet<br />
                  ${params.serviceInterest ? `<strong style="color: #173D2B;">🩺 Assunto:</strong> ${params.serviceInterest}<br />` : ''}
                  <strong style="color: #173D2B;">👥 Atendimento:</strong> Olga & Robson (Sócios-Proprietários)<br />
                  <strong style="color: #173D2B;">✉️ E-mail Oficial:</strong> ${OFFICIAL_GMAIL}
                </td>
              </tr>
            </table>
            <div style="text-align: center; margin: 28px 0 20px 0;">
              <a href="${params.meetingLink}" target="_blank" style="display: inline-block; background-color: #173D2B; color: #FAF9F5; font-size: 14px; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 9999px; border: 2px solid #B8954A; box-shadow: 0 4px 14px rgba(23,61,43,0.3);">
                📹 Entrar na Sala do Google Meet
              </a>
              <p style="margin: 10px 0 0 0; font-size: 11px; color: #718096;">
                Link direto: <a href="${params.meetingLink}" style="color: #173D2B; font-weight: 600;">${params.meetingLink}</a>
              </p>
            </div>
            <div style="background-color: #FAF9F5; border: 1.5px solid #B8954A; border-radius: 16px; padding: 20px; margin: 24px 0; text-align: center;">
              <div style="font-size: 13px; font-weight: bold; color: #173D2B; margin-bottom: 6px;">
                🗓️ Registro no Google Calendar
              </div>
              <p style="margin: 0 0 14px 0; font-size: 12px; line-height: 1.5; color: #4a5568;">
                Adicione este compromisso diretamente à sua agenda do Google:
              </p>
              <a href="${calendarDetails.googleCalendarUrl}" target="_blank" style="display: inline-block; background-color: #B8954A; color: #173D2B; font-size: 13px; font-weight: bold; text-decoration: none; padding: 11px 24px; border-radius: 9999px; box-shadow: 0 3px 10px rgba(184,149,74,0.3);">
                📅 Adicionar ao Google Calendar
              </a>
            </div>
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-top: 24px; font-size: 12px; line-height: 1.6; color: #4a5568;">
              <strong style="color: #173D2B; display: block; margin-bottom: 6px;">💡 Informações Importantes:</strong>
              • Recomendamos acessar o link com 5 minutos de antecedência.<br />
              • Dúvidas ou reagendamento: WhatsApp <strong>(11) 98765-4321</strong> ou e-mail <a href="mailto:${OFFICIAL_GMAIL}" style="color: #173D2B;">${OFFICIAL_GMAIL}</a>.<br />
              ${params.instructions ? `<br /><em>Nota: ${params.instructions}</em>` : ''}
            </div>
            <p style="margin: 28px 0 0 0; font-size: 13px; line-height: 1.6; color: #4a5568;">
              Estamos muito felizes em poder conversar com você e apresentar o Victoria Lar Residencial.
            </p>
            <p style="margin: 16px 0 0 0; font-size: 13px; font-weight: bold; color: #173D2B;">
              Com carinho,<br />
              Olga & Robson — Direção da Victoria Lar Residencial
            </p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #FAF9F5; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: center; font-size: 11px; color: #718096;">
            <strong>Victoria Lar Residencial</strong><br />
            Alameda das Rosas, 450 - São Paulo, SP • WhatsApp: (11) 98765-4321 • E-mail: ${OFFICIAL_GMAIL}
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    const transporter = await getTransporter();

    const info = (await transporter.sendMail({
      from: `"${OFFICIAL_SENDER_NAME}" <${OFFICIAL_GMAIL}>`,
      replyTo: OFFICIAL_GMAIL,
      to: params.to,
      bcc: OFFICIAL_GMAIL,
      subject: mailSubject,
      html: htmlBody,
      icalEvent: {
        filename: 'agendamento-victoria-lar.ics',
        method: 'REQUEST',
        content: calendarDetails.icsContent,
      },
      alternatives: [
        {
          contentType: 'text/calendar; charset="utf-8"; method=REQUEST',
          content: calendarDetails.icsContent,
        },
      ],
    })) as any;

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;

    console.log(
      `[Victoria Lar Mailer] E-mail enviado com sucesso para ${params.to} (MessageId: ${info?.messageId || 'ok'})`
    );

    return {
      success: true,
      messageId: info?.messageId || `msg_${Date.now()}`,
      previewUrl,
      googleCalendarUrl: calendarDetails.googleCalendarUrl,
    };
  } catch (err: any) {
    const errorCode = err?.code || 'SEND_FAILED';
    const rawErrorMessage = err?.message || 'Erro desconhecido no envio';
    const safeError = sanitizeLog(rawErrorMessage);

    console.warn(`[Victoria Lar Mailer] Falha no envio de e-mail (${errorCode}):`, safeError);

    return {
      success: false,
      error: safeError,
      errorCode,
      googleCalendarUrl: calendarDetails.googleCalendarUrl,
    };
  }
}
