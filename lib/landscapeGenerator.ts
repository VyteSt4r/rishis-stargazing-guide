/**
 * Procedural landscape generator for realistic horizon silhouettes
 * Creates tree and hill shapes similar to Stellarium Web
 */

export type LandscapePath = {
  type: 'hills' | 'trees' | 'mountains'
  points: Array<{ x: number; y: number }>
  color: string
  opacity: number
}

/**
 * Generate procedural hills using Perlin-like noise
 */
export function generateHills(
  width: number,
  baseHeight: number,
  amplitude: number,
  frequency: number,
  seed: number = 42
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  const numPoints = Math.ceil(width / 10) // Point every 10 pixels
  
  // Simple pseudo-random function
  const random = (x: number) => {
    const s = Math.sin(x * 12.9898 + seed) * 43758.5453
    return s - Math.floor(s)
  }
  
  // Generate smooth hills using interpolated noise
  for (let i = 0; i <= numPoints; i++) {
    const x = (i / numPoints) * width
    const t = i * frequency
    
    // Combine multiple frequencies for natural look
    const noise1 = Math.sin(t * 0.5) * 0.5
    const noise2 = Math.sin(t * 1.2 + 3) * 0.3
    const noise3 = Math.sin(t * 2.1 + 7) * 0.2
    const noise = noise1 + noise2 + noise3
    
    const y = baseHeight - (noise * amplitude)
    points.push({ x, y })
  }
  
  return points
}

/**
 * Generate tree silhouettes
 */
export function generateTrees(
  canvasWidth: number,
  baseY: number,
  count: number,
  seed: number = 42
): Array<{ x: number; y: number; width: number; height: number; type: 'pine' | 'deciduous' }> {
  const trees: Array<{ x: number; y: number; width: number; height: number; type: 'pine' | 'deciduous' }> = []
  
  const random = (i: number) => {
    const s = Math.sin(i * 12.9898 + seed) * 43758.5453
    return s - Math.floor(s)
  }
  
  for (let i = 0; i < count; i++) {
    const x = random(i) * canvasWidth
    const height = 40 + random(i + 100) * 80 // 40-120px tall
    const treeWidth = height * (0.3 + random(i + 200) * 0.3) // Proportional width
    const type = random(i + 300) > 0.6 ? 'pine' : 'deciduous'
    
    trees.push({ x, y: baseY, width: treeWidth, height, type })
  }
  
  return trees.sort((a, b) => a.x - b.x)
}

/**
 * Draw a pine tree silhouette
 */
export function drawPineTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string = 'rgba(0, 0, 0, 0.9)'
) {
  ctx.fillStyle = color
  ctx.beginPath()
  
  // Tree trunk
  const trunkWidth = width * 0.15
  ctx.rect(x - trunkWidth / 2, y - height * 0.2, trunkWidth, height * 0.2)
  ctx.fill()
  
  // Three triangular sections
  const sections = 3
  for (let i = 0; i < sections; i++) {
    const sectionHeight = height * 0.35
    const sectionY = y - height * 0.2 - (i * sectionHeight * 0.7)
    const sectionWidth = width * (1 - i * 0.2)
    
    ctx.beginPath()
    ctx.moveTo(x, sectionY - sectionHeight)
    ctx.lineTo(x - sectionWidth / 2, sectionY)
    ctx.lineTo(x + sectionWidth / 2, sectionY)
    ctx.closePath()
    ctx.fill()
  }
}

/**
 * Draw a deciduous tree silhouette
 */
export function drawDeciduousTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string = 'rgba(0, 0, 0, 0.9)'
) {
  ctx.fillStyle = color
  
  // Tree trunk
  const trunkWidth = width * 0.15
  ctx.fillRect(x - trunkWidth / 2, y - height * 0.3, trunkWidth, height * 0.3)
  
  // Round canopy using multiple circles
  const canopyHeight = height * 0.7
  const canopyY = y - height * 0.3
  
  ctx.beginPath()
  // Main circle
  ctx.arc(x, canopyY - canopyHeight / 2, width / 2, 0, Math.PI * 2)
  ctx.fill()
  
  // Additional circles for irregular shape
  ctx.beginPath()
  ctx.arc(x - width * 0.3, canopyY - canopyHeight * 0.4, width * 0.35, 0, Math.PI * 2)
  ctx.fill()
  
  ctx.beginPath()
  ctx.arc(x + width * 0.3, canopyY - canopyHeight * 0.4, width * 0.35, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Draw complete landscape with hills and trees that wraps in fisheye projection
 * Uses smooth layering for realistic silhouette effect like Stellarium
 */
export function drawLandscape(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  horizonY: number,
  nightMode: boolean = false
) {
  // Save context
  ctx.save();
  
  // Create a more realistic curved horizon for fisheye effect
  // The landscape should curve up at the edges
  const centerX = width / 2;
  const fisheyeCurve = (x: number) => {
    const normalizedX = (x - centerX) / centerX; // -1 to 1
    const curve = normalizedX * normalizedX * 30; // Parabolic curve
    return horizonY - curve;
  };
  
  // Generate realistic layered hills with fisheye curvature
  const generateCurvedHills = (baseOffset: number, amplitude: number, frequency: number, seed: number) => {
    const points: Array<{ x: number; y: number }> = [];
    const numPoints = Math.ceil(width / 5);
    
    for (let i = 0; i <= numPoints; i++) {
      const x = (i / numPoints) * width;
      const t = i * frequency;
      
      // Combine sine waves for natural terrain
      const noise1 = Math.sin(t * 0.5 + seed) * 0.5;
      const noise2 = Math.sin(t * 1.2 + seed + 3) * 0.3;
      const noise3 = Math.sin(t * 2.5 + seed + 7) * 0.2;
      const noise = noise1 + noise2 + noise3;
      
      const baseY = fisheyeCurve(x) + baseOffset;
      const y = baseY - (noise * amplitude);
      
      points.push({ x, y });
    }
    
    return points;
  };
  
  // Layer 1: Far distant hills (lightest, most curved)
  const farHills = generateCurvedHills(80, 25, 0.008, 1);
  ctx.fillStyle = nightMode ? 'rgba(25, 15, 15, 0.5)' : 'rgba(40, 60, 50, 0.4)';
  ctx.beginPath();
  ctx.moveTo(0, height);
  farHills.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  
  // Layer 2: Mid-distance hills
  const midHills = generateCurvedHills(50, 35, 0.012, 2);
  ctx.fillStyle = nightMode ? 'rgba(20, 12, 12, 0.7)' : 'rgba(25, 45, 35, 0.65)';
  ctx.beginPath();
  ctx.moveTo(0, height);
  midHills.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  
  // Layer 3: Near hills with more detail
  const nearHills = generateCurvedHills(25, 45, 0.018, 3);
  ctx.fillStyle = nightMode ? 'rgba(15, 8, 8, 0.85)' : 'rgba(15, 30, 20, 0.8)';
  ctx.beginPath();
  ctx.moveTo(0, height);
  nearHills.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  
  // Layer 4: Tree line - varied heights following fisheye curve
  const treeLineBase = generateCurvedHills(0, 20, 0.025, 4);
  
  // Draw individual tree silhouettes along the curve
  const numTrees = 40;
  for (let i = 0; i < numTrees; i++) {
    const x = (i / numTrees) * width + (Math.sin(i * 2.5) * 30);
    const baseY = fisheyeCurve(x) + 10;
    
    // Tree height varies
    const heightVariation = Math.sin(i * 1.7 + 5) * 0.5 + 0.5;
    const treeHeight = 40 + heightVariation * 70;
    const treeWidth = treeHeight * 0.4;
    
    const treeType = i % 3 === 0 ? 'pine' : 'deciduous';
    const treeColor = nightMode ? 'rgba(8, 5, 5, 0.95)' : 'rgba(8, 15, 10, 0.9)';
    
    if (treeType === 'pine') {
      drawPineTree(ctx, x, baseY, treeWidth, treeHeight, treeColor);
    } else {
      drawDeciduousTree(ctx, x, baseY, treeWidth, treeHeight, treeColor);
    }
  }
  
  // Layer 5: Foreground ground - completely black at bottom
  const foreground = generateCurvedHills(-10, 15, 0.03, 5);
  ctx.fillStyle = nightMode ? 'rgba(5, 2, 2, 1)' : 'rgba(5, 10, 5, 0.95)';
  ctx.beginPath();
  ctx.moveTo(0, height);
  foreground.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  
  // Restore context
  ctx.restore();
}
