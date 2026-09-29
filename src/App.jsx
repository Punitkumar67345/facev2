import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { VisionPipeline } from './visionEngine';
import './App.css';

const EMOTIONS = {
  neutral: { name: 'Neutral', icon: '😐' },
  happy: { name: 'Happy', icon: '😊' },
  sad: { name: 'Sad', icon: '😢' },
  angry: { name: 'Angry', icon: '😠' },
  fearful: { name: 'Scared', icon: '😨' },
  disgusted: { name: 'Disgust', icon: '🤢' },
  surprised: { name: 'Surprised', icon: '😲' },
  none: { name: 'No Face Detected', icon: '⚠️' }
};

const COLOR_PALETTE = ['#38bdf8', '#ef4444', '#10b981', '#fbbf24', '#ffffff'];

export default function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const pipelineRef = useRef(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [emotion, setEmotion] = useState({ name: 'Scanning...', icon: '👀' });

  const [isFaceActive, setIsFaceActive] = useState(true);
  const [isDrawMode, setIsDrawMode] = useState(true);
  const [isLensActive, setIsLensActive] = useState(true);
  const [selectedShape, setSelectedShape] = useState('pyramid'); // 'pyramid' | 'cube' | 'sphere'
  const [brushIndex, setBrushIndex] = useState(0);

  const activeColor = COLOR_PALETTE[brushIndex];

  const handleVideoReady = async () => {
    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;
    if (!video || !canvas || pipelineRef.current) return;

    const pipeline = new VisionPipeline(video, canvas, {
      onEmotion: (emo) => {
        if (EMOTIONS[emo]) setEmotion(EMOTIONS[emo]);
      },
      onColorChange: () => {
        setBrushIndex((prev) => {
          const next = (prev + 1) % COLOR_PALETTE.length;
          pipelineRef.current?.setBrushColor(COLOR_PALETTE[next]);
          return next;
        });
      },
      // Haath se shape badalne par Navbar tab sync hoga
      onShapeChange: (newShape) => {
        setSelectedShape(newShape);
      }
    });

    await pipeline.initialize();
    pipelineRef.current = pipeline;
    setIsLoaded(true);
  };

  useEffect(() => {
    return () => pipelineRef.current?.destroy();
  }, []);

  const toggleFace = () => {
    const next = !isFaceActive;
    setIsFaceActive(next);
    pipelineRef.current?.setFaceActive(next);
    if (!next) setEmotion({ name: 'Face Tracking Off', icon: '⏸️' });
  };

  const toggleDraw = () => {
    const next = !isDrawMode;
    setIsDrawMode(next);
    pipelineRef.current?.setDrawMode(next);
  };

  const toggleLens = () => {
    const next = !isLensActive;
    setIsLensActive(next);
    pipelineRef.current?.setLensActive(next);
  };

  const handleShapeSelect = (shape) => {
    setSelectedShape(shape);
    pipelineRef.current?.setShape(shape);
  };

  const handleColorSelect = (idx) => {
    setBrushIndex(idx);
    pipelineRef.current?.setBrushColor(COLOR_PALETTE[idx]);
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo">EmotionAI Web</div>

        <div className="nav-controls">
          {/* 3D Shape Switcher Tabs */}
          {isLensActive && (
            <div className="shape-switcher">
              <button
                type="button"
                className={`shape-tab ${selectedShape === 'pyramid' ? 'active' : ''}`}
                onClick={() => handleShapeSelect('pyramid')}
              >
                🔺 Pyramid
              </button>
              <button
                type="button"
                className={`shape-tab ${selectedShape === 'cube' ? 'active' : ''}`}
                onClick={() => handleShapeSelect('cube')}
              >
                🧊 Cube
              </button>
              <button
                type="button"
                className={`shape-tab ${selectedShape === 'sphere' ? 'active' : ''}`}
                onClick={() => handleShapeSelect('sphere')}
              >
                🌐 Sphere
              </button>
            </div>
          )}

          {/* Color Palette */}
          {isDrawMode && (
            <div className="color-palette">
              {COLOR_PALETTE.map((hex, idx) => (
                <button
                  key={hex}
                  type="button"
                  className={`color-dot ${brushIndex === idx ? 'selected' : ''}`}
                  style={{ backgroundColor: hex }}
                  onClick={() => handleColorSelect(idx)}
                />
              ))}
              <button
                type="button"
                className="clear-btn"
                onClick={() => pipelineRef.current?.clearCanvas()}
              >
                Clear
              </button>
            </div>
          )}

          {/* 3D Shape Toggle */}
          <button
            type="button"
            className={`toggle-btn ${isLensActive ? 'active-lens' : 'inactive'}`}
            onClick={toggleLens}
          >
            <span className="btn-indicator"></span>
            {isLensActive ? '3D Shapes: ON 🔮' : '3D Shapes: OFF'}
          </button>

          {/* Air Draw Toggle */}
          <button
            type="button"
            className={`toggle-btn ${isDrawMode ? 'active-draw' : 'inactive'}`}
            onClick={toggleDraw}
          >
            <span className="btn-indicator"></span>
            {isDrawMode ? 'Air Draw: ON ✍️' : 'Air Draw: OFF'}
          </button>

          {/* Face Tracking Toggle */}
          <button
            type="button"
            className={`toggle-btn ${isFaceActive ? 'active' : 'inactive'}`}
            onClick={toggleFace}
          >
            <span className="btn-indicator"></span>
            {isFaceActive ? 'Face: ON' : 'Face: OFF'}
          </button>
        </div>
      </nav>

      <main className="main-content">
        <div className="camera-section">
          {!isLoaded && (
            <div className="loading-screen">
              <div className="spinner"></div>
              <p>Loading 3D Spatial Transformer...</p>
            </div>
          )}
          <Webcam
            ref={webcamRef}
            className="webcam"
            audio={false}
            onPlay={handleVideoReady}
            videoConstraints={{ facingMode: 'user', width: 640, height: 480 }}
          />
          <canvas ref={canvasRef} className="overlay-canvas" />
        </div>

        <div className="info-section">
          <h1 className="title">Neuro-Scan Analysis</h1>
          <p className="subtitle">3D Holo-Matrix + Emotion AI</p>

          <div className="status-card">
            <div className="label">CURRENT EMOTIONAL STATE</div>
            <div className="emotion-text" style={{ color: activeColor }}>
              {emotion.icon} {emotion.name}
            </div>
          </div>

          <div className="status-card" style={{ marginTop: '20px' }}>
            <div className="label">GESTURE CONTROLS</div>
            <p className="instruction-text">
              👐 <b>Dono Haath Saamne:</b> 3D Hologram shape spawn hoga.<br />
              ↔️ <b>Haath Dur / Pass:</b> Shape ka size chhota ya bada hoga.<br />
              👌 <b>Left Hand Pinch:</b> Shape badlega (Pyramid ➔ Cube ➔ Sphere).<br />
              ☝️ <b>Single Hand 1-Finger:</b> Air Drawing likhein.<br />
              👌 <b>Single Hand Pinch:</b> Drawing & Shape ka colour change karein.<br />
              🖐️ <b>Open Palm:</b> Canvas erase karein.
            </p>
          </div>

          <div className="signature">
            Made by Pratiksha and Aarti with <span>❤️</span>
          </div>
        </div>
      </main>
    </div>
  );
}