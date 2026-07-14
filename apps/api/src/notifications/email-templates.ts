/* Branded email templates (§8). Navy header with lockup, CTA, audit footnote. */

export interface EmailContent {
  subject: string;
  bodyText: string;
  ctaLabel: string;
  ctaUrl: string;
}

export type NotificationKind = 'submitted' | 'approved' | 'changes' | 'rejected' | 'reminder';

export function renderEmailHtml(c: EmailContent): string {
  return `<!doctype html><html><body style="margin:0;background:#eef1f6;font-family:Segoe UI,Inter,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(20,40,90,.12);">
        <tr><td style="background:linear-gradient(120deg,#1c3f8c,#1080c0);padding:22px 28px;">
          <span style="color:#fff;font-weight:800;font-size:18px;letter-spacing:-.02em;">Biltema · Birgma</span>
          <div style="color:#dce7fb;font-size:12px;margin-top:2px;">Employee Appraisal Platform</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="font-size:19px;color:#14213d;margin:0 0 12px;">${escapeHtml(c.subject)}</h1>
          <p style="font-size:14px;line-height:1.6;color:#3a4a63;margin:0 0 22px;">${escapeHtml(c.bodyText)}</p>
          <a href="${escapeAttr(c.ctaUrl)}" style="display:inline-block;background:#1080c0;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:9px;">${escapeHtml(c.ctaLabel)}</a>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e6ebf3;">
          <p style="font-size:11px;color:#8091a8;margin:0;line-height:1.5;">Sent via Microsoft Graph on behalf of the Appraisal Platform. This message and the action it references are recorded in the immutable audit log (ISO 27001 A.12.4).</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
