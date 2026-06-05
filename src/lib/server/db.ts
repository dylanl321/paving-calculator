import type { D1Database } from '../../cloudflare';
import { DbAuthHelper } from './db-auth';
import { DbOrgHelper } from './db-org';
import { DbJobSitesHelper } from './db-jobsites';
import { DbCrewHelper } from './db-crews';
import { DbMilestoneHelper } from './db-milestones';
import { DbWebhookHelper } from './db-webhooks';
import { DbPhotoHelper } from './db-photos';
import { DbLogHelper } from './db-logs';

// Re-export all types from domain helpers
export type { DbUser, DbSession } from './db-auth';
export type { DbOrganization, DbOrgMember, DbOrgSettings, DbInvitation } from './db-org';
export type {
	DbJobSite,
	JobSiteContractMeta,
	DbBidItem,
	DbProductionMix,
	DbSchematic,
	DbJobDocument,
	DbJobSiteAssignment,
	DbCalculation,
	DbJobSiteConfig,
	DbJobSiteEquipment,
	DbJobSiteRoute,
	DbRoadSection,
	DbLoad
} from './db-jobsites';
export type { DbCrewLocation } from './db-crews';
export type {
	DbNotificationPref,
	DbEmailLog,
	DbNotificationSchedule,
	DbEmailReportSchedule,
	DbDotRoadSegment,
	DbDotSyncLog
} from './db-logs';

export class DbHelper {
	private _auth?: DbAuthHelper;
	private _org?: DbOrgHelper;
	private _jobSites?: DbJobSitesHelper;
	private _crews?: DbCrewHelper;
	private _milestones?: DbMilestoneHelper;
	private _webhooks?: DbWebhookHelper;
	private _photos?: DbPhotoHelper;
	private _logs?: DbLogHelper;

	constructor(private db: D1Database) {}

	get auth() { return this._auth ??= new DbAuthHelper(this.db); }
	get org() { return this._org ??= new DbOrgHelper(this.db); }
	get jobSites() { return this._jobSites ??= new DbJobSitesHelper(this.db); }
	get crews() { return this._crews ??= new DbCrewHelper(this.db); }
	get milestones() { return this._milestones ??= new DbMilestoneHelper(this.db); }
	get webhooks() { return this._webhooks ??= new DbWebhookHelper(this.db); }
	get photos() { return this._photos ??= new DbPhotoHelper(this.db); }
	get logs() { return this._logs ??= new DbLogHelper(this.db); }
	prepare(query: string) { return this.db.prepare(query); }

	// ---------------------------------------------------------------------------
	// Flat proxy methods — forward to the appropriate sub-helper so that call
	// sites that predate the namespaced refactor still type-check correctly.
	// ---------------------------------------------------------------------------

	// auth sub-helper proxies
	getUserByEmail(...args: Parameters<DbAuthHelper['getUserByEmail']>) { return this.auth.getUserByEmail(...args); }
	getUserById(...args: Parameters<DbAuthHelper['getUserById']>) { return this.auth.getUserById(...args); }
	createUser(...args: Parameters<DbAuthHelper['createUser']>) { return this.auth.createUser(...args); }
	updateUser(...args: Parameters<DbAuthHelper['updateUser']>) { return this.auth.updateUser(...args); }
	deleteUser(...args: Parameters<DbAuthHelper['deleteUser']>) { return this.auth.deleteUser(...args); }
	setEmailVerified(...args: Parameters<DbAuthHelper['setEmailVerified']>) { return this.auth.setEmailVerified(...args); }
	updatePassword(...args: Parameters<DbAuthHelper['updatePassword']>) { return this.auth.updatePassword(...args); }
	createEmailToken(...args: Parameters<DbAuthHelper['createEmailToken']>) { return this.auth.createEmailToken(...args); }
	getEmailToken(...args: Parameters<DbAuthHelper['getEmailToken']>) { return this.auth.getEmailToken(...args); }
	markEmailTokenUsed(...args: Parameters<DbAuthHelper['markEmailTokenUsed']>) { return this.auth.markEmailTokenUsed(...args); }
	createSession(...args: Parameters<DbAuthHelper['createSession']>) { return this.auth.createSession(...args); }
	getSession(...args: Parameters<DbAuthHelper['getSession']>) { return this.auth.getSession(...args); }
	deleteSession(...args: Parameters<DbAuthHelper['deleteSession']>) { return this.auth.deleteSession(...args); }
	deleteSessionsByUserId(...args: Parameters<DbAuthHelper['deleteSessionsByUserId']>) { return this.auth.deleteSessionsByUserId(...args); }
	getSessionsByUserId(...args: Parameters<DbAuthHelper['getSessionsByUserId']>) { return this.auth.getSessionsByUserId(...args); }
	getAllUsers(...args: Parameters<DbAuthHelper['getAllUsers']>) { return this.auth.getAllUsers(...args); }
	getRecentUsers(...args: Parameters<DbAuthHelper['getRecentUsers']>) { return this.auth.getRecentUsers(...args); }
	cleanExpiredSessions(...args: Parameters<DbAuthHelper['cleanExpiredSessions']>) { return this.auth.cleanExpiredSessions(...args); }

	// org sub-helper proxies
	getOrgByUserId(...args: Parameters<DbOrgHelper['getOrgByUserId']>) { return this.org.getOrgByUserId(...args); }
	getOrgById(...args: Parameters<DbOrgHelper['getOrgById']>) { return this.org.getOrgById(...args); }
	getOrgBySlug(...args: Parameters<DbOrgHelper['getOrgBySlug']>) { return this.org.getOrgBySlug(...args); }
	getOrganizationById(...args: Parameters<DbOrgHelper['getOrganizationById']>) { return this.org.getOrganizationById(...args); }
	getAllOrganizations(...args: Parameters<DbOrgHelper['getAllOrganizations']>) { return this.org.getAllOrganizations(...args); }
	createOrganization(...args: Parameters<DbOrgHelper['createOrganization']>) { return this.org.createOrganization(...args); }
	updateOrganization(...args: Parameters<DbOrgHelper['updateOrganization']>) { return this.org.updateOrganization(...args); }
	setOrganizationArchived(...args: Parameters<DbOrgHelper['setOrganizationArchived']>) { return this.org.setOrganizationArchived(...args); }
	getOrgSettings(...args: Parameters<DbOrgHelper['getOrgSettings']>) { return this.org.getOrgSettings(...args); }
	upsertOrgSettings(...args: Parameters<DbOrgHelper['upsertOrgSettings']>) { return this.org.upsertOrgSettings(...args); }
	getUserRole(...args: Parameters<DbOrgHelper['getUserRole']>) { return this.org.getUserRole(...args); }
	getUserMember(...args: Parameters<DbOrgHelper['getUserMember']>) { return this.org.getUserMember(...args); }
	getUserMemberships(...args: Parameters<DbOrgHelper['getUserMemberships']>) { return this.org.getUserMemberships(...args); }
	getOrgMembersByOrgId(...args: Parameters<DbOrgHelper['getOrgMembersByOrgId']>) { return this.org.getOrgMembersByOrgId(...args); }
	addOrgMember(...args: Parameters<DbOrgHelper['addOrgMember']>) { return this.org.addOrgMember(...args); }
	updateOrgMemberRole(...args: Parameters<DbOrgHelper['updateOrgMemberRole']>) { return this.org.updateOrgMemberRole(...args); }
	removeOrgMember(...args: Parameters<DbOrgHelper['removeOrgMember']>) { return this.org.removeOrgMember(...args); }
	createInvitation(...args: Parameters<DbOrgHelper['createInvitation']>) { return this.org.createInvitation(...args); }
	getInvitationByToken(...args: Parameters<DbOrgHelper['getInvitationByToken']>) { return this.org.getInvitationByToken(...args); }
	getInvitationByEmail(...args: Parameters<DbOrgHelper['getInvitationByEmail']>) { return this.org.getInvitationByEmail(...args); }
	getInvitationById(...args: Parameters<DbOrgHelper['getInvitationById']>) { return this.org.getInvitationById(...args); }
	getInvitationsByOrgId(...args: Parameters<DbOrgHelper['getInvitationsByOrgId']>) { return this.org.getInvitationsByOrgId(...args); }
	deleteInvitation(...args: Parameters<DbOrgHelper['deleteInvitation']>) { return this.org.deleteInvitation(...args); }
	acceptInvitation(...args: Parameters<DbOrgHelper['acceptInvitation']>) { return this.org.acceptInvitation(...args); }
	getAdminStats(...args: Parameters<DbOrgHelper['getAdminStats']>) { return this.org.getAdminStats(...args); }
	getRecentOrganizations(...args: Parameters<DbOrgHelper['getRecentOrganizations']>) { return this.org.getRecentOrganizations(...args); }
	getOrgsNeedingAttention(...args: Parameters<DbOrgHelper['getOrgsNeedingAttention']>) { return this.org.getOrgsNeedingAttention(...args); }
	cleanExpiredInvitations(...args: Parameters<DbOrgHelper['cleanExpiredInvitations']>) { return this.org.cleanExpiredInvitations(...args); }

	// jobSites sub-helper proxies
	getJobSiteById(...args: Parameters<DbJobSitesHelper['getJobSiteById']>) { return this.jobSites.getJobSiteById(...args); }
	getJobSitesByOrgId(...args: Parameters<DbJobSitesHelper['getJobSitesByOrgId']>) { return this.jobSites.getJobSitesByOrgId(...args); }
	getJobSiteCountByOrgId(...args: Parameters<DbJobSitesHelper['getJobSiteCountByOrgId']>) { return this.jobSites.getJobSiteCountByOrgId(...args); }
	createJobSite(...args: Parameters<DbJobSitesHelper['createJobSite']>) { return this.jobSites.createJobSite(...args); }
	updateJobSite(...args: Parameters<DbJobSitesHelper['updateJobSite']>) { return this.jobSites.updateJobSite(...args); }
	setJobSiteContractMeta(...args: Parameters<DbJobSitesHelper['setJobSiteContractMeta']>) { return this.jobSites.setJobSiteContractMeta(...args); }
	getJobSiteConfig(...args: Parameters<DbJobSitesHelper['getJobSiteConfig']>) { return this.jobSites.getJobSiteConfig(...args); }
	upsertJobSiteConfig(...args: Parameters<DbJobSitesHelper['upsertJobSiteConfig']>) { return this.jobSites.upsertJobSiteConfig(...args); }
	getJobSiteRoute(...args: Parameters<DbJobSitesHelper['getJobSiteRoute']>) { return this.jobSites.getJobSiteRoute(...args); }
	upsertJobSiteRoute(...args: Parameters<DbJobSitesHelper['upsertJobSiteRoute']>) { return this.jobSites.upsertJobSiteRoute(...args); }
	assignUserToJobSite(...args: Parameters<DbJobSitesHelper['assignUserToJobSite']>) { return this.jobSites.assignUserToJobSite(...args); }
	getJobSiteAssignments(...args: Parameters<DbJobSitesHelper['getJobSiteAssignments']>) { return this.jobSites.getJobSiteAssignments(...args); }
	getJobSiteEquipment(...args: Parameters<DbJobSitesHelper['getJobSiteEquipment']>) { return this.jobSites.getJobSiteEquipment(...args); }
	createJobSiteEquipment(...args: Parameters<DbJobSitesHelper['createJobSiteEquipment']>) { return this.jobSites.createJobSiteEquipment(...args); }
	deleteJobSiteEquipment(...args: Parameters<DbJobSitesHelper['deleteJobSiteEquipment']>) { return this.jobSites.deleteJobSiteEquipment(...args); }
	getProductionMix(...args: Parameters<DbJobSitesHelper['getProductionMix']>) { return this.jobSites.getProductionMix(...args); }
	getProductionMixes(...args: Parameters<DbJobSitesHelper['getProductionMixes']>) { return this.jobSites.getProductionMixes(...args); }
	createProductionMix(...args: Parameters<DbJobSitesHelper['createProductionMix']>) { return this.jobSites.createProductionMix(...args); }
	updateProductionMix(...args: Parameters<DbJobSitesHelper['updateProductionMix']>) { return this.jobSites.updateProductionMix(...args); }
	deleteProductionMix(...args: Parameters<DbJobSitesHelper['deleteProductionMix']>) { return this.jobSites.deleteProductionMix(...args); }
	deleteProductionMixes(...args: Parameters<DbJobSitesHelper['deleteProductionMixes']>) { return this.jobSites.deleteProductionMixes(...args); }
	setActiveMix(...args: Parameters<DbJobSitesHelper['setActiveMix']>) { return this.jobSites.setActiveMix(...args); }
	getBidItems(...args: Parameters<DbJobSitesHelper['getBidItems']>) { return this.jobSites.getBidItems(...args); }
	createBidItem(...args: Parameters<DbJobSitesHelper['createBidItem']>) { return this.jobSites.createBidItem(...args); }
	deleteBidItems(...args: Parameters<DbJobSitesHelper['deleteBidItems']>) { return this.jobSites.deleteBidItems(...args); }
	getSchematic(...args: Parameters<DbJobSitesHelper['getSchematic']>) { return this.jobSites.getSchematic(...args); }
	getSchematics(...args: Parameters<DbJobSitesHelper['getSchematics']>) { return this.jobSites.getSchematics(...args); }
	createSchematic(...args: Parameters<DbJobSitesHelper['createSchematic']>) { return this.jobSites.createSchematic(...args); }
	getJobDocument(...args: Parameters<DbJobSitesHelper['getJobDocument']>) { return this.jobSites.getJobDocument(...args); }
	getJobDocuments(...args: Parameters<DbJobSitesHelper['getJobDocuments']>) { return this.jobSites.getJobDocuments(...args); }
	createJobDocument(...args: Parameters<DbJobSitesHelper['createJobDocument']>) { return this.jobSites.createJobDocument(...args); }
	getCalculationById(...args: Parameters<DbJobSitesHelper['getCalculationById']>) { return this.jobSites.getCalculationById(...args); }
	getCalculations(...args: Parameters<DbJobSitesHelper['getCalculations']>) { return this.jobSites.getCalculations(...args); }
	createCalculation(...args: Parameters<DbJobSitesHelper['createCalculation']>) { return this.jobSites.createCalculation(...args); }
	deleteCalculation(...args: Parameters<DbJobSitesHelper['deleteCalculation']>) { return this.jobSites.deleteCalculation(...args); }

	// logs sub-helper proxies
	logEmail(...args: Parameters<DbLogHelper['logEmail']>) { return this.logs.logEmail(...args); }
	getEmailLog(...args: Parameters<DbLogHelper['getEmailLog']>) { return this.logs.getEmailLog(...args); }
	getNotificationPrefs(...args: Parameters<DbLogHelper['getNotificationPrefs']>) { return this.logs.getNotificationPrefs(...args); }
	bulkSetNotificationPrefs(...args: Parameters<DbLogHelper['bulkSetNotificationPrefs']>) { return this.logs.bulkSetNotificationPrefs(...args); }
	getNotificationSchedules(...args: Parameters<DbLogHelper['getNotificationSchedules']>) { return this.logs.getNotificationSchedules(...args); }
	upsertNotificationSchedule(...args: Parameters<DbLogHelper['upsertNotificationSchedule']>) { return this.logs.upsertNotificationSchedule(...args); }
	deleteNotificationSchedule(...args: Parameters<DbLogHelper['deleteNotificationSchedule']>) { return this.logs.deleteNotificationSchedule(...args); }
	getEmailReportSchedules(...args: Parameters<DbLogHelper['getEmailReportSchedules']>) { return this.logs.getEmailReportSchedules(...args); }
	upsertEmailReportSchedule(...args: Parameters<DbLogHelper['upsertEmailReportSchedule']>) { return this.logs.upsertEmailReportSchedule(...args); }
	deleteEmailReportSchedule(...args: Parameters<DbLogHelper['deleteEmailReportSchedule']>) { return this.logs.deleteEmailReportSchedule(...args); }
	markEmailReportScheduleSent(...args: Parameters<DbLogHelper['markEmailReportScheduleSent']>) { return this.logs.markEmailReportScheduleSent(...args); }
	upsertDotSegment(...args: Parameters<DbLogHelper['upsertDotSegment']>) { return this.logs.upsertDotSegment(...args); }
	logDotSync(...args: Parameters<DbLogHelper['logDotSync']>) { return this.logs.logDotSync(...args); }
	getLastDotSync(...args: Parameters<DbLogHelper['getLastDotSync']>) { return this.logs.getLastDotSync(...args); }
	upsertGdotConstructionProject(...args: Parameters<DbLogHelper['upsertGdotConstructionProject']>) { return this.logs.upsertGdotConstructionProject(...args); }
	getGdotConstructionProjectsByCounty(...args: Parameters<DbLogHelper['getGdotConstructionProjectsByCounty']>) { return this.logs.getGdotConstructionProjectsByCounty(...args); }
	getGdotConstructionProjects(...args: Parameters<DbLogHelper['getGdotConstructionProjects']>) { return this.logs.getGdotConstructionProjects(...args); }
}
