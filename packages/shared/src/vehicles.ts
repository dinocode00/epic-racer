export interface VehicleDef {
  id: string;
  name: string;
  /** 1..5 */
  speed: number;
  handling: number;
  weight: number;
  hover: boolean;
}

export const VEHICLES: VehicleDef[] = [
  { id: 'pod', name: 'Pod Racer', speed: 4.5, handling: 3, weight: 2, hover: true },
  { id: 'bat', name: 'Batmobile', speed: 4.5, handling: 4, weight: 4, hover: false },
  { id: 'nazgul', name: 'Nazgûl', speed: 4.5, handling: 4, weight: 2, hover: false },
  { id: 'mach5', name: 'Mach 5', speed: 4.5, handling: 4, weight: 1, hover: false },
  { id: 'corolla', name: "'95 Corolla", speed: 4, handling: 3.5, weight: 1, hover: false },
  { id: 'landcruiser', name: "'89 Land Cruiser", speed: 4.5, handling: 4, weight: 4, hover: false },
];

export const vehicleById = (id: string): VehicleDef =>
  VEHICLES.find((v) => v.id === id) ?? VEHICLES[1]!;
