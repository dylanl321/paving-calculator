import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';

const VALID_ROLES = ['owner', 'admin', 'member', 'foreman', 'operator', 'inspector', 'office'];
const MAX_ROWS = 100;

interface InviteResult {
	email: string;
	role: string;
	status: 'invited' | 'skipped' | 'error';
	reason?: string;
}

function isValidEmail(email: string): boolean {
	const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return re.test(email);
}

function parseCSV(text: string): Array<{ email: string; role: string }> {
	const lines = text.trim().split(/\r?\n/);
	if (lines.length === 0) return [];

	const rows: Array<{ email: string; role: string }> = [];
	let hasHeaders = false;
	let emailIdx = 0;
	let roleIdx = 1;

	// Check if first line looks like headers
	const firstLine = lines[0].toLowerCase();
	if (firstLine.includes('email')) {
		hasHeaders = true;
		const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
		emailIdx = headers.findIndex((h) => h === 'email');
		roleIdx = headers.findIndex((h) => h === 'role');
		if (emailIdx === -1) emailIdx = 0;
		if (roleIdx === -1) roleIdx = 1;
	}

	const dataLines = hasHeaders ? lines.slice(1) : lines;

	for (const line of dataLines) {
		if (!line.trim()) continue;
		const parts = line.split(',').map((p) => p.trim());
		if (parts.length === 0) continue;

		const email = parts[emailIdx] || '';
		const role = parts[roleIdx] || 'member';

		if (email) {
			rows.push({ email, role: role.toLowerCase() });
		}
	}

	return rows;
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		// Get user's org
		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'User not associated with an organization' }, { status: 400 });
		}

		// Check user has admin/owner role
		const userRole = await db.getUserRole(user.id, org.id);
		if (userRole !== 'owner' && userRole !== 'admin') {
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}

		// Parse multipart form data
		const formData = await event.request.formData();
		const file = formData.get('csv') as File;

		if (!file) {
			return json({ error: 'No CSV file provided' }, { status: 400 });
		}

		const text = await file.text();
		const rows = parseCSV(text);

		if (rows.length === 0) {
			return json({ error: 'CSV file is empty or invalid' }, { status: 400 });
		}

		if (rows.length > MAX_ROWS) {
			return json(
				{ error: `Too many rows. Maximum ${MAX_ROWS} rows allowed per upload.` },
				{ status: 400 }
			);
		}

		// Process each row
		const results: InviteResult[] = [];

		for (const row of rows) {
			const { email, role } = row;

			// Validate email
			if (!isValidEmail(email)) {
				results.push({
					email,
					role,
					status: 'error',
					reason: 'Invalid email format'
				});
				continue;
			}

			// Validate role
			if (!VALID_ROLES.includes(role)) {
				results.push({
					email,
					role,
					status: 'error',
					reason: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`
				});
				continue;
			}

			// Check if user already exists
			const existingUser = await db.getUserByEmail(email);
			if (existingUser) {
				// Check if already in org
				const existingRole = await db.getUserRole(existingUser.id, org.id);
				if (existingRole) {
					results.push({
						email,
						role,
						status: 'skipped',
						reason: 'Already a member'
					});
					continue;
				}
			}

			// Check if invitation already exists
			const existingInvite = await db.getInvitationByEmail(org.id, email);
			if (existingInvite) {
				results.push({
					email,
					role,
					status: 'skipped',
					reason: 'Invitation already pending'
				});
				continue;
			}

			// Create invitation
			try {
				await db.createInvitation(
					org.id,
					email,
					role as 'owner' | 'admin' | 'member' | 'foreman' | 'operator' | 'inspector' | 'office',
					user.id
				);

				await recordAudit(event.platform!.env.DB, {
					actorUserId: user.id,
					actorName: user.name,
					orgId: org.id,
					resourceType: 'org_member',
					resourceId: email,
					action: 'bulk_invited',
					newValue: { email, role },
					ipAddress:
						event.request.headers.get('cf-connecting-ip') ||
						event.request.headers.get('x-forwarded-for') ||
						undefined,
					userAgent: event.request.headers.get('user-agent') || undefined
				});

				results.push({
					email,
					role,
					status: 'invited'
				});
			} catch (error) {
				console.error(`Failed to create invitation for ${email}:`, error);
				results.push({
					email,
					role,
					status: 'error',
					reason: 'Failed to create invitation'
				});
			}
		}

		// Calculate summary
		const invited = results.filter((r) => r.status === 'invited').length;
		const skipped = results.filter((r) => r.status === 'skipped').length;
		const errors = results.filter((r) => r.status === 'error').length;

		return json({
			results,
			total: results.length,
			invited,
			skipped,
			errors
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error processing bulk invitations:', error);
		return json({ error: 'Failed to process bulk invitations' }, { status: 500 });
	}
}
