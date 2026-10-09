/**
 * Shared per-account cloud storage cap. Everything a user owns in R2 counts:
 * library files (and their thumbnails) plus temporary published websites.
 */

export const STORAGE_LIMIT_BYTES = 70 * 1024 * 1024;
export const STORAGE_FULL_MESSAGE = "Your storage is full (70 MB). You can't upload or create anything more until you delete some files in Settings → Storage.";

function userPrefixes(uid: string): string[] {
  return [`library/${uid}/`, `sites/${uid}/`];
}

async function listKeys(bucket: R2Bucket, prefix: string, visit: (objects: R2Object[]) => Promise<void> | void): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, limit: 1000, cursor });
    await visit(page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/** Total bytes the account currently stores in the cloud. */
export async function cloudUsageBytes(bucket: R2Bucket, uid: string): Promise<number> {
  let total = 0;
  for (const prefix of userPrefixes(uid)) {
    await listKeys(bucket, prefix, (objects) => { for (const obj of objects) total += obj.size; });
  }
  return total;
}

/** Permanently deletes every file and published website the account owns. */
export async function deleteAllUserStorage(bucket: R2Bucket, uid: string): Promise<number> {
  let deleted = 0;
  for (const prefix of userPrefixes(uid)) {
    // Collect first so deleting doesn't shift the listing cursor underneath us.
    const keys: string[] = [];
    await listKeys(bucket, prefix, (objects) => { keys.push(...objects.map((obj) => obj.key)); });
    for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
    deleted += keys.length;
  }
  return deleted;
}
