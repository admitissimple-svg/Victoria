/**
 * Test Suite: Victoria Lar Residencial — Mailer & SMTP Connection Auditing
 *
 * Verifies all 7 mandatory technical requirements:
 * 1. Envio SMTP bem-sucedido
 * 2. Timeout de conexão (ETIMEDOUT / CONN)
 * 3. Falha de autenticação SMTP (EAUTH)
 * 4. Reunião salva mesmo com falha no envio de e-mail
 * 5. Resposta da API sem falso emailSent: true
 * 6. Ausência de duplicação do agendamento em caso de falha
 * 7. Ausência rigorosa de credenciais nos logs e erros
 * 8. Compatibilidade de portas e TLS (587 STARTTLS vs 465 Implicit TLS)
 */

process.env.NODE_ENV = 'test';

import {
  buildSmtpConfig,
  sanitizeLog,
  setMockTransporter,
  resetTransporter,
  sendMeetingConfirmationEmail,
  buildCalendarDetails,
  OFFICIAL_GMAIL,
} from '../server/mailer';
import { app, bookedAppointments } from '../server';

interface MockSendMailInfo {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}: ${detail || 'Assertion failed'}`);
    failed++;
  }
}

async function runMailerTests() {
  console.log('================================================================');
  console.log('STARTING VICTORIA LAR MAILER & RENDER SMTP TEST SUITE');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // TEST SUITE 1: Port & TLS Compatibility Verification
  // -------------------------------------------------------------
  console.log('--- Test Suite 1: Port, TLS & Render Egress Compatibility ---');

  // 1.1: Misconfigured Port 587 with secure=true (The classic ETIMEDOUT cause)
  const conf587 = buildSmtpConfig({
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'true', // Incompatible! Port 587 is STARTTLS
    SMTP_USER: 'victorialarresidencial@gmail.com',
    SMTP_PASS: 'testpass123',
  });
  assert(
    conf587.port === 587 && conf587.secure === false && conf587.requireTLS === true,
    'Port 587 auto-corrects secure to false (STARTTLS) to prevent connection hang'
  );

  // 1.2: Misconfigured Port 465 with secure=false
  const conf465 = buildSmtpConfig({
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '465',
    SMTP_SECURE: 'false', // Incompatible! Port 465 is implicit TLS
    SMTP_USER: 'victorialarresidencial@gmail.com',
    SMTP_PASS: 'testpass123',
  });
  assert(
    conf465.port === 465 && conf465.secure === true,
    'Port 465 auto-corrects secure to true (Implicit TLS) to prevent handshake stall'
  );

  // 1.3: Default Gmail host resolution on Render (defaults to port 465 with TLS)
  const confGmailDefault = buildSmtpConfig({
    GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
  });
  assert(
    confGmailDefault.host === 'smtp.gmail.com' &&
      confGmailDefault.port === 465 &&
      confGmailDefault.secure === true,
    'Default Gmail setup resolves to port 465 with implicit TLS (optimal for Render)'
  );

  // 1.4: Configurable timeouts with resilient cloud container defaults (10s/15s)
  const confTimeouts = buildSmtpConfig({
    SMTP_HOST: 'smtp.sendgrid.net',
    SMTP_PORT: '587',
    SMTP_CONNECTION_TIMEOUT: '12000',
    SMTP_GREETING_TIMEOUT: '11000',
    SMTP_SOCKET_TIMEOUT: '20000',
    SMTP_PASS: 'sg_key_123',
  });
  assert(
    confTimeouts.connectionTimeout === 12000 &&
      confTimeouts.greetingTimeout === 11000 &&
      confTimeouts.socketTimeout === 20000,
    'Timeouts are fully configurable via env vars with sensible cloud container defaults'
  );

  // -------------------------------------------------------------
  // TEST SUITE 2: Envio SMTP bem-sucedido
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 2: Envio SMTP Bem-Sucedido ---');

  const mockSuccessTransporter = {
    sendMail: async (opts: any): Promise<MockSendMailInfo> => {
      return {
        messageId: `<msg_success_${Date.now()}@victorialar.com.br>`,
        accepted: [opts.to],
        rejected: [],
        response: '250 2.0.0 OK message queued',
      };
    },
    verify: async () => true,
  } as any;

  setMockTransporter(mockSuccessTransporter);

  const successResult = await sendMeetingConfirmationEmail({
    to: 'familia.silva@exemplo.com.br',
    name: 'Carlos Silva',
    scheduledDate: '2026-11-10',
    scheduledTime: '14:00',
    meetingLink: 'https://meet.google.com/vic-tori-lar',
    serviceInterest: 'Acomodação Individual e Cuidados',
  });

  assert(
    successResult.success === true,
    'Envio SMTP bem-sucedido retorna success: true'
  );
  assert(
    typeof successResult.messageId === 'string' && successResult.messageId.startsWith('<msg_success_'),
    'Envio SMTP bem-sucedido fornece messageId válido retornado pelo servidor'
  );
  assert(
    typeof successResult.googleCalendarUrl === 'string' &&
      successResult.googleCalendarUrl.includes('calendar.google.com'),
    'Link para adicionar ao Google Calendar é gerado corretamente'
  );

  // -------------------------------------------------------------
  // TEST SUITE 3: Timeout de Conexão (ETIMEDOUT / CONN)
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 3: Simulação de Timeout de Conexão (ETIMEDOUT / CONN) ---');

  const mockTimeoutTransporter = {
    sendMail: async (): Promise<never> => {
      const timeoutError: any = new Error('Connection timeout');
      timeoutError.code = 'ETIMEDOUT';
      timeoutError.command = 'CONN';
      throw timeoutError;
    },
    verify: async (): Promise<never> => {
      const timeoutError: any = new Error('Connection timeout');
      timeoutError.code = 'ETIMEDOUT';
      timeoutError.command = 'CONN';
      throw timeoutError;
    },
  } as any;

  setMockTransporter(mockTimeoutTransporter);

  const timeoutResult = await sendMeetingConfirmationEmail({
    to: 'cliente.timeout@exemplo.com.br',
    name: 'Mariana Costa',
    scheduledDate: '2026-11-12',
    scheduledTime: '10:00',
    meetingLink: 'https://meet.google.com/vic-tori-lar',
  });

  assert(
    timeoutResult.success === false,
    'Timeout de conexão retorna estritamente success: false'
  );
  assert(
    timeoutResult.errorCode === 'ETIMEDOUT',
    'Código de erro ETIMEDOUT capturado e exposto sem crash'
  );
  assert(
    typeof timeoutResult.error === 'string' && timeoutResult.error.includes('Connection timeout'),
    'Mensagem de erro segura informada'
  );
  assert(
    typeof timeoutResult.googleCalendarUrl === 'string',
    'Google Calendar URL preservada mesmo quando o envio SMTP sofre timeout'
  );

  // -------------------------------------------------------------
  // TEST SUITE 4: Falha de Autenticação SMTP (EAUTH)
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 4: Falha de Autenticação SMTP (EAUTH) ---');

  const mockAuthFailTransporter = {
    sendMail: async (): Promise<never> => {
      const authError: any = new Error(
        'Invalid login: 535-5.7.8 Username and Password not accepted with password=super_secret_value'
      );
      authError.code = 'EAUTH';
      authError.command = 'AUTH PLAIN';
      throw authError;
    },
  } as any;

  setMockTransporter(mockAuthFailTransporter);

  const authFailResult = await sendMeetingConfirmationEmail({
    to: 'cliente.auth@exemplo.com.br',
    name: 'Roberto Souza',
    scheduledDate: '2026-11-15',
    scheduledTime: '15:00',
    meetingLink: 'https://meet.google.com/vic-tori-lar',
  });

  assert(
    authFailResult.success === false,
    'Falha de autenticação SMTP retorna success: false'
  );
  assert(
    authFailResult.errorCode === 'EAUTH',
    'Código de erro EAUTH registrado corretamente'
  );
  assert(
    !authFailResult.error?.includes('super_secret_value'),
    'Senhas e credenciais foram sanitizadas e NÃO aparecem no erro de autenticação'
  );

  // -------------------------------------------------------------
  // TEST SUITE 5: Reunião Salva com Falha no Envio + Sem Falso emailSent
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 5: Reunião Salva com Falha de Envio (Sem falso emailSent: true) ---');

  // Configuramos o transporte em timeout
  setMockTransporter(mockTimeoutTransporter);

  // Simula requisição express para /api/schedule-meeting
  const mockReq: any = {
    body: {
      name: 'Helena Ribeiro',
      email: 'helena.ribeiro@exemplo.com.br',
      phone: '(11) 98765-4321',
      scheduledDate: '2026-11-20',
      scheduledTime: '11:00',
      relationship: 'Filha',
      serviceInterest: 'Plano Residencial Completo',
    },
  };

  let responseStatus = 0;
  let responseBody: any = null;

  const mockRes: any = {
    status: (code: number) => {
      responseStatus = code;
      return mockRes;
    },
    json: (data: any) => {
      responseBody = data;
      return mockRes;
    },
  };

  // Executa o handler da rota POST /api/schedule-meeting
  const scheduleHandler = (app as any)._router.stack
    .filter((layer: any) => layer.route && layer.route.path === '/api/schedule-meeting')
    .map((layer: any) => layer.route.stack[0].handle)[0];

  assert(typeof scheduleHandler === 'function', 'Rota POST /api/schedule-meeting registrada no Express');

  await scheduleHandler(mockReq, mockRes);

  assert(
    responseStatus === 201,
    'API retorna HTTP 201 Created confirmando o agendamento da reunião mesmo se o e-mail falhar'
  );
  assert(
    responseBody?.success === true && responseBody?.appointmentScheduled === true,
    'appointmentScheduled é true indicando que a reunião foi cadastrada com sucesso'
  );
  assert(
    responseBody?.emailSent === false,
    'CRÍTICO: emailSent é estritamente FALSE (zero falso positivo quando o SMTP falha)'
  );
  assert(
    responseBody?.emailError !== null && typeof responseBody?.emailError === 'string',
    'emailError informa o motivo seguro do insucesso no envio'
  );
  assert(
    responseBody?.message &&
      responseBody.message.includes('Não foi possível despachar o e-mail de confirmação automaticamente'),
    'Mensagem apresentada ao cliente informa com transparência que o e-mail falhou, mas a reunião está garantida'
  );
  assert(
    responseBody?.meetingLink && responseBody?.googleCalendarUrl,
    'Links do Meet e do Google Calendar são disponibilizados na resposta'
  );

  // -------------------------------------------------------------
  // TEST SUITE 6: Ausência de Duplicação do Agendamento em Caso de Falha
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 6: Ausência de Duplicação de Agendamento ---');

  const initialBookedCount = bookedAppointments.filter(
    (a) => a.date === '2026-11-20' && a.time === '11:00'
  ).length;

  assert(
    initialBookedCount === 1,
    'Horário 2026-11-20 11:00 está devidamente registrado no servidor'
  );

  // Tenta agendar o mesmo horário novamente (repetição por re-tentativa)
  await scheduleHandler(mockReq, mockRes);

  const updatedBookedCount = bookedAppointments.filter(
    (a) => a.date === '2026-11-20' && a.time === '11:00'
  ).length;

  assert(
    updatedBookedCount === 1,
    'Re-tentativa de agendamento não duplica o horário no array bookedAppointments'
  );

  // -------------------------------------------------------------
  // TEST SUITE 7: Ausência Rigorosa de Credenciais nos Logs
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 7: Ausência Rigorosa de Credenciais nos Logs ---');

  const testPayloadWithSecrets = {
    host: 'smtp.gmail.com',
    port: 465,
    user: 'victorialarresidencial@gmail.com',
    pass: 'ultra_secret_app_password_123',
    auth: {
      password: 'inner_password_secret',
      token: 'bearer_token_xyz',
    },
    headers: {
      authorization: 'Bearer secret_access_token_abc',
    },
    message: 'Failed command AUTH PLAIN with password=leak_attempt',
  };

  const sanitized = sanitizeLog(testPayloadWithSecrets);

  assert(
    sanitized.pass === '[REDACTED]',
    'Campo pass é mascarado como [REDACTED]'
  );
  assert(
    sanitized.auth.password === '[REDACTED]',
    'Campo aninhado password é mascarado como [REDACTED]'
  );
  assert(
    sanitized.auth.token === '[REDACTED]',
    'Tokens de autenticação são mascarados como [REDACTED]'
  );
  assert(
    sanitized.headers.authorization === '[REDACTED]',
    'Headers com authorization são mascarados como [REDACTED]'
  );
  assert(
    !JSON.stringify(sanitized).includes('ultra_secret_app_password_123'),
    'Nenhum segredo literal sobrevive na saída do sanitizador de logs'
  );
  assert(
    !JSON.stringify(sanitized).includes('leak_attempt'),
    'Strings com pattern password=... dentro de mensagens de erro são redigidas'
  );

  // -------------------------------------------------------------
  // TEST SUITE 8: Resposta da API com Envio Bem-sucedido
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 8: Resposta da API com Envio Bem-sucedido ---');

  setMockTransporter(mockSuccessTransporter);

  const mockSuccessReq: any = {
    body: {
      name: 'Beatriz Almeida',
      email: 'beatriz.almeida@exemplo.com.br',
      phone: '(11) 97654-3210',
      scheduledDate: '2026-11-25',
      scheduledTime: '16:00',
      relationship: 'Esposa',
      serviceInterest: 'Cuidados Multidisciplinares 24h',
    },
  };

  await scheduleHandler(mockSuccessReq, mockRes);

  assert(
    responseStatus === 201,
    'API retorna HTTP 201 Created'
  );
  assert(
    responseBody?.emailSent === true,
    'Quando o Nodemailer confirma o envio, emailSent é estritamente TRUE'
  );
  assert(
    responseBody?.emailError === null,
    'emailError é null quando o e-mail foi entregue com êxito'
  );
  assert(
    responseBody?.sender === OFFICIAL_GMAIL,
    'Remetente oficial victorialarresidencial@gmail.com retornado corretamente'
  );
  assert(
    responseBody?.message.includes('Um e-mail de confirmação com a sala do Google Meet'),
    'Mensagem de confirmação de envio exibida com precisão'
  );

  // Cleanup
  resetTransporter();

  console.log('\n================================================================');
  console.log(`MAILER TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMailerTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
