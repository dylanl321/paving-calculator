interface EmailPayload {
	from: string;
	to: string;
	subject: string;
	html: string;
}

async function sendEmail(apiKey: string, payload: EmailPayload): Promise<boolean> {
	try {
		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
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

function buildEmailTemplate(content: {
	title: string;
	greeting: string;
	message: string;
	ctaText: string;
	ctaUrl: string;
	footer: string;
}): string {
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
      <h1 style="color:#f2c037;margin:0 0 16px;font-size:24px;font-weight:700;">PaveRate</h1>

      <p style="color:#f4f6f7;font-size:16px;line-height:1.6;margin:0 0 12px;">
        ${content.greeting}
      </p>

      <p style="color:#cdd8e0;font-size:15px;line-height:1.6;margin:0 0 28px;">
        ${content.message}
      </p>

      <a href="${content.ctaUrl}" style="display:inline-block;padding:14px 28px;background:#f2c037;color:#1b2228;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;">
        ${content.ctaText}
      </a>

      <p style="color:#7e8f9c;font-size:13px;line-height:1.5;margin:28px 0 0;padding-top:24px;border-top:1px solid #37444f;">
        ${content.footer}
      </p>
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
	baseUrl: string
): Promise<boolean> {
	if (!apiKey) {
		console.warn('RESEND_API_KEY not set, skipping verification email');
		return false;
	}

	const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

	const html = buildEmailTemplate({
		title: 'Verify your email',
		greeting: `Hi ${name},`,
		message:
			"Thanks for signing up for PaveRate! Click the button below to verify your email address and get full access to your account.",
		ctaText: 'Verify Email',
		ctaUrl: verifyUrl,
		footer:
			"If you didn't create a PaveRate account, you can safely ignore this email. This link will expire in 24 hours."
	});

	return await sendEmail(apiKey, {
		from: 'noreply@paverate.com',
		to,
		subject: 'Verify your PaveRate account',
		html
	});
}

export async function sendPasswordResetEmail(
	apiKey: string | undefined,
	to: string,
	name: string,
	token: string,
	baseUrl: string
): Promise<boolean> {
	if (!apiKey) {
		console.warn('RESEND_API_KEY not set, skipping password reset email');
		return false;
	}

	const resetUrl = `${baseUrl}/reset-password?token=${token}`;

	const html = buildEmailTemplate({
		title: 'Reset your password',
		greeting: `Hi ${name},`,
		message:
			"We received a request to reset your password. Click the button below to choose a new password. If you didn't request this, you can ignore this email.",
		ctaText: 'Reset Password',
		ctaUrl: resetUrl,
		footer:
			"For security, this link will expire in 1 hour. If you didn't request a password reset, please ignore this email."
	});

	return await sendEmail(apiKey, {
		from: 'noreply@paverate.com',
		to,
		subject: 'Reset your PaveRate password',
		html
	});
}

export async function sendInvitationEmail(
	apiKey: string | undefined,
	to: string,
	inviterName: string,
	orgName: string,
	token: string,
	baseUrl: string
): Promise<boolean> {
	if (!apiKey) {
		console.warn('RESEND_API_KEY not set, skipping invitation email');
		return false;
	}

	const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;

	const html = buildEmailTemplate({
		title: "You've been invited",
		greeting: `Hi there,`,
		message: `${inviterName} has invited you to join <strong>${orgName}</strong> on PaveRate. Click below to accept the invitation and get started.`,
		ctaText: 'Accept Invitation',
		ctaUrl: inviteUrl,
		footer: 'This invitation will expire in 7 days.'
	});

	return await sendEmail(apiKey, {
		from: 'noreply@paverate.com',
		to,
		subject: `${inviterName} invited you to ${orgName} on PaveRate`,
		html
	});
}
