import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is required");
  resendClient = new Resend(key);
  return resendClient;
}

const FROM = process.env.EMAIL_FROM ?? "HQ <noreply@yourhq.ai>";

export async function sendMagicLink(email: string, magicLink: string): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Sign in to HQ",
    html: `
      <p>Click the link below to sign in to your HQ workspace:</p>
      <p><a href="${magicLink}" style="display:inline-block;padding:12px 24px;background:#171717;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">Sign in to HQ</a></p>
      <p style="color:#666;font-size:13px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    `,
  });
}

export async function sendProvisioningComplete(email: string, workspaceLabel: string, dashboardUrl: string): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Your HQ workspace "${workspaceLabel}" is ready`,
    html: `
      <p>Your workspace <strong>${workspaceLabel}</strong> has been provisioned and is ready to use.</p>
      <p><a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#171717;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">Open your workspace</a></p>
    `,
  });
}
