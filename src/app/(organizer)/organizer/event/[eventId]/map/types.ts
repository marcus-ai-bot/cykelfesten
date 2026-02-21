export type Course = 'starter' | 'main' | 'dessert';

export interface MapCouple {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  isHost: boolean;
  isConfirmed: boolean;
  personCount: number;
  allergies: string[];
}

export interface MissingCoords {
  id: string;
  name: string;
  address: string;
}

export interface RouteSegment {
  from: [number, number];
  to: [number, number];
  geometry: [number, number][] | null;
  guestName: string;
  hostName: string;
  guestId: string;
  hostId: string;
  fromAddress: string;
  fromHostName: string | null; // null for starter (coming from home)
}

/** Outgoing route: coupleId → { geometry, to } per course */
export type OutgoingRoutes = Record<string, Record<string, { geometry: [number, number][] | null; to: [number, number] }>>;

export interface MapData {
  couples: MapCouple[];
  missingCoords: MissingCoords[];
  routes: Record<Course, RouteSegment[]> | null;
  outgoingRoutes: OutgoingRoutes | null;
  eventTimes: Record<Course, string> | null;
}

export interface MealGroup {
  hostId: string;
  hostName: string;
  hostAddress: string;
  hostCoords: [number, number];
  hostAllergies: string[];
  guests: Array<{
    id: string;
    name: string;
    address: string;
    coords: [number, number];
    allergies: string[];
    routeDistanceKm: number | null;
    /** Where they're cycling FROM (home for starter, previous host for main/dessert) */
    fromAddress: string;
    fromHostName: string | null;
    fromCoords: [number, number];
    /** Where they're going NEXT (next host, or home for dessert) */
    toAddress: string | null;
    toHostName: string | null;
    toCoords: [number, number] | null;
    toDistanceKm: number | null;
  }>;
  /** Where the host goes next */
  hostNextAddress: string | null;
  hostNextHostName: string | null;
  totalPeople: number;
}

export interface CourseConfig {
  label: string;
  emoji: string;
  color: string;
  time: string;
}

export const COURSES: Course[] = ['starter', 'main', 'dessert'];

export const DEFAULT_COURSE_CONFIG: Record<Course, Omit<CourseConfig, 'time'>> = {
  starter: { label: 'Förrätt', emoji: '🥗', color: '#f59e0b' },
  main: { label: 'Varmrätt', emoji: '🍖', color: '#ef4444' },
  dessert: { label: 'Efterrätt', emoji: '🍰', color: '#8b5cf6' },
};
