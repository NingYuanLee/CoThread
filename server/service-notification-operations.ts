import {
  listNotifications,
  notify,
  openNotification,
  readNotification,
} from "./service-notifications.ts";
import { fail, id } from "./service-support.ts";
import type { NotificationHelpers } from "./service-notifications.ts";

/** 被调函数已带类型，这里直接用它们的参数类型，避免重复声明造成漂移。 */
type NotifyArgs = Parameters<typeof notify>;
type ListArgs = Parameters<typeof listNotifications>;
type ReadArgs = Parameters<typeof readNotification>;
type OpenArgs = Parameters<typeof openNotification>;

export async function notifyOperation(
  service: unknown,
  db: NotifyArgs[0],
  userId: NotifyArgs[1],
  projectId: NotifyArgs[2],
  kind: NotifyArgs[3],
  text: NotifyArgs[4],
  threadId: NotifyArgs[5] = null,
  messageId: NotifyArgs[6] = null,
  senderName: NotifyArgs[7] = "系统通知",
): Promise<void> {
  return notify(db, userId, projectId, kind, text, threadId, messageId, senderName);
}

export async function notificationsOperation(
  service: ListArgs[0],
  user: ListArgs[1],
  before: ListArgs[2],
  input: ListArgs[3],
): Promise<unknown> {
  return listNotifications(service, user, before, input, { id, fail } as NotificationHelpers);
}

export async function readNotificationOperation(
  service: ReadArgs[0],
  user: ReadArgs[1],
  notificationId: ReadArgs[2],
): Promise<{ ok: true }> {
  return readNotification(service, user, notificationId, { id, fail } as NotificationHelpers);
}

export async function openNotificationOperation(
  service: OpenArgs[0],
  user: OpenArgs[1],
  notificationId: OpenArgs[2],
): Promise<unknown> {
  return openNotification(service, user, notificationId, { id, fail } as NotificationHelpers);
}
