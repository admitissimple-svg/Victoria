/**
 * Helper para validação, detecção e resolução segura de URLs de mídia (fotos e vídeos)
 * Suporta:
 * - Imagens diretas (JPG, PNG, WebP, SVG, AVIF, Firebase Storage, Google Cloud Storage, data:image base64)
 * - Google Drive (fotos via thumbnail/lh3 e vídeos via /preview com aviso de compartilhamento público)
 * - YouTube (links comuns, youtu.be, shorts, embed)
 * - Vimeo (vimeo.com, player.vimeo.com)
 * - Vídeos diretos HTML5 (MP4, WebM, OGG, MOV, M4V)
 */

export type MediaType = 'image' | 'video';

export type MediaProvider =
  | 'youtube'
  | 'vimeo'
  | 'google-drive'
  | 'direct-video'
  | 'direct-image'
  | 'unknown';

export interface ParsedMedia {
  isValid: boolean;
  rawUrl: string;
  mediaType: MediaType;
  provider: MediaProvider;
  providerLabel: string;
  embedUrl?: string;
  streamUrl?: string;
  directUrl: string;
  thumbnailUrl?: string;
  fallbackThumbnailUrl?: string;
  isDirectVideo?: boolean;
  isVertical?: boolean;
  aspectRatio?: '16/9' | '9/16' | 'auto';
  warning?: string;
  errorMessage?: string;
}

export interface ParsedPhoto {
  isValid: boolean;
  rawUrl: string;
  provider: MediaProvider;
  providerLabel: string;
  displayUrl: string;
  fallbackUrl?: string;
  thumbnailUrl?: string;
  fileId?: string;
  warning?: string;
  errorMessage?: string;
}

const YOUTUBE_REGEXES = [
  /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
];

const VIMEO_REGEX = /(?:vimeo\.com\/(?:video\/|channels\/(?:\w+\/)?|groups\/[^\/]+\/videos\/|album\/(?:\d+)\/video\/|))(\d+)/i;

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.m4v'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.avif', '.bmp'];

/**
 * Extrai o ID do arquivo do Google Drive de diversos formatos de links de compartilhamento
 */
export function extractGoogleDriveFileId(inputUrl: string): string | null {
  if (!inputUrl) return null;
  const trimmed = inputUrl.trim();

  // Rejeita links de pasta (folders)
  if (trimmed.includes('/drive/folders/') || trimmed.includes('/folders/')) {
    return null;
  }

  // 1. Formato padrão: drive.google.com/file/d/{id} ou docs.google.com/file/d/{id}
  const fileDMatch = trimmed.match(/(?:drive|docs)\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  // 2. Formato Google CDN: googleusercontent.com/d/{id}
  const lh3Match = trimmed.match(/(?:googleusercontent\.com|lh\d+\.googleusercontent\.com)\/d\/([a-zA-Z0-9_-]+)/i);
  if (lh3Match && lh3Match[1]) return lh3Match[1];

  // 3. Formatos com query param: ?id={id} ou &id={id} em drive.google.com / docs.google.com (uc, open, thumbnail)
  if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
    const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (idParamMatch && idParamMatch[1]) return idParamMatch[1];
  }

  return null;
}

/**
 * Verifica se a URL aponta diretamente para um arquivo de vídeo suportado
 */
export function isDirectVideoUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.trim());
    const pathname = parsed.pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Verifica se a URL aponta diretamente para um arquivo de imagem suportado ou upload local
 */
export function isDirectImageUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.toLowerCase().startsWith('data:image/')) return true;

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.includes('firebasestorage.googleapis.com') || hostname.includes('storage.googleapis.com')) {
      return true;
    }
    return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Retorna uma URL segura de incorporação (YouTube/Vimeo/Google Drive) ou null
 */
export function getSafeEmbedUrl(url: string): string | null {
  const parsed = parseMediaUrl(url, 'video');
  return parsed.isValid && parsed.embedUrl ? parsed.embedUrl : null;
}

/**
 * Analisa e valida uma URL de mídia (álbuns), detectando provedor e formato adequado de exibição.
 */
export function parseMediaUrl(inputUrl: string, manualType?: MediaType): ParsedMedia {
  const trimmed = (inputUrl || '').trim();

  if (!trimmed) {
    return {
      isValid: false,
      rawUrl: '',
      mediaType: manualType || 'image',
      provider: 'unknown',
      providerLabel: 'Desconhecido',
      embedUrl: undefined,
      streamUrl: undefined,
      directUrl: '',
      errorMessage: 'Por favor, informe a URL da foto ou vídeo.',
    };
  }

  const lower = trimmed.toLowerCase();

  // Upload local de imagem via data:image/ (permitido e seguro)
  if (lower.startsWith('data:image/')) {
    return {
      isValid: true,
      rawUrl: trimmed,
      mediaType: 'image',
      provider: 'direct-image',
      providerLabel: 'Upload Direto (Imagem)',
      embedUrl: undefined,
      streamUrl: trimmed,
      directUrl: trimmed,
      thumbnailUrl: trimmed,
      isDirectVideo: false,
    };
  }

  // Previne injeção de esquemas inseguros (javascript:, data: não-imagem, vbscript:)
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return {
      isValid: false,
      rawUrl: trimmed,
      mediaType: manualType || 'image',
      provider: 'unknown',
      providerLabel: 'Inseguro',
      directUrl: '',
      errorMessage: 'Protocolo não permitido por razões de segurança.',
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      rawUrl: trimmed,
      mediaType: manualType || 'image',
      provider: 'unknown',
      providerLabel: 'URL Inválida',
      directUrl: '',
      errorMessage: 'URL inválida. Certifique-se de incluir "https://" no início do endereço.',
    };
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return {
      isValid: false,
      rawUrl: trimmed,
      mediaType: manualType || 'image',
      provider: 'unknown',
      providerLabel: 'Protocolo Não Suportado',
      directUrl: '',
      errorMessage: 'Protocolo não suportado. Apenas URLs com "https://" são aceitas.',
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const pathname = parsedUrl.pathname.toLowerCase();

  // 1. YouTube
  for (const regex of YOUTUBE_REGEXES) {
    const match = trimmed.match(regex);
    if (match && match[1]) {
      const videoId = match[1];
      const isShorts = trimmed.toLowerCase().includes('/shorts/');
      const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      return {
        isValid: true,
        rawUrl: trimmed,
        mediaType: 'video',
        provider: 'youtube',
        providerLabel: isShorts ? 'YouTube Shorts (Vídeo Vertical)' : 'YouTube',
        embedUrl,
        streamUrl: embedUrl,
        directUrl: trimmed,
        thumbnailUrl,
        isDirectVideo: false,
        isVertical: isShorts,
        aspectRatio: isShorts ? '9/16' : '16/9',
        warning:
          manualType === 'image'
            ? 'Este link é de um vídeo do YouTube. O tipo foi ajustado automaticamente para "Vídeo".'
            : undefined,
      };
    }
  }

  // 2. Vimeo
  const vimeoMatch = trimmed.match(VIMEO_REGEX);
  if (vimeoMatch && vimeoMatch[1]) {
    const videoId = vimeoMatch[1];
    const embedUrl = `https://player.vimeo.com/video/${videoId}`;
    return {
      isValid: true,
      rawUrl: trimmed,
      mediaType: 'video',
      provider: 'vimeo',
      providerLabel: 'Vimeo',
      embedUrl,
      streamUrl: embedUrl,
      directUrl: trimmed,
      isDirectVideo: false,
      isVertical: false,
      aspectRatio: '16/9',
      warning:
        manualType === 'image'
          ? 'Este link é de um vídeo do Vimeo. O tipo foi ajustado para "Vídeo".'
          : undefined,
    };
  }

  // 3. Google Drive
  const driveFileId = extractGoogleDriveFileId(trimmed);
  if (driveFileId) {
    const isVideo = manualType === 'video';

    if (isVideo) {
      return {
        isValid: true,
        rawUrl: trimmed,
        mediaType: 'video',
        provider: 'google-drive',
        providerLabel: 'Google Drive (Vídeo)',
        embedUrl: `https://drive.google.com/file/d/${driveFileId}/preview`,
        streamUrl: `https://drive.google.com/file/d/${driveFileId}/preview`,
        directUrl: trimmed,
        thumbnailUrl: `https://lh3.googleusercontent.com/d/${driveFileId}=w600`,
        fallbackThumbnailUrl: `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w600`,
        isDirectVideo: false,
        isVertical: false,
        aspectRatio: '16/9',
        warning:
          'Atenção ao Google Drive: Certifique-se de que o arquivo esteja compartilhado publicamente ("Qualquer pessoa com o link pode ver").',
      };
    }

    // Imagem do Google Drive: usa serviço direto lh3 e thumbnail de alta resolução (SEM embedUrl em tag img)
    return {
      isValid: true,
      rawUrl: trimmed,
      mediaType: 'image',
      provider: 'google-drive',
      providerLabel: 'Google Drive (Foto)',
      embedUrl: undefined, // Imagens não devem usar preview de iframe HTML
      streamUrl: `https://lh3.googleusercontent.com/d/${driveFileId}=w1600`,
      directUrl: `https://lh3.googleusercontent.com/d/${driveFileId}=w1600`,
      thumbnailUrl: `https://lh3.googleusercontent.com/d/${driveFileId}=w600`,
      fallbackThumbnailUrl: `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1600`,
      isDirectVideo: false,
      warning:
        'Atenção ao Google Drive: O arquivo precisa estar configurado como público ("Qualquer pessoa com o link pode ver") para ser exibido aos visitantes.',
    };
  }

  // 4. Arquivos de Vídeo Diretos (HTML5)
  const isVideoFile = VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  if (isVideoFile || manualType === 'video') {
    return {
      isValid: true,
      rawUrl: trimmed,
      mediaType: 'video',
      provider: isVideoFile ? 'direct-video' : 'unknown',
      providerLabel: isVideoFile ? 'Vídeo Direto (HTML5)' : 'Vídeo Externo',
      embedUrl: undefined,
      streamUrl: trimmed,
      directUrl: trimmed,
      isDirectVideo: true,
      aspectRatio: 'auto',
      warning:
        'Vídeo direto: O servidor de hospedagem precisa permitir reprodução externa e requisições CORS.',
    };
  }

  // 5. Arquivos de Imagem Diretos / Firebase Storage
  const isImageFile = IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  const isFirebaseStorage =
    hostname.includes('firebasestorage.googleapis.com') ||
    hostname.includes('storage.googleapis.com');

  if (isImageFile || isFirebaseStorage || manualType === 'image') {
    return {
      isValid: true,
      rawUrl: trimmed,
      mediaType: 'image',
      provider: isFirebaseStorage ? 'direct-image' : isImageFile ? 'direct-image' : 'unknown',
      providerLabel: isFirebaseStorage ? 'Firebase Storage' : isImageFile ? 'Imagem Direta' : 'Imagem Externa',
      embedUrl: undefined,
      streamUrl: trimmed,
      directUrl: trimmed,
      thumbnailUrl: trimmed,
      isDirectVideo: false,
    };
  }

  // 6. Provedores não recomendados (redes sociais genéricas sem entrega de arquivo)
  if (
    hostname.includes('facebook.com') ||
    hostname.includes('instagram.com') ||
    hostname.includes('tiktok.com') ||
    hostname.includes('twitter.com') ||
    hostname.includes('x.com')
  ) {
    return {
      isValid: false,
      rawUrl: trimmed,
      mediaType: manualType || 'image',
      provider: 'unknown',
      providerLabel: 'Rede Social',
      embedUrl: undefined,
      streamUrl: undefined,
      directUrl: '',
      isDirectVideo: false,
      errorMessage:
        'Páginas de redes sociais não entregam o arquivo de foto ou vídeo diretamente. Use YouTube, Vimeo, Google Drive ou link direto.',
    };
  }

  // Fallback permissivo para URLs HTTPS genéricas: assume o tipo selecionado ou 'image'
  return {
    isValid: true,
    rawUrl: trimmed,
    mediaType: manualType || 'image',
    provider: 'unknown',
    providerLabel: manualType === 'video' ? 'Vídeo Web' : 'Imagem Web',
    embedUrl: manualType === 'video' ? trimmed : undefined,
    streamUrl: trimmed,
    directUrl: trimmed,
    thumbnailUrl: trimmed,
    isDirectVideo: manualType === 'video',
    aspectRatio: manualType === 'video' ? 'auto' : undefined,
    warning:
      'Link externo genérico: Verifique se o endereço entrega o arquivo de mídia diretamente aos navegadores.',
  };
}

/**
 * Validador e normalizador exclusivo para seções fotográficas institucionais
 * (Hero / Capa e Sócios Proprietários).
 * Rejeita vídeos e normaliza links do Google Drive e imagens diretas.
 */
export function parsePhotoUrl(inputUrl: string): ParsedPhoto {
  const trimmed = (inputUrl || '').trim();

  if (!trimmed) {
    return {
      isValid: false,
      rawUrl: '',
      provider: 'unknown',
      providerLabel: 'Vazio',
      displayUrl: '',
      errorMessage: 'Por favor, informe a URL da foto.',
    };
  }

  const lower = trimmed.toLowerCase();

  // Upload local de imagem via data:image/ (permitido para upload do PC/celular)
  if (lower.startsWith('data:image/')) {
    return {
      isValid: true,
      rawUrl: trimmed,
      provider: 'direct-image',
      providerLabel: 'Upload Direto (Imagem)',
      displayUrl: trimmed,
      thumbnailUrl: trimmed,
    };
  }

  // Previne injeção de esquemas inseguros
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return {
      isValid: false,
      rawUrl: trimmed,
      provider: 'unknown',
      providerLabel: 'Inseguro',
      displayUrl: '',
      errorMessage: 'Protocolo não permitido por razões de segurança.',
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      rawUrl: trimmed,
      provider: 'unknown',
      providerLabel: 'URL Inválida',
      displayUrl: '',
      errorMessage: 'URL inválida. Certifique-se de incluir "https://" no início do endereço.',
    };
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return {
      isValid: false,
      rawUrl: trimmed,
      provider: 'unknown',
      providerLabel: 'Protocolo Não Suportado',
      displayUrl: '',
      errorMessage: 'Apenas endereços com protocolo seguro "https://" são aceitos.',
    };
  }

  // Bloqueio rigoroso de links de vídeo em seções fotográficas
  for (const regex of YOUTUBE_REGEXES) {
    if (trimmed.match(regex)) {
      return {
        isValid: false,
        rawUrl: trimmed,
        provider: 'youtube',
        providerLabel: 'YouTube (Vídeo Não Aceito)',
        displayUrl: '',
        errorMessage: 'Esta seção aceita exclusivamente fotografias. Links de vídeo do YouTube não são suportados aqui.',
      };
    }
  }

  if (trimmed.match(VIMEO_REGEX)) {
    return {
      isValid: false,
      rawUrl: trimmed,
      provider: 'vimeo',
      providerLabel: 'Vimeo (Vídeo Não Aceito)',
      displayUrl: '',
      errorMessage: 'Esta seção aceita exclusivamente fotografias. Links de vídeo do Vimeo não são suportados aqui.',
    };
  }

  if (isDirectVideoUrl(trimmed)) {
    return {
      isValid: false,
      rawUrl: trimmed,
      provider: 'direct-video',
      providerLabel: 'Arquivo de Vídeo',
      displayUrl: '',
      errorMessage: 'Esta seção aceita exclusivamente fotografias (JPG, PNG ou WebP). Arquivos de vídeo não são aceitos.',
    };
  }

  // Detecção de link de pasta do Google Drive
  if (
    parsedUrl.hostname.toLowerCase().includes('drive.google.com') &&
    (parsedUrl.pathname.toLowerCase().includes('/folders/') || trimmed.includes('/drive/folders/'))
  ) {
    return {
      isValid: false,
      rawUrl: trimmed,
      provider: 'google-drive',
      providerLabel: 'Pasta do Google Drive',
      displayUrl: '',
      errorMessage: 'O link informado é de uma pasta do Google Drive. Abra a fotografia individualmente e copie o seu link com permissão pública.',
    };
  }

  // Detecção e normalização do ID do Google Drive
  const fileId = extractGoogleDriveFileId(trimmed);
  if (fileId) {
    return {
      isValid: true,
      rawUrl: trimmed,
      provider: 'google-drive',
      providerLabel: 'Google Drive (Foto)',
      fileId,
      displayUrl: `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
      fallbackUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
      thumbnailUrl: `https://lh3.googleusercontent.com/d/${fileId}=w600`,
      warning:
        'Atenção ao Google Drive: O arquivo precisa estar configurado com acesso público ("Qualquer pessoa com o link pode ver") para ser exibido aos visitantes.',
    };
  }

  // Imagens diretas / Firebase Storage
  const isImageFile = IMAGE_EXTENSIONS.some((ext) => parsedUrl.pathname.toLowerCase().endsWith(ext));
  const isFirebaseStorage =
    parsedUrl.hostname.toLowerCase().includes('firebasestorage.googleapis.com') ||
    parsedUrl.hostname.toLowerCase().includes('storage.googleapis.com');

  if (isImageFile || isFirebaseStorage) {
    return {
      isValid: true,
      rawUrl: trimmed,
      provider: isFirebaseStorage ? 'direct-image' : 'direct-image',
      providerLabel: isFirebaseStorage ? 'Firebase Storage' : 'Imagem Direta',
      displayUrl: trimmed,
      thumbnailUrl: trimmed,
    };
  }

  // Redes sociais incompatíveis
  if (
    parsedUrl.hostname.toLowerCase().includes('facebook.com') ||
    parsedUrl.hostname.toLowerCase().includes('instagram.com') ||
    parsedUrl.hostname.toLowerCase().includes('tiktok.com') ||
    parsedUrl.hostname.toLowerCase().includes('twitter.com') ||
    parsedUrl.hostname.toLowerCase().includes('x.com')
  ) {
    return {
      isValid: false,
      rawUrl: trimmed,
      provider: 'unknown',
      providerLabel: 'Rede Social',
      displayUrl: '',
      errorMessage:
        'Páginas de redes sociais não entregam o arquivo de imagem diretamente. Utilize links públicos do Google Drive ou imagens diretas (JPG, PNG ou WebP).',
    };
  }

  // URL HTTPS genérica
  return {
    isValid: true,
    rawUrl: trimmed,
    provider: 'unknown',
    providerLabel: 'Imagem Web',
    displayUrl: trimmed,
    thumbnailUrl: trimmed,
    warning:
      'Link externo: Verifique se o endereço entrega o arquivo de foto diretamente aos navegadores.',
  };
}

/**
 * Retorna o endereço otimizado para exibição (incorporação ou imagem direta)
 */
export function resolveMediaDisplayUrl(url: string, mediaType?: MediaType): {
  type: MediaType;
  displayUrl: string;
  fallbackUrl?: string;
  provider: MediaProvider;
  thumbnailUrl?: string;
  fallbackThumbnailUrl?: string;
  isDirectVideo?: boolean;
  isVertical?: boolean;
  aspectRatio?: '16/9' | '9/16' | 'auto';
  isValid: boolean;
  warning?: string;
  errorMessage?: string;
} {
  const parsed = parseMediaUrl(url, mediaType);
  const displayUrl =
    parsed.mediaType === 'video'
      ? parsed.embedUrl || parsed.streamUrl || parsed.directUrl || url
      : parsed.streamUrl || parsed.directUrl || url;
  return {
    type: parsed.mediaType,
    displayUrl,
    fallbackUrl: parsed.fallbackThumbnailUrl,
    provider: parsed.provider,
    thumbnailUrl: parsed.thumbnailUrl,
    fallbackThumbnailUrl: parsed.fallbackThumbnailUrl,
    isDirectVideo: parsed.isDirectVideo,
    isVertical: parsed.isVertical,
    aspectRatio: parsed.aspectRatio,
    isValid: parsed.isValid,
    warning: parsed.warning,
    errorMessage: parsed.errorMessage,
  };
}

/**
 * Helper para resolver a URL de exibição de fotos institucionais (Hero e Sócios)
 */
export function resolvePhotoDisplayUrl(url: string): ParsedPhoto {
  return parsePhotoUrl(url);
}
