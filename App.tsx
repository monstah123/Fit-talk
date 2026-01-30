import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { SYSTEM_INSTRUCTION, TOOLS, MY_AVAILABLE_SLOTS, LANGUAGES, getLanguageInstruction } from './constants';
import { Appointment } from './types';
import { sendBookingNotification } from './emailService';

interface ImportMetaEnv {
  readonly VITE_API_KEY: string;
  readonly VITE_RESEND_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface AudioBlob {
  data: string;
  mimeType: string;
}

// Audio Helpers
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): AudioBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

const VOICES = [
  { id: 'Puck', label: 'Puck (Male) - Crisp', trait: 'crisp' },
  { id: 'Kore', label: 'Kore (Female) - Warm', trait: 'warm' },
  { id: 'Charon', label: 'Charon (Male) - Deep', trait: 'deep' },
  { id: 'Fenrir', label: 'Fenrir (Male) - Raspy', trait: 'raspy' },
  { id: 'Zephyr', label: 'Zephyr (Female) - Gentle', trait: 'gentle' },
];

const GREETINGS = [
  "MONSTAH PRO online. You have 3 minutes to complete the sync. State your name.",
  "Connection active. Sync window is 180 seconds. Let's schedule your training.",
  "IRON CLOUD ACTIVE. 3 minutes on the clock to update the roster. Details, please.",
  "MONSTAH PRO connected. Strict 3-minute deployment window starts now. Name?",
  "Roster access granted. Clock is ticking: 180 seconds. State your booking data."
];

const CONFIRM_CHIME = "https://cdn.pixabay.com/audio/2022/03/15/audio_78330a876a.mp3";
const PURGE_CHIME = "https://cdn.pixabay.com/audio/2022/03/10/audio_f3299c558c.mp3";
const SHOP_URL = "https://monstahgymwear.com/shop/";
const BANNER_IMAGE = "https://monstahgymwear.com/wp-content/uploads/2023/10/monstah-gym-wear-logo-banner.jpg";

const App: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pendingAppointment, setPendingAppointment] = useState<any>(null);
  const [stashedAppointment, setStashedAppointment] = useState<any>(null);
  const [recentlyDeleted, setRecentlyDeleted] = useState<Appointment | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [status, setStatus] = useState('MONSTAH STANDBY');
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0].code);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(180); // 3 minutes
  const [showShopHighlight, setShowShopHighlight] = useState(false);
  const [registeredAthlete, setRegisteredAthlete] = useState<string | null>(localStorage.getItem('monstah_athlete_name'));

  const isRecordingRef = useRef(false);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext; gain: GainNode } | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptRef = useRef<string[]>([]);
  const currentStreamRef = useRef<MediaStream | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRecording) {
      setCountdown(180);
      countdownIntervalRef.current = window.setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            toggleSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setCountdown(180);
    }
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isRecording]);

  useEffect(() => {
    if (recentlyDeleted) {
      const timer = setTimeout(() => setRecentlyDeleted(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [recentlyDeleted]);



  const updateTranscript = (text: string, speaker: 'User' | 'MONSTAH') => {
    const entry = `${speaker}: ${text}`;
    transcriptRef.current = [entry, ...transcriptRef.current].slice(0, 15);
    setTranscript([...transcriptRef.current]);
  };

  const toggleSession = async () => {
    if (isRecording) {
      if (sessionRef.current) sessionRef.current.close();
      if (currentStreamRef.current) currentStreamRef.current.getTracks().forEach(t => t.stop());
      isRecordingRef.current = false;
      setIsRecording(false);
      setIsSpeaking(false);
      setIsThinking(false);
      setStatus('OFFLINE');
      return;
    }

    try {
      setStatus('LINKING...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      currentStreamRef.current = stream;

      const contexts = audioContextRef.current || (() => {
        const output = new AudioContext({ sampleRate: 24000 });
        const gain = output.createGain();
        gain.gain.value = 2.5; // BOOST VOLUME 250% FOR MOBILE
        gain.connect(output.destination);
        return (audioContextRef.current = {
          input: new AudioContext({ sampleRate: 16000 }),
          output,
          gain
        });
      })();

      await contexts.input.resume();
      await contexts.output.resume();

      const apiKey = import.meta.env.VITE_API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const randomGreeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];




      const athleteContext = registeredAthlete
        ? `\nRECOGNITION PROTOCOL: You are speaking with ${registeredAthlete.toUpperCase()}. TRIGGER: As soon as you see the text "START_SESSION", you MUST immediately respond with: "WELCOME BACK, ${registeredAthlete.toUpperCase()}. READY TO BEAT YOUR LAST SESSION? INTENSE IS HOW WE TRAIN."`
        : `\nFOR THIS SESSION, START BY SAYING: "${randomGreeting} INTENSE IS HOW WE TRAIN."`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          systemInstruction: SYSTEM_INSTRUCTION + getLanguageInstruction(selectedLanguage) + athleteContext,
          tools: [{ functionDeclarations: TOOLS }],
          generationConfig: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } }
            },
          },
        },
        callbacks: {
          onopen: () => {
            isRecordingRef.current = true;
            setIsRecording(true);
            setStatus('MONSTAH LIVE');

            // Force Gemini to speak first by sending a trigger signal
            sessionPromise.then(s => {
              // @ts-ignore - Sending a text part to trigger the first turn
              s.sendRealtimeInput([{ text: "START_SESSION" }]);
            });

            const source = contexts.input.createMediaStreamSource(stream);
            const scriptProcessor = contexts.input.createScriptProcessor(4096, 1, 1);

            scriptProcessor.onaudioprocess = (e) => {
              if (isRecordingRef.current) {
                const pcm = createBlob(e.inputBuffer.getChannelData(0));
                sessionPromise.then(s => {
                  try {
                    s.sendRealtimeInput({ media: pcm });
                  } catch (e) {
                    // Ignore immediate send errors, handle in onclose
                  }
                }).catch(e => {
                  console.warn("⚠️ Connection dropped, stopping audio.");
                  isRecordingRef.current = false;
                  setIsRecording(false);
                  setStatus('CONNECTION LOST');
                });
              }
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(contexts.input.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            setIsThinking(false);

            if (msg.serverContent?.inputTranscription) {
              updateTranscript(msg.serverContent.inputTranscription.text, 'User');
            }
            if (msg.serverContent?.outputTranscription) {
              updateTranscript(msg.serverContent.outputTranscription.text, 'MONSTAH');
            }

            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              setIsSpeaking(true);
              const { output, gain } = audioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, output.currentTime);
              const buffer = await decodeAudioData(decode(audioData), output, 24000, 1);
              const source = output.createBufferSource();
              source.buffer = buffer;
              source.connect(gain);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch (e) { } });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }

            if (msg.toolCall?.functionCalls) {
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'create_appointment' && fc.args) {
                  // === VALIDATE TIME IS IN YOUR SCHEDULE ===
                  const requestedTime = fc.args.startTime as string;
                  const isValidTime = MY_AVAILABLE_SLOTS.includes(requestedTime);

                  if (!isValidTime) {
                    // REJECT - Time not in your schedule
                    console.warn('MONSTAH: Time slot rejected - not in schedule:', requestedTime);

                    // Send error back to AI
                    if (sessionRef.current) {
                      sessionRef.current.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: {
                            error: `SCHEDULE LOCKED. Available slots: ${MY_AVAILABLE_SLOTS.slice(0, 3)
                              .map(t => new Date(t).toLocaleString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              }))
                              .join(', ')}`
                          }
                        }
                      });
                    }
                    return; // Stop here, don't create appointment
                  }
                  // === END VALIDATION BLOCK ===

                  // If time IS valid, create the appointment
                  const payload = {
                    fc,
                    details: {
                      id: Math.random().toString(36).substring(2, 9),
                      clientName: fc.args.clientName as string,
                      email: fc.args.email as string,
                      phoneNumber: fc.args.phoneNumber as string,
                      type: (fc.args.type as string) || 'General',
                      startTime: fc.args.startTime as string,
                      durationMinutes: 60
                    }
                  };
                  setPendingAppointment(payload);
                  setStashedAppointment(null);
                }
              }
            }
          },
          onclose: () => {
            isRecordingRef.current = false;
            setIsRecording(false);
            setStatus('OFFLINE');
          },
          onerror: (e) => {
            console.error("Live Error", e);
            setStatus('LINK ERROR');
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error(err);
      setStatus('CONNECTION FAILED');
      // Show the verification error to the user
      alert(`Connection Error: ${err.message || JSON.stringify(err)}`);
    }
  };

  const confirmBooking = async () => {
    if (!pendingAppointment) return;
    const { fc, details } = pendingAppointment;

    setAppointments(prev => [...prev, details].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));

    if (sessionRef.current) {
      sessionRef.current.sendToolResponse({
        functionResponses: { id: fc.id, name: fc.name, response: { result: "MONSTAH packet deployed. Instruct the client to visit the Shop for gear and supplements now." } }
      });
    }

    // Send email notification to MONSTAH PRO
    sendBookingNotification(details).then(result => {
      if (result.success) {
        console.log('✅ MONSTAH PRO notified via email');
      } else {
        console.error('⚠️ Email notification failed, but booking saved locally');
      }
    });

    new Audio(CONFIRM_CHIME).play().catch(() => { });
    setShowShopHighlight(true);
    setTimeout(() => setShowShopHighlight(false), 10000);

    const description = `Athlete: ${details.clientName}\nSync Source: MONSTAH FITTALK PRO\nTarget: muscle40@gmail.com\n\n60 session time\n\nTraining Type: ${details.type}\n\nINTENSE IS HOW WE TRAIN.`;
    const gcalDetails = encodeURIComponent(description);
    const startIso = new Date(details.startTime).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const endIso = new Date(new Date(details.startTime).getTime() + 60 * 60000).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=MONSTAH:+${details.type}+Session&dates=${startIso}/${endIso}&details=${gcalDetails}&location=Iron+%26+Soul+Gym&add=muscle40@gmail.com`;

    window.open(gcal, '_blank');

    // Memory: Save athlete name for recognition
    localStorage.setItem('monstah_athlete_name', details.clientName);
    setRegisteredAthlete(details.clientName);

    setPendingAppointment(null);
    setStashedAppointment(null);
  };

  const deleteAppointment = (id: string) => {
    const item = appointments.find(a => a.id === id);
    if (item) {
      setRecentlyDeleted(item);
      setAppointments(prev => prev.filter(a => a.id !== id));
      new Audio(PURGE_CHIME).play().catch(() => { });
    }
  };

  const undoDelete = () => {
    if (recentlyDeleted) {
      setAppointments(prev => [...prev, recentlyDeleted].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
      setRecentlyDeleted(null);
    }
  };

  const stashAppointment = () => {
    setStashedAppointment(pendingAppointment);
    setPendingAppointment(null);
  };

  const restoreStashed = () => {
    setPendingAppointment(stashedAppointment);
    setStashedAppointment(null);
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#050505', color: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <style>{`
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100%); } }
        @-webkit-keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @-webkit-keyframes slideUp { from { -webkit-transform: translateY(20px); opacity: 0; } to { -webkit-transform: translateY(0); opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { -webkit-transform: translateY(0); opacity: 1; } }
        .neon-text { text-shadow: 0 0 10px #39ff14, 0 0 20px #39ff14; }
        .neon-border { border-color: #39ff14; box-shadow: 0 0 15px rgba(57, 255, 20, 0.3); }
        .bar { width: 4px; background: #39ff14; border-radius: 2px; }
        .bar-active { animation: barGrow 0.3s infinite ease-in-out alternate; }
        @keyframes barGrow { from { height: 10%; } to { height: 80%; } }
        .animate-fade-in { -webkit-animation: fadeIn 0.3s ease-out forwards; animation: fadeIn 0.3s ease-out forwards; }
        .animate-slide-up { -webkit-animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .glass-bg { background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); }
        .highlight-shop { border-color: #39ff14 !important; box-shadow: 0 0 40px rgba(57, 255, 20, 0.6) !important; z-index: 50; position: relative; }
      `}</style>

      {/* Main Content Wrapper */}
      <div className="w-full max-w-6xl px-4 sm:px-6">
        <header className="flex flex-col sm:flex-row justify-between items-center py-6 sm:py-8 border-b border-slate-900 mb-8 sm:mb-12 gap-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#39ff14] text-black rounded-lg flex items-center justify-center font-black text-xl sm:text-2xl shadow-[0_0_20px_rgba(57,255,20,0.5)]">M</div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tighter italic uppercase leading-none">
                <span className="text-[#39ff14] neon-text">MONSTAH</span> PRO
              </h1>
              <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">The AI Personal Trainer Assistant</span>
            </div>
          </div>

          <div className="flex-1 flex justify-center px-4 text-center">
            <p className="text-[10px] sm:text-[11px] font-black uppercase text-[#39ff14] opacity-80 tracking-widest animate-pulse leading-relaxed">
              OPEN IN GOOGLE CHROME TO SEE DEPLOYMENT
            </p>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto">
            <div className="flex-grow sm:flex-grow-0 flex flex-col items-end">
              <span className="text-[8px] font-black uppercase text-slate-600 mb-1 tracking-widest">Language</span>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                disabled={isRecording}
                className="w-full sm:w-auto bg-black border border-slate-800 text-[10px] font-black uppercase px-3 py-2 rounded outline-none focus:border-[#39ff14] transition-all disabled:opacity-30 mb-2"
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              <span className="text-[8px] font-black uppercase text-slate-600 mb-1 tracking-widest">Voice Core</span>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                disabled={isRecording}
                className="w-full sm:w-auto bg-black border border-slate-800 text-[10px] font-black uppercase px-3 py-2 rounded outline-none focus:border-[#39ff14] transition-all disabled:opacity-30"
              >
                {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>

            <button
              onClick={toggleSession}
              className={`px-6 sm:px-8 py-3 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all transform active:scale-95 whitespace-nowrap ${isRecording ? 'bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.4)]' : 'bg-[#39ff14] text-black shadow-[0_0_20px_rgba(57,255,20,0.4)]'}`}
            >
              {isRecording ? 'DISCONNECT' : 'INITIALIZE'}
            </button>
          </div>
        </header>

        <main className="grid lg:grid-cols-4 gap-8 mb-20">
          <div className="lg:col-span-1 space-y-8 order-2 lg:order-1">
            <div className={`glass-bg rounded-3xl p-6 sm:p-8 border-2 transition-all duration-500 flex flex-col items-center ${isRecording ? 'neon-border' : 'border-slate-800'}`}>
              <span className="text-[8px] font-black text-red-500 uppercase tracking-widest mb-2 animate-pulse">Deployment window</span>
              <div className={`text-3xl sm:text-4xl font-mono font-black mb-6 ${isRecording ? 'text-[#39ff14] animate-pulse' : 'text-slate-800'}`}>
                {formatCountdown(countdown)}
              </div>
              <div className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 flex items-center justify-center overflow-hidden mb-6 ${isSpeaking ? 'neon-border' : 'border-slate-900'}`}>
                {isSpeaking ? (
                  <div className="flex items-end justify-center gap-1 h-10 sm:h-12">
                    {[...Array(5)].map((_, i) => <div key={i} className="bar bar-active" style={{ animationDelay: `${i * 0.1}s` }}></div>)}
                  </div>
                ) : (
                  <div className="text-[9px] sm:text-[10px] font-black uppercase text-slate-700 tracking-tighter text-center px-2">
                    {isRecording ? 'LISTENING' : 'OFFLINE'}
                  </div>
                )}
                {isThinking && <div className="absolute inset-0 bg-[#39ff14]/10 animate-pulse"></div>}
              </div>
              <div className="text-center">
                <p className="text-[8px] sm:text-[9px] font-black uppercase text-slate-600 tracking-widest mb-1">Status</p>
                <p className={`text-xs sm:text-sm font-black uppercase tracking-widest ${isRecording ? 'text-[#39ff14]' : 'text-slate-400'}`}>{status}</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-8 order-1 lg:order-2">
            <div className="glass-bg rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 min-h-[300px] sm:min-h-[400px] relative">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-10 border-b border-slate-900 pb-6 gap-4">
                <div>
                  <h2 className="text-3xl sm:text-4xl font-black italic tracking-tighter uppercase leading-none">THE <span className="text-[#39ff14]">ROSTER</span></h2>
                  <span className="text-[8px] sm:text-[10px] font-black text-slate-600 uppercase tracking-widest">{appointments.length} DEPLOYED</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {stashedAppointment && !pendingAppointment && (
                    <button
                      onClick={restoreStashed}
                      className="flex items-center gap-2 bg-[#39ff14]/10 border border-[#39ff14]/30 px-4 py-2 rounded-full text-[#39ff14] text-[9px] font-black uppercase tracking-widest animate-pulse hover:bg-[#39ff14]/20 transition-all"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      RE-OPEN STASHED
                    </button>
                  )}
                  {recentlyDeleted && (
                    <button
                      onClick={undoDelete}
                      className="flex items-center gap-2 bg-red-600/10 border border-red-600/30 px-4 py-2 rounded-full text-red-500 text-[9px] font-black uppercase tracking-widest animate-pulse hover:bg-red-600/20 transition-all"
                    >
                      UNDO PURGE ({recentlyDeleted.clientName})
                    </button>
                  )}
                </div>
              </div>

              {appointments.length === 0 ? (
                <div className="h-32 sm:h-48 flex flex-col items-center justify-center opacity-10">
                  <svg className="w-10 h-10 sm:w-12 sm:h-12 mb-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19,4H18V2H16V4H8V2H6V4H5C3.89,4 3.01,4.9 3.01,6L3,20C3,21.1 3.89,22 5,22H19C20.1,22 21,21.1 21,20V6C21,4.9 20.1,4 19,4M19,20H5V10H19V20M9,14H7V12H9V14M13,14H11V12H13V14M17,14H15V12H17V14M9,18H7V16H9V18M13,18H11V16H13V18M17,18H15V16H17V18Z" /></svg>
                  <p className="font-black uppercase tracking-[0.4em] text-[8px] sm:text-[10px]">No Active Packets</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                  {appointments.map(a => (
                    <div key={a.id} className="bg-white/[0.02] border border-slate-900 p-5 sm:p-6 rounded-2xl group relative hover:border-[#39ff14]/30 transition-all border-l-4 border-l-[#39ff14]">
                      <button
                        onClick={() => deleteAppointment(a.id)}
                        className="absolute top-4 right-4 text-slate-700 hover:text-red-500 transition-colors"
                        title="Purge Packet"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>

                      <div className="flex justify-between items-start mb-4 pr-6">
                        <span className="text-[8px] sm:text-[9px] font-black bg-[#39ff14]/10 text-[#39ff14] px-2 py-1 rounded uppercase tracking-widest">{a.type}</span>
                        <span className="text-[8px] sm:text-[9px] font-black text-slate-700 uppercase">60 MIN</span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight italic mb-2">{a.clientName}</h3>
                      <div className="flex items-center gap-2 sm:gap-3 text-slate-400 text-[9px] sm:text-[10px] font-bold mb-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        {new Date(a.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                      <div className="text-[7px] sm:text-[8px] font-black uppercase text-slate-600 mt-4 pt-4 border-t border-slate-900 tracking-widest">
                        INTENSE IS HOW WE TRAIN.
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <a
              href={SHOP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`block group relative overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] bg-black border-2 border-slate-900 hover:border-[#39ff14]/50 transition-all shadow-2xl ${showShopHighlight ? 'highlight-shop' : ''}`}
            >
              <div className="aspect-[16/9] sm:aspect-[21/9] w-full flex items-center justify-center p-6 sm:p-8 relative">
                <img
                  src={BANNER_IMAGE}
                  alt="MONSTAH GYM WEAR"
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700"
                  onError={(e) => { (e.target as any).src = "https://placehold.co/1200x500/000000/39ff14?text=THE+ARMORY+MONSTAH"; }}
                />

                <div className="absolute inset-0 flex items-end justify-center pb-8 sm:pb-12 bg-black/40 group-hover:bg-black/10 transition-colors">
                  <div className="bg-[#39ff14] text-black px-8 py-3 rounded-full font-black uppercase text-xs sm:text-sm tracking-[0.2em] shadow-[0_0_30px_rgba(57,255,20,0.6)] transform group-hover:scale-110 transition-transform flex items-center gap-3">
                    SHOP NOW
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </div>
                </div>

                <div className="absolute bottom-4 left-6 sm:bottom-6 sm:left-10 text-left pointer-events-none">
                  <h3 className="text-2xl sm:text-4xl font-black italic tracking-tighter text-white uppercase leading-none mb-1 shadow-black">THE ARMORY</h3>
                  <p className="text-[8px] sm:text-[10px] font-black text-[#39ff14] uppercase tracking-[0.4em]">MONSTAH GYM WEAR</p>
                </div>
              </div>
            </a>
          </div>
        </main>
      </div>

      {/* Deployment Modal */}
      {pendingAppointment && (
        <div
          className="animate-fade-in"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            zIndex: 2147483647,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            WebkitBackdropFilter: 'blur(10px)',
            backdropFilter: 'blur(10px)',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <div
            className="animate-slide-up"
            style={{
              backgroundColor: '#0a0a0a',
              width: '100%',
              maxWidth: '500px',
              borderRadius: '32px',
              padding: '32px',
              border: '1px solid rgba(57, 255, 20, 0.3)',
              boxShadow: '0 0 50px rgba(0,0,0,0.8)',
              maxHeight: '90vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '32px', fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase', marginBottom: '8px', color: '#fff' }}>PACKET READY</h3>
              <p style={{ fontSize: '10px', fontWeight: '900', color: '#39ff14', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Deploying to Cloud Relay</p>
            </div>

            <div style={{ backgroundColor: '#050505', padding: '24px', borderRadius: '16px', border: '1px solid #1e293b', marginBottom: '32px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '9px', textTransform: 'uppercase' }}>Athlete:</span>
                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#fff' }}>{pendingAppointment.details.clientName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '9px', textTransform: 'uppercase' }}>Email:</span>
                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#fff', fontSize: '11px' }}>{pendingAppointment.details.email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#64748b', fontSize: '9px', textTransform: 'uppercase' }}>Phone:</span>
                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#fff', fontSize: '11px' }}>{pendingAppointment.details.phoneNumber}</span>
              </div>

              <div style={{ height: '1px', backgroundColor: '#1e293b', width: '100%', marginBottom: '16px' }}></div>
              <p style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#fff', fontSize: '11px', letterSpacing: '0.1em', textAlign: 'center' }}>60 MIN SESSION</p>
              <div style={{ height: '1px', backgroundColor: '#1e293b', width: '100%', marginTop: '16px', marginBottom: '16px' }}></div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <span style={{ color: '#64748b', fontSize: '9px', textTransform: 'uppercase' }}>Training Type:</span>
                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#fff' }}>{pendingAppointment.details.type}</span>
              </div>

              <p style={{ color: '#39ff14', fontWeight: '900', textAlign: 'center', fontSize: '13px', letterSpacing: '0.2em', fontStyle: 'italic' }}>INTENSE IS HOW WE TRAIN.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); stashAppointment(); }}
                style={{ padding: '16px', borderRadius: '12px', border: '1px solid #1e293b', color: '#64748b', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', cursor: 'pointer', backgroundColor: 'transparent' }}
              >
                Stash Packet
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); confirmBooking(); }}
                style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#39ff14', color: '#000', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', border: 'none', boxShadow: '0 0 20px rgba(57,255,20,0.4)' }}
              >
                Deploy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;