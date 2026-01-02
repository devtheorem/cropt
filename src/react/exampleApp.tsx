import React, { useState, useRef } from 'react';
import CroptWrapper from './CroptWrapper';

function App() {
  const [cropData, setCropData] = useState(null);
  const croptRef = useRef<any>(null); // For accessing public methods

  const handleCropChange = (data: any) => {
    console.log('Crop updated:', data);
    setCropData(data);
  };

  const handleReady = () => {
    console.log('Cropt is ready!');
  };

  const triggerZoom = () => {
    croptRef.current?.setZoom(1.5);
  };

  return (
    <div>
      <h2>Image Cropper</h2>
      
      <CroptWrapper
        ref={croptRef} // Optional: for method access
        src="https://example.com/image.jpg"
        options={{
          viewport: { width: 300, height: 300, borderRadius: '8px' },
          zoomerInputClass: 'custom-slider',
          enableRotateBtns: true,
          transparencyColor: '#ffffff'
        }}
        onCropChange={handleCropChange}
        onReady={handleReady}
        className="my-cropper"
        style={{ maxWidth: '100%', border: '1px solid #ddd' }}
      />

      {cropData && (
        <div style={{ marginTop: '20px', padding: '10px', background: '#f9f9f9' }}>
          <h3>Crop Data:</h3>
          <pre>{JSON.stringify(cropData, null, 2)}</pre>
        </div>
      )}

      <button onClick={triggerZoom}>Set Zoom to 1.5x</button>
    </div>
  );
}

export default App;