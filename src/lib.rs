use zed_extension_api::{
    self as zed,
    settings::LspSettings,
    Command, LanguageServerId, Result, Worktree,
};

const SERVER_NAME: &str = "build-langserver";

/// Relative paths under $HOME where `plz` installs build_langserver.
const HOME_RELATIVE_PATHS: &[&str] = &[
    ".please/build_langserver",
    ".plz/build_langserver",
];

struct PleaseBuildExtension;

impl zed::Extension for PleaseBuildExtension {
    fn new() -> Self {
        PleaseBuildExtension
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Command> {
        // 1. User-supplied path via Zed settings:
        //
        //    "lsp": {
        //      "build-langserver": {
        //        "binary": {
        //          "path": "/custom/path/to/build_langserver"
        //        }
        //      }
        //    }
        let lsp_settings = LspSettings::for_worktree(SERVER_NAME, worktree)?;

        if let Some(binary) = lsp_settings.binary {
            if let Some(path) = binary.path {
                return Ok(Command {
                    command: path,
                    args: binary.arguments.unwrap_or_default(),
                    env: Default::default(),
                });
            }
        }

        // 2. Try PATH search first — worktree.which() works reliably in the
        //    WASM sandbox and covers the case where build_langserver is on PATH.
        if let Some(path) = worktree.which("build_langserver") {
            return Ok(Command {
                command: path,
                args: vec![],
                env: Default::default(),
            });
        }

        // 3. Try $HOME-relative default paths.
        //    We can't use std::path::Path::exists() in the WASM sandbox, so
        //    we just return the first candidate we can construct from $HOME
        //    and let Zed fail gracefully if it doesn't exist.
        let shell_env = worktree.shell_env();
        let home = shell_env
            .iter()
            .find(|(k, _)| k == "HOME")
            .map(|(_, v)| v.clone())
            .unwrap_or_default();

        if !home.is_empty() {
            // Return the first (most preferred) candidate unconditionally.
            let path = format!("{}/{}", home, HOME_RELATIVE_PATHS[0]);
            return Ok(Command {
                command: path,
                args: vec![],
                env: Default::default(),
            });
        }

        Err(
            "build_langserver not found. \
             Install Please (https://please.build) so that build_langserver \
             is at ~/.please/build_langserver, or set its path in Zed settings:\n\n\
             \"lsp\": {\n  \
               \"build-langserver\": {\n    \
                 \"binary\": { \"path\": \"/path/to/build_langserver\" }\n  \
               }\n\
             }"
            .into(),
        )
    }
}

zed::register_extension!(PleaseBuildExtension);
