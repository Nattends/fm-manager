import { toast } from 'sonner'
import { installUpdate, type Update } from '@/lib/updates'
import type { Messages } from '@/i18n/en'

/** Propose d'installer une mise à jour (notification qui reste affichée), avec la progression du téléchargement. */
export function offerUpdate(update: Update, t: Messages) {
  toast(t.updates.available(update.version), {
    description: update.body?.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.replace(/^[-*]\s*/, '').replace(/\*\*/g, ''),
    duration: Infinity,
    action: {
      label: t.updates.install,
      onClick: () => {
        const id = toast.loading(t.updates.downloading(null), { duration: Infinity })
        installUpdate(update, (p) => toast.loading(t.updates.downloading(p), { id, duration: Infinity }))
          .catch((e) => toast.error(t.updates.failed(String(e)), { id, duration: 8000 }))
      },
    },
  })
}
