-- PostgreSQL equivalents for the cross-row and immutable-history guarantees
-- that SQLite implements with D1 triggers.

create or replace function zuno_prevent_change() returns trigger language plpgsql as $$
begin
  raise exception '%', TG_ARGV[0] using errcode = 'integrity_constraint_violation';
end;
$$;

create or replace function zuno_require_version_step() returns trigger language plpgsql as $$
begin
  if new.version <> old.version + 1 then
    raise exception '%', TG_ARGV[0] using errcode = 'serialization_failure';
  end if;
  return new;
end;
$$;

create trigger audit_events_immutable_update before update on audit_events for each row execute function zuno_prevent_change('AUDIT_EVENTS_IMMUTABLE');
create trigger audit_events_immutable_delete before delete on audit_events for each row execute function zuno_prevent_change('AUDIT_EVENTS_IMMUTABLE');
create trigger price_quotes_immutable_update before update on price_quotes for each row execute function zuno_prevent_change('PRICE_QUOTE_IMMUTABLE');
create trigger price_quotes_immutable_delete before delete on price_quotes for each row execute function zuno_prevent_change('PRICE_QUOTE_IMMUTABLE');
create trigger discount_redemptions_immutable_update before update on discount_redemptions for each row execute function zuno_prevent_change('DISCOUNT_REDEMPTION_IMMUTABLE');
create trigger discount_redemptions_immutable_delete before delete on discount_redemptions for each row execute function zuno_prevent_change('DISCOUNT_REDEMPTION_IMMUTABLE');
create trigger invoice_lines_immutable_update before update on invoice_lines for each row execute function zuno_prevent_change('INVOICE_LINES_IMMUTABLE');
create trigger invoice_lines_immutable_delete before delete on invoice_lines for each row execute function zuno_prevent_change('INVOICE_LINES_IMMUTABLE');
create trigger notification_attempts_immutable_delete before delete on notification_delivery_attempts for each row execute function zuno_prevent_change('NOTIFICATION_ATTEMPT_IMMUTABLE');
create trigger agent_attempts_immutable_delete before delete on agent_provisioning_attempts for each row execute function zuno_prevent_change('AGENT_ATTEMPT_IMMUTABLE');

create trigger subscriptions_version before update on subscriptions for each row execute function zuno_require_version_step('SUBSCRIPTION_VERSION_CONFLICT');
create trigger onboarding_cases_version before update on onboarding_cases for each row execute function zuno_require_version_step('ONBOARDING_VERSION_CONFLICT');
create trigger onboarding_tasks_version before update on onboarding_tasks for each row execute function zuno_require_version_step('ONBOARDING_TASK_VERSION_CONFLICT');
create trigger customer_integrations_version before update on customer_integrations for each row execute function zuno_require_version_step('INTEGRATION_VERSION_CONFLICT');
create trigger agent_links_version before update on agent_links for each row execute function zuno_require_version_step('AGENT_LINK_VERSION_CONFLICT');
create trigger agent_jobs_version before update on agent_provisioning_jobs for each row execute function zuno_require_version_step('AGENT_JOB_VERSION_CONFLICT');
create trigger queue_items_version before update on operational_queue_items for each row execute function zuno_require_version_step('QUEUE_VERSION_CONFLICT');
create trigger notification_deliveries_version before update on notification_deliveries for each row execute function zuno_require_version_step('NOTIFICATION_VERSION_CONFLICT');

create or replace function zuno_plan_price_no_overlap() returns trigger language plpgsql as $$
begin
  if exists (select 1 from plan_prices p where p.id <> new.id and p.plan_id = new.plan_id and p.billing_interval = new.billing_interval and p.active = 1 and new.active = 1 and p.effective_from < coalesce(new.effective_to, 9223372036854775807) and new.effective_from < coalesce(p.effective_to, 9223372036854775807)) then
    raise exception 'PRICE_VERSION_CONFLICT' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
create trigger plan_prices_no_overlap before insert or update of effective_to, active on plan_prices for each row execute function zuno_plan_price_no_overlap();

create or replace function zuno_override_no_overlap() returns trigger language plpgsql as $$
begin
  if new.status in ('SCHEDULED','ACTIVE') and exists (select 1 from customer_price_overrides p where p.id <> new.id and p.customer_id = new.customer_id and p.plan_id = new.plan_id and p.billing_interval = new.billing_interval and p.status in ('SCHEDULED','ACTIVE') and p.effective_from < coalesce(new.effective_to, 9223372036854775807) and new.effective_from < coalesce(p.effective_to, 9223372036854775807)) then
    raise exception 'PRICE_OVERRIDE_CONFLICT' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
create trigger customer_price_overrides_no_overlap before insert or update of effective_to, status on customer_price_overrides for each row execute function zuno_override_no_overlap();

create or replace function zuno_subscription_price_no_overlap() returns trigger language plpgsql as $$
begin
  if exists (select 1 from subscription_prices p where p.id <> new.id and p.subscription_id = new.subscription_id and p.effective_from < coalesce(new.effective_to, 9223372036854775807) and new.effective_from < coalesce(p.effective_to, 9223372036854775807)) then
    raise exception 'SUBSCRIPTION_PRICE_CONFLICT' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
create trigger subscription_prices_no_overlap before insert or update of effective_to on subscription_prices for each row execute function zuno_subscription_price_no_overlap();

create or replace function zuno_entitlement_no_overlap() returns trigger language plpgsql as $$
begin
  if exists (select 1 from subscription_entitlements p where p.id <> new.id and p.subscription_id = new.subscription_id and p.offering_code = new.offering_code and p.effective_from < coalesce(new.effective_to, 9223372036854775807) and new.effective_from < coalesce(p.effective_to, 9223372036854775807)) then
    raise exception 'ENTITLEMENT_VERSION_CONFLICT' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
create trigger subscription_entitlements_no_overlap before insert or update of effective_to on subscription_entitlements for each row execute function zuno_entitlement_no_overlap();
