// src/visionEngine.js
import * as faceapi from 'face-api.js';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { drawFullFaceMesh } from './faceDrawer';
import { SpatialLensController } from './spatialLens';

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
const lerp = (start, end, amt) => start + (end - start) * amt;

export class VisionPipeline {
  constructor(videoElement, canvasElement, callbacks) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { willReadFrequently: true });

    this.onEmotion = callbacks.onEmotion || (() => {});
    this.onColorChange = callbacks.onColorChange || (() => {});
    this.onShapeChange = callbacks.onShapeChange || (() => {});

    this.lensController = new SpatialLensController();
    this.handLandmarker = null;
    this.isFaceActive = true;
    this.isDrawMode = true;
    this.isLensActive = true;
    this.activeColor = '#38bdf8';

    this.animId = null;
    this.detectInt = null;
    this.isDetecting = false;

    this.lastColorPinchTime = 0;
    this.isColorPinchingNow = false;

    this.lastShapePinchTime = 0;
    this.isShapePinchingNow = false;

    this.palmStartTime = 0;
    this.isErasing = false;

    this.drawPaths = [];
    this.currentStroke = [];
    this.targetHands = [];
    this.currHands = [];
    this.targetFace = null;
    this.currFace = null;
    this.smoothPt = null;
  }

  async initialize() {
    // Works on localhost and GitHub Pages
    const MODEL_URL = `${import.meta.env.BASE_URL}models`;

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
    ]);

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `${MODEL_URL}/hand_landmarker.task`,
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.45,
      minTrackingConfidence: 0.45
    });

    this.startLoop();
  }

  setFaceActive(val) {
    this.isFaceActive = val;
    if (!val) this.targetFace = this.currFace = null;
  }

  setDrawMode(val) {
    this.isDrawMode = val;
  }

  setLensActive(val) {
    this.isLensActive = val;
  }

  setBrushColor(color) {
    this.activeColor = color;
  }

  setShape(shapeName) {
    this.lensController.setShape(shapeName);
  }

  cycleShape() {
    const nextShape = this.lensController.cycleShape();
    this.onShapeChange(nextShape);
    return nextShape;
  }

  clearCanvas() {
    this.drawPaths = [];
    this.currentStroke = [];
  }

  startLoop() {
    this.render();

    this.detectInt = setInterval(async () => {
      if (!this.video || this.video.readyState !== 4 || this.isDetecting) return;

      this.isDetecting = true;

      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      const now = performance.now();

      try {
        // ================= 1. HAND TRACKING LOOP =================
        if (this.handLandmarker) {
          const res = this.handLandmarker.detectForVideo(this.video, now);

          if (res?.landmarks?.length) {
            this.targetHands = res.landmarks.map((lms, i) => {
              const pts = lms.map(p => ({
                x: p.x * vw,
                y: p.y * vh
              }));

              const xs = pts.map(p => p.x);
              const ys = pts.map(p => p.y);
              const pad = 20;

              const isThumbUp = pts[4].y < pts[3].y;
              const isIndexUp = pts[8].y < pts[6].y;
              const isMiddleUp = pts[12].y < pts[10].y;
              const isRingUp = pts[16].y < pts[14].y;
              const isPinkyUp = pts[20].y < pts[18].y;

              const palmScale = Math.max(20, dist(pts[0], pts[9]));

              const isOpenPalm =
                isIndexUp &&
                isMiddleUp &&
                isRingUp &&
                isPinkyUp &&
                isThumbUp;

              if (isOpenPalm) {
                if (!this.palmStartTime) this.palmStartTime = now;

                if (now - this.palmStartTime > 350) {
                  this.isErasing = true;
                  this.clearCanvas();
                }
              } else {
                this.palmStartTime = 0;
                this.isErasing = false;
              }

              const pinchDist = dist(pts[4], pts[8]);

              const isPinching =
                (pinchDist / palmScale) < 0.35 &&
                !isOpenPalm;

              if (
                this.isLensActive &&
                this.targetHands.length >= 2
              ) {
                if (i === 1 && isPinching) {
                  if (
                    !this.isShapePinchingNow &&
                    now - this.lastShapePinchTime > 500
                  ) {
                    this.lastShapePinchTime = now;
                    this.cycleShape();
                  }

                  this.isShapePinchingNow = true;
                } else if (i === 1) {
                  this.isShapePinchingNow = false;
                }
              }

              if (
                i === 0 &&
                this.targetHands.length === 1 &&
                isPinching
              ) {
                if (
                  !this.isColorPinchingNow &&
                  now - this.lastColorPinchTime > 400
                ) {
                  this.lastColorPinchTime = now;
                  this.onColorChange();
                }

                this.isColorPinchingNow = true;
              } else if (
                i === 0 &&
                this.targetHands.length === 1
              ) {
                this.isColorPinchingNow = false;
              }

              const isDrawing =
                isIndexUp &&
                !isMiddleUp &&
                !isRingUp &&
                !isPinkyUp &&
                !isPinching &&
                !isOpenPalm;

              return {
                id: i,
                landmarks: pts,
                isDrawing,
                isPinching,
                isOpenPalm,
                drawPoint: pts[8],

                box: {
                  x: clamp(Math.min(...xs) - pad, 0, vw),
                  y: clamp(Math.min(...ys) - pad, 0, vh),
                  width: Math.max(
                    1,
                    Math.max(...xs) + pad -
                    (Math.min(...xs) - pad)
                  ),
                  height: Math.max(
                    1,
                    Math.max(...ys) + pad -
                    (Math.min(...ys) - pad)
                  )
                }
              };
            });
          } else {
            this.targetHands = [];
            this.currHands = [];
            this.smoothPt = null;
            this.isErasing = false;
            this.palmStartTime = 0;
            this.isShapePinchingNow = false;
            this.isColorPinchingNow = false;
          }
        }

        // ================= 2. FACE DETECTION LOOP =================
        if (this.isFaceActive) {
          const faceRes = await faceapi
            .detectSingleFace(
              this.video,
              new faceapi.TinyFaceDetectorOptions({
                inputSize: 320,
                scoreThreshold: 0.25
              })
            )
            .withFaceLandmarks()
            .withFaceExpressions();

          if (faceRes) {
            const b = faceRes.detection.box;
            const lms = faceRes.landmarks;

            const mapPts = pts =>
              pts.map(p => ({
                x: p.x,
                y: p.y
              }));

            this.targetFace = {
              box: {
                x: b.x,
                y: b.y,
                width: b.width,
                height: b.height
              },

              leftEye: mapPts(lms.getLeftEye()),
              rightEye: mapPts(lms.getRightEye()),
              leftEyebrow: mapPts(lms.getLeftEyeBrow()),
              rightEyebrow: mapPts(lms.getRightEyeBrow()),
              nose: mapPts(lms.getNose()),
              mouth: mapPts(lms.getMouth()),
              jaw: mapPts(lms.getJawOutline()),
              allPoints: mapPts(lms.positions)
            };

            const [topEmo] = Object.entries(
              faceRes.expressions
            ).sort(
              (a, b) => b[1] - a[1]
            )[0];

            this.onEmotion(topEmo);
          } else {
            this.targetFace = this.currFace = null;
            this.onEmotion('none');
          }
        }
      } finally {
        this.isDetecting = false;
      }
    }, 45);
  }

  render = () => {
    const video = this.video;
    const canvas = this.canvas;

    if (!video || !canvas || !video.videoWidth) {
      this.animId = requestAnimationFrame(this.render);
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (canvas.width !== vw) {
      canvas.width = vw;
    }

    if (canvas.height !== vh) {
      canvas.height = vh;
    }

    const ctx = this.ctx;

    ctx.clearRect(0, 0, vw, vh);

    ctx.save();

    ctx.translate(vw, 0);
    ctx.scale(-1, 1);

    // ================= 1. DUAL-HAND 3D SPATIAL TRANSFORMER =================
    if (
      this.isLensActive &&
      this.targetHands.length >= 2
    ) {
      this.lensController.update(this.targetHands);

      this.lensController.render(
        ctx,
        this.video,
        vw,
        vh,
        this.activeColor
      );
    }

    // ================= 2. AIR DRAWING INK =================
    if (this.isDrawMode) {
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      this.drawPaths.forEach(path => {
        if (!path.points || path.points.length < 2) return;

        ctx.strokeStyle = path.color;
        ctx.beginPath();

        ctx.moveTo(
          path.points[0].x,
          path.points[0].y
        );

        for (
          let i = 1;
          i < path.points.length;
          i++
        ) {
          ctx.lineTo(
            path.points[i].x,
            path.points[i].y
          );
        }

        ctx.stroke();
      });

      if (this.currentStroke.length >= 2) {
        ctx.strokeStyle = this.activeColor;
        ctx.beginPath();

        ctx.moveTo(
          this.currentStroke[0].x,
          this.currentStroke[0].y
        );

        for (
          let i = 1;
          i < this.currentStroke.length;
          i++
        ) {
          ctx.lineTo(
            this.currentStroke[i].x,
            this.currentStroke[i].y
          );
        }

        ctx.stroke();
      }
    }

    // ================= 3. FACE MESH RENDER =================
    if (
      this.isFaceActive &&
      this.targetFace
    ) {
      if (!this.currFace) {
        this.currFace =
          JSON.parse(
            JSON.stringify(this.targetFace)
          );
      } else {
        [
          'x',
          'y',
          'width',
          'height'
        ].forEach(k => {
          this.currFace.box[k] =
            lerp(
              this.currFace.box[k],
              this.targetFace.box[k],
              0.45
            );
        });

        this.currFace.leftEye =
          this.targetFace.leftEye;

        this.currFace.rightEye =
          this.targetFace.rightEye;

        this.currFace.leftEyebrow =
          this.targetFace.leftEyebrow;

        this.currFace.rightEyebrow =
          this.targetFace.rightEyebrow;

        this.currFace.nose =
          this.targetFace.nose;

        this.currFace.mouth =
          this.targetFace.mouth;

        this.currFace.jaw =
          this.targetFace.jaw;

        this.currFace.allPoints =
          this.targetFace.allPoints;
      }

      drawFullFaceMesh(
        ctx,
        this.currFace,
        '#38bdf8'
      );
    }

    // ================= 4. HAND SKELETON & AIR DRAW STROKE =================
    if (this.targetHands.length) {
      if (
        this.currHands.length !==
        this.targetHands.length
      ) {
        this.currHands =
          JSON.parse(
            JSON.stringify(this.targetHands)
          );
      } else {
        this.currHands.forEach(
          (h, i) => {
            [
              'x',
              'y',
              'width',
              'height'
            ].forEach(k => {
              h.box[k] =
                lerp(
                  h.box[k],
                  this.targetHands[i].box[k],
                  0.5
                );
            });

            h.landmarks.forEach(
              (p, j) => {
                p.x = lerp(
                  p.x,
                  this.targetHands[i].landmarks[j].x,
                  0.5
                );

                p.y = lerp(
                  p.y,
                  this.targetHands[i].landmarks[j].y,
                  0.5
                );
              }
            );

            h.isDrawing =
              this.targetHands[i].isDrawing;

            h.isPinching =
              this.targetHands[i].isPinching;

            h.isOpenPalm =
              this.targetHands[i].isOpenPalm;

            h.drawPoint =
              h.landmarks[8];
          }
        );
      }

      // Air draw (Single hand only)
      if (this.targetHands.length === 1) {
        const active = this.currHands[0];

        if (active) {
          if (!this.smoothPt) {
            this.smoothPt = {
              x: active.drawPoint.x,
              y: active.drawPoint.y
            };
          } else {
            this.smoothPt.x =
              lerp(
                this.smoothPt.x,
                active.drawPoint.x,
                0.7
              );

            this.smoothPt.y =
              lerp(
                this.smoothPt.y,
                active.drawPoint.y,
                0.7
              );
          }

          if (this.isDrawMode) {
            if (active.isOpenPalm) {
              this.currentStroke = [];
            } else if (active.isDrawing) {
              this.currentStroke.push({
                x: this.smoothPt.x,
                y: this.smoothPt.y
              });
            } else if (
              this.currentStroke.length > 0
            ) {
              this.drawPaths.push({
                points: [
                  ...this.currentStroke
                ],
                color: this.activeColor
              });

              this.currentStroke = [];
            }
          }
        }
      } else {
        if (this.currentStroke.length > 0) {
          this.drawPaths.push({
            points: [
              ...this.currentStroke
            ],
            color: this.activeColor
          });

          this.currentStroke = [];
        }
      }

      this.currHands.forEach(
        (h, i) =>
          this.drawHandHUD(ctx, h, i)
      );
    } else {
      if (this.currentStroke.length > 0) {
        this.drawPaths.push({
          points: [
            ...this.currentStroke
          ],
          color: this.activeColor
        });

        this.currentStroke = [];
      }

      this.smoothPt = null;
    }

    ctx.restore();

    this.animId =
      requestAnimationFrame(
        this.render
      );
  };

  drawHandHUD(ctx, h, index) {
    if (!h) return;

    const lms = h.landmarks;

    let label =
      index === 0
        ? 'RIGHT HAND'
        : 'LEFT HAND';

    let hudColor =
      index === 0
        ? '#38bdf8'
        : '#a78bfa';

    if (
      this.isLensActive &&
      this.targetHands.length >= 2 &&
      index === 1 &&
      h.isPinching
    ) {
      label = 'NEXT SHAPE 🔄';
      hudColor = '#10b981';
    } else if (h.isOpenPalm) {
      label =
        this.isErasing
          ? 'CLEARED 🖐️'
          : 'HOLD TO ERASE';

      hudColor = '#ef4444';
    } else if (
      h.isPinching &&
      this.targetHands.length === 1
    ) {
      label = 'COLOR SWITCHED 🎨';
      hudColor = this.activeColor;
    } else if (
      h.isDrawing &&
      this.targetHands.length === 1
    ) {
      label = 'WRITING ✍️';
      hudColor = this.activeColor;
    }

    const {
      x,
      y,
      width: w,
      height: hgt
    } = h.box;

    const len = Math.max(
      18,
      Math.min(30, w * 0.2)
    );

    ctx.save();

    ctx.strokeStyle = hudColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = hudColor;
    ctx.shadowBlur = 8;

    ctx.beginPath();

    ctx.moveTo(
      x,
      y + len
    );
    ctx.lineTo(
      x,
      y
    );
    ctx.lineTo(
      x + len,
      y
    );

    ctx.moveTo(
      x + w - len,
      y
    );
    ctx.lineTo(
      x + w,
      y
    );
    ctx.lineTo(
      x + w,
      y + len
    );

    ctx.moveTo(
      x,
      y + hgt - len
    );
    ctx.lineTo(
      x,
      y + hgt
    );
    ctx.lineTo(
      x + len,
      y + hgt
    );

    ctx.moveTo(
      x + w - len,
      y + hgt
    );
    ctx.lineTo(
      x + w,
      y + hgt
    );
    ctx.lineTo(
      x + w,
      y + hgt - len
    );

    ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.save();

    ctx.font =
      'bold 14px sans-serif';

    ctx.fillStyle = hudColor;

    ctx.translate(
      x + w,
      Math.max(20, y - 8)
    );

    ctx.scale(-1, 1);

    ctx.fillText(
      label,
      0,
      0
    );

    ctx.restore();

    ctx.strokeStyle = '#c4b5fd';
    ctx.lineWidth = 2;

    HAND_CONNECTIONS.forEach(
      ([s, e]) => {
        ctx.beginPath();

        ctx.moveTo(
          lms[s].x,
          lms[s].y
        );

        ctx.lineTo(
          lms[e].x,
          lms[e].y
        );

        ctx.stroke();
      }
    );

    const pt = h.drawPoint;

    ctx.beginPath();

    ctx.arc(
      pt.x,
      pt.y,
      10,
      0,
      Math.PI * 2
    );

    ctx.strokeStyle = hudColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  destroy() {
    clearInterval(this.detectInt);
    cancelAnimationFrame(this.animId);
    this.handLandmarker?.close();
  }
}