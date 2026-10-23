import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Home,
  Sun,
  Shield,
  Users,
  Sparkles,
  Camera,
  Eye,
  EyeOff,
  Video,
  Play,
  AlertTriangle,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';
import { VictoriaEmblem } from './VictoriaLogo';
import { StructurePhoto, StructureAlbum, STRUCTURE_TOPICS } from '../types';
import { getAlbum, getPublishedPhotos, getAllPhotosForAdmin } from '../services/firestoreService';
import { resolveMediaDisplayUrl, parseMediaUrl } from '../utils/mediaUrlHelper';

interface StructureGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string | null;
  isAdminPreview?: boolean;
  onOpenSchedule?: () => void;
}

export const StructureGalleryModal: React.FC<StructureGalleryModalProps> = ({
  isOpen,
  onClose,
  topicId,
  isAdminPreview = false,
  onOpenSchedule,
}) => {
  const [album, setAlbum] = useState<StructureAlbum | null>(null);
  const [photos, setPhotos] = useState<StructurePhoto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaErrorMap, setMediaErrorMap] = useState<Record<string, boolean>>({});
  const [imageFallbackMap, setImageFallbackMap] = useState<Record<string, boolean>>({});

  const modalRef = useRef<HTMLDivElement>(null);

  const topicConfig = STRUCTURE_TOPICS.find((t) => t.id === topicId);

  // Load album metadata and photos
  useEffect(() => {
    if (!isOpen || !topicId) {
      setAlbum(null);
      setPhotos([]);
      setCurrentIndex(0);
      setMediaErrorMap({});
      setImageFallbackMap({});
      return;
    }

    let isMounted = true;
    const fetchAlbumData = async () => {
      setLoading(true);
      setMediaLoaded(false);
      setMediaErrorMap({});
      setImageFallbackMap({});
      try {
        const [albumData, photosData] = await Promise.all([
          getAlbum(topicId),
          isAdminPreview
            ? getAllPhotosForAdmin(topicId)
            : getPublishedPhotos(topicId),
        ]);

        if (!isMounted) return;
        setAlbum(albumData);
        setPhotos(photosData || []);
        setCurrentIndex(0);
      } catch (err) {
        console.warn(`[StructureGalleryModal] Falha ao carregar álbum ${topicId}:`, err);
        if (isMounted) {
          setAlbum({
            id: topicId,
            topicKey: topicId,
            title: topicConfig?.title || 'Estrutura Victoria Lar',
            description: topicConfig?.defaultDescription || topicConfig?.shortDescription || '',
          });
          setPhotos([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchAlbumData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, topicId, isAdminPreview, topicConfig]);

  // Navigate functions
  const handlePrev = useCallback(() => {
    if (photos.length <= 1) return;
    setMediaLoaded(false);
    setCurrentIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  }, [photos.length]);

  const handleNext = useCallback(() => {
    if (photos.length <= 1) return;
    setMediaLoaded(false);
    setCurrentIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
  }, [photos.length]);

  // Keyboard navigation & Escape close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  // Touch Swipe handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;

    // Minimum swipe threshold: 50px
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    setTouchStartX(null);
  };

  if (!isOpen || !topicId) return null;

  const currentPhoto = photos[currentIndex];
  const parsedCurrent = currentPhoto
    ? parseMediaUrl(currentPhoto.url, currentPhoto.mediaType)
    : null;
  const isCurrentVideo = parsedCurrent?.mediaType === 'video';
  const isVerticalVideo = Boolean(parsedCurrent?.isVertical || parsedCurrent?.aspectRatio === '9/16');
  const hasCurrentError = currentPhoto ? Boolean(mediaErrorMap[currentPhoto.id]) : false;

  const currentImageSrc = (() => {
    if (!currentPhoto || !parsedCurrent) return '';
    if (parsedCurrent.provider === 'google-drive') {
      if (imageFallbackMap[currentPhoto.id] && parsedCurrent.fallbackThumbnailUrl) {
        return parsedCurrent.fallbackThumbnailUrl;
      }
      return parsedCurrent.streamUrl || parsedCurrent.directUrl || currentPhoto.url;
    }
    return parsedCurrent.streamUrl || parsedCurrent.directUrl || currentPhoto.url;
  })();

  const renderTopicIcon = (iconName?: string) => {
    const props = { className: 'w-5 h-5 text-[#B8954A]' };
    switch (iconName) {
      case 'Home':
        return <Home {...props} />;
      case 'Sun':
        return <Sun {...props} />;
      case 'Shield':
        return <Shield {...props} />;
      case 'Users':
        return <Users {...props} />;
      default:
        return <Sparkles {...props} />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-8 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="bg-[#FAF9F5] border border-[#B8954A]/40 rounded-3xl shadow-2xl max-w-5xl w-full max-h-[94vh] flex flex-col overflow-hidden text-neutral-800 animate-in zoom-in-95 duration-200"
      >
        {/* Top Header */}
        <div className="bg-[#173D2B] px-5 sm:px-8 py-4 sm:py-5 text-white flex items-center justify-between border-b-2 border-[#B8954A] flex-shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-[#B8954A]/50 flex items-center justify-center flex-shrink-0">
              {renderTopicIcon(topicConfig?.iconName)}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#B8954A]">
                  Estrutura Residencial
                </span>
                {isAdminPreview && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full">
                    <Eye className="w-3 h-3" />
                    Pré-visualização ADM
                  </span>
                )}
              </div>
              <h2
                id="gallery-modal-title"
                className="font-serif font-bold text-lg sm:text-2xl text-white truncate"
              >
                {album?.title || topicConfig?.title || 'Estrutura'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {photos.length > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-[#FAF9F5] border border-white/20">
                {isCurrentVideo ? <Video className="w-3 h-3 text-[#DFC282]" /> : <Camera className="w-3 h-3 text-[#DFC282]" />}
                <span>{currentIndex + 1} de {photos.length}</span>
              </span>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar galeria de fotos"
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#B8954A]"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Editorial Subtitle / Space Description */}
        {album?.description && (
          <div className="bg-white/80 px-6 py-2.5 border-b border-neutral-200/80 text-xs text-neutral-600 leading-relaxed flex items-center justify-between gap-4 flex-shrink-0">
            <p className="line-clamp-2">{album.description}</p>
            {photos.length > 0 && (
              <span className="sm:hidden text-[11px] font-bold text-[#173D2B] bg-[#E5A2AB]/30 px-2 py-0.5 rounded-full flex-shrink-0">
                {currentIndex + 1}/{photos.length}
              </span>
            )}
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 flex flex-col justify-between overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading ? (
            /* Loading State */
            <div className="flex-1 min-h-[360px] sm:min-h-[460px] flex flex-col items-center justify-center p-8 text-center space-y-4 animate-pulse">
              <div className="w-16 h-16 rounded-full bg-[#173D2B]/10 border border-[#B8954A]/30 flex items-center justify-center text-[#173D2B]">
                <VictoriaEmblem variant="color" width={44} height={30} />
              </div>
              <div className="space-y-1.5">
                <div className="h-4 w-40 bg-neutral-300 rounded-md mx-auto" />
                <div className="h-3 w-56 bg-neutral-200 rounded-md mx-auto" />
              </div>
            </div>
          ) : photos.length === 0 ? (
            /* Empty State: Discrete, respectful & elegant message */
            <div className="flex-1 min-h-[360px] sm:min-h-[440px] flex flex-col items-center justify-center text-center p-6 sm:p-10 space-y-5 bg-white rounded-2xl border border-neutral-200/90 shadow-inner">
              <div className="w-20 h-20 rounded-2xl bg-[#FAF9F5] border-2 border-[#B8954A]/40 flex items-center justify-center shadow-xs">
                <Camera className="w-9 h-9 text-[#B8954A]" />
              </div>

              <div className="max-w-md space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#B8954A] block">
                  Victoria Lar Residencial
                </span>
                <h3 className="font-serif font-bold text-xl text-[#173D2B]">
                  Álbum em Preparação
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                  As fotografias e vídeos deste espaço estão sendo preparados pela nossa equipe institucional e estarão disponíveis para visitação virtual em breve.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-medium text-xs rounded-full transition-all cursor-pointer"
                >
                  Voltar para a Página
                </button>
              </div>
            </div>
          ) : (
            /* Media Carousel & Enlarged View */
            <div className="flex-1 flex flex-col space-y-3 sm:space-y-4">
              {/* Dedicated Media Display Frame - Responsive and never cropping */}
              <div
                className="relative w-full bg-neutral-950 rounded-2xl overflow-hidden flex items-center justify-center select-none shadow-md min-h-[280px] sm:min-h-[380px] max-h-[58vh]"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {/* 1. Discrete Error State if Media Fails to Load - ZERO mock replacement */}
                {hasCurrentError ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-300 space-y-3.5 max-w-md">
                    <div className="w-14 h-14 rounded-full bg-white/10 border border-[#DFC282]/40 flex items-center justify-center text-[#DFC282]">
                      <AlertTriangle className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-serif font-bold text-base text-white">
                        Mídia Indisponível no Momento
                      </h4>
                      <p className="text-xs text-neutral-400 leading-relaxed">
                        Não foi possível carregar este conteúdo a partir da fonte externa. O arquivo pode ter sido movido ou as permissões de visualização pública precisam ser ajustadas na origem.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMediaErrorMap((prev) => ({ ...prev, [currentPhoto.id]: false }));
                          setImageFallbackMap((prev) => ({ ...prev, [currentPhoto.id]: false }));
                          setMediaLoaded(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs border border-white/20 transition-all cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Tentar Novamente</span>
                      </button>
                    </div>
                  </div>
                ) : isCurrentVideo ? (
                  /* 2. Video Player Rendering (YouTube / Vimeo / Google Drive iframe or Direct HTML5 Video) */
                  parsedCurrent?.provider === 'youtube' ||
                  parsedCurrent?.provider === 'vimeo' ||
                  parsedCurrent?.provider === 'google-drive' ? (
                    <div
                      className={`w-full max-h-[58vh] flex items-center justify-center ${
                        isVerticalVideo
                          ? 'max-w-[340px] aspect-[9/16]'
                          : 'max-w-4xl aspect-video'
                      } mx-auto relative`}
                    >
                      <iframe
                        key={`${currentPhoto.id}-${currentIndex}`}
                        src={parsedCurrent.embedUrl}
                        title={currentPhoto.title || 'Vídeo da estrutura Victoria Lar'}
                        className="w-full h-full border-0 rounded-2xl bg-black"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        onLoad={() => setMediaLoaded(true)}
                        onError={() => {
                          setMediaErrorMap((prev) => ({ ...prev, [currentPhoto.id]: true }));
                        }}
                      />
                    </div>
                  ) : (
                    /* Direct HTML5 Video Player with Controls and Proportional Contain */
                    <video
                      key={`${currentPhoto.id}-${currentIndex}`}
                      controls
                      playsInline
                      preload="metadata"
                      src={parsedCurrent?.directUrl || currentPhoto.url}
                      className="max-h-[58vh] max-w-full w-auto h-auto object-contain mx-auto rounded-2xl bg-black shadow-lg"
                      onLoadedData={() => setMediaLoaded(true)}
                      onError={() => {
                        setMediaErrorMap((prev) => ({ ...prev, [currentPhoto.id]: true }));
                      }}
                    >
                      <track kind="captions" />
                      Seu navegador não suporta a reprodução deste formato de vídeo.
                    </video>
                  )
                ) : (
                  /* 3. High-fidelity Photo Rendering with Object Contain & Resilient Fallback */
                  <img
                    key={`${currentPhoto.id}-${currentImageSrc}`}
                    src={currentImageSrc}
                    alt={currentPhoto.altText || currentPhoto.title || 'Fotografia da estrutura'}
                    className={`max-h-[58vh] max-w-full w-auto h-auto object-contain mx-auto rounded-2xl transition-opacity duration-300 ${
                      mediaLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onLoad={() => setMediaLoaded(true)}
                    onError={() => {
                      if (
                        parsedCurrent?.provider === 'google-drive' &&
                        parsedCurrent?.fallbackThumbnailUrl &&
                        !imageFallbackMap[currentPhoto.id]
                      ) {
                        setImageFallbackMap((prev) => ({ ...prev, [currentPhoto.id]: true }));
                      } else {
                        setMediaErrorMap((prev) => ({ ...prev, [currentPhoto.id]: true }));
                      }
                    }}
                  />
                )}

                {/* Loading indicator while swapping media */}
                {!mediaLoaded && !hasCurrentError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/70 pointer-events-none z-10">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-3 border-[#B8954A] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[11px] text-[#DFC282] font-medium tracking-wide">Carregando mídia...</span>
                    </div>
                  </div>
                )}

                {/* Left arrow navigation */}
                {photos.length > 1 && (
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Mídia anterior"
                    className="absolute left-2.5 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/60 hover:bg-white text-white hover:text-[#173D2B] border border-white/20 hover:border-white flex items-center justify-center backdrop-blur-md transition-all hover:scale-110 shadow-lg cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#B8954A] z-20"
                  >
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                )}

                {/* Right arrow navigation */}
                {photos.length > 1 && (
                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Próxima mídia"
                    className="absolute right-2.5 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/60 hover:bg-white text-white hover:text-[#173D2B] border border-white/20 hover:border-white flex items-center justify-center backdrop-blur-md transition-all hover:scale-110 shadow-lg cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#B8954A] z-20"
                  >
                    <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                )}
              </div>

              {/* Caption / Title Panel (Cleanly separated BELOW media frame - NEVER covers video controls or content) */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-neutral-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-start justify-between gap-3 flex-shrink-0">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#173D2B] bg-[#E5A2AB]/25 px-2.5 py-0.5 rounded-full border border-[#E5A2AB]/50">
                      {isCurrentVideo ? <Video className="w-3 h-3 text-[#173D2B]" /> : <Camera className="w-3 h-3 text-[#173D2B]" />}
                      <span>{isCurrentVideo ? (isVerticalVideo ? 'Vídeo Vertical' : 'Vídeo') : 'Fotografia'} {currentIndex + 1} de {photos.length}</span>
                    </span>

                    {parsedCurrent?.providerLabel && (
                      <span className="text-[10px] font-medium text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">
                        {parsedCurrent.providerLabel}
                      </span>
                    )}

                    {!currentPhoto.published && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                        <EyeOff className="w-2.5 h-2.5 text-amber-700" />
                        Rascunho ADM (Invisível para Visitantes)
                      </span>
                    )}
                  </div>

                  {currentPhoto.title && (
                    <h3 className="font-serif font-bold text-base sm:text-lg text-neutral-900 leading-snug">
                      {currentPhoto.title}
                    </h3>
                  )}

                  {currentPhoto.caption && (
                    <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                      {currentPhoto.caption}
                    </p>
                  )}
                </div>
              </div>

              {/* Thumbnails Strip */}
              {photos.length > 1 && (
                <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto py-1.5 px-0.5 scrollbar-thin">
                  {photos.map((p, idx) => {
                    const isActive = idx === currentIndex;
                    const parsed = parseMediaUrl(p.url, p.mediaType);
                    const isVid = parsed.mediaType === 'video';
                    const hasError = Boolean(mediaErrorMap[p.id]);
                    const thumbUrl = parsed.thumbnailUrl || (isVid ? undefined : parsed.streamUrl || parsed.directUrl || p.url);

                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setMediaLoaded(false);
                          setCurrentIndex(idx);
                        }}
                        aria-label={`Ver ${isVid ? 'vídeo' : 'foto'} ${idx + 1}: ${p.title || 'Detalhe'}`}
                        className={`relative flex-shrink-0 w-16 h-12 sm:w-20 sm:h-14 rounded-xl overflow-hidden transition-all cursor-pointer bg-neutral-900 ${
                          isActive
                            ? 'ring-3 ring-[#B8954A] scale-105 shadow-md border-2 border-white'
                            : 'opacity-65 hover:opacity-100 border border-neutral-300'
                        }`}
                      >
                        {hasError ? (
                          <div className="w-full h-full flex items-center justify-center text-amber-400 bg-neutral-900">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                        ) : isVid && parsed.provider === 'youtube' && parsed.thumbnailUrl ? (
                          <img
                            src={parsed.thumbnailUrl}
                            alt={p.altText || p.title || `Miniatura ${idx + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={() => {
                              setMediaErrorMap((prev) => ({ ...prev, [p.id]: true }));
                            }}
                          />
                        ) : isVid ? (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950 text-white">
                            <Video className="w-5 h-5 text-[#DFC282]" />
                          </div>
                        ) : (
                          <img
                            src={thumbUrl}
                            alt={p.altText || p.title || `Miniatura ${idx + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() => {
                              setMediaErrorMap((prev) => ({ ...prev, [p.id]: true }));
                            }}
                          />
                        )}

                        {/* Video indicator badge */}
                        {isVid && (
                          <div className="absolute bottom-1 left-1 bg-black/75 rounded p-0.5 text-white">
                            <Play className="w-2.5 h-2.5 fill-current text-[#DFC282]" />
                          </div>
                        )}

                        {!p.published && (
                          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-white" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Action Footer */}
        <div className="bg-[#FAF9F5] border-t border-neutral-200 px-5 sm:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs flex-shrink-0">
          <div className="flex items-center gap-2 text-neutral-600 text-center sm:text-left">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>Estrutura e acomodações projetadas para o bem-estar e segurança dos residentes.</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border border-neutral-300 hover:bg-neutral-100 text-neutral-700 rounded-full transition-all cursor-pointer font-medium text-xs"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
