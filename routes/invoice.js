const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const WATERMARK_TEXT = 'dpjengineering.lk';


const TERMS = [
  'This quotation is valid for 30 days from the date of issue.',
];

const NOTES = [
  'Advance payment                : LKR 5,000.00' ,
  'Additional site visit  Charges : LKR 5,000.00 (per visit, if applicable)',
  'Electrician or Responsible person must be attending the site inspection period',
  'Remaining payment balance should be settled - After completion of testing',
  'Proposal & Recommendation will submit within 3 working days after site inspection.'
];

const BANK = {
  accountName: 'DPJ Engineering Company',
  bank: 'Bank of Ceylon (BOC) - Panadura Bazzar Branch',
  accountNo: '86040767',
};



function drawWatermark(doc, W, H) {
  doc.save();
  doc.translate(W / 2, H / 2);
  doc.rotate(-45);
  doc.font('Helvetica-Bold').fontSize(48)
     .fillOpacity(0.07).fillColor('#1a1a2e')
     .text(WATERMARK_TEXT, -200, -24, { width: 400, align: 'center' });
  doc.restore();
  doc.fillOpacity(1);
}

// ── Sequence helpers ──────────────────────────────────────────
const seqPath = path.join(__dirname, '../data/sequence.json');

function getAndIncrementRef() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm   = String(today.getMonth() + 1).padStart(2, '0');
  const dd   = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  let stored = { date: '', seq: 0 };
  try { stored = JSON.parse(fs.readFileSync(seqPath, 'utf8')); } catch (e) {}

  const nextSeq = stored.date === dateStr ? stored.seq + 1 : 1;
  fs.writeFileSync(seqPath, JSON.stringify({ date: dateStr, seq: nextSeq }, null, 2));

  return `DPJ/EC/${yyyy}/${mm}${dd}-${String(nextSeq).padStart(3, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ── PDF Generation ─────────────────────────────────────────────
router.post('/generate', (req, res) => {
  try {
    const {
      customerName, customerAddress, customerPhone, customerEmail,
      siteAddress, date, zone, items, transport, discount
    } = req.body;

    const quotationRef = getAndIncrementRef();

    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Quotation_${quotationRef.replace(/\//g, '_')}.pdf"`);
    doc.pipe(res);

    const W = 595.28, H = 841.89, M = 40, CW = W - M * 2;

    // ─ Watermark ─
    drawWatermark(doc, W, H);

    // ─ Letterhead ─
    const lhPath = path.join(__dirname, '../assets/Letter_head.jpg');
    if (fs.existsSync(lhPath)) doc.image(lhPath, M, M, { width: CW });

    let y = 155;

    // ─ 1. Ref LEFT, Date LEFTaligned ───────
    doc.font('Helvetica').fontSize(9).fillColor('#333');
    doc.text(`Ref: ${quotationRef}`, M, y, { align: 'left', width: CW }); y += 13;
    doc.text(`Date: ${formatDate(date)}`, M, y, { align: 'left', width: CW }); y += 20;

    // ─ 2. QUOTATION title with underline ─────────────────────────
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e');
    doc.text('QUOTATION', M, y, { align: 'center', width: CW, underline: true });
    y += 22;

    // ─ Client details ─
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#333');
    doc.text('To,', M, y); y += 13;
    doc.font('Helvetica').fontSize(9).fillColor('#333');
    doc.text(customerName, M, y); y += 13;
    if (customerAddress) { doc.text(customerAddress, M, y); y += 13; }
    if (customerPhone)   { doc.text(`Tel: ${customerPhone}`, M, y); y += 13; }
    if (customerEmail)   { doc.text(`Email: ${customerEmail}`, M, y); y += 13; }
    y += 6;

    // ─ Inspection Site (no Price Zone line) ──────────────────────
    if (siteAddress) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#333');
      doc.text('Inspection Site:', M, y); y += 13;
      doc.font('Helvetica').fontSize(9).fillColor('#333');
      doc.text(siteAddress, M, y); y += 13;
    }
    // 3. Price Zone line REMOVED
    y += 10;

    // ─ Table header ─
    const C = { no: M, desc: M + 22, price: M + 320, qty: M + 400, total: M + 452 };
    const tableStartY = y;

    doc.rect(M, y, CW, 20).fill('#1a1a2e');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('white');
    doc.text('#',           C.no,    y + 6, { width: 20 });
    doc.text('Description', C.desc,  y + 6, { width: 290, align: 'left' } );
    doc.text('Unit Price',  C.price, y + 6, { width: 75, align: 'center' });
    doc.text('Qty',         C.qty,   y + 6, { width: 45, align: 'center' });
    doc.text('Total (LKR)', C.total, y + 6, { width: 60, align: 'right' });
    y += 20;

    let subtotal = 0;
    let rowCount = 0;

    function addTableRow(description, unitPrice, quantity) {
      const rowTotal = unitPrice * quantity;
      subtotal += rowTotal;
      const rh = 22;

      if (y + rh > H - 190) {
        doc.addPage({ size: 'A4', margin: 0 });
        drawWatermark(doc, W, H);
        y = M + 20;
        doc.rect(M, y, CW, 20).fill('#1a1a2e');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('white');
        doc.text('#',           C.no,    y + 6, { width: 20 });
        doc.text('Description', C.desc,  y + 6, { width: 290, align: 'left' });
        doc.text('Unit Price',  C.price, y + 6, { width: 75, align: 'center' });
        doc.text('Qty',         C.qty,   y + 6, { width: 45, align: 'center' });
        doc.text('Total (LKR)', C.total, y + 6, { width: 60, align: 'right' });
        y += 20;
      }

      doc.rect(M, y, CW, rh).fill(rowCount % 2 === 0 ? '#f5f5f5' : '#ffffff');
      doc.fillColor('#333').font('Helvetica').fontSize(8);
      doc.text(`${rowCount + 1}`,          C.no,    y + 7, { width: 20 });
      doc.text(description,                C.desc,  y + 7, { width: 290, align: 'left' });
      doc.text(unitPrice.toLocaleString(), C.price, y + 7, { width: 75, align: 'center' });
      doc.text(quantity.toString(),        C.qty,   y + 7, { width: 45, align: 'center' });
      doc.font('Helvetica-Bold')
         .text(rowTotal.toLocaleString(),  C.total, y + 7, { width: 60, align: 'right' });
      y += rh;
      rowCount++;
    }

    (items || []).forEach(item => addTableRow(item.item, item.unitPrice, item.quantity));

    // Transport row
    if (transport && transport > 0) {
      const rh = 22;
      if (y + rh > H - 190) {
        doc.addPage({ size: 'A4', margin: 0 });
        drawWatermark(doc, W, H);
        y = M + 20;
      }
      doc.rect(M, y, CW, rh).fill(rowCount % 2 === 0 ? '#f5f5f5' : '#ffffff');
      doc.fillColor('#333').font('Helvetica').fontSize(8);
      doc.text(`${rowCount + 1}`,          C.no,    y + 7, { width: 20 });
      doc.text('Total Transport Cost',     C.desc,  y + 7, { width: 290, align: 'left' });
      doc.text('-',                        C.price, y + 7, { width: 75, align: 'center' });
      doc.text('-',                        C.qty,   y + 7, { width: 45, align: 'center' });
      doc.font('Helvetica-Bold')
         .text(transport.toLocaleString(), C.total, y + 7, { width: 60, align: 'right' });
      y += rh;
      subtotal += transport;
      rowCount++;
    }

    // Table border
    doc.rect(M, tableStartY, CW, y - tableStartY).strokeColor('#ddd').lineWidth(0.5).stroke();
    y += 5;
    doc.moveTo(M, y).lineTo(W - M, y).strokeColor('#1a1a2e').lineWidth(1).stroke();
    y += 10;

    // ─ Totals ─
    if (discount && discount > 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#333');
      doc.text(`Subtotal:  LKR ${subtotal.toLocaleString()}`, M, y, { align: 'right', width: CW }); y += 16;
      doc.font('Helvetica').fontSize(10).fillColor('#cc0000');
      doc.text(`Discount:  - LKR ${discount.toLocaleString()}`, M, y, { align: 'right', width: CW }); y += 14;
      doc.moveTo(M, y).lineTo(W - M, y).strokeColor('#aaa').lineWidth(0.5).stroke(); y += 8;
    }
    const grandTotal = Math.max(0, subtotal - (discount || 0));
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a1a2e');
    doc.text(`Grand Total:  LKR ${grandTotal.toLocaleString()}`, M, y, { align: 'right', width: CW });
    y += 28;

    function ensureSpace(h) {
      if (y + h > H - 20) {
        doc.addPage({ size: 'A4', margin: 0 });
        drawWatermark(doc, W, H);
        y = M + 20;
      }
    }

    // ─ Terms ─
    ensureSpace(14 + TERMS.length * 12 + 10);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#333');
    doc.text('Terms & Conditions:', M, y); y += 13;
    doc.font('Helvetica').fontSize(7.5).fillColor('#666');
    TERMS.forEach(t => { doc.text(`• ${t}`, M + 4, y); y += 12; });
    y += 10;

    // ─ Notes ─
    ensureSpace(14 + NOTES.length * 12 + 12);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#333');
    doc.text('Additional Notes:', M, y); y += 13;
    doc.font('Helvetica').fontSize(7.5).fillColor('#666');
    NOTES.forEach(n => { doc.text(`• ${n}`, M + 4, y); y += 12; });
    y += 12;

    // ─ Bank Info ─
    const bankH = 62;
    ensureSpace(bankH + 20);
    doc.rect(M, y, CW, bankH).fill('#f0f4ff');
    doc.rect(M, y, CW, bankH).strokeColor('#4f46e5').lineWidth(0.8).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1a1a2e');
    doc.text('Bank Account Information', M + 10, y + 8);
    doc.font('Helvetica').fontSize(8).fillColor('#333');
    doc.text(`Account Name  :  ${BANK.accountName}`, M + 10, y + 22);
    doc.text(`Bank                  :  ${BANK.bank}`,   M + 10, y + 34);
    doc.text(`Account No       :  ${BANK.accountNo}`,   M + 10, y + 46);
    y += bankH + 18;

    
    // =============================================
        // SIGNATURE BOX (left aligned, half page width)
        // =============================================
        // ─ Signature ─
        const sigPath = path.join(__dirname, '../assets/signature.jpg');
        if (fs.existsSync(sigPath)) {
          const sigInfo = doc.openImage(sigPath);
          const sigW = 80; // adjust width as needed
          const sigH = (sigInfo.height / sigInfo.width) * sigW;
          ensureSpace(sigH + 30);
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#333');
          doc.text('Authorized Signature:', M, y); y += 8;
          doc.image(sigPath, M, y, { width: sigW });
          y += sigH + 10;
        } else {
          console.warn('⚠️  Signature image not found at:', sigPath);
        }


    
        // =============================================
        // FOOTER INLINE IMAGE
        // =============================================
        const ftPath = path.join(__dirname, '../assets/footer.jpg');
        if (fs.existsSync(ftPath)) {
          const imgInfo = doc.openImage(ftPath);
          const renderedH = (imgInfo.height / imgInfo.width) * CW;
          ensureSpace(renderedH + 10);
          doc.image(ftPath, M, y, { width: CW });
          y += renderedH + 10;
        }
    
    drawWatermark(doc, W, H);

    doc.end();

  } catch (err) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;