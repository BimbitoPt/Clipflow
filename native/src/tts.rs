//! SpeechT5 text-to-speech via `ort` → 16kHz mono WAV.
//!
//! Port of `TextToAudioPipeline._call_text_to_spectrogram` +
//! `SpeechT5ForTextToSpeech.generate_speech` from
//! `node_modules/@xenova/transformers`:
//! tokenize → encoder session → autoregressive `decoder_model_merged`
//! loop (past key values + speaker embeddings, stop on `prob` threshold
//! or max length) → HiFi-GAN vocoder (`spectrogram` → `waveform`) →
//! 16kHz mono i16 WAV via `hound`.

use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result, bail};
use ort::session::Session;
use ort::value::Tensor;
use serde::Deserialize;

const SAMPLE_RATE: u32 = 16000;
const NUM_MEL_BINS: usize = 80;
const DECODER_LAYERS: usize = 6;
const SPEAKER_DIM: usize = 512;
const STOP_THRESHOLD: f32 = 0.5;
const MINLEN_RATIO: f64 = 0.0;
const MAXLEN_RATIO: f64 = 20.0;
const REDUCTION_FACTOR: usize = 2;

/// Synthesize `text` with the local SpeechT5 + HiFi-GAN ONNX weights under
/// `models_dir` and write a 16000 Hz mono i16 WAV to `wav_out`.
///
/// Returns the audio duration in seconds (`samples / 16000`).
pub fn synth_to_wav(models_dir: &Path, text: &str, wav_out: &Path) -> Result<f64> {
    let encoder_path = models_dir.join("Xenova/speecht5_tts/onnx/encoder_model_quantized.onnx");
    let decoder_path =
        models_dir.join("Xenova/speecht5_tts/onnx/decoder_model_merged_quantized.onnx");
    let vocoder_path = models_dir.join("Xenova/speecht5_hifigan/onnx/model.onnx");
    let tokenizer_path = models_dir.join("Xenova/speecht5_tts/tokenizer.json");
    let speaker_path = models_dir.join("speaker_embeddings.bin");
    let gen_config_path = models_dir.join("Xenova/speecht5_tts/generation_config.json");
    for p in [&encoder_path, &decoder_path, &vocoder_path, &tokenizer_path, &speaker_path] {
        if !p.exists() {
            bail!("missing model file: {}", p.display());
        }
    }

    // Generation limits (generation_config.json is 185 bytes; we honor
    // max_length as an absolute safety cap — the per-utterance stop comes
    // from the min/maxlenratio computation below, mirroring generate_speech).
    let gen_cap: usize = std::fs::read_to_string(&gen_config_path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("max_length").and_then(|m| m.as_u64()))
        .map(|m| m as usize)
        .unwrap_or(1876);

    // Tokenize (tokenizer.json appends </s> via post-processor, matching the
    // JS `tokenizer(text, { padding: true, truncation: true })` for one input).
    //
    // The shipped tokenizer.json declares
    // `"normalizer": {"type": "Precompiled", "precompiled_charsmap": null}`.
    // tokenizers 0.20 cannot parse a null charsmap, and transformers.js
    // (tokenizers.js `Precompiled.normalize`) implements that case as the
    // default sentencepiece rule nmt_nfkc regardless of charsmap content —
    // which is exactly tokenizers-rs `Sequence(Nmt, NFKC)`. Substitute that
    // equivalent in memory and load from the patched JSON string.
    let tok_json = std::fs::read_to_string(&tokenizer_path).context("read tokenizer.json")?;
    let mut tok_value: serde_json::Value =
        serde_json::from_str(&tok_json).context("parse tokenizer.json")?;
    if tok_value
        .get("normalizer")
        .and_then(|n| n.get("type"))
        .and_then(|t| t.as_str())
        == Some("Precompiled")
        && tok_value
            .get("normalizer")
            .and_then(|n| n.get("precompiled_charsmap"))
            .map(|c| c.is_null())
            .unwrap_or(false)
    {
        tok_value["normalizer"] = serde_json::json!({
            "type": "Sequence",
            "normalizers": [{"type": "Nmt"}, {"type": "NFKC"}],
        });
    }
    // Xenova's tokenizer.json targets transformers.js' own tokenizer
    // implementation, which reads `model.vocab` directly. tokenizers 0.20
    // needs a `type` discriminator: this model is a char-level WordLevel
    // model whose unknown id is 2 ("</s>", matching `"unk_id": 2`).
    if tok_value
        .get("model")
        .and_then(|m| m.get("type"))
        .is_none()
    {
        if let Some(model) = tok_value.get_mut("model") {
            model["type"] = serde_json::Value::String("WordLevel".to_string());
            if model.get("unk_token").is_none() {
                model["unk_token"] = serde_json::Value::String("</s>".to_string());
            }
        }
    }
    let tokenizer: tokenizers::Tokenizer = serde_json::to_string(&tok_value)
        .context("reserialize tokenizer.json")?
        .parse()
        .map_err(|e| anyhow::anyhow!("tokenizer load: {e}"))?;
    let enc = tokenizer
        .encode(text, true)
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    let ids: Vec<i64> = enc.get_ids().iter().map(|&id| id as i64).collect();
    if ids.is_empty() {
        bail!("tokenizer produced no ids for input");
    }
    let enc_seq = ids.len();

    // Speaker embeddings: 512 float32 little-endian (2048 bytes).
    let raw = std::fs::read(&speaker_path).context("read speaker_embeddings.bin")?;
    if raw.len() % 4 != 0 {
        bail!("speaker_embeddings.bin length not a multiple of 4: {}", raw.len());
    }
    let speaker: Vec<f32> = raw
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();
    if speaker.len() != SPEAKER_DIM {
        bail!("expected {SPEAKER_DIM} speaker values, got {}", speaker.len());
    }

    // Encoder session: input_ids -> encoder_outputs + encoder_attention_mask.
    let mut encoder = Session::builder()?.commit_from_file(&encoder_path)?;
    let input_ids = Tensor::from_array(([1usize, enc_seq], ids))?;
    let enc_out = encoder.run(ort::inputs! {
        "input_ids" => input_ids
    })?;
    let (_, enc_hidden) = enc_out["encoder_outputs"].try_extract_tensor::<f32>()?;
    let (_, enc_mask) = enc_out["encoder_attention_mask"].try_extract_tensor::<i64>()?;
    let enc_hidden: Vec<f32> = enc_hidden.to_vec();
    let enc_mask: Vec<i64> = enc_mask.to_vec();
    drop(enc_out);

    let r = enc_seq / REDUCTION_FACTOR;
    let maxlen = ((r as f64 * MAXLEN_RATIO).floor() as usize).min(gen_cap).max(1);
    let minlen = (r as f64 * MINLEN_RATIO).floor() as usize;

    // Autoregressive decoder_merged loop.
    let mut decoder = Session::builder()?.commit_from_file(&decoder_path)?;
    let empty_kv: Vec<f32> = Vec::new();
    let mut past: HashMap<String, (Vec<i64>, Vec<f32>)> = HashMap::new();
    let mut out_seq: Vec<f32> = vec![0.0; NUM_MEL_BINS];
    let mut spectrogram: Vec<f32> = Vec::new();
    let mut mel_frames: usize = 0;

    let mut idx: usize = 0;
    let dec_output_names: Vec<String> =
        decoder.outputs().iter().map(|o| o.name().to_string()).collect();
    loop {
        idx += 1;
        let use_cache = idx > 1;

        let use_cache_t = Tensor::from_array(([1usize], vec![use_cache]))?;
        let out_seq_t = Tensor::from_array((
            [1usize, (out_seq.len() / NUM_MEL_BINS), NUM_MEL_BINS],
            out_seq.clone(),
        ))?;
        let enc_hidden_t = Tensor::from_array(([1usize, enc_seq, 768usize], enc_hidden.clone()))?;
        let enc_mask_t = Tensor::from_array(([1usize, enc_seq], enc_mask.clone()))?;
        let speaker_t = Tensor::from_array(([1usize, SPEAKER_DIM], speaker.clone()))?;

        let mut inputs = ort::inputs! {
            "use_cache_branch" => use_cache_t,
            "output_sequence" => out_seq_t,
            "encoder_attention_mask" => enc_mask_t,
            "speaker_embeddings" => speaker_t,
            "encoder_hidden_states" => enc_hidden_t,
        };
        for layer in 0..DECODER_LAYERS {
            for part in ["encoder", "decoder"] {
                for kv in ["key", "value"] {
                    let name = format!("past_key_values.{layer}.{part}.{kv}");
                    let (shape, data) = past.get(&name).cloned().unwrap_or_else(|| {
                        (vec![1, 12, 0, 64], empty_kv.clone())
                    });
                    let shape_usize: Vec<usize> =
                        shape.iter().map(|&d| d as usize).collect();
                    let t = Tensor::from_array((shape_usize, data))?;
                    inputs.push((name.into(), t.into()));
                }
            }
        }

        let dec_out = decoder.run(inputs)?;

        let (spec_shape, spec_data) = dec_out["spectrum"].try_extract_tensor::<f32>()?;
        debug_assert_eq!(spec_shape[spec_shape.len() - 1], NUM_MEL_BINS as i64);
        let frames = spec_data.len() / NUM_MEL_BINS;
        spectrogram.extend_from_slice(spec_data);
        mel_frames += frames;

        let (_, prob_data) = dec_out["prob"].try_extract_tensor::<f32>()?;
        let stop_prob = prob_data.iter().any(|&p| p >= STOP_THRESHOLD);

        let (o_shape, o_data) = dec_out["output_sequence_out"].try_extract_tensor::<f32>()?;
        debug_assert_eq!(o_shape[o_shape.len() - 1], NUM_MEL_BINS as i64);
        out_seq = o_data.to_vec();

        // Past key values for the next step. Mirror transformers.js
        // getPastKeyValues: encoder presents are constant (optimum reuse
        // optimization), so keep the first step's encoder KV.
        for out in &dec_output_names {
            if let Some(rest) = out.strip_prefix("present.") {
                let past_name = format!("past_key_values.{rest}");
                if past.contains_key(&past_name) && past_name.contains(".encoder.") {
                    continue;
                }
                let (shape, data) = dec_out[out.as_str()].try_extract_tensor::<f32>()?;
                past.insert(past_name, (shape.to_vec(), data.to_vec()));
            }
        }
        drop(dec_out);

        if idx >= minlen && (stop_prob || idx >= maxlen) {
            break;
        }
        if idx >= gen_cap {
            break;
        }
    }

    if mel_frames == 0 {
        bail!("decoder produced no mel frames");
    }

    // Vocoder: mel spectrogram -> waveform at 16000 Hz.
    let mut vocoder = Session::builder()?.commit_from_file(&vocoder_path)?;
    let mel_t = Tensor::from_array(([mel_frames, NUM_MEL_BINS], spectrogram))?;
    let voc_out = vocoder.run(ort::inputs! {
        "spectrogram" => mel_t
    })?;
    let (_, wave) = voc_out["waveform"].try_extract_tensor::<f32>()?;
    let wave: Vec<f32> = wave.to_vec();
    drop(voc_out);

    write_wav_16k_mono(wav_out, &wave)
}

/// A SAPI `SpeakProgress` word onset: `word_index` into the cue's
/// whitespace-split tokens, `start_secs` since cue start.
#[derive(Debug, Clone, Copy)]
pub struct CueWordTime {
    pub word_index: usize,
    pub start_secs: f64,
}

#[derive(Deserialize)]
struct SapiEvent {
    pos: usize,
    #[allow(dead_code)]
    len: usize,
    #[serde(rename = "audioMs")]
    audio_ms: i64,
}

/// Windows SAPI synthesis of ONE cue to 16kHz mono WAV with real word
/// onset times (David voice, rate -1 — the proven social VO).
///
/// Runs powershell `System.Speech` with a `SpeakProgress` subscription that
/// dumps JSON events beside the wav; maps character positions to word
/// indices (ASCII text: .NET UTF-16 units == bytes). First event wins per
/// word; words without events are absent (caller interpolates).
/// Returns wav duration + times. On non-Windows always fails.
pub fn synth_sapi_cue(
    text: &str,
    wav_out: &Path,
) -> Result<(f64, Vec<CueWordTime>)> {
    if !cfg!(windows) {
        bail!("sapi is Windows-only");
    }
    if let Some(parent) = wav_out.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let json_out = wav_out.with_extension("wordtimes.json");
    // Single quotes inside -Command: double them for PowerShell escaping.
    let ps_text = text.replace('\'', "''");
    let wav_str = wav_out.to_string_lossy().replace('\'', "''");
    let json_str = json_out.to_string_lossy().replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName System.Speech; \
         $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
         $s.SelectVoice('Microsoft David Desktop'); \
         $s.Rate = -1; \
         $f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono); \
         $s.SetOutputToWaveFile('{wav_str}', $f); \
         $ev = New-Object System.Collections.ArrayList; \
         $sub = Register-ObjectEvent -InputObject $s -EventName SpeakProgress -Action {{ \
           $e = $Event.SourceEventArgs; \
           $null = $ev.Add(@{{ pos = $e.CharacterPosition; len = $e.CharacterCount; audioMs = [int]$e.AudioPosition.TotalMilliseconds }}); \
         }}; \
         $s.Speak('{ps_text}'); \
         Unregister-Event -SubscriptionId $sub.Id; \
         $s.Dispose(); \
         ConvertTo-Json -InputObject @($ev.ToArray()) -Compress | Set-Content '{json_str}';"
    );
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .status()
        .context("launch powershell for SAPI cue synthesis")?;
    if !status.success() {
        bail!("SAPI cue synthesis failed with {status}");
    }
    let raw = std::fs::read_to_string(&json_out).context("read SAPI wordtimes")?;
    let events: Vec<SapiEvent> = serde_json::from_str(&raw).context("parse SAPI wordtimes")?;
    // SAPI CharacterPosition uses UTF-16 offsets, not UTF-8 byte offsets.
    let mut spans: Vec<(usize, usize)> = Vec::new();
    let mut p = 0usize;
    for w in text.split_whitespace() {
        let rel = text[p..].find(w).unwrap_or(0);
        let a = p + rel;
        let utf16_start = text[..a].encode_utf16().count();
        spans.push((utf16_start, utf16_start + w.encode_utf16().count()));
        p = a + w.len();
    }
    let mut seen = std::collections::HashSet::new();
    let mut times = Vec::new();
    for e in events {
        if let Some(k) = spans
            .iter()
            .position(|&(a, b)| a <= e.pos && e.pos < b)
        {
            if seen.insert(k) {
                times.push(CueWordTime {
                    word_index: k,
                    start_secs: e.audio_ms as f64 / 1000.0,
                });
            }
        }
    }
    // Event delivery order is not guaranteed; restore word order.
    times.sort_by_key(|t| t.word_index);
    let reader = hound::WavReader::open(wav_out).context("read SAPI cue wav")?;
    let dur = reader.len() as f64 / SAMPLE_RATE as f64;
    Ok((dur, times))
}

/// Windows SAPI synthesis to 16kHz mono WAV (the `--voice sapi` path).
///
/// On non-Windows targets this always fails with a `sapi is Windows-only`
/// error.
pub fn synth_sapi_to_wav(text: &str, wav_out: &Path) -> Result<f64> {
    if !cfg!(windows) {
        bail!("sapi is Windows-only");
    }
    if let Some(parent) = wav_out.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    // PowerShell + System.Speech at exactly 16kHz / 16-bit / mono.
    let ps_text = text.replace('\'', "''");
    let out_str = wav_out.to_string_lossy().replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName System.Speech; \
         $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
         $f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono); \
         $s.SetOutputToWaveFile('{out_str}', $f); \
         $s.Speak('{ps_text}'); \
         $s.Dispose();"
    );
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .status()
        .context("launch powershell for SAPI synthesis")?;
    if !status.success() {
        bail!("SAPI powershell synthesis failed with {status}");
    }
    let reader = hound::WavReader::open(wav_out).context("read SAPI wav")?;
    let n = reader.len() as f64;
    Ok(n / SAMPLE_RATE as f64)
}

fn write_wav_16k_mono(wav_out: &Path, wave: &[f32]) -> Result<f64> {    if let Some(parent) = wav_out.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(wav_out, spec)?;
    for &s in wave {
        let clamped = s.clamp(-1.0, 1.0);
        writer.write_sample((clamped * 32767.0) as i16)?;
    }
    writer.finalize()?;
    Ok(wave.len() as f64 / SAMPLE_RATE as f64)
}

/// Concatenate same-spec 16kHz mono i16 WAVs (per-cue SAPI outputs) into
/// one file. Returns total duration. Bails on spec mismatch.
pub fn concat_wavs_16k_mono(inputs: &[std::path::PathBuf], out: &Path) -> Result<f64> {
    if let Some(parent) = out.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(out, spec)?;
    let mut total = 0u32;
    for inp in inputs {
        let mut reader = hound::WavReader::open(inp)
            .with_context(|| format!("read cue wav {}", inp.display()))?;
        anyhow::ensure!(
            reader.spec().channels == 1
                && reader.spec().sample_rate == SAMPLE_RATE
                && reader.spec().bits_per_sample == 16,
            "cue wav spec mismatch in {}: {:?}",
            inp.display(),
            reader.spec()
        );
        for s in reader.samples::<i16>() {
            writer.write_sample(s?)?;
            total += 1;
        }
    }
    writer.finalize()?;
    Ok(total as f64 / SAMPLE_RATE as f64)
}
