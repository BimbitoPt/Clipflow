// Clipflow native library.
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "clipflow", about = "Native Clipflow renderer", version, propagate_version = true, arg_required_else_help = true)]
pub struct Cli {
    #[command(subcommand)]
    pub cmd: Cmd,
}

#[derive(Subcommand)]
pub enum Cmd {
    Render {
        #[arg(long)]
        idea: String,
        #[arg(long, default_value = "mstudio")]
        pack: String,
        #[arg(long, default_value = "auto", help = "Voice engine: auto (system voice on Windows, ort elsewhere), on (ort SpeechT5 everywhere), sapi (Windows-only system voice), off (silent)")]
        voice: String,
        #[arg(long, default_value = "exports")]
        out: String,
        #[arg(long, default_value = "../public/models")]
        models: String,
        /// Pin visuals per cue with pool srcs, comma-separated, one per cue
        /// (hook, beat1, beat2, beat3, cta). Pool srcs only.
        #[arg(long)]
        cue_assets: Option<String>,
        /// Render N takes of the same idea with salted pool picks
        /// (deterministic per variant). Mutually exclusive with cue_assets.
        #[arg(long, default_value = "1", value_parser = clap::value_parser!(u32).range(1..))]
        variants: u32,
    },
    /// Persist clip ratings into the broll usage file (no render). One
    /// entry per --rate: "<pool src>=<rating>", rating -2..+2.
    Rate {
        #[arg(long = "rate")]
        entries: Vec<String>,
        #[arg(long, default_value = "../public/models")]
        models: String,
    },
}
pub mod script;
pub mod planner;
pub mod broll;
pub mod tts;
pub mod captions;
pub mod render;
