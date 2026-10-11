export type WaitlistType = 'student' | 'shop';

export interface StudentWaitlistData {
  type: 'student';
  fullName: string;
  whatsappNumber: string;
  email?: string;
  faculty: string;
  level: string;
  hostelArea?: string;
  printsMost: string[];
  currentPrintMethod: string;
  referrer?: string;
}

export interface ShopWaitlistData {
  type: 'shop';
  shopName: string;
  ownerName: string;
  whatsappNumber: string;
  location: string;
  printerModels: string;
  computerOS: string;
  internetType: string;
  dailyVolume: number;
  pricePerPage: number;
  operatingHours: string;
  whyJoin?: string;
  referrer?: string;
}

export type WaitlistData = StudentWaitlistData | ShopWaitlistData;

export interface WaitlistResponse {
  success: boolean;
  message: string;
  position?: number;
  isEarlyBird?: boolean;
  discountPercent?: number;
}

export interface FormErrors {
  [key: string]: string;
}

export interface FormState<T> {
  data: Partial<T>;
  errors: FormErrors;
  isSubmitting: boolean;
  isSubmitted: boolean;
  submitError?: string;
}

export interface FacultyOption {
  value: string;
  label: string;
}

export interface LevelOption {
  value: string;
  label: string;
}

export interface LocationOption {
  value: string;
  label: string;
}

export interface OSOption {
  value: string;
  label: string;
}

export interface InternetOption {
  value: string;
  label: string;
}

export const FACULTY_OPTIONS: FacultyOption[] = [
  { value: 'arts', label: 'Arts' },
  { value: 'science', label: 'Science' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'law', label: 'Law' },
  { value: 'medicine', label: 'Medicine' },
  { value: 'management', label: 'Management Sciences' },
  { value: 'social-sciences', label: 'Social Sciences' },
  { value: 'education', label: 'Education' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'veterinary', label: 'Veterinary Medicine' },
  { value: 'other', label: 'Other' },
];

export const LEVEL_OPTIONS: LevelOption[] = [
  { value: '100', label: '100 Level' },
  { value: '200', label: '200 Level' },
  { value: '300', label: '300 Level' },
  { value: '400', label: '400 Level' },
  { value: '500', label: '500 Level' },
  { value: 'postgrad', label: 'Postgraduate' },
];

export const LOCATION_OPTIONS: LocationOption[] = [
  { value: 'main-gate', label: 'Main Gate Area' },
  { value: 'senate-building', label: 'Senate Building' },
  { value: 'faculty-science', label: 'Faculty of Science' },
  { value: 'faculty-engineering', label: 'Faculty of Engineering' },
  { value: 'faculty-arts', label: 'Faculty of Arts' },
  { value: 'faculty-law', label: 'Faculty of Law' },
  { value: 'faculty-medicine', label: 'Faculty of Medicine' },
  { value: 'faculty-management', label: 'Faculty of Management Sciences' },
  { value: 'faculty-education', label: 'Faculty of Education' },
  { value: 'faculty-agriculture', label: 'Faculty of Agriculture' },
  { value: 'faculty-veterinary', label: 'Faculty of Veterinary Medicine' },
  { value: 'mini-campus', label: 'Mini Campus' },
  { value: 'gwagwalada', label: 'Gwagwalada Campus' },
  { value: 'main-hostel', label: 'Main Campus Hostels' },
  { value: 'off-campus-kubwa', label: 'Off-Campus (Kubwa)' },
  { value: 'off-campus-gwagwalada', label: 'Off-Campus (Gwagwalada)' },
  { value: 'other', label: 'Other' },
];

export const OS_OPTIONS: OSOption[] = [
  { value: 'windows-10', label: 'Windows 10' },
  { value: 'windows-11', label: 'Windows 11' },
  { value: 'linux-ubuntu', label: 'Linux (Ubuntu/Mint)' },
  { value: 'linux-other', label: 'Linux (Other)' },
  { value: 'other', label: 'Other' },
];

export const INTERNET_OPTIONS: InternetOption[] = [
  { value: 'fiber', label: 'Fiber' },
  { value: '4g-mifi', label: '4G MiFi' },
  { value: 'mobile-hotspot', label: 'Mobile Hotspot' },
  { value: 'shared', label: 'Shared/Neighbor' },
  { value: 'other', label: 'Other' },
];

export const PRINT_METHOD_OPTIONS = [
  { value: 'cyber-cafe', label: 'Cyber Cafe' },
  { value: 'faculty-press', label: 'Faculty Press/Print Shop' },
  { value: 'friend-laptop', label: 'Friend\'s Laptop' },
  { value: 'town', label: 'Town (Off-Campus)' },
  { value: 'other', label: 'Other' },
];

export const PRINTS_MOST_OPTIONS = [
  { value: 'assignments', label: 'Assignments' },
  { value: 'thesis', label: 'Thesis/Projects' },
  { value: 'past-questions', label: 'Past Questions' },
  { value: 'id-cards', label: 'ID Cards/Documents' },
  { value: 'cv', label: 'CV/Resumes' },
  { value: 'other', label: 'Other' },
];