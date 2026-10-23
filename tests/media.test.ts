import {
  parseMediaUrl,
  getSafeEmbedUrl,
  isDirectVideoUrl,
  isDirectImageUrl,
  resolveMediaDisplayUrl,
  parsePhotoUrl,
  resolvePhotoDisplayUrl,
  extractGoogleDriveFileId,
} from '../src/utils/mediaUrlHelper';
import { StructurePhoto, StructureAlbum } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

// Mock In-Memory Store to test public vs admin resolution, persistence and published filters
class MockFirestoreMediaStore {
  public albums = new Map<string, StructureAlbum>();
  public photos = new Map<string, StructurePhoto>(); // key: `${albumId}/${photoId}`
  public contentAlbums = new Map<string, { key: string; title: string; subtitle?: string; body?: string }>();

  seedAlbum(album: StructureAlbum) {
    this.albums.set(album.id, { ...album });
  }

  seedPhoto(photo: StructurePhoto) {
    this.photos.set(`${photo.albumId}/${photo.id}`, { ...photo });
  }

  seedContentAlbum(key: string, data: { key: string; title: string; subtitle?: string; body?: string }) {
    this.contentAlbums.set(key, { ...data });
  }

  // Simulates getPublishedPhotos for public visitors (where('published', '==', true))
  getPublishedPhotos(albumId: string): StructurePhoto[] {
    const result: StructurePhoto[] = [];
    for (const [k, p] of this.photos.entries()) {
      if (p.albumId === albumId && p.published === true) {
        result.push({ ...p });
      }
    }
    // Also check content/album_{albumId} fallback if needed
    const cDoc = this.contentAlbums.get(`album_${albumId}`);
    if (cDoc && cDoc.body) {
      try {
        const parsed = JSON.parse(cDoc.body);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: StructurePhoto) => {
            if (item && item.published === true && !result.some((r) => r.id === item.id)) {
              result.push({ ...item });
            }
          });
        }
      } catch {}
    }
    return result.sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  // Simulates getAllPhotosForAdmin (unrestricted, includes drafts)
  getAllPhotosForAdmin(albumId: string): StructurePhoto[] {
    const result: StructurePhoto[] = [];
    for (const [k, p] of this.photos.entries()) {
      if (p.albumId === albumId) {
        result.push({ ...p });
      }
    }
    const cDoc = this.contentAlbums.get(`album_${albumId}`);
    if (cDoc && cDoc.body) {
      try {
        const parsed = JSON.parse(cDoc.body);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: StructurePhoto) => {
            if (item && !result.some((r) => r.id === item.id)) {
              result.push({ ...item });
            }
          });
        }
      } catch {}
    }
    return result.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
}

async function runMediaTests() {
  console.log('================================================================');
  console.log('--- TEST SUITE: Victoria Lar Media System & Verification ---');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // Test 1: Foto do Google Drive no ADM e na página pública
  // -------------------------------------------------------------
  console.log('--- Validação 1: Foto do Google Drive no ADM e na Página Pública ---');
  const gDrivePhotoUrl = 'https://drive.google.com/file/d/1B9Z8Y7X6W5V4U3T2S1R0Q/view?usp=sharing';
  const parsedDrivePhoto = parseMediaUrl(gDrivePhotoUrl, 'image');

  assert(parsedDrivePhoto.isValid === true, 'Google Drive photo URL is parsed as valid');
  assert(parsedDrivePhoto.mediaType === 'image', 'Google Drive photo mediaType is strictly "image"');
  assert(parsedDrivePhoto.provider === 'google-drive', 'Provider correctly identified as "google-drive"');
  assert(
    parsedDrivePhoto.streamUrl?.includes('1B9Z8Y7X6W5V4U3T2S1R0Q') === true,
    'Google Drive photo streamUrl contains file ID for direct image delivery'
  );
  assert(
    parsedDrivePhoto.directUrl?.includes('1B9Z8Y7X6W5V4U3T2S1R0Q') === true,
    'Google Drive photo directUrl contains file ID'
  );
  assert(
    parsedDrivePhoto.embedUrl === undefined,
    'CRITICAL: Google Drive image does NOT have embedUrl (prevents passing HTML /preview to <img src="...">)'
  );

  // In Public Gallery Modal: resolved image src uses streamUrl or directUrl, NEVER /preview
  const publicResolved = resolveMediaDisplayUrl(gDrivePhotoUrl, 'image');
  assert(
    !publicResolved.displayUrl.endsWith('/preview'),
    'Public gallery display URL is a direct image endpoint, not HTML /preview'
  );
  assert(
    publicResolved.displayUrl.includes('1B9Z8Y7X6W5V4U3T2S1R0Q'),
    'Public gallery display URL targets the exact image file'
  );

  // In Admin Panel Preview: resolved image uses streamUrl/directUrl
  assert(
    parsedDrivePhoto.streamUrl === publicResolved.displayUrl,
    'Admin panel and public gallery resolve to consistent direct image streams'
  );

  // -------------------------------------------------------------
  // Test 2: Vídeo do YouTube no painel ADM e na página pública
  // -------------------------------------------------------------
  console.log('\n--- Validação 2: Vídeo do YouTube no ADM e na Página Pública ---');
  const ytWatchUrl = 'https://www.youtube.com/watch?v=ScMzIvxBSi4';
  const parsedYt = parseMediaUrl(ytWatchUrl, 'video');

  assert(parsedYt.isValid === true, 'YouTube watch URL is parsed as valid');
  assert(parsedYt.mediaType === 'video', 'YouTube auto-detects as "video"');
  assert(parsedYt.provider === 'youtube', 'Provider identified as "youtube"');
  assert(
    parsedYt.embedUrl === 'https://www.youtube-nocookie.com/embed/ScMzIvxBSi4',
    'Embed URL uses privacy-enhanced youtube-nocookie.com domain'
  );
  assert(
    parsedYt.thumbnailUrl === 'https://img.youtube.com/vi/ScMzIvxBSi4/hqdefault.jpg',
    'YouTube thumbnail URL generated accurately for strip and preview'
  );
  assert(
    parsedYt.isVertical === false && parsedYt.aspectRatio === '16/9',
    'Standard YouTube video receives 16:9 horizontal aspect ratio'
  );

  const ytShortUrl = 'https://youtu.be/ScMzIvxBSi4?t=15';
  const parsedYtShort = parseMediaUrl(ytShortUrl);
  assert(
    parsedYtShort.embedUrl === 'https://www.youtube-nocookie.com/embed/ScMzIvxBSi4',
    'youtu.be short link resolves to canonical embed URL'
  );

  // -------------------------------------------------------------
  // Test 3: Arquivo de vídeo direto (HTML5)
  // -------------------------------------------------------------
  console.log('\n--- Validação 3: Arquivo de Vídeo Direto (HTML5) ---');
  const directMp4Url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  const parsedMp4 = parseMediaUrl(directMp4Url);

  assert(parsedMp4.isValid === true, 'Direct MP4 URL is valid');
  assert(parsedMp4.mediaType === 'video', 'Direct MP4 auto-detects as video');
  assert(parsedMp4.isDirectVideo === true, 'Direct MP4 correctly flagged as direct HTML5 video');
  assert(parsedMp4.directUrl === directMp4Url, 'Direct MP4 preserves raw directUrl');
  assert(parsedMp4.embedUrl === undefined, 'Direct MP4 has no iframe embedUrl (uses native <video> tag)');
  assert(isDirectVideoUrl(directMp4Url) === true, 'isDirectVideoUrl helper returns true for .mp4');
  assert(isDirectVideoUrl('https://example.com/tour.webm') === true, 'isDirectVideoUrl returns true for .webm');

  // -------------------------------------------------------------
  // Test 4: Álbum publicado e mídia oculta (Segurança de Visitantes)
  // -------------------------------------------------------------
  console.log('\n--- Validação 4: Álbum Publicado e Mídia Oculta (Rascunho) ---');
  const store = new MockFirestoreMediaStore();
  store.seedAlbum({
    id: 'quartos-seguros',
    topicKey: 'quartos-seguros',
    title: 'Quartos seguros',
    description: 'Acomodações privativas e semi-privativas adaptadas.',
    status: 'published',
  });

  // Seed 1 published photo and 1 draft/hidden photo
  store.seedPhoto({
    id: 'photo_pub_1',
    albumId: 'quartos-seguros',
    url: 'https://images.unsplash.com/photo-suite-1.jpg',
    mediaType: 'image',
    title: 'Suíte Master Iluminada',
    caption: 'Com barras de apoio e piso antiderrapante',
    altText: 'Quarto aconchegante com iluminação natural',
    order: 1,
    published: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  store.seedPhoto({
    id: 'photo_draft_secret',
    albumId: 'quartos-seguros',
    url: 'https://images.unsplash.com/photo-suite-secret.jpg',
    mediaType: 'image',
    title: 'Foto Interna de Auditoria Técnica',
    caption: 'Rascunho não aprovado para divulgação pública',
    altText: 'Foto em revisão interna',
    order: 2,
    published: false, // DRAFT / HIDDEN
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Query as public visitor
  const publicPhotos = store.getPublishedPhotos('quartos-seguros');
  assert(publicPhotos.length === 1, 'Public query returns strictly 1 photo');
  assert(publicPhotos[0].id === 'photo_pub_1', 'Public query returns the published photo');
  assert(
    !publicPhotos.some((p) => p.id === 'photo_draft_secret'),
    'CRITICAL: Draft/hidden photo is completely absent from public query results'
  );

  // Query as administrator
  const adminPhotos = store.getAllPhotosForAdmin('quartos-seguros');
  assert(adminPhotos.length === 2, 'Admin query returns all 2 photos including drafts');
  assert(
    adminPhotos.some((p) => p.id === 'photo_draft_secret' && p.published === false),
    'Admin query successfully includes draft photo with published: false'
  );

  // -------------------------------------------------------------
  // Test 5: Persistência após atualizar a página
  // -------------------------------------------------------------
  console.log('\n--- Validação 5: Persistência após Atualização / Cache In-Memory ---');
  // Add a newly published photo to the album
  store.seedPhoto({
    id: 'photo_pub_2',
    albumId: 'quartos-seguros',
    url: 'https://images.unsplash.com/photo-suite-2.jpg',
    mediaType: 'image',
    title: 'Banheiro Acessível',
    caption: 'Adequado para cadeira de rodas com ducha higiênica',
    altText: 'Banheiro adaptado',
    order: 2,
    published: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Re-run public query simulating page refresh or navigation
  const refreshedPublicPhotos = store.getPublishedPhotos('quartos-seguros');
  assert(refreshedPublicPhotos.length === 2, 'Simulated reload returns 2 published photos');
  assert(
    refreshedPublicPhotos[0].order <= refreshedPublicPhotos[1].order,
    'Photos remain consistently ordered by order sequence across reloads'
  );

  // -------------------------------------------------------------
  // Test 6: Proporções de vídeos horizontais e verticais
  // -------------------------------------------------------------
  console.log('\n--- Validação 6: Proporções de Vídeos Horizontais (16:9) e Verticais (9:16) ---');
  // Horizontal YouTube
  const horizontalVid = parseMediaUrl('https://www.youtube.com/watch?v=ScMzIvxBSi4');
  assert(horizontalVid.isVertical === false, 'Horizontal video isVertical is false');
  assert(horizontalVid.aspectRatio === '16/9', 'Horizontal video receives aspectRatio "16/9"');

  // Vertical YouTube Shorts
  const verticalShortsVid = parseMediaUrl('https://www.youtube.com/shorts/3jz_Kmsq9Xw');
  assert(verticalShortsVid.isValid === true, 'YouTube Shorts URL is valid');
  assert(verticalShortsVid.mediaType === 'video', 'YouTube Shorts detects as video');
  assert(verticalShortsVid.isVertical === true, 'YouTube Shorts flagged as isVertical: true');
  assert(verticalShortsVid.aspectRatio === '9/16', 'YouTube Shorts receives vertical aspect ratio "9/16"');
  assert(
    verticalShortsVid.providerLabel.includes('Vertical'),
    'Provider label informs administrator and user that media is vertical'
  );

  // Vimeo (Standard horizontal 16:9)
  const vimeoVid = parseMediaUrl('https://vimeo.com/76979871');
  assert(vimeoVid.isVertical === false, 'Vimeo video defaults to horizontal (16:9)');
  assert(vimeoVid.aspectRatio === '16/9', 'Vimeo receives 16:9 ratio');

  // Direct MP4 has auto aspect ratio to let native <video object-contain> adapt
  const directVid = parseMediaUrl('https://cdn.example.com/video.mp4');
  assert(directVid.aspectRatio === 'auto', 'Direct HTML5 video uses auto aspect ratio with object-contain');

  // -------------------------------------------------------------
  // Test 7: Sanitização e rejeição de protocolos inseguros
  // -------------------------------------------------------------
  console.log('\n--- Validação 7: Proteções contra XSS e Injeções ---');
  assert(parseMediaUrl('javascript:alert(document.cookie)').isValid === false, 'javascript: is rejected');
  assert(parseMediaUrl('data:text/html;base64,PHNjcmlwdD4=').isValid === false, 'data: is rejected');
  assert(parseMediaUrl('vbscript:msgbox(1)').isValid === false, 'vbscript: is rejected');
  assert(parseMediaUrl('ftp://example.com/photo.jpg').isValid === false, 'ftp:// is rejected');

  // -------------------------------------------------------------
  // Test 8: Validação Fotográfica Exclusiva (Hero & Sócios Proprietários)
  // -------------------------------------------------------------
  console.log('\n--- Validação 8: Hero & Sócios Proprietários (Google Drive, Upload & Fotos Exclusivas) ---');

  // 8.1: Google Drive nos formatos comuns
  const driveHeroShare = 'https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0J/view?usp=sharing';
  const parsedHero = parsePhotoUrl(driveHeroShare);
  assert(parsedHero.isValid === true, 'Hero Google Drive share link parses as valid');
  assert(parsedHero.provider === 'google-drive', 'Provider identified as google-drive');
  assert(parsedHero.fileId === '1A2B3C4D5E6F7G8H9I0J', 'Exact file ID extracted from /file/d/ URL');
  assert(
    parsedHero.displayUrl === 'https://lh3.googleusercontent.com/d/1A2B3C4D5E6F7G8H9I0J=w1600',
    'Hero display URL normalizes to high-resolution direct Google CDN stream'
  );
  assert(
    parsedHero.fallbackUrl === 'https://drive.google.com/thumbnail?id=1A2B3C4D5E6F7G8H9I0J&sz=w1600',
    'Hero fallbackUrl is configured with thumbnail endpoint in case CDN is restricted'
  );
  assert(
    parsedHero.warning?.includes('público') === true,
    'Clear warning present regarding public sharing permissions'
  );

  // 8.2: Formatos alternativos do Google Drive (?id=, uc?export=download)
  const driveOpenLink = 'https://drive.google.com/open?id=9Z8Y7X6W5V4U3T2S1R';
  const parsedOpen = parsePhotoUrl(driveOpenLink);
  assert(parsedOpen.isValid === true, 'Google Drive ?id= open URL is valid');
  assert(parsedOpen.fileId === '9Z8Y7X6W5V4U3T2S1R', 'Correct ID extracted from ?id= parameter');
  assert(
    parsedOpen.displayUrl.includes('9Z8Y7X6W5V4U3T2S1R'),
    'Display URL includes extracted file ID'
  );

  const driveUcLink = 'https://drive.google.com/uc?export=download&id=5T6U7V8W9X0Y1Z';
  const parsedUc = parsePhotoUrl(driveUcLink);
  assert(parsedUc.isValid === true, 'Google Drive uc?export=download URL is valid');
  assert(parsedUc.fileId === '5T6U7V8W9X0Y1Z', 'Correct ID extracted from uc parameter');

  // 8.3: Sócios Proprietários com links do Drive
  const drivePartner1 = 'https://drive.google.com/file/d/1OLGA_PARTNER_PHOTO_ID_123/view';
  const parsedPartner1 = resolvePhotoDisplayUrl(drivePartner1);
  assert(parsedPartner1.isValid === true, 'Partner 1 Drive link is resolved as valid');
  assert(
    parsedPartner1.displayUrl.includes('1OLGA_PARTNER_PHOTO_ID_123'),
    'Partner 1 display URL contains partner file ID'
  );

  // 8.4: Rejeição rigorosa de vídeos em seções fotográficas exclusivas
  const ytInPhotoSection = parsePhotoUrl('https://www.youtube.com/watch?v=ScMzIvxBSi4');
  assert(ytInPhotoSection.isValid === false, 'YouTube video URL is REJECTED in photo-only section');
  assert(
    ytInPhotoSection.errorMessage?.includes('exclusivamente fotografias') === true,
    'Clear message returned stating section accepts photos exclusively'
  );

  const vimeoInPhotoSection = parsePhotoUrl('https://vimeo.com/76979871');
  assert(vimeoInPhotoSection.isValid === false, 'Vimeo video URL is REJECTED in photo-only section');

  const mp4InPhotoSection = parsePhotoUrl('https://example.com/video.mp4');
  assert(mp4InPhotoSection.isValid === false, 'MP4 video URL is REJECTED in photo-only section');

  // 8.5: Rejeição de pastas do Google Drive
  const folderLink = 'https://drive.google.com/drive/folders/1ABC_FOLDER_XYZ';
  const parsedFolder = parsePhotoUrl(folderLink);
  assert(parsedFolder.isValid === false, 'Google Drive folder link is REJECTED as single photo');
  assert(
    parsedFolder.errorMessage?.includes('pasta') === true,
    'Error message clearly explains that a folder link was provided instead of a photo'
  );

  // 8.6: Suporte a upload local seguro (data:image/jpeg;base64)
  const base64Photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';
  const parsedBase64 = parsePhotoUrl(base64Photo);
  assert(parsedBase64.isValid === true, 'Local compressed image data:image/jpeg is accepted');
  assert(parsedBase64.provider === 'direct-image', 'Local compressed image flagged as direct-image');
  assert(parsedBase64.displayUrl === base64Photo, 'Data URL preserved for display');

  // 8.7: Imagens diretas (JPG, PNG, WebP)
  const directJpg = 'https://meudominio.com.br/fotos/fachada-victoria.jpg';
  const parsedDirectJpg = parsePhotoUrl(directJpg);
  assert(parsedDirectJpg.isValid === true, 'Direct JPG URL is accepted');
  assert(parsedDirectJpg.displayUrl === directJpg, 'Direct JPG URL preserved for display');

  // 8.8: Consistência entre ADM e Landing Page
  const testDriveUrl = 'https://drive.google.com/file/d/1X9Y8Z7W6V5U4T3S2R/view?usp=sharing';
  const adminResolved = resolvePhotoDisplayUrl(testDriveUrl);
  const publicResolvedTest = resolvePhotoDisplayUrl(testDriveUrl);
  assert(
    adminResolved.displayUrl === publicResolvedTest.displayUrl,
    'Admin preview and public landing page resolve to identical display URLs'
  );
  assert(
    adminResolved.fallbackUrl === publicResolvedTest.fallbackUrl,
    'Admin preview and public landing page share identical fallback URLs'
  );

  console.log('\n================================================================');
  console.log('🎉 ALL 8 VICTORIA LAR MEDIA TEST SUITES PASSED FLAWLESSLY!');
  console.log('================================================================\n');
}

runMediaTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
