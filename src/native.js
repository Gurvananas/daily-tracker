// Bridge to the Android app (Capacitor). In the browser these helpers are inert.

const cap = () => globalThis.Capacitor;

export const isNative = () => Boolean(cap()?.isNativePlatform?.());

/** Call a native plugin method: native('HealthSync', 'status'). */
export function native(plugin, method, options = {}) {
  if (!isNative()) return Promise.reject(new Error('Disponible uniquement dans l\'appli Android'));
  return cap().nativePromise(plugin, method, options);
}

/** Save a file from the Android app: written to the cache, then handed to the share sheet. */
export async function shareFile(filename, content, title) {
  const { uri } = await native('Filesystem', 'writeFile', { path: filename, data: content, directory: 'CACHE', encoding: 'utf8' });
  await native('Share', 'share', { title, files: [uri], dialogTitle: title });
}

export const ANDROID_DOWNLOAD_URL = 'https://github.com/Gurvananas/daily-tracker/releases/latest';
