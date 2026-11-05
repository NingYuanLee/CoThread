import {
  adminAccounts as adminAccountsDomain,
  adminProjects as adminProjectsDomain,
  updateAdminProject as updateAdminProjectDomain,
  createUser as createUserDomain,
  resetAccountPassword as resetAccountPasswordDomain,
  setAccountDisabled as setAccountDisabledDomain,
  setProjectArchived as setProjectArchivedDomain,
  users as usersDomain,
} from "./service-admin.ts";
import { HttpError } from "./http-error.ts";
import { DocumentsService } from "./documents/service.js";
import * as accessDomain from "./service-access.ts";
import * as membersDomain from "./service-members.ts";
import * as projectsDomain from "./service-projects.ts";
import * as monitorDomain from "./service-monitor.js";
import * as iterationsDomain from "./service-iterations.ts";
import * as messagesDomain from "./service-messages.ts";
import * as notificationsDomain from "./service-notification-operations.ts";
import { fail, id, title } from "./service-support.ts";
import type { Db } from "./types.ts";
export { officialTitleWithVersion } from "./documents/service.js";
export { HttpError };

/**
 * 域操作统一形如 `(service, ...args)`。这里从操作本身推导「除 service 之外的参数」，
 * 避免在门面上手抄 60 份签名——签名一旦和实现漂移，类型检查也就失去意义。
 */
type OperationRest<F> = F extends (service: never, ...rest: infer R) => unknown ? R : never;
type OperationResult<F> = F extends (...args: never[]) => infer R ? R : never;

/** 从域函数的第 N 个参数取类型（管理员那组方法的 service 之后直接是业务参数）。 */
type ParamAt<F extends (...args: never[]) => unknown, N extends number> = Parameters<F>[N];

export class Service extends DocumentsService {
  declare db: Db;

  constructor(db: Db) {
    super(db);
  }

  async createIterationFolders(): Promise<void> {}

  projectManager(
    ...args: OperationRest<typeof accessDomain.projectManagerOperation>
  ): OperationResult<typeof accessDomain.projectManagerOperation> {
    return accessDomain.projectManagerOperation(this as never, ...args);
  }
  projectLeader(
    ...args: OperationRest<typeof accessDomain.projectLeaderOperation>
  ): OperationResult<typeof accessDomain.projectLeaderOperation> {
    return accessDomain.projectLeaderOperation(this as never, ...args);
  }
  systemAdmin(
    ...args: OperationRest<typeof accessDomain.systemAdminOperation>
  ): OperationResult<typeof accessDomain.systemAdminOperation> {
    return accessDomain.systemAdminOperation(this as never, ...args);
  }
  adminPermission(
    ...args: OperationRest<typeof accessDomain.adminPermissionOperation>
  ): OperationResult<typeof accessDomain.adminPermissionOperation> {
    return accessDomain.adminPermissionOperation(this as never, ...args);
  }
  member(
    ...args: OperationRest<typeof accessDomain.memberOperation>
  ): OperationResult<typeof accessDomain.memberOperation> {
    return accessDomain.memberOperation(this as never, ...args);
  }
  thread(
    ...args: OperationRest<typeof accessDomain.threadOperation>
  ): OperationResult<typeof accessDomain.threadOperation> {
    return accessDomain.threadOperation(this as never, ...args);
  }
  accountChange(
    ...args: OperationRest<typeof membersDomain.accountChangeOperation>
  ): OperationResult<typeof membersDomain.accountChangeOperation> {
    return membersDomain.accountChangeOperation(this as never, ...args);
  }
  removeMember(
    ...args: OperationRest<typeof membersDomain.removeMemberOperation>
  ): OperationResult<typeof membersDomain.removeMemberOperation> {
    return membersDomain.removeMemberOperation(this as never, ...args);
  }
  transferProjectLeader(
    ...args: OperationRest<typeof membersDomain.transferProjectLeaderOperation>
  ): OperationResult<typeof membersDomain.transferProjectLeaderOperation> {
    return membersDomain.transferProjectLeaderOperation(this as never, ...args);
  }
  addProjectAdmin(
    ...args: OperationRest<typeof membersDomain.addProjectAdminOperation>
  ): OperationResult<typeof membersDomain.addProjectAdminOperation> {
    return membersDomain.addProjectAdminOperation(this as never, ...args);
  }
  removeProjectAdmin(
    ...args: OperationRest<typeof membersDomain.removeProjectAdminOperation>
  ): OperationResult<typeof membersDomain.removeProjectAdminOperation> {
    return membersDomain.removeProjectAdminOperation(this as never, ...args);
  }
  recoverProjectLeader(
    ...args: OperationRest<typeof membersDomain.recoverProjectLeaderOperation>
  ): OperationResult<typeof membersDomain.recoverProjectLeaderOperation> {
    return membersDomain.recoverProjectLeaderOperation(this as never, ...args);
  }
  addMember(
    ...args: OperationRest<typeof membersDomain.addMemberOperation>
  ): OperationResult<typeof membersDomain.addMemberOperation> {
    return membersDomain.addMemberOperation(this as never, ...args);
  }
  updateMemberRole(
    ...args: OperationRest<typeof membersDomain.updateMemberRoleOperation>
  ): OperationResult<typeof membersDomain.updateMemberRoleOperation> {
    return membersDomain.updateMemberRoleOperation(this as never, ...args);
  }
  projectChange(
    ...args: OperationRest<typeof projectsDomain.projectChangeOperation>
  ): OperationResult<typeof projectsDomain.projectChangeOperation> {
    return projectsDomain.projectChangeOperation(this as never, ...args);
  }
  updateProject(
    ...args: OperationRest<typeof projectsDomain.updateProjectOperation>
  ): OperationResult<typeof projectsDomain.updateProjectOperation> {
    return projectsDomain.updateProjectOperation(this as never, ...args);
  }
  projects(
    ...args: OperationRest<typeof projectsDomain.projectsOperation>
  ): OperationResult<typeof projectsDomain.projectsOperation> {
    return projectsDomain.projectsOperation(this as never, ...args);
  }
  updateProjectTab(
    ...args: OperationRest<typeof projectsDomain.updateProjectTabOperation>
  ): OperationResult<typeof projectsDomain.updateProjectTabOperation> {
    return projectsDomain.updateProjectTabOperation(this as never, ...args);
  }
  reorderProjectTabs(
    ...args: OperationRest<typeof projectsDomain.reorderProjectTabsOperation>
  ): OperationResult<typeof projectsDomain.reorderProjectTabsOperation> {
    return projectsDomain.reorderProjectTabsOperation(this as never, ...args);
  }
  createProject(
    ...args: OperationRest<typeof projectsDomain.createProjectOperation>
  ): OperationResult<typeof projectsDomain.createProjectOperation> {
    return projectsDomain.createProjectOperation(this as never, ...args);
  }
  project(
    ...args: OperationRest<typeof projectsDomain.projectOperation>
  ): OperationResult<typeof projectsDomain.projectOperation> {
    return projectsDomain.projectOperation(this as never, ...args);
  }
  adminCreateProject(
    ...args: OperationRest<typeof projectsDomain.adminCreateProjectOperation>
  ): OperationResult<typeof projectsDomain.adminCreateProjectOperation> {
    return projectsDomain.adminCreateProjectOperation(this as never, ...args);
  }
  agentMonitor(
    ...args: OperationRest<typeof monitorDomain.agentMonitorOperation>
  ): OperationResult<typeof monitorDomain.agentMonitorOperation> {
    return monitorDomain.agentMonitorOperation(this as never, ...args);
  }
  agentLogs(
    ...args: OperationRest<typeof monitorDomain.agentLogsOperation>
  ): OperationResult<typeof monitorDomain.agentLogsOperation> {
    return monitorDomain.agentLogsOperation(this as never, ...args);
  }
  agentLogEvent(
    ...args: OperationRest<typeof monitorDomain.agentLogEventOperation>
  ): OperationResult<typeof monitorDomain.agentLogEventOperation> {
    return monitorDomain.agentLogEventOperation(this as never, ...args);
  }
  beginIterationArchive(
    ...args: OperationRest<typeof iterationsDomain.beginIterationArchiveOperation>
  ): OperationResult<typeof iterationsDomain.beginIterationArchiveOperation> {
    return iterationsDomain.beginIterationArchiveOperation(this as never, ...args);
  }
  readArchiveWorkflow(
    ...args: OperationRest<typeof iterationsDomain.readArchiveWorkflowOperation>
  ): OperationResult<typeof iterationsDomain.readArchiveWorkflowOperation> {
    return iterationsDomain.readArchiveWorkflowOperation(this as never, ...args);
  }
  cancelIterationArchive(
    ...args: OperationRest<typeof iterationsDomain.cancelIterationArchiveOperation>
  ): OperationResult<typeof iterationsDomain.cancelIterationArchiveOperation> {
    return iterationsDomain.cancelIterationArchiveOperation(this as never, ...args);
  }
  retryIterationArchive(
    ...args: OperationRest<typeof iterationsDomain.retryIterationArchiveOperation>
  ): OperationResult<typeof iterationsDomain.retryIterationArchiveOperation> {
    return iterationsDomain.retryIterationArchiveOperation(this as never, ...args);
  }
  confirmIterationArchive(
    ...args: OperationRest<typeof iterationsDomain.confirmIterationArchiveOperation>
  ): OperationResult<typeof iterationsDomain.confirmIterationArchiveOperation> {
    return iterationsDomain.confirmIterationArchiveOperation(this as never, ...args);
  }
  listIterationContextChanges(
    ...args: OperationRest<typeof iterationsDomain.listIterationContextChangesOperation>
  ): OperationResult<typeof iterationsDomain.listIterationContextChangesOperation> {
    return iterationsDomain.listIterationContextChangesOperation(this as never, ...args);
  }
  updateThread(
    ...args: OperationRest<typeof iterationsDomain.updateThreadOperation>
  ): OperationResult<typeof iterationsDomain.updateThreadOperation> {
    return iterationsDomain.updateThreadOperation(this as never, ...args);
  }
  createThread(
    ...args: OperationRest<typeof iterationsDomain.createThreadOperation>
  ): OperationResult<typeof iterationsDomain.createThreadOperation> {
    return iterationsDomain.createThreadOperation(this as never, ...args);
  }
  context(
    ...args: OperationRest<typeof iterationsDomain.contextOperation>
  ): OperationResult<typeof iterationsDomain.contextOperation> {
    return iterationsDomain.contextOperation(this as never, ...args);
  }
  insertMessage(
    ...args: OperationRest<typeof messagesDomain.insertMessageOperation>
  ): OperationResult<typeof messagesDomain.insertMessageOperation> {
    return messagesDomain.insertMessageOperation(this as never, ...args);
  }
  markThreadRead(
    ...args: OperationRest<typeof messagesDomain.markThreadReadOperation>
  ): OperationResult<typeof messagesDomain.markThreadReadOperation> {
    return messagesDomain.markThreadReadOperation(this as never, ...args);
  }
  listMessages(
    ...args: OperationRest<typeof messagesDomain.listMessagesOperation>
  ): OperationResult<typeof messagesDomain.listMessagesOperation> {
    return messagesDomain.listMessagesOperation(this as never, ...args);
  }
  readMessage(
    ...args: OperationRest<typeof messagesDomain.readMessageOperation>
  ): OperationResult<typeof messagesDomain.readMessageOperation> {
    return messagesDomain.readMessageOperation(this as never, ...args);
  }
  conversationMembers(
    ...args: OperationRest<typeof messagesDomain.conversationMembersOperation>
  ): OperationResult<typeof messagesDomain.conversationMembersOperation> {
    return messagesDomain.conversationMembersOperation(this as never, ...args);
  }
  postMessage(
    ...args: OperationRest<typeof messagesDomain.postMessageOperation>
  ): OperationResult<typeof messagesDomain.postMessageOperation> {
    return messagesDomain.postMessageOperation(this as never, ...args);
  }
  notify(
    ...args: OperationRest<typeof notificationsDomain.notifyOperation>
  ): OperationResult<typeof notificationsDomain.notifyOperation> {
    return notificationsDomain.notifyOperation(this as never, ...args);
  }
  notifications(
    ...args: OperationRest<typeof notificationsDomain.notificationsOperation>
  ): OperationResult<typeof notificationsDomain.notificationsOperation> {
    return notificationsDomain.notificationsOperation(this as never, ...args);
  }
  readNotification(
    ...args: OperationRest<typeof notificationsDomain.readNotificationOperation>
  ): OperationResult<typeof notificationsDomain.readNotificationOperation> {
    return notificationsDomain.readNotificationOperation(this as never, ...args);
  }
  openNotification(
    ...args: OperationRest<typeof notificationsDomain.openNotificationOperation>
  ): OperationResult<typeof notificationsDomain.openNotificationOperation> {
    return notificationsDomain.openNotificationOperation(this as never, ...args);
  }

  users(user: ParamAt<typeof usersDomain, 1>, projectId: ParamAt<typeof usersDomain, 2>) {
    return usersDomain(this as never, user, projectId, { fail });
  }
  createUser(
    user: ParamAt<typeof createUserDomain, 1>,
    input: ParamAt<typeof createUserDomain, 2>,
  ) {
    return createUserDomain(this as never, user, input, { title, fail });
  }
  adminProjects(user: ParamAt<typeof adminProjectsDomain, 1>) {
    return adminProjectsDomain(this as never, user);
  }
  updateAdminProject(
    user: ParamAt<typeof updateAdminProjectDomain, 1>,
    projectId: ParamAt<typeof updateAdminProjectDomain, 2>,
    input: ParamAt<typeof updateAdminProjectDomain, 3>,
  ) {
    return updateAdminProjectDomain(this as never, user, projectId, input, { id, title, fail });
  }
  setProjectArchived(
    user: ParamAt<typeof setProjectArchivedDomain, 1>,
    projectId: ParamAt<typeof setProjectArchivedDomain, 2>,
    archived: ParamAt<typeof setProjectArchivedDomain, 3>,
  ) {
    return setProjectArchivedDomain(this as never, user, projectId, archived, { id, fail });
  }
  adminAccounts(user: ParamAt<typeof adminAccountsDomain, 1>) {
    return adminAccountsDomain(this as never, user);
  }
  setAccountDisabled(
    user: ParamAt<typeof setAccountDisabledDomain, 1>,
    userId: ParamAt<typeof setAccountDisabledDomain, 2>,
    input: ParamAt<typeof setAccountDisabledDomain, 3>,
  ) {
    return setAccountDisabledDomain(this as never, user, userId, input, { id, fail });
  }
  resetAccountPassword(
    user: ParamAt<typeof resetAccountPasswordDomain, 1>,
    userId: ParamAt<typeof resetAccountPasswordDomain, 2>,
  ) {
    return resetAccountPasswordDomain(this as never, user, userId, { id, fail });
  }
}
