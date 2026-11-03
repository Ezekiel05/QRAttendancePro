import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { BADGE_PREFIX } from '../utils/attendance.js';

// A button that downloads a 600x820 badge image (company, QR, name, code).
// Keeps a hidden high-resolution QR canvas so the PNG stays sharp.
export default function BadgeDownloadButton({ employee, company, className, children = 'Download PNG' }) {
  const hiResRef = useRef(null);

  function download() {
    const qr = hiResRef.current.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 820;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 600, 820);
    g.fillStyle = '#4f46e5';
    g.fillRect(0, 0, 600, 120);
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = 'bold 36px sans-serif';
    g.fillText(company, 300, 72, 560);
    g.drawImage(qr, 100, 160, 400, 400);
    g.fillStyle = '#0f172a';
    g.font = 'bold 44px sans-serif';
    g.fillText(employee.name, 300, 640, 560);
    g.fillStyle = '#475569';
    g.font = '28px sans-serif';
    g.fillText(employee.position || employee.department, 300, 690, 560);
    g.font = '24px monospace';
    g.fillText(employee.employeeCode, 300, 740, 560);

    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `${employee.name.replace(/[^\w-]+/g, '_')}-badge.png`;
    a.click();
  }

  return (
    <>
      <button type="button" onClick={download} className={className}>
        {children}
      </button>
      <div ref={hiResRef} className="hidden">
        <QRCodeCanvas value={BADGE_PREFIX + employee.badgeToken} size={400} includeMargin />
      </div>
    </>
  );
}
