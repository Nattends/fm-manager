//! Lecture d'une sauvegarde FM27 (.fm) : frames zstd concaténées, puis fiches joueurs et clubs.
//! Format déduit par rétro-ingénierie (les octets bruts sont interprétés côté TypeScript, src/domain/fmSave.ts).

use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const ZSTD_MAGIC: [u8; 4] = [0x28, 0xb5, 0x2f, 0xfd];
/// Date vide de FM : jour 1 de 1900 (`01 00 6C 07`).
const EMPTY_DATE: [u8; 4] = [1, 0, 0x6c, 0x07];
const NONE: u32 = 0xffff_ffff;

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameDate {
  /// Jour de l'année (1 = 1er janvier).
  pub day: u16,
  pub year: u16,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveClub {
  pub id: u32,
  pub name: String,
  pub short_name: String,
  pub nation: u32,
  /// Joueurs de l'équipe première.
  pub players: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveSummary {
  pub manager: String,
  /// Club géré par le joueur humain (null si introuvable).
  pub managed_club_id: Option<u32>,
  pub game_date: Option<GameDate>,
  pub clubs: Vec<SaveClub>,
  pub total_players: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SavePlayer {
  pub name: String,
  pub first_name: String,
  pub last_name: String,
  pub birth: GameDate,
  pub nation: u32,
  /// Familiarité aux 15 postes (1-20) : GK, SW, DL, DC, DR, DM, ML, MC, MR, AML, AMC, AMR, ST, WBL, WBR.
  pub positions: Vec<u8>,
  /// 54 valeurs 1-100 : 47 attributs, les deux pieds et 5 valeurs cachées.
  pub values: Vec<u8>,
  pub contract_end: Option<GameDate>,
  /// Prêté par ce club à un autre (club d'accueil dans `host_club`).
  pub on_loan: bool,
  pub host_club: String,
}

/// Fiche joueur repérée dans la sauvegarde décompressée.
struct RawPlayer {
  block: usize,
  marker: usize,
  name: String,
  first_name: String,
  last_name: String,
  birth: GameDate,
  nation: u32,
  positions: Vec<u8>,
  values: Vec<u8>,
  team: u32,
  /// Équipes des contrats, dans l'ordre (le premier est avec le club propriétaire).
  contracts: Vec<(u32, Option<GameDate>)>,
}

struct RawClub {
  id: u32,
  name: String,
  short_name: String,
  nation: u32,
  /// Équipes du club : la première est l'équipe A, les suivantes les équipes de jeunes.
  teams: Vec<u32>,
}

pub struct ParsedSave {
  players: Vec<RawPlayer>,
  clubs: Vec<RawClub>,
  manager: String,
  managed_club_id: Option<u32>,
  game_date: Option<GameDate>,
}

/// Dernière sauvegarde lue (chemin, résultat) : la lecture prend plusieurs secondes.
static CACHE: Mutex<Option<(String, Arc<ParsedSave>)>> = Mutex::new(None);

fn u16_at(d: &[u8], p: usize) -> u16 {
  u16::from_le_bytes([d[p], d[p + 1]])
}

fn u32_at(d: &[u8], p: usize) -> u32 {
  u32::from_le_bytes([d[p], d[p + 1], d[p + 2], d[p + 3]])
}

/// Les 9 bits de poids faible portent le jour ; certains champs y ajoutent des drapeaux.
fn date_at(d: &[u8], p: usize) -> GameDate {
  GameDate { day: u16_at(d, p) & 0x1ff, year: u16_at(d, p + 2) }
}

/// Décompresse toutes les frames zstd du fichier et les concatène.
pub fn decompress(file: &[u8]) -> Result<Vec<u8>, String> {
  // une sauvegarde se décompresse en environ 4 fois sa taille
  let mut out = Vec::with_capacity(file.len() * 9 / 2);
  let mut pos = find(file, &ZSTD_MAGIC, 0).ok_or("aucune donnée compressée : ce n'est pas une sauvegarde FM")?;
  while pos < file.len() {
    if file[pos..].starts_with(&ZSTD_MAGIC) {
      if let Ok(size) = zstd::zstd_safe::find_frame_compressed_size(&file[pos..]) {
        if let Ok(part) = zstd::stream::decode_all(&file[pos..pos + size]) {
          out.extend_from_slice(&part);
          pos += size;
          continue;
        }
      }
    }
    match find(file, &ZSTD_MAGIC, pos + 1) {
      Some(next) => pos = next,
      None => break,
    }
  }
  if out.is_empty() {
    return Err("sauvegarde illisible (décompression)".into());
  }
  Ok(out)
}

fn find(hay: &[u8], needle: &[u8], from: usize) -> Option<usize> {
  if from >= hay.len() {
    return None;
  }
  hay[from..].windows(needle.len()).position(|w| w == needle).map(|i| i + from)
}

/// Tables de noms : suites `[id u32][longueur u32][texte]` à id consécutifs depuis 0.
/// Dans l'ordre du fichier : prénoms, noms, noms d'usage.
fn name_tables(d: &[u8]) -> Vec<Vec<String>> {
  let entry = |p: usize| -> Option<(u32, usize, usize)> {
    if p + 8 > d.len() {
      return None;
    }
    let len = u32_at(d, p + 4) as usize;
    if len == 0 || len > 120 || p + 8 + len > d.len() {
      return None;
    }
    Some((u32_at(d, p), p + 8, len))
  };
  let mut tables = Vec::new();
  let mut p = 0;
  while p + 16 < d.len() && tables.len() < 3 {
    if u32_at(d, p) != 0 {
      p += 1;
      continue;
    }
    let Some((_, start, len)) = entry(p) else {
      p += 1;
      continue;
    };
    let mut names = vec![String::from_utf8_lossy(&d[start..start + len]).into_owned()];
    let mut q = start + len;
    while let Some((id, s, l)) = entry(q) {
      if id as usize != names.len() {
        break;
      }
      names.push(String::from_utf8_lossy(&d[s..s + l]).into_owned());
      q = s + l;
    }
    if names.len() >= 1000 {
      tables.push(names);
      p = q;
    } else {
      p += 1;
    }
  }
  tables
}

/// Bloc joueur : 15 octets de postes (1-20), 54 valeurs (1-100), puis 4 + 1 octets, une date et une date vide.
fn is_block(d: &[u8], p: usize) -> bool {
  if p + 82 > d.len() || d[p + 81] != 0x07 || d[p + 78..p + 82] != EMPTY_DATE {
    return false;
  }
  d[p..p + 15].iter().all(|&v| (1..=20).contains(&v)) && d[p + 15..p + 69].iter().all(|&v| (1..=100).contains(&v))
}

/// Repère qui suit le nom et la date de naissance : `00 00 00 03 01 <nation> 00×7`.
fn next_marker(d: &[u8], from: usize) -> Option<usize> {
  let end = (from + 4000).min(d.len().saturating_sub(16));
  (from..end).find(|&q| {
    d[q] == 0 && d[q + 1] == 0 && d[q + 2] == 0 && d[q + 3] == 3 && d[q + 4] == 1 && d[q + 6..q + 13].iter().all(|&v| v == 0)
  })
}

/// Contrats : `01 00 6C 07 00 [u32][équipe u32] 00×4 [u32] 01 0B 00`, fin de contrat 38 octets avant.
fn contracts_between(d: &[u8], from: usize, to: usize) -> Vec<(u32, Option<GameDate>)> {
  let mut out = Vec::new();
  let to = to.min(d.len().saturating_sub(24));
  for q in from.max(40)..to {
    if d[q..q + 4] == EMPTY_DATE
      && d[q + 13..q + 17] == [0, 0, 0, 0]
      && d[q + 21..q + 24] == [1, 11, 0]
    {
      let end = date_at(d, q - 38);
      let end = (end.year > 1900 && end.day >= 1 && end.day <= 366).then_some(end);
      out.push((u32_at(d, q + 9), end));
    }
  }
  out
}

fn parse_players(d: &[u8], names: &[Vec<String>]) -> Vec<RawPlayer> {
  let name_of = |t: usize, id: u32| names.get(t).and_then(|n| n.get(id as usize)).cloned();
  let mut found = Vec::new();
  let mut p = 8;
  while p + 100 < d.len() {
    if !is_block(d, p) {
      p += 1;
      continue;
    }
    let Some(m) = next_marker(d, p + 69) else {
      p += 1;
      continue;
    };
    // [prénom u32][0][nom u32][0][nom d'usage u32][0][longueur u32][nom légal][jour u16][année u16][5 octets] repère
    let legal = (0..=120usize).find(|&k| {
      let lp = m.wrapping_sub(13 + k);
      lp >= 16 && u32_at(d, lp) as usize == k && d[lp - 1] == 0 && d[lp - 6] == 0 && d[lp - 11] == 0
    });
    if let Some(k) = legal {
      let lp = m - 13 - k;
      let first = name_of(0, u32_at(d, lp - 15)).unwrap_or_default();
      let last = name_of(1, u32_at(d, lp - 10)).unwrap_or_default();
      let common = u32_at(d, lp - 5);
      let name = match (common != NONE).then(|| name_of(2, common)).flatten() {
        Some(n) => n,
        None => format!("{first} {last}").trim().to_string(),
      };
      found.push(RawPlayer {
        block: p,
        marker: m,
        name,
        first_name: first,
        last_name: last,
        birth: date_at(d, m - 9),
        nation: u32::from(d[m + 5]),
        positions: d[p..p + 15].to_vec(),
        values: d[p + 15..p + 69].to_vec(),
        team: u32_at(d, p - 8),
        contracts: Vec::new(),
      });
    }
    p += 69;
  }
  // contrats : entre le bloc et la fiche suivante
  for i in 0..found.len() {
    let from = found[i].block + 69;
    let to = found.get(i + 1).map_or(found[i].marker + 4000, |n| n.block);
    found[i].contracts = contracts_between(d, from, to);
  }
  found
}

/// Fiches club : `[id u32][uid u32][uid u32][0][nation u32][FFFFFFFF][nation][nation][u32][2 octets 00 10 FF FF][nom][nom court]`,
/// puis plus loin `00 FF 00 n` suivi des n équipes du club.
fn parse_clubs(d: &[u8]) -> Vec<RawClub> {
  let mut clubs: Vec<(usize, RawClub)> = Vec::new();
  let mut i = 0;
  while i + 64 < d.len() {
    if d[i + 35..i + 39] != [0, 16, 255, 255] || u32_at(d, i + 4) != u32_at(d, i + 8) || d[i + 12] != 0 || u32_at(d, i + 17) != NONE {
      i += 1;
      continue;
    }
    let len = u32_at(d, i + 39) as usize;
    if len == 0 || len > 120 || i + 47 + len > d.len() {
      i += 1;
      continue;
    }
    let len2 = u32_at(d, i + 43 + len) as usize;
    let short = if len2 <= 120 && i + 47 + len + len2 <= d.len() {
      String::from_utf8_lossy(&d[i + 47 + len..i + 47 + len + len2]).into_owned()
    } else {
      String::new()
    };
    let club = RawClub {
      id: u32_at(d, i),
      name: String::from_utf8_lossy(&d[i + 43..i + 43 + len]).into_owned(),
      short_name: short,
      nation: u32_at(d, i + 13),
      teams: Vec::new(),
    };
    clubs.push((i, club));
    i += 43 + len;
  }
  for k in 0..clubs.len() {
    let start = clubs[k].0 + 43;
    let end = clubs.get(k + 1).map_or(start + 20000, |c| c.0).min(start + 20000).min(d.len() - 8);
    for q in start..end {
      if d[q] != 0 || d[q + 1] != 255 || d[q + 2] != 0 {
        continue;
      }
      let n = d[q + 3] as usize;
      if !(1..=12).contains(&n) || q + 4 + n * 4 > d.len() {
        continue;
      }
      let teams: Vec<u32> = (0..n).map(|t| u32_at(d, q + 4 + t * 4)).collect();
      if teams.iter().all(|&t| t < 1_000_000) {
        clubs[k].1.teams = teams;
        break;
      }
    }
  }
  clubs.into_iter().map(|(_, c)| c).collect()
}

/// En-tête : `[longueur][nom du manager][longueur][nom du club][u32][date du jeu]`, dans les premiers Ko.
fn parse_header(d: &[u8], clubs: &[RawClub]) -> (String, Option<u32>, Option<GameDate>) {
  // un même nom peut revenir dans d'autres fiches : on garde le premier club qui a des équipes
  let mut names: HashMap<&str, u32> = HashMap::new();
  for c in clubs.iter().filter(|c| !c.teams.is_empty()) {
    names.entry(c.name.as_str()).or_insert(c.id);
  }
  let limit = d.len().min(200_000);
  let text = |p: usize| -> Option<(String, usize)> {
    if p + 4 > limit {
      return None;
    }
    let len = u32_at(d, p) as usize;
    if !(2..=80).contains(&len) || p + 4 + len > limit {
      return None;
    }
    let s = std::str::from_utf8(&d[p + 4..p + 4 + len]).ok()?;
    s.chars().all(|c| !c.is_control()).then(|| (s.to_string(), p + 4 + len))
  };
  for p in 0..limit {
    let Some((manager, after)) = text(p) else { continue };
    let Some((club, end)) = text(after) else { continue };
    let Some(&id) = names.get(club.as_str()) else { continue };
    if end + 8 > limit {
      continue;
    }
    let date = date_at(d, end + 4);
    let date = (date.year >= 2000 && date.year < 2200 && date.day >= 1).then_some(date);
    return (manager, Some(id), date);
  }
  (String::new(), None, None)
}

pub fn parse(file: &[u8]) -> Result<ParsedSave, String> {
  let d = decompress(file)?;
  let names = name_tables(&d);
  if names.len() < 3 {
    return Err("tables de noms introuvables dans la sauvegarde".into());
  }
  let players = parse_players(&d, &names);
  let clubs = parse_clubs(&d);
  let (manager, managed_club_id, game_date) = parse_header(&d, &clubs);
  Ok(ParsedSave { players, clubs, manager, managed_club_id, game_date })
}

impl ParsedSave {
  fn team_owner(&self) -> HashMap<u32, usize> {
    let mut owner = HashMap::new();
    for (i, c) in self.clubs.iter().enumerate() {
      for &t in &c.teams {
        owner.entry(t).or_insert(i);
      }
    }
    owner
  }

  pub fn summary(&self) -> SaveSummary {
    let mut counts: HashMap<u32, u32> = HashMap::new();
    for p in &self.players {
      *counts.entry(p.team).or_default() += 1;
    }
    let mut clubs: Vec<SaveClub> = self
      .clubs
      .iter()
      .filter_map(|c| {
        let players = *counts.get(c.teams.first()?)?;
        Some(SaveClub { id: c.id, name: c.name.clone(), short_name: c.short_name.clone(), nation: c.nation, players })
      })
      .collect();
    clubs.sort_by(|a, b| a.short_name.to_lowercase().cmp(&b.short_name.to_lowercase()));
    SaveSummary {
      manager: self.manager.clone(),
      managed_club_id: self.managed_club_id,
      game_date: self.game_date,
      clubs,
      total_players: self.players.len() as u32,
    }
  }

  /// Équipe première du club, plus les joueurs qu'il a prêtés.
  pub fn club_players(&self, club_id: u32) -> Result<Vec<SavePlayer>, String> {
    let club = self.clubs.iter().find(|c| c.id == club_id).ok_or("club introuvable")?;
    let first = *club.teams.first().ok_or("ce club n'a pas d'équipe")?;
    let owner = self.team_owner();
    let host_name = |team: u32| owner.get(&team).map(|&i| self.clubs[i].short_name.clone()).unwrap_or_default();
    let mut out = Vec::new();
    for p in &self.players {
      // contrat le plus précis (le dernier) : un joueur de l'équipe B a aussi un contrat avec le club
      let last_contract = p.contracts.last().map(|c| c.0);
      let in_squad = p.team == first;
      let loaned_out =
        !in_squad && p.team != NONE && last_contract == Some(first) && !club.teams.contains(&p.team);
      if !in_squad && !loaned_out {
        continue;
      }
      let contract_end = p
        .contracts
        .iter()
        .find(|c| c.0 == first)
        .or(p.contracts.first())
        .and_then(|c| c.1);
      out.push(SavePlayer {
        name: p.name.clone(),
        first_name: p.first_name.clone(),
        last_name: p.last_name.clone(),
        birth: p.birth,
        nation: p.nation,
        positions: p.positions.clone(),
        values: p.values.clone(),
        contract_end,
        on_loan: loaned_out,
        host_club: if loaned_out { host_name(p.team) } else { String::new() },
      });
    }
    Ok(out)
  }
}

fn cached(path: &str) -> Option<Arc<ParsedSave>> {
  let cache = CACHE.lock().ok()?;
  cache.as_ref().filter(|(p, _)| p == path).map(|(_, s)| s.clone())
}

/// Lit une sauvegarde (ou reprend la dernière lue) et la garde en mémoire.
pub fn load(path: &str) -> Result<Arc<ParsedSave>, String> {
  if let Some(s) = cached(path) {
    return Ok(s);
  }
  let file = std::fs::read(path).map_err(|e| e.to_string())?;
  let parsed = Arc::new(parse(&file)?);
  if let Ok(mut cache) = CACHE.lock() {
    *cache = Some((path.to_string(), parsed.clone()));
  }
  Ok(parsed)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn date_ignores_flag_bits() {
    let d = [0xd4, 0x12, 0xea, 0x07];
    assert_eq!(date_at(&d, 0), GameDate { day: 212, year: 2026 });
  }

  #[test]
  fn reads_name_tables() {
    let mut d = vec![9u8; 5];
    for t in 0..3 {
      for id in 0..1200u32 {
        let s = format!("n{t}-{id}");
        d.extend_from_slice(&id.to_le_bytes());
        d.extend_from_slice(&(s.len() as u32).to_le_bytes());
        d.extend_from_slice(s.as_bytes());
      }
      d.extend_from_slice(&[7, 7, 7]);
    }
    let tables = name_tables(&d);
    assert_eq!(tables.len(), 3);
    assert_eq!(tables[1][42], "n1-42");
    assert_eq!(tables[2].len(), 1200);
  }

  /// Sur une vraie sauvegarde : `FM_SAVE=chemin.fm cargo test --release -- --ignored --nocapture`
  #[test]
  #[ignore]
  fn reads_real_save() {
    let path = std::env::var("FM_SAVE").expect("FM_SAVE");
    let t = std::time::Instant::now();
    let save = load(&path).unwrap();
    let s = save.summary();
    println!("{:?} manager {} club {:?} date {:?}", t.elapsed(), s.manager, s.managed_club_id, s.game_date);
    println!("joueurs {} clubs {}", s.total_players, s.clubs.len());
    let players = save.club_players(s.managed_club_id.unwrap()).unwrap();
    if let Ok(out) = std::env::var("FM_SAVE_OUT") {
      std::fs::write(out, serde_json::to_string(&players).unwrap()).unwrap();
    }
    for p in &players {
      println!("{} né {:?} nation {} fin {:?} prêt {} {}", p.name, p.birth, p.nation, p.contract_end, p.on_loan, p.host_club);
    }
  }

  #[test]
  fn detects_player_block() {
    let mut d = vec![0u8; 8];
    d.extend_from_slice(&[1; 15]);
    d.extend_from_slice(&[50; 54]);
    d.extend_from_slice(&[0, 0, 0, 0, 0, 83, 0, 0xcb, 0x07, 1, 0, 0x6c, 0x07]);
    d.extend_from_slice(&[0; 40]);
    assert!(is_block(&d, 8));
    assert!(!is_block(&d, 9));
  }
}
