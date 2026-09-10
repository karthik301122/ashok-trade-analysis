/** Draft legal copy for public launch. Have counsel review before relying on it in disputes. */

export const LEGAL_LAST_UPDATED = '10 September 2026'

export type LegalSection = {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: '1. Agreement',
    paragraphs: [
      'By accessing or using Traders Scope (“Service”), you agree to these Terms of Use. If you do not agree, do not use the Service. If you create an account, you confirm that you are at least 18 years old and able to enter a binding contract.',
    ],
  },
  {
    heading: '2. What Traders Scope is',
    paragraphs: [
      'Traders Scope provides market information, sector and breadth views, pattern scans, watchlists, and related tools for education and research. It is a software desk for self-directed users and training cohorts.',
      'The Service is not a licensed financial product, does not provide personal financial advice, and is not operated under an Australian Financial Services Licence (AFSL). Nothing on the Service is a recommendation to buy, sell, or hold any security.',
    ],
  },
  {
    heading: '3. No investment advice',
    paragraphs: [
      'Market data, charts, scores, pattern labels, alerts, and commentary are general information only. They may be incomplete, delayed, or incorrect. Past pattern behaviour is not a guarantee of future results. Trading and investing involve risk of loss, including loss of capital.',
      'You are solely responsible for your own decisions. Seek independent advice from a licensed professional if you need personal financial advice.',
    ],
  },
  {
    heading: '4. Accounts',
    paragraphs: [
      'You must provide accurate registration details and keep your password confidential. You are responsible for activity under your account. Notify us promptly if you suspect unauthorised access.',
      'We may suspend or terminate accounts that abuse the Service, attempt to bypass security or rate limits, scrape data at scale, share credentials, or otherwise breach these Terms.',
    ],
  },
  {
    heading: '5. Acceptable use',
    paragraphs: [
      'You agree not to:',
    ],
    bullets: [
      'Use the Service for unlawful purposes or to mislead others about market information.',
      'Interfere with availability, security, or other users’ access (including automated overload of APIs).',
      'Reverse engineer, copy, or resell substantial parts of the Service except as allowed by law.',
      'Misrepresent that Traders Scope endorses any trade, course, or investment outcome.',
    ],
  },
  {
    heading: '6. Data and third parties',
    paragraphs: [
      'Prices, fundamentals, filings, and other market data may come from third-party providers and exchanges. Data may be delayed, adjusted, or unavailable. We do not warrant that any figure is real-time or error-free.',
      'Links to third-party sites or services are for convenience only; we are not responsible for their content or practices.',
    ],
  },
  {
    heading: '7. Organisations, seats, and billing',
    paragraphs: [
      'If you purchase an individual plan or organisation seats, fees are charged through our payment processor (currently Stripe). Prices, taxes, and renewal terms are shown at checkout or in your billing portal.',
      'Unless required by law, fees are non-refundable once the billing period starts. Organisation admins are responsible for seats assigned to their members and for lawful use by those members.',
      'We may change prices with reasonable notice for the next billing period. Failure to pay may result in suspension of paid features.',
    ],
  },
  {
    heading: '8. Intellectual property',
    paragraphs: [
      'Traders Scope, its branding, UI, and original software remain our property or that of our licensors. You receive a limited, non-exclusive, non-transferable licence to use the Service for your internal research and education while your account is in good standing.',
      'You retain rights to content you submit (such as custom pattern rules or watchlists). You grant us a licence to host and process that content solely to operate the Service for you.',
    ],
  },
  {
    heading: '9. Availability and changes',
    paragraphs: [
      'We aim for reliable uptime but do not guarantee uninterrupted access. Features may change, be rate-limited, or be withdrawn. We may perform maintenance that temporarily limits the desk or APIs.',
    ],
  },
  {
    heading: '10. Disclaimers and limitation of liability',
    paragraphs: [
      'To the maximum extent permitted by Australian Consumer Law and other applicable law, the Service is provided “as is” and “as available” without warranties of merchantability, fitness for a particular purpose, or non-infringement.',
      'To the maximum extent permitted by law, we are not liable for indirect, incidental, special, consequential, or pure economic loss, or for trading losses arising from use of or reliance on the Service. Our aggregate liability for claims relating to the Service is limited to the greater of (a) fees you paid us for the Service in the three months before the claim or (b) AUD $100.',
      'Nothing in these Terms excludes non-excludable rights under the Australian Consumer Law.',
    ],
  },
  {
    heading: '11. Indemnity',
    paragraphs: [
      'You agree to indemnify and hold harmless Traders Scope and its operators from claims, losses, and expenses (including reasonable legal fees) arising from your misuse of the Service, breach of these Terms, or violation of law — except to the extent caused by our proven negligence or wilful misconduct.',
    ],
  },
  {
    heading: '12. Privacy',
    paragraphs: [
      'Personal information is handled as described in our Privacy Policy. By using the Service you acknowledge that policy.',
    ],
  },
  {
    heading: '13. Governing law',
    paragraphs: [
      'These Terms are governed by the laws of New South Wales, Australia. Courts in that jurisdiction have non-exclusive jurisdiction, subject to any non-excludable consumer rights you may have.',
    ],
  },
  {
    heading: '14. Contact',
    paragraphs: [
      'Questions about these Terms: support@tradersscope.com.',
    ],
  },
]

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: '1. Who we are',
    paragraphs: [
      'Traders Scope (“we”, “us”) operates the Service at tradersscope.com. This Privacy Policy explains how we collect, use, and share personal information when you use the Service.',
      'We aim to handle personal information in line with the Australian Privacy Principles under the Privacy Act 1988 (Cth) where that Act applies.',
    ],
  },
  {
    heading: '2. Information we collect',
    paragraphs: [
      'Depending on how you use the Service, we may collect:',
    ],
    bullets: [
      'Account details: name, email address, username, password hash (we do not store plain-text passwords).',
      'Profile and preferences: display name, watchlists, pattern preferences, alert settings, email opt-in and score thresholds.',
      'Organisation data: org name, membership, seats, and roles if you join or create an organisation.',
      'Billing data: processed by Stripe; we receive limited billing metadata (for example customer/subscription IDs and status), not full card numbers.',
      'Usage and technical data: IP address, browser type, approximate timestamps, API request metadata, and similar logs needed for security and reliability.',
      'Support content: messages you send us by email or in-product support channels.',
    ],
  },
  {
    heading: '3. How we use information',
    paragraphs: [
      'We use personal information to:',
    ],
    bullets: [
      'Create and secure your account, and provide the desk, alerts, and organisation features.',
      'Send transactional email (verification, password reset, security notices) and optional alert emails you opt into.',
      'Process payments and manage subscriptions via Stripe.',
      'Monitor abuse, rate limits, outages, and fraud; improve reliability and performance.',
      'Comply with law and enforce our Terms of Use.',
    ],
  },
  {
    heading: '4. Cookies and similar technology',
    paragraphs: [
      'We use session cookies or equivalent tokens to keep you signed in and to protect the Service. We may store simple preferences (such as theme) in local browser storage.',
      'We do not sell personal information. We do not use third-party advertising trackers as part of the core desk experience.',
    ],
  },
  {
    heading: '5. Sharing',
    paragraphs: [
      'We share personal information only as needed to run the Service, including with:',
    ],
    bullets: [
      'Hosting and infrastructure providers (for example cloud hosting and databases).',
      'Email delivery providers when SMTP or transactional email is configured.',
      'Stripe for payment processing.',
      'Market-data and related vendors as needed to deliver desk features (these typically receive tickers/queries, not your full profile).',
      'Professional advisers or authorities when required by law or to protect rights and safety.',
    ],
  },
  {
    heading: '6. International storage',
    paragraphs: [
      'Servers and subprocessors may be located in Australia or other countries. Where information is stored overseas, we take reasonable steps appropriate to the sensitivity of the data and the provider.',
    ],
  },
  {
    heading: '7. Retention',
    paragraphs: [
      'We retain account and preference data while your account is active and for a reasonable period afterward for backups, dispute handling, and legal obligations. Logs are kept for shorter operational windows unless needed for security investigations. You may request account deletion subject to lawful retention needs.',
    ],
  },
  {
    heading: '8. Security',
    paragraphs: [
      'We use industry-typical measures such as encrypted transport (HTTPS), hashed passwords, session controls, and access restrictions. No method of transmission or storage is completely secure; please use a strong unique password.',
    ],
  },
  {
    heading: '9. Your choices and rights',
    paragraphs: [
      'You can update profile details in the Service where available, opt out of optional alert emails, and close your account by contacting us. Depending on applicable law, you may request access to or correction of personal information we hold about you.',
      'To make a privacy request, email support@tradersscope.com. We may need to verify your identity before responding.',
    ],
  },
  {
    heading: '10. Children',
    paragraphs: [
      'The Service is intended for users 18 years and older. We do not knowingly collect personal information from children.',
    ],
  },
  {
    heading: '11. Changes',
    paragraphs: [
      'We may update this Privacy Policy from time to time. The “Last updated” date at the top will change when we do. Continued use after changes means you accept the updated policy, except where consent is required by law.',
    ],
  },
  {
    heading: '12. Contact',
    paragraphs: [
      'Privacy questions or complaints: support@tradersscope.com. If you are not satisfied with our response and the Privacy Act applies, you may contact the Office of the Australian Information Commissioner (OAIC).',
    ],
  },
]
