// src/faceDrawer.js

export function drawFullFaceMesh(ctx, face, color = '#38bdf8') {
  if (!face || !face.box) return;

  const { x, y, width: w, height: h } = face.box;
  const len = Math.max(18, Math.min(30, w * 0.2));

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;

  // 1. Futuristic Corner Brackets (Bounding Box)
  ctx.beginPath();
  ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
  ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
  ctx.moveTo(x, y + h - len); ctx.lineTo(x, y + h); ctx.lineTo(x + len, y + h);
  ctx.moveTo(x + w - len, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - len);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 2. FACE Header Label (Mirrored locally taaki text seedha padha jaye)
  ctx.save();
  ctx.font = 'bold 15px Segoe UI, sans-serif';
  ctx.translate(x + w, Math.max(22, y - 8));
  ctx.scale(-1, 1);
  ctx.fillText('FACE', 0, 0);
  ctx.restore();

  // Helper: Draw Connected Lines
  const drawLineLoop = (pts, close = false, strokeColor = '#38bdf8', lineWidth = 2) => {
    if (!pts || pts.length < 2) return;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    if (close) ctx.closePath();
    ctx.stroke();
  };

  // 3. Eyes (Green Outline)
  if (face.leftEye) drawLineLoop(face.leftEye, true, '#10b981', 2);
  if (face.rightEye) drawLineLoop(face.rightEye, true, '#10b981', 2);

  // 4. Eyebrows (Cyan Outline)
  if (face.leftEyebrow) drawLineLoop(face.leftEyebrow, false, '#38bdf8', 2);
  if (face.rightEyebrow) drawLineLoop(face.rightEyebrow, false, '#38bdf8', 2);

  // 5. Nose Bridge & Tip (Amber Outline)
  if (face.nose) drawLineLoop(face.nose, false, '#fbbf24', 2);

  // 6. Lips (Coral Red Outline)
  if (face.mouth) drawLineLoop(face.mouth, true, '#f43f5e', 2);

  // 7. Full Jawline Contour (Subtle Slate)
  if (face.jaw) drawLineLoop(face.jaw, false, 'rgba(148, 163, 184, 0.6)', 1.5);

  // 8. 68-Point Mesh Dots (Glowing Grid Effect)
  if (face.allPoints && face.allPoints.length) {
    ctx.fillStyle = '#ffffff';
    face.allPoints.forEach((p, idx) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, idx >= 36 && idx <= 47 ? 2 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  ctx.restore();
}