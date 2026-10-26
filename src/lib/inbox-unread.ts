/** Refresh the shared inbox badge only after a successful read acknowledgement. */
export const INBOX_UNREAD_CHANGED = "iga-inbox-unread-changed";
export function notifyInboxUnreadChanged() {
  window.dispatchEvent(new Event(INBOX_UNREAD_CHANGED));
}
