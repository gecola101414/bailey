/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Bailey bridge structural configurations
export type ConfigType = 'SS' | 'DS' | 'TS' | 'SD' | 'DD' | 'TD';

export interface BridgeConfiguration {
  id: ConfigType;
  name: string; // Italian name e.g., "Singolo-Singolo (SS)"
  description: string;
  panelsPerSide: number; // 1, 2, 3
  storeys: number; // 1 (Singolo), 2 (Doppio)
  weightPerBayKg: number; // base weight per 3.05m bay
  momentOfInertiaIxCm4: number; // Ix in cm^4 (for structural deflection)
  maxBendingMomentKNm: number; // Max allowable bending moment
  maxShearKN: number; // Max allowable shear force
  militaryLoadClass: number; // MLC (portata in tonnellate indicativa)
}

// Database representing real Bailey bridge component properties (FASE 1)
export interface BaileyComponent {
  id: string;
  name: string;
  description: string;
  weightKg: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  material: string;
}

export const BAILEY_COMPONENTS_DB: Record<string, BaileyComponent> = {
  panel: {
    id: 'panel',
    name: 'Pannello Bailey (Panel)',
    description: 'Telaio reticolare principale in acciaio ad alta resistenza, elemento portante.',
    weightKg: 260,
    lengthM: 3.05,
    widthM: 0.17,
    heightM: 1.45,
    material: 'Acciaio Zincato S355'
  },
  transom: {
    id: 'transom',
    name: 'Traversa (Transom)',
    description: 'Trave a doppia T che unisce i pannelli laterali e sostiene l\'impalcato.',
    weightKg: 200,
    lengthM: 4.20,
    widthM: 0.25,
    heightM: 0.30,
    material: 'Acciaio Zincato S355'
  },
  stringer: {
    id: 'stringer',
    name: 'Longherone (Stringer)',
    description: 'Telaietti longitudinali dotati di pulsanti per l\'alloggiamento del corteggio.',
    weightKg: 110,
    lengthM: 3.05,
    widthM: 0.75,
    heightM: 0.18,
    material: 'Acciaio Zincato S275'
  },
  chess: {
    id: 'chess',
    name: 'Corteggio (Chess)',
    description: 'Tavole di legno o metallo disposte trasversalmente per formare la carreggiata.',
    weightKg: 22,
    lengthM: 3.20,
    widthM: 0.22,
    heightM: 0.05,
    material: 'Legno di Abete Trattato'
  },
  panelPin: {
    id: 'panelPin',
    name: 'Perno di Unione (Panel Pin)',
    description: 'Spina conica in acciaio speciale temprato per collegare i pannelli.',
    weightKg: 3.5,
    lengthM: 0.22,
    widthM: 0.05,
    heightM: 0.05,
    material: 'Acciaio Temprato Ni-Cr'
  },
  bracingFrame: {
    id: 'bracingFrame',
    name: 'Telaio di Controvento (Bracing Frame)',
    description: 'Struttura diagonale che collega e stabilizza due pannelli affiancati.',
    weightKg: 30,
    lengthM: 1.00,
    widthM: 1.00,
    heightM: 0.08,
    material: 'Acciaio S275'
  },
  swayBrace: {
    id: 'swayBrace',
    name: 'Tirante di Controvento (Sway Brace)',
    description: 'Asta regolabile con tenditore per assorbire le forze di vento e sbandamento.',
    weightKg: 40,
    lengthM: 4.50,
    widthM: 0.06,
    heightM: 0.06,
    material: 'Acciaio S275'
  },
  rockingRoller: {
    id: 'rockingRoller',
    name: 'Rullo Basculante (Rocking Roller)',
    description: 'Supporto a rulli montato su bilanciere per sponde di varo. Distribuisce il carico.',
    weightKg: 120,
    lengthM: 0.80,
    widthM: 0.60,
    heightM: 0.40,
    material: 'Acciaio Speciale da Fonderia'
  },
  plainRoller: {
    id: 'plainRoller',
    name: 'Rullo di Scorrimento (Plain Roller)',
    description: 'Rullo fisso singolo usato lungo la rampa di montaggio o per la ricezione.',
    weightKg: 80,
    lengthM: 0.60,
    widthM: 0.40,
    heightM: 0.30,
    material: 'Acciaio Zincato'
  }
};

// Structural configurations standard tables (FASE 2)
export const CONFIGURATIONS: Record<ConfigType, BridgeConfiguration> = {
  SS: {
    id: 'SS',
    name: 'Singolo-Singolo (SS)',
    description: 'Un solo pannello per lato su un unico livello. Struttura leggera per luci ridotte.',
    panelsPerSide: 1,
    storeys: 1,
    weightPerBayKg: 1250,
    momentOfInertiaIxCm4: 153000,
    maxBendingMomentKNm: 165,
    maxShearKN: 150,
    militaryLoadClass: 12 // MLC indicativo (tonnellate)
  },
  DS: {
    id: 'DS',
    name: 'Doppio-Singolo (DS)',
    description: 'Due pannelli affiancati per lato su un unico livello. Incrementa la resistenza flessionale.',
    panelsPerSide: 2,
    storeys: 1,
    weightPerBayKg: 1820,
    momentOfInertiaIxCm4: 306000,
    maxBendingMomentKNm: 320,
    maxShearKN: 280,
    militaryLoadClass: 24
  },
  TS: {
    id: 'TS',
    name: 'Triplo-Singolo (TS)',
    description: 'Tre pannelli affiancati per lato su un unico livello. Molto largo e rigido lateralmente.',
    panelsPerSide: 3,
    storeys: 1,
    weightPerBayKg: 2400,
    momentOfInertiaIxCm4: 459000,
    maxBendingMomentKNm: 460,
    maxShearKN: 390,
    militaryLoadClass: 40
  },
  SD: {
    id: 'SD',
    name: 'Singolo-Doppio (SD)',
    description: 'Un pannello per lato su due livelli sovrapposti. Grande inerzia verticale rispetto al peso.',
    panelsPerSide: 1,
    storeys: 2,
    weightPerBayKg: 2050,
    momentOfInertiaIxCm4: 1224000,
    maxBendingMomentKNm: 640,
    maxShearKN: 300,
    militaryLoadClass: 30
  },
  DD: {
    id: 'DD',
    name: 'Doppio-Doppio (DD)',
    description: 'Due pannelli per lato su due livelli sovrapposti. La configurazione standard più versatile.',
    panelsPerSide: 2,
    storeys: 2,
    weightPerBayKg: 3180,
    momentOfInertiaIxCm4: 2448000,
    maxBendingMomentKNm: 1250,
    maxShearKN: 560,
    militaryLoadClass: 60
  },
  TD: {
    id: 'TD',
    name: 'Triplo-Doppio (TD)',
    description: 'Tre pannelli per lato su due livelli. Struttura pesante ad altissima portata per carri armati.',
    panelsPerSide: 3,
    storeys: 2,
    weightPerBayKg: 4320,
    momentOfInertiaIxCm4: 3672000,
    maxBendingMomentKNm: 1800,
    maxShearKN: 800,
    militaryLoadClass: 80
  }
};

// Physical Constants
export const YOUNG_MODULUS_N_MM2 = 210000; // E for steel
export const ACCELERATION_OF_GRAVITY = 9.81; // m/s^2

/**
 * Calculates the center of gravity and safety margins during the push.
 * All positions are in meters.
 * x = 0 is the location of the launching Rocking Roller.
 * x = span is the receiving shore roller.
 */
export interface LauncherMetrics {
  totalBridgeLength: number;
  totalNoseLength: number;
  totalBridgeMassKg: number;
  totalNoseMassKg: number;
  totalMassKg: number;
  
  // Current push position (how much the bridge nose tip has passed beyond the roller at x=0)
  pushDistanceM: number;
  
  // World coordinate of the tip of the launching nose
  noseTipX: number;
  
  // Center of gravity location relative to the launching roller (x=0 is the roller)
  // Negative values mean C.G. is safely on the launching shore. Positive means tipping danger!
  cgFromRollerM: number;
  
  // Status of launching: 'assembling' | 'launching' | 'safe_landed' | 'tipped' | 'main_positioned' | 'completed'
  status: 'assembling' | 'launching' | 'safe_landed' | 'tipped' | 'main_positioned' | 'completed';
  
  // Sag (incurvatura) at the tip of the nose in centimeters
  sagCm: number;
  
  // High spigot height compensation (compensazione link spigot elevatori) in cm
  spigotCompensationCm: number;
  
  // Safety factor against tipping: Counter-moment / Tipping-moment
  safetyFactor: number;
}
