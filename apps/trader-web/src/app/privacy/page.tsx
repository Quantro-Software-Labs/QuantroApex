import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — QuantroApex',
  description: 'Official Privacy Policy for QuantroApex by Quantro Software Labs.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#060D1A] text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <main className="max-w-3xl mx-auto space-y-8 bg-[#0F172A] border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl">
        <div>
          <Link href="/" className="text-xs font-semibold text-blue-400 hover:underline">
            &larr; Return to QuantroApex
          </Link>
          <h1 className="text-3xl font-extrabold text-white mt-4 tracking-tight">Privacy Policy</h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            QuantroApex by Quantro Software Labs &middot; Last updated: 1 October 2026
          </p>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">
          QuantroApex (&ldquo;the App&rdquo;) helps you simulate and, after identity verification, execute automated trades. This policy explains what data we collect, why, and your choices.
        </p>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-blue-300">1. Data We Collect</h2>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-2">
            <li><strong>Account Data:</strong> Email and/or phone number, display name (Firebase Auth).</li>
            <li><strong>Profile Data:</strong> Experience level, onboarding progress, Risk Vault parameters.</li>
            <li><strong>Trading Records:</strong> Orders, fills, positions, and simulation portfolio states.</li>
            <li><strong>Identity Verification:</strong> KYC documents processed securely via Sumsub for live trading.</li>
            <li><strong>Payment Information:</strong> Billing email & Paystack transaction references (card details are never stored).</li>
            <li><strong>Device Diagnostics:</strong> Optional telemetry & error logs (PostHog / Sentry).</li>
          </ul>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-blue-300">2. How We Use Data</h2>
          <ul className="list-disc pl-5 text-sm text-slate-300 space-y-2">
            <li>Provide paper simulation and live broker execution features.</li>
            <li>Enforce server-side Risk Vault safeguards and regulatory KYC verification.</li>
            <li>Process subscription payments and issue transactional security alerts.</li>
            <li>Monitor engine health, latency, and uptime.</li>
          </ul>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-blue-300">3. Data Sharing & Processors</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            We share data only with authorized processors necessary to operate the platform: Firebase (Authentication), Supabase/Postgres (Database), Alpaca Markets (Broker Execution), Sumsub (KYC Verification), Paystack (Subscriptions), and PostHog/Sentry (Telemetry). We do not sell personal data.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-blue-300">4. Retention & Contact</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Trading logs are retained while your account remains active. For data access or deletion requests, contact our privacy team at{' '}
            <a href="mailto:support@quantrolabs.app" className="text-blue-400 underline font-medium">
              support@quantrolabs.app
            </a>.
          </p>
        </div>
      </main>
    </div>
  );
}
