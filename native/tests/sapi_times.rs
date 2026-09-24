#[test]
fn sapi_single_word_and_unicode_cues() {
    if !cfg!(windows) { return; }
    for (i, text) in ["Hello", "Café opens today."].iter().enumerate() {
        let out = std::env::temp_dir().join(format!("clipflow-sapi-edge-{i}.wav"));
        let (dur, times) = clipflow::tts::synth_sapi_cue(text, &out).expect("edge cue");
        assert!(dur > 0.0);
        assert!(!times.is_empty());
        assert!(times.iter().all(|word| word.word_index < text.split_whitespace().count()));
    }
}

#[test]
fn sapi_cue_word_times() {
    if !cfg!(windows) {
        return;
    }
    let out = std::env::temp_dir().join("clipflow-sapi-times-fixture.wav");
    let (dur, times) =
        clipflow::tts::synth_sapi_cue("Link in bio. Fixed price.", &out).expect("sapi cue");
    assert!(dur > 1.0, "duration was {dur}");
    assert!(!times.is_empty());
    assert!(times[0].start_secs < 1.0, "first onset {:?}", times[0]);
    assert!(times.windows(2).all(|w| w[1].start_secs >= w[0].start_secs));
    assert!(times.windows(2).all(|w| w[1].word_index > w[0].word_index));
    // 5 tokens; SAPI may merge/split a couple of boundaries.
    assert!(
        (3..=7).contains(&times.len()),
        "timed {} words",
        times.len()
    );
}
