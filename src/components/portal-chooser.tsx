"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Building2, ChevronRight, CirclePlus, LogOut, ShieldCheck } from "lucide-react";
import type { AppUser, OrganizationSummary } from "@/lib/types";
import type { OrganizationProfilePayload } from "@/components/workspace-views";

type Props = {
  user: AppUser;
  organizations: OrganizationSummary[];
  onSelect: (id: string) => Promise<void>;
  onCreate: (organization: OrganizationProfilePayload) => Promise<void>;
  onLogout: () => Promise<void>;
};

export default function PortalChooser({ user, organizations, onSelect, onCreate, onLogout }: Props) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<OrganizationProfilePayload>({});

  async function chooseFile(file?: File) {
    if (!file) return;
    if (file.size > 1_048_576) { setError("Company logos are limited to 1 MB."); return; }
    const logoBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("The logo file could not be read."));
      reader.readAsDataURL(file);
    });
    setProfile((current) => ({ ...current, logoBase64, logoContentType: file.type, logoFileName: file.name }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onCreate(profile); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The portal could not be created."); }
    finally { setBusy(false); }
  }

  return <div className="portal-screen">
    <aside className="login-aside portal-aside"><div className="login-brand"><Image src="/ddin-logo.png" alt="DDIN" width={160} height={160} /><div><strong>FINANCE PORTALS</strong><small>Organization reconciliation</small></div></div><div className="login-copy"><div className="eyebrow">Platform administration</div><h1>One secure sign-in.<br />Every finance portal.</h1><p>Choose the organization workspace you need. Each portal keeps its accounts, transactions, team, and history within its own records.</p></div><div className="login-foot">Signed in as {user.name}. Your platform access is recorded in the audit trail.</div></aside>
    <main className="portal-main">
      <div className="portal-main-top"><span className="portal-security"><ShieldCheck size={14} /> Platform administrator</span><button className="btn btn-quiet" onClick={() => void onLogout()}><LogOut size={13} /> Sign out</button></div>
      <div className="portal-heading"><div className="eyebrow">Organization directory</div><h2>Choose a portal</h2><p>Select a company to open its finance workspace.</p></div>
      <div className="portal-list">
        {organizations.map((organization) => <button className="portal-card" key={organization.id} onClick={() => void onSelect(organization.id)} disabled={busy}>
          <span className="portal-card-logo">{organization.logoUrl ? <Image src={organization.logoUrl} alt="" width={160} height={160} unoptimized /> : <span>{organization.name.slice(0, 2).toUpperCase()}</span>}</span>
          <span className="portal-card-copy"><strong>{organization.name}</strong><small>{organization.legalName || organization.tagline || organization.slug}</small>{[organization.city, organization.country].filter(Boolean).length > 0 && <small>{[organization.city, organization.country].filter(Boolean).join(", ")}</small>}</span>
          <ChevronRight size={16} />
        </button>)}
        {!organizations.length && <div className="portal-empty"><Building2 size={20} /><strong>No organization portals yet</strong><span>Create the first company profile to begin.</span></div>}
      </div>
      {!creating ? <button className="portal-create-link" onClick={() => { setCreating(true); setError(""); }}><CirclePlus size={15} /> Create an organization portal</button> : <form className="portal-create-form" onSubmit={submit}>
        <div className="portal-create-heading"><div><strong>New organization profile</strong><span>Portal name is used in the company sign-in address.</span></div><button type="button" className="btn btn-small" onClick={() => setCreating(false)}>Cancel</button></div>
        <div className="field-grid"><div className="field"><label htmlFor="portal-name">Company display name</label><input id="portal-name" value={profile.name ?? ""} onChange={(event) => setProfile((old) => ({ ...old, name: event.target.value }))} maxLength={120} required /></div><div className="field"><label htmlFor="portal-slug">Portal name</label><input id="portal-slug" value={profile.slug ?? ""} onChange={(event) => setProfile((old) => ({ ...old, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") }))} maxLength={60} placeholder="company-name" required /></div><div className="field full"><label htmlFor="portal-legal-name">Legal name</label><input id="portal-legal-name" value={profile.legalName ?? ""} onChange={(event) => setProfile((old) => ({ ...old, legalName: event.target.value }))} maxLength={160} /></div><div className="field full"><label htmlFor="portal-tagline">Tagline</label><input id="portal-tagline" value={profile.tagline ?? ""} onChange={(event) => setProfile((old) => ({ ...old, tagline: event.target.value }))} maxLength={180} /></div><div className="field full"><label htmlFor="portal-address">Address</label><input id="portal-address" value={profile.addressLine1 ?? ""} onChange={(event) => setProfile((old) => ({ ...old, addressLine1: event.target.value }))} maxLength={180} /></div><div className="field"><label htmlFor="portal-city">City</label><input id="portal-city" value={profile.city ?? ""} onChange={(event) => setProfile((old) => ({ ...old, city: event.target.value }))} maxLength={100} /></div><div className="field"><label htmlFor="portal-country">Country</label><input id="portal-country" value={profile.country ?? ""} onChange={(event) => setProfile((old) => ({ ...old, country: event.target.value }))} maxLength={100} /></div><div className="field full"><label htmlFor="portal-logo">Company logo</label><input id="portal-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseFile(event.target.files?.[0]).catch((cause) => setError(cause instanceof Error ? cause.message : "The logo could not be read."))} /><span className="field-help">PNG, JPEG, or WebP up to 1 MB.</span></div></div>
        {error && <div className="callout warning portal-error">{error}</div>}
        <div className="portal-form-footer"><span className="muted">You can add this organization’s finance users after entering its portal.</span><button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create portal"}<ChevronRight size={13} /></button></div>
      </form>}
      <div className="portal-footnote">Organizations are separated by assigned portal access.</div>
    </main>
  </div>;
}
