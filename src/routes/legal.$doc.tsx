import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MarketingShell } from "@/components/site/MarketingShell";

const CURRENT_VERSION = "2025-09";
const COMPANY = "Givewell";
const COMPANY_EMAIL = "legal@givewell.charity";
const COMPANY_ADDRESS = "Givewell, England, United Kingdom";
const GOVERNING_LAW = "England and Wales";

type DocId = "terms" | "privacy" | "data-retention";

const DOCS: Record<DocId, { title: string; subtitle: string; content: () => JSX.Element }> = {
  terms: {
    title: "Terms of Service",
    subtitle: `Effective ${CURRENT_VERSION} · Version ${CURRENT_VERSION}`,
    content: TermsContent,
  },
  privacy: {
    title: "Privacy Policy",
    subtitle: `Effective ${CURRENT_VERSION} · Compliant with UK GDPR`,
    content: PrivacyContent,
  },
  "data-retention": {
    title: "Data Retention Policy",
    subtitle: `Effective ${CURRENT_VERSION} · Includes HMRC Gift Aid requirements`,
    content: DataRetentionContent,
  },
};

export const Route = createFileRoute("/legal/$doc")({
  head: ({ params }) => {
    const doc = DOCS[params.doc as DocId];
    return {
      meta: [
        { title: doc ? `${doc.title} — Givewell` : "Legal — Givewell" },
      ],
    };
  },
  component: LegalPage,
});

function LegalPage() {
  const { doc: docId } = Route.useParams();
  const doc = DOCS[docId as DocId];

  if (!doc) throw notFound();

  const Content = doc.content;

  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="mb-10">
          <p className="text-sm text-muted-foreground">
            <Link to="/" className="hover:underline">Home</Link>
            {" / "}
            <Link to="/legal/$doc" params={{ doc: docId }} className="hover:underline">Legal</Link>
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">{doc.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{doc.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            {(Object.keys(DOCS) as DocId[]).map((key) => (
              <Link
                key={key}
                to="/legal/$doc"
                params={{ doc: key }}
                className={`rounded-full border px-3 py-1 transition-colors ${
                  key === docId
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {DOCS[key].title}
              </Link>
            ))}
          </div>
        </div>

        <div className="prose prose-sm max-w-none [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_ul]:text-muted-foreground [&_li]:leading-relaxed [&_strong]:text-foreground">
          <Content />
        </div>

        <div className="mt-16 rounded-xl border border-border bg-muted/40 px-6 py-5">
          <p className="text-sm font-medium">Questions or requests?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Contact us at{" "}
            <a href={`mailto:${COMPANY_EMAIL}`} className="font-medium text-foreground underline underline-offset-2">
              {COMPANY_EMAIL}
            </a>
            {" "}for any data, privacy, or legal enquiries.
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}

/* ─── Terms of Service ─────────────────────────────────────────────────── */

function TermsContent() {
  return (
    <>
      <h2>1. Acceptance of Terms</h2>
      <p>
        By creating an account on {COMPANY} ("the Service", "we", "us", "our"), you confirm that
        you have read, understood, and agree to be bound by these Terms of Service and all
        policies incorporated by reference, including our{" "}
        <Link to="/legal/$doc" params={{ doc: "privacy" }} className="underline">Privacy Policy</Link>
        {" "}and{" "}
        <Link to="/legal/$doc" params={{ doc: "data-retention" }} className="underline">Data Retention Policy</Link>.
        If you are accepting on behalf of an organisation, you represent that you have authority to do so.
      </p>

      <h2>2. Eligibility &amp; Account</h2>
      <p>
        The Service is intended for registered charities, non-profit organisations, and fundraising
        professionals in the United Kingdom and internationally. You must be at least 18 years old
        to create an account. You are responsible for maintaining the confidentiality of your login
        credentials and for all activity under your account. You agree to notify us immediately of
        any unauthorised access.
      </p>

      <h2>3. Description of Service</h2>
      <p>
        {COMPANY} is a cloud-based donor and donation management platform. We provide tools
        for recording donor information, managing fundraising campaigns, processing Gift Aid
        declarations, generating reports, sending email communications to donors, and integrating
        with third-party systems via API and webhooks. The Service is provided "as is" and
        functionality may change over time as we improve the platform.
      </p>

      <h2>4. Data You Process Through the Service</h2>
      <p>
        You retain ownership of all donor data, donation records, and other content you upload
        or create within the Service. By using the Service, you grant us a limited licence to
        store, process, and transmit that data solely to provide the Service to you. You are
        responsible for ensuring you have the appropriate legal basis to process your donors'
        personal data (including Gift Aid declarations) and that you comply with applicable data
        protection laws including UK GDPR. We act as your data processor; you are the data
        controller.
      </p>

      <h2>5. Prohibited Uses</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>Process data for organisations that are not legitimate charities or non-profits</li>
        <li>Send unsolicited bulk communications (spam) to donors</li>
        <li>Circumvent or attempt to circumvent any security measures</li>
        <li>Reverse engineer, copy, or resell the Service without an authorised partner agreement</li>
        <li>Submit false or misleading Gift Aid declarations</li>
        <li>Violate any applicable law or regulation</li>
      </ul>

      <h2>6. Payment and Plans</h2>
      <p>
        Certain features of the Service require a paid subscription. Paid plans are billed on a
        monthly or annual basis as selected at time of purchase. All prices are exclusive of VAT
        where applicable. You may cancel your subscription at any time; you will retain access
        until the end of your paid billing period. We reserve the right to change pricing with
        30 days' notice. Refunds are not provided for partial billing periods except where
        required by applicable law.
      </p>

      <h2>7. Suspension and Termination</h2>
      <p>
        We may suspend or terminate your account if you breach these Terms, engage in fraudulent
        activity, or if your account is inactive for more than 24 months. On termination, you
        may request an export of your data within 30 days. After 30 days following termination,
        your data will be deleted in accordance with our Data Retention Policy, subject to any
        statutory obligations.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, {COMPANY} shall not be liable for any indirect,
        incidental, special, consequential, or punitive damages, including loss of data, revenue,
        or profits, arising from your use of the Service. Our total liability for any claim
        arising from these Terms shall not exceed the total fees paid by you in the 12 months
        preceding the claim.
      </p>

      <h2>9. Availability</h2>
      <p>
        We aim for high availability but do not guarantee uninterrupted access. Planned maintenance
        will be communicated where reasonably practicable. We are not liable for any losses caused
        by temporary unavailability of the Service.
      </p>

      <h2>10. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. We will notify you by email and display a
        notice within the Service at least 14 days before material changes take effect. Continued
        use after the effective date constitutes acceptance of the revised Terms.
      </p>

      <h2>11. Governing Law</h2>
      <p>
        These Terms are governed by the laws of {GOVERNING_LAW}. Any disputes shall be subject
        to the exclusive jurisdiction of the courts of {GOVERNING_LAW}.
      </p>

      <h2>12. Contact</h2>
      <p>
        For legal enquiries: {COMPANY_ADDRESS}. Email: <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>.
      </p>
    </>
  );
}

/* ─── Privacy Policy ───────────────────────────────────────────────────── */

function PrivacyContent() {
  return (
    <>
      <h2>1. Who We Are</h2>
      <p>
        {COMPANY} ("{COMPANY}", "we", "us") is the data controller for personal data we collect
        about you when you use our platform. Contact: <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>.
      </p>
      <p>
        <strong>Important distinction:</strong> When you upload your donors' personal data to the
        Service, you are the data controller for that data and we act as your data processor.
        This Privacy Policy covers the data we collect about you as a user of the platform.
      </p>

      <h2>2. Data We Collect About You</h2>
      <h3>Account data</h3>
      <ul>
        <li>Name and email address (provided at registration)</li>
        <li>Organisation name, web address, and contact email</li>
        <li>Date and version of Terms and Privacy Policy acceptance</li>
        <li>Billing information (held by our payment processor; we do not store card numbers)</li>
      </ul>
      <h3>Usage data</h3>
      <ul>
        <li>Log data: browser type, IP address, pages visited, timestamps</li>
        <li>Feature usage patterns (aggregated, for product improvement)</li>
        <li>API key activity (key prefix, last-used timestamp — not the key itself)</li>
      </ul>
      <h3>Data you process on behalf of your organisation</h3>
      <p>
        Donor records, donation amounts, Gift Aid declarations, and email campaign content are
        processed by us as your data processor under your instructions. We do not use this data
        for our own purposes.
      </p>

      <h2>3. Legal Basis for Processing</h2>
      <ul>
        <li><strong>Contract:</strong> Processing your account data to provide the Service you've signed up for</li>
        <li><strong>Legitimate interests:</strong> Service security, fraud prevention, product improvement</li>
        <li><strong>Legal obligation:</strong> Retaining financial records as required by HMRC</li>
        <li><strong>Consent:</strong> Marketing communications (you may withdraw at any time)</li>
      </ul>

      <h2>4. How We Use Your Data</h2>
      <ul>
        <li>To provide, operate, and improve the Service</li>
        <li>To send transactional emails (account confirmation, password reset, invoices)</li>
        <li>To send product updates and feature announcements (opt-out available)</li>
        <li>To detect and prevent fraud and security incidents</li>
        <li>To comply with legal obligations</li>
      </ul>

      <h2>5. Data Sharing</h2>
      <p>We share your data only with:</p>
      <ul>
        <li><strong>Supabase Inc.</strong> — our database and authentication infrastructure (EU data residency)</li>
        <li><strong>Resend Inc.</strong> — transactional email delivery</li>
        <li><strong>Stripe Inc.</strong> — payment processing (PCI-DSS compliant)</li>
        <li><strong>Vercel / hosting provider</strong> — application hosting</li>
      </ul>
      <p>We do not sell, rent, or share your personal data with third parties for marketing purposes.</p>

      <h2>6. Your Rights Under UK GDPR</h2>
      <p>You have the right to:</p>
      <ul>
        <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
        <li><strong>Rectification:</strong> Ask us to correct inaccurate data</li>
        <li><strong>Erasure:</strong> Ask us to delete your data (subject to legal retention obligations)</li>
        <li><strong>Portability:</strong> Receive your data in a machine-readable format</li>
        <li><strong>Restriction:</strong> Ask us to limit how we process your data</li>
        <li><strong>Objection:</strong> Object to processing based on legitimate interests</li>
      </ul>
      <p>
        To exercise any of these rights, email <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>.
        We will respond within 30 days. You also have the right to lodge a complaint with the
        Information Commissioner's Office (ICO) at ico.org.uk.
      </p>

      <h2>7. Data Transfers</h2>
      <p>
        Your data is stored in the European Union (eu-west-1). Where transfers to the United
        States occur (e.g. for email delivery), we rely on Standard Contractual Clauses approved
        by the UK ICO.
      </p>

      <h2>8. Cookies</h2>
      <p>
        We use session cookies for authentication (strictly necessary) and may use analytics
        cookies to understand platform usage. You can disable non-essential cookies in your
        browser settings.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We will notify you of material changes to this Privacy Policy with at least 14 days'
        notice via email. The current version and effective date are shown at the top of this page.
      </p>
    </>
  );
}

/* ─── Data Retention Policy ────────────────────────────────────────────── */

function DataRetentionContent() {
  return (
    <>
      <h2>1. Purpose</h2>
      <p>
        This policy sets out how long {COMPANY} retains different categories of data, and how
        you can request deletion. It reflects legal obligations — in particular HMRC's requirements
        for Gift Aid records — and our commitment to data minimisation under UK GDPR.
      </p>

      <h2>2. Retention Schedule</h2>

      <h3>Account and profile data</h3>
      <ul>
        <li>Retained while your account is active</li>
        <li>After account deletion: retained for 30 days to allow recovery, then permanently deleted</li>
        <li>Exception: financial transaction records (invoices, subscription history) retained for 6 years per HMRC requirements</li>
      </ul>

      <h3>Donor records</h3>
      <ul>
        <li>Retained while your organisation's account is active</li>
        <li>Gift Aid declarations: retained for a minimum of <strong>6 years from the date of the last donation</strong> under HMRC rules, even if your account is closed — you will be notified and given an export</li>
        <li>Donors without any Gift Aid activity: deleted within 30 days of account closure</li>
      </ul>

      <h3>Donation records</h3>
      <ul>
        <li>Retained for <strong>7 years</strong> from the donation date — the standard HMRC accounting records requirement</li>
        <li>This applies to all donation records regardless of Gift Aid status</li>
        <li>After 7 years, donation records are anonymised (donor identity removed) rather than deleted, to allow aggregate reporting</li>
      </ul>

      <h3>Email campaign data</h3>
      <ul>
        <li>Campaign content and recipient lists: retained for 2 years from send date</li>
        <li>Delivery logs (sent/bounced/opened): retained for 90 days</li>
      </ul>

      <h3>API access logs</h3>
      <ul>
        <li>API request logs (timestamp, endpoint, response code): retained for 90 days</li>
        <li>API key metadata (name, prefix, last-used date): retained until key is revoked plus 30 days</li>
      </ul>

      <h3>Webhook and integration data</h3>
      <ul>
        <li>Webhook delivery logs: retained for 30 days</li>
        <li>Integration configuration (webhook URL): retained while account is active</li>
      </ul>

      <h3>Platform security logs</h3>
      <ul>
        <li>Authentication and access logs: retained for 12 months for security incident investigation</li>
      </ul>

      <h2>3. Your Right to Deletion</h2>
      <p>
        You may request deletion of your account at any time from Settings → Account. On receipt
        of a deletion request we will:
      </p>
      <ul>
        <li>Provide a full data export within 5 working days</li>
        <li>Delete your account and non-retained data within 30 days</li>
        <li>Notify you of any data we are legally required to retain and for how long</li>
      </ul>
      <p>
        To request deletion of specific data (e.g. a specific donor record) without closing
        your account, use the delete function within the platform or email{" "}
        <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>.
      </p>

      <h2>4. HMRC Gift Aid Records — Special Notice</h2>
      <p>
        Under HMRC guidance, charities must retain Gift Aid declaration records and supporting
        donation evidence for at least <strong>6 years after the end of the tax year in which
        the last claim was made</strong>. Even if you close your {COMPANY} account, we are
        obligated to retain Gift Aid-related records for this period and may be required to
        provide them to HMRC upon request. We will contact you before retaining data beyond
        your account closure date.
      </p>

      <h2>5. Data Deletion After Retention Period</h2>
      <p>
        When data reaches the end of its retention period, it is either permanently and
        irreversibly deleted from our systems and backups (within 30 days of the retention
        period end) or anonymised such that it can no longer be associated with any individual.
      </p>

      <h2>6. Backups</h2>
      <p>
        We maintain encrypted backups of our database with a 30-day rolling window. Data
        deleted from the live database will be removed from backups when those backups expire.
        We do not restore backups to retrieve deleted data on behalf of customers except
        in cases of accidental deletion where a formal request is made within 7 days.
      </p>

      <h2>7. Contact</h2>
      <p>
        For data retention enquiries or to exercise your rights:{" "}
        <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>.
      </p>
    </>
  );
}
