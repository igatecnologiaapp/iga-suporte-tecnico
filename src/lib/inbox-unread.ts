/** Área: Sinalização local de mudanças na leitura de conversas. */
/** Refresh the shared inbox badge only after a successful read acknowledgement. */
export const INBOX_UNREAD_CHANGED = "iga-inbox-unread-changed";
/** Avisa o contador local após a leitura de uma conversa ter sido confirmada. */
export function notifyInboxUnreadChanged() {
  window.dispatchEvent(new Event(INBOX_UNREAD_CHANGED));
}
