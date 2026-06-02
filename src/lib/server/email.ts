interface EmailPayload {
	from: string;
	to: string;
	subject: string;
	html: string;
	replyTo?: string;
}

export interface OrgBranding {
	orgName?: string;
	accentColor?: string;
	emailFromName?: string;
	emailReplyTo?: string;
}

async function sendEmail(apiKey: string, payload: EmailPayload): Promise<boolean> {
	try {
		const requestBody: Record<string, string> = {
			from: payload.from,
			to: payload.to,
			subject: payload.subject,
			html: payload.html
		};

		if (payload.replyTo) {
			requestBody.reply_to = payload.replyTo;
		}

		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('Resend API error:', response.status, error);
			return false;
		}

		return true;
	} catch (error) {
		console.error('Email send error:', error);
		return false;
	}
}

function getContrastColor(hexColor: string): string {
	const hex = hexColor.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	const luma = 0.299 * r + 0.587 * g + 0.114 * b;
	return luma > 186 ? '#1b2228' : '#f4f6f7';
}

export function buildEmailTemplate(
	content: {
		title: string;
		greeting: string;
		message: string;
		ctaText: string;
		ctaUrl: string;
		footer: string;
	},
	branding?: OrgBranding
): string {
	const accentColor = branding?.accentColor ?? '#f2c037';
	const buttonTextColor = getContrastColor(accentColor);
	const orgName = branding?.orgName ?? 'PaveRate';
	const showPoweredBy = orgName !== 'PaveRate';

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${content.title}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="background:#1b2228;padding:40px 20px;min-height:100vh;">
    <div style="max-width:480px;margin:0 auto;background:#232c34;border-radius:12px;padding:32px;border:1px solid #37444f;">
      <h1 style="color:${accentColor};margin:0 0 16px;font-size:24px;font-weight:700;">${orgName}</h1>

      <p style="color:#f4f6f7;font-size:16px;line-height:1.6;margin:0 0 12px;">
        ${content.greeting}
      </p>

      <p style="color:#cdd8e0;font-size:15px;line-height:1.6;margin:0 0 28px;">
        ${content.message}
      </p>

      <a href="${content.ctaUrl}" style="display:inline-block;padding:14px 28px;background:${accentColor};color:${buttonTextColor};text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;">
        ${content.ctaText}
      </a>

      <p style="color:#7e8f9c;font-size:13px;line-height:1.5;margin:28px 0 0;padding-top:24px;border-top:1px solid #37444f;">
        ${content.footer}
      </p>${
				showPoweredBy
					? '\n      <p style="color:#7e8f9c;font-size:12px;margin:12px 0 0;text-align:center;">Powered by PaveRate</p>'
					: ''
			}
    </div>
  </div>
</body>
</html>`;
}

export async function sendVerificationEmail(
	apiKey: string | undefined,
	to: string,
	name: string,
	token: string,
	baseUrl: string,
	branding?: OrgBranding
): Promise<boolean> {
	if (!apiKey) {
		console.warn('RESEND_API_KEY not set, skipping verification email');
		return false;
	}

	const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
	const fromName = branding?.emailFromName ?? 'PaveRate';
	const orgName = branding?.orgName ?? 'PaveRate';

	const html = buildEmailTemplate(
		{
			title: 'Verify your email',
			greeting: `Hi ${name},`,
			message: `Thanks for signing up for ${orgName}! Click the button below to verify your email address and get full access to your account.`,
			ctaText: 'Verify Email',
			ctaUrl: verifyUrl,
			footer: `If you didn't create a ${orgName} account, you can safely ignore this email. This link will expire in 24 hours.`
		},
		branding
	);

	return await sendEmail(apiKey, {
		from: `${fromName} <noreply@paverate.com>`,
		to,
		subject: `Verify your ${orgName} account`,
		html,
		replyTo: branding?.emailReplyTo
	});
}

export async function sendPasswordResetEmail(
	apiKey: string | undefined,
	to: string,
	name: string,
	token: string,
	baseUrl: string,
	branding?: OrgBranding
): Promise<boolean> {
	if (!apiKey) {
		console.warn('RESEND_API_KEY not set, skipping password reset email');
		return false;
	}

	const resetUrl = `${baseUrl}/reset-password?token=${token}`;
	const fromName = branding?.emailFromName ?? 'PaveRate';
	const orgName = branding?.orgName ?? 'PaveRate';

	const html = buildEmailTemplate(
		{
			title: 'Reset your password',
			greeting: `Hi ${name},`,
			message: `We received a request to reset your password. Click the button below to choose a new password. If you didn't request this, you can ignore this email.`,
			ctaText: 'Reset Password',
			ctaUrl: resetUrl,
			footer: `For security, this link will expire in 1 hour. If you didn't request a password reset, please ignore this email.`
		},
		branding
	);

	return await sendEmail(apiKey, {
		from: `${fromName} <noreply@paverate.com>`,
		to,
		subject: `Reset your ${orgName} password`,
		html,
		replyTo: branding?.emailReplyTo
	});
}

export async function sendInvitationEmail(
	apiKey: string | undefined,
	to: string,
	inviterName: string,
	orgName: string,
	token: string,
	baseUrl: string,
	branding?: OrgBranding
): Promise<boolean> {
	if (!apiKey) {
		console.warn('RESEND_API_KEY not set, skipping invitation email');
		return false;
	}

	const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;
	const fromName = branding?.emailFromName ?? 'PaveRate';
	const displayOrgName = branding?.orgName ?? orgName;

	const html = buildEmailTemplate(
		{
			title: "You've been invited",
			greeting: `Hi there,`,
			message: `${inviterName} has invited you to join <strong>${displayOrgName}</strong> on PaveRate. Click below to accept the invitation and get started.`,
			ctaText: 'Accept Invitation',
			ctaUrl: inviteUrl,
			footer: 'This invitation will expire in 7 days.'
		},
		branding
	);

	return await sendEmail(apiKey, {
		from: `${fromName} <noreply@paverate.com>`,
		to,
		subject: `${inviterName} invited you to ${displayOrgName} on PaveRate`,
		html,
		replyTo: branding?.emailReplyTo
	});
}

export async function sendWelcomeEmail(
	apiKey: string | undefined,
	to: string,
	name: string,
	orgName: string,
	baseUrl: string,
	branding?: OrgBranding
): Promise<boolean> {
	if (!apiKey) {
		console.warn('RESEND_API_KEY not set, skipping welcome email');
		return false;
	}

	const fromName = branding?.emailFromName ?? 'PaveRate';
	const displayOrgName = branding?.orgName ?? orgName;

	const html = buildEmailTemplate(
		{
			title: 'Welcome to PaveRate!',
			greeting: `Hi ${name},`,
			message: `You have successfully joined <strong>${displayOrgName}</strong> on PaveRate. You can now collaborate with your team, track paving jobs, and stay on top of daily progress.`,
			ctaText: 'Go to Dashboard',
			ctaUrl: `${baseUrl}/dashboard`,
			footer: `You received this email because you accepted an invitation to join ${displayOrgName} on PaveRate.`
		},
		branding
	);

	return await sendEmail(apiKey, {
		from: `${fromName} <noreply@paverate.com>`,
		to,
		subject: `Welcome to ${displayOrgName}!`,
		html,
		replyTo: branding?.emailReplyTo
	});
}

export function buildPreviewEmail(
	type: 'invitation' | 'verification' | 'password-reset',
	branding?: OrgBranding
): { html: string; subject: string; from: string } {
	const fromName = branding?.emailFromName ?? 'PaveRate';
	const orgName = branding?.orgName ?? 'PaveRate';
	const from = `${fromName} <noreply@paverate.com>`;

	if (type === 'invitation') {
		const html = buildEmailTemplate(
			{
				title: "You've been invited",
				greeting: 'Hi there,',
				message: `Jane Smith has invited you to join <strong>${orgName}</strong> on PaveRate. Click below to accept the invitation and get started.`,
				ctaText: 'Accept Invitation',
				ctaUrl: 'https://paverate.com/accept-invite?token=preview',
				footer: 'This invitation will expire in 7 days.'
			},
			branding
		);
		return {
			html,
			subject: `Jane Smith invited you to ${orgName} on PaveRate`,
			from
		};
	}

	if (type === 'verification') {
		const html = buildEmailTemplate(
			{
				title: 'Verify your email',
				greeting: 'Hi John,',
				message: `Thanks for signing up for ${orgName}! Click the button below to verify your email address and get full access to your account.`,
				ctaText: 'Verify Email',
				ctaUrl: 'https://paverate.com/api/auth/verify-email?token=preview',
				footer: `If you didn't create a ${orgName} account, you can safely ignore this email. This link will expire in 24 hours.`
			},
			branding
		);
		return {
			html,
			subject: `Verify your ${orgName} account`,
			from
		};
	}

	// password-reset
	const html = buildEmailTemplate(
		{
			title: 'Reset your password',
			greeting: 'Hi John,',
			message: 'We received a request to reset your password. Click the button below to choose a new password. If you didn\'t request this, you can ignore this email.',
			ctaText: 'Reset Password',
			ctaUrl: 'https://paverate.com/reset-password?token=preview',
			footer: 'For security, this link will expire in 1 hour. If you didn\'t request a password reset, please ignore this email.'
		},
		branding
	);
	return {
		html,
		subject: `Reset your ${orgName} password`,
		from
	};
}
