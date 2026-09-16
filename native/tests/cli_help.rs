use std::process::Command;

#[test]
fn help_lists_render() {
    let out = Command::new(env!("CARGO_BIN_EXE_clipflow"))
        .arg("--help")
        .output()
        .expect("run clipflow --help");
    let text = String::from_utf8_lossy(&out.stdout);
    assert!(out.status.success());
    assert!(text.contains("render"), "help was: {text}");

    let out = Command::new(env!("CARGO_BIN_EXE_clipflow"))
        .args(["render", "--help"])
        .output()
        .expect("run clipflow render --help");
    let text = String::from_utf8_lossy(&out.stdout);
    assert!(out.status.success());
    for flag in ["--idea", "--pack", "--voice", "--out", "--models"] {
        assert!(text.contains(flag), "render help missing {flag}: {text}");
    }

    let out = Command::new(env!("CARGO_BIN_EXE_clipflow"))
        .arg("render")
        .output()
        .expect("run clipflow render without --idea");
    assert!(!out.status.success(), "render without --idea should fail");
}
