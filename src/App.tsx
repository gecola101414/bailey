/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Wrench, 
  Settings, 
  TrendingDown, 
  HelpCircle, 
  RotateCcw, 
  Play, 
  Pause, 
  AlertTriangle, 
  CheckCircle2, 
  Truck, 
  ChevronRight, 
  ChevronLeft,
  Database, 
  Sliders, 
  Info,
  Scale,
  Compass,
  Hammer
} from 'lucide-react';
import { ConfigType, CONFIGURATIONS, BAILEY_COMPONENTS_DB, LauncherMetrics, ACCELERATION_OF_GRAVITY } from './types';
import { Bailey3DViewer } from './components/Bailey3DViewer';

// Sequenza delle fasi di montaggio di una campata Bailey
const ASSEMBLY_STEPS = [
  {
    step: 1,
    name: "Montante/Pannello SX (Left Truss Panels)",
    description: "Installazione dei primi pannelli reticolari portanti sul fianco sinistro.",
    components: "2x Pannelli Bailey, 4x Perni di unione conici",
    weightAddedKg: 527,
    actionDesc: "Collega i perni di unione inserendoli a martello nelle sedi a tazza maschio-femmina."
  },
  {
    step: 2,
    name: "Montante/Pannello DX (Right Truss Panels)",
    description: "Montaggio simmetrico dei pannelli portanti paralleli sul fianco destro.",
    components: "2x Pannelli Bailey, 4x Perni di unione conici",
    weightAddedKg: 527,
    actionDesc: "Garantisce il corretto interasse trasversale del ponte di 3.60 metri."
  },
  {
    step: 3,
    name: "Traverse IPE di Base (Transoms)",
    description: "Calaggio delle traverse trasversali a doppia T sopra i correnti inferiori dei pannelli.",
    components: "3x Traverse in acciaio IPE 240, 6x Bulloni cavallotto",
    weightAddedKg: 600,
    actionDesc: "Inserisci le traverse e blocca le piastre di posizionamento mediante i chiavistelli di serraggio."
  },
  {
    step: 4,
    name: "Telaietti Longheroni (Stringers)",
    description: "Posa dei telai longitudinali di longherone sopra la travatura di traverse.",
    components: "3x Telaietti Longheroni ad incastro in acciaio",
    weightAddedKg: 330,
    actionDesc: "I perni a bottone inferiori si innestano nelle fessure della traversa bloccando il movimento."
  },
  {
    step: 5,
    name: "Corteggio in Legno (Wood Chesses)",
    description: "Incastro del piano di calpestio carrabile in legno stagionato.",
    components: "14x Tavole di legno di abete rinforzate",
    weightAddedKg: 308,
    actionDesc: "Incastra le tavole strettamente sopra i longheroni per un transito stradale regolare."
  },
  {
    step: 6,
    name: "Controventamento Piano (Sway Braces)",
    description: "Serraggio a croce dei tiranti di vento con tenditore manuale.",
    components: "2x Tiranti diagonali a tensione registrabile",
    weightAddedKg: 60,
    actionDesc: "Sfrutta il tenditore centrale per tirare a squadra la struttura, annullando il vento."
  },
  {
    step: 7,
    name: "Cordoli & Pararuote (Curbs & Curb Braces)",
    description: "Fissaggio dei travi di bordo in legno per delimitare la carreggiata.",
    components: "2x Travi pararuote in legno massiccio, staffe a gancio",
    weightAddedKg: 90,
    actionDesc: "Ancorare saldamente mediante bulloneria a vite ai correnti esterni per prevenire sbandamenti dei mezzi."
  }
];

// Physics calculator
const calculateMetrics = (
  configType: ConfigType,
  spanLength: number,
  useReinforcingChords: boolean,
  noseBaysCount: number,
  pushDistance: number,
  spigotCompensationCm: number,
  counterweightKg: number
): LauncherMetrics => {
  const config = CONFIGURATIONS[configType];
  const BAY_LENGTH = 3.05;
  const N_main = Math.ceil(spanLength / BAY_LENGTH) + 2;
  const L_bridge = N_main * BAY_LENGTH;
  const L_nose = noseBaysCount * BAY_LENGTH;
  const L_total = L_bridge + L_nose;

  // Mass configurations
  const mainBayWeight = config.weightPerBayKg + (useReinforcingChords ? 250 : 0);
  const totalBridgeMassKg = N_main * mainBayWeight;
  const totalNoseMassKg = noseBaysCount * 450; // Lightweight nose panels (approx 450kg per bay)
  const totalMassKg = totalBridgeMassKg + totalNoseMassKg + counterweightKg;

  // Center of Gravity relative to tail (s = 0)
  // Main bridge weight centered at L_bridge / 2
  // Nose weight centered at L_bridge + L_nose / 2
  // Counterweight placed near the tail (s = 0.5m)
  const mainMoment = totalBridgeMassKg * (L_bridge / 2);
  const noseMoment = totalNoseMassKg * (L_bridge + L_nose / 2);
  const counterMoment = counterweightKg * 0.5;

  const localCG = (mainMoment + noseMoment + counterMoment) / totalMassKg;

  // Current tip world position
  const noseTipX = pushDistance;

  // World C.G. relative to launching roller (x = 0)
  // Since nose tip (local L_total) is at pushDistance:
  // world x of segment s = (pushDistance - L_total) + s
  const cgWorldX = (pushDistance - L_total) + localCG;

  // Bending Inertia calculation
  let Ix = config.momentOfInertiaIxCm4;
  if (useReinforcingChords) {
    Ix *= 1.4; // 40% increase
  }
  const Ix_m4 = Ix * 1e-8;
  const E = 2.1e11; // 210 GPa (Acciaio)

  // Overhang past x = 0
  const L_overhang = Math.max(0, pushDistance);

  // Sag calculation (simplified cantilever deflection under its own weight)
  // y_sag = (q * L^4) / (8 * E * I) scaled to match real dynamic range
  const q = (totalMassKg / L_total) * ACCELERATION_OF_GRAVITY;
  let sagM = (q * Math.pow(L_overhang, 4)) / (8 * E * Ix_m4);
  
  // Correction scale factor to represent real-world structural tolerance
  sagM *= 1.8;
  let sagCm = sagM * 100;

  // If already reached opposite side, the tip is supported, so sag reduces to zero
  if (pushDistance >= spanLength) {
    sagCm = 0;
  }

  // Exact Counter-Moment (Restoring) vs Tipping-Moment about launching roller (x = 0)
  let tippingMoment = 0;
  let restoringMoment = 0;
  const numSegments = 60;
  const segmentLength = L_total / numSegments;

  for (let i = 0; i < numSegments; i++) {
    const s = (i + 0.5) * segmentLength;
    // Determine segment mass
    const segMass = s <= L_bridge 
      ? (totalBridgeMassKg / L_bridge) * segmentLength 
      : (totalNoseMassKg / L_nose) * segmentLength;

    const segX = (pushDistance - L_total) + s;
    if (segX > 0) {
      tippingMoment += segMass * segX * ACCELERATION_OF_GRAVITY;
    } else {
      restoringMoment += segMass * Math.abs(segX) * ACCELERATION_OF_GRAVITY;
    }
  }

  // Counterweight position in world
  const cwWorldX = (pushDistance - L_total) + 0.5;
  if (cwWorldX < 0) {
    restoringMoment += counterweightKg * Math.abs(cwWorldX) * ACCELERATION_OF_GRAVITY;
  } else {
    tippingMoment += counterweightKg * cwWorldX * ACCELERATION_OF_GRAVITY;
  }

  // Safety factor
  let safetyFactor = tippingMoment > 0 ? restoringMoment / tippingMoment : 99.9;
  if (safetyFactor > 99.9) safetyFactor = 99.9;

  // Determine Launching Status
  // If C.G. passes roller before nose tip lands on receiving roller -> Tipped!
  // Note: Spigot joint elevatori can lift the nose, but if sag is greater than spigot + 30cm clearance,
  // the nose tip will hit the river bank or drop below the receiving roller, causing a crash.
  const clearanceLimit = spigotCompensationCm + 35; // 35cm default roller height clearance
  const tipStruckLow = pushDistance > spanLength - 1.5 && pushDistance < spanLength && sagCm > clearanceLimit;

  const isTipped = (cgWorldX >= 0.0) || tipStruckLow;
  const isLanded = pushDistance >= spanLength && !isTipped;

  let status: 'assembling' | 'launching' | 'safe_landed' | 'tipped' = 'assembling';
  if (isTipped) {
    status = 'tipped';
  } else if (isLanded) {
    status = 'safe_landed';
  } else if (pushDistance > 0) {
    status = 'launching';
  }

  return {
    totalBridgeLength: L_bridge,
    totalNoseLength: L_nose,
    totalBridgeMassKg,
    totalNoseMassKg,
    totalMassKg,
    pushDistanceM: pushDistance,
    noseTipX,
    cgFromRollerM: cgWorldX,
    status,
    sagCm,
    spigotCompensationCm,
    safetyFactor,
  };
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulation' | 'components' | 'manual'>('simulation');

  // BIM and Assembly States
  const [activeMode, setActiveMode] = useState<'simulation' | 'assembly'>('simulation');
  const [assemblyStep, setAssemblyStep] = useState<number>(7); // starts fully assembled
  const [hoveredBim, setHoveredBim] = useState<{ name: string; weight: string; material: string; role: string } | null>(null);
  const [isAssemblingAuto, setIsAssemblingAuto] = useState<boolean>(false);

  // Input States
  const [configType, setConfigType] = useState<ConfigType>('DD'); // Default Double-Double
  const [spanLength, setSpanLength] = useState<number>(24); // 24 meters span
  const [useReinforcingChords, setUseReinforcingChords] = useState<boolean>(false);
  const [noseBaysCount, setNoseBaysCount] = useState<number>(3); // 3 bays launching nose
  const [pushDistance, setPushDistance] = useState<number>(0);
  const [spigotCompensationCm, setSpigotCompensationCm] = useState<number>(20); // 20cm slant compensation
  const [counterweightKg, setCounterweightKg] = useState<number>(2000); // 2000kg counterweight (zavorra)

  // Simulation play state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoadTesting, setIsLoadTesting] = useState<boolean>(false);
  const [loadTestProgress, setLoadTestProgress] = useState<number>(0);
  const [showConfetti, setShowConfetti] = useState<boolean>(false);

  // Interval reference for auto-push
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const testIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Timer for active stepped auto-assembly
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isAssemblingAuto && activeMode === 'assembly') {
      interval = setInterval(() => {
        setAssemblyStep((prev) => {
          if (prev >= 7) {
            setIsAssemblingAuto(false);
            return 7;
          }
          return prev + 1;
        });
      }, 1800); // 1.8 seconds per component insertion
    } else {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAssemblingAuto, activeMode]);

  // Handle active mode transition
  useEffect(() => {
    if (activeMode !== 'assembly') {
      setIsAssemblingAuto(false);
    }
  }, [activeMode]);

  // Calculate real-time physics metrics
  const metrics = calculateMetrics(
    configType,
    spanLength,
    useReinforcingChords,
    noseBaysCount,
    pushDistance,
    spigotCompensationCm,
    counterweightKg
  );

  const isTipped = metrics.status === 'tipped';
  const isLanded = metrics.status === 'safe_landed';

  // Autopush effect
  useEffect(() => {
    if (isPlaying && !isTipped && !isLanded) {
      playIntervalRef.current = setInterval(() => {
        setPushDistance((prev) => {
          const next = +(prev + 0.15).toFixed(2);
          if (next >= spanLength) {
            setIsPlaying(false);
            // Landed successfully! Trigger visual confetti
            if (calculateMetrics(configType, spanLength, useReinforcingChords, noseBaysCount, next, spigotCompensationCm, counterweightKg).status === 'safe_landed') {
              setShowConfetti(true);
              setTimeout(() => setShowConfetti(false), 5000);
            }
            return spanLength;
          }
          return next;
        });
      }, 80);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }

    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, isTipped, isLanded, spanLength, configType, useReinforcingChords, noseBaysCount, spigotCompensationCm, counterweightKg]);

  // Load test automatic animation
  useEffect(() => {
    if (isLoadTesting) {
      testIntervalRef.current = setInterval(() => {
        setLoadTestProgress((prev) => {
          const next = prev + 0.01;
          if (next >= 1.0) {
            setIsLoadTesting(false);
            return 1.0;
          }
          return next;
        });
      }, 50);
    } else {
      if (testIntervalRef.current) clearInterval(testIntervalRef.current);
    }
    return () => {
      if (testIntervalRef.current) clearInterval(testIntervalRef.current);
    };
  }, [isLoadTesting]);

  const handleReset = () => {
    setIsPlaying(false);
    setIsLoadTesting(false);
    setLoadTestProgress(0);
    setPushDistance(0);
    setShowConfetti(false);
  };

  const startLoadTest = () => {
    if (!isLanded || isTipped) return;
    setLoadTestProgress(0);
    setIsLoadTesting(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" id="app-root">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 py-3 px-6 shadow-md flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-800 text-emerald-100 p-2 rounded-lg border border-emerald-600 shadow-inner">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              Bailey3D <span className="text-emerald-500 font-mono text-sm px-1.5 py-0.5 bg-emerald-950/80 rounded border border-emerald-800/60">Varo a Sbalzo v2.4</span>
            </h1>
            <p className="text-xs text-slate-400">Emulatore e Simulatore Meccanico del Genio Militare</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('simulation')}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition ${
              activeTab === 'simulation'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            id="tab-simulation"
          >
            <Sliders className="w-3.5 h-3.5 inline mr-1.5" />
            Simulazione 3D
          </button>
          <button
            onClick={() => setActiveTab('components')}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition ${
              activeTab === 'components'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            id="tab-components"
          >
            <Database className="w-3.5 h-3.5 inline mr-1.5" />
            Database Pezzi
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition ${
              activeTab === 'manual'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            id="tab-manual"
          >
            <Info className="w-3.5 h-3.5 inline mr-1.5" />
            Manuale d'Impiego
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'simulation' && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden w-full">
            
            {/* Left Side: Parameters Config / BIM Assembly Stepper */}
            <section className="w-full lg:w-96 bg-slate-900 border-r border-slate-800 flex flex-col overflow-y-auto p-5 shrink-0 gap-5">
              
              {/* Selettore Modalità: Varo vs Montaggio */}
              <div className="flex flex-col gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                <span className="text-[10px] font-mono font-bold text-slate-400 tracking-wider uppercase">Fase Operativa Ingegneria</span>
                <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-md border border-slate-800">
                  <button
                    onClick={() => {
                      setActiveMode('simulation');
                      setIsAssemblingAuto(false);
                    }}
                    className={`py-2 rounded text-xs font-semibold font-mono transition flex items-center justify-center gap-1.5 ${
                      activeMode === 'simulation'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                    id="btn-mode-varo"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    1. VARO (LANCIO)
                  </button>
                  <button
                    onClick={() => {
                      setActiveMode('assembly');
                      setAssemblyStep(7); // starts with complete active bay
                    }}
                    className={`py-2 rounded text-xs font-semibold font-mono transition flex items-center justify-center gap-1.5 ${
                      activeMode === 'assembly'
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-950'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                    id="btn-mode-montaggio"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    2. MONTAGGIO (BIM)
                  </button>
                </div>
              </div>

              {activeMode === 'simulation' ? (
                <>
                  {/* PARAMETRI DI VARO (SIMULATION) */}
                  {/* Box info di benvenuto */}
                  <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/60 text-xs text-slate-300">
                    <span className="font-bold text-emerald-500 uppercase tracking-wider block mb-1">Ingegnere Capo Militare:</span>
                    "Configura la luce del fosso, seleziona una struttura resistente Bailey, aggiungi la zavorra di coda per controbilanciare e spingi il ponte rampa a rampa sul fiume."
                  </div>

                  {/* Spalla e Fosso Configuration */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-1.5">
                      <Compass className="w-4 h-4 text-emerald-500" />
                      1. Luce & Spalla (Span)
                    </h3>
                    
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-400">Distanza Sponde (Luce):</span>
                        <span className="font-mono font-bold text-emerald-400">{spanLength} metri</span>
                      </div>
                      <input
                        type="range"
                        min="15"
                        max="40"
                        step="1"
                        disabled={pushDistance > 0}
                        value={spanLength}
                        onChange={(e) => setSpanLength(Number(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer"
                        id="input-span-length"
                      />
                      <span className="text-[10px] text-slate-500 italic block mt-1">
                        Campate stimate da 3,05m necessarie: {Math.ceil(spanLength / 3.05) + 2} bay per il ponte principale.
                      </span>
                    </div>
                  </div>

                  {/* Bailey Truss Configuration */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-1.5">
                      <Settings className="w-4 h-4 text-emerald-500" />
                      2. Armatura Portante Bailey
                    </h3>

                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Configurazione Traliccio:</label>
                      <select
                        value={configType}
                        disabled={pushDistance > 0}
                        onChange={(e) => setConfigType(e.target.value as ConfigType)}
                        className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500"
                        id="select-config-type"
                      >
                        {Object.values(CONFIGURATIONS).map((cfg) => (
                          <option key={cfg.id} value={cfg.id}>
                            {cfg.name} (MLC {cfg.militaryLoadClass}t)
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1.5 italic bg-slate-950/40 p-2 rounded border border-slate-800/80">
                        {CONFIGURATIONS[configType].description}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-950/50 p-2.5 rounded border border-slate-800 mt-1">
                      <input
                        type="checkbox"
                        id="checkbox-reinforcing"
                        disabled={pushDistance > 0}
                        checked={useReinforcingChords}
                        onChange={(e) => setUseReinforcingChords(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-500 cursor-pointer"
                      />
                      <label htmlFor="checkbox-reinforcing" className="text-xs text-slate-300 cursor-pointer select-none">
                        <span className="font-bold text-slate-200">Cordoli di Rinforzo</span> (+40% Rigidità)
                      </label>
                    </div>
                  </div>

                  {/* Launching Nose & Balancing */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-1.5">
                      <Scale className="w-4 h-4 text-emerald-500" />
                      3. Becco di Varo & Zavorra
                    </h3>

                    {/* Becco di varo bays */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">Lunghezza Becco (SS leggero):</span>
                        <span className="font-mono font-bold text-emerald-400">{noseBaysCount} campate ({(noseBaysCount * 3.05).toFixed(1)}m)</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        disabled={pushDistance > 0}
                        value={noseBaysCount}
                        onChange={(e) => setNoseBaysCount(Number(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer"
                        id="input-nose-bays"
                      />
                      <span className="text-[10px] text-slate-500 italic block mt-1">
                        Un becco più lungo previene la caduta ma sposta in avanti il peso totale.
                      </span>
                    </div>

                    {/* Zavorra di coda counterweight */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">Zavorra di Coda (Restauro):</span>
                        <span className="font-mono font-bold text-emerald-400">{counterweightKg} kg</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="8000"
                        step="500"
                        disabled={pushDistance > 0}
                        value={counterweightKg}
                        onChange={(e) => setCounterweightKg(Number(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer"
                        id="input-counterweight"
                      />
                      <span className="text-[10px] text-slate-500 italic block mt-1">
                        Fissata sulla rampa di coda del ponte principale per bloccare il ribaltamento.
                      </span>
                    </div>

                    {/* Spigot compensation height */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">Giunto Spigot (Inclinazione):</span>
                        <span className="font-mono font-bold text-emerald-400">+{spigotCompensationCm} cm</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        step="5"
                        disabled={pushDistance > 0}
                        value={spigotCompensationCm}
                        onChange={(e) => setSpigotCompensationCm(Number(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer"
                        id="input-spigot"
                      />
                      <span className="text-[10px] text-slate-500 italic block mt-1">
                        Solleva la punta del becco verso l'alto per contrastare l'inflessione flessionale.
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* PANNELLO DI MONTAGGIO (ASSEMBLY STEPPER) */}
                  <div className="flex flex-col gap-4 flex-1">
                    <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 text-xs text-slate-300">
                      <span className="font-bold text-sky-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                        <Hammer className="w-3.5 h-3.5" />
                        Caposquadra Pontieri:
                      </span>
                      "Qui montiamo la campata stradale pezzo dopo pezzo. Segui i passaggi tecnici per vedere come gli elementi si compongono nel piano di varo."
                    </div>

                    {/* Stepper Controls */}
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col gap-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 uppercase font-mono tracking-wider font-bold">Avanzamento Campata</span>
                        <span className="font-mono font-bold text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-800/40">
                          Passo {assemblyStep} / 7
                        </span>
                      </div>

                      {/* Stepper Buttons */}
                      <div className="flex gap-2">
                        <button
                          disabled={assemblyStep <= 1 || isAssemblingAuto}
                          onClick={() => setAssemblyStep((prev) => prev - 1)}
                          className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition"
                          id="btn-assembly-prev"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Precedente
                        </button>
                        <button
                          disabled={assemblyStep >= 7 || isAssemblingAuto}
                          onClick={() => setAssemblyStep((prev) => prev + 1)}
                          className="flex-1 bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-40 py-2 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1 transition shadow-lg shadow-sky-950"
                          id="btn-assembly-next"
                        >
                          Successivo
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Auto-Assembly Play button */}
                      <button
                        onClick={() => {
                          if (isAssemblingAuto) {
                            setIsAssemblingAuto(false);
                          } else {
                            setAssemblyStep(1);
                            setIsAssemblingAuto(true);
                          }
                        }}
                        className={`w-full py-2 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                          isAssemblingAuto 
                            ? 'bg-amber-600 text-white hover:bg-amber-500' 
                            : 'bg-sky-900/50 border border-sky-700 text-sky-200 hover:bg-sky-800/80'
                        }`}
                        id="btn-assembly-autoplay"
                      >
                        {isAssemblingAuto ? <Pause className="w-4 h-4 animate-pulse" /> : <Play className="w-4 h-4" />}
                        {isAssemblingAuto ? 'SOSPENDI MONTAGGIO' : 'AVVIA AUTO-MONTAGGIO'}
                      </button>
                    </div>

                    {/* Step Timeline Indicator */}
                    <div className="flex flex-col gap-2 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/80 flex-1 overflow-y-auto">
                      <span className="text-[10px] uppercase font-mono font-bold text-slate-500 block mb-2 tracking-wider">Cronoprogramma di Cantiere</span>
                      
                      <div className="flex flex-col gap-3">
                        {ASSEMBLY_STEPS.map((s) => {
                          const isCurrent = s.step === assemblyStep;
                          const isCompleted = s.step < assemblyStep;
                          return (
                            <button
                              key={s.step}
                              onClick={() => {
                                setIsAssemblingAuto(false);
                                setAssemblyStep(s.step);
                              }}
                              className={`text-left p-2 rounded-lg border flex gap-2.5 transition items-start ${
                                isCurrent 
                                  ? 'bg-sky-950/60 border-sky-700/80 text-sky-100 shadow-md shadow-sky-950/40' 
                                  : isCompleted 
                                    ? 'bg-slate-950/30 border-emerald-950 text-slate-400 hover:bg-slate-900/50' 
                                    : 'bg-slate-950/10 border-slate-900 text-slate-600 hover:bg-slate-900/20'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                                isCurrent 
                                  ? 'bg-sky-500 text-slate-950' 
                                  : isCompleted 
                                    ? 'bg-emerald-900/60 text-emerald-300' 
                                    : 'bg-slate-850 text-slate-500'
                              }`}>
                                {isCompleted ? '✓' : s.step}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className={`text-xs font-bold block truncate ${isCurrent ? 'text-sky-300' : isCompleted ? 'text-slate-300 font-medium' : 'text-slate-500'}`}>
                                  {s.name}
                                </span>
                                {isCurrent && (
                                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                                    {s.description}
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Component Info Card */}
                    <div className="bg-sky-950/30 border border-sky-900/50 rounded-lg p-3 text-xs flex flex-col gap-1.5 mt-auto text-sky-200">
                      <div className="flex items-center gap-1.5 font-bold uppercase text-[10px] tracking-wide text-sky-400">
                        <Info className="w-4 h-4 shrink-0" />
                        Specifiche Materiali Passo {assemblyStep}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-0.5 font-mono text-[11px]">
                        <div>
                          <span className="text-slate-400 block">Pezzi Aggiunti:</span>
                          <span className="text-slate-200 font-bold">{ASSEMBLY_STEPS[assemblyStep - 1]?.components}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Massa Aggiunta:</span>
                          <span className="text-slate-200 font-bold">+{ASSEMBLY_STEPS[assemblyStep - 1]?.weightAddedKg} kg</span>
                        </div>
                      </div>
                      <p className="text-[11px] leading-relaxed italic border-t border-sky-900/40 pt-2 text-slate-300 mt-1">
                        <strong>Lavorazione:</strong> {ASSEMBLY_STEPS[assemblyStep - 1]?.actionDesc}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Status Alert Panels (Solo in Modalità Varo) */}
              {activeMode === 'simulation' && (
                <div className="mt-auto pt-4 border-t border-slate-800">
                  {isTipped ? (
                    <div className="bg-red-950/80 border border-red-800 rounded-lg p-3 text-red-200 text-xs flex gap-2.5 shadow-lg" id="alert-tipped">
                      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                      <div>
                        <h4 className="font-bold text-red-400 uppercase">Crollo & Ribaltamento!</h4>
                        <p className="mt-1">Il baricentro ha superato il rullo basculante sponda-terra. Il ponte si è ribaltato cadendo nel fiume.</p>
                        <p className="mt-1.5 font-semibold text-slate-300">💡 Correzione: Aumenta la Zavorra di coda, accorcia il Becco di varo, o usa un traliccio più leggero (es. DS o SS) per la spinta.</p>
                      </div>
                    </div>
                  ) : isLanded ? (
                    <div className="bg-emerald-950/80 border border-emerald-800 rounded-lg p-3 text-emerald-200 text-xs flex gap-2.5 shadow-lg" id="alert-landed">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <div>
                        <h4 className="font-bold text-emerald-400 uppercase">Lancio Completato!</h4>
                        <p className="mt-1">La punta del becco ha raggiunto con successo i rulli basculanti della sponda opposta.</p>
                        <button
                          onClick={startLoadTest}
                          disabled={isLoadTesting}
                          className="mt-3 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 px-3 rounded text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                          id="btn-load-test"
                        >
                          <Truck className="w-4 h-4" />
                          {isLoadTesting ? 'Collaudo in corso...' : 'Avvia Collaudo di Carico'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-slate-400 text-xs flex gap-2.5">
                      <Info className="w-4 h-4 text-emerald-500 shrink-0" />
                      <p>Usa i comandi di varo qui sotto per spingere longitudinalmente il ponte sul fosso.</p>
                    </div>
                  )}
                </div>
              )}

            </section>

            {/* Right Side: 3D View + Telemetry and Push Controls */}
            <div className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">
              
              {/* 3D Viewer Container */}
              <div className="flex-1 min-h-[350px] md:min-h-[480px] relative">
                <Bailey3DViewer
                  configType={configType}
                  spanLength={spanLength}
                  useReinforcingChords={useReinforcingChords}
                  noseBaysCount={noseBaysCount}
                  pushDistance={pushDistance}
                  spigotCompensationCm={spigotCompensationCm}
                  counterweightKg={counterweightKg}
                  metrics={metrics}
                  isTipped={isTipped}
                  isLanded={isLanded}
                  isLoadTesting={isLoadTesting}
                  loadTestProgress={loadTestProgress}
                  activeMode={activeMode}
                  assemblyStep={assemblyStep}
                  onHoverBimComponent={setHoveredBim}
                />

                {/* Floating BIM Info Panel */}
                {hoveredBim && (
                  <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-slate-900/95 border-2 border-sky-500 rounded-xl p-4 shadow-2xl backdrop-blur-md z-20 flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-3 duration-200">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h4 className="font-bold text-sky-400 text-sm flex items-center gap-1.5">
                        <Database className="w-4 h-4" />
                        Componente BIM Rilevato
                      </h4>
                      <span className="bg-sky-950 text-sky-300 font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border border-sky-800/50">
                        Ispezione
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-slate-400 font-mono">Nome Componente:</span>
                      <span className="text-sm font-bold text-slate-100">{hoveredBim.name}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950/60 p-2 rounded border border-slate-800">
                      <div>
                        <span className="text-slate-500 block">Massa:</span>
                        <span className="text-slate-200 font-bold">{hoveredBim.weight}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Materiale:</span>
                        <span className="text-slate-200 font-bold">{hoveredBim.material}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 text-xs">
                      <span className="text-slate-400 font-mono">Funzione Strutturale:</span>
                      <p className="text-slate-300 leading-relaxed italic bg-slate-950/20 p-2 rounded border border-slate-800/40">
                        "{hoveredBim.role}"
                      </p>
                    </div>
                  </div>
                )}

                {/* Tiny HUD placeholder when no object is hovered */}
                {!hoveredBim && (
                  <div className="absolute bottom-4 right-4 bg-slate-900/85 border border-slate-800 px-3 py-1.5 rounded-lg text-[10px] font-mono text-slate-400 z-10 pointer-events-none flex items-center gap-1.5 shadow-md">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                    Muovi il puntatore sul ponte per i dati BIM
                  </div>
                )}

                {/* Overlaid warning for excessive Sag strike */}
                {activeMode === 'simulation' && !isTipped && !isLanded && pushDistance > spanLength - 3 && metrics.sagCm > spigotCompensationCm + 35 && (
                  <div className="absolute top-4 right-4 bg-amber-950/90 border border-amber-600 text-amber-200 p-3 rounded-lg text-xs max-w-xs z-10 shadow-lg animate-in fade-in zoom-in duration-150">
                    <div className="flex gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <div>
                        <span className="font-bold text-amber-400">COLLISIONE IMMINENTE!</span>
                        <p className="mt-1 text-[11px]">La freccia d'inflessione della punta ({metrics.sagCm.toFixed(1)} cm) supera la spinta del giunto inclinatore (+{spigotCompensationCm} cm). Il becco rischerà di urtare la sponda di ricezione!</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Launcher Console Slider and Live Telemetry (FASE 3) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-5 shadow-lg">
                
                {/* 1. Launcher Slider Controls */}
                <div className="flex flex-col md:flex-row items-center gap-4 justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      disabled={isTipped || isLanded}
                      className={`p-2.5 rounded-lg border font-bold text-xs transition flex items-center justify-center gap-1.5 shrink-0 ${
                        isPlaying 
                          ? 'bg-amber-600 border-amber-500 text-white hover:bg-amber-500' 
                          : 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500 disabled:opacity-40'
                      }`}
                      title={isPlaying ? "Metti in pausa il varo" : "Avvia il varo automatico"}
                      id="btn-play-pause"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      {isPlaying ? 'PAUSA' : 'VARO AUTOMATICO'}
                    </button>
                    
                    <button
                      onClick={handleReset}
                      className="p-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition"
                      title="Resetta la simulazione"
                      id="btn-reset"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Manual Push Slider */}
                  <div className="flex-1 w-full flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400">Varato:</span>
                    <input
                      type="range"
                      min="0"
                      max={spanLength}
                      step="0.1"
                      disabled={isTipped}
                      value={pushDistance}
                      onChange={(e) => {
                        setIsPlaying(false);
                        setPushDistance(Number(e.target.value));
                      }}
                      className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      id="input-push-distance"
                    />
                    <span className="text-sm font-mono font-bold text-emerald-400 shrink-0 w-24 text-right">
                      {pushDistance.toFixed(1)} / {spanLength} m
                    </span>
                  </div>
                </div>

                {/* 2. Live Telemetry Columns */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  
                  {/* Weight telemetry */}
                  <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Massa Totale Struttura</span>
                    <span className="text-lg font-mono font-bold text-slate-200 mt-1 block">
                      {(metrics.totalMassKg / 1000).toFixed(2)} t
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">
                      Ponte: {(metrics.totalBridgeMassKg / 1000).toFixed(1)}t | Becco: {(metrics.totalNoseMassKg / 1000).toFixed(1)}t
                    </span>
                  </div>

                  {/* Stiffness / Inertia */}
                  <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Momento d'Inerzia (I_x)</span>
                    <span className="text-lg font-mono font-bold text-slate-200 mt-1 block">
                      {CONFIGURATIONS[configType].momentOfInertiaIxCm4.toLocaleString()} <span className="text-xs text-slate-400">cm⁴</span>
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">
                      Con rinforzi: {useReinforcingChords ? 'Sì (+40%)' : 'No'}
                    </span>
                  </div>

                  {/* Center of Gravity (C.G.) Status */}
                  <div className={`p-3 rounded-lg border ${
                    metrics.cgFromRollerM >= 0 
                      ? 'bg-red-950/40 border-red-900/60' 
                      : metrics.cgFromRollerM > -2.0 
                        ? 'bg-amber-950/40 border-amber-900/60' 
                        : 'bg-slate-950/40 border-slate-800/80'
                  }`}>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Posizione Baricentro (C.G.)</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={`text-lg font-mono font-bold block ${
                        metrics.cgFromRollerM >= 0 ? 'text-red-400' : 'text-slate-200'
                      }`}>
                        {metrics.cgFromRollerM.toFixed(2)} m
                      </span>
                      <span className="text-[9px] text-slate-400">dal rullo</span>
                    </div>
                    <span className={`text-[9px] font-bold block mt-0.5 ${
                      metrics.cgFromRollerM >= 0 ? 'text-red-400' : 'text-emerald-400'
                    }`}>
                      {metrics.cgFromRollerM >= 0 ? '⚠️ INSTABILE (Ribalta!)' : '✓ STABILE'}
                    </span>
                  </div>

                  {/* Real-time structural deflection sag */}
                  <div className={`p-3 rounded-lg border ${
                    metrics.sagCm > spigotCompensationCm + 35
                      ? 'bg-red-950/40 border-red-900/60'
                      : metrics.sagCm > 25
                        ? 'bg-amber-950/40 border-amber-900/60'
                        : 'bg-slate-950/40 border-slate-800/80'
                  }`}>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Inflessione della Punta (Sag)</span>
                    <span className="text-lg font-mono font-bold text-slate-200 mt-1 block">
                      {metrics.sagCm.toFixed(1)} cm
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">
                      Compensazione Spigot: +{spigotCompensationCm} cm
                    </span>
                  </div>

                </div>

                {/* Mechanical Equilibrium Formula Block */}
                <div className="bg-slate-950/60 border border-slate-800/60 p-3.5 rounded-lg text-xs font-mono flex flex-col gap-1 text-slate-300">
                  <span className="text-emerald-500 font-bold uppercase text-[10px] tracking-wider mb-1">EQUILIBRIO MECCANICO DEL MOMENTO</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-0.5 text-slate-400">
                    <div>
                      <span className="text-slate-300">M_restaurante (Sponda):</span> <span className="text-emerald-400">M_terra · d_terra · g = </span>
                      <span className="text-slate-100 font-bold">{Math.round(metrics.safetyFactor * 100)} kNm</span>
                    </div>
                    <div>
                      <span className="text-slate-300">Fattore di Sicurezza (SF):</span> <span className="text-emerald-400">M_rest / M_tip = </span>
                      <span className={`font-bold ${metrics.safetyFactor <= 1.0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {metrics.safetyFactor.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* Database Tab */}
        {activeTab === 'components' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <Database className="w-6 h-6 text-emerald-500" />
                Catalogo dei Componenti Bailey Standard
              </h2>
              <p className="text-slate-400 text-sm">
                Specifiche fisiche dei componenti originari progettati da Donald Bailey e codificati nei manuali storici del Genio Militare Italiano.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {Object.values(BAILEY_COMPONENTS_DB).map((comp) => (
                <div key={comp.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700 transition rounded-xl p-5 flex flex-col gap-3 shadow-md" id={`comp-card-${comp.id}`}>
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-slate-100 text-sm">{comp.name}</h3>
                    <span className="bg-slate-800 text-emerald-400 text-[10px] font-mono px-2 py-0.5 rounded border border-slate-700">
                      {comp.weightKg} kg
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 flex-1">{comp.description}</p>
                  <div className="border-t border-slate-800 pt-3 flex flex-col gap-1.5 font-mono text-[11px] text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Dimensioni:</span>
                      <span>{comp.lengthM}m × {comp.widthM}m × {comp.heightM}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Materiale:</span>
                      <span>{comp.material}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manual Tab */}
        {activeTab === 'manual' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <Info className="w-6 h-6 text-emerald-500" />
                Manuale d'Impiego & Procedura di Lancio
              </h2>
              <p className="text-slate-400 text-sm">
                Linee guida ingegneristiche per il montaggio tattico e la spinta a sbalzo.
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col gap-5 text-sm text-slate-300 leading-relaxed">
              <section className="flex flex-col gap-2">
                <h3 className="font-bold text-slate-100 text-base border-b border-slate-800 pb-1.5 flex items-center gap-2">
                  <span className="bg-emerald-800 text-emerald-100 text-xs w-5 h-5 rounded-full inline-flex items-center justify-center font-bold">1</span>
                  La Logica del Varo a Sbalzo (Cantilever Launching)
                </h3>
                <p>
                  Il pregio principale del Ponte Bailey risiede nella possibilità di essere assemblato interamente su una sponda ("sponda di varo") e spinto longitudinalmente sul fiume senza bisogno di supporti intermedi o gru pesanti nell'alveo. Per evitare il ribaltamento nel vuoto prima che la punta tocchi la riva opposta, viene montata in testa un'estensione temporanea più leggera denominata <strong>Becco di Varo (Launching Nose)</strong>.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="font-bold text-slate-100 text-base border-b border-slate-800 pb-1.5 flex items-center gap-2">
                  <span className="bg-emerald-800 text-emerald-100 text-xs w-5 h-5 rounded-full inline-flex items-center justify-center font-bold">2</span>
                  Calcolo del Baricentro Continuo
                </h3>
                <p>
                  Durante la spinta, l'intero ponte si comporta come una bilancia il cui fulcro è l'ultimo <strong>Rullo Basculante (Rocking Roller)</strong> posto sul ciglio della sponda di partenza. La porzione di ponte sospesa sul fiume genera un momento torcente ribaltante (massa x braccio), mentre la porzione ancora sui rulli a terra genera un momento stabilizzante.
                </p>
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs text-slate-400">
                  <span className="text-emerald-500 font-bold block mb-1">REQUISITO DI SICUREZZA:</span>
                  La coordinata del Baricentro Globale (C.G.) deve rimanere sempre all'interno della sponda di varo (C.G. &lt; 0) fino al momento del contatto con i rulli opposti. Nel simulatore, se il C.G. supera lo zero, il ponte ruota istantaneamente cadendo nel fosso.
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="font-bold text-slate-100 text-base border-b border-slate-800 pb-1.5 flex items-center gap-2">
                  <span className="bg-emerald-800 text-emerald-100 text-xs w-5 h-5 rounded-full inline-flex items-center justify-center font-bold">3</span>
                  Flessione Strutturale (Sag) e Giunti Spigot
                </h3>
                <p>
                  A causa del peso proprio elevato dell'acciaio, la punta a sbalzo subisce una flessione verticale verso il basso (la freccia d'inflessione). Se questa freccia è troppo marcata, la punta urterà contro la roccia della sponda opposta invece di salire sui rulli riceventi.
                </p>
                <p>
                  Per rimediare, gli ingegneri del Genio inseriscono speciali <strong>Link Spigot elevatori</strong> tra le campate del becco di varo. Questi giunti inclinano i pannelli di qualche frazione di grado verso l'alto, compensando l'incurvatura elastica in anticipo.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="font-bold text-slate-100 text-base border-b border-slate-800 pb-1.5 flex items-center gap-2">
                  <span className="bg-emerald-800 text-emerald-100 text-xs w-5 h-5 rounded-full inline-flex items-center justify-center font-bold">4</span>
                  Regole di Sicurezza del Genio Militare
                </h3>
                <ul className="list-disc pl-5 flex flex-col gap-1 text-slate-400">
                  <li>Usa una zavorra di coda adeguata: una coda carica compensa strutture molto pesanti (es. TD o DD).</li>
                  <li>Usa un becco leggero (Single-Single) e privo di pavimentazione stradale (chesses) per ridurre al minimo il peso della punta.</li>
                  <li>In caso di grandi luci (sopra i 24m), prediligi configurazioni rigide con <strong>Cordoli di Rinforzo</strong> per limitare la freccia di curvatura.</li>
                </ul>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-3 px-6 text-center text-xs text-slate-500">
        <p>© 2026 Bailey3D Builder & Launcher. Codificato secondo le specifiche del Genio Militare Italiano.</p>
      </footer>
    </div>
  );
}
