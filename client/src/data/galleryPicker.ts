/**
 * Выбор фото/видео из системной галереи (iOS/Android).
 * Разрешение на галерею запрашивается при первом выборе; при отказе — понятная ошибка.
 */
import { Linking } from 'react-native';
import { fromB64 } from '../crypto/core';

export interface GalleryFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export class GalleryPermissionError extends Error {
  constructor() {
    super('Нет доступа к галерее. Разрешите доступ к фото в настройках телефона.');
    this.name = 'GalleryPermissionError';
  }
}

/** До 10 фото/видео за один выбор — одно сообщение со стопкой вложений. */
export async function pickManyFromGallery(
  opts: { videos?: boolean; limit?: number } = {},
): Promise<GalleryFile[]> {
  const ImagePicker = await import('expo-image-picker');
  let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!perm.granted) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    if (perm.canAskAgain === false) void Linking.openSettings().catch(() => undefined);
    throw new GalleryPermissionError();
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: opts.videos ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: true,
    selectionLimit: opts.limit ?? 10,
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets?.length) return [];
  const FS = await import('expo-file-system');
  const out: GalleryFile[] = [];
  for (const asset of result.assets.slice(0, opts.limit ?? 10)) {
    const b64 = await FS.readAsStringAsync(asset.uri, { encoding: FS.EncodingType.Base64 });
    const isVideo = asset.type === 'video';
    const mime = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
    const ext = mime.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') ?? (isVideo ? 'mp4' : 'jpg');
    out.push({
      name: asset.fileName ?? `${isVideo ? 'video' : 'photo'}-${Date.now()}.${ext}`,
      mime,
      bytes: fromB64(b64),
    });
  }
  return out;
}

export async function pickFromGallery(opts: { videos?: boolean } = {}): Promise<GalleryFile | null> {
  const ImagePicker = await import('expo-image-picker');
  let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!perm.granted) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    if (perm.canAskAgain === false) void Linking.openSettings().catch(() => undefined);
    throw new GalleryPermissionError();
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: opts.videos ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: false,
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const FS = await import('expo-file-system');
  const b64 = await FS.readAsStringAsync(asset.uri, { encoding: FS.EncodingType.Base64 });
  const isVideo = asset.type === 'video';
  const mime = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
  const ext = mime.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') ?? (isVideo ? 'mp4' : 'jpg');
  return { name: asset.fileName ?? `${isVideo ? 'video' : 'photo'}-${Date.now()}.${ext}`, mime, bytes: fromB64(b64) };
}
