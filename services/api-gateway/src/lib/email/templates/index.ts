/**
 * Quiet Confidence email HTML shell — dark navy, no marketing aggression.
 */
export function emailShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#060D1A;color:#EFF6FF;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060D1A;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1B2E;border-radius:12px;border:1px solid #1A3050;padding:32px;">
        <tr><td style="font-size:13px;letter-spacing:0.08em;color:#3B82F6;font-weight:600;padding-bottom:16px;">QUANTROAPEX</td></tr>
        <tr><td style="font-size:22px;font-weight:600;color:#EFF6FF;padding-bottom:12px;">${title}</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#94A3B8;">${bodyHtml}</td></tr>
        <tr><td style="padding-top:28px;font-size:12px;color:#64748B;">Quantro Software Labs · noreply@quantrolabs.app</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function welcomeTemplate(name: string): { subject: string; html: string } {
  return {
    subject: 'Welcome to QuantroApex',
    html: emailShell(
      'Welcome to QuantroApex',
      `<p>Hi ${name || 'there'},</p>
       <p>Your account is ready. Complete onboarding to set your Risk Vault and choose how Apex should trade for you.</p>
       <p style="margin-top:20px;"><a href="https://apex.quantrolabs.app" style="color:#3B82F6;text-decoration:none;">Start onboarding →</a></p>`,
    ),
  };
}

export function dailyDigestTemplate(params: {
  dateLabel: string;
  pnl: number;
  trades: number;
  apexStatus: string;
  portfolio: number;
  currency?: string;
}): { subject: string; html: string } {
  const sign = params.pnl >= 0 ? '+' : '';
  const cur = params.currency ?? '₦';
  return {
    subject: `Your Apex summary for ${params.dateLabel}`,
    html: emailShell(
      `Your Apex summary for ${params.dateLabel}`,
      `<p>Net P&amp;L: <strong style="color:${params.pnl >= 0 ? '#10B981' : '#EF4444'}">${sign}${cur}${Math.abs(params.pnl).toLocaleString()}</strong></p>
       <p>Trades: ${params.trades}</p>
       <p>Apex status: ${params.apexStatus}</p>
       <p>Portfolio: ${cur}${params.portfolio.toLocaleString()}</p>`,
    ),
  };
}

export function weeklyReportTemplate(params: {
  rangeLabel: string;
  summary: string;
  topTradesHtml: string;
}): { subject: string; html: string } {
  return {
    subject: `Your weekly performance — ${params.rangeLabel}`,
    html: emailShell(
      `Weekly performance — ${params.rangeLabel}`,
      `<p>${params.summary}</p>
       <p style="margin-top:16px;color:#EFF6FF;font-weight:600;">Top trades</p>
       ${params.topTradesHtml}`,
    ),
  };
}

export function waitlistConfirmationTemplate(assetClass: string): {
  subject: string;
  html: string;
} {
  const label = assetClass === 'CRYPTO' ? 'Crypto' : 'Forex';
  return {
    subject: `You're on the QuantroApex ${label} waitlist`,
    html: emailShell(
      `You're on the ${label} waitlist`,
      `<p>Thanks for your interest. We'll notify you when ${label} trading launches on QuantroApex.</p>
       <p style="margin-top:12px;">Rough timeline: ${label === 'Crypto' ? 'V2' : 'V3'}.</p>`,
    ),
  };
}
