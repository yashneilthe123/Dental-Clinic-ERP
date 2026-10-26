import PDFDocument from 'pdfkit';

const money = (n, currency = 'INR') =>
  // PDFKit's built-in fonts can't draw the ₹ glyph, so prefix with the currency code
  `${currency} ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Stream a simple, printable A4 invoice to `stream`. */
export function renderInvoicePdf(invoice, settings, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(stream);
  const cur = settings.currency || 'INR';
  const teal = '#0f766e';

  // Header
  doc.fillColor(teal).fontSize(20).font('Helvetica-Bold').text(settings.clinic_name || 'Dental Clinic', 50, 50);
  doc.fillColor('#334155').fontSize(9).font('Helvetica');
  [settings.address, settings.phone && `Phone: ${settings.phone}`, settings.email, settings.gstin && `GSTIN: ${settings.gstin}`]
    .filter(Boolean)
    .forEach((line) => doc.text(line));

  doc.fontSize(16).font('Helvetica-Bold').fillColor('#0f172a').text('INVOICE', 400, 50, { align: 'right' });
  doc.fontSize(9).font('Helvetica').fillColor('#334155')
    .text(`No: ${invoice.invoice_number}`, 400, 72, { align: 'right' })
    .text(`Date: ${invoice.issue_date}`, { align: 'right' });
  if (invoice.due_date) doc.text(`Due: ${invoice.due_date}`, { align: 'right' });
  doc.text(`Status: ${invoice.status.toUpperCase()}`, { align: 'right' });

  // Bill to
  doc.moveDown(2);
  const billY = Math.max(doc.y, 140);
  doc.font('Helvetica-Bold').fillColor('#0f172a').fontSize(10).text('Bill to', 50, billY);
  doc.font('Helvetica').fillColor('#334155').fontSize(9)
    .text(`${invoice.patient_name} (${invoice.patient_code})`)
    .text(invoice.patient_phone || '');
  if (invoice.patient_address) doc.text(invoice.patient_address, { width: 250 });

  // Items table
  let y = doc.y + 20;
  const cols = { desc: 50, qty: 330, rate: 380, amt: 470 };
  doc.rect(50, y, 495, 20).fill('#f1f5f9');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9)
    .text('Description', cols.desc + 5, y + 6)
    .text('Qty', cols.qty, y + 6, { width: 40, align: 'right' })
    .text('Rate', cols.rate, y + 6, { width: 80, align: 'right' })
    .text('Amount', cols.amt, y + 6, { width: 70, align: 'right' });
  y += 26;
  doc.font('Helvetica').fillColor('#334155');
  for (const it of invoice.items) {
    const h = Math.max(14, doc.heightOfString(it.description, { width: 270 }));
    if (y + h > 740) { doc.addPage(); y = 50; }
    doc.text(it.description, cols.desc + 5, y, { width: 270 })
      .text(String(it.quantity), cols.qty, y, { width: 40, align: 'right' })
      .text(money(it.unit_price, cur), cols.rate, y, { width: 80, align: 'right' })
      .text(money(it.amount, cur), cols.amt, y, { width: 70, align: 'right' });
    y += h + 6;
    doc.moveTo(50, y - 3).lineTo(545, y - 3).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  }

  // Totals
  y += 6;
  const row = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(bold ? '#0f172a' : '#334155')
      .text(label, 350, y, { width: 110, align: 'right' })
      .text(value, cols.amt, y, { width: 70, align: 'right' });
    y += 16;
  };
  row('Subtotal', money(invoice.subtotal, cur));
  if (invoice.discount > 0) row('Discount', `- ${money(invoice.discount, cur)}`);
  if (invoice.tax_amount > 0) row(`Tax (${invoice.tax_rate}%)`, money(invoice.tax_amount, cur));
  row('Total', money(invoice.total, cur), true);
  row('Paid', money(invoice.amount_paid, cur));
  row('Balance due', money(invoice.total - invoice.amount_paid, cur), true);

  // Payments
  if (invoice.payments.length) {
    y += 10;
    doc.font('Helvetica-Bold').fillColor('#0f172a').text('Payments received', 50, y);
    y += 14;
    doc.font('Helvetica').fillColor('#334155');
    for (const p of invoice.payments) {
      const when = new Date(p.paid_at).toLocaleDateString('en-IN');
      doc.text(`${when}  ·  ${p.method.replace('_', ' ')}${p.reference ? ` (${p.reference})` : ''}  ·  ${money(p.amount, cur)}`, 50, y);
      y += 14;
    }
  }

  if (invoice.notes) {
    y += 10;
    doc.font('Helvetica-Bold').text('Notes', 50, y);
    doc.font('Helvetica').text(invoice.notes, 50, y + 14, { width: 495 });
  }

  doc.fontSize(8).fillColor('#94a3b8').text('Thank you for visiting. This is a computer-generated invoice.', 50, 780, {
    width: 495, align: 'center',
  });
  doc.end();
}
