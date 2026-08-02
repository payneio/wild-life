import { apiClient } from "./client"
import type { MomentImage } from "./types"

/** An image chosen for a not-yet-saved moment; uploaded after it is created. */
export type PendingImage = { tmp: string; file: File }

/**
 * The inline markdown token that references a moment image in a body.
 *
 * Succeeds `note-image:`, which the backfill rewrote in place — bodies and bytes
 * both moved, so the 13 pictures on 7 entries render from moments rather than
 * being left behind on rows nothing draws.
 */
export const momentImageToken = (id: string) => `![](moment-image:${id})`
export const pendingImageToken = (tmp: string) => `![](moment-image:pending-${tmp})`

export async function uploadMomentImage(momentId: string, file: File): Promise<MomentImage> {
  const form = new FormData()
  form.append("file", file)
  return apiClient.postForm<MomentImage>(`/moments/${momentId}/images`, form)
}

/**
 * After a moment is created, upload each pending image and return the body with
 * `moment-image:pending-<tmp>` tokens rewritten to the real `moment-image:<id>`.
 */
export async function finalizePendingImages(
  momentId: string,
  body: string,
  pending: PendingImage[],
): Promise<string> {
  let out = body
  for (const p of pending) {
    const img = await uploadMomentImage(momentId, p.file)
    out = out.split(`moment-image:pending-${p.tmp}`).join(`moment-image:${img.id}`)
  }
  return out
}
