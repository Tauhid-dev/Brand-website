"use client";

import { useState } from "react";

export function BillingCheckoutButton() {
  const [state, setState] = useState<"IDLE" | "WORKING" | "ERROR">("IDLE");
  const [message, setMessage] = useState("");
  async function begin() {
    setState("WORKING"); setMessage("");
    try {
      const response = await fetch("/api/v1/customer/billing/checkout", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: "{}",
      });
      const result = await response.json() as { data?: { checkoutUrl?: string }; error?: { message?: string } };
      if (!response.ok || !result.data?.checkoutUrl) throw new Error(result.error?.message || "Secure checkout could not be started.");
      window.location.assign(result.data.checkoutUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Secure checkout could not be started."); setState("ERROR"); }
  }
  return <div className="portal-action"><button className="button small" type="button" disabled={state === "WORKING"} onClick={begin}>{state === "WORKING" ? "Opening secure checkout…" : "Set up secure billing"}</button>{state === "ERROR" ? <p role="alert" className="portal-empty">{message}</p> : null}</div>;
}

export function ProviderSubscriptionControls({ subscriptionId }: { subscriptionId: string }) {
  const [operation, setOperation] = useState("UPDATE");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  async function synchronize() {
    if (!window.confirm(`Synchronize ${operation.toLowerCase()} with the configured billing provider?`)) return;
    setWorking(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/admin/subscriptions/${encodeURIComponent(subscriptionId)}/provider-sync`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ operation }),
      });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "Provider synchronization failed.");
      setMessage(`${operation} was accepted by the billing provider.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Provider synchronization failed."); }
    finally { setWorking(false); }
  }
  return <div className="portal-action"><label>Billing-provider action <select value={operation} onChange={(event) => setOperation(event.target.value)}><option value="UPDATE">Update recurring price</option><option value="SUSPEND">Pause collection</option><option value="RESUME">Resume collection</option><option value="CANCEL">Cancel provider subscription</option></select></label><button className="button small" type="button" onClick={synchronize} disabled={working}>{working ? "Synchronizing…" : "Synchronize provider"}</button>{message ? <p role="status">{message}</p> : null}</div>;
}
