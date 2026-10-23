import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from '../lib/firebase';

export interface StorageUploadResult {
  url: string;
  storagePath: string;
}

/**
 * Uploads an image file to Firebase Storage under structure-albums/{albumId}/...
 * Validates file size and MIME type.
 * Tracks upload progress via optional callback.
 */
export async function uploadStructurePhotoFile(
  file: File,
  albumId: string,
  onProgress?: (percent: number) => void
): Promise<StorageUploadResult> {
  // 1. Validations
  if (!file) {
    throw new Error('Nenhum arquivo de imagem foi fornecido.');
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Formato de arquivo não suportado. Utilize imagens JPG, PNG, WEBP ou AVIF.');
  }

  const maxSizeBytes = 12 * 1024 * 1024; // 12MB limit
  if (file.size > maxSizeBytes) {
    throw new Error('Tamanho da imagem excede o limite de 12 MB.');
  }

  // 2. Prepare Storage Reference
  const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `structure-albums/${albumId}/${Date.now()}_${safeFilename}`;
  const storageRef = ref(storage, storagePath);

  // 3. Resumable Upload with Progress
  return new Promise((resolve, reject) => {
    try {
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
        customMetadata: {
          albumId,
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
        },
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.totalBytes > 0 && onProgress) {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(progress);
          }
        },
        (error) => {
          console.error('[Firebase Storage Upload Error]:', error);
          let userMessage = error.message;
          if (error.code === 'storage/unauthorized') {
            userMessage = 'Permissão negada no Firebase Storage. Verifique se você está autenticado como administrador.';
          } else if (error.code === 'storage/bucket-not-found') {
            userMessage = 'Bucket de armazenamento não encontrado. Verifique a configuração do Firebase Storage.';
          } else if (error.code === 'storage/retry-limit-exceeded') {
            userMessage = 'Limite de tentativas excedido na conexão com o Firebase Storage.';
          }
          reject(new Error(`Falha no upload para o Firebase Storage: ${userMessage}`));
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            if (onProgress) onProgress(100);
            resolve({
              url: downloadUrl,
              storagePath,
            });
          } catch (urlErr: any) {
            console.error('[Firebase Storage getDownloadURL Error]:', urlErr);
            reject(new Error(`Falha ao obter URL de download da imagem: ${urlErr.message}`));
          }
        }
      );
    } catch (initErr: any) {
      console.error('[Firebase Storage Initialization Error]:', initErr);
      reject(new Error(`Falha ao inicializar o upload no Firebase Storage: ${initErr.message}`));
    }
  });
}

/**
 * Deletes an image from Firebase Storage using its storage path.
 * Gracefully ignores 404 (already deleted) to prevent orphan locks.
 */
export async function deleteStorageFile(storagePath?: string): Promise<{ success: boolean; warning?: string }> {
  if (!storagePath || typeof storagePath !== 'string') {
    return { success: true }; // Nothing to delete
  }

  // Safety check: only delete files stored within our structure-albums directory
  if (!storagePath.startsWith('structure-albums/')) {
    console.warn(`[Storage Safety Guard] Skipped deletion of path outside structure-albums: ${storagePath}`);
    return { success: true, warning: 'Caminho fora do diretório de álbuns da estrutura preservado.' };
  }

  try {
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef);
    return { success: true };
  } catch (err: any) {
    if (err.code === 'storage/object-not-found') {
      // Already deleted or not found: acceptable state
      return { success: true };
    }
    console.warn(`[Firebase Storage Delete Warning for ${storagePath}]:`, err);
    return {
      success: false,
      warning: `Arquivo no Storage não pôde ser removido (${err.message}). O registro no banco foi excluído com segurança.`,
    };
  }
}
