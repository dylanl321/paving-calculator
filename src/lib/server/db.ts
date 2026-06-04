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
}
