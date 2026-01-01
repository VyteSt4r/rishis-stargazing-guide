# 🌌 Zenith Archive - 3D Sky Engine

A high-performance, Three.js-powered interactive sky map for modern astronomy visualization.

## 🎯 Architecture

### Core Components

1. **SkyMap (index.tsx)** - Main orchestrator
   - Manages time state and animation
   - Coordinates all sub-components
   - Handles user interactions
   - Provides glassmorphic HUD

2. **StarField.tsx** - High-performance star renderer
   - Uses Three.js `Points` system (not individual meshes)
   - Renders 9,000+ stars at 60 FPS
   - Implements B-V color index for realistic star colors
   - Magnitude-based sizing and visibility

3. **CelestialSphere.tsx** - Environmental renderer
   - Atmosphere gradient shader (zenith to horizon)
   - Azimuthal grid overlay
   - Ground plane with cardinal directions
   - Dynamic twilight simulation

4. **Planets.tsx** - Solar system bodies
   - Real-time planetary positions via astronomy-engine
   - Labeled spheres with glow effects
   - Magnitude-accurate sizing

## 🔬 Technical Stack

- **Three.js** - WebGL rendering engine
- **@react-three/fiber** - React reconciler for Three.js
- **@react-three/drei** - Helper components (OrbitControls, Text, etc.)
- **astronomy-engine** - High-precision astronomical calculations
- **satellite.js** - TLE parsing for ISS/Starlink tracking (ready for integration)

## 📊 Performance Metrics

- **Stars**: 9,110 rendered via Points (single draw call)
- **Target FPS**: 60 on M3 Mac, 30+ on mobile
- **Memory**: < 100MB for full catalog
- **Coordinate System**: Equatorial (RA/Dec) → Horizontal (Alt/Az) → Cartesian (XYZ)

## 🧮 Mathematics

### Coordinate Transformation Pipeline

```
1. Equatorial (RA/Dec, J2000) 
   ↓ [astronomy-engine]
2. Horizontal (Altitude/Azimuth, Observer-relative)
   ↓ [Spherical to Cartesian]
3. Three.js Cartesian (X, Y, Z)
   - Y = Up (altitude)
   - X/Z = Horizontal plane (azimuth)
```

### Key Formula: Horizontal → Cartesian

```typescript
const r = radius * cos(altitude);
const x = r * sin(azimuth);
const y = radius * sin(altitude);
const z = -r * cos(azimuth); // Negative Z for North
```

## 🎨 Visual Features

### Atmosphere Shader
Custom GLSL shader that interpolates between zenith and horizon colors based on sun altitude:
- **Night** (sun < -18°): Black → Deep blue
- **Twilight** (-18° to 0°): Gradient from orange to purple
- **Day** (sun > 0°): Blue sky simulation

### Star Rendering
- **Additive Blending**: Stars glow naturally when overlapping
- **B-V Color Index**: Realistic stellar colors (blue to red)
- **Magnitude Scaling**: `brightness = 2.512^(-magnitude)`
- **Bortle Scale**: Filters dim stars based on light pollution

## 🚀 Future Enhancements

### Planned Features
- [ ] **Satellite Tracking** - ISS and Starlink trails using satellite.js
- [ ] **Deep Sky Objects** - Galaxies, nebulae, clusters with fuzzy rendering
- [ ] **Constellation Lines** - Animated constellation artwork
- [ ] **Raycasting Selection** - Click stars to see detailed info
- [ ] **Vedic Star Names** - Cultural astronomy (Swati, Abhijit, etc.)
- [ ] **Milky Way Band** - Procedural or texture-based galaxy visualization
- [ ] **Light Pollution Post-FX** - Bloom and brightness threshold filters

### Performance Optimizations
- [ ] **LOD System** - Show more stars when zoomed in
- [ ] **Frustum Culling** - Don't render off-screen stars
- [ ] **Instanced Rendering** - For planets/satellites
- [ ] **Web Worker** - Offload coordinate calculations

## 🎓 Educational Value

Perfect for:
- **CS Portfolios**: Demonstrates 3D graphics, vector math, and WebGL
- **Astronomy Apps**: Real-time sky simulation with scientific accuracy
- **VR/AR**: Adaptable to immersive experiences
- **Data Visualization**: Techniques applicable to any 3D point cloud

## 🛠️ Usage

```tsx
import { SkyMap } from '@/components/SkyMap';

<SkyMap 
  location={{ latitude: 12.9716, longitude: 77.5946 }} // Bangalore
  bortleScale={4} // Suburban/rural transition
  showGrid={true}
  showGround={true}
  showPlanets={true}
/>
```

## 📦 Dependencies

```json
{
  "three": "Latest",
  "@react-three/fiber": "Latest",
  "@react-three/drei": "Latest",
  "astronomy-engine": "Latest",
  "satellite.js": "Latest"
}
```

## 🎯 Why This Approach?

Unlike traditional planetarium software that uses raster images or sprites:
- **Scalable**: Add millions of stars without performance loss
- **Accurate**: Real astronomical data and physics
- **Interactive**: Smooth 60 FPS navigation
- **Customizable**: Full control over rendering and data
- **Modern**: Built with React and Three.js best practices

---

**Built for the Modern Web** | **Optimized for Performance** | **Designed for Learning**
