import { apiClient } from "./client"
import type { NoteImage } from "./types"

/** An image chosen for a not-yet-saved note; uploaded after the note is created. */
export type PendingImage = { tmp: string; file: File }

/** The inline markdown token that references a note image in a body. */
export const noteImageToken = (id: string) => `![](note-image:${id})`
export const pendingImageToken = (tmp: string) => `![](note-image:pending-${tmp})`

export async function uploadNoteImage(noteId: string, file: File): Promise<NoteImage> {
  const form = new FormData()
  form.append("file", file)
  return apiClient.postForm<NoteImage>(`/notes/${noteId}/images`, form)
}

/**
 * After a note is created, upload each pending image and return the body with
 * `note-image:pending-<tmp>` tokens rewritten to the real `note-image:<id>` refs.
 */
export async function finalizePendingImages(
  noteId: string,
  body: string,
  pending: PendingImage[],
): Promise<string> {
  let out = body
  for (const p of pending) {
    const img = await uploadNoteImage(noteId, p.file)
    out = out.split(`note-image:pending-${p.tmp}`).join(`note-image:${img.id}`)
  }
  return out
}
