# Phase 13 API hardening schema

Migration: `site/drizzle/0011_yummy_vin_gonzales.sql`, applied after Phase 12.

Phase 13 adds no commercial tables or columns. It adds composite creation-time
and UUID indexes used by stable cursor queries for customers, subscriptions,
invoices, discounts, promotion codes, notification deliveries and audit events.
Status-prefixed variants support the most common controlled filters. The prior
single-column customer creation index is replaced by its left-prefix-compatible
composite equivalent.

The migration is forward-only, preserves all commercial records and is covered
for both a Phase 12 upgrade and a clean migration chain. Query-plan tests verify
the filtered customer, invoice and notification paths select the intended
indexes.
