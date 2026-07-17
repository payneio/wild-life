import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// Date formatters now live in @/lib/date (branded, Temporal-backed). Re-export
// under the historical names so existing imports keep working.
export { formatDate, formatDateTime } from "@/lib/date"
