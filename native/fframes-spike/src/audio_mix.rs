//! Rust port of shared/audio-mix.ts (the canonical TS model). Numbers must
//! stay pinned to the TypeScript originals — see tests at the bottom.

/// Per-cue Kokoro voiceover shaping.
pub const KOKORO_VOICE: &str = "af_heart";
/// Leave this much of each cue window unfilled so cues breathe.
pub const WINDOW_HEADROOM_SECS: f32 = 0.4;
/// Encode target peak for 16-bit PCM WAV.
pub const PEAK_TARGET: f32 = 0.89;
pub const MAX_GAIN: f32 = 8.0;

pub struct CueFit {
    pub fit_secs: f32,
    /// atempo multiplier; >1 only when the spoken audio overruns its window.
    pub tempo: f32,
}

/// Squeeze overrunning voice into its cue window; leave headroom otherwise.
pub fn cue_fit(spoken_secs: f32, window_secs: f32) -> CueFit {
    let room = window_secs - WINDOW_HEADROOM_SECS;
    if room <= 0.0 {
        return CueFit {
            fit_secs: spoken_secs.max(0.0),
            tempo: 1.0,
        };
    }
    let fit_secs = room.min(spoken_secs);
    let tempo = if spoken_secs > room {
        spoken_secs / fit_secs
    } else {
        1.0
    };
    CueFit {
        fit_secs,
        tempo,
    }
}

/// Gain that brings a PCM peak to PEAK_TARGET, capped against blowups.
pub fn peak_gain(peak: f32) -> f32 {
    if peak > 0.001 {
        (MAX_GAIN).min(PEAK_TARGET / peak)
    } else {
        1.0
    }
}

/// ffmpeg filter placing one voice input at its cue start.
pub fn voice_placement(input_index: usize, start_secs: f32, tempo: f32, label: &str) -> String {
    let chain = if tempo > 1.0 {
        format!("atempo={tempo:.4},")
    } else {
        String::new()
    };
    format!(
        "[{input_index}:a]{chain}adelay={}:all=1[{label}]",
        (start_secs * 1000.0).round() as i64
    )
}

/// amix (no normalization) + apad to the full timeline, labels [a0..aN-1].
pub fn voice_mix_tail(count: usize, total_secs: f32, out_label: &str) -> String {
    if count == 0 {
        return format!(
            "anullsrc=r=44100:cl=stereo,apad=whole_dur={total_secs}[{out_label}]"
        );
    }
    let labels: String = (0..count).map(|i| format!("[a{i}]")).collect();
    format!(
        "{labels}amix=inputs={count}:duration=longest:normalize=0[mix];[mix]apad=whole_dur={total_secs}[{out_label}]"
    )
}

/// Music-bed ducking around voice windows.
pub struct DuckPolicy {
    pub speaking: f32,
    pub idle: f32,
    /// Open the speaking window this many seconds before/after each word.
    pub lead_secs: f32,
}

pub const DUCK_STANDARD: DuckPolicy = DuckPolicy {
    speaking: 0.055,
    idle: 0.18,
    lead_secs: 0.15,
};
pub const DUCK_CREATIVE: DuckPolicy = DuckPolicy {
    speaking: 0.12,
    idle: 0.26,
    lead_secs: 0.15,
};

pub struct TimeWindow {
    pub start: f32,
    pub end: f32,
}

/// Music volume at time `t`: ducked while any voice window (±lead) is active.
pub fn music_volume_at(t: f32, voice_windows: &[TimeWindow], policy: &DuckPolicy) -> f32 {
    let speaking = voice_windows
        .iter()
        .any(|w| t >= w.start - policy.lead_secs && t < w.end + policy.lead_secs);
    if speaking {
        policy.speaking
    } else {
        policy.idle
    }
}

/// Fixed SFX and voice gains used by the Remotion soundtrack.
pub const SFX_VOICE_GAIN: f32 = 1.0;
pub const SFX_FEATURED: f32 = 0.42;
pub const SFX_SCENE_WHOOSH: f32 = 0.32;
pub const SFX_STEP_POP: f32 = 0.3;

/// Shared loudness target for produced voice tracks.
pub const LOUDNORM: &str = "I=-14:TP=-1.5:LRA=11";

pub const AMBIENT_VOLUME: f32 = 0.13;
pub const AMBIENT_HIGHPASS: u32 = 90;
pub const AMBIENT_LOWPASS: u32 = 900;

pub fn ambient_chain() -> String {
    format!(
        "volume={AMBIENT_VOLUME},highpass=f={AMBIENT_HIGHPASS},lowpass=f={AMBIENT_LOWPASS}"
    )
}

pub const MUSIC_BED_VOLUME: f32 = 0.92;
pub const MUSIC_BED_FADE_IN: f32 = 0.04;
pub const MUSIC_BED_FADE_OUT: f32 = 0.35;

pub fn music_bed_chain(total_secs: f32) -> String {
    let out_start = (total_secs - MUSIC_BED_FADE_OUT).max(0.0);
    format!(
        "volume={MUSIC_BED_VOLUME},afade=t=in:st=0:d={MUSIC_BED_FADE_IN},afade=t=out:st={out_start:.3}:d={MUSIC_BED_FADE_OUT}"
    )
}

/// Final mix limiter ceiling.
pub const MIX_LIMIT: f32 = 0.94;

pub fn limiter_chain() -> String {
    format!("alimiter=limit={MIX_LIMIT}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f32, b: f32) {
        assert!((a - b).abs() < 0.005, "{a} != {b}");
    }

    #[test]
    fn cue_fit_leaves_headroom_when_voice_fits() {
        let fit = cue_fit(3.0, 5.0);
        close(fit.fit_secs, 3.0);
        close(fit.tempo, 1.0);
    }

    #[test]
    fn cue_fit_speeds_up_only_when_voice_overruns() {
        let fit = cue_fit(6.0, 5.0);
        close(fit.fit_secs, 4.6);
        close(fit.tempo, 6.0 / 4.6);
    }

    #[test]
    fn cue_fit_never_divides_by_nonpositive_window() {
        let fit = cue_fit(1.0, 0.3);
        close(fit.fit_secs, 1.0);
        close(fit.tempo, 1.0);
    }

    #[test]
    fn peak_gain_normalizes_with_cap() {
        close(peak_gain(0.2), PEAK_TARGET / 0.2);
        close(peak_gain(0.89), 1.0);
        close(peak_gain(0.0001), 1.0);
        close(peak_gain(0.1), MAX_GAIN);
    }

    #[test]
    fn ducking_pins_remotion_numbers() {
        let windows = [TimeWindow {
            start: 2.0,
            end: 4.0,
        }];
        close(music_volume_at(3.0, &windows, &DUCK_STANDARD), 0.055);
        close(music_volume_at(1.9, &windows, &DUCK_STANDARD), 0.055);
        close(music_volume_at(4.1, &windows, &DUCK_STANDARD), 0.055);
        close(music_volume_at(5.0, &windows, &DUCK_STANDARD), 0.18);
        close(music_volume_at(1.84, &windows, &DUCK_STANDARD), 0.18);
        close(music_volume_at(3.0, &windows, &DUCK_CREATIVE), 0.12);
        close(music_volume_at(5.0, &windows, &DUCK_CREATIVE), 0.26);
    }

    #[test]
    fn ffmpeg_chains_pin_shared_strings() {
        assert_eq!(ambient_chain(), "volume=0.13,highpass=f=90,lowpass=f=900");
        assert_eq!(
            music_bed_chain(10.0),
            "volume=0.92,afade=t=in:st=0:d=0.04,afade=t=out:st=9.650:d=0.35"
        );
        assert_eq!(limiter_chain(), "alimiter=limit=0.94");
        assert_eq!(LOUDNORM, "I=-14:TP=-1.5:LRA=11");
    }

    #[test]
    fn voice_graph_pins_shared_strings() {
        assert_eq!(
            voice_placement(2, 1.25, 1.15, "a0"),
            "[2:a]atempo=1.1500,adelay=1250:all=1[a0]"
        );
        assert_eq!(
            voice_placement(0, 0.5, 1.0, "a0"),
            "[0:a]adelay=500:all=1[a0]"
        );
        assert_eq!(
            voice_mix_tail(0, 45.0, "a"),
            "anullsrc=r=44100:cl=stereo,apad=whole_dur=45[a]"
        );
        assert_eq!(
            voice_mix_tail(2, 45.0, "a"),
            "[a0][a1]amix=inputs=2:duration=longest:normalize=0[mix];[mix]apad=whole_dur=45[a]"
        );
    }
}
