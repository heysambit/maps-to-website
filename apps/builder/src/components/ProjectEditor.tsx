import * as Tabs from '@radix-ui/react-tabs';
import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContactAction, Draft, Fact, ThemeName, ValidationIssue } from '@studio/contracts';
import { validateDraft } from '@studio/contracts';
import { deterministicCopy, eligibleCopySourceIds, fixtureSuggestionAdapter, type CopySourceId } from '../lib/copy';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input, Textarea } from './ui/input';

const UPLOADS_ENABLED = false;
type Project = { id: string; label: string; version: number };
type ReviewerGrant = { name: string; email: string; role: 'viewer' | 'approver' };
type ActiveReview = { id: string; revisionId: string; url: string; roundNo: number; status: string; expiresAt: string; grants: Array<ReviewerGrant & { id: string; expiresAt: string }> };
type ApprovedReleaseReview = { reviewId: string; revisionId: string; roundNo: number; expiresAt: string };
type ActiveTab = 'edit' | 'preview';
type FactKey = 'businessName' | 'serviceSummary' | 'locality' | 'address' | 'privateAddress' | 'serviceArea' | 'about' | 'hours';
function localOperatorToken() { return document.querySelector<HTMLMetaElement>('meta[name="local-operator-token"]')?.content || ''; }

function emptyDraft(projectId: string): Draft { return { schemaVersion: 1, projectId, version: 0, siteType: 'storefront', theme: 'coast' }; }
function previewDocument(html: string) { return html; }

async function responseJson(response: Response): Promise<Record<string, any>> {
  try { return await response.json() as Record<string, any>; } catch { return { error: 'The server returned an unreadable response.' }; }
}

function Field({ label, value, onChange, multiline = false, required = false, help, errorId, name }: {
  label: string; value: string; onChange(value: string): void; multiline?: boolean; required?: boolean; help?: string; errorId?: string; name?: string;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <div className="grid gap-1.5">
    <label htmlFor={id} className="text-sm font-semibold">{label}{required && <span aria-hidden="true"> *</span>}</label>
    {multiline
      ? <Textarea id={id} name={name} value={value} onChange={(event) => onChange(event.currentTarget.value)} aria-describedby={[help ? `${id}-help` : '', errorId || ''].filter(Boolean).join(' ') || undefined} />
      : <Input id={id} name={name} value={value} onChange={(event) => onChange(event.currentTarget.value)} required={required} aria-describedby={[help ? `${id}-help` : '', errorId || ''].filter(Boolean).join(' ') || undefined} />}
    {help && <p id={`${id}-help`} className="text-xs text-[var(--dash-muted)]">{help}</p>}
  </div>;
}

function FactField({ label, fact, onValue, onSource, multiline = false, required = false }: {
  label: string; fact?: Fact; onValue(value: string): void; onSource(sourceKind: string, sourceRef: string): void; multiline?: boolean; required?: boolean;
}) {
  const value = fact?.value || '';
  const sourceKind = fact?.provenance?.sourceKind || 'owner';
  const sourceRef = fact?.provenance?.sourceRef || '';
  return <fieldset className="grid gap-3 rounded-lg border border-[var(--dash-border)] p-3">
    <Field label={label} value={value} onChange={onValue} multiline={multiline} required={required} />
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5"><label className="text-sm font-semibold">Source type for {label.toLowerCase()}</label>
        <select aria-label={`Source type for ${label}`} value={sourceKind} onChange={(event) => onSource(event.currentTarget.value, sourceRef)} className="min-h-11 rounded-lg border border-[var(--dash-control)] bg-[var(--dash-surface)] px-3 text-sm">
          <option value="owner">Owner supplied</option><option value="independent">Independently checked</option>
        </select>
      </div>
      <Field label={`${label} source reference`} value={sourceRef} onChange={(value) => onSource(sourceKind, value)} help="Use a short reference, such as an owner interview or verified source URL." />
    </div>
  </fieldset>;
}

function FactListField({ label, facts, onChange }: { label: string; facts?: Fact[]; onChange(text: string, sourceKind: string, sourceRef: string): void }) {
  const kind = facts?.[0]?.provenance?.sourceKind || 'owner';
  const ref = facts?.[0]?.provenance?.sourceRef || '';
  return <fieldset className="grid gap-3 rounded-lg border border-[var(--dash-border)] p-3"><Field label={label} value={(facts || []).map((fact) => fact.value).join('\n')} onChange={(text) => onChange(text, kind, ref)} multiline />
    <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><label htmlFor={`source-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="text-sm font-semibold">Source type for {label.toLowerCase()}</label><select id={`source-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="min-h-11 rounded-lg border border-[var(--dash-control)] bg-[var(--dash-surface)] px-3" value={kind} onChange={(event) => onChange((facts || []).map((fact) => fact.value).join('\n'), event.currentTarget.value, ref)}><option value="owner">Owner supplied</option><option value="independent">Independently checked</option></select></div>
      <Field label={`${label} source reference`} value={ref} onChange={(sourceRef) => onChange((facts || []).map((fact) => fact.value).join('\n'), kind, sourceRef)} /></div>
  </fieldset>;
}

function useFact(draft: Draft | null, setDraft: (value: Draft | null) => void, field: FactKey) {
  return {
    fact: draft?.[field] as Fact | undefined,
    value(value: string) {
      setDraft(draft ? { ...draft, [field]: { ...(draft[field] as Fact | undefined), value } } : draft);
    },
    source(sourceKind: string, sourceRef: string) {
      if (!draft) return;
      const existing = draft[field] as Fact | undefined;
      const provenance = { sourceKind, ...(sourceRef.trim() ? { sourceRef: sourceRef.trim(), checkedAt: existing?.provenance?.checkedAt || new Date().toISOString(), checkedBy: 'demo-operator' } : {}) };
      setDraft({ ...draft, [field]: { value: existing?.value || '', provenance } });
    },
  };
}

export default function ProjectEditor() {
  const [hydrated, setHydrated] = useState(false);
  const [projectLabel, setProjectLabel] = useState('');
  const [projectInput, setProjectInput] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState('Create a project or load one to start editing.');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewStatus, setPreviewStatus] = useState('Complete the independently sourced business facts and contact action to preview the page.');
  const [previewWidth, setPreviewWidth] = useState<'390px' | '100%'>('100%');
  const [activeTab, setActiveTab] = useState<ActiveTab>('edit');
  const [dark, setDark] = useState(false);
  const [placesQuery, setPlacesQuery] = useState('');
  const [placesLocality, setPlacesLocality] = useState('');
  const [placesResults, setPlacesResults] = useState<Array<{ placeId: string; displayName: string; formattedAddress?: string; attributions?: string[] }>>([]);
  const [placesAssertion, setPlacesAssertion] = useState('');
  const [copyOptIn, setCopyOptIn] = useState(false);
  const [copyProposal, setCopyProposal] = useState('');
  const [reviewerGrants, setReviewerGrants] = useState<ReviewerGrant[]>([{ name: '', email: '', role: 'approver' }]);
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [approvedReviews, setApprovedReviews] = useState<ApprovedReleaseReview[]>([]);
  const [releaseReviewId, setReleaseReviewId] = useState('');
  const [releaseTarget, setReleaseTarget] = useState('fixture.example');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'missing' | 'verified' | 'reversed'>('missing');
  const [authorityReference, setAuthorityReference] = useState('');
  const [hostnameEvidence, setHostnameEvidence] = useState('');
  const [releaseResult, setReleaseResult] = useState('');
  const previewVersion = useRef(0);
  const previewController = useRef<AbortController | null>(null);
  const savedSnapshot = useRef('');
  const [altText, setAltText] = useState('');
  const [rightsBasis, setRightsBasis] = useState('');
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => setHydrated(true), []);

  const validation = useMemo(() => draft ? validateDraft(draft) : null, [draft]);
  const currentIssues = issues.length ? issues : validation?.issues || [];

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedLabel = String(new FormData(event.currentTarget).get('label') || projectLabel).trim();
    const response = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localOperatorToken()}` }, body: JSON.stringify({ label: submittedLabel }) });
    const result = await responseJson(response);
    if (!response.ok) { setStatus(result.error || 'Project creation failed.'); setSaveState('error'); return; }
    savedSnapshot.current = JSON.stringify(result.draft);
    setProject({ id: result.id, label: result.label, version: result.version });
    setDraft(result.draft); setProjectInput(result.id); setStatus(`Project ${result.label} created. Draft version ${result.version}.`); setSaveState('saved'); setIssues([]);
  }

  async function loadProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = projectInput.trim();
    if (!id) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}/draft`, { headers: { authorization: `Bearer ${localOperatorToken()}` }, cache: 'no-store' });
    const result = await responseJson(response);
    if (!response.ok) { setStatus(result.error || 'Project could not be loaded.'); setSaveState('error'); return; }
    savedSnapshot.current = JSON.stringify(result.draft); setProject({ id: result.id, label: result.label, version: result.version }); setDraft(result.draft); setIssues([]); setStatus(`Loaded ${result.label}, saved version ${result.version}.`); setSaveState('saved');
  }

  async function saveDraft() {
    if (!project || !draft) return;
    setSaveState('saving'); setStatus('Saving draft…'); setIssues([]);
    const candidate = { ...draft, version: project.version };
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/draft`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${localOperatorToken()}` }, body: JSON.stringify({ baseVersion: project.version, draft: candidate }) });
    const result = await responseJson(response);
    if (response.status === 409) { setSaveState('conflict'); setStatus(`This project changed in another tab. Your unsaved edits are preserved. The saved version is ${result.currentVersion}. Copy your draft or reload the saved version.`); return; }
    if (!response.ok) { setSaveState('error'); setIssues(result.issues || []); setStatus(result.error || 'Save failed. Your form values are preserved.'); return; }
    savedSnapshot.current = JSON.stringify(result.draft); setDraft(result.draft); setProject({ ...project, version: result.version }); setSaveState('saved'); setStatus(`Draft saved as version ${result.version}.`);
  }

  async function reloadSavedDraft() {
    if (!project) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/draft`, { headers: { authorization: `Bearer ${localOperatorToken()}` }, cache: 'no-store' });
    const result = await responseJson(response);
    if (!response.ok) { setStatus(result.error || 'Reload failed. Your edits remain in the form.'); setSaveState('error'); return; }
    savedSnapshot.current = JSON.stringify(result.draft); setDraft(result.draft); setProject({ ...project, version: result.version }); setIssues([]); setSaveState('saved'); setStatus(`Reloaded saved version ${result.version}.`);
  }

  async function copyUnsavedDraft() {
    if (!draft) return;
    await navigator.clipboard?.writeText(JSON.stringify(draft, null, 2));
    setStatus('Unsaved draft copied as JSON. Your form values are still here.');
  }

  async function startReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || !draft || JSON.stringify(draft) !== savedSnapshot.current || saveState !== 'saved') {
      setStatus('Save the current draft successfully before starting review.'); return;
    }
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/reviews`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localOperatorToken()}` },
      body: JSON.stringify({ baseVersion: project.version, grants: reviewerGrants }), cache: 'no-store',
    });
    const result = await responseJson(response);
    if (!response.ok) { setStatus(result.error || 'Review could not be created.'); return; }
    setActiveReview({ id: result.review.id, revisionId: result.revision.id, url: result.url, roundNo: result.review.roundNo, status: result.review.status, expiresAt: result.review.expiresAt, grants: result.grants });
    setStatus(`Review round ${result.review.roundNo} created for the frozen revision. The reviewer must sign in through Cloudflare Access.`);
  }

  async function revokeActiveReview() {
    if (!project || !activeReview) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/reviews/${encodeURIComponent(activeReview.id)}/revoke`, { method: 'POST', headers: { authorization: `Bearer ${localOperatorToken()}` }, cache: 'no-store' });
    const result = await responseJson(response);
    if (!response.ok) { setStatus(result.error || 'Review could not be revoked.'); return; }
    setActiveReview({ ...activeReview, status: 'revoked' }); setStatus('Review round and its grants were revoked.');
  }

  async function requestRelease(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || !releaseReviewId) { setReleaseResult('An unexpired exact-revision approval is required.'); return; }
    const approved = approvedReviews.find((item) => item.reviewId === releaseReviewId);
    if (!approved) { setReleaseResult('Refresh reviews and select a current approved revision.'); return; }
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/releases`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localOperatorToken()}` }, body: JSON.stringify({ reviewId: approved.reviewId, revisionId: approved.revisionId, targetHostname: releaseTarget, paymentStatus, paymentReference, authorityVerified: Boolean(authorityReference.trim()), authorityReference, hostnameVerified: Boolean(hostnameEvidence.trim()), hostnameEvidence }), cache: 'no-store' });
    const result = await responseJson(response);
    setReleaseResult(response.ok ? `Release ${result.releaseId} queued (${result.status}). CI can retrieve only this sealed release ID.` : result.error || 'Release request failed closed.');
  }

  async function refreshApprovedReviews() {
    if (!project) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/releases`, { headers: { authorization: `Bearer ${localOperatorToken()}` }, cache: 'no-store' });
    const result = await responseJson(response);
    if (!response.ok) { setApprovedReviews([]); setReleaseResult(result.error || 'Could not load approved reviews.'); return; }
    const rows = Array.isArray(result.approved) ? result.approved as ApprovedReleaseReview[] : [];
    setApprovedReviews(rows);
    if (!rows.some((row) => row.reviewId === releaseReviewId)) setReleaseReviewId(rows[0]?.reviewId || '');
  }

  useEffect(() => { void refreshApprovedReviews(); }, [project?.id]);

  useEffect(() => {
    if (!project || !draft) return;
    const currentVersion = ++previewVersion.current;
    previewController.current?.abort();
    const controller = new AbortController(); previewController.current = controller;
    const timer = window.setTimeout(async () => {
      const check = validateDraft(draft);
      if (!check.savable || !check.shareable) { setPreviewHtml(''); setPreviewStatus('Preview appears when required fields have valid independent sources and a safe contact action.'); return; }
      setPreviewStatus('Updating preview…');
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/preview`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localOperatorToken()}` }, body: JSON.stringify(draft), signal: controller.signal, cache: 'no-store' });
        const result = await responseJson(response);
        if (currentVersion !== previewVersion.current) return;
        if (!response.ok) { setPreviewHtml(''); setPreviewStatus(result.error || 'Preview could not be rendered.'); return; }
        setPreviewHtml(String(result.html)); setPreviewStatus(`Preview updated from draft version ${result.version}.`);
      } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError') && currentVersion === previewVersion.current) setPreviewStatus('Preview request failed. Your form values are preserved.'); }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [project, draft]);

  useEffect(() => {
    if (!draft || !project || saveState !== 'saved') return;
    if (JSON.stringify(draft) !== savedSnapshot.current) { setSaveState('idle'); setStatus('Unsaved changes.'); }
  }, [draft, project, saveState]);

  const businessName = useFact(draft, setDraft, 'businessName');
  const serviceSummary = useFact(draft, setDraft, 'serviceSummary');
  const locality = useFact(draft, setDraft, 'locality');
  const address = useFact(draft, setDraft, 'address');
  const privateAddress = useFact(draft, setDraft, 'privateAddress');
  const serviceArea = useFact(draft, setDraft, 'serviceArea');
  const about = useFact(draft, setDraft, 'about');
  const hours = useFact(draft, setDraft, 'hours');

  async function placesSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!project) return;
    setPlacesResults([]); setPlacesAssertion('');
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/places/search`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localOperatorToken()}` }, body: JSON.stringify({ query: placesQuery, locality: placesLocality }), cache: 'no-store' });
    const result = await responseJson(response);
    if (!response.ok || result.status === 'manual') { setStatus(result.message || 'Continue with manual intake.'); return; }
    setPlacesAssertion(String(result.assertion)); setPlacesResults(result.results || []);
  }

  async function selectPlace(placeId: string) {
    if (!project) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/places/select`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localOperatorToken()}` }, body: JSON.stringify({ placeId, assertion: placesAssertion }), cache: 'no-store' });
    const result = await responseJson(response); setPlacesResults([]); setStatus(response.ok ? `Listing selected (${result.placeId}). Copy independently checked facts into the draft.` : result.message || result.error || 'Selection expired. Search again or continue manually.');
  }

  async function uploadFile(file: File | undefined, altText: string, rightsBasis: string) {
    if (!project || !file) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/media`, { method: 'POST', headers: { 'content-type': file.type, 'x-image-alt': altText, 'x-rights-status': 'cleared', 'x-rights-basis': rightsBasis, authorization: `Bearer ${localOperatorToken()}` }, body: file, cache: 'no-store' });
    const result = await responseJson(response); setStatus(response.ok ? 'Image processed and stored privately.' : result.error || 'Upload failed; no image was stored.');
  }

  function requestFixtureSuggestion() {
    if (!draft) return;
    const ids = eligibleCopySourceIds(draft);
    if (!ids.includes('serviceSummary')) { setStatus('Add an independently sourced service summary before requesting a suggestion.'); return; }
    try {
      const selected = ['serviceSummary'] as CopySourceId[];
      const proposal = fixtureSuggestionAdapter.suggest({ sourceIds: selected, eligibleFacts: { serviceSummary: draft.serviceSummary } });
      setCopyProposal(proposal.text); setStatus(`Fixture suggestion ready from ${proposal.sourceIds.join(', ')}. Review before applying.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Suggestion unavailable.'); }
  }

  function applyFixtureSuggestion() {
    if (!draft || !copyProposal || !draft.serviceSummary) return;
    setDraft({ ...draft, serviceSummary: { ...draft.serviceSummary, value: copyProposal } });
    setCopyProposal(''); setStatus('Reviewed fixture copy applied to the service summary. Save the draft to keep it.');
  }

  const previewWidthStyle = { width: previewWidth, maxWidth: '100%' };
  const copy = draft ? deterministicCopy(draft) : null;

  return <MotionConfig reducedMotion="user">
    <div data-dashboard-theme={dark ? 'dark' : 'light'} data-editor-ready={hydrated ? 'true' : 'false'} className="min-h-screen bg-[var(--dash-canvas)] text-[var(--dash-ink)]">
      <main className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--dash-muted)]">Studio · Project workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">{project?.label || 'Project editor'}</h1><p className="mt-1 text-sm text-[var(--dash-muted)]">{project ? <>Project <code id="project-id">{project.id}</code> · Draft v{project.version}</> : 'Create a project or load a saved draft.'}</p></div>
          <div className="flex items-center gap-3"><div role="status" aria-live="polite" className="max-w-[22rem] text-sm font-medium">{status}</div><Button variant="secondary" aria-pressed={dark} onClick={() => setDark(!dark)}>{dark ? 'Use light mode' : 'Use dark mode'}</Button></div>
        </header>

        {!project && <div className="grid gap-4 md:grid-cols-2">
          <Card><h2 className="text-lg font-bold">Start a project</h2><p className="mb-4 mt-1 text-sm text-[var(--dash-muted)]">Manual intake is available without external services.</p><form onSubmit={createProject} className="grid gap-3"><Field label="Project name" name="label" value={projectLabel} onChange={setProjectLabel} required /><Button type="submit">Create project</Button></form></Card>
          <Card><h2 className="text-lg font-bold">Open an existing project</h2><p className="mb-4 mt-1 text-sm text-[var(--dash-muted)]">Load the latest saved draft for editing.</p><form onSubmit={loadProject} className="grid gap-3"><Field label="Project ID" value={projectInput} onChange={setProjectInput} required /><Button variant="secondary" type="submit">Load saved draft</Button></form></Card>
        </div>}

        {project && draft && <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-3">
            <div className="flex items-center gap-2"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${saveState === 'saved' ? 'bg-success' : saveState === 'error' || saveState === 'conflict' ? 'bg-danger' : 'bg-warning'}`} /><span className="text-sm font-semibold">{saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving' : saveState === 'conflict' ? 'Conflict' : saveState === 'error' ? 'Save failed' : 'Unsaved changes'}</span></div>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={saveDraft} disabled={saveState === 'saving'}>{saveState === 'saving' ? 'Saving…' : 'Save draft'}</Button><Button variant="ghost" onClick={reloadSavedDraft}>Reload saved version</Button></div>
          </div>

          <section className="mb-4 grid gap-3 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4" aria-labelledby="review-start-title">
            <div><h2 id="review-start-title" className="font-bold">Owner review</h2><p className="text-sm text-[var(--dash-muted)]">Freeze the current saved revision and grant a named reviewer access for seven days. The review URL carries no access authority.</p></div>
            <form onSubmit={startReview} className="grid gap-3">
              {reviewerGrants.map((grant, index) => <div className="grid gap-3 rounded-lg border border-[var(--dash-border)] p-3 sm:grid-cols-[1fr_1.3fr_10rem_auto] sm:items-end" key={index}>
                <Field label={`Reviewer name ${index + 1}`} value={grant.name} onChange={(name) => setReviewerGrants((current) => current.map((entry, i) => i === index ? { ...entry, name } : entry))} required />
                <Field label={`Reviewer email ${index + 1}`} value={grant.email} onChange={(email) => setReviewerGrants((current) => current.map((entry, i) => i === index ? { ...entry, email } : entry))} required />
                <div className="grid gap-1.5"><label htmlFor={`reviewer-role-${index}`} className="text-sm font-semibold">Access role</label><select id={`reviewer-role-${index}`} value={grant.role} onChange={(event) => { const role = event.currentTarget.value as 'viewer' | 'approver'; setReviewerGrants((current) => current.map((entry, i) => i === index ? { ...entry, role } : entry)); }} className="min-h-11 rounded-lg border border-[var(--dash-control)] bg-[var(--dash-surface)] px-3"><option value="viewer">Viewer</option><option value="approver">Approver</option></select></div>
                {reviewerGrants.length > 1 && <Button type="button" variant="ghost" onClick={() => setReviewerGrants((current) => current.filter((_, i) => i !== index))}>Remove reviewer</Button>}
              </div>)}
              <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={reviewerGrants.length >= 20} onClick={() => setReviewerGrants((current) => [...current, { name: '', email: '', role: 'viewer' }])}>Add reviewer</Button><Button type="submit" disabled={!validation?.shareable || saveState !== 'saved' || JSON.stringify(draft) !== savedSnapshot.current}>Start review</Button></div>
            </form>
            {activeReview && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--dash-border)] p-3" role="status" aria-live="polite"><div><p>Round {activeReview.roundNo} · {activeReview.status} · expires {activeReview.expiresAt}</p><ul className="mt-1 list-disc pl-5 text-sm">{activeReview.grants.map((grant) => <li key={grant.id}>{grant.name} ({grant.email}) · {grant.role}</li>)}</ul></div><div className="flex flex-wrap gap-2"><a className="inline-flex min-h-11 items-center rounded-lg border border-[var(--dash-control)] px-3 text-sm font-semibold underline" href={activeReview.url} target="_blank" rel="noreferrer">Open review URL</a><Button type="button" variant="danger" disabled={activeReview.status === 'revoked' || activeReview.status === 'superseded'} onClick={revokeActiveReview}>Revoke review</Button></div></div>}
          </section>

          <section className="mb-4 grid gap-3 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4" aria-labelledby="release-title">
            <div><h2 id="release-title" className="font-bold">Request a release</h2><p className="text-sm text-[var(--dash-muted)]">An explicit operator request records payment, publication authority, and hostname evidence. CI receives only a scoped sealed bundle by release ID. Live deployment stays disabled until a separately authorized staging operation.</p></div>
            <form onSubmit={requestRelease} className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><label htmlFor="release-review" className="text-sm font-semibold">Approved frozen revision</label><select id="release-review" value={releaseReviewId} onChange={(event) => setReleaseReviewId(event.currentTarget.value)} className="min-h-11 rounded-lg border border-[var(--dash-control)] bg-[var(--dash-surface)] px-3"><option value="">Select approved review</option>{approvedReviews.map((review) => <option key={review.reviewId} value={review.reviewId}>Round {review.roundNo} · {review.revisionId} · expires {review.expiresAt}</option>)}</select></div>
              <Field label="Allowed target hostname" value={releaseTarget} onChange={setReleaseTarget} required />
              <div className="grid gap-1.5"><label htmlFor="release-payment-status" className="text-sm font-semibold">Payment evidence status</label><select id="release-payment-status" value={paymentStatus} onChange={(event) => setPaymentStatus(event.currentTarget.value as typeof paymentStatus)} className="min-h-11 rounded-lg border border-[var(--dash-control)] bg-[var(--dash-surface)] px-3"><option value="missing">Missing / not verified</option><option value="verified">Verified</option><option value="reversed">Reversed</option></select></div>
              <Field label="Verified payment reference" value={paymentReference} onChange={setPaymentReference} required help="Record the external payment evidence reference. Missing or reversed payment cannot pass the server gate." />
              <Field label="Publication authority reference" value={authorityReference} onChange={setAuthorityReference} required />
              <Field label="Hostname authorization evidence" value={hostnameEvidence} onChange={setHostnameEvidence} required />
              <div className="flex flex-wrap items-end gap-2"><Button type="button" variant="secondary" onClick={refreshApprovedReviews}>Refresh approvals</Button><Button type="submit" disabled={!approvedReviews.length}>Request release</Button></div>
            </form>
            {releaseResult && <p role="status" aria-live="polite" className="text-sm">{releaseResult}</p>}
          </section>

          <Tabs.Root value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)} className="editor-layout">
            <Tabs.List aria-label="Editor views" className="mb-3 flex gap-2 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] p-1 lg:hidden">
              <Tabs.Trigger value="edit" className="min-h-11 flex-1 rounded-md px-3 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-on-primary">Edit</Tabs.Trigger>
              <Tabs.Trigger value="preview" className="min-h-11 flex-1 rounded-md px-3 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-on-primary">Preview</Tabs.Trigger>
            </Tabs.List>
            <div className="editor-columns">
              <Tabs.Content forceMount value="edit" className="editor-panel min-w-0 focus-visible:outline-none">
                <Card className="grid gap-5">
                  <div><h2 className="text-xl font-bold">Page content</h2><p className="mt-1 text-sm text-[var(--dash-muted)]">Each published fact needs an independent source. Save can keep an incomplete draft.</p></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5"><label className="text-sm font-semibold" htmlFor="site-type">Page type</label><select id="site-type" className="min-h-11 rounded-lg border border-[var(--dash-control)] bg-[var(--dash-surface)] px-3" value={draft.siteType} onChange={(event) => setDraft({ ...draft, siteType: event.currentTarget.value as Draft['siteType'] })}><option value="storefront">Storefront</option><option value="service-area">Service area</option></select></div>
                    <div className="grid gap-1.5"><label className="text-sm font-semibold" htmlFor="theme">Visual theme</label><select id="theme" className="min-h-11 rounded-lg border border-[var(--dash-control)] bg-[var(--dash-surface)] px-3" value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.currentTarget.value as ThemeName })}><option value="coast">Coast</option><option value="grove">Grove</option></select></div>
                  </div>
                  <FactField label="Business name" fact={businessName.fact} onValue={businessName.value} onSource={businessName.source} required />
                  <FactField label="Service summary" fact={serviceSummary.fact} onValue={serviceSummary.value} onSource={serviceSummary.source} multiline required />
                  <FactField label="City or locality" fact={locality.fact} onValue={locality.value} onSource={locality.source} required />
                  {draft.siteType === 'storefront'
                    ? <FactField label="Public storefront address" fact={address.fact} onValue={address.value} onSource={address.source} />
                    : <><FactField label="Approved service area" fact={serviceArea.fact} onValue={serviceArea.value} onSource={serviceArea.source} required /><FactField label="Private street address (never rendered)" fact={privateAddress.fact} onValue={privateAddress.value} onSource={privateAddress.source} /></>}
                  <FactField label="About" fact={about.fact} onValue={about.value} onSource={about.source} multiline />
                  <FactField label="Hours" fact={hours.fact} onValue={hours.value} onSource={hours.source} />
                  <FactListField label="Services (one per line)" facts={draft.services} onChange={(text, sourceKind, sourceRef) => {
                    const provenance = { sourceKind, ...(sourceRef.trim() ? { sourceRef: sourceRef.trim(), checkedAt: new Date().toISOString(), checkedBy: 'demo-operator' } : {}) };
                    const services = text.split('\n').map((value) => value.trim()).filter(Boolean).map((value) => ({ value, provenance }));
                    setDraft({ ...draft, services });
                  }} />
                  <FactListField label="Testimonials (one per line)" facts={draft.testimonials} onChange={(text, sourceKind, sourceRef) => {
                    const provenance = { sourceKind, ...(sourceRef.trim() ? { sourceRef: sourceRef.trim(), checkedAt: new Date().toISOString(), checkedBy: 'demo-operator' } : {}) };
                    const testimonials = text.split('\n').map((value) => value.trim()).filter(Boolean).map((value) => ({ value, provenance }));
                    setDraft({ ...draft, testimonials });
                  }} />
                  <fieldset className="grid gap-3 rounded-lg border border-[var(--dash-border)] p-3"><legend className="px-1 text-sm font-bold">Contact action</legend>
                    <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><label htmlFor="contact-type" className="text-sm font-semibold">Action type</label><select id="contact-type" className="min-h-11 rounded-lg border border-[var(--dash-control)] bg-[var(--dash-surface)] px-3" value={draft.contact?.type || 'phone'} onChange={(event) => setDraft({ ...draft, contact: { ...(draft.contact || { label: 'Call us', href: '' }), type: event.currentTarget.value } as ContactAction })}><option value="phone">Phone</option><option value="website">Website</option><option value="directions" disabled={draft.siteType !== 'storefront'}>Directions</option></select></div>
                      <Field label="Button label" value={draft.contact?.label || ''} onChange={(label) => setDraft({ ...draft, contact: { ...(draft.contact || { type: 'phone', href: '' }), label } as ContactAction })} /></div>
                    <Field label="Phone or HTTPS destination" value={draft.contact?.href || ''} onChange={(href) => setDraft({ ...draft, contact: { ...(draft.contact || { type: 'phone', label: 'Call us' }), href } as ContactAction })} help="Use +E.164 tel links, HTTPS websites, or approved Google Maps directions." />
                    <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><label className="text-sm font-semibold" htmlFor="contact-source-kind">Contact source type</label><select id="contact-source-kind" className="min-h-11 rounded-lg border border-[var(--dash-control)] bg-[var(--dash-surface)] px-3" value={draft.contact?.provenance?.sourceKind || 'owner'} onChange={(event) => setDraft({ ...draft, contact: { ...(draft.contact || { type: 'phone', label: 'Call us', href: '' }), provenance: { sourceKind: event.currentTarget.value, ...(draft.contact?.provenance?.sourceRef ? { sourceRef: draft.contact.provenance.sourceRef, checkedAt: new Date().toISOString(), checkedBy: 'demo-operator' } : {}) } } as ContactAction })}><option value="owner">Owner supplied</option><option value="independent">Independently checked</option></select></div><Field label="Contact source reference" value={draft.contact?.provenance?.sourceRef || ''} onChange={(sourceRef) => setDraft({ ...draft, contact: { ...(draft.contact || { type: 'phone', label: 'Call us', href: '' }), provenance: { sourceKind: draft.contact?.provenance?.sourceKind || 'owner', sourceRef, checkedAt: new Date().toISOString(), checkedBy: 'demo-operator' } } as ContactAction })} /></div>
                  </fieldset>

                  <section className="grid gap-3 rounded-xl border border-[var(--dash-border)] p-4" aria-labelledby="copy-title"><div><h3 id="copy-title" className="font-bold">Copy assistance</h3><p className="text-sm text-[var(--dash-muted)]">Deterministic copy keeps to the source wording. Optional fixture suggestions run locally and never use a network.</p></div>
                    <p className="rounded-lg bg-[var(--dash-canvas)] p-3 text-sm">Template preview: {copy ? `${draft.businessName?.value || ''} · ${copy.text}` : 'Add an independently sourced service summary.'}</p>
                    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={copyOptIn} onChange={(event) => { setCopyOptIn(event.currentTarget.checked); setCopyProposal(''); }} /> Opt in to fixture-only suggestions</label>
                    {copyOptIn && <div className="grid gap-2"><Button type="button" variant="secondary" onClick={requestFixtureSuggestion}>Suggest from eligible source IDs</Button>{copyProposal && <div role="region" className="rounded-lg border border-[var(--dash-border)] p-3" aria-label="Copy suggestion"><p className="text-sm">{copyProposal}</p><p className="mt-1 text-xs text-[var(--dash-muted)]">Source: serviceSummary. Review and accept before saving.</p><Button className="mt-2" type="button" onClick={applyFixtureSuggestion}>Use this wording</Button></div>}</div>}
                  </section>

                  <section className="grid gap-3 rounded-xl border border-[var(--dash-border)] p-4" aria-labelledby="media-title"><div><h3 id="media-title" className="font-bold">Media</h3><p className="text-sm text-[var(--dash-muted)]">Private images require cleared rights and processing that removes metadata.</p></div>
                    <Field label="Descriptive alt text" value={altText} onChange={setAltText} help="Uploads are disabled until the Worker image pipeline passes staging verification." />
                    <Field label="Rights basis" value={rightsBasis} onChange={setRightsBasis} help="Record the permission or license that covers this file." />
                    <input aria-label="Upload JPEG, PNG, or WebP" type="file" accept="image/jpeg,image/png,image/webp" disabled={!UPLOADS_ENABLED} onChange={(event) => uploadFile(event.currentTarget.files?.[0], altText, rightsBasis)} className="block w-full text-sm" />
                    <p className="text-xs text-[var(--dash-muted)]">JPEG, PNG, or WebP · max 5 MiB · max 20 megapixels · 10 files per project</p>
                  </section>

                  <section className="grid gap-3 rounded-xl border border-[var(--dash-border)] p-4" aria-labelledby="places-title"><div><h3 id="places-title" className="font-bold">Optional listing identification</h3><p className="text-sm text-[var(--dash-muted)]">Results are temporary and separate from publishing facts.</p></div>
                    <form onSubmit={placesSearch} className="grid gap-3"><Field label="Search name, Place ID, or supported Maps URL" value={placesQuery} onChange={setPlacesQuery} /><Field label="Search locality" value={placesLocality} onChange={setPlacesLocality} /><Button type="submit" variant="secondary">Search listings</Button></form>
                    <div role="region" className="grid gap-2" aria-label="Google Maps results">{placesResults.map((place) => <article key={place.placeId} className="rounded-lg border border-[var(--dash-border)] p-3"><h4 className="font-semibold">{place.displayName}</h4>{place.formattedAddress && <p className="text-sm">{place.formattedAddress}</p>}<img className="google-maps-attribution my-2 h-[19px] w-auto" src="/google-maps-logo.svg" alt="Google Maps" />{place.attributions?.map((provider) => <p key={provider} className="text-xs">Map data: {provider}</p>)}<Button className="mt-2" type="button" onClick={() => selectPlace(place.placeId)}>Select this listing</Button></article>)}</div>
                    <p className="text-xs text-[var(--dash-muted)]">Unsupported links and lookup failures return to name/locality search. Enter business details manually at any time.</p>
                  </section>
                </Card>
              </Tabs.Content>

              <Tabs.Content forceMount value="preview" className="editor-panel min-w-0 focus-visible:outline-none">
                <Card className="preview-card grid gap-3 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1"><div><h2 className="text-lg font-bold">Live preview</h2><p className="text-xs text-[var(--dash-muted)]" role="status" aria-live="polite">{previewStatus}</p></div><label className="flex items-center gap-2 text-sm"><span>Preview width</span><select aria-label="Preview width" className="min-h-10 rounded-lg border border-[var(--dash-control)] bg-[var(--dash-surface)] px-2" value={previewWidth} onChange={(event) => setPreviewWidth(event.currentTarget.value as '390px' | '100%')}><option value="390px">390 px</option><option value="100%">Full width</option></select></label></div>
                  <div role="region" className="min-h-[60vh] overflow-auto rounded-lg border border-[var(--dash-border)] bg-white p-0" aria-label="Page preview viewport"><div style={previewWidthStyle} className="mx-auto min-h-[60vh]"><iframe title="Rendered page preview" sandbox="" srcDoc={previewDocument(previewHtml || '<!doctype html><html lang=&quot;en&quot;><body><p style=&quot;font:16px system-ui;padding:24px;color:#475569&quot;>Preview appears when the draft has valid facts and contact details.</p></body></html>')} className="block min-h-[60vh] w-full border-0" /></div></div>
                  <p className="text-xs text-[var(--dash-muted)]">This preview uses the shared Astro renderer. Contact actions are inert.</p>
                </Card>
              </Tabs.Content>
            </div>
          </Tabs.Root>

          {currentIssues.length > 0 && <Card className="mt-4 border-danger/50" aria-labelledby="validation-title"><h2 id="validation-title" className="text-base font-bold">Draft validation</h2><ul className="mt-2 list-disc pl-5 text-sm">{currentIssues.map((issue, index) => <li key={`${issue.field}-${index}`}><span className="font-semibold">{issue.field}:</span> {issue.message}</li>)}</ul></Card>}
          {(saveState === 'conflict' || saveState === 'error') && <motion.div role="group" initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.16 }} className="mt-4 flex flex-wrap gap-2" aria-label="Save recovery actions"><Button type="button" variant="secondary" onClick={copyUnsavedDraft}>Copy unsaved draft</Button><Button type="button" variant="ghost" onClick={reloadSavedDraft}>Reload saved version</Button></motion.div>}
          <p className="mt-5 text-sm text-[var(--dash-muted)]">Publication and deployment remain disabled. Reviewer identities must also be enrolled in Cloudflare Access.</p>
        </>}
      </main>
    </div>
  </MotionConfig>;
}
