use std::path::PathBuf;

#[test]
fn synth_fixture_produces_16k_wav() {
    let models = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/models");
    let out = std::env::temp_dir().join("clipflow-tts-fixture.wav");
    let dur = clipflow::tts::synth_to_wav(&models, "Does your site load in under a second?", &out).expect("synth");
    assert!(out.exists());
    let r = hound::WavReader::open(&out).unwrap();
    assert_eq!(r.spec().sample_rate, 16000);
    assert_eq!(r.spec().channels, 1);
    assert!(dur > 1.0, "duration was {dur}");
}
