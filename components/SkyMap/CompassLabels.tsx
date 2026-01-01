'use client';

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

function makeLabel(text: string) {
  const div = document.createElement('div');
  div.textContent = text;
  div.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
  div.style.fontSize = '12px';
  div.style.fontWeight = '700';
  div.style.color = 'rgba(255,255,255,0.9)';
  div.style.padding = '2px 6px';
  div.style.borderRadius = '6px';
  div.style.background = 'rgba(0,0,0,0.35)';
  div.style.border = '1px solid rgba(255,255,255,0.15)';
  div.style.pointerEvents = 'none';
  div.style.whiteSpace = 'nowrap';
  return new CSS2DObject(div);
}

export function CompassLabels({ radius = 1500 }: { radius?: number }) {
  const { gl, scene, camera, size } = useThree();

  const renderer = useMemo(() => {
    const r = new CSS2DRenderer();
    r.domElement.style.position = 'absolute';
    r.domElement.style.top = '0';
    r.domElement.style.left = '0';
    r.domElement.style.pointerEvents = 'none';
    r.domElement.style.zIndex = '5';
    return r;
  }, []);

  const labels = useMemo(() => {
    const group = new THREE.Group();

    const north = makeLabel('N');
    north.position.set(0, 0, -radius);

    const south = makeLabel('S');
    south.position.set(0, 0, radius);

    const east = makeLabel('E');
    east.position.set(radius, 0, 0);

    const west = makeLabel('W');
    west.position.set(-radius, 0, 0);

    group.add(north, south, east, west);
    return group;
  }, [radius]);

  useEffect(() => {
    renderer.setSize(size.width, size.height);

    const parent = gl.domElement.parentElement;
    if (parent) parent.appendChild(renderer.domElement);

    scene.add(labels);

    return () => {
      scene.remove(labels);
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, [renderer, size.width, size.height, gl.domElement, scene, labels]);

  useEffect(() => {
    renderer.setSize(size.width, size.height);
  }, [renderer, size.width, size.height]);

  useFrame(() => {
    renderer.render(scene, camera);
  });

  return null;
}
