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
}

export interface MapData {
  couples: MapCouple[];
  missingCoords: MissingCoords[];
  routes: Record<Course, RouteSegment[]> | null;
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
  }>;
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
