import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { BootstrapRecord, SuperAdminGuard, AdminUser, ServiceItem, InstitutionalContent } from '../types';

export const INITIAL_SERVICES: Omit<ServiceItem, 'updatedBy'>[] = [];


export const INITIAL_INSTITUTIONAL_CONTENT: Record<string, InstitutionalContent> = {
  hero: {
    key: 'hero',
    title: 'Acolhimento, Cuidado Humanizado e Dignidade para a Terceira Idade',
    subtitle: 'No Victoria Lar Residencial, cada detalhe foi concebido para oferecer excelência em saúde, conforto de alto padrão e o calor de uma verdadeira família.',
    phone: '(11) 3456-7890',
    whatsapp: '(11) 98765-4321',
    email: 'contato@victorialar.com.br',
    address: 'Alameda das Rosas, 450 - Jardim das Palmeiras, São Paulo - SP',
    visitingHours: 'Segunda a Domingo: 09h00 às 18h00',
  },
  about: {
    key: 'about',
    title: 'Nossa Vocação é o Cuidado com Amor',
    subtitle: 'Uma história construída sobre respeito à trajetória e à dignidade de cada residente.',
    body: 'O Victoria Lar Residencial nasceu do desejo genuíno de redefinir a experiência de moradia para a terceira idade. Mais do que uma estrutura médica de ponta, oferecemos um ecossistema de afeto, acolhimento integral e valorização contínua da individualidade. Nossa arquitetura favorece a iluminação natural, a convivência e a segurança, enquanto nossa equipe multiprofissional atua com empatia e dedicação.',
  },
  values: {
    key: 'values',
    title: 'Princípios que Guiam Nossas Ações Diárias',
    subtitle: 'Humanização, transparência, segurança clínica e respeito absoluto à vida.',
    body: 'Acreditamos que envelhecer com dignidade é um direito fundamental. Por isso, aliamos rigor científico nas condutas de enfermagem e geriatria a um ambiente sereno e caloroso, onde famílias têm livre acesso e os residentes encontram um novo lar repleto de sorrisos e tranquilidade.',
  },
  owner_1: {
    key: 'owner_1',
    title: 'Olá, sou a Olga.',
    imageCaption: 'Olga',
    role: 'Sócia-Proprietária & Gestora Humanizada',
    tag: 'Atendimento direto, humano e sem intermediários',
    imageUrl: '',
    body: 'Eu sempre gostei de entender como as coisas funcionam — e, principalmente, de descobrir como poderiam funcionar com mais afeto e empatia.\n\nForam mais de 25 anos vivendo a gestão com foco em pessoas, processos e acolhimento humano. Nesse caminho, aprendi a olhar para cada residente em sua singularidade: entender a sua história de vida, acolher a família e transformar o cuidado em um verdadeiro abraço diário.\n\nEstar presente todos os dias no Victoria Lar, acompanhando cada rotina e ouvindo com atenção cada idoso, é a nossa maior realização.',
    quote: 'O Victoria Lar Residencial nasceu daí. Da vontade de usar toda essa experiência para criar um espaço onde o acolhimento humano, a segurança e o carinho aconteçam de verdade, sem intermediários.',
  },
  owner_2: {
    key: 'owner_2',
    title: 'Olá, sou o Robson.',
    imageCaption: 'Robson',
    role: 'Sócio-Proprietário & Diretor de Cuidados',
    tag: 'Presença diária e compromisso com a excelência',
    imageUrl: '',
    body: 'Minha trajetória foi construída na dedicação à saúde integrada, ao bem-estar e ao respeito irrestrito à vida dos nossos idosos.\n\nAo longo de mais de 20 anos na área da saúde e operações assistenciais, vi de perto como uma estrutura acolhedora e uma equipe atenta fazem toda a diferença na longevidade com qualidade.\n\nAqui, cada protocolo médico e cada plano nutricional é acompanhado rigorosamente, mantendo a serenidade das famílias e a vitalidade de quem escolheu viver conosco.',
    quote: 'Cuidar de quem já cuidou tanto de nós é um compromisso sagrado. No Victoria Lar, unimos técnica, dignidade e afeto para que cada residente viva seus melhores dias.',
  },
  scheduling: {
    key: 'scheduling',
    title: 'Agende uma Conversa ou Visita Guiada',
    subtitle: 'Escolha o canal mais prático para você. Atendimento direto com os proprietários e equipe de saúde, sem burocracia.',
    meetingLink: 'https://meet.google.com/vic-tori-lar',
    meetingDuration: '30 a 45 minutos',
    availableHours: '09:00, 10:00, 11:00, 14:00, 15:00, 16:00, 17:00',
    whatsapp: '11987654321',
    whatsappMessage: 'Olá! Gostaria de agendar uma conversa sobre os planos e cuidados da Victoria Lar Residencial.',
    phone: '(11) 3456-7890',
    email: 'contato@victorialar.com.br',
    emailSubject: 'Confirmação de Agendamento - Victoria Lar Residencial',
    emailInstructions: 'Seu agendamento foi registrado com sucesso. Nossa equipe e os diretores estarão conectados no link informado no horário reservado.',
  },
};

/**
 * Checks current bootstrap status safely (queries backend API first to avoid unnecessary direct Firestore exposure)
 */
export async function getBootstrapStatus(): Promise<BootstrapRecord> {
  try {
    const res = await fetch('/api/bootstrap/status');
    if (res.ok) {
      const data = await res.json();
      return {
        status: data.status || (data.initialized ? 'COMPLETED' : 'UNINITIALIZED'),
        lockedPermanently: !!data.lockedPermanently,
      };
    }
  } catch (apiErr) {
    console.warn('[getBootstrapStatus API notice]:', apiErr);
  }

  try {
    const bootstrapRef = doc(db, 'system', 'bootstrap');
    const snap = await getDoc(bootstrapRef);
    if (!snap.exists()) {
      return {
        status: 'UNINITIALIZED',
        lockedPermanently: false,
      };
    }
    return snap.data() as BootstrapRecord;
  } catch (error) {
    return {
      status: 'UNINITIALIZED',
      lockedPermanently: false,
    };
  }
}

/**
 * Executes idempotent, concurrency-safe first superadmin provisioning and seals bootstrap.
 * Uses trusted server-side operation (/api/bootstrap/initiate) with verified cryptographic
 * token, verified email check, and anti-replay guarantees.
 */
export async function executeFirstSuperAdminBootstrap(
  uid: string,
  email: string
): Promise<{ success: boolean; message: string; alreadyInitialized?: boolean }> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const authorizedOwnerEmail = 'victorialarresidencial@gmail.com';

  if (cleanEmail !== authorizedOwnerEmail) {
    throw new Error(`Apenas a conta proprietária oficial (${authorizedOwnerEmail}) tem permissão para provisionar o primeiro superadministrador.`);
  }

  if (!auth.currentUser) {
    throw new Error('Autenticação com o Firebase é obrigatória antes de iniciar o bootstrap.');
  }

  if (!auth.currentUser.emailVerified) {
    throw new Error('A verificação de e-mail é obrigatória pelo Google antes de iniciar o bootstrap.');
  }

  // Retrieve cryptographically signed Firebase ID token with fresh claims
  const idToken = await auth.currentUser.getIdToken(true);

  // 1. Preferred path: Trusted server-side bootstrap endpoint with cryptographic validation
  try {
    const res = await fetch('/api/bootstrap/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ uid, email: cleanEmail, idToken }),
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    } else {
      const errData = await res.json().catch(() => ({}));
      if (errData?.error) {
        throw new Error(errData.error);
      }
      throw new Error(`Falha no bootstrap no servidor (HTTP ${res.status}).`);
    }
  } catch (fetchErr: any) {
    console.warn('[Server bootstrap call error]:', fetchErr?.message || fetchErr);
    throw fetchErr;
  }
}

export const DEFAULT_STRUCTURE_ALBUMS: Record<
  string,
  {
    topicKey: string;
    cardTitle: string;
    cardSummary: string;
    title: string;
    description: string;
  }
> = {
  'quartos-seguros': {
    topicKey: 'quartos-seguros',
    cardTitle: 'Quartos seguros',
    cardSummary: 'Quartos adaptados conforme necessidade do paciente.',
    title: 'Quartos Seguros & Adaptados',
    description:
      'Acomodações acolhedoras com barras de apoio, campainha de emergência, piso antiderrapante, ventilação e iluminação natural para máxima segurança e conforto.',
  },
  'jardins-area-verde': {
    topicKey: 'jardins-area-verde',
    cardTitle: 'Jardins & Area Verde',
    cardSummary: 'Área externa segura e convivência ao ar livre.',
    title: 'Jardins & Área Verde',
    description:
      'Área externa arborizada, segura e com caminhos planos, solário e bancos confortáveis para convivência saudável e contato diário com a natureza.',
  },
  'monitoramento-24h': {
    topicKey: 'monitoramento-24h',
    cardTitle: 'Monitoramento 24h',
    cardSummary: 'Circuito interno de câmeras em áreas comuns e controle rigoroso para tranquilidade de todos.',
    title: 'Monitoramento & Segurança 24h',
    description:
      'Circuito interno de monitoramento em áreas de convivência e controle rigoroso de acesso 24 horas por dia para tranquilidade de todos os residentes e famílias.',
  },
  'salas-de-atividades': {
    topicKey: 'salas-de-atividades',
    cardTitle: 'Salas de Atividades',
    cardSummary: 'Ambientes multifuncionais convivência, música, jogos cognitivos e cinema.',
    title: 'Salas de Atividades & Convivência',
    description:
      'Ambientes multifuncionais projetados para oficinas de estimulação cognitiva, musicoterapia, leitura, artesanato, sessões de cinema e encontros festivos.',
  },
};

/**
 * Seeds initial content and services ONLY during first uninitialized bootstrap.
 * STRICT DATA PRESERVATION INVARIANTS:
 * 1. If system/bootstrap is already COMPLETED or lockedPermanently, seeding is completely aborted.
 * 2. If a collection already has any documents, seeding does NOT run for that collection.
 * 3. Read failures or network errors are NEVER interpreted as an empty database.
 * 4. Never resurrects items deleted by an administrator.
 */
export async function seedInitialContentIfEmpty(): Promise<void> {
  try {
    // Invariant 1: Check if system bootstrap was already sealed
    const bootstrapRef = doc(db, 'system', 'bootstrap');
    const bootstrapSnap = await getDoc(bootstrapRef);
    if (bootstrapSnap.exists()) {
      const bData = bootstrapSnap.data() as BootstrapRecord;
      if (bData.status === 'COMPLETED' || bData.lockedPermanently) {
        // System is already initialized; do not run automatic seeds or recreate deleted records
        return;
      }
    }

    // Invariant 2: Check content collection. If hero exists, data is already populated.
    // Strictly refuse to seed or overwrite any administrative content or albums!
    const heroRef = doc(db, 'content', 'hero');
    const heroSnap = await getDoc(heroRef);
    if (heroSnap.exists()) {
      return;
    }

    // Only seed default content on an entirely empty /content collection
    for (const [key, content] of Object.entries(INITIAL_INSTITUTIONAL_CONTENT)) {
      const contentRef = doc(db, 'content', key);
      const snap = await getDoc(contentRef);
      if (!snap.exists()) {
        await setDoc(contentRef, {
          ...content,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // Invariant 3: Services are strictly inserted by the ADM through the Admin Panel.
    // No demo/test services are automatically seeded.

    // Invariant 4: Seed structure albums metadata into /content/album_{albumId} only during initial empty seed
    for (const [albumId, albumData] of Object.entries(DEFAULT_STRUCTURE_ALBUMS)) {
      const albumContentRef = doc(db, 'content', `album_${albumId}`);
      const snap = await getDoc(albumContentRef);
      if (!snap.exists()) {
        await setDoc(albumContentRef, {
          key: `album_${albumId}`,
          title: albumData.title,
          subtitle: albumData.description,
          body: '[]',
          updatedAt: new Date().toISOString(),
          updatedBy: 'system',
        });
      }
    }
  } catch (err) {
    // Read failures or network errors MUST NOT cause any blind fallback seeding
    console.warn('[Seed Content Safe Guard - Seeding aborted to preserve data integrity]:', err);
  }
}
