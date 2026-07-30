"use client";

import { FormEvent, useState } from "react";
import { track } from "@/lib/analytics";
import { primaryNav, services } from "@/lib/config";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mobile-nav">
      <button className="menu-button" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}>
        <span>{open ? "Close" : "Menu"}</span><span aria-hidden="true">{open ? "×" : "≡"}</span>
      </button>
      {open && (
        <nav id="mobile-menu" aria-label="Mobile navigation">
          {[...primaryNav, ...services].map((item) => <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>)}
          <a className="button small" href="/growth-audit">Free Growth Audit</a>
        </nav>
      )}
    </div>
  );
}

const demoSteps = [
  {
    customer: "Hi, I’m Mia in Marrickville. Our kitchen tap is leaking badly and we need a plumber tomorrow morning.",
    agent: "I can help with that. I’ve captured the leaking kitchen tap in Marrickville as urgent. Would Tuesday at 9:30 am suit?",
    fields: { Name: "Mia", Suburb: "Marrickville", Service: "Leaking tap", Urgency: "Urgent" },
    stage: "Qualification complete",
  },
  {
    customer: "Yes, 9:30 works. Please book it.",
    agent: "Tuesday at 9:30 am is reserved. I’ll send the structured request to the team now. Would you also like a person to call you?",
    fields: { Name: "Mia", Suburb: "Marrickville", Service: "Leaking tap", Urgency: "Urgent" },
    stage: "Appointment proposed",
  },
  {
    customer: "A call would be great.",
    agent: "Done. I’ve marked this for human follow-up and passed on the booking details.",
    fields: { Name: "Mia", Suburb: "Marrickville", Service: "Leaking tap", Urgency: "Urgent" },
    stage: "Human handover requested",
  },
];

export function AiDemo() {
  const [step, setStep] = useState(0);
  const item = demoSteps[step];
  function advance() {
    const next = Math.min(step + 1, demoSteps.length - 1);
    setStep(next);
    track(next === demoSteps.length - 1 ? "ai_demo_completed" : "ai_demo_opened", { step: next + 1 });
  }
  return (
    <div className="demo-grid" aria-label="Interactive AI receptionist demonstration">
      <div className="chat-window">
        <div className="window-bar"><span className="status-dot" /> Live website enquiry <span>Demo</span></div>
        {demoSteps.slice(0, step + 1).map((message, index) => (
          <div key={index} className="chat-turn">
            <p className="bubble customer">{message.customer}</p>
            <p className="bubble agent"><strong>AI receptionist</strong>{message.agent}</p>
          </div>
        ))}
        <button className="button secondary demo-next" onClick={advance} disabled={step === demoSteps.length - 1}>
          {step === 0 ? "Offer appointment" : step === 1 ? "Request handover" : "Demo complete"}
        </button>
      </div>
      <aside className="lead-card" aria-live="polite">
        <span className="eyebrow">Structured lead</span>
        <h3>{item.stage}</h3>
        <dl>{Object.entries(item.fields).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
        <div className="booking"><span>Calendar</span><strong>Tue · 9:30 am</strong><small>Proposed slot</small></div>
      </aside>
    </div>
  );
}

export function FAQList({ items }: { items: string[][] }) {
  return <div className="faq-list">{items.map(([question, answer]) => (
    <details key={question} onToggle={(event) => {
      if (event.currentTarget.open) track("faq_interaction", { question_id: question.slice(0, 24) });
    }}>
      <summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p>
    </details>
  ))}</div>;
}

type FormState = "idle" | "submitting" | "success" | "error";

export function AuditForm({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<FormState>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const nextErrors: Record<string, string> = {};
    for (const field of ["contactName", "businessName", "industry", "location", "email", "phone", "challenge", "privacyConsent"]) {
      if (!data[field]) nextErrors[field] = "Please complete this field.";
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))) nextErrors.email = "Enter a valid email address.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors); setState("error"); return;
    }
    setErrors({}); setState("submitting");
    try {
      const response = await fetch("/api/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error("Unable to save");
      setState("success"); track("audit_form_completed", { source: compact ? "contact" : "growth_audit" }); form.reset();
    } catch {
      setState("error");
      setErrors({ form: "The development form could not be saved. Please use the configured email or phone contact instead." });
    }
  }
  if (state === "success") return <div className="form-success" role="status"><span aria-hidden="true">✓</span><h2>Your audit request is ready for review.</h2><p>This development build stores nothing and sends nothing externally. Configure the CRM adapter before launch.</p></div>;
  return (
    <form className="audit-form" onSubmit={submit} noValidate onFocus={() => track("audit_form_started")}>
      {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
      <div className="honeypot" aria-hidden="true"><label>Company fax<input name="companyFax" tabIndex={-1} autoComplete="off" /></label></div>
      <Field name="contactName" label="Contact name" error={errors.contactName} />
      <Field name="businessName" label="Business name" error={errors.businessName} />
      {!compact && <><Field name="websiteUrl" label="Website URL" type="url" hint="Optional if you do not have a website" /><Field name="googleProfileUrl" label="Google Business Profile URL" type="url" hint="Optional" /></>}
      <label>Industry<select name="industry" aria-describedby={errors.industry ? "industry-error" : undefined} defaultValue=""><option value="" disabled>Select your industry</option>{["Trades", "Professional services", "Health & beauty", "Automotive", "Home services", "Other"].map(x => <option key={x}>{x}</option>)}</select>{errors.industry && <small id="industry-error" className="field-error">{errors.industry}</small>}</label>
      <Field name="location" label="Main service location" error={errors.location} />
      <Field name="email" label="Email" type="email" error={errors.email} />
      <Field name="phone" label="Phone" type="tel" error={errors.phone} />
      <label className="full">Biggest growth challenge<textarea name="challenge" rows={4} aria-describedby={errors.challenge ? "challenge-error" : undefined} />{errors.challenge && <small id="challenge-error" className="field-error">{errors.challenge}</small>}</label>
      {!compact && <>
        <label>Current website status<select name="websiteStatus"><option>No website</option><option>Needs improvement</option><option>Recently updated</option></select></label>
        <label>Current Google profile status<select name="googleStatus"><option>Not sure</option><option>Not claimed</option><option>Claimed but inactive</option><option>Active</option></select></label>
        <fieldset className="full"><legend>Interest areas</legend><div className="check-grid">{["Website", "SEO and Google", "Reviews", "Social media", "AI receptionist", "WhatsApp", "Appointment booking", "Full growth system"].map(x => <label key={x}><input type="checkbox" name="interestAreas" value={x} />{x}</label>)}</div></fieldset>
        <label>Preferred contact method<select name="contactMethod"><option>Phone</option><option>Email</option><option>WhatsApp</option></select></label>
        <label>Preferred consultation time<select name="consultationTime"><option>Morning</option><option>Afternoon</option><option>After hours</option></select></label>
      </>}
      <label className="check full"><input type="checkbox" name="privacyConsent" value="accepted" aria-describedby={errors.privacyConsent ? "privacy-error" : undefined} />I agree to my information being used to respond to this enquiry. <a href="/privacy">Privacy policy</a>{errors.privacyConsent && <small id="privacy-error" className="field-error">{errors.privacyConsent}</small>}</label>
      <label className="check full"><input type="checkbox" name="marketingConsent" value="accepted" />I would like occasional growth insights. Optional.</label>
      <button className="button full" disabled={state === "submitting"}>{state === "submitting" ? "Preparing request…" : compact ? "Send Enquiry" : "Request My Free Growth Audit"}</button>
      <p className="form-note full">Do not include sensitive information. This development adapter does not deliver submissions externally.</p>
    </form>
  );
}

function Field({ name, label, type = "text", hint, error }: { name: string; label: string; type?: string; hint?: string; error?: string }) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return <label>{label}<input name={name} type={type} aria-describedby={describedBy} />{hint && <small id={`${name}-hint`}>{hint}</small>}{error && <small id={`${name}-error`} className="field-error">{error}</small>}</label>;
}
