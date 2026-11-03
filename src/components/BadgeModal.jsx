import React from 'react';
import Modal from './Modal.jsx';
import BadgeCard from './BadgeCard.jsx';
import BadgeDownloadButton from './BadgeDownloadButton.jsx';
import { btnPrimary, btnSecondary } from './ui.jsx';

export default function BadgeModal({ employee, company, onClose }) {
  return (
    <Modal title="QR badge" onClose={onClose}>
      <div className="flex justify-center">
        <BadgeCard employee={employee} company={company} size={200} />
      </div>
      <div className="mt-5 flex gap-2">
        <BadgeDownloadButton
          employee={employee}
          company={company}
          className={`${btnPrimary} flex-1`}
        />
        <button onClick={onClose} className={`${btnSecondary} flex-1`}>
          Close
        </button>
      </div>
    </Modal>
  );
}
