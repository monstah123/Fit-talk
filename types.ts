
export interface Appointment {
  id: string;
  clientName: string;
  email: string;
  phoneNumber: string;
  type: 'Weightlifting' | 'Cardio' | 'Yoga' | 'General' | 'Consultation' | 'Bodybuilding';
  startTime: string; // ISO string
  durationMinutes: number;
}

export interface TrainingState {
  appointments: Appointment[];
  isRecording: boolean;
  isModelThinking: boolean;
  lastTranscription: string;
}

export enum ToolName {
  CREATE_APPOINTMENT = 'create_appointment',
  LIST_APPOINTMENTS = 'list_appointments',
  CHECK_AVAILABILITY = 'check_availability'
}
