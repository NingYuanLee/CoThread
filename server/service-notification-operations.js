import {
  listNotifications,
  notify,
  openNotification,
  readNotification,
} from "./service-notifications.js";
import { fail, id } from "./service-support.js";

export async function notifyOperation(
  service,
  db,
  userId,
  projectId,
  kind,
  text,
  threadId = null,
  messageId = null,
  senderName = "系统通知",
) {
  return notify(db, userId, projectId, kind, text, threadId, messageId, senderName);
}

export async function notificationsOperation(service, user, before, input = {}) {
  return listNotifications(service, user, before, input, { id, fail });
}

export async function readNotificationOperation(service, user, notificationId) {
  return readNotification(service, user, notificationId, { id, fail });
}

export async function openNotificationOperation(service, user, notificationId) {
  return openNotification(service, user, notificationId, { id, fail });
}
