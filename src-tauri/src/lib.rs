use tauri_plugin_sql::{Migration, MigrationKind};

fn migrations() -> Vec<Migration> {
  vec![
    Migration {
      version: 1,
      description: "schema initial",
      sql: include_str!("../migrations/001_init.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "joueurs ecartes par tactique",
      sql: include_str!("../migrations/002_tactic_excluded.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "photo des joueurs",
      sql: include_str!("../migrations/003_player_photo.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 4,
      description: "cache des photos",
      sql: include_str!("../migrations/004_photo_cache.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "club et pret des joueurs",
      sql: include_str!("../migrations/005_player_club_loan.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 6,
      description: "clubs geres et logos",
      sql: include_str!("../migrations/006_clubs.sql"),
      kind: MigrationKind::Up,
    },
  ]
}

/// Seuls ces hôtes peuvent être interrogés (recherche Transfermarkt et photos).
const ALLOWED_PREFIXES: [&str; 2] = [
  "https://www.transfermarkt.com/",
  "https://img.a.transfermarkt.technology/",
];

/// Télécharge une page ou une image Transfermarkt (le webview ne peut pas, à cause du CORS).
#[tauri::command]
async fn transfermarkt_get(url: String) -> Result<tauri::ipc::Response, String> {
  if !ALLOWED_PREFIXES.iter().any(|p| url.starts_with(p)) {
    return Err(format!("URL non autorisée : {url}"));
  }
  let client = reqwest::Client::builder()
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
    .timeout(std::time::Duration::from_secs(15))
    .build()
    .map_err(|e| e.to_string())?;
  let res = client
    .get(&url)
    .header("Accept-Language", "en-US,en;q=0.9")
    .send()
    .await
    .map_err(|e| e.to_string())?;
  if !res.status().is_success() {
    return Err(format!("HTTP {}", res.status()));
  }
  let bytes = res.bytes().await.map_err(|e| e.to_string())?;
  Ok(tauri::ipc::Response::new(bytes.to_vec()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![transfermarkt_get])
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:fm27.db", migrations())
        .build(),
    )
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
