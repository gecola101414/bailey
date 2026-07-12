/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ConfigType, CONFIGURATIONS, LauncherMetrics } from '../types';

interface Bailey3DViewerProps {
  configType: ConfigType;
  spanLength: number;
  useReinforcingChords: boolean;
  noseBaysCount: number;
  pushDistance: number;
  spigotCompensationCm: number;
  counterweightKg: number;
  metrics: LauncherMetrics;
  isTipped: boolean;
  isLanded: boolean;
  isLoadTesting: boolean;
  loadTestProgress: number;
  // New BIM and Assembly props
  activeMode: 'simulation' | 'assembly';
  assemblyStep: number; // 0 to 8 for the step-by-step assembly
  onHoverBimComponent: (info: { name: string; weight: string; material: string; role: string } | null) => void;
}

export const Bailey3DViewer: React.FC<Bailey3DViewerProps> = ({
  configType,
  spanLength,
  useReinforcingChords,
  noseBaysCount,
  pushDistance,
  spigotCompensationCm,
  counterweightKg,
  metrics,
  isTipped,
  isLanded,
  isLoadTesting,
  loadTestProgress,
  activeMode,
  assemblyStep,
  onHoverBimComponent,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const requestRef = useRef<number | null>(null);

  // Orbit camera state
  const cameraAngleTheta = useRef<number>(Math.PI / 4); // horizontal angle
  const cameraAnglePhi = useRef<number>(Math.PI / 3);   // vertical angle
  const cameraDistance = useRef<number>(30);
  const cameraTarget = useRef<THREE.Vector3>(new THREE.Vector3(12, 0, 0));
  const isDragging = useRef<boolean>(false);
  const previousMousePosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // References to groups for real-time manipulation
  const bridgeGroupRef = useRef<THREE.Group | null>(null);
  const mainBridgeGroupRef = useRef<THREE.Group | null>(null);
  const noseGroupRef = useRef<THREE.Group | null>(null);
  const vehicleRef = useRef<THREE.Group | null>(null);
  const waterRef = useRef<THREE.Mesh | null>(null);
  
  // Supports
  const rockingRollersGroupRef = useRef<THREE.Group | null>(null);
  const finalAbutmentsGroupRef = useRef<THREE.Group | null>(null);

  // Size of a single bay (3.05 meters)
  const BAY_LENGTH = 3.05;

  // Materials definition (PBR)
  const materialsRef = useRef<{
    steelOlive: THREE.MeshStandardMaterial;
    steelYellow: THREE.MeshStandardMaterial;
    steelRust: THREE.MeshStandardMaterial;
    steelDark: THREE.MeshStandardMaterial;
    woodChess: THREE.MeshStandardMaterial;
    water: THREE.MeshStandardMaterial;
    terrain: THREE.MeshStandardMaterial;
    terrainRock: THREE.MeshStandardMaterial;
    goldAccent: THREE.MeshStandardMaterial;
    cargoGreen: THREE.MeshStandardMaterial;
    tireBlack: THREE.MeshStandardMaterial;
    concrete: THREE.MeshStandardMaterial;
    ghostMaterial: THREE.MeshStandardMaterial;
  } | null>(null);

  // Raycasting for BIM inspection
  const raycaster = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouse = useRef<THREE.Vector2>(new THREE.Vector2());

  // Create materials helper
  const initMaterials = () => {
    materialsRef.current = {
      steelOlive: new THREE.MeshStandardMaterial({
        color: 0x3d4e33, // military olive green
        roughness: 0.35,
        metalness: 0.85,
        name: 'steelOlive'
      }),
      steelYellow: new THREE.MeshStandardMaterial({
        color: 0xd9a414, // warning yellow
        roughness: 0.4,
        metalness: 0.8,
        name: 'steelYellow'
      }),
      steelRust: new THREE.MeshStandardMaterial({
        color: 0x7a3d24,
        roughness: 0.75,
        metalness: 0.5,
        name: 'steelRust'
      }),
      steelDark: new THREE.MeshStandardMaterial({
        color: 0x222621,
        roughness: 0.3,
        metalness: 0.9,
        name: 'steelDark'
      }),
      woodChess: new THREE.MeshStandardMaterial({
        color: 0x826c55,
        roughness: 0.95,
        metalness: 0.05,
        name: 'woodChess'
      }),
      water: new THREE.MeshStandardMaterial({
        color: 0x1e3a8a,
        roughness: 0.1,
        metalness: 0.15,
        transparent: true,
        opacity: 0.8,
        name: 'water'
      }),
      terrain: new THREE.MeshStandardMaterial({
        color: 0x3b4c2b,
        roughness: 0.95,
        metalness: 0.05,
        flatShading: true,
        name: 'terrain'
      }),
      terrainRock: new THREE.MeshStandardMaterial({
        color: 0x52525b,
        roughness: 0.9,
        metalness: 0.1,
        flatShading: true,
        name: 'terrainRock'
      }),
      goldAccent: new THREE.MeshStandardMaterial({
        color: 0xeab308,
        roughness: 0.15,
        metalness: 0.95,
        name: 'goldAccent'
      }),
      cargoGreen: new THREE.MeshStandardMaterial({
        color: 0x1b2e15,
        roughness: 0.7,
        metalness: 0.2,
        name: 'cargoGreen'
      }),
      tireBlack: new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.9,
        metalness: 0.05,
        name: 'tireBlack'
      }),
      concrete: new THREE.MeshStandardMaterial({
        color: 0x71717a,
        roughness: 0.9,
        metalness: 0.1,
        name: 'concrete'
      }),
      ghostMaterial: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.5,
        metalness: 0.2,
        transparent: true,
        opacity: 0.35,
        wireframe: true,
        name: 'ghost'
      })
    };
  };

  // Build high-fidelity hollow steel truss panel
  const createTrussPanel = (isNose: boolean, isGhost: boolean = false) => {
    const truss = new THREE.Group();
    const material = isGhost 
      ? materialsRef.current!.ghostMaterial 
      : (isNose ? materialsRef.current!.steelYellow : materialsRef.current!.steelOlive);
    
    const jointMaterial = materialsRef.current!.steelDark;
    const rivetMaterial = materialsRef.current!.steelRust;

    const length = BAY_LENGTH;
    const height = 1.45;

    // Chords (Correnti superiore e inferiore) - Realized as double back-to-back channels
    const chordHeight = 0.08;
    const chordThickness = 0.024;
    const chordSpacing = 0.022; // half-spacing from center

    const chordGeo = new THREE.BoxGeometry(length, chordHeight, chordThickness);

    // Top Chord (Double parallel box rails)
    const topChordF = new THREE.Mesh(chordGeo, material);
    topChordF.position.set(0, height / 2, chordSpacing);
    topChordF.castShadow = !isGhost;
    topChordF.receiveShadow = !isGhost;
    topChordF.userData = { bim: { name: 'Corrente Superiore (Esterno)', weight: '47 kg', material: 'Acciaio S355', role: 'Resistenza a trazione/compressione superiore (profilo a U)' } };
    truss.add(topChordF);

    const topChordB = new THREE.Mesh(chordGeo, material);
    topChordB.position.set(0, height / 2, -chordSpacing);
    topChordB.castShadow = !isGhost;
    topChordB.receiveShadow = !isGhost;
    topChordB.userData = { bim: { name: 'Corrente Superiore (Interno)', weight: '47 kg', material: 'Acciaio S355', role: 'Resistenza a trazione/compressione superiore (profilo a U)' } };
    truss.add(topChordB);

    // Bottom Chord (Double parallel box rails)
    const bottomChordF = new THREE.Mesh(chordGeo, material);
    bottomChordF.position.set(0, -height / 2, chordSpacing);
    bottomChordF.castShadow = !isGhost;
    bottomChordF.receiveShadow = !isGhost;
    bottomChordF.userData = { bim: { name: 'Corrente Inferiore (Esterno)', weight: '47 kg', material: 'Acciaio S355', role: 'Resistenza a trazione inferiore (profilo a U)' } };
    truss.add(bottomChordF);

    const bottomChordB = new THREE.Mesh(chordGeo, material);
    bottomChordB.position.set(0, -height / 2, -chordSpacing);
    bottomChordB.castShadow = !isGhost;
    bottomChordB.receiveShadow = !isGhost;
    bottomChordB.userData = { bim: { name: 'Corrente Inferiore (Interno)', weight: '47 kg', material: 'Acciaio S355', role: 'Resistenza a trazione inferiore (profilo a U)' } };
    truss.add(bottomChordB);

    // Vertical columns (fitted inside the gap of the channels)
    const vertCount = 5;
    const vertWidth = 0.055;
    const vertDepth = 0.034;
    const vertHeight = height - chordHeight;
    const vertGeo = new THREE.BoxGeometry(vertWidth, vertHeight, vertDepth);

    for (let i = 0; i < vertCount; i++) {
      const vert = new THREE.Mesh(vertGeo, material);
      const xPos = -length / 2 + (i * length) / (vertCount - 1);
      vert.position.set(xPos, 0, 0);
      vert.castShadow = !isGhost;
      vert.userData = { bim: { name: `Montante Verticale ${i+1}`, weight: '12 kg', material: 'Acciaio S355', role: 'Irrigidimento d\'anima e trasferimento carichi verticali' } };
      truss.add(vert);

      // Gusset plates (Fazzoletti di giunzione) on both sides of each joint
      if (!isGhost) {
        const gussetGeo = new THREE.BoxGeometry(0.12, 0.14, 0.008);
        const rivetGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.024, 8);
        rivetGeo.rotateX(Math.PI / 2);

        // Top joint gussets
        const gussetTF = new THREE.Mesh(gussetGeo, material);
        gussetTF.position.set(xPos, height / 2 - 0.04, chordSpacing + chordThickness / 2 + 0.004);
        truss.add(gussetTF);

        const gussetTB = new THREE.Mesh(gussetGeo, material);
        gussetTB.position.set(xPos, height / 2 - 0.04, -(chordSpacing + chordThickness / 2 + 0.004));
        truss.add(gussetTB);

        // Bottom joint gussets
        const gussetBF = new THREE.Mesh(gussetGeo, material);
        gussetBF.position.set(xPos, -height / 2 + 0.04, chordSpacing + chordThickness / 2 + 0.004);
        truss.add(gussetBF);

        const gussetBB = new THREE.Mesh(gussetGeo, material);
        gussetBB.position.set(xPos, -height / 2 + 0.04, -(chordSpacing + chordThickness / 2 + 0.004));
        truss.add(gussetBB);

        // Rivets/Bolts on gussets
        [-0.03, 0.03].forEach((rx) => {
          // Top rivets
          const rTF = new THREE.Mesh(rivetGeo, rivetMaterial);
          rTF.position.set(xPos + rx, height / 2 - 0.04, chordSpacing + chordThickness / 2 + 0.008);
          truss.add(rTF);

          // Bottom rivets
          const rBF = new THREE.Mesh(rivetGeo, rivetMaterial);
          rBF.position.set(xPos + rx, -height / 2 + 0.04, chordSpacing + chordThickness / 2 + 0.008);
          truss.add(rBF);
        });
      }
    }

    // Diagonals (fitted inside the central gap)
    const diagCount = vertCount - 1;
    const diagWidth = 0.045;
    const diagDepth = 0.026;

    for (let i = 0; i < diagCount; i++) {
      const xStart = -length / 2 + (i * length) / diagCount;
      const xEnd = -length / 2 + ((i + 1) * length) / diagCount;
      const dx = xEnd - xStart;
      const dy = height - chordHeight;
      const diagLen = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      const diagonalGeo = new THREE.BoxGeometry(diagWidth, diagLen - 0.06, diagDepth);

      const diag1 = new THREE.Mesh(diagonalGeo, material);
      diag1.position.set((xStart + xEnd) / 2, 0, 0);
      diag1.rotation.z = angle - Math.PI / 2; // adjust box rotation to match angle
      diag1.castShadow = !isGhost;
      diag1.userData = { bim: { name: 'Diagonale di Rinforzo', weight: '18 kg', material: 'Acciaio S355', role: 'Resistenza a sforzo di taglio d\'anima' } };
      truss.add(diag1);

      const diag2 = new THREE.Mesh(diagonalGeo, material);
      diag2.position.set((xStart + xEnd) / 2, 0, 0);
      diag2.rotation.z = -angle + Math.PI / 2; // adjust box rotation to match angle
      diag2.castShadow = !isGhost;
      diag2.userData = { bim: { name: 'Controvento Interno', weight: '18 kg', material: 'Acciaio S355', role: 'Resistenza a sforzo di taglio d\'anima' } };
      truss.add(diag2);
    }

    // Real-looking connector hubs with holes
    const hubGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.1, 12);
    hubGeo.rotateX(Math.PI / 2);

    const hubs = [
      { x: -length / 2, y: height / 2, name: 'Tazza Superiore SX' },
      { x: length / 2, y: height / 2, name: 'Tazza Superiore DX' },
      { x: -length / 2, y: -height / 2, name: 'Tazza Inferiore SX' },
      { x: length / 2, y: -height / 2, name: 'Tazza Inferiore DX' }
    ];

    hubs.forEach((h) => {
      const hub = new THREE.Mesh(hubGeo, jointMaterial);
      hub.position.set(h.x, h.y, 0);
      hub.userData = { bim: { name: h.name, weight: '4.5 kg', material: 'Acciaio speciale stampato', role: 'Sede dei perni conici di unione' } };
      truss.add(hub);

      // Pins visual indicator
      if (!isGhost) {
        const pinGeo = new THREE.CylinderGeometry(0.024, 0.02, 0.14, 8);
        pinGeo.rotateX(Math.PI / 2);
        const pin = new THREE.Mesh(pinGeo, materialsRef.current!.steelRust);
        pin.position.set(h.x, h.y, 0);
        pin.userData = { bim: { name: 'Perno di Giunzione (Panel Pin)', weight: '3.5 kg', material: 'Acciaio al Ni-Cr bonificato', role: 'Incastro di trazione strutturale tra campate' } };
        truss.add(pin);
      }
    });

    return truss;
  };

  // Build a single 3.05m bay with sub-components for selective rendering
  const createBay = (isNose: boolean, isGhost: boolean = false, stepFilter: number = 9) => {
    const bay = new THREE.Group();
    const config = CONFIGURATIONS[configType];
    const roadwayWidth = 3.6;

    // Standard side offsets for trusses
    const sideOffsets: number[] = [];
    if (config.panelsPerSide === 1) {
      sideOffsets.push(0);
    } else if (config.panelsPerSide === 2) {
      sideOffsets.push(-0.15, 0.15);
    } else {
      sideOffsets.push(-0.3, 0, 0.3);
    }

    const panelsZOffsets = isNose ? [0] : sideOffsets;
    const activeStoreys = isNose ? 1 : config.storeys;

    // STEP 1: Posa Pannelli Sinistra
    if (stepFilter >= 1) {
      const leftTrussGroup = new THREE.Group();
      leftTrussGroup.position.z = -roadwayWidth / 2;
      panelsZOffsets.forEach((zOff) => {
        for (let s = 0; s < activeStoreys; s++) {
          const truss = createTrussPanel(isNose, isGhost);
          truss.position.set(0, s * 1.45 + 0.725, zOff);
          leftTrussGroup.add(truss);
        }
      });
      bay.add(leftTrussGroup);
    }

    // STEP 2: Posa Pannelli Destra
    if (stepFilter >= 2) {
      const rightTrussGroup = new THREE.Group();
      rightTrussGroup.position.z = roadwayWidth / 2;
      panelsZOffsets.forEach((zOff) => {
        for (let s = 0; s < activeStoreys; s++) {
          const truss = createTrussPanel(isNose, isGhost);
          truss.position.set(0, s * 1.45 + 0.725, zOff);
          rightTrussGroup.add(truss);
        }
      });
      bay.add(rightTrussGroup);
    }

    // STEP 3: Traverse di Collegamento (Transoms)
    if (stepFilter >= 3) {
      const transomCount = isNose ? 2 : 3;
      const transomGeo = new THREE.BoxGeometry(0.12, 0.24, roadwayWidth + 0.8);
      for (let t = 0; t < transomCount; t++) {
        const xPos = -BAY_LENGTH / 2 + (t * BAY_LENGTH) / (transomCount - 1);
        const transom = new THREE.Mesh(transomGeo, materialsRef.current!.steelOlive);
        transom.position.set(xPos, 0, 0);
        transom.castShadow = !isGhost;
        transom.userData = { bim: { name: `Traversa IPE ${t+1}`, weight: '200 kg', material: 'Acciaio Zincato S355', role: 'Supporto di carico trasversale e ancoraggio longheroni' } };
        bay.add(transom);
      }
    }

    // STEP 4: Longheroni di Scorrimento (Stringers)
    if (stepFilter >= 4 && !isNose) {
      const stringerGeo = new THREE.BoxGeometry(BAY_LENGTH, 0.12, 0.08);
      const stringerZPositions = [-roadwayWidth / 3, 0, roadwayWidth / 3];
      stringerZPositions.forEach((zPos, idx) => {
        const stringer = new THREE.Mesh(stringerGeo, materialsRef.current!.steelDark);
        stringer.position.set(0, 0.12, zPos);
        stringer.castShadow = !isGhost;
        stringer.userData = { bim: { name: `Longherone Longitudinale ${idx+1}`, weight: '110 kg', material: 'Acciaio S275', role: 'Trasferimento carichi ruote distribuiti alle traverse' } };
        bay.add(stringer);
      });
    }

    // STEP 5: Corteggio in Legno (Chesses)
    if (stepFilter >= 5 && !isNose) {
      const chessCount = 14;
      const chessWidth = BAY_LENGTH / chessCount;
      const chessGeo = new THREE.BoxGeometry(chessWidth - 0.02, 0.05, roadwayWidth - 0.1);
      for (let c = 0; c < chessCount; c++) {
        const xPos = -BAY_LENGTH / 2 + (c * chessWidth) + chessWidth / 2;
        const chess = new THREE.Mesh(chessGeo, materialsRef.current!.woodChess);
        chess.position.set(xPos, 0.18, 0);
        chess.castShadow = !isGhost;
        chess.userData = { bim: { name: `Tavola di Corteggio ${c+1}`, weight: '22 kg', material: 'Legno Trattato Impermeabile', role: 'Impalcato stradale e aderenza veicoli' } };
        bay.add(chess);
      }
    }

    // STEP 6: Telai di Controvento Diagonali (Diagonal Bracing)
    if (stepFilter >= 6 && !isNose) {
      const braceGeo = new THREE.BoxGeometry(0.04, 0.04, roadwayWidth - 0.2);
      
      const brace1 = new THREE.Mesh(braceGeo, materialsRef.current!.steelDark);
      brace1.position.set(0, 0.03, 0);
      brace1.rotation.y = Math.PI / 6;
      brace1.userData = { bim: { name: 'Controvento Diagonale A', weight: '30 kg', material: 'Acciaio S275', role: 'Rigidità torsionale piana contro sbandamento' } };
      bay.add(brace1);

      const brace2 = new THREE.Mesh(braceGeo, materialsRef.current!.steelDark);
      brace2.position.set(0, 0.03, 0);
      brace2.rotation.y = -Math.PI / 6;
      brace2.userData = { bim: { name: 'Controvento Diagonale B', weight: '30 kg', material: 'Acciaio S275', role: 'Rigidità torsionale piana contro sbandamento' } };
      bay.add(brace2);
    }

    // STEP 7: Cordoli Pararuote e Tiranti di vento (Sway braces & Curbs)
    if (stepFilter >= 7 && !isNose) {
      const curbGeo = new THREE.BoxGeometry(BAY_LENGTH, 0.08, 0.15);
      const curbL = new THREE.Mesh(curbGeo, materialsRef.current!.woodChess);
      curbL.position.set(0, 0.23, -roadwayWidth / 2 + 0.15);
      curbL.userData = { bim: { name: 'Cordolo Pararuote Sinistro', weight: '45 kg', material: 'Legno duro sagomato', role: 'Guida fisica per i pneumatici dei veicoli militari' } };
      bay.add(curbL);

      const curbR = new THREE.Mesh(curbGeo, materialsRef.current!.woodChess);
      curbR.position.set(0, 0.23, roadwayWidth / 2 - 0.15);
      curbR.userData = { bim: { name: 'Cordolo Pararuote Destro', weight: '45 kg', material: 'Legno duro sagomato', role: 'Guida fisica per i pneumatici dei veicoli militari' } };
      bay.add(curbR);
    }

    return bay;
  };

  // Rebuild whole scenario
  const buildScenario = (scene: THREE.Scene) => {
    // 1. Concrete foundations/abutments (spalle in calcestruzzo)
    const leftAbutment = new THREE.Mesh(
      new THREE.BoxGeometry(4, 5, 8),
      materialsRef.current!.concrete
    );
    leftAbutment.position.set(-2, -2.5, 0);
    leftAbutment.receiveShadow = true;
    leftAbutment.castShadow = true;
    leftAbutment.userData = { bim: { name: 'Spalla di Varo Est', weight: '78000 kg', material: 'Calcestruzzo Armato C30/37', role: 'Appoggio fisso a terra della struttura del ponte' } };
    scene.add(leftAbutment);

    const rightAbutment = new THREE.Mesh(
      new THREE.BoxGeometry(4, 5, 8),
      materialsRef.current!.concrete
    );
    rightAbutment.position.set(spanLength + 2, -2.5, 0);
    rightAbutment.receiveShadow = true;
    rightAbutment.castShadow = true;
    rightAbutment.userData = { bim: { name: 'Spalla di Ricezione Ovest', weight: '78000 kg', material: 'Calcestruzzo Armato C30/37', role: 'Appoggio di scivolamento e bloccaggio finale' } };
    scene.add(rightAbutment);

    // Natural landscape gorge
    const leftGorge = new THREE.Mesh(
      new THREE.BoxGeometry(30, 20, 20),
      materialsRef.current!.terrain
    );
    leftGorge.position.set(-19, -10, 0);
    leftGorge.receiveShadow = true;
    scene.add(leftGorge);

    const rightGorge = new THREE.Mesh(
      new THREE.BoxGeometry(30, 20, 20),
      materialsRef.current!.terrain
    );
    rightGorge.position.set(spanLength + 19, -10, 0);
    rightGorge.receiveShadow = true;
    scene.add(rightGorge);

    // River bed
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 30),
      materialsRef.current!.terrainRock
    );
    bed.rotateX(-Math.PI / 2);
    bed.position.set(spanLength / 2, -15, 0);
    bed.receiveShadow = true;
    scene.add(bed);

    // Dynamic water plane
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(spanLength + 40, 0.5, 18),
      materialsRef.current!.water
    );
    water.position.set(spanLength / 2, -7, 0);
    scene.add(water);
    waterRef.current = water;

    // Rollers and Jacks placement (Tutti gli appoggi completi!)
    const rGroup = new THREE.Group();
    rockingRollersGroupRef.current = rGroup;
    scene.add(rGroup);

    // Abutment Jack-Down seats (Cavalletti d'appoggio definitivi)
    const aGroup = new THREE.Group();
    finalAbutmentsGroupRef.current = aGroup;
    scene.add(aGroup);

    // Placing Rulli Basculanti (Rocking Rollers)
    const rrLeft = createRollerModel(true);
    rrLeft.position.set(0, 0.25, 0);
    rGroup.add(rrLeft);

    const rrRight = createRollerModel(true);
    rrRight.position.set(spanLength, 0.25, 0);
    rGroup.add(rrRight);

    // Ground assembly plain rollers behind the launch
    for (let i = 1; i <= 3; i++) {
      const pr = createRollerModel(false);
      pr.position.set(-i * 5.5, 0.15, 0);
      rGroup.add(pr);
    }

    // Placing Final Abutment plates and Bearings (Piastre d'appoggio per messa in opera finale)
    const basePlateGeo = new THREE.BoxGeometry(0.6, 0.15, 4.0);
    const bpLeft = new THREE.Mesh(basePlateGeo, materialsRef.current!.steelRust);
    bpLeft.position.set(-0.5, 0.075, 0);
    bpLeft.userData = { bim: { name: 'Piastra d\'Appoggio Est', weight: '210 kg', material: 'Ghisa Fusa', role: 'Supporto statico d\'appoggio finale a sbalzo rimosso' } };
    aGroup.add(bpLeft);

    const bpRight = new THREE.Mesh(basePlateGeo, materialsRef.current!.steelRust);
    bpRight.position.set(spanLength + 0.5, 0.075, 0);
    bpRight.userData = { bim: { name: 'Piastra d\'Appoggio Ovest', weight: '210 kg', material: 'Ghisa Fusa', role: 'Supporto statico d\'appoggio finale a sbalzo rimosso' } };
    aGroup.add(bpRight);
  };

  const createRollerModel = (isRocking: boolean) => {
    const roller = new THREE.Group();
    const frame = materialsRef.current!.steelDark;
    const cyl = materialsRef.current!.steelRust;

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 4.2), frame);
    base.castShadow = true;
    base.receiveShadow = true;
    roller.add(base);

    if (isRocking) {
      // Rocking frame with double cylinders
      [-1.7, 1.7].forEach((z) => {
        const sideFrame = new THREE.Group();
        sideFrame.position.set(0, 0.1, z);

        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.25, 8), frame);
        hub.rotateX(Math.PI / 2);
        sideFrame.add(hub);

        const rockBeam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.15), frame);
        rockBeam.position.y = 0.08;
        sideFrame.add(rockBeam);

        const r1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 12), cyl);
        r1.rotateX(Math.PI / 2);
        r1.position.set(-0.2, 0.18, 0);
        r1.castShadow = true;
        r1.userData = { bim: { name: 'Rullo Oscillante Frontale', weight: '35 kg', material: 'Acciaio temprato', role: 'Distribuzione del carico d\'avanzamento' } };
        sideFrame.add(r1);

        const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 12), cyl);
        r2.rotateX(Math.PI / 2);
        r2.position.set(0.2, 0.18, 0);
        r2.castShadow = true;
        r2.userData = { bim: { name: 'Rullo Oscillante Posteriore', weight: '35 kg', material: 'Acciaio temprato', role: 'Distribuzione del carico d\'avanzamento' } };
        sideFrame.add(r2);

        roller.add(sideFrame);
      });
    } else {
      // Static plain roller
      [-1.7, 1.7].forEach((z) => {
        const support = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.2), frame);
        support.position.set(0, 0.1, z);
        roller.add(support);

        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 12), cyl);
        r.rotateX(Math.PI / 2);
        r.position.set(0, 0.22, z);
        r.castShadow = true;
        r.userData = { bim: { name: 'Rullo di Scorrimento', weight: '40 kg', material: 'Acciaio Zincato', role: 'Appoggio rampa d\'assemblaggio a terra' } };
        roller.add(r);
      });
    }

    return roller;
  };

  // Rebuild the dynamic bridge based on whether we are in Varo or Montaggio
  const rebuildBridgeModel = (scene: THREE.Scene) => {
    if (bridgeGroupRef.current) {
      scene.remove(bridgeGroupRef.current);
    }

    const bridgeGroup = new THREE.Group();
    bridgeGroupRef.current = bridgeGroup;
    scene.add(bridgeGroup);

    const mainBridgeGroup = new THREE.Group();
    mainBridgeGroupRef.current = mainBridgeGroup;
    bridgeGroup.add(mainBridgeGroup);

    const noseGroup = new THREE.Group();
    noseGroupRef.current = noseGroup;
    bridgeGroup.add(noseGroup);

    const totalBaysNeeded = Math.ceil(spanLength / BAY_LENGTH) + 2;

    if (activeMode === 'simulation') {
      // FULL BRIDGE FOR LAUNCH SIMULATION
      for (let i = 0; i < totalBaysNeeded; i++) {
        const bay = createBay(false, false, 9);
        bay.position.x = i * BAY_LENGTH + BAY_LENGTH / 2;
        mainBridgeGroup.add(bay);
      }

      for (let i = 0; i < noseBaysCount; i++) {
        const bay = createBay(true, false, 9);
        bay.position.x = (totalBaysNeeded * BAY_LENGTH) + i * BAY_LENGTH + BAY_LENGTH / 2;
        noseGroup.add(bay);
      }
    } else {
      // INTERACTIVE ASSEMBLY / BIM STEPPED MODE
      // Let's render the first 2 bays completed, and the 3rd bay dynamically reveals parts depending on `assemblyStep`!
      for (let i = 0; i < 2; i++) {
        const bay = createBay(false, false, 9); // completely assembled
        bay.position.x = i * BAY_LENGTH + BAY_LENGTH / 2;
        mainBridgeGroup.add(bay);
      }

      // 3rd Bay represents the "active BIM assembly step"
      const activeBay = createBay(false, false, assemblyStep);
      activeBay.position.x = 2 * BAY_LENGTH + BAY_LENGTH / 2;
      mainBridgeGroup.add(activeBay);

      // Render remaining bays as transparent blue "ghost/guide structures" to show where they will go (BIM look!)
      for (let i = 3; i < totalBaysNeeded; i++) {
        const ghostBay = createBay(false, true, 9);
        ghostBay.position.x = i * BAY_LENGTH + BAY_LENGTH / 2;
        mainBridgeGroup.add(ghostBay);
      }
    }

    // Counterweight visualizer
    if (counterweightKg > 0 && activeMode === 'simulation') {
      const weightGroup = new THREE.Group();
      weightGroup.position.set(0.6, 0.4, 0);
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 2.4), materialsRef.current!.steelRust);
      box.castShadow = true;
      weightGroup.add(box);

      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 2.5), materialsRef.current!.goldAccent);
      weightGroup.add(strap);
      
      mainBridgeGroup.add(weightGroup);
    }

    updateBridgeTransform();
  };

  // Update real-time coordinates, deflection sag and tipping rotation
  const updateBridgeTransform = () => {
    const bridgeGroup = bridgeGroupRef.current;
    if (!bridgeGroup) return;

    const totalBaysNeeded = Math.ceil(spanLength / BAY_LENGTH) + 2;
    const L_bridge = totalBaysNeeded * BAY_LENGTH;
    const L_nose = noseBaysCount * BAY_LENGTH;
    const L_total = L_bridge + L_nose;

    // Reset default transformation
    bridgeGroup.rotation.set(0, 0, 0);

    if (activeMode === 'simulation') {
      // Standard push translation
      const targetX = pushDistance - L_total;
      bridgeGroup.position.x = targetX;
      
      // If we are landed, we simulate the "Jack Down" (Messa in opera). 
      // The bridge drops slightly below the roller level onto the base plates!
      if (isLanded) {
        bridgeGroup.position.y = -0.15; // landed on concrete seats
      } else {
        bridgeGroup.position.y = 0; // on rollers
      }

      // Tipping / Collapse trigger
      if (isTipped) {
        const tipAngle = -Math.PI / 4;
        bridgeGroup.position.set(0, 0.1, 0);
        bridgeGroup.rotation.z = tipAngle;
        bridgeGroup.position.x = targetX * Math.cos(tipAngle);
        bridgeGroup.position.y = targetX * Math.sin(tipAngle) - 0.4;
      }

      // Apply physical bending sag to components overhang
      const activeOverhang = Math.max(0, pushDistance);
      const isBridging = pushDistance < spanLength;
      const currentSagM = isBridging ? (metrics.sagCm / 100) : 0;

      const applyDeflection = (group: THREE.Group, isNoseGroup: boolean) => {
        group.children.forEach((child) => {
          const localX = child.position.x;
          const worldX = targetX + localX;

          if (worldX > 0 && activeOverhang > 0) {
            const ratio = Math.min(1.0, worldX / activeOverhang);
            const sagAtX = -currentSagM * Math.pow(ratio, 2);

            let compensationAtX = 0;
            if (isNoseGroup && spigotCompensationCm > 0) {
              const jointWorldX = targetX + L_bridge;
              const distInNose = worldX - jointWorldX;
              if (distInNose > 0) {
                compensationAtX = (spigotCompensationCm / 100) * (distInNose / L_nose);
              }
            }

            child.position.y = sagAtX + compensationAtX;
            const slope = -2 * currentSagM * (worldX / Math.pow(activeOverhang, 2)) +
                          (isNoseGroup ? (spigotCompensationCm / 100) / L_nose : 0);
            child.rotation.z = Math.atan(slope);
          } else {
            child.position.y = 0;
            child.rotation.z = 0;
          }
        });
      };

      if (mainBridgeGroupRef.current) applyDeflection(mainBridgeGroupRef.current, false);
      if (noseGroupRef.current) applyDeflection(noseGroupRef.current, true);
    } else {
      // ASSEMBLY MODE: Static preview positioned comfortably on the left launching bank
      // Center the active 3rd bay at x = 0 for perfect inspection focus
      bridgeGroup.position.set(-2 * BAY_LENGTH, 0, 0);
      bridgeGroup.position.y = 0.2;
    }
  };

  // Build military testing truck
  const createVehicleModel = (scene: THREE.Scene) => {
    if (vehicleRef.current) {
      scene.remove(vehicleRef.current);
    }

    const vehicle = new THREE.Group();
    vehicleRef.current = vehicle;
    scene.add(vehicle);

    const matBody = materialsRef.current!.cargoGreen;
    const matTire = materialsRef.current!.tireBlack;
    const matDetails = materialsRef.current!.steelDark;

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 2.1), matDetails);
    chassis.position.y = 0.55;
    chassis.castShadow = true;
    vehicle.add(chassis);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 2.0), matBody);
    cab.position.set(1.5, 1.25, 0);
    cab.castShadow = true;
    vehicle.add(cab);

    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.3, 2.0), matBody);
    bed.position.set(-0.8, 1.15, 0);
    bed.castShadow = true;
    vehicle.add(bed);

    // 6 realistic tires
    const wGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.4, 16);
    wGeo.rotateX(Math.PI / 2);

    const wPos = [
      { x: 1.4, z: -1.05 }, { x: 1.4, z: 1.05 },
      { x: -0.6, z: -1.05 }, { x: -0.6, z: 1.05 },
      { x: -1.6, z: -1.05 }, { x: -1.6, z: 1.05 }
    ];

    wPos.forEach((p) => {
      const tire = new THREE.Mesh(wGeo, matTire);
      tire.position.set(p.x, 0.44, p.z);
      tire.castShadow = true;
      vehicle.add(tire);
    });

    vehicle.position.set(-25, 0.25, 0);
    vehicle.visible = false;
  };

  // Mouse move callback to cast rays and find BIM attributes
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return;
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.current.setFromCamera(mouse.current, cameraRef.current);
    
    // Intersect descendants of our bridge
    if (bridgeGroupRef.current) {
      const intersects = raycaster.current.intersectObjects(bridgeGroupRef.current.children, true);
      
      if (intersects.length > 0) {
        let currentObj: THREE.Object3D | null = intersects[0].object;
        
        // Crawl up until we find object with user BIM data
        while (currentObj && !currentObj.userData.bim) {
          currentObj = currentObj.parent;
        }

        if (currentObj && currentObj.userData.bim) {
          onHoverBimComponent(currentObj.userData.bim);
          return;
        }
      }
    }
    
    // Also check rollers
    if (rockingRollersGroupRef.current) {
      const intersects = raycaster.current.intersectObjects(rockingRollersGroupRef.current.children, true);
      if (intersects.length > 0) {
        let currentObj: THREE.Object3D | null = intersects[0].object;
        while (currentObj && !currentObj.userData.bim) {
          currentObj = currentObj.parent;
        }
        if (currentObj && currentObj.userData.bim) {
          onHoverBimComponent(currentObj.userData.bim);
          return;
        }
      }
    }

    onHoverBimComponent(null);
  };

  // Orbit camera dragging control handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    previousMousePosition.current = {
      x: e.clientX,
      y: e.clientY
    };
  };

  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !cameraRef.current) return;

    const deltaX = e.clientX - previousMousePosition.current.x;
    const deltaY = e.clientY - previousMousePosition.current.y;

    previousMousePosition.current = {
      x: e.clientX,
      y: e.clientY
    };

    // Update angles
    cameraAngleTheta.current -= deltaX * 0.007; // speed factor
    cameraAnglePhi.current = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, cameraAnglePhi.current - deltaY * 0.007));

    updateCameraPosition();
  };

  const handleGlobalMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: WheelEvent) => {
    cameraDistance.current = Math.max(5, Math.min(80, cameraDistance.current + e.deltaY * 0.04));
    updateCameraPosition();
  };

  const updateCameraPosition = () => {
    if (!cameraRef.current) return;

    const theta = cameraAngleTheta.current;
    const phi = cameraAnglePhi.current;
    const d = cameraDistance.current;
    const target = cameraTarget.current;

    cameraRef.current.position.x = target.x + d * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.position.z = target.z + d * Math.sin(phi) * Math.sin(theta);
    cameraRef.current.position.y = target.y + d * Math.cos(phi);

    cameraRef.current.lookAt(target);
  };

  // Attach global mouse listeners for fluid dragging
  useEffect(() => {
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: true });
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

  // Primary init effect
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // dark theme background for BIM look
    scene.fog = new THREE.FogExp2(0x0f172a, 0.015);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    initMaterials();

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(-10, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 150;
    const bounds = 40;
    sun.shadow.camera.left = -bounds;
    sun.shadow.camera.right = bounds * 1.5;
    sun.shadow.camera.top = bounds;
    sun.shadow.camera.bottom = -bounds;
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    const blueLight = new THREE.DirectionalLight(0x0284c7, 0.4); // soft futuristic blue accent
    blueLight.position.set(20, -10, -20);
    scene.add(blueLight);

    buildScenario(scene);
    rebuildBridgeModel(scene);
    createVehicleModel(scene);

    // Initial camera placement
    cameraTarget.current.set(spanLength / 2, 0, 0);
    updateCameraPosition();

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (rendererRef.current && cameraRef.current) {
        rendererRef.current.setSize(width, height);
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
      }
    });
    resizeObserver.observe(container);

    // Animation Loop
    let lastTime = 0;
    const animate = (time: number) => {
      lastTime = time;
      requestRef.current = requestAnimationFrame(animate);

      // Waves
      if (waterRef.current) {
        waterRef.current.position.y = -7.0 + Math.sin(time * 0.001) * 0.06;
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      resizeObserver.disconnect();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (rendererRef.current && rendererRef.current.domElement) {
        container.removeChild(rendererRef.current.domElement);
      }
      if (materialsRef.current) {
        Object.values(materialsRef.current).forEach((m: any) => {
          if (m && typeof m.dispose === 'function') {
            m.dispose();
          }
        });
      }
    };
  }, []);

  // Update scenario and models on structural props change
  useEffect(() => {
    if (!sceneRef.current) return;
    
    // Clear old elements
    const toRemove: THREE.Object3D[] = [];
    sceneRef.current.children.forEach((child) => {
      if (child !== bridgeGroupRef.current && child !== vehicleRef.current && !child.isLight) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((child) => sceneRef.current!.remove(child));

    buildScenario(sceneRef.current);
    rebuildBridgeModel(sceneRef.current);

    // Re-focus target based on active mode
    if (activeMode === 'simulation') {
      cameraTarget.current.set(spanLength / 2, 0, 0);
    } else {
      cameraTarget.current.set(7.5, 1.0, 0); // Focus on active 3rd bay assembly zone
    }
    updateCameraPosition();
  }, [spanLength, configType, useReinforcingChords, noseBaysCount, counterweightKg, activeMode, assemblyStep]);

  // Push translation trigger updates
  useEffect(() => {
    updateBridgeTransform();

    // Slowly follow truck or nose tip in simulation
    if (activeMode === 'simulation' && !isTipped) {
      const focusX = Math.min(spanLength, Math.max(0, pushDistance));
      cameraTarget.current.set(focusX, 0, 0);
      updateCameraPosition();
    }
  }, [pushDistance, metrics.sagCm, isTipped, spigotCompensationCm, activeMode]);

  // Vehicle truck animation for collaudo (Load testing)
  useEffect(() => {
    const vehicle = vehicleRef.current;
    if (!vehicle) return;

    if (isLoadTesting && isLanded && !isTipped && activeMode === 'simulation') {
      vehicle.visible = true;

      const totalBaysNeeded = Math.ceil(spanLength / BAY_LENGTH) + 2;
      const L_bridge = totalBaysNeeded * BAY_LENGTH;
      const L_nose = noseBaysCount * BAY_LENGTH;
      const L_total = L_bridge + L_nose;

      const bridgeTailX = pushDistance - L_total;
      const vehicleX = bridgeTailX + loadTestProgress * L_bridge;
      
      vehicle.position.set(vehicleX, 0.44, 0);

      // Rotate wheels
      // Find meshes with tire black material
      vehicle.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.material.name === 'tireBlack') {
          child.rotation.x = -vehicleX * 2.3;
        }
      });

      // Camera tracking truck
      cameraTarget.current.set(vehicleX, 1, 0);
      updateCameraPosition();
    } else {
      vehicle.visible = false;
    }
  }, [isLoadTesting, loadTestProgress, isLanded, isTipped, spanLength, activeMode]);

  const changeAnglePreset = (preset: 'side' | 'top' | 'isometric' | 'inspect') => {
    const mid = activeMode === 'simulation' ? spanLength / 2 : 7.5;
    cameraTarget.current.set(mid, activeMode === 'simulation' ? 0 : 1, 0);

    switch (preset) {
      case 'side':
        cameraAngleTheta.current = Math.PI / 2;
        cameraAnglePhi.current = Math.PI / 2 - 0.05;
        cameraDistance.current = activeMode === 'simulation' ? spanLength * 0.8 : 12;
        break;
      case 'top':
        cameraAngleTheta.current = Math.PI / 2;
        cameraAnglePhi.current = 0.01;
        cameraDistance.current = activeMode === 'simulation' ? spanLength * 1.1 : 15;
        break;
      case 'inspect':
        cameraAngleTheta.current = Math.PI / 3;
        cameraAnglePhi.current = Math.PI / 4;
        cameraDistance.current = 7;
        break;
      case 'isometric':
      default:
        cameraAngleTheta.current = Math.PI / 4;
        cameraAnglePhi.current = Math.PI / 3;
        cameraDistance.current = activeMode === 'simulation' ? spanLength * 1.0 : 15;
        break;
    }
    updateCameraPosition();
  };

  return (
    <div className="relative w-full h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Interaction Surface */}
      <div 
        ref={containerRef} 
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        className="w-full h-full cursor-grab active:cursor-grabbing" 
        id="canvas-container" 
      />

      {/* Dynamic Preset Camera Control HUD */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 bg-slate-900/90 backdrop-blur-md p-3 rounded-lg border border-slate-800 shadow-lg">
        <span className="text-[10px] font-mono font-bold text-slate-400 tracking-wider">NAVIGAZIONE 3D BIM</span>
        
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => changeAnglePreset('isometric')}
            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1.5 rounded font-mono border border-slate-700 transition"
          >
            Assonometria
          </button>
          <button
            onClick={() => changeAnglePreset('side')}
            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1.5 rounded font-mono border border-slate-700 transition"
          >
            Prospetto Lat.
          </button>
          <button
            onClick={() => changeAnglePreset('top')}
            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1.5 rounded font-mono border border-slate-700 transition"
          >
            Planimetria
          </button>
          <button
            onClick={() => changeAnglePreset('inspect')}
            className="text-[11px] bg-sky-950/60 hover:bg-sky-900 border border-sky-800 text-sky-200 px-2 py-1.5 rounded font-mono transition"
          >
            Zoom Ispezione
          </button>
        </div>
        <p className="text-[9px] text-slate-500 italic mt-1 font-mono text-center">
          Trascina per RUOTARE | Rotella per ZOOM
        </p>
      </div>

      {/* Mode active status label */}
      <div className="absolute top-4 right-4 z-10 bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg backdrop-blur-sm shadow-md">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${activeMode === 'assembly' ? 'bg-sky-500 animate-pulse' : 'bg-emerald-500'}`} />
          <span className="text-xs font-mono text-slate-200 font-bold uppercase tracking-wider">
            {activeMode === 'assembly' ? 'Fase Montaggio: BIM Interattivo' : 'Fase Varo: Lancio Meccanico'}
          </span>
        </div>
      </div>
    </div>
  );
};
