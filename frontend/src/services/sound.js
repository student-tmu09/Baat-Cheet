// Web Audio API based Sound Synthesizer for Call Ringtones and Beeps
// No external MP3 files needed; zero network dependency and instant playback.

let audioCtx = null;
let ringtoneInterval = null;
let dialingInterval = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

// Play a pleasant dual-tone chime
function playTone(freq1, freq2, duration, type = "sine", gainValue = 0.15) {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc1.type = type;
        osc2.type = type;
        osc1.frequency.setValueAtTime(freq1, ctx.currentTime);
        osc2.frequency.setValueAtTime(freq2, ctx.currentTime);

        gainNode.gain.setValueAtTime(gainValue, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start();
        osc2.start();

        osc1.stop(ctx.currentTime + duration);
        osc2.stop(ctx.currentTime + duration);
    } catch (err) {
        console.error("Audio playback error:", err);
    }
}

export const soundService = {
    // 1. Incoming Call Ringtone: Melodic repeated chime
    playIncomingRingtone() {
        this.stopCallSounds();
        const ctx = getAudioContext();
        if (!ctx) return;

        const playChimeSequence = () => {
            // Melodic 3-tone ring sequence
            playTone(523.25, 659.25, 0.3, "sine", 0.18); // C5 + E5
            setTimeout(() => playTone(587.33, 783.99, 0.3, "sine", 0.18), 350); // D5 + G5
            setTimeout(() => playTone(659.25, 880.00, 0.5, "sine", 0.18), 700); // E5 + A5
        };

        playChimeSequence();
        ringtoneInterval = setInterval(playChimeSequence, 2400);
    },

    // 2. Outgoing Call Dialing Tone: Soft intermittent dialing beep
    playDialingTone() {
        this.stopCallSounds();
        const ctx = getAudioContext();
        if (!ctx) return;

        const playDialTone = () => {
            playTone(440, 480, 1.2, "sine", 0.08); // Standard 440+480Hz ringback
        };

        playDialTone();
        dialingInterval = setInterval(playDialTone, 3500);
    },

    // 3. Call Ended Tone: Quick descending double beep
    playCallEndTone() {
        this.stopCallSounds();
        const ctx = getAudioContext();
        if (!ctx) return;

        playTone(480, 440, 0.15, "triangle", 0.15);
        setTimeout(() => {
            playTone(350, 300, 0.25, "triangle", 0.12);
        }, 180);
    },

    // Stop all active ringtones/dialing tones
    stopCallSounds() {
        if (ringtoneInterval) {
            clearInterval(ringtoneInterval);
            ringtoneInterval = null;
        }
        if (dialingInterval) {
            clearInterval(dialingInterval);
            dialingInterval = null;
        }
    }
};

