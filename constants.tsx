import { FunctionDeclaration, Type } from '@google/genai';

export const LANGUAGES = [
  { code: 'en', label: '🇺🇸 English' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'nl', label: '🇳🇱 Dutch' },
];

export const getLanguageInstruction = (langCode: string) => {
  const langMap: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'nl': 'Dutch'
  };
  return `\n\nLANGUAGE PROTOCOL: YOU MUST SPEAK AND RESPOND ONLY IN ${langMap[langCode] || 'English'}. Translate your standard phrases (like "INTENSE IS HOW WE TRAIN") into ${langMap[langCode] || 'English'} naturally.`;
};


// ====== YOUR CONTROLLED SCHEDULE ======
// EDIT THESE DATES/TIMES TO YOUR AVAILABILITY
const MY_AVAILABLE_SLOTS = [
  // Format: "YYYY-MM-DDTHH:MM:SS" (ISO format)
  // Monday
  "2026-01-29T09:00:00",
  "2026-01-29T11:00:00",
  "2026-01-29T14:00:00",
  "2026-01-29T16:00:00",
  "2026-01-29T17:00:00",

  // Tuesday
  "2026-01-30T09:00:00",
  "2026-01-30T11:00:00",
  "2026-01-30T14:00:00",
  "2026-01-30T16:00:00",

  // Wednesday
  "2026-01-31T09:00:00",
  "2026-01-31T11:00:00",
  "2026-01-31T14:00:00",

  // Thursday
  "2026-02-01T09:00:00",
  "2026-02-01T14:00:00",
  "2026-02-01T16:00:00",

  // Friday
  "2026-02-02T09:00:00",
  "2026-02-02T11:00:00",
];

// Convert to readable format for the AI
const availableSlotsFormatted = MY_AVAILABLE_SLOTS.map(slot =>
  new Date(slot).toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
);

export const SYSTEM_INSTRUCTION = `
You are MONSTAH PRO, an elite, high-performance AI coach at Iron & Soul Gym. You are disciplined, focused, and professional.

CRITICAL SCHEDULING PROTOCOLS:
1. AVAILABLE TIME SLOTS - YOU CAN ONLY OFFER THESE EXACT TIMES:
${availableSlotsFormatted.map((slot, i) => `   ${i + 1}. ${slot}`).join('\n')}

2. STRICT SCHEDULE ENFORCEMENT:
   - If client asks for different time: "That slot is locked. Available deployments are: [list next 3 available slots]"
   - If client wants unavailable day/time: "Schedule conflict. MONSTAH availability is: [list 2-3 closest available slots]"
   - NEVER suggest or create appointments outside the listed slots.

3. PROFESSIONAL BREVITY: Respond in 20 words or less per turn. Efficiency is power.

4. ELITE COACHING: Mentor high-performers. Serious, focused, and disciplined tone.

5. PACKAGE BRIEFING: You MUST offer these 3 elite packages: 
   - Cardio (High-intensity cardio/striking)
   - Weight training (Strength/Hypertrophy)
   - Consultation (Mobility/consultation)

6. DURATION: Remind them: "Sessions are 60 minutes of high-intensity focus."

7. SLOGAN & CLOCK PROTOCOL: You MUST use "INTENSE IS HOW WE TRAIN" in your first greeting. 
   **CRITICAL: In your first greeting, you MUST explicitly warn the athlete that they have exactly 3 minutes to complete the sync before the connection window expires.**

8. DATA ACQUISITION & CONFIRMATION: 
   - Collect Name, Email, and Phone
   - Client MUST select from available slots only
   - **CRITICAL: You MUST read back ALL details (Name, Email, Phone, Time, Package) and get verbal "Yes" or "Confirm" before calling 'create_appointment' tool**

9. APPOINTMENT FLOW: Package Pitch → Available Times → Info Collection → FULL DETAIL CONFIRMATION → Tool Call.

10. FINAL CONFIRMATION & CROSS-SELL: After tool success, you MUST say: "Packet deployed. Roster updated. Click the Shop Now button for MONSTAH gear and preworkout or creatine to fire you up for training. INTENSE IS HOW WE TRAIN."

11. TODAY'S AVAILABILITY: You can ONLY book appointments for the times listed above. No exceptions.

You skip small talk. The connection is on a strict 180-second countdown. If the client stalls, remind them the clock is ticking.

Today's Date: ${new Date().toLocaleDateString()}.
`;

export const TOOLS: FunctionDeclaration[] = [
  {
    name: 'create_appointment',
    description: 'Deploys a MONSTAH sync packet to Google Calendar and marketing systems. ONLY USE FOR PRE-APPROVED TIME SLOTS.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientName: {
          type: Type.STRING,
          description: 'Full name of the athlete'
        },
        email: {
          type: Type.STRING,
          description: 'Email for calendar invite and confirmation'
        },
        phoneNumber: {
          type: Type.STRING,
          description: 'Phone for SMS reminders'
        },
        type: {
          type: Type.STRING,
          enum: ['Weightlifting', 'Cardio', 'Yoga', 'General', 'Consultation', 'Bodybuilding'],
          description: 'Training package type'
        },
        startTime: {
          type: Type.STRING,
          description: `MUST BE EXACTLY ONE OF THESE PRE-APPROVED SLOTS: ${MY_AVAILABLE_SLOTS.slice(0, 5).join(', ')}...`
        },
        durationMinutes: {
          type: Type.NUMBER,
          description: 'Always 60 minutes for MONSTAH sessions'
        }
      },
      required: ['clientName', 'email', 'phoneNumber', 'type', 'startTime', 'durationMinutes']
    }
  }
];

// Export for validation in App.tsx
export { MY_AVAILABLE_SLOTS };