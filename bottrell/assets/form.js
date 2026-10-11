/* No credentials or delivery provider settings belong in this browser file. */
(() => {
  'use strict';
  const form = document.getElementById('rebecca-form');
  if (!form) return;
  const questions = JSON.parse(document.getElementById('question-data').textContent);
  const status = document.getElementById('form-status');
  const draftState = document.getElementById('draft-state');
  const submitButton = document.getElementById('submit-answers');
  const name = document.getElementById('respondent-name');
  const email = document.getElementById('respondent-email');
  const consent = document.getElementById('consent');
  const key = 'sarah-blanch-rebecca-answers-v1';
  // Set data-submission="available" on the form only after a verified real submission.
  const submissionUnavailable = typeof form.getAttribute === 'function' && form.getAttribute('data-submission') === 'unavailable';
  const unavailableMessage = 'Online submission is not connected yet, so nothing can be sent from this page. Your draft stays in this browser; use Download my answers or the printable workbook.';
  let submissionId = '';
  let fingerprint = '';

  const answers = () => questions.map(q => ({id:q.id, answer:document.getElementById(`q${q.id}`).value}));
  const fields = () => ({name:name.value, email:email.value, answers:answers()});
  const showStatus = message => { status.textContent = message; status.focus(); };

  function updateDraft() {
    const values = fields();
    const count = values.answers.filter(a => a.answer.trim()).length;
    document.getElementById('answer-count').textContent = `${count} of 20 questions answered`;
    try {
      if (count || values.email || values.name !== 'Rebecca') {
        localStorage.setItem(key, JSON.stringify({...values,submissionId,fingerprint}));
        draftState.textContent = 'Draft saved in this browser. It has not been submitted.';
      } else {
        localStorage.removeItem(key);
        draftState.textContent = submissionUnavailable ? 'Online submission is not connected yet. Nothing on this page is sent; use Download my answers or the printable workbook.' : 'Answers are submitted only when you select Submit answers.';
      }
    } catch {
      draftState.textContent = 'This browser cannot save a draft. Use Download my answers before leaving.';
    }
  }

  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && Array.isArray(saved.answers)) {
      if (typeof saved.name === 'string') name.value = saved.name.slice(0,120);
      if (typeof saved.email === 'string') email.value = saved.email.slice(0,254);
      for (const a of saved.answers) {
        const input = Number.isInteger(a.id) && document.getElementById(`q${a.id}`);
        if (input && typeof a.answer === 'string') input.value = a.answer.slice(0,4000);
      }
      if (typeof saved.submissionId === 'string') submissionId = saved.submissionId;
      if (typeof saved.fingerprint === 'string') fingerprint = saved.fingerprint;
    }
  } catch { /* A damaged or unavailable draft must not block answering. */ }
  updateDraft();
  form.addEventListener('input', updateDraft);
  if (submissionUnavailable) {
    submitButton.disabled = true;
    submitButton.textContent = 'Submission not connected yet';
    status.textContent = unavailableMessage;
  }

  function newId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const s = Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
    return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = fields();
    if (!values.answers.some(a => a.answer.trim())) {
      showStatus('Please answer at least one question, or use the printable workbook.');
      return;
    }
    if (!consent.checked) return;
    if (submissionUnavailable) {
      showStatus(unavailableMessage);
      return;
    }
    if (location.protocol === 'file:') {
      showStatus('This local preview cannot send answers. Download your answers or use the printable workbook.');
      return;
    }
    const nextFingerprint = JSON.stringify(values);
    if (!submissionId || nextFingerprint !== fingerprint) {
      submissionId = newId();
      fingerprint = nextFingerprint;
    }
    updateDraft();
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting…';
    showStatus('Submitting your answers…');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(new URL('api/answers',location.href), {
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({schemaVersion:1,...values,consent:true,website:document.getElementById('website').value,submissionId}),signal:controller.signal
      });
      let result;
      try { result = await response.json(); }
      catch { throw new Error('The form did not return a valid confirmation. Your draft is still here; download it before leaving.'); }
      if (!response.ok || result.ok !== true || result.status !== 'accepted' || !result.reference) {
        const explanation = typeof result.message === 'string' ? result.message : 'Your submission was not confirmed.';
        showStatus(`${explanation} Your draft is still here. You can retry or download your answers.`);
        return;
      }
      if (JSON.stringify(fields()) === nextFingerprint) {
        showStatus(`Your answers were accepted for emailing to admin@sarahblanch.com. Reference: ${result.reference}.`);
        try { localStorage.removeItem(key); } catch {}
        draftState.textContent = 'Submission accepted. You can download a copy of your answers below.';
      } else {
        updateDraft();
        showStatus(`The answers you submitted were accepted for emailing. Reference: ${result.reference}. Changes made while submitting are still a draft and have not been submitted.`);
      }
    } catch (error) {
      showStatus(error.name === 'AbortError' ? 'The confirmation timed out. Your draft is still here. Retrying unchanged answers uses the same submission reference.' : `${error.message || 'Your submission was not confirmed.'} Your draft is still here; you can retry or download your answers.`);
    } finally {
      clearTimeout(timer);
      submitButton.disabled = submissionUnavailable;
      submitButton.textContent = 'Submit answers';
    }
  });

  document.getElementById('download-answers').addEventListener('click', () => {
    const values = fields();
    const lines = ['Questions for Rebecca — answers',`Name: ${values.name}`,`Email: ${values.email || 'Not supplied'}`,`Saved: ${new Date().toISOString()}`,'This file is a local copy; downloading it does not submit the answers.',''];
    for (const q of questions) lines.push(`${q.id}. ${q.question}`,values.answers.find(a=>a.id===q.id).answer || '[Not answered]','');
    const url = URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url; link.download = 'Rebecca_Answers.txt';document.body.appendChild(link);link.click();link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  });
  document.getElementById('clear-draft').addEventListener('click', () => {
    if (!window.confirm('Clear all draft answers from this browser?')) return;
    form.reset(); submissionId=''; fingerprint='';
    try { localStorage.removeItem(key); } catch {}
    updateDraft();showStatus('Draft cleared. Nothing was submitted.');
  });
})();
