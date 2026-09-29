// src/spatialLens.js

const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
const lerp = (start, end, amt) => start + (end - start) * amt;

export class SpatialLensController {
  constructor() {
    this.center = { x: 320, y: 240 };
    this.scale = 100;
    this.targetScale = 100;
    this.angleY = 0;
    this.angleX = 0.2;
    this.isSpawned = false;
    this.currentShape = 'pyramid'; // 'pyramid' | 'cube' | 'sphere'
    this.feedbackText = '';
    this.feedbackTimer = 0;
  }

  // Hook to change the active shape from UI
  setShape(shapeName) {
    this.currentShape = shapeName;
  }

  // Hook to cycle to the next shape via gesture
  cycleShape() {
    const list = ['pyramid', 'cube', 'sphere'];
    const idx = (list.indexOf(this.currentShape) + 1) % list.length;
    this.currentShape = list[idx];
    this.feedbackText = `SWITCHED TO: ${this.currentShape.toUpperCase()}`;
    this.feedbackTimer = performance.now();
    return this.currentShape;
  }

  // Advanced 3D Matrix Math Projection
  project3D(x, y, z, cx, cy, scale) {
    // Rotation around Y axis
    const cosY = Math.cos(this.angleY);
    const sinY = Math.sin(this.angleY);
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;

    // Rotation around X axis
    const cosX = Math.cos(this.angleX);
    const sinX = Math.sin(this.angleX);
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;

    // Perspective Division
    const fov = 350;
    const factor = fov / (fov + z2 * scale);

    return {
      x: cx + x1 * scale * factor,
      y: cy + y2 * scale * factor,
      z: z2 // Keep depth for potential depth sorting
    };
  }

  // Update logic to calculate position, scale, and rotation from hand coordinates
  update(hands) {
    if (!hands || hands.length < 2) {
      this.isSpawned = false;
      return false;
    }

    const h1 = hands[0];
    const h2 = hands[1];

    // Get smoothed fingertips positions (Mediapipe Pt 8: Index Fingertip)
    const p1 = h1.drawPoint;
    const p2 = h2.drawPoint;

    // Midpoint between hands (Shape spawn center)
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    this.center.x = lerp(this.center.x, midX, 0.35);
    this.center.y = lerp(this.center.y, midY, 0.35);

    // Dynamic Scaling: Distance between hands controls the size
    const handDistance = dist(p1, p2);
    this.targetScale = Math.max(50, Math.min(260, handDistance * 0.75));
    this.scale = lerp(this.scale, this.targetScale, 0.3);

    // Hand orientation tilts the 3D shape
    this.angleX = (p2.y - p1.y) * 0.003;
    this.angleY += 0.035; // Continuous hologram rotation

    this.isSpawned = true;
    return true;
  }

  // Defines 3D Geometry (Vertices and Edges) based on active shape
  getShapeGeometry() {
    if (this.currentShape === 'cube') {
      const v = [
        { x: -0.6, y: -0.6, z: -0.6 }, { x: 0.6, y: -0.6, z: -0.6 },
        { x: 0.6, y: 0.6, z: -0.6 }, { x: -0.6, y: 0.6, z: -0.6 },
        { x: -0.6, y: -0.6, z: 0.6 }, { x: 0.6, y: -0.6, z: 0.6 },
        { x: 0.6, y: 0.6, z: 0.6 }, { x: -0.6, y: 0.6, z: 0.6 }
      ];
      const e = [
        [0, 1], [1, 2], [2, 3], [3, 0], // Back face
        [4, 5], [5, 6], [6, 7], [7, 4], // Front face
        [0, 4], [1, 5], [2, 6], [3, 7]  // Connectors
      ];
      return { vertices: v, edges: e, label: '3D CYBER CUBE' };
    }

    if (this.currentShape === 'sphere') {
      const v = [];
      const e = [];
      const rings = 4;
      const segments = 8;
      
      // Latitude/Longitude Wireframe generator
      for (let i = 0; i <= rings; i++) {
        const theta = (i * Math.PI) / rings;
        for (let j = 0; j < segments; j++) {
          const phi = (j * 2 * Math.PI) / segments;
          v.push({
            x: 0.8 * Math.sin(theta) * Math.cos(phi),
            y: 0.8 * Math.cos(theta),
            z: 0.8 * Math.sin(theta) * Math.sin(phi)
          });
        }
      }
      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segments; j++) {
          const curr = i * segments + j;
          const next = i * segments + ((j + 1) % segments);
          const below = (i + 1) * segments + j;
          e.push([curr, next]);
          if (below < v.length) e.push([curr, below]);
        }
      }
      return { vertices: v, edges: e, label: '3D GEO-SPHERE' };
    }

    // Default: Pyramid / Tetrahedron prism
    const h = Math.sqrt(3) / 2;
    const v = [
      { x: 0, y: -h * 0.8, z: 0 },          // Top Apex
      { x: -0.85, y: h * 0.6, z: -0.6 },    // Base Left
      { x: 0.85, y: h * 0.6, z: -0.6 },     // Base Right
      { x: 0, y: h * 0.6, z: 0.85 }         // Base Front
    ];
    const e = [
      [0, 1], [0, 2], [0, 3], // Top to base points
      [1, 2], [2, 3], [3, 1]  // Base triangle loop
    ];
    return { vertices: v, edges: e, label: '3D PYRAMID' };
  }

  // Convert Hex color to transparent RGBA (for inner fill)
  hexToRgba(hex, alpha) {
    const cleanHex = hex.replace('#', '');
    let r = 56, g = 189, b = 248; // Default to Cyan if bad hex
    if (cleanHex.length === 6) {
      r = parseInt(cleanHex.substring(0, 2), 16);
      g = parseInt(cleanHex.substring(2, 4), 16);
      b = parseInt(cleanHex.substring(4, 6), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Core Render Method (Updated with precise transparent inner color logic)
  render(ctx, video, vw, vh, boundaryColor = '#38bdf8') {
    if (!this.isSpawned) return;

    const cx = this.center.x;
    const cy = this.center.y;
    const s = this.scale;

    const { vertices, edges, label } = this.getShapeGeometry();
    const pts = vertices.map(v => this.project3D(v.x, v.y, v.z, cx, cy, s));

    // ================= 1. DYNAMIC INNER COLOR LENS =================
    // Create the Portal Layer (Inverted background inside the shape boundary)
    ctx.save();
    ctx.beginPath();
    // Use the outer boundary of the projected 3D shape as a mask
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();

    ctx.save();
    ctx.clip(); // Mask is now set to the shape's area

    // Stylize the background visible ONLY inside the shape (The Portal)
    ctx.filter = 'contrast(1.4) saturate(1.8) hue-rotate(180deg) brightness(0.9)';
    ctx.drawImage(video, 0, 0, vw, vh);
    ctx.restore();

    // ================= 2. TRANSPARENT INNER FILL =================
    // Fill the shape with a transparent tint that matches the boundary color
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    
    // Dynamic Transparent Color (Inner) derived from the Boundary Color
    ctx.fillStyle = this.hexToRgba(boundaryColor, 0.22);
    ctx.fill();
    ctx.restore();

    // ================= 3. HOLOGRAPHIC WIREFRAME BOUNDARY =================
    ctx.save();
    ctx.lineWidth = 3.5;
    
    // Boundary Color dynamically sets the wireframe color
    ctx.strokeStyle = boundaryColor;
    
    // Neon Glow effect
    ctx.shadowColor = boundaryColor;
    ctx.shadowBlur = 16;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Draw Edges
    edges.forEach(([i, j]) => {
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[j].x, pts[j].y);
      ctx.stroke();
    });

    // Draw Glowing Vertex Nodes
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = boundaryColor; // Node color matches boundary color
      ctx.fill();
    });

    // ================= 4. HUD TEXT OVERLAY =================
    ctx.save();
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    ctx.translate(cx, cy + s * 0.95);
    ctx.scale(-1, 1);
    ctx.fillText(`${label} [SCALE: ${Math.round(s)}]`, -80, 0);

    // Dynamic gesture feedback notice (lasts 1.5 seconds)
    if (performance.now() - this.feedbackTimer < 1500) {
      ctx.fillStyle = boundaryColor;
      ctx.font = 'bold 15px Segoe UI, sans-serif';
      ctx.fillText(this.feedbackText, -90, -s * 2.2);
    }
    ctx.restore();

    ctx.restore();
  }
}