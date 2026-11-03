import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { btnPrimary, btnSecondary, inputCls, muted } from './ui.jsx';
import { MAX_NAME } from '../utils/accountName.js';

// Lets whoever is signed in choose the name shown in the top bar instead of their email.
export default function ProfileModal({ onClose }) {
  const { displayName, email, adminUsername, updateDisplayName } = useAuth();
  const [name, setName] = useState(displayName || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(value) {
    setError('');
    setBusy(true);
    const res = await updateDisplayName(value);
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error || 'Could not save the name.');
  }

  return (
    <Modal title="Display name" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(name);
        }}
        className="space-y-4"
      >
        <p className={`text-sm ${muted}`}>
          Signed in as {email || adminUsername}. The name below is shown in the top bar instead of your email.
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium">Name or nickname</label>
          <input
            className={inputCls}
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        {error && (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={`${btnPrimary} flex-1`}>
            Save
          </button>
          <button type="button" className={btnSecondary} disabled={busy} onClick={() => save('')}>
            Use default
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
