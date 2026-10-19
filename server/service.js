import {
  adminAccounts as adminAccountsDomain,
  adminProjects as adminProjectsDomain,
  updateAdminProject as updateAdminProjectDomain,
  createUser as createUserDomain,
  resetAccountPassword as resetAccountPasswordDomain,
  setAccountDisabled as setAccountDisabledDomain,
  setProjectArchived as setProjectArchivedDomain,
  users as usersDomain,
} from "./service-admin.js";
import { HttpError } from "./http-error.js";
import { DocumentsService } from "./documents/service.js";
import * as accessDomain from "./service-access.js";
import * as membersDomain from "./service-members.js";
import * as projectsDomain from "./service-projects.js";
import * as monitorDomain from "./service-monitor.js";
import * as iterationsDomain from "./service-iterations.js";
import * as messagesDomain from "./service-messages.js";
import * as notificationsDomain from "./service-notification-operations.js";
import { fail, id, title } from "./service-support.js";
export { officialTitleWithVersion } from "./documents/service.js";
export { HttpError };

export class Service extends DocumentsService {
  constructor(db) {
    super(db);
  }
  async createIterationFolders() {}
  projectManager(...args) {
    return accessDomain.projectManagerOperation(this, ...args);
  }
  projectLeader(...args) {
    return accessDomain.projectLeaderOperation(this, ...args);
  }
  systemAdmin(...args) {
    return accessDomain.systemAdminOperation(this, ...args);
  }
  adminPermission(...args) {
    return accessDomain.adminPermissionOperation(this, ...args);
  }
  member(...args) {
    return accessDomain.memberOperation(this, ...args);
  }
  thread(...args) {
    return accessDomain.threadOperation(this, ...args);
  }
  accountChange(...args) {
    return membersDomain.accountChangeOperation(this, ...args);
  }
  removeMember(...args) {
    return membersDomain.removeMemberOperation(this, ...args);
  }
  transferProjectLeader(...args) {
    return membersDomain.transferProjectLeaderOperation(this, ...args);
  }
  addProjectAdmin(...args) {
    return membersDomain.addProjectAdminOperation(this, ...args);
  }
  removeProjectAdmin(...args) {
    return membersDomain.removeProjectAdminOperation(this, ...args);
  }
  recoverProjectLeader(...args) {
    return membersDomain.recoverProjectLeaderOperation(this, ...args);
  }
  addMember(...args) {
    return membersDomain.addMemberOperation(this, ...args);
  }
  updateMemberRole(...args) {
    return membersDomain.updateMemberRoleOperation(this, ...args);
  }
  projectChange(...args) {
    return projectsDomain.projectChangeOperation(this, ...args);
  }
  updateProject(...args) {
    return projectsDomain.updateProjectOperation(this, ...args);
  }
  projects(...args) {
    return projectsDomain.projectsOperation(this, ...args);
  }
  updateProjectTab(...args) {
    return projectsDomain.updateProjectTabOperation(this, ...args);
  }
  reorderProjectTabs(...args) {
    return projectsDomain.reorderProjectTabsOperation(this, ...args);
  }
  createProject(...args) {
    return projectsDomain.createProjectOperation(this, ...args);
  }
  project(...args) {
    return projectsDomain.projectOperation(this, ...args);
  }
  adminCreateProject(...args) {
    return projectsDomain.adminCreateProjectOperation(this, ...args);
  }
  agentMonitor(...args) {
    return monitorDomain.agentMonitorOperation(this, ...args);
  }
  agentLogs(...args) {
    return monitorDomain.agentLogsOperation(this, ...args);
  }
  agentLogEvent(...args) {
    return monitorDomain.agentLogEventOperation(this, ...args);
  }
  beginIterationArchive(...args) {
    return iterationsDomain.beginIterationArchiveOperation(this, ...args);
  }
  readArchiveWorkflow(...args) {
    return iterationsDomain.readArchiveWorkflowOperation(this, ...args);
  }
  cancelIterationArchive(...args) {
    return iterationsDomain.cancelIterationArchiveOperation(this, ...args);
  }
  retryIterationArchive(...args) {
    return iterationsDomain.retryIterationArchiveOperation(this, ...args);
  }
  confirmIterationArchive(...args) {
    return iterationsDomain.confirmIterationArchiveOperation(this, ...args);
  }
  listIterationContextChanges(...args) {
    return iterationsDomain.listIterationContextChangesOperation(this, ...args);
  }
  updateThread(...args) {
    return iterationsDomain.updateThreadOperation(this, ...args);
  }
  createThread(...args) {
    return iterationsDomain.createThreadOperation(this, ...args);
  }
  context(...args) {
    return iterationsDomain.contextOperation(this, ...args);
  }
  insertMessage(...args) {
    return messagesDomain.insertMessageOperation(this, ...args);
  }
  markThreadRead(...args) {
    return messagesDomain.markThreadReadOperation(this, ...args);
  }
  listMessages(...args) {
    return messagesDomain.listMessagesOperation(this, ...args);
  }
  readMessage(...args) {
    return messagesDomain.readMessageOperation(this, ...args);
  }
  conversationMembers(...args) {
    return messagesDomain.conversationMembersOperation(this, ...args);
  }
  postMessage(...args) {
    return messagesDomain.postMessageOperation(this, ...args);
  }
  notify(...args) {
    return notificationsDomain.notifyOperation(this, ...args);
  }
  notifications(...args) {
    return notificationsDomain.notificationsOperation(this, ...args);
  }
  readNotification(...args) {
    return notificationsDomain.readNotificationOperation(this, ...args);
  }
  openNotification(...args) {
    return notificationsDomain.openNotificationOperation(this, ...args);
  }
  users(user, projectId) {
    return usersDomain(this, user, projectId, { fail });
  }
  createUser(user, input) {
    return createUserDomain(this, user, input, { title, fail });
  }
  adminProjects(user) {
    return adminProjectsDomain(this, user);
  }
  updateAdminProject(user, projectId, input) {
    return updateAdminProjectDomain(this, user, projectId, input, { id, title, fail });
  }
  setProjectArchived(user, projectId, archived) {
    return setProjectArchivedDomain(this, user, projectId, archived, { id, fail });
  }
  adminAccounts(user) {
    return adminAccountsDomain(this, user);
  }
  setAccountDisabled(user, userId, input) {
    return setAccountDisabledDomain(this, user, userId, input, { id, fail });
  }
  resetAccountPassword(user, userId) {
    return resetAccountPasswordDomain(this, user, userId, { id, fail });
  }
}
