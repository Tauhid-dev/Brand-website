# Zuno Pixel website guide

## Purpose and architecture

The public site presents Zuno Pixel as one connected local-business growth
system, not an isolated web-design or chatbot service. The production surface
lives in `site/` and uses Next-compatible App Router conventions through
Vinext, React 19, TypeScript, Tailwind's existing CSS pipeline, Cloudflare
Worker-compatible ESM output, and the Sites hosting manifest.

Marketing content is statically rendered where practical. Only navigation,
accordions, the deterministic AI demonstration and forms use client-side
JavaScript. Shared service and industry templates prevent route duplication.
The audit API validates server-side, rate-limits, applies a honeypot and
delegates through a typed application port to a configuration-gated HTTPS lead
destination. It fails closed when delivery is unavailable, does not log or
persist form content, and reports success only after the destination accepts it.

## Local development and validation

```bash
cd site
npm ci
npm run dev
npx tsc --noEmit
npm run lint
npm test
```

From the repository root, also preserve the Genesis baseline:

```bash
./scripts/validate-framework
./scripts/validate-planning planning
python3 -m unittest discover -s tests -v
```

## Brand and rebranding

Edit `site/lib/config.ts` for versioned brand content, packages, currency, GST
message, logo paths and calls to action. Supply deployment-specific legal name,
ABN, domain, contact details, social links and analytics identifier through the
typed `NEXT_PUBLIC_*` values listed in `site/.env.example`. Unconfigured optional
facts are omitted rather than replaced by invented public details. Replace
`site/public/favicon.svg` and `site/public/og.png` with approved assets.

Search the repository for the current name after a rebrand, then separately
scan for the retired name documented in the rebrand history:

```bash
rg "Zuno Pixel|zuno-pixel" site --glob '!node_modules/**' --glob '!dist/**'
# Replace OLD_BRAND_PATTERN with the retired brand variations.
rg -i "OLD_BRAND_PATTERN" . --glob '!site/node_modules/**' --glob '!site/dist/**'
```

Any retired-brand match must be removed or listed in the rebrand history with a
technical reason. Git history and already-applied migration identifiers are not
rewritten.

## Rebrand history

The public/product brand changed to Zuno Pixel on 23 August 2026. No source,
configuration, asset, generated planning artefact or public content requires
the retired name. Git history is intentionally immutable and remains the only
historical record.

## Editing content and pricing

- Services, industries, navigation, FAQs, packages, add-ons and disclosures:
  `site/lib/config.ts`
- Homepage section composition: `site/app/page.tsx`
- Shared service, industry, legal, pricing, audit and contact templates:
  `site/app/[...slug]/page.tsx`
- Visual tokens and responsive rules: `site/app/globals.css`

Prices are integer Australian-dollar amounts and display as plus GST through
the central GST disclosure. Confirm every amount and inclusion before launch.

## Forms and integrations

`site/app/api/audit/route.ts` validates both audit and contact requests and calls
`SubmitWebsiteLeadService`. `HttpWebsiteLeadDelivery` posts the field-minimised
contract to `LEAD_DELIVERY_URL` with `LEAD_DELIVERY_TOKEN` and the request ID as
an idempotency key. Before launch:

1. Configure an HTTPS destination that accepts the documented JSON contract.
2. Store the bearer token only in the hosting secret store.
3. Confirm destination idempotency, retention, access control and incident handling.
4. Exercise accepted, rejected and timeout paths in the deployed stage.
5. Keep form contents out of analytics, application logs and audit snapshots.

## Analytics

`site/lib/analytics.ts` exposes a provider-neutral event function and filters
properties whose keys could contain names, email, phone, address, suburb,
business or message data. Configure `NEXT_PUBLIC_GA4_MEASUREMENT_ID` only after
consent requirements and the provider adapter are approved. Never send form
contents.

## SEO checklist

- Confirm `NEXT_PUBLIC_SITE_URL`; the safe canonical default is `https://zunopixel.com.au`.
- Confirm unique page titles, descriptions and canonical URLs.
- Validate Organisation/ProfessionalService, Service, breadcrumb and visible
  FAQ structured data before adding any further schema.
- Do not add ratings, reviews or ranking claims without real supporting proof.
- Submit `/sitemap.xml` and verify `/robots.txt`.
- Verify Open Graph and X previews using the approved `public/og.png`.
- Configure Search Console after the domain is verified.

## Deployment

The site uses `.openai/hosting.json` and is designed for Sites/Cloudflare
Worker deployment. Build with `npm run build`, save the exact source state as a
Sites version, and deploy only that saved version. Environment values belong in
the hosting environment, never in source control.

Rollback means redeploying the previous known-good saved version. The lead API
fails closed if its external delivery configuration is absent or unavailable.

The current release gate, provider activation, monitoring, retention, migration
failure and application rollback procedure is in
`docs/operations/LAUNCH_AND_ROLLBACK.md`. All migrations through 0014 are
forward-only and remain in place during an application rollback.

## Asset replacement

The current design uses CSS-driven product visuals and one generated social
preview. Approved photography can be introduced below the fold without
changing the information architecture. Use WebP or AVIF where appropriate,
provide intrinsic dimensions and useful alt text, lazy-load below-the-fold
media, and avoid customer logos or recognisable work without written approval.
Keep the CSS visual as a fallback when photography is unavailable.

## External launch configuration and review

- Legal entity, ABN, verified contact details and social URLs.
- Final approved logo, favicon and photography, if different from current assets.
- CRM/form delivery endpoint and operational support destination.
- Analytics provider, measurement identifiers and consent handling.
- Search Console and WhatsApp Business Platform configuration.
- Privacy Policy, Terms and AI & Data Usage Policy require Australian legal
  review before publication.

## Launch checklist

- [ ] Configure verified contact information.
- [ ] Confirm legal entity and ABN.
- [ ] Confirm GST status and pricing.
- [ ] Verify the canonical domain and DNS.
- [ ] Add approved logo, favicon and imagery.
- [ ] Configure and test form delivery.
- [ ] Configure analytics and consent.
- [ ] Configure Search Console.
- [ ] Validate sitemap, robots and canonical URLs.
- [ ] Validate structured data.
- [x] Run automated structural and local-browser accessibility checks.
- [ ] Run production Lighthouse tests.
- [ ] Verify mobile, tablet and desktop layouts.
- [x] Verify keyboard-accessible navigation/form structure and required-field operation.
- [x] Verify every homepage internal link in the production worker build.
- [ ] Configure and verify social profiles.
- [ ] Obtain legal approval for privacy, terms and AI/data content.
- [ ] Confirm WhatsApp pricing and usage disclosures.
- [ ] Confirm no fabricated proof, rankings, ratings or customer claims remain.

Phase 10 also verifies production security headers, absence of permissive CORS,
same-origin write enforcement, bounded request bodies and HTML/JS/CSS launch
budgets. Lighthouse and the remaining device/legal/integration items stay open
because they require the final deployment environment or stakeholder approval.
