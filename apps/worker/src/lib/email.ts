import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is required");
  resendClient = new Resend(key);
  return resendClient;
}

const FROM = process.env.EMAIL_FROM ?? "HQ <hello@email.yourhq.ai>";
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? "hello@yourhq.ai";

export async function sendMagicLink(email: string, magicLink: string): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    replyTo: REPLY_TO,
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
    replyTo: REPLY_TO,
    to: email,
    subject: `Your HQ workspace "${workspaceLabel}" is ready`,
    html: `
      <p>Your workspace <strong>${workspaceLabel}</strong> has been provisioned and is ready to use.</p>
      <p><a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#171717;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">Open your workspace</a></p>
    `,
  });
}

export async function sendSandboxError(email: string, workspaceLabel: string, dashboardUrl: string): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: email,
    subject: `Action needed: "${workspaceLabel}" gateway is offline`,
    html: `
      <p>The gateway for your workspace <strong>${workspaceLabel}</strong> encountered an issue. We attempted to restart it automatically but it's still not responding.</p>
      <p><a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#171717;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">Check your workspace</a></p>
      <p style="color:#666;font-size:13px;">If the issue persists, reply to this email or contact support@yourhq.ai.</p>
    `,
  });
}

export async function sendPaymentFailed(email: string, workspaceLabel: string, billingUrl: string, failureCount: number): Promise<void> {
  const resend = getResend();
  const isFinal = failureCount >= 3;
  await resend.emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: email,
    subject: isFinal
      ? `Action required: "${workspaceLabel}" has been suspended`
      : `Payment failed for "${workspaceLabel}"`,
    html: isFinal
      ? `
        <p>We were unable to process payment for your workspace <strong>${workspaceLabel}</strong> after multiple attempts. Your workspace has been <strong>suspended</strong> — agents are paused and the runtime is offline.</p>
        <p>Update your payment method to restore access:</p>
        <p><a href="${billingUrl}" style="display:inline-block;padding:12px 24px;background:#171717;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">Update payment method</a></p>
        <p style="color:#666;font-size:13px;">If you have questions, reply to this email or contact support@yourhq.ai.</p>
      `
      : `
        <p>A payment for your workspace <strong>${workspaceLabel}</strong> could not be processed. Stripe will retry automatically, but you may want to check your payment method.</p>
        <p><a href="${billingUrl}" style="display:inline-block;padding:12px 24px;background:#171717;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">Check billing</a></p>
        <p style="color:#666;font-size:13px;">No action is needed if your card issuer resolves this on retry. After 3 failed attempts, your workspace will be suspended until payment is resolved.</p>
      `,
  });
}
