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
        #[arg(long, default_value = "on")]
        voice: String,
        #[arg(long, default_value = "exports")]
        out: String,
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
