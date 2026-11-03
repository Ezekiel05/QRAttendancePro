import React from 'react';
import { useData } from '../context/DataContext.jsx';

// Shows database problems and scans that are saved on this device but not uploaded yet.
export default function SyncBanner() {
  const { error, clearError, outboxCount } = useData();
  if (!error && !outboxCount) return null;

  return (
    <div className="no-print">
      {error && (
        <div className="flex items-start justify-between gap-3 bg-red-600 px-4 py-2 text-sm text-white">
          <span>{error}</span>
          <button onClick={clearError} className="shrink-0 underline">
            Dismiss
          </button>
        </div>
      )}
      {outboxCount > 0 && (
        <div className="bg-amber-500 px-4 py-2 text-sm text-white">
          {outboxCount} scan{outboxCount === 1 ? '' : 's'} saved on this device and waiting to sync. They upload
          automatically once the connection is back.
        </div>
      )}
    </div>
  );
}
